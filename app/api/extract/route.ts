import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { obtenerBinarioYtDlpLocal } from "../../lib/ytdlp";
import {
  esEntornoVercel,
  esUrlYouTube,
  obtenerInfoVideo,
  obtenerSubtitulos,
} from "../../lib/youtube-js";

import { analizarMejoresMomentos } from "../../lib/mejores-momentos";

const execFileAsync = promisify(execFile);

interface MomentoClip {
  inicio: number;
  fin: number;
  titulo: string;
  puntaje: number;
  motivo?: string;
}

interface SubCue {
  id: string;
  inicio: number;
  fin: number;
  texto: string;
}

async function ejecutarYtDlpConRespaldo(ytDlp: string, args: string[], timeoutMs = 20000) {
  try {
    return await execFileAsync(ytDlp, ["--cookies-from-browser", "brave", ...args], {
      timeout: timeoutMs,
      windowsHide: true,
    });
  } catch {
    return await execFileAsync(ytDlp, args, {
      timeout: timeoutMs,
      windowsHide: true,
    });
  }
}

const detectarPlataforma = (url: string): string => {
  const u = url.toLowerCase();
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "YouTube / Live";
  if (u.includes("tiktok.com")) return "TikTok";
  if (u.includes("instagram.com")) return "Instagram";
  if (u.includes("facebook.com") || u.includes("fb.watch")) return "Facebook";
  if (u.includes("kick.com")) return "Kick";
  if (u.includes("twitch.tv")) return "Twitch";
  return "Streaming / Web";
};

const esEnlaceEnVivo = (url: string): boolean => {
  const u = url.toLowerCase();
  if (u.includes("tiktok.com") && u.includes("/live")) return true;
  if (u.includes("youtube.com/live/") || u.endsWith("/live")) return true;
  if (u.includes("twitch.tv/") && !u.includes("/videos/")) return true;
  if (u.includes("kick.com/") && !u.includes("/video/")) return true;
  if (u.includes(".m3u8")) return true;
  return false;
};

const extraerUsuarioTikTok = (url: string): string | null => {
  const match = url.match(/tiktok\.com\/@([a-zA-Z0-9._-]+)/i);
  return match ? match[1] : null;
};

