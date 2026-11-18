// Analizador REAL de mejores momentos (servidor, sin Python, sin yt-dlp).
//
// El código viejo ("generarMomentosSoloVideoGrabado") cortaba el video en
// trozos parejos 0-5s, 5-10s... con puntajes falsos 98, 97, 96. Eso NO es
// detectar momentos: es cortar por cortar, y por eso Carlos se quejaba de
// que los clips salían rapidito y sin retención. Ese código está eliminado.
//
// Esto mide de verdad, con ffmpeg-static (ya viene en el proyecto):
//   1. Energía de audio por segundo (astats RMS_level): picos = risa,
//      gritos, música, voz fuerte. Silencio (-inf / <= -45 dB) = aburrido.
//   2. Palabras por segundo, de los subtítulos que ya trae /api/extract.
//   3. Cambios de escena por segundo (filtro scene de ffmpeg, video a
//      160x90 y 2 fps para que sea barato): mucho movimiento = actividad.
// La puntuación y el umbral viven en app/lib/puntuacion-momentos.ts y son
// los mismos que usa el navegador para archivos subidos.
//
// ffmpeg lee la URL directa (googlevideo.com / TikTok / CDN) sin descargar
// el video completo a disco: en Vercel no hay espacio ni tiempo para eso.
// CORRECCIÓN: ffmpeg-static se cae (segfault) leyendo URLs de Google Video
// directamente, así que el AUDIO se baja primero con fetch de Node (que sí
// sigue las redirecciones 302) a /tmp y se analiza el archivo local. El
// movimiento solo se mide cuando el video ya es un archivo local.
// El análisis se limita a 20 min para no pasar el límite de la función.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { obtenerBinarioFfmpeg } from "./ytdlp";
import {
  puntuarVentanas,
  type MomentoPuntuado,
  type ResultadoPuntuacion,
} from "./puntuacion-momentos";

const execFileAsync = promisify(execFile);

export type { MomentoPuntuado, ResultadoPuntuacion };

export interface SubCueAnalisis {
  inicio: number;
  fin: number;
  texto: string;
}

export interface EntradaAnalisis {
  /** URL directa del audio (mejor) o del video. */
  audioUrl?: string | null;
  /** URL directa del video (para medir movimiento). */
  videoUrl?: string | null;
  duracionTotal: number;
  durClip: number;
  cantidad: number | "ilimitado";
  subtitulos?: SubCueAnalisis[];
}

export interface AnalisisCompleto extends ResultadoPuntuacion {
  /** Qué señales se pudieron medir de verdad en este video. */
  senales: { audio: boolean; subtitulos: boolean; movimiento: boolean };
  /** Aviso en español cuando alguna señal no se pudo medir. */
  aviso?: string;
}

const MAX_SEGUNDOS_ANALISIS = 1200; // 20 min, límite de tiempo en Vercel
const MAX_BYTES_AUDIO = 96 * 1024 * 1024; // 96 MB de audio como máximo

/** Baja el audio de una URL a /tmp (fetch sigue redirecciones, ffmpeg no).
 *  Devuelve la ruta local o null si no se pudo. El llamador borra el archivo. */
async function descargarAudioTemporal(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        // Sin Range, Google Video entrega el audio lentísimo (minutos) y el
        // análisis se corta por timeout. Con Range baja en segundos (206).
        Range: "bytes=0-",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok || !res.body) return null;
    const ruta = path.join(
      os.tmpdir(),
      `analisis-audio-${Date.now()}-${Math.random().toString(36).slice(2)}.m4a`
    );
    const writer = fs.createWriteStream(ruta);
    let bytes = 0;
    let demasiadoGrande = false;
    for await (const trozo of res.body as any) {
      bytes += (trozo as Buffer).length;
      if (bytes > MAX_BYTES_AUDIO) {
        demasiadoGrande = true;
        break;
      }
      writer.write(trozo);
    }
    writer.end();
    await new Promise<void>((ok, mal) => {
      writer.on("finish", ok);
      writer.on("error", mal);
    });
    if (demasiadoGrande) {
      await fs.promises.unlink(ruta).catch(() => {});
      return null;
    }
    return ruta;
  } catch {
    return null;
  }
}

