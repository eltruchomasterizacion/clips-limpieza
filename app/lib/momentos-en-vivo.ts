// Mejores momentos EN VIVO, para TODAS las plataformas — no solo YouTube.
//
// El problema que arregla: /api/extract trata un directo como si fuera un
// video grabado con duración conocida, y como un vivo no tiene duración,
// devolvía momentos vacíos y la pantalla decía "no tiene tramos con
// actividad suficiente", aunque el directo estuviera a todo volumen.
//
// Cómo funciona (sin Python, sin yt-dlp en Vercel):
//   1. Se toma la URL HLS (.m3u8) que el editor YA resolvió para esa
//      plataforma: YouTube (manifiesto HLS de ytdl-core), TikTok Live,
//      Twitch, Kick, Facebook Live o cualquier enlace .m3u8 directo.
//   2. Se lee la lista de reproducción HLS y se bajan los ÚLTIMOS
//      segmentos (ventana móvil de hasta 3 minutos), que es lo único que
//      existe de un directo: no hay "video completo" que analizar.
//   3. Esos segmentos se analizan con el MISMO puntuador de siempre
//      (app/lib/puntuacion-momentos.ts: energía de audio por segundo,
//      conversación, movimiento) y solo se devuelven las ventanas que
//      pasan el umbral 55. Lo aburrido se ignora.
//   4. La ventana analizada se guarda (ventanaId) para que el momento se
//      pueda CORTAR con la referencia original (corte 9:16 4K 60fps con
//      fondo difuminado, app/lib/corte-916.ts) en /api/cortar-momento-en-vivo.
//
// Si el directo acaba de empezar y todavía no hay audio suficiente para
// llenar ni un clip, NO se dice "sin actividad": se devuelve
// `insuficiente: true` con los segundos que hay, y la pantalla explica
// que hay que dejar correr el directo unos minutos.
// Si la plataforma no da una URL HLS en Vercel (Twitch/Kick/Facebook sin
// yt-dlp), se dice claro cuál es y por qué, y el contenedor local
// (con yt-dlp) sigue siendo la vía para esa plataforma.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { obtenerBinarioFfmpeg } from "./ytdlp";
import { energiaPorSegundo } from "./mejores-momentos";
import {
  puntuarVentanas,
  type ResultadoPuntuacion,
} from "./puntuacion-momentos";

export interface ResultadoEnVivo extends ResultadoPuntuacion {
  /** Segundos de directo analizados (ventana móvil). */
  ventanaSegundos: number;
  /** Id de la ventana guardada, para cortarla después. */
  ventanaId: string | null;
  /** true cuando no había audio suficiente ni para un clip. */
  insuficiente: boolean;
  /** Mensaje claro en español para la pantalla (cuando aplica). */
  mensaje?: string;
  senales: { audio: boolean; subtitulos: boolean; movimiento: boolean };
}

const VENTANA_MAX_SEGUNDOS = 180; // últimos 3 minutos del directo
const MAX_SEGMENTOS = 60;
const MAX_BYTES_VENTANA = 90 * 1024 * 1024; // 90 MB de segmentos como máximo

const registroVentanas = globalThis as unknown as {
  __ventanasEnVivo?: Map<string, string>;
};
if (!registroVentanas.__ventanasEnVivo) {
  registroVentanas.__ventanasEnVivo = new Map<string, string>();
}
export const ventanasEnVivo = registroVentanas.__ventanasEnVivo;

export function rutaVentanaEnVivo(ventanaId: string): string | null {
  const enMemoria = ventanasEnVivo.get(ventanaId);
  if (enMemoria && fs.existsSync(enMemoria)) return enMemoria;
  const enDisco = path.join(os.tmpdir(), "live-ventanas", `${ventanaId}.ts`);
  return fs.existsSync(enDisco) ? enDisco : null;
}

function resolverUrl(base: string, relativa: string): string {
  try {
    return new URL(relativa, base).toString();
  } catch {
    return relativa;
  }
}

async function bajarTexto(url: string, timeoutMs = 8000): Promise<string | null> {
  const r = await bajarTextoConMotivo(url, timeoutMs);
  return r.texto;
}

