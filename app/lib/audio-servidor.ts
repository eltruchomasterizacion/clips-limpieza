import { execFile } from "node:child_process";
import { obtenerBinarioYtDlpLocal } from "./ytdlp";
import { esEntornoVercel, esUrlYouTube, obtenerUrlAudio } from "./youtube-js";
export { obtenerBinarioYtDlpLocal };
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";

const execFileAsync = promisify(execFile);

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

/** Lee un WAV PCM 16-bit mono por bloques y devuelve la energía (RMS) de cada segundo. */
export async function energiaWavPorSegundo(wavPath: string, sampleRate: number): Promise<number[]> {
  const fh = await fs.promises.open(wavPath, "r");
  try {
    const head = Buffer.alloc(4096);
    const { bytesRead } = await fh.read(head, 0, 4096, 0);

    let off = 12;
    let dataOff = -1;
    let dataLen = 0;
    while (off + 8 <= bytesRead) {
      const id = head.toString("ascii", off, off + 4);
      const sz = head.readUInt32LE(off + 4);
      if (id === "data") {
        dataOff = off + 8;
        dataLen = sz;
        break;
      }
      off += 8 + sz;
    }
    if (dataOff < 0) return [];

    const stat = await fh.stat();
    dataLen = Math.min(dataLen, stat.size - dataOff);

    const bytesSeg = sampleRate * 2;
    const totalSeg = Math.floor(dataLen / bytesSeg);
    const bloqueSeg = 60;
    const buf = Buffer.alloc(bytesSeg * bloqueSeg);
    const salida: number[] = [];

    let seg = 0;
    while (seg < totalSeg) {
      const n = Math.min(bloqueSeg, totalSeg - seg);
      const { bytesRead: br } = await fh.read(buf, 0, n * bytesSeg, dataOff + seg * bytesSeg);
      const leidos = Math.floor(br / bytesSeg);
      if (leidos === 0) break;
      for (let k = 0; k < leidos; k++) {
        let suma = 0;
        const base = k * bytesSeg;
        for (let i = 0; i < sampleRate; i++) {
          const v = buf.readInt16LE(base + i * 2) / 32768;
          suma += v * v;
        }
        salida.push(Math.sqrt(suma / sampleRate));
      }
      seg += leidos;
    }
    return salida;
  } finally {
    await fh.close();
  }
}

/** Convierte cualquier audio/video (archivo o URL directa) a WAV 8 kHz mono. */
export async function aWav8k(ffmpeg: string, entrada: string, salida: string, timeoutMs = 600000) {
  await execFileAsync(
    ffmpeg,
    ["-y", "-i", entrada, "-vn", "-ac", "1", "-ar", "8000", "-acodec", "pcm_s16le", salida],
    { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 * 20 }
  );
}

/** Descarga solo el audio del enlace y devuelve la energía por segundo.
 * Orden (sin Python en Vercel):
 *   1. urlDirecta que ya venga (TikTok/CDN o de /api/extract).
 *   2. Audio directo de YouTube con ytdl-core (JavaScript puro).
 *   3. yt-dlp SOLO en local (nunca en Vercel).
 */
export async function energiaDeUrl(
  url: string,
  urlDirecta: string | null,
  tmpDir: string
): Promise<number[]> {
  const ffmpeg = obtenerBinarioFfmpeg();
  const wav = path.join(tmpDir, "audio8k.wav");

  // 1. URL directa que ya venga.
  if (urlDirecta && urlDirecta.startsWith("http")) {
    try {
      await aWav8k(ffmpeg, urlDirecta, wav);
      return energiaWavPorSegundo(wav, 8000);
    } catch {
      // Seguir con los respaldos.
    }
  }

  // 2. YouTube con JavaScript puro.
  if (esUrlYouTube(url)) {
    try {
      const urlAudioJs = await obtenerUrlAudio(url);
      if (urlAudioJs) {
        await aWav8k(ffmpeg, urlAudioJs, wav);
        return energiaWavPorSegundo(wav, 8000);
      }
    } catch {
      // Seguir con el respaldo local.
    }
  }

  // 3. yt-dlp SOLO en local (nunca en Vercel).
  if (esEntornoVercel()) {
    throw new Error(
      "No se pudo obtener el audio de este enlace en la nube. En Vercel la descarga es sin Python; prueba con otro enlace o usa el contenedor local."
    );
  }
  const ytDlp = await obtenerBinarioYtDlpLocal();

  await execFileAsync(
    ytDlp,
    [
      "--no-playlist",
      "--no-warnings",
      "--no-progress",
      "--no-check-certificates",
      "--extractor-args",
      "youtube:player_client=android,web",
      "-f",
      "ba/b",
      "-o",
      path.join(tmpDir, "fuente.%(ext)s"),
      url,
    ],
    { timeout: 600000, windowsHide: true, maxBuffer: 1024 * 1024 * 20 }
  );
  const archivos = await fs.promises.readdir(tmpDir);
  const fuente = archivos.find((f) => f.startsWith("fuente."));
  if (!fuente) throw new Error("sin audio descargado");
  await aWav8k(ffmpeg, path.join(tmpDir, fuente), wav);

  return energiaWavPorSegundo(wav, 8000);
}