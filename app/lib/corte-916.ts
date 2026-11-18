// Corte 9:16 en 4K a 60fps con fondo difuminado — LA REFERENCIA del
// archivo original de Carlos. Es el mismo corte que usa el auto-corte en
// vivo (live-auto) y el que deben usar TODOS los clips de mejores momentos,
// en vivo incluidos: nada de recortar a 720p ni a 30fps.
//
// 2160x3840 vertical, fps=60, fondo = video completo desenfocado y oscuro,
// video original centrado encima sin recortar, marca de agua opcional.
// Si el ffmpeg no trae drawtext, el clip sale igual, solo sin la marca.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";

const execFileAsync = promisify(execFile);

function obtenerFuenteSistema(): string {
  if (process.platform === "win32") {
    if (fs.existsSync("C:/Windows/Fonts/arialbd.ttf")) return "C\\:/Windows/Fonts/arialbd.ttf";
    return "C\\:/Windows/Fonts/arial.ttf";
  }
  return "";
}

function limpiarTexto(txt: string): string {
  return txt
    .replace(/\\/g, "")
    .replace(/:/g, " ")
    .replace(/'/g, "")
    .replace(/"/g, "")
    .replace(/%/g, "%%")
    .trim();
}

export async function convertirSegmentoA916(
  ffmpegPath: string,
  entrada: string,
  salidaFinal: string,
  encuadre: string,
  marcaTexto: string
): Promise<void> {
  const fontPath = obtenerFuenteSistema();
  const fontOpt = fontPath ? `fontfile='${fontPath}':` : "";
  const marcaLimpia = limpiarTexto(marcaTexto || "@TuMarca");

  // 4K vertical a 60fps. Fondo difuminado: video completo de fondo desenfocado
  // y oscuro, y encima el video original completo centrado (sin recortar).
  const baseVf =
    encuadre === "blur"
      ? "split[a][b];[a]scale=2160:3840:force_original_aspect_ratio=increase,crop=2160:3840,boxblur=25:5,eq=brightness=-0.08[bgb];[b]scale=2160:3840:force_original_aspect_ratio=decrease[fgs];[bgb][fgs]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=60"
      : "scale=2160:3840:force_original_aspect_ratio=increase,crop=2160:3840,setsar=1,fps=60";

  const vfConMarca = marcaLimpia
    ? `${baseVf},drawtext=${fontOpt}text='${marcaLimpia}':fontcolor=white:fontsize=38:box=1:boxcolor=black@0.65:boxborderw=12:x=w-text_w-36:y=90`
    : baseVf;

  const argsBase = (vf: string) => [
    "-y",
    "-i",
    entrada,
    "-vf",
    vf,
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
    "-movflags",
    "+faststart",
    salidaFinal,
  ];

  try {
    await execFileAsync(ffmpegPath, argsBase(vfConMarca), {
      timeout: 300000,
      windowsHide: true,
    });
  } catch (e: any) {
    // Algunos ffmpeg (ffmpeg-static en Linux/Vercel) no traen drawtext:
    // el clip sale igual, solo sin la marca de agua de texto.
    if (!String(e?.stderr || e?.message || "").includes("No such filter: 'drawtext'")) throw e;
    await execFileAsync(ffmpegPath, argsBase(baseVf), {
      timeout: 300000,
      windowsHide: true,
    });
  }
}
