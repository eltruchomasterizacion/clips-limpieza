import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { obtenerBinarioYtDlpLocal } from "../../lib/ytdlp";
import { esEntornoVercel, obtenerUrlAudio } from "../../lib/youtube-js";
import { dirCache } from "../../lib/ruta-exportados";

const execFileAsync = promisify(execFile);

let whisperPipelinePromise: Promise<any> | null = null;

function obtenerBinarioFfmpeg(): string {
  const ffStatic = path.join(
    process.cwd(),
    "node_modules",
    "ffmpeg-static",
    process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
  );
  if (fs.existsSync(ffStatic)) return ffStatic;
  return "ffmpeg";
}

async function obtenerWhisperLocal() {
  if (!whisperPipelinePromise) {
    whisperPipelinePromise = (async () => {
      const transformers = await import("@huggingface/transformers");
      // V7: en Vercel el caché va a /tmp (el código es de solo lectura).
      transformers.env.cacheDir = dirCache(".whisper-cache");
      return await transformers.pipeline(
        "automatic-speech-recognition",
        "onnx-community/whisper-base",
        { dtype: "q8" }
      );
    })();
  }
  return whisperPipelinePromise;
}

function leerWav16kMono(wavPath: string): Float32Array {
  const buf = fs.readFileSync(wavPath);
  // Buscar el bloque "data" en el encabezado WAV
  let offset = 12;
  while (offset + 8 < buf.length) {
    const chunkId = buf.toString("ascii", offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    if (chunkId === "data") {
      offset += 8;
      const numSamples = Math.floor(Math.min(chunkSize, buf.length - offset) / 2);
      const float32 = new Float32Array(numSamples);
      for (let i = 0; i < numSamples; i++) {
        float32[i] = buf.readInt16LE(offset + i * 2) / 32768;
      }
      return float32;
    }
    offset += 8 + chunkSize;
  }
  return new Float32Array(0);
}

function dividirEnFrasesCortas(
  chunks: { timestamp?: [number, number | null]; text?: string }[],
  textoCompleto: string
) {
  const resultado: { id: string; inicio: number; fin: number; texto: string }[] = [];

  if (Array.isArray(chunks) && chunks.length > 0) {
    for (const c of chunks) {
      const txt = String(c.text || "").trim();
      if (!txt) continue;
      const ini = Number(c.timestamp?.[0] ?? 0);
      const fin = Number(c.timestamp?.[1] ?? ini + 3);
      const palabras = txt.split(/\s+/).filter(Boolean);

      if (palabras.length <= 5) {
        resultado.push({
          id: `sub-${resultado.length}-${Date.now()}`,
          inicio: Number(ini.toFixed(2)),
          fin: Number(Math.max(ini + 0.8, fin).toFixed(2)),
          texto: txt,
        });
      } else {
        const grupos: string[] = [];
        for (let i = 0; i < palabras.length; i += 4) {
          grupos.push(palabras.slice(i, i + 4).join(" "));
        }
        const durTotal = Math.max(1, fin - ini);
        const paso = durTotal / grupos.length;
        grupos.forEach((g, idx) => {
          resultado.push({
            id: `sub-${resultado.length}-${Date.now()}`,
            inicio: Number((ini + idx * paso).toFixed(2)),
            fin: Number((ini + (idx + 1) * paso).toFixed(2)),
            texto: g,
          });
        });
      }
    }
  } else if (textoCompleto.trim()) {
    const palabras = textoCompleto.trim().split(/\s+/).filter(Boolean);
    for (let i = 0; i < palabras.length; i += 4) {
      const idx = resultado.length;
      resultado.push({
        id: `sub-${idx}-${Date.now()}`,
        inicio: idx * 2.5,
        fin: (idx + 1) * 2.5,
        texto: palabras.slice(i, i + 4).join(" "),
      });
    }
  }

  return resultado;
}

export async function POST(req: NextRequest) {
  const tmpDir = path.join(os.tmpdir(), `transcribe-${Date.now()}`);
  await fs.promises.mkdir(tmpDir, { recursive: true });

  try {
    const form = await req.formData();
    const videoFile = form.get("video");
    const originalUrl = String(form.get("originalUrl") || "").trim();
    const inicio = Math.max(0, Number(form.get("inicio") || 0));
    const duracion = Math.min(300, Math.max(3, Number(form.get("duracion") || 60)));

    const ffmpegPath = obtenerBinarioFfmpeg();
    const rutaVideo = path.join(tmpDir, "fuente.mp4");
    const rutaWav = path.join(tmpDir, "audio16k.wav");
    let wavListo = false;

    if (videoFile instanceof File && videoFile.size > 0) {
      await fs.promises.writeFile(rutaVideo, Buffer.from(await videoFile.arrayBuffer()));
    } else if (originalUrl) {
      // 1. Audio directo con JavaScript puro (ytdl-core): ffmpeg-static lee
      // la URL de googlevideo.com sin Python — funciona en Vercel.
      const urlAudioJs = await obtenerUrlAudio(originalUrl);
      if (urlAudioJs) {
        try {
          await execFileAsync(
            ffmpegPath,
            [
              "-y",
              "-ss",
              String(inicio),
              "-i",
              urlAudioJs,
              "-t",
              String(duracion),
              "-vn",
              "-acodec",
              "pcm_s16le",
              "-ar",
              "16000",
              "-ac",
              "1",
              rutaWav,
            ],
            { timeout: 90000, windowsHide: true }
          );
          wavListo = true;
        } catch {
          // Respaldo local con yt-dlp (abajo).
        }
      }
      // 2. Respaldo LOCAL con yt-dlp (nunca en Vercel).
      if (!wavListo) {
        if (esEntornoVercel()) {
          return NextResponse.json(
            {
              error:
                "No se pudo obtener el audio de este enlace en la nube. Prueba con otro enlace o usa el contenedor local.",
            },
            { status: 502 }
          );
        }
        const ytDlp = await obtenerBinarioYtDlpLocal();
        await execFileAsync(
          ytDlp,
          [
            "--no-playlist",
            "--no-warnings",
            "--no-check-certificates",
            "--extractor-args",
            "youtube:player_client=android,web",
            "-f",
            "ba[ext=m4a]/ba/b",
            "-o",
            rutaVideo,
            originalUrl,
          ],
          { timeout: 120000, windowsHide: true }
        );
      }
    } else {
      return NextResponse.json(
        { error: "Envía un video o enlace para transcribir los subtítulos." },
        { status: 400 }
      );
    }

    // Convertir pista de audio a WAV PCM 16kHz mono con FFmpeg nativo
    // (solo si el audio no se extrajo ya directo desde la URL).
    if (!wavListo) {
      await execFileAsync(
        ffmpegPath,
        [
          "-y",
          "-ss",
          String(inicio),
          "-i",
          rutaVideo,
          "-t",
          String(duracion),
          "-vn",
          "-acodec",
          "pcm_s16le",
          "-ar",
          "16000",
          "-ac",
          "1",
          rutaWav,
        ],
        { timeout: 90000, windowsHide: true }
      );
    }

    const audio16k = leerWav16kMono(rutaWav);
    if (audio16k.length < 1600) {
      return NextResponse.json({
        ok: true,
        subtitulos: [],
        aviso: "El video no tiene pista de voz detectable.",
      });
    }

    const transcriber = await obtenerWhisperLocal();
    const salida = await transcriber(audio16k, {
      language: "spanish",
      task: "transcribe",
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: true,
    });

    const subtitulos = dividirEnFrasesCortas(
      salida?.chunks || [],
      String(salida?.text || "")
    );

    return NextResponse.json({
      ok: true,
      subtitulos,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "No se pudo transcribir el audio." },
      { status: 500 }
    );
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}