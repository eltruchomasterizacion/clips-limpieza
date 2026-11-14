import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

export type PlanId = "gratis" | "editor" | "pro" | "estudio" | "agencia";

export interface ReglasPlan {
  nombre: string;
  maxSeg: number; // 0 = sin límite
  maxCalidad: "720p" | "1080p";
  totalClips: number; // solo plan gratis
  clipsDia: number; // planes con cupo diario
  ilimitado: boolean;
}

export const REGLAS: Record<PlanId, ReglasPlan> = {
  gratis: { nombre: "Gratis", maxSeg: 65, maxCalidad: "720p", totalClips: 5, clipsDia: 0, ilimitado: false },
  editor: { nombre: "Editor", maxSeg: 0, maxCalidad: "1080p", totalClips: 0, clipsDia: 0, ilimitado: true },
  pro: { nombre: "Pro", maxSeg: 180, maxCalidad: "1080p", totalClips: 0, clipsDia: 60, ilimitado: false },
  estudio: { nombre: "Estudio", maxSeg: 300, maxCalidad: "1080p", totalClips: 0, clipsDia: 150, ilimitado: false },
  agencia: { nombre: "Agencia", maxSeg: 600, maxCalidad: "1080p", totalClips: 0, clipsDia: 400, ilimitado: false },
};

export const PLANES_DE_PAGO: PlanId[] = ["editor", "pro", "estudio", "agencia"];

export interface Licencia {
  plan: PlanId;
  dias: number;
  creada: number;
  nota: string;
  token: string; // vacío = sin activar
  activadaEn: number;
  expira: number; // 0 = aún no activada
}

export interface Contexto {
  dev: string;
  devNuevo: boolean;
  planId: PlanId;
  maestro: boolean;
  codigo: string;
  lic: Licencia | null;
}

export const COOKIE_DEV = "cl_dev";
export const COOKIE_LIC = "cl_lic";
export const REGEX_CODIGO = /^CLIP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const DIA_MS = 86_400_000;

// ---------- Redis (Upstash, por REST, sin librerías) ----------
const urlRedis = () =>
  (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? "").replace(/\/$/, "");
const tokenRedis = () => process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN ?? "";

export const redisConfigurado = () => !!urlRedis() && !!tokenRedis();
export const claveAdmin = () => process.env.ADMIN_KEY ?? "";

export async function redis(...cmd: (string | number)[]): Promise<any> {
  const r = await fetch(urlRedis(), {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenRedis()}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
    cache: "no-store",
  });
  const d = await r.json();
  if (d.error) throw new Error(String(d.error));
  return d.result;
}

export async function redisLote(cmds: (string | number)[][]): Promise<any[]> {
  if (cmds.length === 0) return [];
  const r = await fetch(`${urlRedis()}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenRedis()}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmds),
    cache: "no-store",
  });
  const d = await r.json();
  return Array.isArray(d) ? d.map((x: any) => x?.result ?? null) : [];
}

// ---------- Utilidades ----------
export const fechaHoy = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Santo_Domingo" });

export const hashCorto = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

export const compararSeguro = (a: string, b: string) => {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
};

export const firmaMaestra = () =>
  createHmac("sha256", claveAdmin()).update("maestro-clips-limpieza").digest("hex");

export const ipDe = (req: NextRequest) =>
  (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "sin-ip";

export function generarCodigo(): string {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 símbolos, sin O/0/I/1
  const bytes = randomBytes(12);
  const letras = Array.from(bytes, (b) => alfabeto[b % 32]);
  return `CLIP-${letras.slice(0, 4).join("")}-${letras.slice(4, 8).join("")}-${letras.slice(8, 12).join("")}`;
}

export const nuevoToken = () => randomBytes(16).toString("hex");

export const opcionesCookie = (maxAgeSeg: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: maxAgeSeg,
});

export async function limiteIntentos(clave: string, max: number, ventanaSeg: number): Promise<boolean> {
  const n = Number(await redis("INCR", clave));
  if (n === 1) await redis("EXPIRE", clave, ventanaSeg);
  return n <= max;
}

// ---------- Quién es el visitante ----------
export async function contexto(req: NextRequest): Promise<Contexto> {
  let dev = req.cookies.get(COOKIE_DEV)?.value ?? "";
  let devNuevo = false;
  if (!/^[a-f0-9]{32}$/.test(dev)) {
    dev = randomBytes(16).toString("hex");
    devNuevo = true;
  }

  const ctx: Contexto = { dev, devNuevo, planId: "gratis", maestro: false, codigo: "", lic: null };
  if (!redisConfigurado()) return ctx;

  const sesion = req.cookies.get(COOKIE_LIC)?.value ?? "";

  if (sesion.startsWith("M.")) {
    if (claveAdmin() && compararSeguro(sesion.slice(2), firmaMaestra())) {
      ctx.maestro = true;
      ctx.planId = "agencia";
    }
    return ctx;
  }

  const punto = sesion.lastIndexOf(".");
  if (punto > 0) {
    const codigo = sesion.slice(0, punto);
    const token = sesion.slice(punto + 1);
    if (REGEX_CODIGO.test(codigo) && token) {
      const raw = await redis("GET", `lic:${codigo}`);
      if (raw) {
        const lic = JSON.parse(raw) as Licencia;
        if (lic.token && compararSeguro(lic.token, token) && lic.expira > Date.now()) {
          ctx.lic = lic;
          ctx.codigo = codigo;
          ctx.planId = lic.plan;
        }
      }
    }
  }
  return ctx;
}

export function responder(ctx: Contexto, cuerpo: unknown, status = 200) {
  const res = NextResponse.json(cuerpo, { status });
  if (ctx.devNuevo) res.cookies.set(COOKIE_DEV, ctx.dev, opcionesCookie(60 * 60 * 24 * 400));
  return res;
}

export const duracionLicenciaMs = (dias: number) => dias * DIA_MS;