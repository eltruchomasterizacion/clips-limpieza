// Dónde se guardan los clips exportados.
//
// EL FALLO DE LA V6 EN VERCEL (15:46 y 15:47 del 18-11-2026, logs de
// Runtime): POST /api/live-auto devolvía 500 con
// "ENOENT: no such file or directory, mkdir '/var/task/exportados'".
// En Vercel process.cwd() es /var/task y el directorio del código es
// DE SOLO LECTURA: en una función serverless solo se puede escribir en
// /tmp. En el PC local (contenedor de Carlos) el disco sí es escribible
// y la carpeta "exportados" junto al proyecto sigue siendo la correcta.
//
// Regla única para TODA la app: nunca más `path.join(process.cwd(),
// "exportados")` directo. Siempre usar dirExportados() /
// asegurarDirExportados() de aquí.
//
// Límite honesto: en Vercel /tmp vive solo mientras la instancia
// serverless exista; un clip guardado ahí se descarga o se lleva al
// Editor 9:16 en esa misma sesión. En local la carpeta "exportados"
// es permanente, como siempre.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function esEntornoVercel(): boolean {
  return Boolean(process.env.VERCEL);
}

/** Carpeta base de clips exportados: /tmp/exportados en Vercel, ./exportados en local. */
export function dirExportados(...subcarpetas: string[]): string {
  const base = esEntornoVercel()
    ? path.join(os.tmpdir(), "exportados")
    : path.join(process.cwd(), "exportados");
  return path.join(base, ...subcarpetas);
}

/** Crea la carpeta (y subcarpetas) si no existe y devuelve su ruta. */
export async function asegurarDirExportados(...subcarpetas: string[]): Promise<string> {
  const dir = dirExportados(...subcarpetas);
  await fs.promises.mkdir(dir, { recursive: true });
  return dir;
}

/** Carpeta de caché (Whisper, etc.): /tmp en Vercel, junto al proyecto en local. */
export function dirCache(nombre: string): string {
  return esEntornoVercel()
    ? path.join(os.tmpdir(), nombre)
    : path.join(process.cwd(), nombre);
}
