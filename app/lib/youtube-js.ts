// Descarga de YouTube 100% en JavaScript, sin Python y sin binarios.
//
// Por qué existe este módulo: yt-dlp es un zipapp de Python y el runtime
// serverless de Vercel NO tiene python3, así que descargar y ejecutar yt-dlp
// en Vercel falla siempre ("env: 'python3': No such file or directory").
// Este módulo usa @distube/ytdl-core (fork mantenido de ytdl-core, JS puro)
// para obtener la información del video y las URLs directas de Google Video
// (googlevideo.com), que ffmpeg-static puede leer sin Python.
//
// Orden de resolución en cada función:
//   1. ytdl-core (getInfo) — título, duración, miniatura, formatos y subtítulos.
//   2. oEmbed de YouTube (+ miniatura i.ytimg.com) — solo título/miniatura
//      cuando getInfo falla; no da URL de descarga.
//   3. Cobalt NO se usa aquí: sus instancias públicas ahora exigen un token
//      JWT (error.api.auth.jwt.missing, verificado 2026-11-18), así que no es
//      un respaldo fiable sin credenciales.
//
// Formatos: YouTube ya casi no sirve mp4 progresivo (video+audio juntos).
// Lo normal es DASH: video solo + audio solo. Por eso obtenerInfoVideo
// devuelve streamUrl (mejor video solo mp4 ≤2160p, preferencia H.264/avc1
// para que ffmpeg-static lo decodifique seguro) y audioUrl (mejor audio
// solo mp4/m4a). El render descarga ambos y los une con ffmpeg -c copy.
// Si existe un formato combinado mp4, se usa ese y audioUrl queda en null.
//
// NADA de este archivo ejecuta yt-dlp. La única vía yt-dlp que queda en el
// proyecto es local (app/lib/ytdlp.ts) y está prohibida en Vercel.
import { Ytdl, CaptionFormat } from "@distube/ytdl-core";
import type { VideoFormat, VideoInfo } from "@distube/ytdl-core";

export interface InfoVideoYouTube {
  titulo: string;
  duracion: number;
  thumbnail: string;
  isLive: boolean;
  /** URL directa del video (mp4 progresivo, o mejor video solo ≤2160p). */
  streamUrl: string | null;
  /** URL directa del audio solo (mp4/m4a). null si streamUrl ya trae audio. */
  audioUrl: string | null;
  /** true cuando streamUrl es video SIN audio (hay que unir audioUrl). */
  esVideoSolo: boolean;
  id: string | null;
  /** true cuando ytdl-core fue bloqueado por YouTube (BOT_CHECK) y solo
   *  quedó el título/miniatura de oEmbed: NO se sabe si es en vivo, no
   *  hay duración ni URL de descarga. El llamador debe decirlo claro en
   *  vez de fingir un video grabado sin momentos. */
  bloqueado?: boolean;
  /** Por qué vía se resolvió el video (v6): ytdl, invidious, watch, oembed. */
  via?: "ytdl" | "invidious" | "watch" | "oembed";
}

export interface SubCueJS {
  inicio: number;
  fin: number;
  texto: string;
}

/** true cuando corremos en Vercel (serverless, sin python3 ni yt-dlp). */
export function esEntornoVercel(): boolean {
  return Boolean(process.env.VERCEL);
}

export function esUrlYouTube(url: string): boolean {
  const u = url.toLowerCase();
  return u.includes("youtube.com") || u.includes("youtu.be");
}

