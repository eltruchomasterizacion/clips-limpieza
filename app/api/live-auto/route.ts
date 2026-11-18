import { NextRequest, NextResponse } from "next/server";
import { spawn, ChildProcess, execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { obtenerBinarioYtDlpLocal } from "../../lib/ytdlp";
import { esEntornoVercel, obtenerInfoVideo } from "../../lib/youtube-js";
import { asegurarDirExportados, dirExportados } from "../../lib/ruta-exportados";
import { convertirSegmentoA916 } from "../../lib/corte-916";
import { energiaMediaArchivo } from "../../lib/mejores-momentos";
import { normalizarEnergia } from "../../lib/puntuacion-momentos";

const execFileAsync = promisify(execFile);

interface ClipLiveCreado {
  numero: number;
  archivo: string;
  duracion: number;
  hora: string;
  puntaje?: number;
  motivo?: string;
}

interface TrabajoLive {
  id: string;
  activo: boolean;
  url: string;
  streamUrl?: string | null;
  duracionClip: number;
  objetivoClips: number | "ilimitado";
  clipsGenerados: number;
  clipsLista: ClipLiveCreado[];
  ultimoArchivo: string;
  error: string;
  ytProc?: ChildProcess;
  ffProc?: ChildProcess;
  timer?: NodeJS.Timeout;
  tmpDir: string;
}

const globalStore = globalThis as unknown as {
  __clipsLiveJobs?: Map<string, TrabajoLive>;
};
if (!globalStore.__clipsLiveJobs) {
  globalStore.__clipsLiveJobs = new Map<string, TrabajoLive>();
}
const trabajos = globalStore.__clipsLiveJobs;

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

async function borrarClipsEnVivoDeDisco() {
  const exportDir = dirExportados();
  if (!fs.existsSync(exportDir)) return;
  const archivos = await fs.promises.readdir(exportDir);
  for (const f of archivos) {
    if ((f.startsWith("stream-clip-") || f.startsWith("live-clip-")) && f.endsWith(".mp4")) {
      await fs.promises.unlink(path.join(exportDir, f)).catch(() => {});
    }
  }
}

function matarProcesos(job: TrabajoLive) {
  if (job.ytProc && !job.ytProc.killed) {
    try {
      job.ytProc.kill("SIGTERM");
    } catch {
      // Ignorar
    }
  }
  if (job.ffProc && !job.ffProc.killed) {
    try {
      job.ffProc.kill("SIGTERM");
    } catch {
      // Ignorar
    }
  }
}

function detenerTrabajo(job: TrabajoLive) {
  job.activo = false;
  if (job.timer) clearInterval(job.timer);
  matarProcesos(job);
}

export async function GET(req: NextRequest) {
  const fileParam = req.nextUrl.searchParams.get("file");
  if (fileParam) {
    const seguro = path.basename(fileParam);
    const ruta = dirExportados(seguro);
    if (!fs.existsSync(ruta)) {
      return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
    }
    const data = await fs.promises.readFile(ruta);
    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(data.length),
      },
    });
  }

  const jobId = req.nextUrl.searchParams.get("jobId") || "";
  if (jobId) {
    const job = trabajos.get(jobId);
    if (!job) {
      return NextResponse.json({
        ok: true,
        activo: false,
        clipsGenerados: 0,
        clipsLista: [],
      });
    }

    return NextResponse.json({
      ok: true,
      jobId: job.id,
      activo: job.activo,
      clipsGenerados: job.clipsGenerados,
      clipsLista: job.clipsLista,
      objetivoClips: job.objetivoClips,
      ultimoArchivo: job.ultimoArchivo,
      error: job.error,
    });
  }

  for (const [, j] of trabajos) {
    if (j.activo) {
      return NextResponse.json({
        ok: true,
        jobId: j.id,
        activo: true,
        clipsGenerados: j.clipsGenerados,
        clipsLista: j.clipsLista,
        objetivoClips: j.objetivoClips,
        ultimoArchivo: j.ultimoArchivo,
        error: j.error,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    activo: false,
    clipsGenerados: 0,
    clipsLista: [],
  });
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const tmpDir = path.join(os.tmpdir(), `live-chunk-${Date.now()}`);
    await fs.promises.mkdir(tmpDir, { recursive: true });
    try {
      const form = await req.formData();
      const chunkFile = form.get("chunk");
      const encuadre = String(form.get("encuadre") || "blur");
      const marca = String(form.get("marca") || "@TuMarca");
      const numeroClip = Number(form.get("numeroClip") || 1);

      if (!(chunkFile instanceof File) || chunkFile.size === 0) {
        return NextResponse.json({ error: "Segmento vacío." }, { status: 400 });
      }

      const rawPath = path.join(tmpDir, "raw.webm");
      await fs.promises.writeFile(rawPath, Buffer.from(await chunkFile.arrayBuffer()));

      const exportDir = await asegurarDirExportados();
      const nombreSalida = `live-clip-${String(numeroClip).padStart(4, "0")}-${Date.now()}.mp4`;
      const rutaSalida = path.join(exportDir, nombreSalida);

      await convertirSegmentoA916(
        obtenerBinarioFfmpeg(),
        rawPath,
        rutaSalida,
        encuadre,
        marca
      );

      return NextResponse.json({
        ok: true,
        nombreArchivo: nombreSalida,
        rutaGuardada: rutaSalida,
      });
    } catch (e: any) {
      return NextResponse.json(
        { error: e?.message || "Error guardando clip en vivo." },
        { status: 500 }
      );
    } finally {
      await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  const body = await req.json();
  const action = String(body?.action || "start");

  if (action === "clear") {
    for (const [, viejo] of trabajos) {
      detenerTrabajo(viejo);
    }
    trabajos.clear();
    await borrarClipsEnVivoDeDisco();
    return NextResponse.json({
      ok: true,
      activo: false,
      clipsGenerados: 0,
      clipsLista: [],
    });
  }

  if (action === "stop") {
    const jobId = String(body?.jobId || "");
    const job = trabajos.get(jobId);
    if (job) detenerTrabajo(job);
    return NextResponse.json({
      ok: true,
      activo: false,
      clipsGenerados: job?.clipsGenerados || 0,
      clipsLista: job?.clipsLista || [],
    });
  }

  for (const [, viejo] of trabajos) {
    if (viejo.activo) detenerTrabajo(viejo);
  }

  const url = String(body?.url || "").trim();
  const streamUrlDirecto = body?.streamUrl ? String(body.streamUrl).trim() : null;
  const duracionClip = Math.min(300, Math.max(5, Number(body?.duracionClip) || 30));
  const cantRaw = body?.cantidadClips;
  const numCant = Number(cantRaw);
  const objetivoClips: number | "ilimitado" =
    cantRaw === "ilimitado" || numCant >= 100 ? "ilimitado" : Math.max(1, numCant || 10);
  const encuadre = String(body?.encuadre || "blur");
  const marca = String(body?.marca || "@TuMarca");

  if (!url && !streamUrlDirecto) {
    return NextResponse.json({ error: "Pega primero el enlace del directo en vivo." }, { status: 400 });
  }

  const jobId = `live-${Date.now()}`;
  const tmpDir = path.join(os.tmpdir(), jobId);
  try {
    await fs.promises.mkdir(tmpDir, { recursive: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: `No se pudo preparar la carpeta temporal en este servidor: ${e?.message || "error de disco"}` },
      { status: 500 }
    );
  }

  // V7: en Vercel la carpeta es /tmp/exportados (el código es de solo
  // lectura). Antes era process.cwd()/exportados y el mkdir devolvía 500
  // siempre en Vercel (ENOENT /var/task/exportados).
  let exportDir: string;
  try {
    exportDir = await asegurarDirExportados();
  } catch (e: any) {
    return NextResponse.json(
      {
        error: `No se pudo crear la carpeta de clips en este servidor: ${e?.message || "error de disco"}. En Vercel solo se puede escribir en /tmp.`,
      },
      { status: 500 }
    );
  }

  const job: TrabajoLive = {
    id: jobId,
    activo: true,
    url,
    streamUrl: streamUrlDirecto,
    duracionClip,
    objetivoClips,
    clipsGenerados: 0,
    clipsLista: [],
    ultimoArchivo: "",
    error: "",
    tmpDir,
  };
  trabajos.set(jobId, job);

  const ffmpegPath = obtenerBinarioFfmpeg();
  const procesados = new Set<string>();
  let rondaConexion = 0;
  let usarCookiesBrave = true;

  const lanzarTuberiasEnVivo = async () => {
    if (!job.activo) return;
    rondaConexion += 1;
    const patronSegmentos = path.join(tmpDir, `r${rondaConexion}_part_%05d.mp4`);

    // Sin Python en Vercel: resolver la URL del directo con JavaScript puro
    // (ytdl-core). Para un directo de YouTube da el manifiesto HLS, que
    // ffmpeg-static lee directamente sin yt-dlp.
    if (!job.streamUrl && url) {
      try {
        const info = await obtenerInfoVideo(url);
        if (info.isLive && info.streamUrl) job.streamUrl = info.streamUrl;
      } catch {
        // Sin URL del directo: abajo se decide según el entorno.
      }
      if (!job.activo) return;
    }

    // Con URL de stream (HLS/.m3u8/.flv/mp4): ffmpeg directo, sin yt-dlp.
    if (job.streamUrl) {
      const ffDirect = spawn(
        ffmpegPath,
        [
          "-y",
          "-user_agent",
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          "-reconnect",
          "1",
          "-reconnect_streamed",
          "1",
          "-reconnect_delay_max",
          "5",
          "-i",
          job.streamUrl,
          "-c",
          "copy",
          "-f",
          "segment",
          "-segment_time",
          String(duracionClip),
          "-reset_timestamps",
          "1",
          patronSegmentos,
        ],
        { windowsHide: true }
      );
      job.ffProc = ffDirect;
      ffDirect.on("close", () => {
        if (job.activo) {
          if (job.objetivoClips === "ilimitado" || job.clipsGenerados < job.objetivoClips) {
            setTimeout(() => lanzarTuberiasEnVivo(), 2500);
          } else {
            detenerTrabajo(job);
          }
        }
      });
      return;
    }

    // Sin URL de stream: en Vercel NO hay yt-dlp (sin Python). Solo local.
    if (esEntornoVercel()) {
      job.error =
        "En Vercel los directos necesitan la URL del stream (HLS/.m3u8) o un directo de YouTube público. Usa el contenedor local para otros directos.";
      detenerTrabajo(job);
      return;
    }
    const ytDlp = await obtenerBinarioYtDlpLocal();
    if (!job.activo) return;

    let canalOffline = false;
    let errorCookies = false;

    const ytArgs = [
      ...(usarCookiesBrave ? ["--cookies-from-browser", "brave"] : []),
      "--no-playlist",
      "--no-warnings",
      "--no-check-certificates",
      "--extractor-args",
      "youtube:player_client=android,web",
      "-f",
      "best[height<=2160]/best",
      "-o",
      "-",
      url,
    ];

    const ytProc = spawn(ytDlp, ytArgs, { windowsHide: true });

    const ffProc = spawn(
      ffmpegPath,
      [
        "-y",
        "-i",
        "pipe:0",
        "-c",
        "copy",
        "-f",
        "segment",
        "-segment_time",
        String(duracionClip),
        "-reset_timestamps",
        "1",
        patronSegmentos,
      ],
      { windowsHide: true }
    );

    job.ytProc = ytProc;
    job.ffProc = ffProc;

    ytProc.stderr.on("data", (chunk) => {
      const txt = String(chunk || "").toLowerCase();
      if (txt.includes("not currently live")) {
        canalOffline = true;
        job.error =
          "Este canal no está transmitiendo en vivo ahora mismo (o terminó su directo).";
      } else if (txt.includes("could not copy") || txt.includes("cookie")) {
        errorCookies = true;
      }
    });

    ytProc.stdout.on("error", () => {});
    ffProc.stdin.on("error", () => {});
    ytProc.stdout.pipe(ffProc.stdin);

    ffProc.on("close", () => {
      if (canalOffline) {
        detenerTrabajo(job);
        return;
      }
      if (errorCookies && usarCookiesBrave) {
        usarCookiesBrave = false;
        setTimeout(() => lanzarTuberiasEnVivo(), 500);
        return;
      }
      if (job.activo) {
        if (job.objetivoClips === "ilimitado" || job.clipsGenerados < job.objetivoClips) {
          setTimeout(() => lanzarTuberiasEnVivo(), 2500);
        } else {
          detenerTrabajo(job);
        }
      }
    });
  };

  lanzarTuberiasEnVivo();

  let procesandoAhora = false;
  job.timer = setInterval(async () => {
    if (!job.activo || procesandoAhora) return;
    try {
      const archivos = (await fs.promises.readdir(tmpDir))
        .filter((f) => f.includes("_part_") && f.endsWith(".mp4"))
        .sort();

      const listos = archivos.slice(0, -1).filter((f) => !procesados.has(f));
      if (listos.length === 0) return;

      procesandoAhora = true;
      for (const f of listos) {
        if (!job.activo) break;
        if (job.objetivoClips !== "ilimitado" && job.clipsGenerados >= job.objetivoClips) {
          detenerTrabajo(job);
          break;
        }

        procesados.add(f);
        const rutaRaw = path.join(tmpDir, f);
        const stat = await fs.promises.stat(rutaRaw).catch(() => null);
        if (!stat || stat.size < 10000) {
          await fs.promises.unlink(rutaRaw).catch(() => {});
          continue;
        }

        const num = job.clipsGenerados + 1;
        const nombreFinal = `stream-clip-${String(num).padStart(4, "0")}-${Date.now()}.mp4`;
        const rutaFinal = path.join(exportDir, nombreFinal);

        // EN VIVO: puntuar el clip con su audio real (RMS) ANTES de
        // guardarlo, para que la lista "solo mejores" funcione sin tener
        // que pulsar "Ordenar" y sin depender del navegador.
        let puntajeClip: number | undefined;
        let motivoClip: string | undefined;
        try {
          const mediaDb = await energiaMediaArchivo(ffmpegPath, rutaRaw, duracionClip);
          if (mediaDb !== null) {
            puntajeClip = Math.round(100 * normalizarEnergia(mediaDb));
            motivoClip =
              puntajeClip >= 70
                ? "🔊 Pico de audio"
                : puntajeClip >= 55
                  ? "🔊 Audio activo"
                  : "🔇 Casi sin audio";
          }
        } catch {
          // Sin puntaje, el clip se guarda igual.
        }

        await convertirSegmentoA916(ffmpegPath, rutaRaw, rutaFinal, encuadre, marca);
        await fs.promises.unlink(rutaRaw).catch(() => {});

        const horaActual = new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });

        job.clipsGenerados = num;
        job.ultimoArchivo = nombreFinal;
        job.clipsLista.unshift({
          numero: num,
          archivo: nombreFinal,
          duracion: duracionClip,
          hora: horaActual,
          puntaje: puntajeClip,
          motivo: motivoClip,
        });

        if (job.objetivoClips !== "ilimitado" && job.clipsGenerados >= job.objetivoClips) {
          detenerTrabajo(job);
          break;
        }
      }
    } catch (err: any) {
      job.error = err?.message || "Error procesando clip en vivo.";
    } finally {
      procesandoAhora = false;
    }
  }, 2000);

  return NextResponse.json({
    ok: true,
    jobId,
    activo: true,
    objetivoClips,
  });
}