/**
 * Igual que bajarTexto, pero devuelve el motivo real del fallo.
 * V7: antes, si la lista HLS no llegaba, la pantalla decía siempre el
 * mensaje genérico "no entregó una lista HLS" y tapaba el fallo real
 * (en producción el fallo real era el mkdir de /api/live-auto). Ahora
 * el motivo se muestra tal cual: HTTP 403/404, tiempo agotado, o una
 * respuesta que no es una lista (por ejemplo, una página de error).
 */
async function bajarTextoConMotivo(
  url: string,
  timeoutMs = 8000
): Promise<{ texto: string | null; motivo: string }> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        Accept: "*/*",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      return { texto: null, motivo: `el servidor respondió HTTP ${res.status}` };
    }
    const texto = await res.text();
    if (!texto.includes("#EXTM3U")) {
      const muestra = texto.slice(0, 80).replace(/\s+/g, " ").trim();
      return {
        texto: null,
        motivo: `la URL respondió pero no entregó una lista HLS (llegó ${texto.length} caracteres${
          muestra ? `, empieza con: "${muestra}"` : ""
        }) — el enlace pudo haber expirado`,
      };
    }
    return { texto, motivo: "" };
  } catch (e: any) {
    const msg = String(e?.name === "TimeoutError" ? "tiempo agotado (8s)" : e?.message || "error de red");
    return { texto: null, motivo: `no se pudo conectar con la URL (${msg})` };
  }
}

interface SegmentoHls {
  url: string;
  duracion: number;
}

/** Lee una lista HLS: devuelve los segmentos (con su duración), la URL de
 *  la variante con más ancho de banda si es una lista maestra, y —clave
 *  para el audio— la URL de la pista de audio separada (#EXT-X-MEDIA
 *  TYPE=AUDIO), si la hay.
 *
 *  CAUSA REAL DEL FALLO DE LA V4 (verificado 2026-11-18 con el directo
 *  t8HuqJeu6LE): la variante de MENOR ancho de banda de YouTube Live es
 *  SOLO VIDEO (itag 269, sin pista de audio), así que el demuxer .ts no
 *  encontraba ningún PID de audio y devolvía "no se pudo medir el audio".
 *  El audio vive en la rendition #EXT-X-MEDIA (itag 139, ~48 kbps), que el
 *  código viejo ignoraba por completo. Ahora se usa esa pista primero. */
function leerListaHls(
  texto: string,
  baseUrl: string
): { segmentos: SegmentoHls[]; variante: string | null; audio: string | null } {
  const lineas = texto.split("\n").map((l) => l.trim()).filter(Boolean);
  const segmentos: SegmentoHls[] = [];
  let variante: string | null = null;
  let audio: string | null = null;
  // Para analizar AUDIO basta la variante más liviana: baja rápido, pesa
  // poco y el RMS es el mismo. La más pesada (1080p, 12 Mbps) tardaría
  // minutos y pasaría el límite de la función en Vercel.
  let menorAnchoBanda = Number.POSITIVE_INFINITY;
  let duracionPendiente = 0;
  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    if (linea.startsWith("#EXT-X-MEDIA:")) {
      // Pista de audio separada: TYPE=AUDIO,...,URI="https://.../hls_playlist/..."
      if (linea.includes("TYPE=AUDIO") && !audio) {
        const mUri = linea.match(/URI="([^"]+)"/);
        if (mUri) audio = resolverUrl(baseUrl, mUri[1]);
      }
    } else if (linea.startsWith("#EXTINF:")) {
      duracionPendiente = Number(linea.split(":")[1].split(",")[0]) || 0;
    } else if (linea.startsWith("#EXT-X-STREAM-INF:")) {
      const m = linea.match(/BANDWIDTH=(\d+)/);
      const ancho = m ? Number(m[1]) : 0;
      const siguiente = lineas[i + 1];
      if (siguiente && !siguiente.startsWith("#") && ancho < menorAnchoBanda) {
        menorAnchoBanda = ancho;
        variante = resolverUrl(baseUrl, siguiente);
      }
    } else if (!linea.startsWith("#")) {
      if (duracionPendiente > 0) {
        segmentos.push({ url: resolverUrl(baseUrl, linea), duracion: duracionPendiente });
        duracionPendiente = 0;
      }
    }
  }
  return { segmentos, variante, audio };
}