function esRutaLocal(v: string | null | undefined): v is string {
  return !!v && !v.startsWith("http://") && !v.startsWith("https://");
}

function ejecutarFfmpeg(
  ffmpeg: string,
  args: string[],
  timeoutMs: number
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(ffmpeg, args, { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
}

/** RMS en dB por cada segundo. -60 = silencio total. null si no se pudo medir. */
export async function energiaPorSegundo(
  ffmpeg: string,
  entrada: string,
  duracion: number
): Promise<number[] | null> {
  try {
    const { stderr } = await ejecutarFfmpeg(
      ffmpeg,
      [
        "-v",
        "info",
        "-i",
        entrada,
        "-vn",
        "-af",
        "astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level",
        "-f",
        "null",
        "-",
      ],
      45000
    );
    const porSegundo: number[] = new Array(Math.max(1, Math.ceil(duracion))).fill(-60);
    const sumas: number[] = new Array(porSegundo.length).fill(0);
    const conteos: number[] = new Array(porSegundo.length).fill(0);
    let ptsActual = 0;
    for (const linea of stderr.split("\n")) {
      const mPts = linea.match(/pts_time:([0-9.]+)/);
      if (mPts) ptsActual = Number(mPts[1]);
      const mRms = linea.match(/RMS_level=(-inf|-?[0-9.]+)/);
      if (mRms) {
        const v = mRms[1] === "-inf" ? -60 : Number(mRms[1]);
        const s = Math.min(porSegundo.length - 1, Math.max(0, Math.floor(ptsActual)));
        sumas[s] += v;
        conteos[s]++;
      }
    }
    let medido = false;
    for (let s = 0; s < porSegundo.length; s++) {
      if (conteos[s] > 0) {
        porSegundo[s] = sumas[s] / conteos[s];
        medido = true;
      }
    }
    return medido ? porSegundo : null;
  } catch {
    return null;
  }
}

/** Energía media (RMS en dB) de un archivo de audio/video entero.
 *  null si no se pudo medir. Lo usa el auto-corte en vivo para puntuar
 *  cada clip guardado con su audio real. */
export async function energiaMediaArchivo(
  ffmpeg: string,
  ruta: string,
  duracionSegundos: number
): Promise<number | null> {
  const energia = await energiaPorSegundo(ffmpeg, ruta, duracionSegundos);
  if (!energia || energia.length === 0) return null;
  const validos = energia.filter((v) => typeof v === "number" && isFinite(v));
  if (validos.length === 0) return null;
  return validos.reduce((a, b) => a + b, 0) / validos.length;
}

/** Cambios de escena por cada segundo. null si no se pudo medir. */
async function movimientoPorSegundo(
  ffmpeg: string,
  entrada: string,
  duracion: number
): Promise<number[] | null> {
  try {
    const { stderr } = await ejecutarFfmpeg(
      ffmpeg,
      [
        "-v",
        "info",
        "-i",
        entrada,
        "-vf",
        "scale=160:90,fps=2,select='gt(scene,0.35)',metadata=print:key=lavfi.scene_score",
        "-f",
        "null",
        "-",
      ],
      25000
    );
    const porSegundo: number[] = new Array(Math.max(1, Math.ceil(duracion))).fill(0);
    let medido = false;
    for (const linea of stderr.split("\n")) {
      const mPts = linea.match(/pts_time:([0-9.]+)/);
      if (mPts) {
        const s = Math.min(porSegundo.length - 1, Math.max(0, Math.floor(Number(mPts[1]))));
        porSegundo[s]++;
        medido = true;
      }
    }
    // El primer fotograma siempre "cambia": no cuenta como movimiento.
    if (porSegundo[0] > 0) porSegundo[0]--;
    return medido ? porSegundo : null;
  } catch {
    return null;
  }
}

function palabrasPorSegundo(
  subtitulos: SubCueAnalisis[] | undefined,
  duracion: number
): number[] {
  const porSegundo: number[] = new Array(Math.max(1, Math.ceil(duracion))).fill(0);
  if (!subtitulos) return porSegundo;
  for (const cue of subtitulos) {
    const palabras = cue.texto.split(/\s+/).filter(Boolean).length;
    if (palabras === 0) continue;
    const ini = Math.max(0, Math.floor(cue.inicio));
    const fin = Math.max(ini, Math.min(porSegundo.length - 1, Math.floor(cue.fin)));
    const repartir = palabras / Math.max(1, fin - ini + 1);
    for (let s = ini; s <= fin; s++) porSegundo[s] += repartir;
  }
  return porSegundo;
}

/**
 * Analiza un video por enlace y devuelve SOLO sus mejores momentos.
 * Si no hay audio medible ni subtítulos, devuelve momentos vacíos con aviso
 * (nunca trozos parejos inventados).
 */
export async function analizarMejoresMomentos(
  entrada: EntradaAnalisis
): Promise<AnalisisCompleto> {
  const ffmpeg = obtenerBinarioFfmpeg();
  const duracion = Math.min(
    MAX_SEGUNDOS_ANALISIS,
    Math.max(1, Math.floor(entrada.duracionTotal || 0))
  );
  const avisos: string[] = [];
  if (entrada.duracionTotal > MAX_SEGUNDOS_ANALISIS) {
    avisos.push(`Se analizaron solo los primeros ${MAX_SEGUNDOS_ANALISIS / 60} minutos del video.`);
  }

  const fuenteAudio = entrada.audioUrl || entrada.videoUrl || null;
  let rutaAudioTmp: string | null = null;
  let fuenteAudioLocal: string | null = null;
  if (esRutaLocal(fuenteAudio)) {
    fuenteAudioLocal = fuenteAudio;
  } else if (fuenteAudio) {
    rutaAudioTmp = await descargarAudioTemporal(fuenteAudio);
    fuenteAudioLocal = rutaAudioTmp;
  }
  const energia = fuenteAudioLocal
    ? await energiaPorSegundo(ffmpeg, fuenteAudioLocal, duracion)
    : null;
  const palabras = palabrasPorSegundo(entrada.subtitulos, duracion);
  const tienePalabras = palabras.some((p) => p > 0);

  // Movimiento solo cuando el video ya es un archivo local (archivos
  // subidos) y dura hasta 10 min: bajar el video entero para esto en Vercel
  // es demasiado pesado, y ffmpeg directo sobre la URL remota se cae.
  let movimiento: number[] | null = null;
  if (esRutaLocal(entrada.videoUrl) && duracion <= 600) {
    movimiento = await movimientoPorSegundo(ffmpeg, entrada.videoUrl, duracion);
  }

  if (rutaAudioTmp) await fs.promises.unlink(rutaAudioTmp).catch(() => {});

  if (!energia && !tienePalabras) {
    return {
      momentos: [],
      tramosIgnorados: Math.max(1, Math.floor(duracion / Math.max(3, entrada.durClip))),
      tramosAnalizados: Math.max(1, Math.floor(duracion / Math.max(3, entrada.durClip))),
      mejorPuntaje: 0,
      senales: { audio: false, subtitulos: false, movimiento: false },
      aviso:
        "No se pudo medir el audio de este video en el servidor (el enlace no deja leerlo). Prueba con otro enlace o sube el video como archivo.",
    };
  }
  if (!energia) avisos.push("No se pudo medir el audio; los momentos se eligieron solo por la conversación de los subtítulos.");
  if (movimiento === null && entrada.videoUrl) {
    avisos.push("El movimiento no se pudo medir en este video; los momentos se eligieron por audio y conversación.");
  }

  const energiaSegura = energia ?? new Array(Math.ceil(duracion)).fill(-60);
  const resultado = puntuarVentanas({
    energiaPorSegundo: energiaSegura,
    energiaDisponible: energia !== null,
    palabrasPorSegundo: tienePalabras ? palabras : [],
    movimientoPorSegundo: movimiento ?? [],
    duracionTotal: duracion,
    durClip: entrada.durClip,
    cantidad: entrada.cantidad,
  });

  return {
    ...resultado,
    senales: {
      audio: energia !== null,
      subtitulos: tienePalabras,
      movimiento: movimiento !== null,
    },
    aviso: avisos.length > 0 ? avisos.join(" ") : undefined,
  };
}