export function extraerIdYouTube(url: string): string | null {
  const reg =
    /(?:youtube\.com\/(?:watch\?v=|live\/|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = url.match(reg);
  return match ? match[1] : null;
}

let instanciaYtdl: Ytdl | null = null;
function clienteYtdl(): Ytdl {
  if (!instanciaYtdl) instanciaYtdl = new Ytdl();
  return instanciaYtdl;
}

function esMp4H264(f: VideoFormat): boolean {
  return f.container === "mp4" && (f.videoCodec || "").startsWith("avc1");
}

function elegirVideo(formats: readonly VideoFormat[]): VideoFormat | null {
  const soloVideo = formats.filter(
    (f) => f.hasVideo && !f.hasAudio && !f.isLive && f.url && (f.height || 0) <= 2160
  );
  const porAltura = (a: VideoFormat, b: VideoFormat) => (b.height || 0) - (a.height || 0);
  // 1. mp4 H.264 (lo decodifica cualquier ffmpeg-static, incluido AV1 ausente).
  const h264 = soloVideo.filter(esMp4H264).sort(porAltura);
  if (h264.length > 0) return h264[0];
  // 2. Cualquier mp4 de video solo (p. ej. AV1 2160p).
  const mp4 = soloVideo.filter((f) => f.container === "mp4").sort(porAltura);
  if (mp4.length > 0) return mp4[0];
  // 3. Cualquier video solo.
  const cualquiera = soloVideo.sort(porAltura);
  return cualquiera.length > 0 ? cualquiera[0] : null;
}

function elegirAudio(formats: readonly VideoFormat[]): VideoFormat | null {
  const soloAudio = formats.filter((f) => f.hasAudio && !f.hasVideo && f.url);
  const porBitrate = (a: VideoFormat, b: VideoFormat) =>
    (b.audioBitrate || 0) - (a.audioBitrate || 0);
  const mp4 = soloAudio.filter((f) => f.container === "mp4").sort(porBitrate);
  if (mp4.length > 0) return mp4[0];
  const cualquiera = soloAudio.sort(porBitrate);
  return cualquiera.length > 0 ? cualquiera[0] : null;
}

function infoDesdeYtdl(info: VideoInfo, id: string | null): InfoVideoYouTube {
  const d = info.videoDetails;
  const thumb =
    d.thumbnails?.length > 0
      ? d.thumbnails[d.thumbnails.length - 1].url
      : id
        ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
        : "";

  // En vivo: el manifiesto HLS es la URL que ffmpeg entiende.
  if (d.isLive) {
    const hls = info.hlsManifestUrl || null;
    const directo =
      info.formats.find((f) => f.isLive && f.url && f.hasVideo) || null;
    return {
      titulo: d.title,
      duracion: Number(d.lengthSeconds) || 0,
      thumbnail: thumb,
      isLive: true,
      streamUrl: hls || directo?.url || null,
      audioUrl: null,
      esVideoSolo: false,
      id: d.id || id,
    };
  }

  // 1. Formato progresivo (video+audio juntos), si YouTube lo sirve.
  const combinado = info.formats
    .filter(
      (f) =>
        f.hasVideo && f.hasAudio && f.url && f.container === "mp4" && (f.height || 0) <= 2160
    )
    .sort((a, b) => (b.height || 0) - (a.height || 0))[0];
  if (combinado?.url) {
    return {
      titulo: d.title,
      duracion: Number(d.lengthSeconds) || 0,
      thumbnail: thumb,
      isLive: false,
      streamUrl: combinado.url,
      audioUrl: null,
      esVideoSolo: false,
      id: d.id || id,
    };
  }

  // 2. DASH: video solo + audio solo.
  const video = elegirVideo(info.formats);
  const audio = elegirAudio(info.formats);
  return {
    titulo: d.title,
    duracion: Number(d.lengthSeconds) || 0,
    thumbnail: thumb,
    isLive: false,
    streamUrl: video?.url || null,
    audioUrl: audio?.url || null,
    esVideoSolo: Boolean(video?.url),
    id: d.id || id,
  };
}

async function infoDesdeOEmbed(url: string, id: string | null): Promise<InfoVideoYouTube | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const j: any = await res.json();
    if (!j?.title) return null;
    return {
      titulo: String(j.title),
      duracion: 0,
      thumbnail: j.thumbnail_url || (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : ""),
      isLive: false,
      streamUrl: null,
      audioUrl: null,
      esVideoSolo: false,
      id,
    };
  } catch {
    return null;
  }
}

/**
 * Información del video de YouTube sin Python.
 * Orden (v6): 1) ytdl-core (getInfo). 2) Vía alternativa sin InnerTube
 * (Invidious, luego la página watch) — es la que salva el video cuando
 * YouTube bloquea las peticiones de Vercel con BOT_CHECK. 3) oEmbed
 * (título/miniatura, sin URL de descarga), marcado como bloqueado.
 * Lanza un error claro en español solo si ni siquiera el título se pudo leer.
 */
