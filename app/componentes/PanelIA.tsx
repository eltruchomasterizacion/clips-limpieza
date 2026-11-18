"use client";

import { useRef, useState } from "react";

export interface ResultadoIA {
  modo: "ia" | "basico";
  ganchos: string[];
  titulo: string;
  descripcion: string;
  hashtags: string;
  textoPortada: string;
  guion: string;
  comentario: string;
  textosPantalla: string[];
  mejorMomento: string;
}

interface Props {
  archivoGenerado: File | null;
  archivoOrigen: File | null;
  tituloBase: string;
  credito: string;
  setCredito: (v: string) => void;
  hayVideoFinal: boolean;
  onAplicar: (r: ResultadoIA) => void;
}

const CAMPO =
  "w-full rounded-lg border border-[#2b1e23] bg-[#0b0709] px-3 py-2 text-xs text-white placeholder:text-[#6f6267] focus:border-[#f43f5e]/65 focus:outline-none";
const BTN_ROSA =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-[#f43f5e] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#e11d48] disabled:opacity-50";
const BTN_GRIS =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-[#2b1e23] bg-[#150e12] px-3.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#21161b] disabled:opacity-50";
const CARD = "rounded-2xl border border-[#2a1c22] bg-[#150d11]/90 p-4 sm:p-5";

function aJpeg(src: CanvasImageSource, w: number, h: number): string {
  const max = 1024;
  const esc = Math.min(1, max / Math.max(w, h, 1));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * esc));
  c.height = Math.max(1, Math.round(h * esc));
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.82);
}

function Bloque({
  titulo,
  texto,
  onLeer,
}: {
  titulo: string;
  texto: string;
  onLeer?: () => void;
}) {
  const [copiado, setCopiado] = useState(false);
  if (!texto) return null;
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      // Ignorar
    }
  };
  return (
    <div className="rounded-xl border border-[#2b1e23] bg-[#0b0709] p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-[#f43f5e]">{titulo}</span>
        <div className="flex gap-1.5">
          {onLeer && (
            <button type="button" onClick={onLeer} className={BTN_GRIS}>
              🔊 Escuchar
            </button>
          )}
          <button type="button" onClick={copiar} className={BTN_GRIS}>
            {copiado ? "✓ Copiado" : "Copiar"}
          </button>
        </div>
      </div>
      <p className="whitespace-pre-wrap text-xs leading-relaxed text-white">{texto}</p>
    </div>
  );
}

type Fuente = "generado" | "origen" | "propio" | "enlace";

