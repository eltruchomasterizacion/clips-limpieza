import { connection, NextResponse, type NextRequest } from "next/server";
import {
  COOKIE_LIC,
  REGEX_CODIGO,
  REGLAS,
  claveAdmin,
  compararSeguro,
  contexto,
  duracionLicenciaMs,
  firmaMaestra,
  hashCorto,
  ipDe,
  limiteIntentos,
  nuevoToken,
  opcionesCookie,
  redis,
  redisConfigurado,
  responder,
  type Licencia,
} from "../../../lib/servidor";

export async function GET(req: NextRequest) {
  await connection();
  if (!redisConfigurado()) return NextResponse.json({ configurado: false, activa: false });

  const ctx = await contexto(req);
  const activa = ctx.maestro || !!ctx.lic;
  return responder(ctx, {
    configurado: true,
    activa,
    plan: ctx.maestro ? "Maestro" : REGLAS[ctx.planId].nombre,
    planId: ctx.planId,
    maestro: ctx.maestro,
    expira: ctx.lic?.expira ?? null,
  });
}

export async function POST(req: NextRequest) {
  if (!redisConfigurado()) {
    return NextResponse.json(
      { error: "El sistema de códigos todavía no está configurado." },
      { status: 503 }
    );
  }

  const ctx = await contexto(req);
  let cuerpo: any = {};
  try {
    cuerpo = await req.json();
  } catch {
    /* cuerpo vacío */
  }

  // ----- Registro de actividad para el panel del dueño -----
  if (cuerpo.accion === "actividad") {
    const registro = JSON.stringify({
      t: Date.now(),
      plan: ctx.maestro ? "maestro" : ctx.planId,
      codigo: ctx.codigo ? ctx.codigo.slice(0, 9) + "…" : "",
      dispositivo: ctx.dev.slice(0, 6),
      detalle: String(cuerpo.detalle ?? "").slice(0, 80),
    });
    await redis("LPUSH", "act", registro);
    await redis("LTRIM", "act", 0, 199);
    return responder(ctx, { ok: true });
  }

  // ----- Canjear código -----
  if (cuerpo.accion === "canjear") {
    const okDev = await limiteIntentos(`intentos:dev:${ctx.dev}`, 10, 3600);
    const okIp = await limiteIntentos(`intentos:ip:${hashCorto(ipDe(req))}`, 30, 3600);
    if (!okDev || !okIp) {
      return responder(ctx, { error: "Demasiados intentos. Espera una hora e inténtalo de nuevo." }, 429);
    }

    const crudo = String(cuerpo.codigo ?? "").trim();
    if (!crudo) return responder(ctx, { error: "Escribe tu código." }, 400);

    // Código maestro del dueño
    if (claveAdmin() && compararSeguro(crudo, claveAdmin())) {
      const res = responder(ctx, {
        activa: true,
        maestro: true,
        plan: "Maestro",
        planId: "agencia",
        expira: null,
      });
      res.cookies.set(COOKIE_LIC, `M.${firmaMaestra()}`, opcionesCookie(60 * 60 * 24 * 30));
      return res;
    }

    const codigo = crudo.toUpperCase();
    if (!REGEX_CODIGO.test(codigo)) {
      return responder(ctx, { error: "Código incorrecto. Revisa que esté completo." }, 404);
    }

    const raw = await redis("GET", `lic:${codigo}`);
    if (!raw) return responder(ctx, { error: "Código incorrecto o inexistente." }, 404);

    const lic = JSON.parse(raw) as Licencia;
    const ahora = Date.now();

    if (lic.expira && lic.expira < ahora) {
      return responder(ctx, { error: "Este código ya venció. Escríbeme por WhatsApp para renovar." }, 403);
    }

    if (lic.token) {
      // Ya fue activado: solo se acepta desde el mismo navegador
      const sesion = req.cookies.get(COOKIE_LIC)?.value ?? "";
      if (sesion !== `${codigo}.${lic.token}`) {
        return responder(
          ctx,
          { error: "Este código ya fue usado en otro dispositivo. Si cambiaste de equipo, escríbeme por WhatsApp." },
          403
        );
      }
    } else {
      lic.token = nuevoToken();
      lic.activadaEn = ahora;
      if (!lic.expira) lic.expira = ahora + duracionLicenciaMs(lic.dias);
      await redis("SET", `lic:${codigo}`, JSON.stringify(lic));
    }

    const segundosRestantes = Math.max(60, Math.floor((lic.expira - ahora) / 1000));
    const res = responder(ctx, {
      activa: true,
      maestro: false,
      plan: REGLAS[lic.plan].nombre,
      planId: lic.plan,
      expira: lic.expira,
    });
    res.cookies.set(COOKIE_LIC, `${codigo}.${lic.token}`, opcionesCookie(segundosRestantes));
    return res;
  }

  return responder(ctx, { error: "Acción no válida." }, 400);
}