export async function obtenerInfoVideo(url: string): Promise<InfoVideoYouTube> {
  const id = extraerIdYouTube(url);
  let errorGetInfo: any = null;
  try {
    const info = await clienteYtdl().getInfo(url, { signal: AbortSignal.timeout(25000) });
    const resultado = infoDesdeYtdl(info, id);
    if (resultado.titulo) return { ...resultado, via: "ytdl" };
  } catch (e) {
    // Caer a la vía alternativa (abajo), no a oEmbed todavía.
    errorGetInfo = e;
  }
  // 2. Vía alternativa sin InnerTube: no la ve la IP de Vercel como bot.
  if (id) {
    try {
      const { resolverYouTubeAlternativo } = await import("./youtube-alternativo");
      const alt = await resolverYouTubeAlternativo(url, id);
      if (alt) {
        return {
          titulo: alt.titulo,
          duracion: alt.duracion,
          thumbnail: alt.thumbnail,
          isLive: alt.isLive,
          streamUrl: alt.streamUrl,
          audioUrl: alt.audioUrl,
          esVideoSolo: Boolean(alt.streamUrl && alt.audioUrl),
          id,
          via: alt.via,
        };
      }
    } catch {
      // Seguir a oEmbed.
    }
  }
  const porOEmbed = await infoDesdeOEmbed(url, id);
  if (porOEmbed) {
    return {
      ...porOEmbed,
      via: "oembed",
      bloqueado: Boolean(
        errorGetInfo && String(errorGetInfo?.code || errorGetInfo?.message || "").includes("BOT_CHECK")
      ),
    };
  }
  throw new Error(
    "YouTube bloqueó la lectura de este enlace desde el servidor de Vercel (verificación anti-bot). Ya se probaron otras vías desde el servidor y tampoco respondieron. Prueba con otro enlace, pega la URL HLS (.m3u8) del directo si la tienes, o usa el contenedor local (tu PC), donde yt-dlp sí lo lee."
  );
}

/** URL directa (googlevideo.com) usable como entrada de ffmpeg. null si no hay. */
export async function obtenerUrlDirecta(url: string): Promise<string | null> {
  try {
    const info = await obtenerInfoVideo(url);
    return info.streamUrl;
  } catch {
    return null;
  }
}

/** URL directa del mejor audio solo (mp4/m4a). null si no hay. */
export async function obtenerUrlAudio(url: string): Promise<string | null> {
  try {
    const info = await obtenerInfoVideo(url);
    return info.audioUrl;
  } catch {
    return null;
  }
}

function parsearJson3(raw: string): SubCueJS[] {
  try {
    const j = JSON.parse(raw);
    const cues: SubCueJS[] = [];
    for (const ev of j?.events || []) {
      const segs = ev?.segs || [];
      const texto = segs
        .map((s: any) => String(s?.utf8 || ""))
        .join("")
        .replace(/\n/g, " ")
        .trim();
      if (!texto) continue;
      const inicio = Number(ev.tStartMs || 0) / 1000;
      const dur = Number(ev.dDurationMs || 2000) / 1000;
      if (dur <= 0) continue;
      cues.push({
        inicio: Number(inicio.toFixed(2)),
        fin: Number((inicio + dur).toFixed(2)),
        texto,
      });
    }
    return cues;
  } catch {
    return [];
  }
}

