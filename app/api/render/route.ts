import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { obtenerBinarioYtDlpLocal, obtenerBinarioFfmpeg } from "../../lib/ytdlp";
import { asegurarDirExportados } from "../../lib/ruta-exportados";
import {
  esEntornoVercel,
  esUrlYouTube,
  obtenerInfoVideo,
} from "../../lib/youtube-js";

const execFileAsync = promisify(execFile);

interface SegmentoInput {
  tipo: "archivo" | "url";
  fileKey?: string;
  originalUrl?: string;
  streamUrl?: string | null;
  audioUrl?: string | null;
  inicio: number;
  fin: number;
}

interface SubInput {
  inicio: number;
  fin: number;
}

function obtenerFuenteSistema(): string {
  if (process.platform === "win32") {
    const arialBold = "C:/Windows/Fonts/arialbd.ttf";
    if (fs.existsSync(arialBold)) return "C\\:/Windows/Fonts/arialbd.ttf";
    return "C\\:/Windows/Fonts/arial.ttf";
  }
  const linuxFont = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
  if (fs.existsSync(linuxFont)) return linuxFont;
  return "";
}

// 4K: 2160x3840 vertical (TikTok/Shorts), 3840x2160 horizontal (YouTube), 2160x2160 cuadrado.
// Todo se exporta a 60 fps.
const DIMENSIONES: Record<string, Record<string, [number, number]>> = {
  "9:16": { "720p": [720, 1280], "1080p": [1080, 1920], "4K": [2160, 3840] },
  "1:1": { "720p": [720, 720], "1080p": [1080, 1080], "4K": [2160, 2160] },
  "16:9": { "720p": [1280, 720], "1080p": [1920, 1080], "4K": [3840, 2160] },
};

const FILTROS_EFECTO: Record<string, string> = {
  normal: "",
  vibrante: "eq=contrast=1.15:saturation=1.45",
  cine: "eq=contrast=1.22:saturation=0.85:brightness=-0.04",
  contraste: "eq=contrast=1.35:saturation=1.1",
  byn: "hue=s=0,eq=contrast=1.25",
  calido: "eq=saturation=1.3:brightness=0.04,colorbalance=rs=0.08:bs=-0.08",
};