async function bajarSegmentos(
  segmentos: SegmentoHls[],
  destino: string
): Promise<number> {
  // Solo los últimos segmentos: la ventana móvil del directo.
  let total = 0;
  const elegidos: SegmentoHls[] = [];
  for (let i = segmentos.length - 1; i >= 0 && total < VENTANA_MAX_SEGUNDOS && elegidos.length < MAX_SEGMENTOS; i--) {
    elegidos.unshift(segmentos[i]);
    total += segmentos[i].duracion;
  }
  const writer = fs.createWriteStream(destino);
  let bytes = 0;
  let demasiadoGrande = false;
  let duracionBajada = 0;
  // Descarga de 3 en 3 para que sea rápida sin saturar el servidor.
  // Plazo total: en Vercel la función se corta a los 60 s, así que no se
  // puede esperar 20 s por segmento; 8 s basta para segmentos de audio
  // (unos pocos KB) y de video liviano.
  const plazo = Date.now() + 40000;
  for (let i = 0; i < elegidos.length && !demasiadoGrande && Date.now() < plazo; i += 3) {
    const lote = elegidos.slice(i, i + 3);
    const buffers = await Promise.all(
      lote.map(async (seg) => {
        try {
          const res = await fetch(seg.url, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
            },
            redirect: "follow",
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok || !res.body) return null;
          const buf = Buffer.from(await res.arrayBuffer());
          return buf;
        } catch {
          return null;
        }
      })
    );
    for (let j = 0; j < buffers.length; j++) {
      const buf = buffers[j];
      if (!buf) continue;
      bytes += buf.length;
      if (bytes > MAX_BYTES_VENTANA) {
        demasiadoGrande = true;
        break;
      }
      writer.write(buf);
      duracionBajada += lote[j].duracion;
    }
  }
  writer.end();
  await new Promise<void>((ok, mal) => {
    writer.on("finish", ok);
    writer.on("error", mal);
  });
  // Duración de la ventana que de verdad se bajó (si algún segmento falló
  // o se pasó el tope de bytes, se cuenta solo lo descargado).
  return Math.floor(duracionBajada);
}

/**
 * Energía de audio de una ventana .ts SIN ffmpeg.
 *
 * Por qué existe: ffmpeg-static (el binario que trae el proyecto) hace
 * segfault (exit 139) al leer CUALQUIER archivo .ts en este Linux — lo
 * comprobé con un .ts creado por él mismo, con audio AAC-LC y con HE-AAC,
 * con y sin filtros. En .mp4/.m4a funciona bien. Como los segmentos HLS
 * de un directo son .ts, el análisis en vivo NO puede pasar por ffmpeg.
 *
 * Qué mide de verdad (no es un puntaje inventado): se desmultiplexa el
 * .ts en JavaScript puro (paquetes de 188 bytes, PAT → PMT → PID de
 * audio, cabeceras PES con PTS) y se cuentan los bytes de audio por
 * segundo. En AAC, el silencio casi no ocupa bytes (unos pocos kbps) y
 * la voz/música/risas ocupan mucho más (hasta 128 kbps o más): el caudal
 * de audio por segundo es una medida real de actividad. Se convierte a
 * pseudo-RMS en dB con la misma escala del puntuador (-60 silencio …
 * -20 fuerte) para que el umbral 55 signifique lo mismo que en los
 * videos grabados.
 */
