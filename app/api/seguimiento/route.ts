import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { obtenerBinarioFfmpeg } from "../../lib/audio-servidor";
import { asegurarDirExportados } from "../../lib/ruta-exportados";

const execFileAsync = promisify(execFile);

interface Punto {
  t: number;
  x: number;
  y: number;
}

const num = (v: number) => (Number.isFinite(v) ? v.toFixed(4) : "0");

/** Interpolación lineal entre puntos como suma plana (sin ifs anidados). */
function expresionLineal(puntos: Punto[], campo: "x" | "y"): string {
  let expr = num(puntos[0][campo]);
  for (let i = 0; i < puntos.length - 1; i++) {
    const d = puntos[i + 1].t - puntos[i].t;
    const dv = puntos[i + 1][campo] - puntos[i][campo];
    if (d <= 0.001 || Math.abs(dv) < 0.0001) continue;
    expr += `+(${num(dv)})*clip((t-${num(puntos[i].t)})/${num(d)},0,1)`;
  }
  return expr;
}

function limpiarPuntos(crudo: unknown): Punto[] {
  if (!Array.isArray(crudo)) return [];
  let pts: Punto[] = crudo
    .map((p: any) => ({
      t: Number(p?.t),
      x: Math.min(1, Math.max(0, Number(p?.x))),
      y: Math.min(1, Math.max(0, Number(p?.y))),
    }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.x) && Number.isFinite(p.y) && p.t >= 0)
    .sort((a, b) => a.t - b.t);

  const unicos: Punto[] = [];
  for (const p of pts) {
    if (unicos.length === 0 || p.t - unicos[unicos.length - 1].t > 0.001) unicos.push(p);
  }
  pts = unicos;

  if (pts.length > 150) {
    const k = Math.ceil(pts.length / 150);
    const red = pts.filter((_, i) => i % k === 0);
    if (red[red.length - 1] !== pts[pts.length - 1]) red.push(pts[pts.length - 1]);
    pts = red;
  }
  return pts;
}

export async function POST(req: NextRequest) {
  const tmp = path.join(os.tmpdir(), `seguimiento-${Date.now()}`);
  await fs.promises.mkdir(tmp, { recursive: true });

  try {
    const form = await req.formData();
    const video = form.get("video");
    if (!(video instanceof File) || video.size === 0) {
      return NextResponse.json({ error: "Falta el video." }, { status: 400 });
    }

    let crudo: unknown = [];
    try {
      crudo = JSON.parse(String(form.get("puntos") || "[]"));
    } catch {
      // Ignorar
    }
    const puntos = limpiarPuntos(crudo);
    if (puntos.length < 2) {
      return NextResponse.json({ error: "Faltan los puntos de la cámara. Analiza primero." }, { status: 400 });
    }

    const inicio = Math.max(0, Number(form.get("inicio")) || 0);
    const duracion = Math.min(300, Math.max(2, Number(form.get("duracion")) || 30));
    const zoom = Math.min(2.5, Math.max(1, Number(form.get("zoom")) || 1));

    const ext = (path.extname(video.name || "") || ".mp4").replace(/[^.a-zA-Z0-9]/g, "") || ".mp4";
    const entrada = path.join(tmp, `entrada${ext}`);
    await fs.promises.writeFile(entrada, Buffer.from(await video.arrayBuffer()));

    // V7: en Vercel la carpeta es /tmp/exportados/seguimiento (el código
    // es de solo lectura). Antes era process.cwd()/exportados y fallaba.
    const exportDir = await asegurarDirExportados("seguimiento");
    const salida = path.join(exportDir, `seguimiento-${Date.now()}.mp4`);

    const cx = expresionLineal(puntos, "x");
    const cy = expresionLineal(puntos, "y");
    const z = zoom.toFixed(3);

    const vf =
      `crop=w='min(in_w,trunc(in_h/${z}*9/16/2)*2)':h='trunc(in_h/${z}/2)*2':` +
      `x='clip((${cx})*in_w-out_w/2,0,in_w-out_w)':` +
      `y='clip((${cy})*in_h-out_h/2,0,in_h-out_h)',` +
      `scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920,setsar=1,fps=30`;

    await execFileAsync(
      obtenerBinarioFfmpeg(),
      [
        "-y",
        "-ss",
        String(inicio),
        "-i",
        entrada,
        "-t",
        String(duracion),
        "-vf",
        vf,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "22",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-movflags",
        "+faststart",
        salida,
      ],
      { timeout: 600000, windowsHide: true, maxBuffer: 1024 * 1024 * 20 }
    );

    const buf = await fs.promises.readFile(salida);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(buf.length),
        "X-Saved-Path": encodeURIComponent(salida),
      },
    });
  } catch (e: any) {
    const detalle = String(e?.stderr || e?.message || "")
      .split("\n")
      .filter(Boolean)
      .slice(-5)
      .join(" ")
      .slice(-500);
    return NextResponse.json(
      { error: `No se pudo generar el video: ${detalle || "error desconocido"}` },
      { status: 500 }
    );
  } finally {
    await fs.promises.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}