export default function PanelIA({
  archivoGenerado,
  archivoOrigen,
  tituloBase,
  credito,
  setCredito,
  hayVideoFinal,
  onAplicar,
}: Props) {
  const [fuente, setFuente] = useState<Fuente>(
    archivoGenerado ? "generado" : archivoOrigen ? "origen" : "enlace"
  );
  const [url, setUrl] = useState("");
  const [archivoPropio, setArchivoPropio] = useState<File | null>(null);
  const [inicio, setInicio] = useState("0");
  const [duracionTr, setDuracionTr] = useState("120");
  const [contexto, setContexto] = useState("");
  const [tituloOriginal, setTituloOriginal] = useState("");
  const [plataforma, setPlataforma] = useState("todas");
  const [tono, setTono] = useState("energético");
  const [duracionShort, setDuracionShort] = useState(30);
  const [imagen, setImagen] = useState<string | null>(null);

  const [transcribiendo, setTranscribiendo] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [estado, setEstado] = useState("");
  const [error, setError] = useState("");
  const [res, setRes] = useState<ResultadoIA | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const fotoRef = useRef<HTMLInputElement | null>(null);

  const archivoFuente = (): File | null =>
    fuente === "generado"
      ? archivoGenerado
      : fuente === "origen"
      ? archivoOrigen
      : fuente === "propio"
      ? archivoPropio
      : null;

  const elegirFoto = async (f: File | null) => {
    if (!f) return;
    setError("");
    let u = "";
    try {
      u = URL.createObjectURL(f);
      const img = new Image();
      await new Promise<void>((resolve, rej) => {
        img.onload = () => resolve();
        img.onerror = () => rej(new Error("imagen"));
        img.src = u;
      });
      setImagen(aJpeg(img, img.naturalWidth, img.naturalHeight));
      setEstado("📷 Foto de referencia lista.");
    } catch {
      setError("No pude leer esa foto. Prueba con un JPG o PNG.");
    } finally {
      if (u) URL.revokeObjectURL(u);
    }
  };

  const tomarCuadro = async () => {
    setError("");
    const f = archivoFuente();
    if (!f) {
      setError("Elige primero un video (no un enlace) para tomar un cuadro.");
      return;
    }
    let u = "";
    try {
      setEstado("🎞️ Tomando el cuadro del video...");
      u = URL.createObjectURL(f);
      const v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.preload = "auto";
      v.src = u;
      await new Promise<void>((resolve, rej) => {
        v.onloadeddata = () => resolve();
        v.onerror = () => rej(new Error("video"));
      });
      const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 1;
      const objetivo = Math.min(Math.max(0.1, Number(inicio) || 0.1), Math.max(0.1, dur - 0.2));
      await new Promise<void>((resolve) => {
        const fin = () => {
          v.onseeked = null;
          clearTimeout(tm);
          resolve();
        };
        const tm = setTimeout(fin, 4000);
        v.onseeked = fin;
        v.currentTime = objetivo;
      });
      if (!v.videoWidth) throw new Error("sin imagen");
      setImagen(aJpeg(v, v.videoWidth, v.videoHeight));
      setEstado(`📷 Cuadro del segundo ${objetivo.toFixed(1)} listo como foto de referencia.`);
    } catch {
      setError("No pude sacar un cuadro de ese video.");
    } finally {
      if (u) URL.revokeObjectURL(u);
    }
  };

  const transcribir = async (): Promise<string | null> => {
    setError("");
    const f = archivoFuente();

    if (!f && !(fuente === "enlace" && url.trim())) {
      setError("Elige un video o pega un enlace para transcribir.");
      return null;
    }

    try {
      setTranscribiendo(true);
      setEstado("🎙️ Transcribiendo la voz (la primera vez puede tardar más)...");
      const form = new FormData();
      if (f) form.append("video", f);
      else form.append("originalUrl", url.trim());
      form.append("inicio", String(Math.max(0, Number(inicio) || 0)));
      form.append("duracion", String(Math.min(300, Math.max(5, Number(duracionTr) || 120))));

      const r = await fetch("/api/transcribe", { method: "POST", body: form });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setError(d.error || "No se pudo transcribir.");
        setEstado("");
        return null;
      }
      const texto = Array.isArray(d.subtitulos)
        ? d.subtitulos.map((x: any) => x.texto).join(" ")
        : "";
      if (!texto.trim()) {
        setEstado(d.aviso || "No se detectó voz en ese tramo.");
        return null;
      }
      setContexto(texto);
      setEstado(`✅ Transcripción lista (${texto.split(/\s+/).length} palabras).`);
      return texto;
    } catch {
      setError("Error de conexión al transcribir.");
      setEstado("");
      return null;
    } finally {
      setTranscribiendo(false);
    }
  };

  const generarCon = async (texto: string) => {
    setError("");
    setRes(null);
    try {
      setGenerando(true);
      const r = await fetch("/api/ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contexto: texto,
          tituloOriginal: tituloOriginal || tituloBase,
          credito,
          plataforma,
          tono,
          duracion: duracionShort,
          imagen,
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setError(d.error || "No se pudo generar.");
        return;
      }
      setRes(d.resultado);
      setEstado(d.aviso ? `ℹ️ ${d.aviso}` : "✅ Contenido listo.");
    } catch {
      setError("Error de conexión.");
    } finally {
      setGenerando(false);
    }
  };

  const hayAlgo = (texto: string) =>
    Boolean(texto.trim() || (tituloOriginal || tituloBase).trim() || imagen);

  const automatico = async () => {
    const texto = await transcribir();
    const base = texto ?? contexto;
    if (!hayAlgo(base)) return;
    await generarCon(base);
  };

  const leer = (texto: string) => {
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(texto);
      u.lang = "es-ES";
      window.speechSynthesis.speak(u);
    } catch {
      // Ignorar
    }
  };

  const todo = res ? [res.titulo, res.descripcion, res.hashtags].filter(Boolean).join("\n\n") : "";
  const ocupado = transcribiendo || generando;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#f43f5e]">
          ● ESTUDIO IA · VALOR AGREGADO
        </p>
        <h1 className="text-2xl font-black">Crea el contenido viral de tu video</h1>
        <p className="mt-1 text-xs text-[#9e9196]">
          La IA lee lo que se dice en tu video y, si quieres, mira una foto de referencia. Escribe
          título, hashtags, descripción, portada, ganchos y un comentario original. Si activas «IA
          automática» en el Editor, esto se hace solo al terminar cada video.
        </p>
      </div>

      <div className={`${CARD} space-y-3`}>
        <p className="text-xs font-bold text-white">1. ¿De qué video leemos la voz?</p>

        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["generado", "🎬 Video que generé", Boolean(archivoGenerado)],
              ["origen", "✂ Video del Editor", Boolean(archivoOrigen)],
              ["propio", "↑ Subir otro", true],
              ["enlace", "🔗 Enlace", true],
            ] as [Fuente, string, boolean][]
          ).map(([id, label, activo]) => (
            <button
              key={id}
              type="button"
              disabled={!activo}
              onClick={() => {
                setFuente(id);
                if (id === "propio") fileRef.current?.click();
              }}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition disabled:opacity-40 ${
                fuente === id ? "bg-[#f43f5e] text-white" : "bg-[#0b0709] text-[#c7bcc0]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="video/*,audio/*"
          className="hidden"
          onChange={(e) => {
            setArchivoPropio(e.target.files?.[0] || null);
            e.target.value = "";
          }}
        />
        <input
          ref={fotoRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            elegirFoto(e.target.files?.[0] || null);
            e.target.value = "";
          }}
        />

        {fuente === "propio" && archivoPropio && (
          <p className="text-[11px] text-emerald-400">{archivoPropio.name}</p>
        )}
        {fuente === "generado" && archivoGenerado && (
          <p className="text-[11px] text-emerald-400">Usando el último video que generaste.</p>
        )}
        {fuente === "origen" && archivoOrigen && (
          <p className="text-[11px] text-emerald-400">{archivoOrigen.name}</p>
        )}
        {fuente === "enlace" && (
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Enlace del video"
            className={CAMPO}
          />
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[11px] text-[#9e9196]">Desde el segundo</label>
            <input value={inicio} onChange={(e) => setInicio(e.target.value)} className={CAMPO} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-[#9e9196]">Duración a leer (máx 300 s)</label>
            <input
              value={duracionTr}
              onChange={(e) => setDuracionTr(e.target.value)}
              className={CAMPO}
            />
          </div>
        </div>

        <textarea
          value={contexto}
          onChange={(e) => setContexto(e.target.value)}
          rows={5}
          placeholder="Aquí aparece la transcripción. También puedes escribir o pegar tú el texto, o un resumen de lo que pasa en el video."
          className={CAMPO}
        />

        {/* Foto de referencia */}
        <div className="space-y-2 rounded-xl border border-[#2b1e23] bg-[#0b0709] p-3">
          <p className="text-[11px] font-bold text-white">📷 Foto de referencia (opcional)</p>
          <p className="text-[10px] text-[#9e9196]">
            La IA mira la foto junto con la transcripción para escribir el gancho, el título y el
            texto de la portada. Solo funciona con tu ANTHROPIC_API_KEY. No crea imágenes.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => fotoRef.current?.click()} className={BTN_GRIS}>
              📷 Subir foto
            </button>
            <button type="button" onClick={tomarCuadro} className={BTN_GRIS}>
              🎞️ Tomar un cuadro del video (en el segundo de arriba)
            </button>
            {imagen && (
              <button
                type="button"
                onClick={() => setImagen(null)}
                className="text-[11px] font-bold text-red-400"
              >
                ✕ Quitar foto
              </button>
            )}
          </div>
          {imagen && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imagen}
              alt="Foto de referencia"
              className="max-h-40 rounded-lg border border-[#2b1e23] object-contain"
            />
          )}
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <input
            value={tituloOriginal}
            onChange={(e) => setTituloOriginal(e.target.value)}
            placeholder={tituloBase ? `Título original: ${tituloBase.slice(0, 50)}` : "Título original (opcional)"}
            className={CAMPO}
          />
          <input
            value={credito}
            onChange={(e) => setCredito(e.target.value)}
            placeholder="Crédito: canal o creador original (va en la descripción)"
            className={CAMPO}
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <select value={plataforma} onChange={(e) => setPlataforma(e.target.value)} className={CAMPO}>
            <option value="todas">Todas las plataformas</option>
            <option value="TikTok">TikTok</option>
            <option value="YouTube Shorts">YouTube Shorts</option>
            <option value="Instagram Reels">Instagram Reels</option>
            <option value="Facebook Reels">Facebook Reels</option>
          </select>
          <select value={tono} onChange={(e) => setTono(e.target.value)} className={CAMPO}>
            <option value="energético">Tono: energético</option>
            <option value="humor">Tono: humor</option>
            <option value="misterioso">Tono: misterioso</option>
            <option value="informativo">Tono: informativo</option>
            <option value="emotivo">Tono: emotivo</option>
          </select>
          <select
            value={duracionShort}
            onChange={(e) => setDuracionShort(Number(e.target.value))}
            className={CAMPO}
          >
            <option value={15}>Short de 15 s</option>
            <option value={30}>Short de 30 s</option>
            <option value={45}>Short de 45 s</option>
            <option value={60}>Short de 60 s</option>
            <option value={90}>Short de 90 s</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={automatico} disabled={ocupado} className={BTN_ROSA}>
            {ocupado ? "Trabajando..." : "⚡ Todo automático (transcribir + crear)"}
          </button>
          <button type="button" onClick={transcribir} disabled={ocupado} className={BTN_GRIS}>
            🎙️ Solo transcribir
          </button>
          <button
            type="button"
            onClick={() => generarCon(contexto)}
            disabled={ocupado || !hayAlgo(contexto)}
            className={BTN_GRIS}
          >
            ✨ Solo crear con este texto{imagen ? " y la foto" : ""}
          </button>
        </div>

        {estado && <p className="text-xs font-semibold text-cyan-400">{estado}</p>}
        {error && <p className="text-xs font-semibold text-amber-400">{error}</p>}
      </div>

      {res && (
        <div className={`${CARD} space-y-3`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold text-white">
              2. Tu contenido{" "}
              <span
                className={`ml-1 rounded px-1.5 py-0.5 text-[10px] font-black ${
                  res.modo === "ia" ? "bg-emerald-500 text-black" : "bg-amber-500 text-black"
                }`}
              >
                {res.modo === "ia" ? "CON IA" : "MODO BÁSICO"}
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              {hayVideoFinal && (
                <button
                  type="button"
                  onClick={() => {
                    onAplicar(res);
                    setEstado("✅ Aplicado al video final. Ve a «Publicar» para subirlo.");
                  }}
                  className={BTN_ROSA}
                >
                  ✅ Aplicar al video final
                </button>
              )}
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(todo);
                    setEstado("📋 Título + descripción + hashtags copiados.");
                  } catch {
                    // Ignorar
                  }
                }}
                className={BTN_GRIS}
              >
                📋 Copiar todo
              </button>
            </div>
          </div>

          <Bloque titulo="Título" texto={res.titulo} />
          <Bloque titulo="Descripción" texto={res.descripcion} />
          <Bloque titulo="Hashtags" texto={res.hashtags} />
          <Bloque titulo="Texto para la portada" texto={res.textoPortada} />
          <Bloque
            titulo="Ganchos para los primeros 3 segundos"
            texto={res.ganchos.map((g, i) => `${i + 1}. ${g}`).join("\n")}
          />
          <Bloque titulo="Dónde empezar el clip" texto={res.mejorMomento} />
          <Bloque titulo="Guion del short" texto={res.guion} />
          <Bloque
            titulo="Comentario original (tu valor agregado)"
            texto={res.comentario}
            onLeer={() => leer(res.comentario)}
          />
          <Bloque
            titulo="Textos para poner en pantalla"
            texto={res.textosPantalla.map((t) => `• ${t}`).join("\n")}
          />
        </div>
      )}
    </div>
  );
}