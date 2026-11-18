// Vía ALTERNATIVA para leer YouTube desde Vercel (v6).
//
// EL PROBLEMA (reproducido 2026-11-18 con t8HuqJeu6LE): YouTube bloquea
// las peticiones InnerTube (las que hace ytdl-core con getInfo) desde
// las IPs de Vercel ("Sign in to confirm you're not a bot", BOT_CHECK).
// El bloqueo es de la IP del servidor, intermitente, y no se arregla
// cambiando de cliente de ytdl-core: DEFAULT_CLIENTS ya prueba
// VisionOS, WebEmbedded y TV, y todos se bloquean igual desde Vercel.
// Además, cuando getInfo fallaba, el extracto trataba un directo
// watch?v=... como video grabado de 0 segundos y salía el mensaje
// "No se pudo leer este enlace desde el servidor (sin duración ni URL
// de descarga)", que Carlos lee —con razón— como "el mismo error".
//
// ESTE MÓDULO da dos vías que NO usan InnerTube desde el servidor:
//   1. Invidious (API pública, instancia yt.chocolatemoo53.com,
//      verificada 2026-11-18 para t8HuqJeu6LE en vivo y para
//      dQw4w9WgXcQ grabado): devuelve título, liveNow, duración,
//      hlsUrl (manifiesto HLS proxificado por la instancia) y
//      adaptiveFormats con URLs directas de audio/video de Google
//      Video. La instancia hace de intermediaria, así que YouTube no
//      ve la IP de Vercel.
//   2. La página watch de YouTube (GET normal a youtube.com/watch?v=):
//      trae ytInitialPlayerResponse con streamingData (hlsManifestUrl
//      y adaptiveFormats). Es otro endpoint distinto de InnerTube y
//      muchas veces responde aunque el player API esté bloqueado.
//
// Si las dos fallan, el llamador debe decirlo claro nombrando a
// YouTube, y el editor tiene además una vía desde el NAVEGADOR del
// usuario (su IP de casa no está bloqueada): resolver por Invidious
// desde el cliente y pasar las URLs directas al servidor.
//
// NADA de aquí usa yt-dlp ni Python. Solo fetch.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export interface ResolucionAlternativa {
  titulo: string;
  /** 0 en los directos (sin duración conocida). */
  duracion: number;
  isLive: boolean;
  /** Manifiesto HLS del directo (o del video, si lo hay). */
  hlsUrl: string | null;
  /** URL directa del mejor audio solo (mp4/m4a). */
  audioUrl: string | null;
  /** URL directa del mejor video (mp4 ≤2160p) o del HLS. */
  streamUrl: string | null;
  thumbnail: string;
  /** Por qué vía se resolvió. */
  via: "invidious" | "watch";
}

const INSTANCIAS_INVIDIOUS = [
  "https://yt.chocolatemoo53.com",
  "https://invidious.privacyredirect.com",
  "https://iv.datura.network",
];

interface FormatoCrudo {
  itag?: number;
  type?: string;
  mimeType?: string;
  url?: string;
  bitrate?: number;
  width?: number;
  height?: number;
}

function esAudioMp4(f: FormatoCrudo): boolean {
  const t = (f.type || f.mimeType || "").toLowerCase();
  return t.startsWith("audio/mp4") || t.startsWith("audio/m4a");
}

function esVideoMp4(f: FormatoCrudo): boolean {
  const t = (f.type || f.mimeType || "").toLowerCase();
  return t.startsWith("video/mp4");
}

function elegirAudio(formatos: FormatoCrudo[]): string | null {
  const audios = formatos.filter((f) => f.url && esAudioMp4(f));
  // itag 140 (AAC 128 kbps) primero, luego 139, luego el de más bitrate.
  const porItag = (a: FormatoCrudo, b: FormatoCrudo) => {
    const rango = (f: FormatoCrudo) => (f.itag === 140 ? 0 : f.itag === 139 ? 1 : 2);
    return rango(a) - rango(b) || (b.bitrate || 0) - (a.bitrate || 0);
  };
  const ordenados = [...audios].sort(porItag);
  if (ordenados[0]?.url) return ordenados[0].url;
  const cualquiera = formatos
    .filter((f) => f.url && (f.type || f.mimeType || "").toLowerCase().startsWith("audio/"))
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
  return cualquiera[0]?.url || null;
}

function elegirVideo(formatos: FormatoCrudo[]): string | null {
  const videos = formatos.filter(
    (f) => f.url && esVideoMp4(f) && (f.height || 0) > 0 && (f.height || 0) <= 2160
  );
  videos.sort((a, b) => (b.height || 0) - (a.height || 0));
  return videos[0]?.url || null;
}