function parsearVtt(raw: string): SubCueJS[] {
  const cues: SubCueJS[] = [];
  const aSeg = (t: string): number => {
    const p = t.trim().split(":");
    if (p.length === 3) return Number(p[0]) * 3600 + Number(p[1]) * 60 + Number(p[2]);
    if (p.length === 2) return Number(p[0]) * 60 + Number(p[1]);
    return 0;
  };
  const bloques = raw.replace(/\r/g, "").split("\n\n");
  for (const b of bloques) {
    const lineas = b.split("\n").map((l) => l.trim()).filter(Boolean);
    const lineaTiempo = lineas.find((l) => l.includes("-->"));
    if (!lineaTiempo) continue;
    const [ini, fin] = lineaTiempo.split("-->");
    const texto = lineas
      .slice(lineas.indexOf(lineaTiempo) + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .trim();
    const inicio = aSeg(ini);
    const f = aSeg(fin.split(" ")[0]);
    if (texto && f > inicio) {
      cues.push({ inicio: Number(inicio.toFixed(2)), fin: Number(f.toFixed(2)), texto });
    }
  }
  return cues;
}

/**
 * Subtítulos del video (es, luego en) como cues {inicio, fin, texto}.
 * Nunca lanza: devuelve [] si no hay subtítulos o si YouTube los bloquea.
 */
export async function obtenerSubtitulos(url: string): Promise<SubCueJS[]> {
  try {
    const ytdl = clienteYtdl();
    const info = await ytdl.getInfo(url, { signal: AbortSignal.timeout(25000) });
    const tracks = info.captionTracks || [];
    if (tracks.length === 0) return [];
    const preferido =
      tracks.find((t) => t.languageCode.toLowerCase().startsWith("es")) ||
      tracks.find((t) => t.languageCode.toLowerCase().startsWith("en")) ||
      tracks[0];
    // json3 primero (tiempos exactos); VTT como respaldo.
    try {
      const raw = await ytdl.getCaptions(info, {
        lang: preferido.languageCode,
        format: CaptionFormat.Json3,
        signal: AbortSignal.timeout(15000),
      });
      const cues = parsearJson3(raw);
      if (cues.length > 0) return cues;
    } catch {
      // Probar VTT
    }
    try {
      const raw = await ytdl.getCaptions(info, {
        lang: preferido.languageCode,
        format: CaptionFormat.Vtt,
        signal: AbortSignal.timeout(15000),
      });
      return parsearVtt(raw);
    } catch {
      return [];
    }
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// yt-dlp LOCAL-ONLY. Nunca se descarga, nunca se ejecuta en Vercel.
// ---------------------------------------------------------------------------

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";

const execFileAsync = promisify(execFile);
let binarioLocalCache: string | null = null;

function esEjecutable(ruta: string): boolean {
  try {
    fs.accessSync(ruta, fs.constants.X_OK);
    return true;
  } catch {
    return fs.existsSync(ruta);
  }
}

async function enPath(): Promise<string | null> {
  try {
    const cmd = process.platform === "win32" ? "where" : "which";
    const { stdout } = await execFileAsync(cmd, ["yt-dlp"], { timeout: 8000 });
    const primera = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0];
    return primera && esEjecutable(primera) ? primera : null;
  } catch {
    return null;
  }
}

/**
 * Ruta al binario yt-dlp SOLO para uso local (PC de Carlos / servidor-clips).
 * Busca: YTDLP_PATH, yt-dlp.exe / yt-dlp junto al proyecto, yt-dlp en el PATH.
 * NUNCA descarga yt-dlp y NUNCA funciona en Vercel: en Vercel usa la
 * descarga sin Python (app/lib/youtube-js.ts). Lanza un error claro en
 * español si no hay binario local.
 */
export async function obtenerBinarioYtDlpLocal(): Promise<string> {
  if (esEntornoVercel()) {
    throw new Error(
      "yt-dlp no está disponible en Vercel: en Vercel usa la descarga sin Python; " +
        "en local coloca yt-dlp.exe junto a package.json."
    );
  }
  if (binarioLocalCache && esEjecutable(binarioLocalCache)) return binarioLocalCache;

  const porEnv = process.env.YTDLP_PATH?.trim();
  if (porEnv && esEjecutable(porEnv)) {
    binarioLocalCache = porEnv;
    return porEnv;
  }

  const localWin = path.join(process.cwd(), "yt-dlp.exe");
  if (fs.existsSync(localWin)) {
    binarioLocalCache = localWin;
    return localWin;
  }
  const localNix = path.join(process.cwd(), "yt-dlp");
  if (esEjecutable(localNix)) {
    binarioLocalCache = localNix;
    return localNix;
  }

  const delPath = await enPath();
  if (delPath) {
    binarioLocalCache = delPath;
    return delPath;
  }

  throw new Error(
    "No se encontró yt-dlp en este equipo. En local coloca yt-dlp.exe junto a " +
      "package.json o instala yt-dlp. En Vercel usa la descarga sin Python."
  );
}