function energiaTsPorSegundo(
  ruta: string,
  duracionSegundos: number
): { energia: number[]; medido: boolean } {
  const vacio = new Array(Math.max(1, Math.ceil(duracionSegundos))).fill(-60);
  let buf: Buffer;
  try {
    buf = fs.readFileSync(ruta);
  } catch {
    return { energia: vacio, medido: false };
  }
  // Tamaño de paquete: 188 (o 192 con cabecera M2TS).
  let tamPaquete = 188;
  let inicio = -1;
  for (let off = 0; off < Math.min(buf.length, 4096); off++) {
    if (buf[off] === 0x47 && buf[off + 188] === 0x47) {
      inicio = off;
      tamPaquete = 188;
      break;
    }
    if (buf[off] === 0x47 && buf[off + 192] === 0x47) {
      inicio = off;
      tamPaquete = 192;
      break;
    }
  }
  if (inicio < 0) return { energia: vacio, medido: false };

  let pmtPid = -1;
  let audioPid = -1;
  const bytesPorSegundo: number[] = new Array(vacio.length).fill(0);
  let ptsBase: number | null = null;
  let segundoActual = 0;
  let paquetesTotales = 0;
  let paquetesAudio = 0;

  const leerPts = (b: Buffer, off: number): number | null => {
    // PTS de 33 bits en 5 bytes: '0010' + bits.
    if (off + 5 > b.length) return null;
    const p =
      (((b[off] >> 1) & 0x07) * 2 ** 30) +
      (b[off + 1] << 22) +
      (((b[off + 2] >> 1) & 0x7f) << 15) +
      (b[off + 3] << 7) +
      ((b[off + 4] >> 1) & 0x7f);
    return p;
  };

  for (let off = inicio; off + tamPaquete <= buf.length; off += tamPaquete) {
    const paquete = buf.subarray(off, off + tamPaquete);
    if (paquete[0] !== 0x47) continue;
    paquetesTotales++;
    const pusi = (paquete[1] & 0x40) !== 0;
    const pid = ((paquete[1] & 0x1f) << 8) | paquete[2];
    const controlAdaptacion = (paquete[3] >> 4) & 0x03;
    let pos = 4;
    if (controlAdaptacion === 2 || controlAdaptacion === 3) {
      const lenAdaptacion = paquete[4] || 0;
      pos += 1 + lenAdaptacion;
    }
    if (controlAdaptacion === 2) continue; // solo adaptación, sin carga útil
    if (pos >= tamPaquete) continue;
    const carga = paquete.subarray(pos);

    if (pid === 0 && pusi) {
      // PAT: buscar el PID del PMT (bytes 10-11 del primer programa).
      const puntero = carga[0] || 0;
      const seccion = carga.subarray(1 + puntero);
      if (seccion.length >= 12 && seccion[0] === 0x00) {
        pmtPid = ((seccion[10] & 0x1f) << 8) | seccion[11];
      }
      continue;
    }
    if (pid === pmtPid && pusi && pmtPid > 0) {
      // PMT: buscar el primer flujo de audio (AAC 0x0f, MP2/MP3 0x03/0x04).
      const puntero = carga[0] || 0;
      const seccion = carga.subarray(1 + puntero);
      if (seccion.length < 12 || seccion[0] !== 0x02) continue;
      const longSeccion = ((seccion[1] & 0x0f) << 8) | seccion[2];
      const longInfoPrograma = ((seccion[10] & 0x0f) << 8) | seccion[11];
      let p = 12 + longInfoPrograma;
      const fin = Math.min(seccion.length, 3 + longSeccion - 4);
      while (p + 5 <= fin) {
        const tipoFlujo = seccion[p];
        const pidFlujo = ((seccion[p + 1] & 0x1f) << 8) | seccion[p + 2];
        const longInfoEs = ((seccion[p + 3] & 0x0f) << 8) | seccion[p + 4];
        if ((tipoFlujo === 0x0f || tipoFlujo === 0x03 || tipoFlujo === 0x04) && audioPid < 0) {
          audioPid = pidFlujo;
        }
        p += 5 + longInfoEs;
      }
      continue;
    }
    if (pid === audioPid && audioPid > 0) {
      paquetesAudio++;
      if (pusi && carga.length >= 14 && carga[0] === 0x00 && carga[1] === 0x00 && carga[2] === 0x01) {
        const banderas = carga[7];
        const flagsPtsDts = (banderas >> 6) & 0x03;
        const longCabecera = carga[8] || 0;
        if ((flagsPtsDts === 2 || flagsPtsDts === 3) && carga.length >= 14) {
          const pts = leerPts(carga, 9);
          if (pts !== null) {
            if (ptsBase === null) ptsBase = pts;
            segundoActual = Math.floor((pts - ptsBase) / 90000);
            if (segundoActual < 0) segundoActual = 0;
            if (segundoActual >= bytesPorSegundo.length) segundoActual = bytesPorSegundo.length - 1;
          }
        }
        const inicioCarga = 9 + longCabecera;
        if (inicioCarga < carga.length) {
          bytesPorSegundo[segundoActual] += carga.length - inicioCarga;
        }
      } else {
        bytesPorSegundo[segundoActual] += carga.length;
      }
    }
  }

  if (audioPid < 0 || paquetesAudio === 0) {
    return { energia: vacio, medido: false };
  }

  // Sin PTS en todo el archivo (raro): repartir por posición en el archivo.
  if (ptsBase === null) {
    const totalBytes = bytesPorSegundo.reduce((a, b) => a + b, 0);
    if (totalBytes > 0) {
      const porSegundo = totalBytes / Math.max(1, duracionSegundos);
      for (let s = 0; s < bytesPorSegundo.length; s++) bytesPorSegundo[s] = porSegundo;
    }
  }

  // Caudal de audio (bytes/s) → pseudo-RMS dB, misma escala del puntuador:
  // ~0 B/s = silencio (-60); ~1.000 B/s (8 kbps, casi silencio) = -45;
  // ~16.000 B/s (128 kbps, voz/música fuerte) = -20.
  const energia = bytesPorSegundo.map((bps) => {
    if (bps <= 100) return -60;
    const db = -45 + (25 * Math.log(bps / 1000)) / Math.log(16);
    return Math.max(-45, Math.min(-15, db));
  });
  return { energia, medido: true };
}

