"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Punto {
  t: number;
  x: number;
  y: number;
}

interface Props {
  archivoOrigen: File | null;
  archivoGenerado: File | null;
  onUsarEnEditor: (file: File, duracion: number) => void;
  onPublicar: (blob: Blob, nombre: string, ruta: string) => void;
}

const CAMPO =
  "w-full rounded-lg border border-[#2b1e23] bg-[#0b0709] px-3 py-2 text-xs text-white placeholder:text-[#6f6267] focus:border-[#f43f5e]/65 focus:outline-none";
const BTN_ROSA =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-[#f43f5e] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#e11d48] disabled:opacity-50";
const BTN_GRIS =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-[#2b1e23] bg-[#150e12] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#21161b] disabled:opacity-50";
const CARD = "rounded-2xl border border-[#2a1c22] bg-[#150d11]/90 p-4 sm:p-5";

const PASO = 0.25;
const ALFAS = [0.5, 0.4, 0.3, 0.25, 0.2, 0.16, 0.12, 0.09, 0.07, 0.05];
const VISION = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const MODELO =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

const limitar = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

const fmt = (total: number) => {
  const s = Math.max(0, Math.floor(total));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

async function cargarDetector(): Promise<any> {
  const importar = new Function("u", "return import(u)");
  const mod: any = await importar(`${VISION}/vision_bundle.mjs`);
  const vision = await mod.FilesetResolver.forVisionTasks(`${VISION}/wasm`);
  const crear = (delegate: string) =>
    mod.FaceDetector.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODELO, delegate },
      runningMode: "VIDEO",
      minDetectionConfidence: 0.5,
    });
  try {
    return await crear("GPU");
  } catch {
    return await crear("CPU");
  }
}

function buscar(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(v.currentTime - t) < 0.001) {
      resolve();
      return;
    }
    let listo = false;
    const fin = () => {
      if (listo) return;
      listo = true;
      v.removeEventListener("seeked", fin);
      clearTimeout(tm);
      resolve();
    };
    const tm = setTimeout(fin, 4000);
    v.addEventListener("seeked", fin);
    v.currentTime = t;
  });
}

/** Quita temblores: zona muerta + suavizado hacia adelante y hacia atrás (sin retraso). */
function suavizar(serie: number[], alfa: number, zona: number): number[] {
  if (serie.length === 0) return [];
  const hold: number[] = [];
  let c = serie[0];
  for (const v of serie) {
    if (Math.abs(v - c) > zona) c = v;
    hold.push(c);
  }
  const f: number[] = [];
  let a = hold[0];
  for (const v of hold) {
    a = a + (v - a) * alfa;
    f.push(a);
  }
  const out = new Array<number>(f.length);
  let b = f[f.length - 1];
  for (let i = f.length - 1; i >= 0; i--) {
    b = b + (f[i] - b) * alfa;
    out[i] = b;
  }
  return out;
}

