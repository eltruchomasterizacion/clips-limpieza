// Puntuación REAL de mejores momentos — lógica pura, sin Node ni ffmpeg.
// La usan el servidor (app/lib/mejores-momentos.ts) y el navegador
// (detectarMomentosEnArchivo en app/editor/page.tsx), así ambos puntúan igual.
//
// Qué mide cada ventana candidata:
//   - energía de audio (RMS en dB por segundo): picos = risa, gritos, música,
//     aplausos, voz fuerte. Silencio / casi silencio = aburrido.
//   - palabras por segundo (de los subtítulos, cuando los hay): mucha
//     conversación seguida = retención; tramos sin nadie hablando = aburrido.
//   - cambios de escena por segundo (cuando se pudo medir): mucho movimiento
//     o cortes = actividad visual; imagen quieta = aburrido.
//
// Regla de Carlos: si no es un mejor momento, NO se coge. Las ventanas por
// debajo del umbral se ignoran por completo y se cuentan en tramosIgnorados.

export interface MomentoPuntuado {
  inicio: number;
  fin: number;
  titulo: string;
  puntaje: number; // 0-100, medido de verdad, nunca 98/97/96 en serie
  motivo: string; // razón corta y real, p. ej. "🔊 Pico de audio + 💬 mucha conversación"
}