/** Energía por segundo de una ventana en vivo: .ts con el demuxer propio
 *  (ffmpeg-static se cae con .ts), .mp4/.m4a con ffmpeg. */
async function energiaVentanaEnVivo(
  ffmpeg: string,
  ruta: string,
  duracionSegundos: number
): Promise<{ energia: number[] | null; medido: boolean }> {
  try {
    const cabecera = Buffer.alloc(4);
    const fd = fs.openSync(ruta, "r");
    fs.readSync(fd, cabecera, 0, 4, 0);
    fs.closeSync(fd);
    if (cabecera[0] === 0x47) {
      const r = energiaTsPorSegundo(ruta, duracionSegundos);
      return { energia: r.medido ? r.energia : null, medido: r.medido };
    }
  } catch {
    return { energia: null, medido: false };
  }
  const energia = await energiaPorSegundo(ffmpeg, ruta, duracionSegundos);
  return { energia, medido: energia !== null };
}
export async function analizarEnVivo(
  hlsUrl: string,
  durClip: number,
  cantidad: number | "ilimitado"
): Promise<ResultadoEnVivo> {
  const vacio = (mensaje?: string, insuficiente = false): ResultadoEnVivo => ({
    momentos: [],
    tramosIgnorados: 0,
    tramosAnalizados: 0,
    mejorPuntaje: 0,
    ventanaSegundos: 0,
    ventanaId: null,
    insuficiente,
    mensaje,
    senales: { audio: false, subtitulos: false, movimiento: false },
  });

  const { texto, motivo } = await bajarTextoConMotivo(hlsUrl);
  if (!texto) {
    return vacio(
      `No se pudo leer la lista del directo: ${motivo}. Prueba con otro enlace o usa el contenedor local.`,
      false
    );
  }
  let { segmentos, variante, audio } = leerListaHls(texto, hlsUrl);
  // PRIORIDAD A LA PISTA DE AUDIO SEPARADA: en YouTube Live la variante
  // de video más liviana es SOLO VIDEO (sin audio), así que medir sobre
  // ella siempre da "no se pudo medir el audio". La pista #EXT-X-MEDIA
  // (itag 139, ~48 kbps) es solo audio, pesa poquísimo y es justo lo que
  // hay que medir. Solo si no hay pista de audio se usa la variante.
  if (audio) {
    const textoAudio = await bajarTexto(audio);
    if (textoAudio && textoAudio.includes("#EXTM3U")) {
      const listaAudio = leerListaHls(textoAudio, audio);
      if (listaAudio.segmentos.length > 0) {
        segmentos = listaAudio.segmentos;
        variante = null;
      }
    }
  }
  if (segmentos.length === 0 && variante) {
    const textoVariante = await bajarTexto(variante);
    if (!textoVariante) {
      return vacio(
        "No se pudo leer la variante del directo. Prueba de nuevo en unos segundos.",
        false
      );
    }
    ({ segmentos } = leerListaHls(textoVariante, variante));
  }
  if (segmentos.length === 0) {
    return vacio(
      "El directo todavía no tiene segmentos para analizar. Deja que corra unos segundos y vuelve a intentarlo.",
      true
    );
  }

  const ventanaId = `live-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const dirVentanas = path.join(os.tmpdir(), "live-ventanas");
  await fs.promises.mkdir(dirVentanas, { recursive: true });
  const rutaVentana = path.join(dirVentanas, `${ventanaId}.ts`);
  const ventanaSegundos = Math.floor(await bajarSegmentos(segmentos, rutaVentana));
  if (ventanaSegundos <= 0 || !fs.existsSync(rutaVentana)) {
    await fs.promises.unlink(rutaVentana).catch(() => {});
    return vacio(
      "No se pudieron bajar los segmentos del directo. Prueba de nuevo en unos segundos.",
      true
    );
  }
  ventanasEnVivo.set(ventanaId, rutaVentana);

  const segClip = Math.min(300, Math.max(3, Math.round(durClip)));
  if (ventanaSegundos < segClip) {
    return {
      momentos: [],
      tramosIgnorados: 0,
      tramosAnalizados: 0,
      mejorPuntaje: 0,
      ventanaSegundos,
      ventanaId,
      insuficiente: true,
      mensaje: `El directo acaba de empezar: solo hay ${ventanaSegundos}s de audio y un clip dura ${segClip}s. Deja que corra al menos ${segClip}s y vuelve a pulsar "Sacar mejores momentos". El auto-corte ya está grabando.`,
      senales: { audio: false, subtitulos: false, movimiento: false },
    };
  }

  const ffmpeg = obtenerBinarioFfmpeg();
  // Los segmentos HLS son .ts y ffmpeg-static se cae leyéndolos
  // (segfault), así que la energía se mide con el demuxer propio de
  // arriba; solo si la ventana no es .ts se usa ffmpeg.
  const { energia, medido } = await energiaVentanaEnVivo(ffmpeg, rutaVentana, ventanaSegundos);
  if (!medido || !energia) {
    return {
      momentos: [],
      tramosIgnorados: Math.max(1, Math.floor(ventanaSegundos / segClip)),
      tramosAnalizados: Math.max(1, Math.floor(ventanaSegundos / segClip)),
      mejorPuntaje: 0,
      ventanaSegundos,
      ventanaId,
      insuficiente: false,
      mensaje:
        "No se pudo medir el audio de este directo en el servidor (los segmentos bajados no traían pista de audio). El auto-corte sigue grabando; puntúa los clips con 'Ordenar por mejores momentos'.",
      senales: { audio: false, subtitulos: false, movimiento: false },
    };
  }

  const resultado = puntuarVentanas({
    energiaPorSegundo: energia,
    energiaDisponible: true,
    palabrasPorSegundo: [],
    movimientoPorSegundo: [],
    duracionTotal: ventanaSegundos,
    durClip: segClip,
    cantidad,
  });

  return {
    ...resultado,
    ventanaSegundos,
    ventanaId,
    insuficiente: false,
    mensaje:
      resultado.momentos.length > 0
        ? `⚡ ${resultado.momentos.length} mejores momentos en los últimos ${ventanaSegundos}s del directo (se ignoraron ${resultado.tramosIgnorados} tramos sin actividad). El auto-corte sigue grabando y puntuando cada clip.`
        : `En los últimos ${ventanaSegundos}s del directo se analizó el audio y ningún tramo pasó el umbral (mejor puntaje: ${resultado.mejorPuntaje} de 100, umbral 55). Todo estuvo callado o sin picos en esa ventana. El auto-corte sigue grabando; vuelve a intentarlo en unos minutos.`,
    senales: { audio: true, subtitulos: false, movimiento: false },
  };
}
