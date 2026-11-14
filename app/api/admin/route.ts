import { NextResponse, type NextRequest } from "next/server";
import {
  PLANES_DE_PAGO,
  REGLAS,
  claveAdmin,
  compararSeguro,
  generarCodigo,
  hashCorto,
  ipDe,
  redis,
  redisConfigurado,
  redisLote,
  type Licencia,
  type PlanId,
} from "../../../lib/servidor";

async function esAdmin(req: NextRequest): Promise<boolean> {
  const clave = claveAdmin();
  if (!clave) return false;

  const bloqueo = `intentos:admin:${hashCorto(ipDe(req))}`;
  if (Number((await redis("GET", bloqueo)) ?? 0) >= 15) return false;

  const recibido = req.headers.get("x-admin-key") ?? "";
  if (compararSeguro(recibido, clave)) return true;

  const n = Number(await redis("INCR", bloqueo));
  if (n === 1) await redis("EXPIRE", bloqueo, 3600);
  return false;
}

export async function POST(req: NextRequest) {
  if (!redisConfigurado()) {
    return NextResponse.json({ error: "Falta configurar la base de datos (Upstash)." }, { status: 503 });
  }
  if (!claveAdmin()) {
    return NextResponse.json({ error: "Falta la variable ADMIN_KEY en el servidor." }, { status: 503 });
  }
  if (!(await esAdmin(req))) {
    return NextResponse.json({ error: "Clave incorrecta." }, { status: 401 });
  }

  let cuerpo: any = {};
  try {
    cuerpo = await req.json();
  } catch {
    /* vacío */
  }

  if (cuerpo.accion === "crear") {
    const plan = String(cuerpo.plan) as PlanId;
    const dias = Math.min(400, Math.max(1, Number(cuerpo.dias) || 30));
    const cantidad = Math.min(20, Math.max(1, Number(cuerpo.cantidad) || 1));
    const nota = String(cuerpo.nota ?? "").slice(0, 80);
    if (!PLANES_DE_PAGO.includes(plan)) {
      return NextResponse.json({ error: "Plan no válido." }, { status: 400 });
    }

    const codigos: string[] = [];
    for (let i = 0; i < cantidad; i++) {
      const codigo = generarCodigo();
      const lic: Licencia = { plan, dias, creada: Date.now(), nota, token: "", activadaEn: 0, expira: 0 };
      await redis("SET", `lic:${codigo}`, JSON.stringify(lic));
      await redis("SADD", "lics", codigo);
      codigos.push(codigo);
    }
    return NextResponse.json({ ok: true, codigos, plan: REGLAS[plan].nombre, dias });
  }

  if (cuerpo.accion === "listar") {
    const codigos: string[] = (await redis("SMEMBERS", "lics")) ?? [];
    const filas = await redisLote(codigos.map((c) => ["GET", `lic:${c}`]));
    const ahora = Date.now();
    const licencias = codigos
      .map((codigo, i) => {
        if (!filas[i]) return null;
        const l = JSON.parse(filas[i]) as Licencia;
        const estado = !l.token ? "sin usar" : l.expira < ahora ? "vencida" : "activa";
        return {
          codigo,
          plan: REGLAS[l.plan].nombre,
          dias: l.dias,
          estado,
          creada: l.creada,
          activadaEn: l.activadaEn,
          expira: l.expira,
          nota: l.nota,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.creada - a.creada);

    const actRaw: string[] = (await redis("LRANGE", "act", 0, 49)) ?? [];
    const actividad = actRaw.map((x) => {
      try {
        return JSON.parse(x);
      } catch {
        return null;
      }
    });
    return NextResponse.json({ ok: true, licencias, actividad: actividad.filter(Boolean) });
  }

  if (cuerpo.accion === "liberar" || cuerpo.accion === "revocar") {
    const codigo = String(cuerpo.codigo ?? "").toUpperCase();
    if (!/^CLIP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(codigo)) {
      return NextResponse.json({ error: "Código no válido." }, { status: 400 });
    }
    if (cuerpo.accion === "revocar") {
      await redis("DEL", `lic:${codigo}`);
      await redis("SREM", "lics", codigo);
      return NextResponse.json({ ok: true });
    }
    // liberar: permite activarlo en otro dispositivo, sin cambiar la fecha de vencimiento
    const raw = await redis("GET", `lic:${codigo}`);
    if (!raw) return NextResponse.json({ error: "No existe ese código." }, { status: 404 });
    const lic = JSON.parse(raw) as Licencia;
    lic.token = "";
    await redis("SET", `lic:${codigo}`, JSON.stringify(lic));
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Acción no válida." }, { status: 400 });
}