async function fetchJson(url: string, timeoutMs: number): Promise<any | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** 1. Invidious: la instancia resuelve el video y entrega URLs directas. */
export async function resolverPorInvidious(
  id: string
): Promise<ResolucionAlternativa | null> {
  for (const base of INSTANCIAS_INVIDIOUS) {
    const d = await fetchJson(`${base}/api/v1/videos/${id}`, 8000);
    if (!d || typeof d !== "object" || !d.title) continue;
    const adaptativos: FormatoCrudo[] = Array.isArray(d.adaptiveFormats)
      ? d.adaptiveFormats
      : [];
    const isLive = Boolean(d.liveNow) || Number(d.lengthSeconds || 0) === 0;
    const hlsUrl: string | null =
      typeof d.hlsUrl === "string" && d.hlsUrl.startsWith("http") ? d.hlsUrl : null;
    const audioUrl = elegirAudio(adaptativos);
    const videoUrl = elegirVideo(adaptativos);
    // En un directo lo que importa es el HLS; en un grabado, el video/audio.
    const streamUrl = isLive ? hlsUrl || videoUrl : videoUrl || hlsUrl;
    if (!streamUrl && !audioUrl && !hlsUrl) continue;
    return {
      titulo: String(d.title),
      duracion: Number(d.lengthSeconds || 0),
      isLive,
      hlsUrl,
      audioUrl,
      streamUrl,
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      via: "invidious",
    };
  }
  return null;
}

/** Extrae el JSON de ytInitialPlayerResponse de la página watch. */
function extraerPlayerResponse(html: string): any | null {
  const marcador = "ytInitialPlayerResponse";
  const idx = html.indexOf(marcador);
  if (idx < 0) return null;
  const inicioJson = html.indexOf("{", idx);
  if (inicioJson < 0) return null;
  let profundidad = 0;
  let dentroTexto = false;
  let escape = false;
  for (let i = inicioJson; i < html.length; i++) {
    const c = html[i];
    if (dentroTexto) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') dentroTexto = false;
      continue;
    }
    if (c === '"') {
      dentroTexto = true;
      continue;
    }
    if (c === "{") profundidad++;
    else if (c === "}") {
      profundidad--;
      if (profundidad === 0) {
        try {
          return JSON.parse(html.slice(inicioJson, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** 2. Página watch: GET normal a youtube.com, sin InnerTube. */
export async function resolverPorPaginaWatch(
  url: string,
  id: string
): Promise<ResolucionAlternativa | null> {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${id}`, {
      headers: {
        "User-Agent": UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const pr = extraerPlayerResponse(html);
    if (!pr) return null;
    const detalles = pr.videoDetails || {};
    const sd = pr.streamingData || {};
    if (!detalles.title || !sd) return null;
    const adaptativos: FormatoCrudo[] = Array.isArray(sd.adaptiveFormats)
      ? sd.adaptiveFormats
      : [];
    const progresivos: FormatoCrudo[] = Array.isArray(sd.formats) ? sd.formats : [];
    const isLive = Boolean(detalles.isLive);
    const hlsUrl: string | null =
      typeof sd.hlsManifestUrl === "string" && sd.hlsManifestUrl.startsWith("http")
        ? sd.hlsManifestUrl
        : null;
    const audioUrl = elegirAudio(adaptativos) || elegirAudio(progresivos);
    const videoUrl = elegirVideo(adaptativos) || elegirVideo(progresivos);
    const streamUrl = isLive ? hlsUrl || videoUrl : videoUrl || hlsUrl;
    if (!streamUrl && !audioUrl && !hlsUrl) return null;
    return {
      titulo: String(detalles.title),
      duracion: Number(detalles.lengthSeconds || 0),
      isLive,
      hlsUrl,
      audioUrl,
      streamUrl,
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      via: "watch",
    };
  } catch {
    return null;
  }
}

/** Prueba Invidious y luego la página watch. null si ninguna responde. */
export async function resolverYouTubeAlternativo(
  url: string,
  id: string
): Promise<ResolucionAlternativa | null> {
  const porInvidious = await resolverPorInvidious(id);
  if (porInvidious) return porInvidious;
  return resolverPorPaginaWatch(url, id);
}

/** Instancias Invidious que el NAVEGADOR puede usar (tienen CORS). */
export const INSTANCIAS_INVIDIOUS_NAVEGADOR = INSTANCIAS_INVIDIOUS;