function interpolar(tray: Punto[], t: number): { x: number; y: number } {
  if (tray.length === 0) return { x: 0.5, y: 0.5 };
  if (t <= tray[0].t) return { x: tray[0].x, y: tray[0].y };
  const ult = tray[tray.length - 1];
  if (t >= ult.t) return { x: ult.x, y: ult.y };
  for (let i = 0; i < tray.length - 1; i++) {
    const a = tray[i];
    const b = tray[i + 1];
    if (t >= a.t && t <= b.t) {
      const k = (t - a.t) / Math.max(0.0001, b.t - a.t);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
  }
  return { x: ult.x, y: ult.y };
}

export default function PanelCamara({
  archivoOrigen,
  archivoGenerado,
  onUsarEnEditor,
  onPublicar,
}: Props) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [dim, setDim] = useState({ w: 16, h: 9 });
  const [duracionTotal, setDuracionTotal] = useState(0);

  const [inicio, setInicio] = useState(0);
  const [largo, setLargo] = useState(60);
  const [zoom, setZoom] = useState(1.2);
  const [suave, setSuave] = useState(5);
  const [modo, setModo] = useState<"auto" | "cara" | "movimiento">("auto");

  const [analizando, setAnalizando] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [tray, setTray] = useState<Punto[]>([]);
  const [seg, setSeg] = useState({ ini: 0, dur: 30 });

  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState("");
  const [resultadoUrl, setResultadoUrl] = useState<string | null>(null);
  const [resultadoBlob, setResultadoBlob] = useState<Blob | null>(null);
  const [rutaGuardada, setRutaGuardada] = useState("");

  const vref = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cancelarRef = useRef(false);
  const paramsRef = useRef({ zoom: 1.2, w: 16, h: 9 });
  paramsRef.current = { zoom, w: dim.w, h: dim.h };

  const posicionar = useCallback((cx: number, cy: number) => {
    const el = overlayRef.current;
    if (!el) return;
    const { zoom: z, w, h } = paramsRef.current;
    const wf = Math.min(1, ((9 / 16) * (h / w)) / z);
    const hf = Math.min(1, 1 / z);
    const left = limitar(cx - wf / 2, 0, 1 - wf);
    const top = limitar(cy - hf / 2, 0, 1 - hf);
    el.style.left = `${left * 100}%`;
    el.style.top = `${top * 100}%`;
    el.style.width = `${wf * 100}%`;
    el.style.height = `${hf * 100}%`;
  }, []);

  // El recuadro sigue la trayectoria mientras reproduces el video
  useEffect(() => {
    if (analizando || tray.length < 2) return;
    let raf = 0;
    const loop = () => {
      const v = vref.current;
      if (v) {
        const p = interpolar(tray, v.currentTime - seg.ini);
        posicionar(p.x, p.y);
        if (!v.paused && v.currentTime > seg.ini + seg.dur) v.pause();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [analizando, tray, seg, zoom, dim.w, dim.h, posicionar]);

  const elegirArchivo = (f: File | null) => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    if (resultadoUrl) URL.revokeObjectURL(resultadoUrl);
    setResultadoUrl(null);
    setResultadoBlob(null);
    setRutaGuardada("");
    setTray([]);
    setLog([]);
    setError("");
    setProgreso(0);
    setArchivo(f);
    setVideoUrl(f ? URL.createObjectURL(f) : null);
  };

  // Al abrir el panel, carga solo el video del editor
  useEffect(() => {
    if (archivoOrigen) elegirArchivo(archivoOrigen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const analizar = async () => {
    const v = vref.current;
    if (!v || !archivo) return;

    setError("");
    setResultadoUrl(null);
    setResultadoBlob(null);
    setRutaGuardada("");
    setTray([]);
    setLog([]);
    setProgreso(0);
    cancelarRef.current = false;
    setAnalizando(true);

    const anota = (t: string) => setLog((p) => [...p.slice(-40), t]);
    let detector: any = null;
    let iniGuardado = 0;

    try {
      v.pause();
      const vw = v.videoWidth || 1;
      const vh = v.videoHeight || 1;
      const total = v.duration;
      const ini = limitar(inicio, 0, Math.max(0, total - 1));
      iniGuardado = ini;
      const fin = Math.min(total, ini + limitar(largo, 3, 300));
      const n = Math.max(2, Math.floor((fin - ini) / PASO) + 1);

      if (modo !== "movimiento") {
        anota("🧠 Cargando el detector de caras (la primera vez descarga el modelo)...");
        try {
          detector = await cargarDetector();
          anota("✅ Detector de caras listo.");
        } catch {
          anota("⚠️ No pude cargar el detector de caras (¿sin internet?). Uso solo movimiento.");
        }
      }
      const usarMov = modo !== "cara" || !detector;

      const cv = document.createElement("canvas");
      cv.width = 96;
      cv.height = 54;
      const ctx = cv.getContext("2d", { willReadFrequently: true })!;
      const gris = new Float32Array(96 * 54);
      let hayPrevio = false;

      const rx: (number | null)[] = [];
      const ry: (number | null)[] = [];
      let caras = 0;
      let movs = 0;
      let nada = 0;

      anota(`🎞️ Analizando ${n} cuadros de ${fmt(ini)} a ${fmt(fin)}...`);

      for (let i = 0; i < n; i++) {
        if (cancelarRef.current) break;
        const t = Math.min(fin - 0.05, ini + i * PASO);
        await buscar(v, t);

        let objetivo: { x: number; y: number } | null = null;
        let tipo = "";

        if (detector) {
          try {
            const r = detector.detectForVideo(v, i * 250 + 1);
            const ds: any[] = r?.detections || [];
            let mejor: any = null;
            let area = 0;
            for (const d of ds) {
              const b = d.boundingBox;
              if (!b) continue;
              const a = b.width * b.height;
              if (a > area) {
                area = a;
                mejor = b;
              }
            }
            if (mejor) {
              objetivo = {
                x: (mejor.originX + mejor.width / 2) / vw,
                y: (mejor.originY + mejor.height / 2) / vh + 0.12 / zoom,
              };
              tipo = "cara";
              caras++;
            }
          } catch {
            // Ignorar cuadro
          }
        }

        if (usarMov) {
          try {
            ctx.drawImage(v, 0, 0, 96, 54);
            const data = ctx.getImageData(0, 0, 96, 54).data;
            let sw = 0;
            let sx = 0;
            let sy = 0;
            for (let p = 0; p < 96 * 54; p++) {
              const g = data[p * 4] * 0.3 + data[p * 4 + 1] * 0.59 + data[p * 4 + 2] * 0.11;
              if (hayPrevio) {
                const d = Math.abs(g - gris[p]);
                if (d > 28) {
                  sw += d;
                  sx += d * (p % 96);
                  sy += d * Math.floor(p / 96);
                }
              }
              gris[p] = g;
            }
            hayPrevio = true;
            if (!objetivo && sw > 800) {
              objetivo = { x: (sx / sw + 0.5) / 96, y: (sy / sw + 0.5) / 54 };
              tipo = "movimiento";
              movs++;
            }
          } catch {
            // Ignorar cuadro
          }
        }

        if (!objetivo) nada++;
        rx.push(objetivo ? objetivo.x : null);
        ry.push(objetivo ? objetivo.y : null);
        if (objetivo) posicionar(objetivo.x, objetivo.y);
        setProgreso(Math.round(((i + 1) / n) * 100));
        if (i % 12 === 0) anota(`${fmt(t - ini)} → ${tipo || "sin objetivo (mantengo la posición)"}`);
      }

      if (cancelarRef.current) {
        anota("⏹ Análisis cancelado.");
        return;
      }

      const primero = rx.findIndex((x) => x !== null);
      if (primero < 0) anota("⚠️ No encontré nada que seguir: la cámara queda centrada.");
      let ux = primero < 0 ? 0.5 : (rx[primero] as number);
      let uy = primero < 0 ? 0.5 : (ry[primero] as number);
      const fx: number[] = [];
      const fy: number[] = [];
      for (let i = 0; i < rx.length; i++) {
        if (rx[i] !== null) {
          ux = rx[i] as number;
          uy = ry[i] as number;
        }
        fx.push(ux);
        fy.push(uy);
      }

      const alfa = ALFAS[limitar(Math.round(suave), 1, 10) - 1];
      const sx = suavizar(fx, alfa, 0.04);
      const sy = suavizar(fy, alfa, 0.04);
      const wf = Math.min(1, ((9 / 16) * (vh / vw)) / zoom);
      const hf = Math.min(1, 1 / zoom);

      const nueva: Punto[] = sx.map((x, i) => ({
        t: i * PASO,
        x: wf >= 1 ? 0.5 : limitar(x, wf / 2, 1 - wf / 2),
        y: hf >= 1 ? 0.5 : limitar(sy[i], hf / 2, 1 - hf / 2),
      }));

      setSeg({ ini, dur: Math.max(2, fin - ini) });
      setTray(nueva);
      anota(
        `✅ Listo: ${caras} cuadros con cara, ${movs} por movimiento, ${nada} sin objetivo. Pulsa «Ver con el recuadro».`
      );
    } catch (e: any) {
      setError(e?.message || "No se pudo analizar el video.");
    } finally {
      try {
        detector?.close?.();
      } catch {
        // Ignorar
      }
      setAnalizando(false);
      if (vref.current) vref.current.currentTime = iniGuardado;
    }
  };

  const verConRecuadro = () => {
    const v = vref.current;
    if (!v) return;
    v.currentTime = seg.ini;
    v.play().catch(() => {});
  };

  const generar = async () => {
    if (!archivo || tray.length < 2) return;
    try {
      setGenerando(true);
      setError("");
      const k = Math.max(1, Math.ceil(tray.length / 120));
      const puntos = tray
        .filter((_, i) => i % k === 0 || i === tray.length - 1)
        .map((p) => ({ t: +p.t.toFixed(3), x: +p.x.toFixed(4), y: +p.y.toFixed(4) }));

      const form = new FormData();
      form.append("video", archivo);
      form.append("puntos", JSON.stringify(puntos));
      form.append("inicio", String(seg.ini));
      form.append("duracion", String(seg.dur));
      form.append("zoom", String(zoom));

      const r = await fetch("/api/seguimiento", { method: "POST", body: form });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.error || "No se pudo generar el video.");
        return;
      }
      const ruta = r.headers.get("X-Saved-Path");
      const blob = await r.blob();
      if (resultadoUrl) URL.revokeObjectURL(resultadoUrl);
      setResultadoBlob(blob);
      setResultadoUrl(URL.createObjectURL(blob));
      setRutaGuardada(ruta ? decodeURIComponent(ruta) : "");
    } catch {
      setError("Error de conexión al generar el video.");
    } finally {
      setGenerando(false);
    }
  };

  const hayTray = tray.length > 1;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#f43f5e]">
          ● CÁMARA CON SEGUIMIENTO
        </p>
        <h1 className="text-2xl font-black">Recuadro 9:16 que sigue a la persona</h1>
        <p className="mt-1 text-xs text-[#9e9196]">
          Funciona mejor con un video horizontal (el original), porque tiene espacio para mover el
          recuadro. Después puedes mandarlo al Editor para pegarlo con subtítulos y marca.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <div className={`${CARD} space-y-3 lg:col-span-6`}>
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              elegirArchivo(e.target.files?.[0] || null);
              e.target.value = "";
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!archivoOrigen}
              onClick={() => elegirArchivo(archivoOrigen)}
              className={BTN_GRIS}
            >
              ✂ Video del Editor
            </button>
            <button
              type="button"
              disabled={!archivoGenerado}
              onClick={() => elegirArchivo(archivoGenerado)}
              className={BTN_GRIS}
            >
              🎬 Último generado
            </button>
            <button type="button" onClick={() => fileRef.current?.click()} className={BTN_GRIS}>
              ↑ Subir otro
            </button>
          </div>
          {archivo && (
            <p className="truncate text-[11px] text-emerald-400">
              {archivo.name} · {fmt(duracionTotal)}
            </p>
          )}

          <div
            className="relative mx-auto w-full overflow-hidden rounded-xl border border-[#2b1e23] bg-black"
            style={{
              aspectRatio: `${dim.w} / ${dim.h}`,
              maxWidth: dim.h > dim.w ? 300 : 560,
            }}
          >
            {videoUrl ? (
              <video
                ref={vref}
                src={videoUrl}
                controls={!analizando}
                muted
                playsInline
                preload="auto"
                onLoadedMetadata={(e) => {
                  const el = e.currentTarget;
                  setDim({ w: el.videoWidth || 16, h: el.videoHeight || 9 });
                  setDuracionTotal(el.duration || 0);
                  setInicio(0);
                  setLargo(Math.max(3, Math.min(60, Math.floor(el.duration || 60))));
                  posicionar(0.5, 0.5);
                }}
                className="h-full w-full"
              />
            ) : (
              <div className="flex h-full min-h-[200px] items-center justify-center p-5 text-center text-[11px] text-[#9e9196]">
                Elige un video para empezar.
              </div>
            )}
            <div
              ref={overlayRef}
              className="pointer-events-none absolute border-2 border-[#f43f5e] bg-[#f43f5e]/10"
              style={{
                left: "30%",
                top: "0%",
                width: "40%",
                height: "100%",
                display: videoUrl ? "block" : "none",
              }}
            />
          </div>
          <p className="text-center text-[10px] text-[#9e9196]">
            El recuadro rosa es lo que quedará en el video vertical.
          </p>
        </div>

        <div className={`${CARD} space-y-3 lg:col-span-6`}>
          <p className="text-xs font-bold text-white">Ajustes</p>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[11px] text-[#9e9196]">Desde el segundo</label>
              <input
                type="number"
                min={0}
                value={inicio}
                onChange={(e) => setInicio(Math.max(0, Number(e.target.value) || 0))}
                className={CAMPO}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-[#9e9196]">Duración (máx 300 s)</label>
              <input
                type="number"
                min={3}
                max={300}
                value={largo}
                onChange={(e) => setLargo(limitar(Number(e.target.value) || 3, 3, 300))}
                className={CAMPO}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-[#9e9196]">Qué seguir</label>
            <select
              value={modo}
              onChange={(e) => setModo(e.target.value as "auto" | "cara" | "movimiento")}
              className={CAMPO}
            >
              <option value="auto">Automático (cara y, si no hay, movimiento)</option>
              <option value="cara">Solo caras</option>
              <option value="movimiento">Solo movimiento (deportes, acción)</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-[#9e9196]">
              Zoom: {zoom.toFixed(2)}x (más zoom = plano más cerrado)
            </label>
            <input
              type="range"
              min={1}
              max={2}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-[#f43f5e]"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-[#9e9196]">
              Suavidad de la cámara: {suave} (más alto = movimientos más lentos y suaves)
            </label>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={suave}
              onChange={(e) => setSuave(Number(e.target.value))}
              className="w-full accent-[#f43f5e]"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {!analizando ? (
              <button type="button" onClick={analizar} disabled={!archivo} className={BTN_ROSA}>
                🎯 Analizar y seguir
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  cancelarRef.current = true;
                }}
                className={BTN_GRIS}
              >
                ⏹ Cancelar
              </button>
            )}
            <button type="button" onClick={verConRecuadro} disabled={!hayTray} className={BTN_GRIS}>
              ▶ Ver con el recuadro
            </button>
            <button
              type="button"
              onClick={generar}
              disabled={!hayTray || generando || analizando}
              className={BTN_ROSA}
            >
              {generando ? "Generando..." : "🎬 Generar video 9:16"}
            </button>
          </div>

          {(analizando || progreso > 0) && (
            <div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#1a1115]">
                <div className="h-full bg-[#f43f5e] transition-all" style={{ width: `${progreso}%` }} />
              </div>
              <p className="mt-1 text-[11px] font-bold text-cyan-400">{progreso}%</p>
            </div>
          )}

          <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg bg-[#0b0709] p-2">
            {log.length === 0 ? (
              <p className="text-[11px] text-[#6f6267]">Aquí verás lo que va haciendo, paso a paso.</p>
            ) : (
              log.map((l, i) => (
                <p key={i} className="text-[11px] leading-snug text-[#c7bcc0]">
                  {l}
                </p>
              ))
            )}
          </div>

          {generando && (
            <p className="text-xs font-bold text-cyan-400">
              ⚡ Aplicando la cámara y exportando en 1080x1920...
            </p>
          )}
          {error && <p className="text-xs font-semibold text-amber-400">{error}</p>}
        </div>
      </div>

      {resultadoUrl && resultadoBlob && (
        <div className={`${CARD} space-y-3 border-[#f43f5e]/70`}>
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-emerald-400">
            ● VIDEO 9:16 CON CÁMARA LISTO
          </p>
          <div className="grid gap-4 md:grid-cols-12">
            <div className="md:col-span-4">
              <video
                src={resultadoUrl}
                controls
                className="mx-auto aspect-[9/16] max-h-[420px] rounded-xl bg-black object-contain"
              />
            </div>
            <div className="space-y-3 md:col-span-8">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onUsarEnEditor(
                      new File([resultadoBlob], `camara-${Date.now()}.mp4`, { type: "video/mp4" }),
                      seg.dur
                    )
                  }
                  className={BTN_ROSA}
                >
                  ✂ Mandar al Editor (para pegar con subtítulos y marca)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onPublicar(resultadoBlob, `camara-${Date.now()}.mp4`, rutaGuardada)
                  }
                  className={BTN_GRIS}
                >
                  🚀 Ir directo a Publicar
                </button>
                <a
                  href={resultadoUrl}
                  download={`camara-9-16-${Date.now()}.mp4`}
                  className={BTN_GRIS}
                >
                  ↓ Guardar MP4
                </a>
              </div>
              {rutaGuardada && (
                <p className="break-all text-[11px] text-[#9e9196]">
                  También quedó guardado en: <span className="text-white">{rutaGuardada}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}