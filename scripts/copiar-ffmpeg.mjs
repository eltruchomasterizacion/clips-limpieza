import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const raiz = process.cwd();
const destino = join(raiz, "public", "ffmpeg");
mkdirSync(destino, { recursive: true });

const archivos = [
  ["node_modules/@ffmpeg/ffmpeg/dist/umd/ffmpeg.js", "ffmpeg.js"],
  ["node_modules/@ffmpeg/ffmpeg/dist/umd/814.ffmpeg.js", "814.ffmpeg.js"],
  ["node_modules/@ffmpeg/util/dist/umd/index.js", "util.js"],
  ["node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js", "ffmpeg-core.js"],
  ["node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm", "ffmpeg-core.wasm"],
];

for (const [origen, nombre] of archivos) {
  const ruta = join(raiz, origen);
  if (!existsSync(ruta)) {
    console.warn("Aviso: falta " + origen + " (se usará el respaldo en la nube)");
    continue;
  }
  copyFileSync(ruta, join(destino, nombre));
}
console.log("FFmpeg listo");
