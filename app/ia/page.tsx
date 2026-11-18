"use client";

import { useRef, useState } from "react";
import Link from "next/link";

interface Resultado {
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

const CAMPO =
  "w-full rounded-lg border border-[#2b1e23] bg-[#0b0709] px-3 py-2 text-xs text-white placeholder:text-[#6f6267] focus:border-[#f43f5e]/65 focus:outline-none";
const BTN_ROSA =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-[#f43f5e] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#e11d48] disabled:opacity-50";
const BTN_GRIS =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-[#2b1e23] bg-[#150e12] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#21161b] disabled:opacity-50";
const CARD = "rounded-2xl border border-[#2a1c22] bg-[#150d11]/90 p-4 sm:p-5";

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

export default function PaginaIA() {
  const [url, setUrl] = useState("");
  const [inicio, setInicio] = useState("0");
  const [duracionTr, setDuracionTr] = useState("120");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [contexto, setContexto] = useState("");
  const [tituloOriginal, setTituloOriginal] = useState("");
  const [credito, setCredito] = useState("");
  const [plataforma, setPlataforma] = useState("todas");
  const [tono, setTono] = useState("energético");
  const [duracionShort, setDuracionShort] = useState(30);

  const [transcribiendo, setTranscribiendo] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [estado, setEstado] = useState("");
  const [error, setError] = useState("");
  const [res, setRes] = useState<Resultado | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const transcribir = async () => {
    setError("");
    setEstado("");
    if (!archivo && !url.trim()) {
      setError("Pega un enlace o sube un video para transcribir.");
      return;
    }
    try {
      setTranscribiendo(true);
      setEstado("🎙️ Transcribiendo la voz (la primera vez puede tardar más)...");
      const form = new FormData();
      if (archivo) form.append("video", archivo);
      else form.append("originalUrl", url.trim());
      form.append("inicio", String(Math.max(0, Number(inicio) || 0)));
      form.append("duracion", String(Math.min(300, Math.max(5, Number(duracionTr) || 120))));

      const r = await fetch("/api/transcribe", { method: "POST", body: form });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setError(d.error || "No se pudo transcribir.");
        setEstado("");
        return;
      }
      const texto = Array.isArray(d.subtitulos)
        ? d.subtitulos.map((x: any) => x.texto).join(" ")
        : "";
      if (!texto.trim()) {
        setEstado(d.aviso || "No se detectó voz en ese tramo.");
        return;
      }
      setContexto(texto);
      setEstado(`✅ Transcripción lista (${texto.split(/\s+/).length} palabras).`);
    } catch {
      setError("Error de conexión al transcribir.");
      setEstado("");
    } finally {
      setTranscribiendo(false);
    }
  };

  const generar = async () => {
    setError("");
    setEstado("");
    setRes(null);
    try {
      setGenerando(true);
      const r = await fetch("/api/ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contexto,
          tituloOriginal,
          credito,
          plataforma,
          tono,
          duracion: duracionShort,
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setError(d.error || "No se pudo generar.");
        return;
      }
      setRes(d.resultado);
      if (d.aviso) setEstado(`ℹ️ ${d.aviso}`);
    } catch {
      setError("Error de conexión.");
    } finally {
      setGenerando(false);
    }
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

  const todo = res ? `${res.titulo}\n\n${res.descripcion}\n\n${res.hashtags}` : "";

  return (
    <div className="min-h-screen bg-[#07050a] px-4 py-8 text-[#f5f0f2]">
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#f43f5e]">
              ● ESTUDIO IA · VALOR AGREGADO
            </p>
            <h1 className="text-2xl font-black">Crea el contenido viral de tu clip</h1>
          </div>
          <Link href="/editor" className={BTN_GRIS}>
            ← Volver al editor
          </Link>
        </div>

        {/* 1. Contexto */}
        <div className={`${CARD} space-y-3`}>
          <p className="text-xs font-bold text-white">1. Dale a la IA lo que dice tu clip</p>

          <div className="grid gap-2 sm:grid-cols-4">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Enlace del video (opcional)"
              className={`${CAMPO} sm:col-span-2`}
            />
            <input
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              placeholder="Inicio (seg)"
              className={CAMPO}
            />
            <input
              value={duracionTr}
              onChange={(e) => setDuracionTr(e.target.value)}
              placeholder="Duración (seg, máx 300)"
              className={CAMPO}
            />
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="video/*,audio/*"
            className="hidden"
            onChange={(e) => setArchivo(e.target.files?.[0] || null)}
          />

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} className={BTN_GRIS}>
              ↑ O sube un video
            </button>
            {archivo && <span className="text-[11px] text-emerald-400">{archivo.name}</span>}
            <button
              type="button"
              onClick={transcribir}
              disabled={transcribiendo}
              className={BTN_ROSA}
            >
              {transcribiendo ? "Transcribiendo..." : "🎙️ Transcribir la voz"}
            </button>
          </div>

          <textarea
            value={contexto}
            onChange={(e) => setContexto(e.target.value)}
            rows={6}
            placeholder="Aquí aparece la transcripción. También puedes escribir o pegar tú el texto o un resumen de lo que pasa en el clip."
            className={CAMPO}
          />

          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={tituloOriginal}
              onChange={(e) => setTituloOriginal(e.target.value)}
              placeholder="Título original del video (opcional)"
              className={CAMPO}
            />
            <input
              value={credito}
              onChange={(e) => setCredito(e.target.value)}
              placeholder="Crédito: canal o creador original (se añade a la descripción)"
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

          <button
            type="button"
            onClick={generar}
            disabled={generando || (!contexto.trim() && !tituloOriginal.trim())}
            className={`${BTN_ROSA} w-full py-3 text-sm`}
          >
            {generando ? "✨ Creando tu contenido..." : "✨ Generar contenido viral"}
          </button>

          {estado && <p className="text-xs font-semibold text-cyan-400">{estado}</p>}
          {error && <p className="text-xs font-semibold text-amber-400">{error}</p>}
        </div>

        {/* 2. Resultado */}
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
                className={BTN_ROSA}
              >
                📋 Copiar título + descripción + hashtags
              </button>
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
    </div>
  );
}