import { Redis } from "@upstash/redis";

export const redis = Redis.fromEnv();

export interface RegistroCodigo {
  codigo: string;
  nota: string;
  maxDispositivos: number;
  dispositivos: string[];
  activo: boolean;
  creado: number;
  expira?: number | null;
}

export interface Sesion {
  codigo: string;
  dispositivo: string;
  admin: boolean;
}

export const COOKIE = "acceso_sesion";
export const DIAS_SESION = 30;
export const DIA_MS = 86400000;
export const MAX_DIAS = 365;

export function estaVencido(reg: { expira?: number | null }): boolean {
  return typeof reg.expira === "number" && Date.now() > reg.expira;
}

export function generarCodigo(): string {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let s = "";
  for (let i = 0; i < 12; i++) {
    s += abc[bytes[i] % abc.length];
    if (i === 3 || i === 7) s += "-";
  }
  return s;
}

export function generarToken(): string {
  return crypto.randomUUID() + crypto.randomUUID();
}