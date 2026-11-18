// Corta un momento EN VIVO con LA REFERENCIA original: el mismo corte
// 9:16 en 4K a 60fps con fondo difuminado que usa el auto-corte en vivo
// (app/lib/corte-916.ts). El momento viene de la ventana guardada por
// /api/momentos-en-vivo (ventanaId); sus tiempos son relativos a esa
// ventana, no al inicio del directo.
//
// COMPATIBILIDAD CON EL CÓDIGO DE ENTRADA: `codigo` se acepta si viene,
// pero no es obligatorio (el editor es gratis).
// Límite honesto: la ventana vive en /tmp del servidor. En local dura lo
// que dure el servidor; en Vercel puede no estar si la petición cae en
// otra instancia — en ese caso se devuelve 410 y la pantalla dice que
// use los clips del auto-corte, que sí están guardados en disco.
import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { obtenerBinarioFfmpeg } from "../../lib/ytdlp";
import { convertirSegmentoA916 } from "../../lib/corte-916";
import { rutaVentanaEnVivo } from "../../lib/momentos-en-vivo";
import { asegurarDirExportados } from "../../lib/ruta-exportados";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    // `codigo` (código de entrada) se acepta si viene, pero no es obligatorio.
    const ventanaId = String(body?.ventanaId || "").trim();
    const inicio = Math.max(0, Number(body?.inicio) || 0);
    const fin = Number(body?.fin) || 0;
    const encuadre = String(body?.encuadre || "blur");
    const marca = String(body?.marca || "@TuMarca");
    if (!ventanaId || fin <= inicio) {
      return NextResponse.json(
        { ok: false, error: "Falta la ventana o el tramo del momento." },
        { status: 400 }
      );
    }
    const rutaVentana = rutaVentanaEnVivo(ventanaId);
    if (!rutaVentana) {
      return NextResponse.json(
        {
          ok: false,
          ventanaExpirada: true,
          error:
            "Esa ventana en vivo ya pasó y no está guardada en este servidor. Usa los clips del auto-corte (abajo, ya puntuados) y llévalos al Editor 9:16.",
        },
        { status: 410 }
      );
    }

    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);

    // Cortar con LA REFERENCIA (4K 60fps, fondo difuminado). OJO: el
    // ffmpeg-static del proyecto hace segfault leyendo .ts en Linux, así
    // que si ese falla se intenta el ffmpeg del sistema (en el PC local
    // sí existe); en Vercel no hay ninguno de los dos para .ts y se dice
    // claro que use los clips del auto-corte.
    const binarios = [obtenerBinarioFfmpeg(), "ffmpeg"];
    for (const binario of binarios) {
      const tmpDir = path.join(os.tmpdir(), `corte-vivo-${Date.now()}`);
      try {
        await fs.promises.mkdir(tmpDir, { recursive: true });
        const rutaRecorte = path.join(tmpDir, "recorte.mp4");
        // Recortar el tramo exacto de la ventana. Se recodifica el tramo
        // (no copia por keyframe) para que el corte empiece justo en `inicio`.
        await execFileAsync(
          binario,
          [
            "-y",
            "-ss",
            String(inicio),
            "-i",
            rutaVentana,
            "-t",
            String(fin - inicio),
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "20",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            rutaRecorte,
          ],
          { timeout: 120000, windowsHide: true }
        );
        const stat = await fs.promises.stat(rutaRecorte).catch(() => null);
        if (!stat || stat.size < 1000) throw new Error("Recorte vacío.");
        // V7: en Vercel la carpeta es /tmp/exportados (el código es de
        // solo lectura). Antes era process.cwd()/exportados y fallaba.
        const exportDir = await asegurarDirExportados();
        const nombreFinal = `live-momento-${Date.now()}.mp4`;
        const rutaFinal = path.join(exportDir, nombreFinal);
        // LA REFERENCIA: el tramo ya recortado se convierte a 4K 60fps
        // con fondo difuminado 9:16, igual que el auto-corte en vivo.
        await convertirSegmentoA916(binario, rutaRecorte, rutaFinal, encuadre, marca);
        await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
        return NextResponse.json({
          ok: true,
          nombreArchivo: nombreFinal,
          inicio,
          fin,
          calidad: "4K 60fps",
        });
      } catch {
        await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      }
    }
    return NextResponse.json(
      {
        ok: false,
        error:
          "No se pudo cortar ese momento en vivo en este servidor (el conversor no lee el directo aquí). Usa los clips del auto-corte (abajo, ya puntuados y en 4K 60fps) o el contenedor local.",
      },
      { status: 500 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "No se pudo cortar ese momento en vivo." },
      { status: 500 }
    );
  }
}
