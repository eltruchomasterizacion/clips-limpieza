import { connection, NextResponse, type NextRequest } from "next/server";
import {
  REGLAS,
  contexto,
  fechaHoy,
  hashCorto,
  ipDe,
  redis,
  redisConfigurado,
  responder,
  type Contexto,
} from "../../../lib/servidor";

const unidades = (segundos: number) => Math.max(1, Math.ceil(segundos / 120));

function claves(ctx: Contexto, ip: string) {
  const reglas = REGLAS[ctx.planId];
  if (ctx.maestro || reglas.ilimitado) return { tipo: "ilimitado" as const, principal: "", ip: "" };
  if (ctx.planId === "gratis") {
    return { tipo: "total" as const, principal: `uso:gratis:${ctx.dev}`, ip: `uso:gratis:ip:${hashCorto(ip)}` };
  }
  return { tipo: "dia" as const, principal: `uso:dia:${ctx.codigo}:${fechaHoy()}`, ip: "" };
}

export async function GET(req: NextRequest) {
  await connection();
  if (!redisConfigurado()) return NextResponse.json({ configurado: false });

  const ctx = await contexto(req);
  const k = claves(ctx, ipDe(req));
  const usados = k.principal ? Number((await redis("GET", k.principal)) ?? 0) : 0;
  return responder(ctx, { configurado: true, tipo: k.tipo, usados, planId: ctx.planId });
}

export async function POST(req: NextRequest) {
  if (!redisConfigurado()) return NextResponse.json({ ok: true, configurado: false });

  const ctx = await contexto(req);
  let cuerpo: any = {};
  try {
    cuerpo = await req.json();
  } catch {
    /* vacío */
  }

  const accion = cuerpo.accion;
  const segundos = Number(cuerpo.segundos);
  const calidad = String(cuerpo.calidad ?? "720p");
  if ((accion !== "verificar" && accion !== "confirmar") || !Number.isFinite(segundos) || segundos <= 0) {
    return responder(ctx, { ok: false, error: "Solicitud no válida." }, 400);
  }

  const reglas = REGLAS[ctx.planId];
  const k = claves(ctx, ipDe(req));

  if (!ctx.maestro) {
    if (reglas.maxSeg > 0 && segundos > reglas.maxSeg) {
      return responder(
        ctx,
        { ok: false, error: `Tu plan ${reglas.nombre} permite clips de hasta ${reglas.maxSeg} segundos.` },
        403
      );
    }
    if (calidad === "1080p" && reglas.maxCalidad === "720p") {
      return responder(ctx, { ok: false, error: "La calidad 1080p es de los planes de pago." }, 403);
    }
  }

  const actuales = k.principal ? Number((await redis("GET", k.principal)) ?? 0) : 0;
  const u = unidades(segundos);

  if (accion === "verificar") {
    if (k.tipo === "total") {
      const porIp = Number((await redis("GET", k.ip)) ?? 0);
      if (actuales >= reglas.totalClips || porIp >= reglas.totalClips * 3) {
        return responder(
          ctx,
          { ok: false, error: `Ya usaste tus ${reglas.totalClips} clips gratis. Activa un plan para seguir creando.` },
          403
        );
      }
    }
    if (k.tipo === "dia" && actuales + u > reglas.clipsDia) {
      return responder(
        ctx,
        {
          ok: false,
          error: `Este clip cuenta como ${u} y hoy te quedan ${Math.max(0, reglas.clipsDia - actuales)} de ${reglas.clipsDia}.`,
        },
        403
      );
    }
    return responder(ctx, { ok: true, tipo: k.tipo, usados: actuales });
  }

  // confirmar: el clip se cuenta cuando se guarda
  let usados = actuales;
  if (k.tipo === "total") {
    usados = Number(await redis("INCR", k.principal));
    await redis("INCR", k.ip);
  } else if (k.tipo === "dia") {
    usados = Number(await redis("INCRBY", k.principal, u));
    await redis("EXPIRE", k.principal, 172800);
  }
  return responder(ctx, { ok: true, tipo: k.tipo, usados });
}