function limpiarTextoDrawtext(txt: string): string {
  return txt
    .replace(/\\/g, "")
    .replace(/:/g, " ")
    .replace(/'/g, "’")
    .replace(/"/g, "")
    .replace(/%/g, "%%")
    .replace(/\s+/g, " ")
    .trim();
}

// Descarga el video fuente SIN Python:
//  1. Si hay streamUrl (URL directa de googlevideo.com / TikTok / CDN), se
//     descarga con fetch. YouTube casi siempre sirve video solo + audio solo
//     (DASH): si también viene audioUrl, se descarga y se une con ffmpeg
//     -c copy (sin re-codificar) para que el mp4 final tenga sonido.
//  2. Si no hay streamUrl y el enlace es de YouTube, se resuelve la URL
//     directa con ytdl-core (JavaScript puro, funciona en Vercel).
//  3. yt-dlp SOLO como último recurso LOCAL (nunca en Vercel).
async function descargarVideoUrl(
  ffmpegPath: string,
  orig: string,
  streamUrl: string | null | undefined,
  audioUrl: string | null | undefined,
  destinoMp4: string
) {
  const UA = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  };

  // Descarga por streaming directo a disco (sin cargar el video entero en
  // memoria: un 1080p de 3 min son ~80 MB). Timeout amplio porque la red
  // puede ser lenta; en Vercel la descarga suele ser mucho más rápida.
  // Un reintento: googlevideo a veces cierra la conexión a mitad de la
  // descarga y sin él el clip saldría sin audio (silencio).
  async function bajar(url: string, destino: string): Promise<boolean> {
    for (let intento = 1; intento <= 2; intento++) {
      try {
        const resp = await fetch(url, {
          headers: UA,
          signal: AbortSignal.timeout(280000),
          redirect: "follow",
        });
        if (!resp.ok || !resp.body) {
          console.error("[descargarVideoUrl] fetch no-ok:", resp.status, url.slice(0, 80));
          return false;
        }
        const ws = fs.createWriteStream(destino);
        await pipeline(Readable.fromWeb(resp.body as any), ws);
        const stat = await fs.promises.stat(destino).catch(() => null);
        if (stat && stat.size > 4096) return true;
      } catch (e: any) {
        console.error(
          "[descargarVideoUrl] bajar falló (intento",
          intento + "):",
          e?.message,
          "| causa:",
          String(e?.cause || "").slice(0, 200),
          "| url:",
          url.slice(0, 80)
        );
      }
      await fs.promises.unlink(destino).catch(() => {});
      if (intento === 1) await new Promise((r) => setTimeout(r, 2000));
    }
    return false;
  }

  let urlVideo = streamUrl || null;
  let urlAudio = audioUrl || null;

  // Sin URL directa: resolverla con JavaScript puro (YouTube).
  if (!urlVideo && orig && esUrlYouTube(orig)) {
    try {
      const info = await obtenerInfoVideo(orig);
      urlVideo = info.streamUrl;
      urlAudio = info.audioUrl;
    } catch {
      // Caer al respaldo local
    }
  }

  if (urlVideo) {
    const dirTmp = path.dirname(destinoMp4);
    const tmpVideo = path.join(dirTmp, `dl_video_${Date.now()}.mp4`);
    const tmpAudio = path.join(dirTmp, `dl_audio_${Date.now()}.m4a`);
    try {
      if (await bajar(urlVideo, tmpVideo)) {
        if (urlAudio && (await bajar(urlAudio, tmpAudio))) {
          try {
            await execFileAsync(
              ffmpegPath,
              [
                "-y",
                "-i",
                tmpVideo,
                "-i",
                tmpAudio,
                "-map",
                "0:v:0",
                "-map",
                "1:a:0",
                "-c",
                "copy",
                "-shortest",
                destinoMp4,
              ],
              { timeout: 180000, windowsHide: true }
            );
            if (fs.existsSync(destinoMp4)) return;
          } catch {
            // Si la unión falla, el video solo sigue siendo usable.
          }
        }
        await fs.promises.rename(tmpVideo, destinoMp4);
        return;
      }
    } finally {
      await fs.promises.unlink(tmpVideo).catch(() => {});
      await fs.promises.unlink(tmpAudio).catch(() => {});
    }
  }

  // Último recurso: yt-dlp SOLO en local (nunca en Vercel).
  if (esEntornoVercel()) {
    throw new Error(
      `No se pudo descargar el enlace: ${orig}. En Vercel la descarga es sin Python; prueba de nuevo o usa el contenedor local.`
    );
  }
  const ytDlp = await obtenerBinarioYtDlpLocal();

  const args = [
    "--no-playlist",
    "--no-warnings",
    "--no-check-certificates",
    "--extractor-args",
    "youtube:player_client=android,web",
    "-f",
    "bv*[height<=2160][ext=mp4]+ba[ext=m4a]/b[height<=2160][ext=mp4]/bv*[height<=2160]+ba/b[height<=2160]/b",
    "--merge-output-format",
    "mp4",
    "--ffmpeg-location",
    ffmpegPath,
    "-o",
    destinoMp4,
    orig,
  ];

  await execFileAsync(ytDlp, args, { timeout: 300000, windowsHide: true });

  if (!fs.existsSync(destinoMp4)) {
    throw new Error(`No se pudo descargar el enlace: ${orig}`);
  }
}

async function normalizarCorte(
  ffmpegPath: string,
  entrada: string,
  salida: string,
  inicio: number,
  duracion: number,
  w: number,
  h: number,
  audioGain: number,
  encuadre: string,
  velocidad = 1
) {
  // Fondo difuminado (blur): el video completo se escala para cubrir todo el
  // lienzo, se desenfoca fuerte y se oscurece un poco; encima va el video
  // original completo (sin recortar) centrado. Antes el fondo se recortaba
  // mal y en muchos videos no se veía el efecto.
  const vf =
    encuadre === "blur"
      ? `split[a][b];[a]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},boxblur=25:5,eq=brightness=-0.08[bgb];[b]scale=${w}:${h}:force_original_aspect_ratio=decrease[fgs];[bgb][fgs]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=60`
      : `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,fps=60`;

  const vFinal = velocidad !== 1 ? `${vf},setpts=${(1 / velocidad).toFixed(3)}*PTS` : vf;
  const af =
    velocidad !== 1
      ? `atempo=${velocidad.toFixed(2)}${audioGain !== 1 ? `,volume=${audioGain.toFixed(2)}` : ""}`
      : audioGain !== 1
        ? `volume=${audioGain.toFixed(2)}`
        : "anull";

  try {
    await execFileAsync(
      ffmpegPath,
      [
        "-y",
        "-ss",
        String(Math.max(0, inicio)),
        "-i",
        entrada,
        "-t",
        String(Math.max(1, duracion)),
        "-map",
        "0:v:0",
        "-map",
        "0:a:0",
        "-vf",
        vFinal,
        "-af",
        af,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-ar",
        "44100",
        "-ac",
        "2",
        "-b:a",
        "192k",
        salida,
      ],
      { timeout: 300000, windowsHide: true }
    );
    return;
  } catch {
    await execFileAsync(
      ffmpegPath,
      [
        "-y",
        "-ss",
        String(Math.max(0, inicio)),
        "-i",
        entrada,
        "-f",
        "lavfi",
        "-t",
        String(Math.max(1, duracion)),
        "-i",
        "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-t",
        String(Math.max(1, duracion)),
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-vf",
        vFinal,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-ar",
        "44100",
        "-ac",
        "2",
        "-b:a",
        "192k",
        salida,
      ],
      { timeout: 300000, windowsHide: true }
    );
  }
}

export async function POST(req: NextRequest) {
  const trabajoId = `render-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tmpDir = path.join(os.tmpdir(), trabajoId);
  await fs.promises.mkdir(tmpDir, { recursive: true });

  try {
    const form = await req.formData();
    const segmentosRaw = String(form.get("segmentos") || "[]");
    const segmentos: SegmentoInput[] = JSON.parse(segmentosRaw);
    const aspecto = String(form.get("aspecto") || "9:16");
    const calidad = String(form.get("calidad") || "4K");
    const velocidad = Math.min(2, Math.max(0.5, Number(form.get("velocidad") || 1)));
    const encuadre = String(form.get("encuadre") || "crop");
    const efecto = String(form.get("efecto") || "normal");
    const audioGain = Math.min(2.5, Math.max(0.5, Number(form.get("audioGain") || 1.2)));
    const subsMetaRaw = String(form.get("subsMeta") || "[]");
    const subsMeta: SubInput[] = JSON.parse(subsMetaRaw);
    const tituloSubAuto = String(form.get("tituloSubAuto") || "MIRA HASTA EL FINAL");

    if (!Array.isArray(segmentos) || segmentos.length === 0) {
      return NextResponse.json({ error: "No enviaste cortes para renderizar." }, { status: 400 });
    }

    const ffmpegPath = obtenerBinarioFfmpeg();
    // yt-dlp ya NO se resuelve aquí: solo se toca (en local) si un segmento
    // de URL realmente lo necesita dentro de descargarVideoUrl. En Vercel
    // la descarga es 100% JavaScript + ffmpeg-static, sin Python.
    const [w, h] = DIMENSIONES[aspecto]?.[calidad] || [2160, 3840];

    const archivosLocales = new Map<string, string>();
    for (const [key, val] of form.entries()) {
      if (key.startsWith("file_") && val instanceof File) {
        const ruta = path.join(tmpDir, `${key}.mp4`);
        const buf = Buffer.from(await val.arrayBuffer());
        await fs.promises.writeFile(ruta, buf);
        archivosLocales.set(key, ruta);
      }
    }

    const urlsDescargadas = new Map<string, string>();
    let urlCounter = 0;
    const listaCortesNormalizados: string[] = [];

    for (let i = 0; i < segmentos.length; i++) {
      const seg = segmentos[i];
      let rutaFuente = "";

      if (seg.tipo === "archivo" && seg.fileKey) {
        rutaFuente = archivosLocales.get(seg.fileKey) || "";
      } else if (seg.originalUrl || seg.streamUrl) {
        const claveUrl = seg.originalUrl || seg.streamUrl || "";
        if (urlsDescargadas.has(claveUrl)) {
          rutaFuente = urlsDescargadas.get(claveUrl)!;
        } else {
          const destino = path.join(tmpDir, `url_src_${urlCounter++}.mp4`);
          await descargarVideoUrl(
            ffmpegPath,
            seg.originalUrl || claveUrl,
            seg.streamUrl,
            seg.audioUrl,
            destino
          );
          urlsDescargadas.set(claveUrl, destino);
          rutaFuente = destino;
        }
      }

      if (!rutaFuente || !fs.existsSync(rutaFuente)) {
        throw new Error(`No se encontró el video fuente para el corte #${i + 1}`);
      }

      const durSeg = Math.max(1, Number(seg.fin) - Number(seg.inicio));
      const outSeg = path.join(tmpDir, `seg_${String(i).padStart(4, "0")}.mp4`);

      await normalizarCorte(
        ffmpegPath,
        rutaFuente,
        outSeg,
        Number(seg.inicio) || 0,
        durSeg,
        w,
        h,
        audioGain,
        encuadre,
        velocidad
      );
      listaCortesNormalizados.push(outSeg);
    }

    let videoUnido = listaCortesNormalizados[0];
    if (listaCortesNormalizados.length > 1) {
      const listaTxt = path.join(tmpDir, "lista.txt");
      const contenidoLista = listaCortesNormalizados
        .map((p) => `file '${p.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`)
        .join("\n");
      await fs.promises.writeFile(listaTxt, contenidoLista, "utf8");

      videoUnido = path.join(tmpDir, "unido.mp4");
      await execFileAsync(
        ffmpegPath,
        ["-y", "-f", "concat", "-safe", "0", "-i", listaTxt, "-c", "copy", videoUnido],
        { timeout: 180000, windowsHide: true }
      );
    }

    const argsFinal: string[] = ["-y", "-i", videoUnido];
    const cadenas: string[] = [];
    let lastV = "0:v";

    const filtroFx = FILTROS_EFECTO[efecto] || "";
    if (filtroFx) {
      cadenas.push(`[${lastV}]${filtroFx}[vfx]`);
      lastV = "vfx";
    }

    const overlayBaseFile = form.get("overlayBase");
    if (overlayBaseFile instanceof File && overlayBaseFile.size > 0) {
      const rutaBase = path.join(tmpDir, "overlay_base.png");
      await fs.promises.writeFile(rutaBase, Buffer.from(await overlayBaseFile.arrayBuffer()));
      const idx = argsFinal.filter((x) => x === "-i").length;
      argsFinal.push("-i", rutaBase);
      cadenas.push(`[${lastV}][${idx}:v]overlay=0:0[vbase]`);
      lastV = "vbase";
    }

    let subsQuemados = 0;
    for (let sIdx = 0; sIdx < Math.min(80, subsMeta.length); sIdx++) {
      const subFile = form.get(`sub_${sIdx}`);
      if (!(subFile instanceof File) || subFile.size === 0) continue;
      const meta = subsMeta[sIdx];
      const rutaSub = path.join(tmpDir, `sub_${sIdx}.png`);
      await fs.promises.writeFile(rutaSub, Buffer.from(await subFile.arrayBuffer()));
      const idx = argsFinal.filter((x) => x === "-i").length;
      argsFinal.push("-i", rutaSub);
      const nextV = `vsub_${sIdx}`;
      cadenas.push(
        `[${lastV}][${idx}:v]overlay=0:0:enable='between(t,${Number(meta.inicio).toFixed(
          2
        )},${Number(meta.fin).toFixed(2)})'[${nextV}]`
      );
      lastV = nextV;
      subsQuemados++;
    }

    // Subtítulos automáticos si no venían PNGs: primero con drawtext; si el
    // ffmpeg de este equipo no trae drawtext (pasa con ffmpeg-static en
    // Linux/Vercel), se usa el filtro "subtitles" con un SRT generado; y si
    // tampoco hay fuentes, el video sale igual sin subtítulos quemados.
    const frasesAuto: { texto: string; ini: number; fin: number }[] = [];
    if (subsQuemados === 0) {
      const palabras = limpiarTextoDrawtext(tituloSubAuto).split(" ").filter(Boolean);
      const grupos: string[] = [];
      for (let k = 0; k < palabras.length; k += 4) {
        grupos.push(palabras.slice(k, k + 4).join(" ").toUpperCase());
      }
      if (grupos.length === 0) grupos.push("NO TE PIERDAS ESTO");
      grupos.forEach((frase, idx) => {
        frasesAuto.push({
          texto: frase,
          ini: idx * 4,
          fin: idx === grupos.length - 1 ? 9999 : (idx + 1) * 4,
        });
      });
    }

    const cadenasBase = [...cadenas];
    const lastVBase = lastV;
    const fontSize = Math.round(w * 0.048);
    const yPos = Math.round(h * 0.77);

    const cadenasDrawtext = [...cadenasBase];
    let lastDraw = lastVBase;
    if (frasesAuto.length > 0) {
      const fontPath = obtenerFuenteSistema();
      const fontOpt = fontPath ? `fontfile='${fontPath}':` : "";
      frasesAuto.forEach((f, idx) => {
        const nextV = `vauto_${idx}`;
        cadenasDrawtext.push(
          `[${lastDraw}]drawtext=${fontOpt}text='${f.texto}':fontcolor=white:fontsize=${fontSize}:box=1:boxcolor=black@0.8:boxborderw=14:x=(w-text_w)/2:y=${yPos}:enable='between(t,${f.ini},${f.fin})'[${nextV}]`
        );
        lastDraw = nextV;
      });
    }

    const videoFinal = path.join(tmpDir, "final.mp4");
    const argsEncode = (cadenasUsar: string[], ultimo: string) => [
      ...argsFinal,
      "-filter_complex",
      cadenasUsar.join(";"),
      "-map",
      `[${ultimo}]`,
      "-map",
      "0:a?",
      "-r",
      "60",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "copy",
      "-movflags",
      "+faststart",
      videoFinal,
    ];

    try {
      await execFileAsync(ffmpegPath, argsEncode(cadenasDrawtext, lastDraw), {
        timeout: 300000,
        windowsHide: true,
      });
    } catch (e1: any) {
      const sinDrawtext = String(e1?.stderr || e1?.message || "").includes("No such filter: 'drawtext'");
      if (!sinDrawtext) throw e1;
      // Plan B: subtítulos con archivo ASS (PlayRes = tamaño del video, así
      // el tamaño de letra es exacto en 4K; con SRT el tamaño se escala mal).
      try {
        const aAss = (s: number) => {
          const hh = Math.floor(s / 3600);
          const mm = Math.floor((s % 3600) / 60);
          const ss = (s % 60).toFixed(2).padStart(5, "0");
          return `${hh}:${String(mm).padStart(2, "0")}:${ss}`;
        };
        const ass = [
          "[Script Info]",
          "ScriptType: v4.00+",
          `PlayResX: ${w}`,
          `PlayResY: ${h}`,
          "",
          "[V4+ Styles]",
          "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
          `Style: Default,DejaVu Sans,${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&HCC000000,1,0,0,0,100,100,0,0,3,2,0,2,100,100,${Math.round(h * 0.18)},1`,
          "",
          "[Events]",
          "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
          ...frasesAuto.map(
            (f) => `Dialogue: 0,${aAss(f.ini)},${aAss(Math.min(f.fin, 359999))},Default,,0,0,0,,${f.texto}`
          ),
          "",
        ].join("\n");
        const rutaAss = path.join(tmpDir, "auto.ass");
        await fs.promises.writeFile(rutaAss, ass, "utf8");
        const esc = rutaAss.replace(/\\/g, "/").replace(/:/g, "\\:");
        const cadenasSrt = [
          ...cadenasBase,
          `[${lastVBase}]ass=filename='${esc}'[vsub]`,
        ];
        await execFileAsync(ffmpegPath, argsEncode(cadenasSrt, "vsub"), {
          timeout: 300000,
          windowsHide: true,
        });
      } catch {
        // Plan C: video sin subtítulos automáticos, pero video válido.
        await execFileAsync(ffmpegPath, argsEncode(cadenasBase, lastVBase), {
          timeout: 300000,
          windowsHide: true,
        });
      }
    }

    const finalBuffer = await fs.promises.readFile(videoFinal);

    // V7: en Vercel la carpeta es /tmp/exportados (el código es de solo
    // lectura). Antes el mkdir a process.cwd()/exportados fallaba siempre.
    const exportDir = await asegurarDirExportados().catch(() => null);
    const nombreArchivo = `short-viral-${Date.now()}.mp4`;
    const rutaGuardada = exportDir ? path.join(exportDir, nombreArchivo) : nombreArchivo;
    if (exportDir) {
      await fs.promises.writeFile(rutaGuardada, finalBuffer).catch(() => {});
    }

    return new NextResponse(finalBuffer, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(finalBuffer.byteLength),
        "X-Saved-Path": encodeURIComponent(rutaGuardada),
        "X-Saved-Name": nombreArchivo,
      },
    });
  } catch (err: any) {
    const msg =
      String(err?.stderr || err?.message || "")
        .split("\n")
        .filter((l) => l.includes("ERROR:") || l.includes("Invalid") || l.includes("No such"))
        .pop() ||
      err?.message ||
      "Error en el motor nativo FFmpeg.";
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}