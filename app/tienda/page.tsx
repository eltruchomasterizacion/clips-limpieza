"use client";

import React, { useState } from "react";
import Link from "next/link";

type Producto = {
  id: string;
  nombre: string;
  tipo: string;
  desc: string;
  precio: number;
  etiqueta: string;
};

const PRODUCTOS: Producto[] = [
  {
    id: "pack-completo",
    nombre: "Carpeta de Música DJ Trucho Hd — Pack completo",
    tipo: "Pack completo",
    desc: "Toda la carpeta de música de DJ Trucho Hd en un solo pack: mezclas, car audio y temas masterizados listos para sonar duro.",
    precio: 29.99,
    etiqueta: "El más completo",
  },
  {
    id: "pack-car-audio-1",
    nombre: "Pack Car Audio Vol. 1",
    tipo: "Pack",
    desc: "Mezclas pensadas para car audio: bajos profundos, sonido limpio y masterización lista para tu equipo.",
    precio: 9.99,
    etiqueta: "Car audio",
  },
  {
    id: "mezcla-masterizada",
    nombre: "Mezcla Masterizada — Sesión DJ",
    tipo: "Mezcla",
    desc: "Una sesión completa mezclada y masterizada por DJ Trucho Hd, de principio a fin, sin cortes.",
    precio: 7.99,
    etiqueta: "Sesión",
  },
  {
    id: "pack-dembow",
    nombre: "Pack Dembow Dominicano",
    tipo: "Pack",
    desc: "Ritmos de dembow dominicano para poner el ambiente: energía, calle y sabor caribeño.",
    precio: 9.99,
    etiqueta: "Dembow",
  },
  {
    id: "pack-bajos",
    nombre: "Pack Bajos Profundos",
    tipo: "Pack",
    desc: "Temas con bajos profundos para probar tu amplificador, tus bocinas y tus decibeles.",
    precio: 6.99,
    etiqueta: "Bajos",
  },
  {
    id: "tema-exclusivo",
    nombre: "Tema Exclusivo — Edición Limitada",
    tipo: "Tema",
    desc: "Un tema exclusivo de DJ Trucho Hd en edición limitada, solo disponible aquí en la tienda.",
    precio: 4.99,
    etiqueta: "Exclusivo",
  },
  {
    id: "pack-fiesta",
    nombre: "Pack Fiesta — Para el Colmado",
    tipo: "Pack",
    desc: "La selección para la fiesta: temas para bailar, cantar y gozar en el colmado o en la casa.",
    precio: 8.99,
    etiqueta: "Fiesta",
  },
];

export default function TiendaPage() {
  const [mensaje, setMensaje] = useState<string | null>(null);

  const comprar = (p: Producto) => {
    setMensaje(
      `Venta próximamente — "${p.nombre}" (${p.precio.toFixed(2)} USD, precio de ejemplo) aún no está a la venta. Déjanos tu WhatsApp o contáctanos para avisarte cuando esté disponible.`
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
              Clips Limpieza · Tienda
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/musica"
              className="hidden text-xs font-semibold text-[#a89ca1] transition hover:text-white sm:block"
            >
              Reproductor
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
            Tienda oficial · DJ Trucho Hd
          </span>
          <h1 className="mx-auto mb-4 max-w-3xl text-4xl font-black leading-[1.08] tracking-tight text-white md:text-5xl">
            Tienda de música <span className="text-[#f43f5e]">DJ Trucho Hd</span>
          </h1>
          <p className="mx-auto mb-4 max-w-2xl text-sm leading-relaxed text-[#a89ca1] md:text-base">
            La música de DJ Trucho Hd, directa del creador: packs de car audio, mezclas masterizadas y temas exclusivos.
          </p>
          <p className="mx-auto mb-8 max-w-2xl rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-200">
            Nota: este catálogo es de ejemplo. Los productos y precios mostrados son de
            muestra y Carlos los reemplazará con sus canciones reales. Todavía no se
            cobra nada: las ventas se activarán próximamente.
          </p>
        </div>

        {mensaje && (
          <div
            role="status"
            className="mx-auto mb-8 max-w-3xl rounded-2xl border border-[#f43f5e]/50 bg-[#f43f5e]/10 px-5 py-4 text-center"
          >
            <p className="text-sm font-bold text-white">Venta próximamente</p>
            <p className="mt-1 text-sm leading-relaxed text-[#f5d0d6]">{mensaje}</p>
            <button
              type="button"
              onClick={() => setMensaje(null)}
              className="mt-3 rounded-full border border-[#f43f5e]/50 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-[#f43f5e]"
            >
              Entendido
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {PRODUCTOS.map((p) => (
            <article
              key={p.id}
              className="flex flex-col rounded-2xl border border-[#261b20] bg-[#110c0e] p-6"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="rounded-full bg-[#241a1e] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#f43f5e]">
                  {p.etiqueta}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#7d6f74]">
                  {p.tipo}
                </span>
              </div>
              <div className="mb-4 flex h-24 items-center justify-center rounded-xl bg-gradient-to-br from-[#f43f5e]/25 via-[#110c0e] to-[#110c0e] text-4xl">
                🎵
              </div>
              <h2 className="mb-2 text-lg font-bold leading-snug text-white">{p.nombre}</h2>
              <p className="mb-4 flex-1 text-xs leading-relaxed text-[#9e9196]">{p.desc}</p>
              <div className="mb-4 flex items-baseline gap-2">
                <span className="text-2xl font-black text-white">${p.precio.toFixed(2)}</span>
                <span className="text-xs text-[#7d6f74]">USD · precio de ejemplo</span>
              </div>
              <button
                type="button"
                onClick={() => comprar(p)}
                className="rounded-lg bg-[#f43f5e] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#e11d48]"
              >
                Comprar
              </button>
            </article>
          ))}
        </div>

        <div className="mt-10 rounded-2xl border border-[#261b20] bg-[#110c0e] p-8 text-center">
          <h2 className="mb-2 text-xl font-bold text-white">¿Quieres escuchar antes de comprar?</h2>
          <p className="mx-auto mb-5 max-w-xl text-sm text-[#a89ca1]">
            Prueba el reproductor con pistas de demostración y escucha sin anuncios con la suscripción.
          </p>
          <Link
            href="/musica"
            className="inline-block rounded-lg bg-[#f43f5e] px-8 py-3 text-sm font-bold text-white transition hover:bg-[#e11d48]"
          >
            🎧 Ir al reproductor →
          </Link>
          <p className="mt-5 text-xs text-[#7d6f74]">
            ¿Dudas o pedidos? Escríbenos por WhatsApp y te avisamos cuando la venta esté activa.
          </p>
        </div>
      </main>

      <footer className="border-t border-[#241a1e] py-8 text-center text-xs text-[#7d6f74]">
        Tienda de música DJ Trucho Hd — Catálogo de ejemplo, ventas próximamente.
      </footer>
    </div>
  );
}