const extraerIdYouTube = (url: string): string | null => {
  const reg =
    /(?:youtube\.com\/(?:watch\?v=|live\/|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = url.match(reg);
  return match ? match[1] : null;
};

const extraerCanalTwitch = (url: string): string | null => {
  const match = url.match(/twitch\.tv\/([a-zA-Z0-9_]+)/i);
  if (!match) return null;
  const canal = match[1].toLowerCase();
  if (["videos", "directory", "downloads", "settings"].includes(canal)) return null;
  return match[1];
};

const extraerCanalKick = (url: string): string | null => {
  const match = url.match(/kick\.com\/([a-zA-Z0-9_-]+)/i);
  if (!match) return null;
  const canal = match[1].toLowerCase();
  if (["video", "categories", "browse"].includes(canal)) return null;
  return match[1];
};

async function obtenerStreamTikTokLiveDirecto(username: string) {
  try {
    const apiUrl = `https://www.tiktok.com/api-live/user/room?aid=1988&sourceType=54&uniqueId=${encodeURIComponent(
      username
    )}`;
    const res = await fetch(apiUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Referer: `https://www.tiktok.com/@${username}/live`,
        Accept: "application/json, text/plain, */*",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return null;
    const json = await res.json();
    const userStatus = json?.data?.user?.status;
    const liveRoom = json?.data?.liveRoom;
    const roomStatus = liveRoom?.status;

    if (userStatus !== 2 && roomStatus !== 2) {
      return { offline: true as const };
    }

    const rawStreamData = liveRoom?.streamData?.pull_data?.stream_data;
    let streamUrl: string | null = null;

    if (typeof rawStreamData === "string" && rawStreamData.startsWith("{")) {
      const parsed = JSON.parse(rawStreamData);
      const niveles = ["origin", "uhd", "hd", "sd", "ld"];
      for (const nv of niveles) {
        const main = parsed?.data?.[nv]?.main;
        if (main?.hls) {
          streamUrl = main.hls;
          break;
        }
        if (main?.flv) {
          streamUrl = main.flv;
          break;
        }
      }
    }

    if (!streamUrl && liveRoom?.streamData?.hls_pull_url) {
      streamUrl = liveRoom.streamData.hls_pull_url;
    }

    const titulo =
      liveRoom?.title ||
      `En Vivo de ${json?.data?.user?.nickname || `@${username}`} (TikTok Live)`;
    const thumbnail =
      liveRoom?.cover?.url_list?.[0] || json?.data?.user?.avatarLarger || "";

    if (streamUrl) {
      return {
        offline: false as const,
        streamUrl,
        titulo,
        thumbnail,
      };
    }
  } catch {
    // Continuar con respaldo
  }
  return null;
}

function tiempoSrtASegundos(t: string): number {
  const limpio = t.trim().replace(",", ".");
  const partes = limpio.split(":");
  if (partes.length === 3) {
    return Number(partes[0]) * 3600 + Number(partes[1]) * 60 + Number(partes[2]);
  }
  if (partes.length === 2) {
    return Number(partes[0]) * 60 + Number(partes[1]);
  }
  return 0;
}

function parsearSrt(contenido: string): SubCue[] {
  const bloques = contenido.replace(/\r/g, "").split("\n\n");
  const cues: SubCue[] = [];
  for (const bloque of bloques) {
    const lineas = bloque
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const lineaTiempo = lineas.find((l) => l.includes("-->"));
    if (!lineaTiempo) continue;
    const [iniStr, finStr] = lineaTiempo.split("-->");
    const inicio = tiempoSrtASegundos(iniStr);
    const fin = tiempoSrtASegundos(finStr.split(" ")[0]);
    const idxTiempo = lineas.indexOf(lineaTiempo);
    const texto = lineas
      .slice(idxTiempo + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (texto && fin > inicio) {
      cues.push({
        id: `srt-${cues.length}-${Date.now()}`,
        inicio: Number(inicio.toFixed(2)),
        fin: Number(fin.toFixed(2)),
        texto,
      });
    }
  }
  return cues;
}

async function extraerSubtitulosConYtDlp(ytDlp: string, url: string): Promise<SubCue[]> {
  const tmpSubDir = path.join(os.tmpdir(), `subs-${Date.now()}`);
  await fs.promises.mkdir(tmpSubDir, { recursive: true });
  try {
    await ejecutarYtDlpConRespaldo(
      ytDlp,
      [
        "--no-playlist",
        "--no-warnings",
        "--no-check-certificates",
        "--skip-download",
        "--write-auto-subs",
        "--write-subs",
        "--sub-langs",
        "es.*,es,en.*,en",
        "--convert-subs",
        "srt",
        "--extractor-args",
        "youtube:player_client=android,web",
        "-o",
        path.join(tmpSubDir, "cap.%(ext)s"),
        url,
      ],
      15000
    );

    const archivos = await fs.promises.readdir(tmpSubDir);
    const srtFile =
      archivos.find((f) => f.endsWith(".es.srt") || f.includes(".es-")) ||
      archivos.find((f) => f.endsWith(".srt"));

    if (srtFile) {
      const raw = await fs.promises.readFile(path.join(tmpSubDir, srtFile), "utf8");
      return parsearSrt(raw);
    }
  } catch {
    // Continuar
  } finally {
    await fs.promises.rm(tmpSubDir, { recursive: true, force: true }).catch(() => {});
  }
  return [];
}

async function extraerMetadatosYtDlp(ytDlp: string, url: string, esLive: boolean) {
  try {
    const args = esLive
      ? [
          "--no-playlist",
          "--no-warnings",
          "--no-check-certificates",
          "--extractor-args",
          "youtube:player_client=android,web",
          "-f",
          "best[height<=2160]/best",
          "--print",
          "%(id)s|||%(title)s|||%(duration)s|||%(thumbnail)s|||%(is_live)s|||%(url)s",
          url,
        ]
      : [
          "--no-playlist",
          "--no-warnings",
          "--no-check-certificates",
          "--skip-download",
          "--extractor-args",
          "youtube:player_client=android,web",
          "--print",
          "%(id)s|||%(title)s|||%(duration)s|||%(thumbnail)s|||%(is_live)s",
          url,
        ];

    const { stdout } = await ejecutarYtDlpConRespaldo(ytDlp, args, 20000);

    const linea = stdout.trim().split("\n")[0] || "";
    const [vidId, titulo, durStr, thumb, isLiveStr, directStream] = linea.split("|||");
    const dur = Math.floor(Number(durStr) || 0);
    const isLive = isLiveStr === "True" || isLiveStr === "true";

    if (titulo) {
      return {
        ok: true as const,
        vidId: (vidId || "").trim(),
        titulo: titulo.trim(),
        duracion: dur > 0 ? dur : 0,
        thumbnail: (thumb || "").trim(),
        isLive,
        directStream: (directStream || "").trim(),
      };
    }
  } catch (err: any) {
    const detalle = String(err?.stderr || err?.message || "").toLowerCase();
    if (detalle.includes("not currently live")) {
      return { ok: false as const, offline: true };
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const url = body?.url;
    const durClip = Math.min(300, Math.max(3, Number(body?.duracionClip) || 30));
    const cantidadRaw = body?.cantidadClips;
    const numCant = Number(cantidadRaw);
    const cantidad: number | "ilimitado" =
      cantidadRaw === "ilimitado" || numCant >= 100
        ? "ilimitado"
        : Math.max(1, numCant || 6);

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Pega un enlace válido." }, { status: 400 });
    }

    const cleanUrl = url.trim();
    // VÍA DESDE EL NAVEGADOR (v6): cuando YouTube bloquea la lectura
    // desde el servidor de Vercel, el editor resuelve el video desde el
    // navegador del usuario (su IP de casa no está bloqueada, Invidious
    // tiene CORS) y pasa aquí las URLs directas. Solo se aceptan URLs
    // de Google Video, de la instancia Invidious o .m3u8, y solo para
    // el mismo video de YouTube del enlace.
    const urlDirectaNavegador =
      typeof body?.streamUrlDirecto === "string" ? body.streamUrlDirecto.trim() : "";
    const audioDirectoNavegador =
      typeof body?.audioUrlDirecto === "string" ? body.audioUrlDirecto.trim() : "";
    const esUrlDirectaValida = (u: string): boolean => {
      if (!u.startsWith("https://")) return false;
      try {
        const host = new URL(u).hostname.toLowerCase();
        return (
          host.endsWith(".googlevideo.com") ||
          host === "yt.chocolatemoo53.com" ||
          host.endsWith(".invidious.io") ||
          u.toLowerCase().includes(".m3u8")
        );
      } catch {
        return false;
      }
    };
    const plataforma = detectarPlataforma(cleanUrl);
    let esEnVivo = esEnlaceEnVivo(cleanUrl);
    let ytId = extraerIdYouTube(cleanUrl);
    const twitchChannel = extraerCanalTwitch(cleanUrl);
    const kickChannel = extraerCanalKick(cleanUrl);
    const tiktokUser = extraerUsuarioTikTok(cleanUrl);
    // YouTube SIN Python: primero ytdl-core (JavaScript puro, funciona en
    // Vercel). yt-dlp solo como respaldo LOCAL y solo si hace falta; en
    // Vercel nunca se intenta resolver yt-dlp (ese 503 era el error).
    const esYouTube = esUrlYouTube(cleanUrl);

    let titulo = `Streaming / Video de ${plataforma}`;
    let thumbnail = ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : "";
    let streamUrl: string | null = cleanUrl.includes(".m3u8") ? cleanUrl : null;
    let audioUrl: string | null = null;
    let duracionTotal = 0;

    if (plataforma === "TikTok" && esEnVivo && tiktokUser) {
      const tkLive = await obtenerStreamTikTokLiveDirecto(tiktokUser);
      if (tkLive && !tkLive.offline && tkLive.streamUrl) {
        return NextResponse.json({
          ok: true,
          modoLocal: true,
          plataforma,
          esEnVivo: true,
          ytId: null,
          twitchChannel: null,
          kickChannel: null,
          titulo: tkLive.titulo,
          duracionTotal: 0,
          thumbnail: tkLive.thumbnail,
          streamUrl: tkLive.streamUrl,
          originalUrl: cleanUrl,
          momentos: [],
          subtitulos: [],
        });
      }
    }

    // 1. YouTube con JavaScript puro (ytdl-core): funciona en Vercel.
    // OJO (verificado 2026-11-18): YouTube a veces bloquea la lectura
    // desde el servidor ("Sign in to confirm you're not a bot", BOT_CHECK
    // en todos los clientes) y entonces getInfo falla. Antes eso caía en
    // silencio al respaldo oEmbed y el editor fingía que era un video
    // grabado de 0 segundos sin momentos — de ahí el mensaje falso "Este
    // video no tiene tramos con actividad suficiente". Ahora se marca
    // bloqueadoPorYouTube para que la pantalla diga la verdad.
    let metaJs: Awaited<ReturnType<typeof obtenerInfoVideo>> | null = null;
    let subsJs: SubCue[] = [];
    let bloqueadoPorYouTube = false;
    if (esYouTube) {
      try {
        metaJs = await obtenerInfoVideo(cleanUrl);
        // obtenerInfoVideo ya marca bloqueado=true cuando YouTube lo
        // bloqueó (BOT_CHECK) y solo quedó oEmbed.
        if (metaJs?.bloqueado) bloqueadoPorYouTube = true;
        if (!esEnVivo) {
          subsJs = (await obtenerSubtitulos(cleanUrl)).map((c, i) => ({
            id: `js-${i}-${Date.now()}`,
            inicio: c.inicio,
            fin: c.fin,
            texto: c.texto,
          }));
        }
      } catch (e: any) {
        // Respaldo local con yt-dlp (abajo) o seguir con oEmbed genérico.
        if (String(e?.code || e?.message || "").includes("BOT_CHECK")) {
          bloqueadoPorYouTube = true;
        }
      }
    }
    if (metaJs) {
      titulo = metaJs.titulo;
      duracionTotal = metaJs.duracion;
      if (metaJs.isLive) esEnVivo = true;
      if (metaJs.thumbnail) thumbnail = metaJs.thumbnail;
      if (metaJs.id) ytId = metaJs.id;
      if (metaJs.streamUrl) streamUrl = metaJs.streamUrl;
      audioUrl = metaJs.audioUrl;
    }

    // URLs directas que resolvió el navegador (v6): tienen prioridad,
    // porque vienen de la IP del usuario, que YouTube no bloquea. Si el
    // enlace directo es un HLS, es un directo en vivo.
    if (esUrlDirectaValida(urlDirectaNavegador)) {
      streamUrl = urlDirectaNavegador;
      if (urlDirectaNavegador.toLowerCase().includes(".m3u8")) esEnVivo = true;
    }
    if (esUrlDirectaValida(audioDirectoNavegador)) {
      audioUrl = audioDirectoNavegador;
    }
    // El navegador también sabe la duración (la da Invidious): sin ella
    // un video grabado no se puede analizar aunque ya tenga las URLs.
    const duracionDirecta = Number(body?.duracionTotalDirecta || 0);
    if (duracionTotal <= 0 && duracionDirecta > 0) {
      duracionTotal = Math.floor(duracionDirecta);
    }

    // 2. Respaldo LOCAL con yt-dlp: solo fuera de Vercel, y solo si el
    // camino JS no dio URL de descarga (o la plataforma no es YouTube).
    let localMeta: Awaited<ReturnType<typeof extraerMetadatosYtDlp>> = null;
    let subsYtDlp: SubCue[] = [];
    const necesitaYtDlp =
      !esEntornoVercel() && (!esYouTube || !metaJs || !metaJs.streamUrl);
    if (necesitaYtDlp) {
      try {
        const ytDlp = await obtenerBinarioYtDlpLocal();
        const [m, s] = await Promise.all([
          extraerMetadatosYtDlp(ytDlp, cleanUrl, esEnVivo),
          esEnVivo ? Promise.resolve([]) : extraerSubtitulosConYtDlp(ytDlp, cleanUrl),
        ]);
        localMeta = m;
        subsYtDlp = s;
      } catch {
        // Sin yt-dlp local: se sigue con lo que el camino JS haya dado.
      }
    }
    const subtitulosExtraidos = subsJs.length > 0 ? subsJs : subsYtDlp;

    if (localMeta && !localMeta.ok && localMeta.offline) {
      return NextResponse.json(
        {
          error:
            "Este canal no está transmitiendo en vivo ahora mismo (o requiere iniciar sesión en TikTok). Si lo tienes abierto en Brave, pulsa '🔴 Capturar Pantalla en Vivo'.",
        },
        { status: 400 }
      );
    }

    if (localMeta && localMeta.ok) {
      titulo = localMeta.titulo;
      duracionTotal = localMeta.duracion;
      if (localMeta.isLive) esEnVivo = true;
      if (!ytId && localMeta.vidId && localMeta.vidId.length === 11) {
        ytId = localMeta.vidId;
      }
      if (localMeta.thumbnail) thumbnail = localMeta.thumbnail;
      if (!ytId && !twitchChannel && !kickChannel && localMeta.directStream?.startsWith("http")) {
        streamUrl = localMeta.directStream;
      }
    }

    if (plataforma === "TikTok" && !esEnVivo) {
      try {
        const form = new URLSearchParams();
        form.append("url", cleanUrl);
        form.append("hd", "1");

        const tkRes = await fetch("https://www.tikwm.com/api/", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: form.toString(),
          signal: AbortSignal.timeout(9000),
        });

        if (tkRes.ok) {
          const tkData = await tkRes.json();
          if (tkData?.data?.play) {
            streamUrl = tkData.data.hdplay || tkData.data.play;
            titulo = tkData.data.title || titulo;
            thumbnail = tkData.data.cover || thumbnail;
            duracionTotal = Math.max(5, Number(tkData.data.duration || duracionTotal));
          }
        }
      } catch {
        // Continuar
      }
    }

    // MEJORES MOMENTOS DE VERDAD: se analiza el audio (energía por segundo),
    // la conversación de los subtítulos y el movimiento, y solo se devuelven
    // las ventanas que pasan el umbral. Los tramos aburridos se ignoran.
    // Antes esto cortaba trozos parejos con puntajes falsos (98, 97, 96...).
    let momentos: MomentoClip[] = [];
    let tramosIgnorados = 0;
    let analisisNota: string | undefined;
    let analisisHecho = false;
    if (bloqueadoPorYouTube) {
      // YouTube bloqueó la lectura desde este servidor: no se sabe si es
      // en vivo, no hay duración ni URL. Decirlo claro, nunca fingir un
      // video grabado sin momentos.
      analisisNota =
        "YouTube bloqueó la lectura de este enlace desde el servidor de Vercel (verificación anti-bot). No se pudo saber si es en vivo ni sacar momentos desde el servidor. Probando otra vía desde tu navegador… Si tampoco funciona, pega la URL HLS (.m3u8) del directo si la tienes, o usa el contenedor local (tu PC), donde yt-dlp sí lo lee.";
    } else if (!esEnVivo && duracionTotal > 0 && (streamUrl || audioUrl)) {
      try {
        const analisis = await analizarMejoresMomentos({
          audioUrl: audioUrl || streamUrl,
          videoUrl: streamUrl,
          duracionTotal,
          durClip,
          cantidad,
          subtitulos: subtitulosExtraidos,
        });
        analisisHecho = true;
        momentos = analisis.momentos;
        tramosIgnorados = analisis.tramosIgnorados;
        analisisNota = analisis.aviso;
      } catch {
        analisisHecho = true;
        analisisNota =
          "No se pudo analizar el audio de este video; usa el corte manual en el Editor 9:16.";
      }
    } else if (!esEnVivo && duracionTotal <= 0) {
      // Último recurso, y hay que decirlo claro nombrando a YouTube:
      // no es que el video "no tenga actividad", es que YouTube bloqueó
      // la lectura desde el servidor de Vercel y ninguna vía alternativa
      // respondió. El editor intentará además la vía del navegador.
      analisisNota =
        "YouTube bloqueó la lectura de este enlace desde el servidor de Vercel (verificación anti-bot). Ya se probaron otras vías desde el servidor y tampoco respondieron. Probando otra vía desde tu navegador… Si tampoco funciona, pega la URL HLS (.m3u8) del directo o usa el contenedor local (tu PC).";
    }

    return NextResponse.json({
      ok: true,
      modoLocal: true,
      plataforma,
      esEnVivo,
      ytId,
      twitchChannel,
      kickChannel,
      titulo,
      duracionTotal,
      thumbnail,
      streamUrl,
      audioUrl,
      originalUrl: cleanUrl,
      momentos,
      tramosIgnorados,
      analisisNota,
      analisisHecho,
      bloqueadoPorYouTube,
      subtitulos: subtitulosExtraidos,
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo leer el enlace. Verifica que la URL esté completa." },
      { status: 500 }
    );
  }
}
