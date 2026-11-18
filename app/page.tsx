"use client";

import React from "react";
import Link from "next/link";

const HERRAMIENTAS: {
  n: string;
  tag: string;
  titulo: string;
  desc: string;
}[] = [
  {
    n: "01",
    tag: "1 A 1000 / ILIMITADO",
    titulo: "Control total de cantidad y segundos",
    desc: "Elige de 1 a 1000 clips (al poner 1000 activa Ilimitado) y define los segundos exactos de cada corte.",
  },
  {
    n: "02",
    tag: "PEGADO NATIVO",
    titulo: "Pega todos los clips uno tras de otro",
    desc: "Une cortes de YouTube, TikTok, Kick, Twitch o directos en vivo en un solo video largo con FFmpeg nativo.",
  },
  {
    n: "03",
    tag: "MARCA Y EFECTOS",
    titulo: "Tu marca de agua, logo, stickers y subtítulos",
    desc: "Personaliza cada video con tu propia marca de agua, filtros visuales y potencia de audio en 1080p.",
  },
  {
    n: "04",
    tag: "VIRAL AUTOMÁTICO",
    titulo: "Título viral + hashtags listos",
    desc: "Genera automáticamente el título viral y los hashtags acordes al contenido al terminar de pegar los clips.",
  },
  {
    n: "05",
    tag: "SUBIDA DIRECTA",
    titulo: "Publica en todas tus redes monetizadas",
    desc: "Envía directo a YouTube Shorts, TikTok, Instagram Reels, Facebook Reels y X con título y hashtags copiados.",
  },
  {
    n: "06",
    tag: "USO PERSONAL",
    titulo: "Sin códigos, sin límites ni esperas",
    desc: "Motor nativo en tu equipo/contenedor con guardado automático en la carpeta exportados/.",
  },
];

