import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { obtenerBinarioYtDlp } from "../../lib/ytdlp";
import { esUrlYouTube, obtenerUrlDirecta } from "../../lib/youtube-js";

const execFileAsync = promisify(execFile);

function obtenerBinarioFfmpeg(): string | null {
  const ffStatic = path.join(
    process.cwd(),
    "node_modules",
    "ffmpeg-static",
    process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
  );
  if (fs.existsSync(ffStatic)) return ffStatic;
  return null;
}

async function limpiarTemporales(tmpDir: string, prefijo: string) {
  const archivos = await fs.promises.readdir(tmpDir).catch(() => []);
  for (const f of archivos.filter((x) => x.startsWith(prefijo))) {
    await fs.promises.unlink(path.join(tmpDir, f)).catch(() => {});
  }
}

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get("url");
  const orig = req.nextUrl.searchParams.get("orig");
  const startParam = req.nextUrl.searchParams.get("start");
  const endParam = req.nextUrl.searchParams.get("end");

  if (!target && !orig) {
    return NextResponse.json({ error: "Falta el parámetro url" }, { status: 400 });
  }

  // 1. MODO PC LOCAL: usar yt-dlp.exe + ffmpeg-static con player_client android,web
  if (!process.env.VERCEL && orig) {
    const idUnico = `clip-src-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const tmpDir = os.tmpdir();
    const plantillaSalida = path.join(tmpDir, `${idUnico}.%(ext)s`);
    const ytDlp = await obtenerBinarioYtDlp();
    const ffmpegPath = obtenerBinarioFfmpeg();

    const startSec = Number(startParam);
    const endSec = Number(endParam);
    const tieneRango = !Number.isNaN(startSec) && !Number.isNaN(endSec) && endSec > startSec;

    const baseArgs: string[] = [
      "--no-playlist",
      "--no-warnings",
      "--no-check-certificates",
      "--extractor-args",
      "youtube:player_client=android,web",
      "-f",
      "bv*[height<=2160][ext=mp4]+ba[ext=m4a]/b[height<=2160][ext=mp4]/bv*[height<=2160]+ba/b[height<=2160]/b",
      "--merge-output-format",
      "mp4",
    ];

    if (ffmpegPath) {
      baseArgs.push("--ffmpeg-location", ffmpegPath);
    }

    // Intento A: descarga por sección exacta
    try {
      const argsSeccion = [...baseArgs];
      if (tieneRango) {
        argsSeccion.push(
          "--download-sections",
          `*${startSec}-${endSec}`,
          "--force-keyframes-at-cuts"
        );
      }
      argsSeccion.push("-o", plantillaSalida, orig);

      await execFileAsync(ytDlp, argsSeccion, { timeout: 90000, windowsHide: true });

      const archivos = await fs.promises.readdir(tmpDir);
      const encontrado = archivos.find((f) => f.startsWith(idUnico) && !f.endsWith(".part"));
      if (encontrado) {
        const rutaCompleta = path.join(tmpDir, encontrado);
        const buffer = await fs.promises.readFile(rutaCompleta);
        await limpiarTemporales(tmpDir, idUnico);

        if (buffer.byteLength > 2048) {
          return new NextResponse(buffer, {
            status: 200,
            headers: {
              "Content-Type": "video/mp4",
              "Content-Length": String(buffer.byteLength),
              "Access-Control-Allow-Origin": "*",
            },
          });
        }
      }
    } catch {
      await limpiarTemporales(tmpDir, idUnico);
    }

    // Intento B (respaldo local): descargar video en 720p y recortar con ffmpeg-static
    try {
      const rutaFull = path.join(tmpDir, `${idUnico}_full.mp4`);
      const rutaCut = path.join(tmpDir, `${idUnico}_cut.mp4`);

      await execFileAsync(ytDlp, [...baseArgs, "-o", rutaFull, orig], {
        timeout: 120000,
        windowsHide: true,
      });

      if (fs.existsSync(rutaFull)) {
        let archivoFinal = rutaFull;
        if (tieneRango && ffmpegPath) {
          const dur = Math.max(1, endSec - startSec);
          await execFileAsync(
            ffmpegPath,
            [
              "-y",
              "-ss",
              String(startSec),
              "-i",
              rutaFull,
              "-t",
              String(dur),
              "-c:v",
              "libx264",
              "-preset",
              "ultrafast",
              "-crf",
              "24",
              "-c:a",
              "aac",
              "-b:a",
              "128k",
              rutaCut,
            ],
            { timeout: 60000, windowsHide: true }
          );
          if (fs.existsSync(rutaCut)) archivoFinal = rutaCut;
        }

        const buffer = await fs.promises.readFile(archivoFinal);
        await limpiarTemporales(tmpDir, idUnico);

        if (buffer.byteLength > 2048) {
          return new NextResponse(buffer, {
            status: 200,
            headers: {
              "Content-Type": "video/mp4",
              "Content-Length": String(buffer.byteLength),
              "Access-Control-Allow-Origin": "*",
            },
          });
        }
      }
    } catch (err: any) {
      await limpiarTemporales(tmpDir, idUnico);
      const detalle = String(err?.stderr || err?.message || "")
        .split("\n")
        .filter((l) => l.includes("ERROR:"))
        .pop();
      if (!target) {
        return NextResponse.json(
          { error: detalle || "yt-dlp no pudo extraer este video. Revisa tu conexión o coloca yt-dlp.exe junto a package.json." },
          { status: 502 }
        );
      }
    }
  }

  // 2. MODO NUBE (Vercel) o enlaces directos (TikTok / CDN)
  let urlDirecta = target;

  if (!urlDirecta && orig) {
    // YouTube sin Python: primero la URL directa de ytdl-core (JS puro).
    if (esUrlYouTube(orig)) {
      try {
        urlDirecta = await obtenerUrlDirecta(orig);
      } catch {
        // Caer a Cobalt
      }
    }
  }

  if (!urlDirecta && orig) {
    const cobaltEndpoints = [
      "https://cobalt-api.meowing.de/",
      "https://cobalt-api.kwiatekmiki.com/",
      "https://api.cobalt.tools/",
    ];
    for (const ep of cobaltEndpoints) {
      try {
        const cRes = await fetch(ep, {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ url: orig, videoQuality: "720" }),
          signal: AbortSignal.timeout(8000),
        });
        if (cRes.ok) {
          const cData = await cRes.json();
          if (cData?.url) {
            urlDirecta = cData.url;
            break;
          }
        }
      } catch {
        // Siguiente espejo
      }
    }
  }

  if (urlDirecta) {
    try {
      const upstream = await fetch(urlDirecta, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
          Accept: "*/*",
        },
        redirect: "follow",
      });

      if (upstream.ok && upstream.body) {
        const headers = new Headers();
        headers.set("Content-Type", upstream.headers.get("Content-Type") || "video/mp4");
        const len = upstream.headers.get("Content-Length");
        if (len) headers.set("Content-Length", len);
        headers.set("Access-Control-Allow-Origin", "*");
        return new NextResponse(upstream.body, { status: 200, headers });
      }
    } catch {
      // Continuar al error
    }
  }

  return NextResponse.json(
    {
      error:
        "No se pudo descargar desde el servidor. Verifica el enlace o usa el contenedor local.",
    },
    { status: 502 }
  );
}