"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

type Pista = {
  id: string;
  titulo: string;
  artista: string;
  duracion: string;
  src: string;
  nota: string;
};

const PISTAS: Pista[] = [
  {
    id: "demo-1",
    titulo: "Demo 1 — Melodía del Huerto",
    artista: "DJ Trucho Hd",
    duracion: "0:18",
    src: "/musica/demo-1.mp3",
    nota: "DEMO",
  },
  {
    id: "demo-2",
    titulo: "Demo 2 — Bajos de Prueba",
    artista: "DJ Trucho Hd",
    duracion: "0:18",
    src: "/musica/demo-2.mp3",
    nota: "DEMO",
  },
  {
    id: "demo-3",
    titulo: "Demo 3 — Ritmo Tropical",
    artista: "DJ Trucho Hd",
    duracion: "0:18",
    src: "/musica/demo-3.mp3",
    nota: "DEMO",
  },
];

function formatoTiempo(segundos: number): string {
  if (!Number.isFinite(segundos) || segundos < 0) return "0:00";
  const m = Math.floor(segundos / 60);
  const s = Math.floor(segundos % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function MusicaPage() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [indiceActual, setIndiceActual] = useState(0);
  const [sonando, setSonando] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [duracion, setDuracion] = useState(0);
  const [volumen, setVolumen] = useState(0.8);
  const [mensajeSuscripcion, setMensajeSuscripcion] = useState<string | null>(null);

  const pistaActual = PISTAS[indiceActual];

  const reproducirPista = useCallback((indice: number) => {
    const i = (indice + PISTAS.length) % PISTAS.length;
    setIndiceActual(i);
    setProgreso(0);
    setSonando(true);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volumen;
    if (sonando) {
      audio.play().catch(() => setSonando(false));
    } else {
      audio.pause();
    }
  }, [sonando, indiceActual, volumen]);

  const alCambiarProgreso = (valor: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = valor;
    setProgreso(valor);
  };

  const suscribirse = (plan: string) => {
    setMensajeSuscripcion(
      `Suscripción próximamente — el plan ${plan} para escuchar sin anuncios aún no está disponible. No se cobra nada por ahora; te avisaremos cuando se active.`
    );
  };

  return (
    <div className="min-h-screen bg-[#090708] font-sans text-[#f5f0f2] selection:bg-[#f43f5e] selection:text-white">
      <header className="sticky top-0 z-50 border-b border-[#241a1e] bg-[#090708]/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f43f5e] text-xs font-black text-white shadow-lg shadow-[#f43f5e]/20">
              ▶
            </div>
            <span className="text-sm font-bold tracking-tight text-white">
              Clips Limpieza · Música
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/tienda"
              className="hidden text-xs font-semibold text-[#a89ca1] transition hover:text-white sm:block"
            >
              Tienda de música
            </Link>
            <Link
              href="/editor"
              className="flex items-center gap-1.5 rounded-full bg-[#f43f5e] px-5 py-2 text-xs font-bold text-white transition hover:bg-[#e11d48]"
            >
              Abrir Editor →
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-20 pt-14">
        <div className="relative text-center">
          <div className="pointer-events-none absolute inset-x-0 -top-14 -z-10 h-72 bg-gradient-to-b from-[#f43f5e]/10 to-transparent" />
          <span className="mb-4 inline-block rounded-full border border-[#f43f5e]/40 bg-[#f43f5e]/10 px-4 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#f43f5e]">
            Sin anuncios · Escucha libre
          </span>
          <h1 className="mx-auto mb-4 max-w-3xl text-4xl font-black leading-[1.08] tracking-tight text-white md:text-5xl">
            Reproductor de música <span className="text-[#f43f5e]">DJ Trucho Hd</span>
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-sm leading-relaxed text-[#a89ca1] md:text-base">
            Escucha la música de DJ Trucho Hd sin anuncios. Sin interrupciones, sin
            publicidad: solo dale play.
          </p>
        </div>

        <p className="mx-auto mb-8 max-w-2xl rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center text-xs leading-relaxed text-amber-200">
          Estas son pistas de demostración (DEMO), generadas como tonos de ejemplo.
          Carlos las reemplazará con sus canciones reales en la carpeta{" "}
          <code className="font-mono text-amber-100">public/musica/</code>.
        </p>

        {/* Reproductor */}
        <section className="mx-auto mb-10 max-w-3xl rounded-2xl border border-[#261b20] bg-[#110c0e] p-6 md:p-8">
          <audio
            ref={audioRef}
            src={pistaActual.src}
            preload="metadata"
            onTimeUpdate={(e) => setProgreso(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => setDuracion(e.currentTarget.duration)}
            onEnded={() => reproducirPista(indiceActual + 1)}
          />

          <div className="mb-6 flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#f43f5e] to-[#7f1d2e] text-2xl">
              🎵
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-bold text-white">{pistaActual.titulo}</h2>
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-amber-300">
                  {pistaActual.nota}
                </span>
              </div>
              <p className="text-sm text-[#a89ca1]">{pistaActual.artista}</p>
              <p className="text-xs text-[#7d6f74]">
                Pista {indiceActual + 1} de {PISTAS.length}
              </p>
            </div>
          </div>

          {/* Barra de progreso */}
          <div className="mb-2 flex items-center gap-3">
            <span className="w-10 text-right text-xs text-[#a89ca1]">
              {formatoTiempo(progreso)}
            </span>
            <input
              type="range"
              min={0}
              max={duracion || 0}
              step={0.1}
              value={progreso}
              onChange={(e) => alCambiarProgreso(Number(e.target.value))}
              aria-label="Progreso de la pista"
              className="h-2 w-full cursor-pointer accent-[#f43f5e]"
            />
            <span className="w-10 text-xs text-[#a89ca1]">
              {formatoTiempo(duracion || 0)}
            </span>
          </div>

          {/* Controles */}
          <div className="mt-4 flex items-center justify-center gap-5">
            <button
              type="button"
              onClick={() => reproducirPista(indiceActual - 1)}
              aria-label="Pista anterior"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#3a2a30] text-lg text-white transition hover:border-[#f43f5e]"
            >
              ⏮
            </button>
            <button
              type="button"
              onClick={() => setSonando((v) => !v)}
              aria-label={sonando ? "Pausar" : "Reproducir"}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-[#f43f5e] text-xl text-white shadow-lg shadow-[#f43f5e]/25 transition hover:bg-[#e11d48]"
            >
              {sonando ? "⏸" : "▶"}
            </button>
            <button
              type="button"
              onClick={() => reproducirPista(indiceActual + 1)}
              aria-label="Pista siguiente"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#3a2a30] text-lg text-white transition hover:border-[#f43f5e]"
            >
              ⏭
            </button>
          </div>

          {/* Volumen */}
          <div className="mx-auto mt-6 flex max-w-xs items-center gap-3">
            <span aria-hidden="true" className="text-sm">🔊</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volumen}
              onChange={(e) => setVolumen(Number(e.target.value))}
              aria-label="Volumen"
              className="h-2 w-full cursor-pointer accent-[#f43f5e]"
            />
            <span className="w-10 text-xs text-[#a89ca1]">{Math.round(volumen * 100)}%</span>
          </div>
        </section>

        {/* Lista de pistas */}
        <section className="mx-auto mb-12 max-w-3xl">
          <h2 className="mb-4 text-xl font-bold text-white">Lista de pistas</h2>
          <ul className="space-y-2">
            {PISTAS.map((p, i) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => reproducirPista(i)}
                  className={`flex w-full items-center gap-4 rounded-xl border px-4 py-3 text-left transition ${
                    i === indiceActual
                      ? "border-[#f43f5e] bg-[#f43f5e]/10"
                      : "border-[#261b20] bg-[#110c0e] hover:border-[#f43f5e]/60"
                  }`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#241a1e] text-sm">
                    {i === indiceActual && sonando ? "⏸" : "▶"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-white">{p.titulo}</span>
                      <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-amber-300">
                        {p.nota}
                      </span>
                    </span>
                    <span className="block text-xs text-[#a89ca1]">{p.artista}</span>
                  </span>
                  <span className="text-xs text-[#7d6f74]">{p.duracion}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Suscripción */}
        <section id="suscripcion" className="mx-auto max-w-4xl">
          <h2 className="mb-2 text-center text-2xl font-black tracking-tight text-white md:text-3xl">
            Escucha sin anuncios
          </h2>
          <p className="mx-auto mb-8 max-w-xl text-center text-sm text-[#a89ca1]">
            Con la suscripción escuchas toda la música sin anuncios. Sin publicidad en
            ningún momento.
          </p>

          {mensajeSuscripcion && (
            <div
              role="status"
              className="mx-auto mb-6 max-w-2xl rounded-2xl border border-[#f43f5e]/50 bg-[#f43f5e]/10 px-5 py-4 text-center"
            >
              <p className="text-sm font-bold text-white">Suscripción próximamente</p>
              <p className="mt-1 text-sm leading-relaxed text-[#f5d0d6]">{mensajeSuscripcion}</p>
              <button
                type="button"
                onClick={() => setMensajeSuscripcion(null)}
                className="mt-3 rounded-full border border-[#f43f5e]/50 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-[#f43f5e]"
              >
                Entendido
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-[#261b20] bg-[#110c0e] p-8 text-center">
              <h3 className="mb-1 text-xl font-bold text-white">Mensual</h3>
              <p className="mb-4 text-xs text-[#9e9196]">Escucha sin anuncios, mes a mes.</p>
              <ul className="mb-6 space-y-2 text-left text-sm text-[#d8cdd1]">
                <li>✓ Música sin anuncios</li>
                <li>✓ Reproducción ilimitada</li>
                <li>✓ Cancela cuando quieras</li>
              </ul>
              <button
                type="button"
                onClick={() => suscribirse("Mensual")}
                className="w-full rounded-lg bg-[#f43f5e] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#e11d48]"
              >
                Suscribirme — Mensual
              </button>
              <p className="mt-3 text-xs text-[#7d6f74]">Precio por anunciar · Sin cobro por ahora</p>
            </div>
            <div className="rounded-2xl border border-[#f43f5e] bg-[#f43f5e]/10 p-8 text-center shadow-lg shadow-[#f43f5e]/10">
              <span className="mb-3 inline-block rounded-full bg-[#f43f5e] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white">
                Mejor valor
              </span>
              <h3 className="mb-1 text-xl font-bold text-white">Anual</h3>
              <p className="mb-4 text-xs text-[#f5d0d6]">Un año entero sin anuncios.</p>
              <ul className="mb-6 space-y-2 text-left text-sm text-[#f5e6e9]">
                <li>✓ Todo lo del plan Mensual</li>
                <li>✓ Un año completo sin anuncios</li>
                <li>✓ Mejor valor que el mensual</li>
              </ul>
              <button
                type="button"
                onClick={() => suscribirse("Anual")}
                className="w-full rounded-lg bg-[#f43f5e] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#e11d48]"
              >
                Suscribirme — Anual
              </button>
              <p className="mt-3 text-xs text-[#f5d0d6]/70">Precio por anunciar · Sin cobro por ahora</p>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-[#7d6f74]">
            La suscripción aún no está activa y no se realiza ningún cobro. Cuando esté
            disponible, podrás suscribirte aquí mismo.
          </p>
        </section>
      </main>

      <footer className="border-t border-[#241a1e] py-8 text-center text-xs text-[#7d6f74]">
        Reproductor de música DJ Trucho Hd — Pistas de demostración, sin anuncios.
      </footer>
    </div>
  );
}
