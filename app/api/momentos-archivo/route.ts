// Mejores momentos de un archivo subido: mismo analizador real que /api/extract
// (energía de audio por segundo + movimiento), sin puntajes inventados.
// Lo usa el editor cuando el navegador no puede decodificar el audio.
import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { analizarMejoresMomentos } from "../../lib/mejores-momentos";
import { obtenerBinarioFfmpeg } from "../../lib/ytdlp";

const execFileAsync = promisify(execFile);

async function duracionDeArchivo(ruta: string): Promise<number> {
  try {
    const { stderr } = await execFileAsync(obtenerBinarioFfmpeg(), ["-i", ruta], {
      timeout: 15000,
    }).catch((e: any) => e);
    const m = String(stderr || "").match(/Duration: (\d+):(\d+):([\d.]+)/);
    if (!m) return 0;
    return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  } catch {
    return 0;
  }
}

export async function POST(req: NextRequest) {
  let tmpPath: string | null = null;
  try {
    const form = await req.formData();
    const file = form.get("video");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Sube un archivo de video." }, { status: 400 });
    }
    const durClip = Math.min(300, Math.max(3, Number(form.get("duracionClip")) || 15));
    const cantidadRaw = form.get("cantidadClips");
    const cantidad: number | "ilimitado" =
      cantidadRaw === "ilimitado" ? "ilimitado" : Math.max(1, Number(cantidadRaw) || 6);

    const buf = Buffer.from(await file.arrayBuffer());
    tmpPath = path.join(os.tmpdir(), `momentos-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`);
    await fs.promises.writeFile(tmpPath, buf);

    // Duración del archivo con ffmpeg -i (ffmpeg-static no trae ffprobe).
    const duracionTotal = await duracionDeArchivo(tmpPath);
    if (duracionTotal <= 0) {
      return NextResponse.json(
        { error: "No se pudo leer la duración de este archivo." },
        { status: 400 }
      );
    }

    const analisis = await analizarMejoresMomentos({
      audioUrl: tmpPath,
      videoUrl: tmpPath,
      duracionTotal,
      durClip,
      cantidad,
    });

    return NextResponse.json({
      ok: true,
      momentos: analisis.momentos,
      tramosIgnorados: analisis.tramosIgnorados,
      tramosAnalizados: analisis.tramosAnalizados,
      analisisNota: analisis.aviso,
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo analizar el audio de este archivo." },
      { status: 500 }
    );
  } finally {
    if (tmpPath) await fs.promises.unlink(tmpPath).catch(() => {});
  }
}