const PLANES: {
  nombre: string;
  estado: "actual" | "proximamente";
  etiqueta: string;
  desc: string;
  beneficios: string[];
}[] = [
  {
    nombre: "Plan Gratis",
    estado: "actual",
    etiqueta: "Actual · Gratis para siempre",
    desc: "El editor completo, sin pagar nada. Sin código de acceso, sin límites y sin sorpresas.",
    beneficios: [
      "Editor completo GRATIS",
      "Clips ilimitados (1 a 1000)",
      "Exportar en 4K a 60fps",
      "Marca de agua, stickers y subtítulos",
      "Título viral + hashtags automáticos",
      "Sin código de acceso",
    ],
  },
  {
    nombre: "Plan Pro",
    estado: "proximamente",
    etiqueta: "Próximamente",
    desc: "Funciones extra para creadores que publican todos los días.",
    beneficios: [
      "Todo lo del Plan Gratis",
      "Plantillas y efectos exclusivos",
      "Exportación prioritaria",
    ],
  },
  {
    nombre: "Plan Estudio",
    estado: "proximamente",
    etiqueta: "Próximamente",
    desc: "Para equipos pequeños que crean contenido en conjunto.",
    beneficios: [
      "Todo lo del Plan Pro",
      "Varios perfiles de trabajo",
      "Proyectos compartidos",
    ],
  },
  {
    nombre: "Plan Agencia",
    estado: "proximamente",
    etiqueta: "Próximamente",
    desc: "Para agencias que gestionan muchos clientes y canales.",
    beneficios: [
      "Todo lo del Plan Estudio",
      "Gestión de clientes",
      "Soporte prioritario",
    ],
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#090708] font-sans text-[#f5f0f2] selection:bg-[#f43f5e] selection:text-white">
      <header className="sticky top-0 z-50 border-b border-[#241a1e] bg-[#090708]/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f43f5e] text-xs font-black text-white shadow-lg shadow-[#f43f5e]/20">
              ▶
            </div>
            <span className="text-sm font-bold tracking-tight text-white">
              Clips Limpieza · Estudio Personal
            </span>
          </Link>

          <nav className="hidden items-center gap-5 text-xs font-semibold text-[#a89ca1] md:flex">
            <Link href="/tienda" className="transition hover:text-white">
              Tienda de música
            </Link>
            <Link href="/musica" className="transition hover:text-white">
              Reproductor
            </Link>
            <Link href="#planes" className="transition hover:text-white">
              Planes
            </Link>
          </nav>

          <Link
            href="/editor"
            className="flex items-center gap-1.5 rounded-full bg-[#f43f5e] px-5 py-2 text-xs font-bold text-white transition hover:bg-[#e11d48]"
          >
            Abrir Estudio Personal <span>→</span>
          </Link>
        </div>
      </header>

      <section className="relative mx-auto max-w-6xl px-6 pb-14 pt-16 text-center">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-gradient-to-b from-[#f43f5e]/10 to-transparent" />
        <span className="mb-4 inline-block rounded-full border border-[#f43f5e]/40 bg-[#f43f5e]/10 px-4 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#f43f5e]">
          100% GRATIS · Sin código · Sin límites
        </span>
        <h1 className="mx-auto mb-5 max-w-3xl text-4xl font-black leading-[1.08] tracking-tight text-white md:text-6xl">
          Extrae, pega tus clips y{" "}
          <span className="text-[#f43f5e]">publícalos directo.</span>
        </h1>
        <p className="mx-auto mb-8 max-w-2xl text-sm leading-relaxed text-[#a89ca1] md:text-base">
          Saca de <span className="font-semibold text-white">1 a 1000 clips (Ilimitado)</span> de cualquier video o streaming en vivo, pégalos uno tras de otro en <span className="font-semibold text-white">4K a 60fps</span> con tu marca de agua y súbelos directo con título y hashtags virales. Todo gratis, para siempre.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/editor"
            className="rounded-lg bg-[#f43f5e] px-8 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#f43f5e]/20 transition hover:bg-[#e11d48]"
          >
            ⚡ Entrar al Editor y Pegar Clips →
          </Link>
          <Link
            href="/musica"
            className="rounded-lg border border-[#3a2a30] bg-[#110c0e] px-8 py-3.5 text-sm font-bold text-white transition hover:border-[#f43f5e]"
          >
            🎵 Escuchar música
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-10">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {HERRAMIENTAS.map((h) => (
            <div
              key={h.n}
              className="rounded-2xl border border-[#261b20] bg-[#110c0e] p-6"
            >
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#f43f5e]">
                {h.n} / {h.tag}
              </span>
              <h3 className="mb-2 mt-2 text-lg font-bold text-white">
                {h.titulo}
              </h3>
              <p className="text-xs leading-relaxed text-[#9e9196]">{h.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Música y tienda */}
      <section className="mx-auto max-w-6xl px-6 py-10">
        <h2 className="mb-2 text-center text-2xl font-black tracking-tight text-white md:text-3xl">
          Más de DJ Trucho Hd
        </h2>
        <p className="mx-auto mb-8 max-w-xl text-center text-sm text-[#a89ca1]">
          La música del creador, en un solo lugar: compra sus packs o escúchalos sin anuncios.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Link
            href="/tienda"
            className="group rounded-2xl border border-[#261b20] bg-[#110c0e] p-8 transition hover:border-[#f43f5e]"
          >
            <span className="text-3xl">🛒</span>
            <h3 className="mb-2 mt-3 text-xl font-bold text-white group-hover:text-[#f43f5e]">
              Tienda de música
            </h3>
            <p className="mb-4 text-sm leading-relaxed text-[#9e9196]">
              Packs y mezclas de DJ Trucho Hd: car audio, mezclas masterizadas y más. Compra directa, sin intermediarios.
            </p>
            <span className="text-sm font-bold text-[#f43f5e]">Ver la tienda →</span>
          </Link>
          <Link
            href="/musica"
            className="group rounded-2xl border border-[#261b20] bg-[#110c0e] p-8 transition hover:border-[#f43f5e]"
          >
            <span className="text-3xl">🎧</span>
            <h3 className="mb-2 mt-3 text-xl font-bold text-white group-hover:text-[#f43f5e]">
              Reproductor de música
            </h3>
            <p className="mb-4 text-sm leading-relaxed text-[#9e9196]">
              Escucha la música de DJ Trucho Hd sin anuncios, con suscripción mensual o anual.
            </p>
            <span className="text-sm font-bold text-[#f43f5e]">Escuchar ahora →</span>
          </Link>
        </div>
      </section>

      {/* Planes */}
      <section id="planes" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-10 pb-20">
        <h2 className="mb-2 text-center text-2xl font-black tracking-tight text-white md:text-3xl">
          Planes
        </h2>
        <p className="mx-auto mb-8 max-w-xl text-center text-sm text-[#a89ca1]">
          Empieza gratis, para siempre. Los demás planes llegarán más adelante.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {PLANES.map((p) => (
            <div
              key={p.nombre}
              className={`flex flex-col rounded-2xl border p-6 ${
                p.estado === "actual"
                  ? "border-[#f43f5e] bg-[#f43f5e]/10 shadow-lg shadow-[#f43f5e]/10"
                  : "border-[#261b20] bg-[#110c0e]"
              }`}
            >
              <span
                className={`mb-3 inline-block w-fit rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${
                  p.estado === "actual"
                    ? "bg-[#f43f5e] text-white"
                    : "bg-[#241a1e] text-[#a89ca1]"
                }`}
              >
                {p.etiqueta}
              </span>
              <h3 className="mb-1 text-xl font-bold text-white">{p.nombre}</h3>
              {p.estado === "actual" && (
                <p className="mb-1 text-2xl font-black text-[#f43f5e]">$0</p>
              )}
              <p className="mb-4 text-xs leading-relaxed text-[#9e9196]">{p.desc}</p>
              <ul className="mb-6 flex-1 space-y-2">
                {p.beneficios.map((b) => (
                  <li key={b} className="flex items-start gap-2 text-xs text-[#d8cdd1]">
                    <span className="text-[#f43f5e]">✓</span> {b}
                  </li>
                ))}
              </ul>
              {p.estado === "actual" ? (
                <Link
                  href="/editor"
                  className="rounded-lg bg-[#f43f5e] px-4 py-2.5 text-center text-sm font-bold text-white transition hover:bg-[#e11d48]"
                >
                  Usar el editor gratis →
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  className="cursor-not-allowed rounded-lg border border-[#3a2a30] bg-[#1a1215] px-4 py-2.5 text-sm font-bold text-[#a89ca1]"
                >
                  Próximamente
                </button>
              )}
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-xs text-[#7d6f74]">
          El Plan Gratis no tiene costo ni fecha de vencimiento. Los demás planes aún no están disponibles y no se cobra nada por ellos.
        </p>
      </section>

      <footer className="border-t border-[#241a1e] py-8 text-center text-xs text-[#7d6f74]">
        Clips Limpieza · Estudio Personal de DJ Trucho Hd — Editor gratis, música y más.
      </footer>
    </div>
  );
}
