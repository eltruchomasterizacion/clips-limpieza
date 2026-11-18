// Envoltorio fino SOLO LOCAL para yt-dlp.
//
// REGLA: en Vercel NUNCA se descarga ni se ejecuta yt-dlp — Vercel no tiene
// python3 y yt-dlp es un zipapp de Python, así que eso falla siempre. En
// Vercel toda la descarga de YouTube pasa por app/lib/youtube-js.ts
// (ytdl-core, JavaScript puro). yt-dlp solo se usa en local (PC de Carlos),
// donde yt-dlp.exe ya existe junto al proyecto.
//
// El antiguo código de descarga automática desde GitHub + verificación
// "--version" se eliminó: era el origen del error 503 en Vercel.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { esEntornoVercel, obtenerBinarioYtDlpLocal } from "./youtube-js";

const execFileAsync = promisify(execFile);

export { esEntornoVercel, obtenerBinarioYtDlpLocal };

/**
 * Devuelve la ruta al binario yt-dlp local. En Vercel lanza un error claro
 * en español (nunca intenta descargar nada).
 */
export async function obtenerBinarioYtDlp(): Promise<string> {
  return obtenerBinarioYtDlpLocal();
}

/**
 * Ejecuta yt-dlp con argumentos. SOLO local: en Vercel lanza error sin
 * intentar nada. Traduce el error ENOENT a un mensaje claro en español.
 */
export async function ejecutarYtDlp(
  args: string[],
  timeoutMs = 60000
): Promise<{ stdout: string; stderr: string }> {
  if (esEntornoVercel()) {
    throw new Error(
      "yt-dlp no está disponible en Vercel: en Vercel usa la descarga sin Python; " +
        "en local coloca yt-dlp.exe junto a package.json."
    );
  }
  const bin = await obtenerBinarioYtDlpLocal();
  try {
    return await execFileAsync(bin, args, { timeout: timeoutMs, windowsHide: true });
  } catch (err: any) {
    const msg = String(err?.message || "");
    if (msg.includes("ENOENT") || msg.includes("spawn")) {
      throw new Error(
        "yt-dlp no está disponible en este equipo. Coloca yt-dlp.exe junto a package.json o instala yt-dlp."
      );
    }
    throw err;
  }
}

export function obtenerBinarioFfmpeg(): string {
  const ffStatic = path.join(
    process.cwd(),
    "node_modules",
    "ffmpeg-static",
    process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
  );
  if (fs.existsSync(ffStatic)) return ffStatic;
  return "ffmpeg";
}