export interface ResultadoPuntuacion {
  momentos: MomentoPuntuado[];
  /** Tramos de la duración del clip que se ignoraron por no tener actividad. */
  tramosIgnorados: number;
  /** Tramos de esa duración que se analizaron en total. */
  tramosAnalizados: number;
  /** Mejor puntaje visto en cualquier ventana, aunque no pasara el umbral
   *  (para decirle al usuario cuánto le faltó, en vez de un "sin actividad"
   *  genérico). 0 cuando no hubo ninguna ventana puntuable. */
  mejorPuntaje: number;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** RMS en dB (-60 silencio … -20 fuerte) → 0..1. Voz y música reales rondan
 *  -25 a -15 dB RMS; -20 dB ya es contenido fuerte. */
export function normalizarEnergia(rmsDb: number): number {
  return clamp01((rmsDb + 50) / 30);
}

/** Palabras por segundo (0 … ~3.5 hablando rápido) → 0..1. */
export function normalizarPalabras(palabrasPorSegundo: number): number {
  return clamp01(palabrasPorSegundo / 3.5);
}

/** Cambios de escena por segundo → 0..1 (0.5 cambios/s ya es mucho movimiento). */
export function normalizarMovimiento(cambiosPorSegundo: number): number {
  return clamp01(cambiosPorSegundo / 0.5);
}

export interface EntradaPuntuacion {
  /** RMS en dB por cada segundo del video (índice = segundo). */
  energiaPorSegundo: number[];
  /** false cuando el audio NO se pudo medir: no se aplica el filtro de
   *  silencio y la energía no puntúa (solo palabras/movimiento). */
  energiaDisponible?: boolean;
  /** Palabras habladas por cada segundo (de subtítulos). [] si no hay. */
  palabrasPorSegundo?: number[];
  /** Cambios de escena por cada segundo. [] si no se pudo medir. */
  movimientoPorSegundo?: number[];
  duracionTotal: number;
  /** Duración que debe tener cada clip (segundos). */
  durClip: number;
  /** Cuántos momentos devolver como máximo. "ilimitado" = todos los que pasen. */
  cantidad: number | "ilimitado";
  /** Puntaje mínimo para coger una ventana. Por debajo se ignora. */
  umbral?: number;
}

export function puntuarVentanas(e: EntradaPuntuacion): ResultadoPuntuacion {
  const segClip = Math.min(300, Math.max(3, Math.round(e.durClip)));
  const dur = Math.max(segClip, Math.floor(e.duracionTotal || 0));
  const umbral = e.umbral ?? 55;
  const tienePalabras = (e.palabrasPorSegundo?.length || 0) > 0;
  const tieneMovimiento = (e.movimientoPorSegundo?.length || 0) > 0;
  const energia = e.energiaPorSegundo;
  const palabras = e.palabrasPorSegundo || [];
  const movimiento = e.movimientoPorSegundo || [];

  const tramosAnalizados = Math.max(1, Math.floor(dur / segClip));
  // Mejor puntaje visto en cualquier ventana, aunque no pase el umbral:
  // se registra ANTES del filtro, para poder decirle al usuario cuánto
  // le faltó (p. ej. "mejor puntaje 41, umbral 55").
  let mejorPuntaje = 0;

  // Ventanas deslizantes (paso = 1/5 del clip) para no partir un buen
  // momento por la mitad: un pico que cae justo en un borde sigue entrando.
  const paso = Math.max(1, Math.round(segClip / 5));
  interface Candidata extends MomentoPuntuado {
    energiaMedia: number;
  }
  const candidatas: Candidata[] = [];

  for (let ini = 0; ini + segClip <= dur; ini += paso) {
    const fin = ini + segClip;
    let sumaEnergia = 0;
    let nEnergia = 0;
    let picoEnergia = -60;
    for (let s = ini; s < fin; s++) {
      const v = energia[s];
      if (typeof v === "number" && isFinite(v)) {
        sumaEnergia += v;
        nEnergia++;
        if (v > picoEnergia) picoEnergia = v;
      }
    }
    if (nEnergia === 0) continue;
    const energiaMedia = sumaEnergia / nEnergia;

    // Sin energía no hay momento: silencio casi total se descarta directo,
    // aunque haya palabras o movimiento en el papel. (Solo cuando la energía
    // se midió de verdad; si no se pudo medir, no se aplica este filtro.)
    const energiaDisponible = e.energiaDisponible !== false;
    if (energiaDisponible && energiaMedia <= -45) continue;

    let palabrasVentana = 0;
    for (let s = ini; s < fin; s++) palabrasVentana += palabras[s] || 0;
    const palabrasPorSeg = palabrasVentana / segClip;

    let cambiosVentana = 0;
    for (let s = ini; s < fin; s++) cambiosVentana += movimiento[s] || 0;
    const cambiosPorSeg = cambiosVentana / segClip;

    const nE = normalizarEnergia(energiaMedia);
    const nP = tienePalabras ? normalizarPalabras(palabrasPorSeg) : 0;
    const nM = tieneMovimiento ? normalizarMovimiento(cambiosPorSeg) : 0;

    // Pesos según las señales que existen de verdad en este video.
    let pE = 0.45;
    let pP = 0.35;
    let pM = 0.2;
    if (!energiaDisponible) {
      // Sin audio medido: solo palabras y movimiento puntúan.
      pE = 0;
      if (tienePalabras && tieneMovimiento) {
        pP = 0.6;
        pM = 0.4;
      } else if (tienePalabras) {
        pP = 1;
        pM = 0;
      } else if (tieneMovimiento) {
        pP = 0;
        pM = 1;
      } else {
        continue; // Sin ninguna señal no hay nada que puntuar.
      }
    } else if (!tienePalabras && !tieneMovimiento) {
      pE = 1;
      pP = 0;
      pM = 0;
    } else if (!tienePalabras) {
      pE = 0.65;
      pP = 0;
      pM = 0.35;
    } else if (!tieneMovimiento) {
      pE = 0.6;
      pP = 0.4;
      pM = 0;
    }

    const puntaje = Math.round(100 * (pE * nE + pP * nP + pM * nM));
    if (puntaje > mejorPuntaje) mejorPuntaje = puntaje;
    if (puntaje < umbral) continue;

    const razones: string[] = [];
    // La razón muestra las señales que de verdad empujaron el puntaje.
    const contribuciones: Array<[number, string]> = [
      [pE * nE, "🔊 Pico de audio"],
      [pP * nP, "💬 Mucha conversación"],
      [pM * nM, "🎬 Mucho movimiento"],
    ];
    contribuciones
      .filter(([c]) => c >= 0.12)
      .sort((a, b) => b[0] - a[0])
      .forEach(([, r]) => razones.push(r));
    if (razones.length === 0) razones.push("🔊 Actividad alta");

    candidatas.push({
      inicio: ini,
      fin,
      titulo: "",
      puntaje,
      motivo: razones.slice(0, 2).join(" + "),
      energiaMedia,
    });
  }

  // Quedarse solo con las mejores sin solapar: se ordena por puntaje y se
  // descarta toda ventana que se cruce con una ya elegida.
  candidatas.sort((a, b) => b.puntaje - a.puntaje || a.inicio - b.inicio);
  const elegidas: Candidata[] = [];
  for (const c of candidatas) {
    if (elegidas.some((x) => c.inicio < x.fin && x.inicio < c.fin)) continue;
    elegidas.push(c);
    if (e.cantidad !== "ilimitado" && elegidas.length >= Math.max(1, e.cantidad)) break;
  }
  // Si NADA pasó el umbral, se devuelve solo la mejor ventana que haya
  // (para no dejar la pantalla vacía), pero se cuenta todo lo demás como
  // ignorado. Nunca se devuelven trozos parejos con puntaje inventado.
  if (elegidas.length === 0 && candidatas.length > 0) {
    elegidas.push(candidatas[0]);
  }
  elegidas.sort((a, b) => a.inicio - b.inicio);

  const momentos: MomentoPuntuado[] = elegidas.map((c, i) => ({
    inicio: c.inicio,
    fin: c.fin,
    titulo: `Mejor momento #${i + 1}`,
    puntaje: c.puntaje,
    motivo: c.motivo,
  }));

  return {
    momentos,
    tramosIgnorados: Math.max(0, tramosAnalizados - momentos.length),
    tramosAnalizados,
    mejorPuntaje,
  };
}
