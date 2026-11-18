export interface MomentoViral {
  inicio: number;
  fin: number;
  titulo: string;
  puntaje: number;
  motivo: string;
}

export interface TextoTiempo {
  inicio: number;
  fin: number;
  texto: string;
}

const PALABRAS_GANCHO = [
  "increíble", "increible", "no puede ser", "locura", "wow", "miren", "cuidado",
  "gol", "ganó", "gano", "perdió", "perdio", "secreto", "verdad", "mentira",
  "jajaja", "jaja", "dios", "no lo puedo creer", "no lo creo", "sorpresa",
  "urgente", "nunca", "jamás", "jamas", "importante", "atención", "atencion",
  "épico", "epico", "brutal", "impresionante", "escándalo", "escandalo",
];

export function percentil(valores: number[], p: number): number {
  if (valores.length === 0) return 0;
  const s = [...valores].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))));
  return s[i];
}

/** Energía (RMS) por cada segundo de audio. */
export function energiaPorSegundo(muestras: Float32Array, sampleRate: number): number[] {
  const tam = Math.max(1, Math.floor(sampleRate));
  const total = Math.floor(muestras.length / tam);
  const salida: number[] = new Array(total);
  for (let s = 0; s < total; s++) {
    let suma = 0;
    let n = 0;
    const base = s * tam;
    for (let i = 0; i < tam; i += 2) {
      const v = muestras[base + i];
      suma += v * v;
      n++;
    }
    salida[s] = Math.sqrt(suma / Math.max(1, n));
  }
  return salida;
}

function normalizarRelativo(energias: number[]): number[] {
  const ref = percentil(energias, 0.95) || 1e-6;
  return energias.map((e) => Math.min(1.5, e / ref));
}

export function puntuarVentana(
  norm: number[],
  ini: number,
  dur: number
): { puntaje: number; motivo: string } {
  const fin = Math.min(norm.length, ini + dur);
  const n = fin - ini;
  if (n <= 0) return { puntaje: 0, motivo: "" };

  let suma = 0;
  let max = 0;
  let activos = 0;
  for (let i = ini; i < fin; i++) {
    const v = norm[i];
    suma += v;
    if (v > max) max = v;
    if (v > 0.3) activos++;
  }
  const media = suma / n;
  let varianza = 0;
  for (let i = ini; i < fin; i++) varianza += (norm[i] - media) ** 2;
  const desv = Math.sqrt(varianza / n);

  const nIni = Math.min(3, n);
  let sumaIni = 0;
  for (let i = ini; i < ini + nIni; i++) sumaIni += norm[i];
  const mediaIni = sumaIni / nIni;

  const pico = Math.min(1, max);
  const mediaN = Math.min(1, media / 0.6);
  const dinN = Math.min(1, desv / 0.3);
  const densidad = activos / n;

  let puntaje = 100 * (0.3 * pico + 0.25 * mediaN + 0.25 * dinN + 0.2 * densidad);
  const gancho = mediaIni >= media * 0.95 && mediaIni > 0.35;
  if (gancho) puntaje += 8;
  if (media < 0.08) puntaje *= 0.3;

  let motivo = "Voz constante";
  if (gancho) motivo = "Arranca fuerte (buen gancho)";
  else if (dinN > 0.7) motivo = "Mucha variación (gritos, risas o cambios)";
  else if (pico > 0.95) motivo = "Pico de volumen";

  return { puntaje: Math.round(Math.min(99, Math.max(0, puntaje))), motivo };
}

/** Para segmentos de directo: escala absoluta (no relativa) para comparar entre segmentos. */
export function puntuarSegmentoAbsoluto(
  energias: number[],
  ref = 0.1
): { puntaje: number; motivo: string } {
  if (energias.length < 2) return { puntaje: 0, motivo: "sin audio" };
  const norm = energias.map((e) => Math.min(1.5, e / ref));
  return puntuarVentana(norm, 0, norm.length);
}

function tituloDeVentana(textos: TextoTiempo[], ini: number, fin: number, rank: number): string {
  const palabras: string[] = [];
  for (const t of textos) {
    if (t.fin < ini || t.inicio > fin) continue;
    for (const p of t.texto.split(/\s+/).filter(Boolean)) {
      palabras.push(p);
      if (palabras.length >= 8) break;
    }
    if (palabras.length >= 8) break;
  }
  if (palabras.length >= 3) {
    const txt = palabras.join(" ");
    return txt.charAt(0).toUpperCase() + txt.slice(1);
  }
  return `Momento viral #${rank}`;
}

export function elegirMejoresMomentos(
  energias: number[],
  durClip: number,
  cantidad: number | "ilimitado",
  textos: TextoTiempo[] = []
): MomentoViral[] {
  if (energias.length < 3) return [];

  const norm = normalizarRelativo(energias);
  const largo = Math.max(3, Math.min(Math.round(durClip), norm.length));

  // Palabras clave por segundo (suma acumulada para consultar rápido)
  const hits = new Array(norm.length + 1).fill(0);
  for (const t of textos) {
    const txt = t.texto.toLowerCase();
    let h = 0;
    for (const p of PALABRAS_GANCHO) if (txt.includes(p)) h++;
    if (h > 0) {
      const s = Math.min(norm.length - 1, Math.max(0, Math.floor(t.inicio)));
      hits[s] += h;
    }
  }
  const prefijo = new Array(norm.length + 1).fill(0);
  for (let i = 0; i < norm.length; i++) prefijo[i + 1] = prefijo[i] + hits[i];

  const candidatos: { ini: number; puntaje: number; motivo: string }[] = [];
  for (let ini = 0; ini + largo <= norm.length; ini += 1) {
    const r = puntuarVentana(norm, ini, largo);
    const h = prefijo[ini + largo] - prefijo[ini];
    const bonus = Math.min(12, h * 4);
    candidatos.push({
      ini,
      puntaje: Math.min(99, r.puntaje + bonus),
      motivo: bonus > 0 ? `${r.motivo} + palabras clave` : r.motivo,
    });
  }

  const ordenados = [...candidatos].sort((a, b) => b.puntaje - a.puntaje);
  const umbral =
    cantidad === "ilimitado"
      ? Math.max(50, percentil(candidatos.map((c) => c.puntaje), 0.75))
      : 0;
  const max = cantidad === "ilimitado" ? 200 : Math.max(1, Math.floor(cantidad));

  const elegidos: { ini: number; puntaje: number; motivo: string }[] = [];
  for (const c of ordenados) {
    if (elegidos.length >= max) break;
    if (c.puntaje <= 0 || c.puntaje < umbral) break;
    if (elegidos.every((e) => Math.abs(e.ini - c.ini) >= largo)) elegidos.push(c);
  }

  return elegidos.map((c, i) => ({
    inicio: c.ini,
    fin: c.ini + largo,
    titulo: tituloDeVentana(textos, c.ini, c.ini + largo, i + 1),
    puntaje: c.puntaje,
    motivo: c.motivo,
  }));
}