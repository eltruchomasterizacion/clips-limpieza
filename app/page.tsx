"use client";

import React, { useState } from "react";
import Link from "next/link";

// CAMBIA ESTE NÚMERO POR TU WHATSAPP REAL (con código de país, sin el signo +)
const WHATSAPP_NUMBER = "18097911746";

export default function HomePage() {
  const [anual, setAnual] = useState(false);

  const crearLinkWhatsApp = (mensaje: string) => {
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(mensaje)}`;
  };

  return (
    <div className="min-h-screen bg-[#090708] text-[#f5f0f2] font-sans selection:bg-[#f43f5e] selection:text-white">
      {/* Barra de Navegación Superior */}
      <header className="sticky top-0 z-50 border-b border-[#241a1e] bg-[#090708]/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#f43f5e] flex items-center justify-center font-black text-white text-xs shadow-lg shadow-[#f43f5e]/20">
              ▶
            </div>
            <span className="font-bold text-sm tracking-tight text-white">
              Clips Limpieza
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-xs text-[#a89ca1] font-medium">
            <a href="#herramientas" className="hover:text-white transition">
              Herramientas
            </a>
            <a href="#como-funciona" className="hover:text-white transition">
              Cómo funciona
            </a>
            <a href="#planes" className="hover:text-white transition">
              Planes
            </a>
          </nav>

          <Link
            href="/editor"
            className="bg-white text-black hover:bg-gray-200 text-xs font-bold px-4 py-2 rounded-full transition flex items-center gap-1.5"
          >
            Abrir editor <span>→</span>
          </Link>
        </div>
      </header>

      {/* Hero Principal */}
      <section className="max-w-6xl mx-auto px-6 pt-16 pb-12 text-center">
        <span className="inline-block text-[10px] font-bold tracking-[0.2em] uppercase text-[#f43f5e] mb-4">
          CLIPS AUTOMÁTICOS PARA TUS EN VIVOS DE LIMPIEZA
        </span>
        <h1 className="text-4xl md:text-6xl font-black tracking-tight text-white max-w-3xl mx-auto leading-[1.08] mb-5">
          Tú limpias, nosotros clipeamos.
        </h1>
        <p className="text-sm md:text-base text-[#a89ca1] max-w-2xl mx-auto mb-8 leading-relaxed">
          Cuando terminas tu live, ya tienes tus clips listos con{" "}
          <span className="text-white font-semibold">antes y después</span>,{" "}
          <span className="text-white font-semibold">subtítulos automáticos</span>{" "}
          y <span className="text-white font-semibold">audio limpio sin copyright</span>.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/editor"
            className="bg-[#f43f5e] hover:bg-[#e11d48] text-white text-xs font-bold px-6 py-3 rounded-lg transition shadow-lg shadow-[#f43f5e]/20"
          >
            Entrar al estudio gratis →
          </Link>
          <a
            href="#planes"
            className="bg-[#140e11] hover:bg-[#1d1418] border border-[#2b1e23] text-white text-xs font-bold px-6 py-3 rounded-lg transition"
          >
            Ver planes de limpieza
          </a>
        </div>
      </section>

      {/* Sección 01: Herramientas del Editor */}
      <section id="herramientas" className="max-w-6xl mx-auto px-6 py-16">
        <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#f43f5e] mb-2">
          HERRAMIENTAS DEL EDITOR
        </p>
        <h2 className="text-3xl md:text-4xl font-black text-white mb-8">
          Dale forma a cada clip.
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#110c0e] border border-[#261b20] rounded-2xl p-6">
            <span className="text-[10px] font-bold tracking-widest uppercase text-[#f43f5e]">
              01 / RECORTE Y ANTES-DESPUÉS
            </span>
            <h3 className="text-lg font-bold text-white mt-2 mb-2">
              Encuentra el momento
            </h3>
            <p className="text-xs text-[#9e9196] leading-relaxed">
              Marca el inicio y el fin de tu limpieza o detecta automáticamente
              el momento más satisfactorio del directo.
            </p>
          </div>

          <div className="bg-[#110c0e] border border-[#261b20] rounded-2xl p-6">
            <span className="text-[10px] font-bold tracking-widest uppercase text-[#f43f5e]">
              02 / AUDIO SIN COPYRIGHT
            </span>
            <h3 className="text-lg font-bold text-white mt-2 mb-2">
              Limpieza de sonido
            </h3>
            <p className="text-xs text-[#9e9196] leading-relaxed">
              Quitamos la música o TV de fondo para evitar bloqueos y añadimos
              pistas libres listas para TikTok, Reels y Shorts.
            </p>
          </div>

          <div className="bg-[#110c0e] border border-[#261b20] rounded-2xl p-6">
            <span className="text-[10px] font-bold tracking-widest uppercase text-[#f43f5e]">
              03 / SUBTÍTULOS
            </span>
            <h3 className="text-lg font-bold text-white mt-2 mb-2">
              Texto que sigue la voz
            </h3>
            <p className="text-xs text-[#9e9196] leading-relaxed">
              Genera subtítulos automáticos grandes, cambia su estilo y ajusta
              dónde aparecen en formato vertical 9:16.
            </p>
          </div>
        </div>
      </section>

      {/* Sección 02: Cómo Funciona */}
      <section
        id="como-funciona"
        className="max-w-6xl mx-auto px-6 py-12 border-t border-[#1e1519]"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#f43f5e] mb-2">
              CÓMO FUNCIONA
            </p>
            <h2 className="text-3xl md:text-4xl font-black text-white">
              Del enlace al MP4.
            </h2>
          </div>

          <ol className="text-xs text-[#b5a8ad] space-y-2 max-w-md">
            <li>
              <strong className="text-white">1. Carga el video.</strong> Usa un
              enlace de tu directo o importa una grabación desde tu equipo.
            </li>
            <li>
              <strong className="text-white">2. Prepara el clip.</strong> Elige
              el tramo, el formato 9:16 vertical y la calidad hasta 1080p.
            </li>
            <li>
              <strong className="text-white">3. Reproduce y descarga.</strong>{" "}
              Revisa el clip terminado en el editor y guarda el MP4 directo.
            </li>
          </ol>

          <Link
            href="/editor"
            className="bg-[#f43f5e] hover:bg-[#e11d48] text-white text-xs font-bold px-5 py-2.5 rounded-full transition self-start md:self-center"
          >
            Ir al editor ↗
          </Link>
        </div>
      </section>

      {/* Sección 03: Tus Planes Personalizados */}
      <section
        id="planes"
        className="max-w-6xl mx-auto px-6 py-16 border-t border-[#1e1519]"
      >
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
          <div>
            <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#f43f5e] mb-2">
              PLANES
            </p>
            <h2 className="text-3xl md:text-4xl font-black text-white mb-2">
              Elige cómo quieres clipear.
            </h2>
            <p className="text-xs text-[#9e9196]">
              Empieza gratis o activa un plan de limpieza con soporte directo
              por WhatsApp.
            </p>
          </div>

          {/* Selector Mensual / Anual */}
          <div className="inline-flex items-center bg-[#140e11] border border-[#2b1e23] rounded-full p-1 self-start">
            <button
              onClick={() => setAnual(false)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition ${
                !anual ? "bg-[#f43f5e] text-white" : "text-[#9e9196]"
              }`}
            >
              Mensual
            </button>
            <button
              onClick={() => setAnual(true)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition ${
                anual ? "bg-[#f43f5e] text-white" : "text-[#9e9196]"
              }`}
            >
              Anual (Ahorra)
            </button>
          </div>
        </div>

        {/* 4 Columnas de Planes */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. GRATIS */}
          <div className="bg-[#110c0e] border border-[#261b20] rounded-2xl p-6 flex flex-col justify-between">
            <div>
              <h3 className="text-base font-bold text-white mb-2">Gratis</h3>
              <div className="mb-5">
                <span className="text-3xl font-black text-white">US$0</span>
                <span className="text-xs text-[#8f8287] ml-1.5">
                  - Sin costo
                </span>
              </div>
              <ul className="text-xs text-[#c7bcc0] space-y-2.5 mb-8">
                <li>• 2 clips al día</li>
                <li>• Hasta 60 segundos por clip</li>
                <li>• Calidad 720p</li>
                <li>• Con marca de agua</li>
                <li>• 1 en vivo al día de hasta 60 minutos</li>
              </ul>
            </div>

            <Link
              href="/editor"
              className="w-full py-2.5 rounded-lg bg-[#1d1518] hover:bg-[#2a1e23] border border-[#33242a] text-center text-xs font-bold text-white transition block"
            >
              Empezar gratis
            </Link>
          </div>

          {/* 2. LIMPIEZA */}
          <div className="bg-[#110c0e] border border-[#261b20] rounded-2xl p-6 flex flex-col justify-between">
            <div>
              <h3 className="text-base font-bold text-white mb-2">Limpieza</h3>
              <div className="mb-5">
                <span className="text-3xl font-black text-white">
                  {anual ? "US$99" : "US$9.99"}
                </span>
                <span className="text-xs text-[#8f8287] ml-1">
                  {anual ? "/ año" : "/ mes"}
                </span>
              </div>
              <ul className="text-xs text-[#c7bcc0] space-y-2.5 mb-8">
                <li>• 10 clips al día</li>
                <li>• Hasta 120 segundos por clip</li>
                <li>• Calidad 1080p, sin marca de agua</li>
                <li>• 1 en vivo al día de hasta 2 horas</li>
                <li>
                  • Limpieza de audio con copyright (quitamos música/TV de fondo
                  y ponemos música libre)
                </li>
                <li>• Subtítulos automáticos grandes</li>
                <li>• 300 minutos de en vivo al mes</li>
              </ul>
            </div>

            <div className="space-y-2">
              <Link
                href="/editor"
                className="w-full py-2 rounded-lg bg-[#1d1518] hover:bg-[#2a1e23] text-center text-xs font-semibold text-white transition block"
              >
                Probar estudio
              </Link>
              <a
                href={crearLinkWhatsApp(
                  `Hola, quiero activar el Plan LIMPIEZA (${
                    anual ? "US$99 / año" : "US$9.99 / mes"
                  }) para mis en vivos.`
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 rounded-lg bg-[#16a34a] hover:bg-[#15803d] text-center text-xs font-bold text-white transition block"
              >
                💬 Comprar por WhatsApp
              </a>
            </div>
          </div>

          {/* 3. PRO LIMPIEZA */}
          <div className="bg-[#150d10] border border-[#f43f5e]/60 rounded-2xl p-6 flex flex-col justify-between shadow-xl shadow-[#f43f5e]/5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-bold text-white">Pro Limpieza</h3>
                <span className="text-[10px] font-bold bg-[#f43f5e]/20 text-[#f43f5e] px-2 py-0.5 rounded-full">
                  RECOMENDADO
                </span>
              </div>
              <div className="mb-5">
                <span className="text-3xl font-black text-white">
                  {anual ? "US$169" : "US$16.99"}
                </span>
                <span className="text-xs text-[#8f8287] ml-1">
                  {anual ? "/ año" : "/ mes"}
                </span>
              </div>
              <ul className="text-xs text-[#e0d6da] space-y-2.5 mb-8">
                <li>• 25 clips al día</li>
                <li>• Hasta 180 segundos por clip</li>
                <li>• Calidad 1080p, sin marca de agua</li>
                <li>• Hasta 3 en vivos al día</li>
                <li>• Antes y después automático</li>
                <li>• Detector de momento satisfactorio</li>
                <li>• Quita silencios y partes aburridas</li>
                <li>• Limpieza de audio con copyright</li>
                <li>• Subtítulos automáticos</li>
                <li>• 900 minutos de en vivo al mes</li>
              </ul>
            </div>

            <div className="space-y-2">
              <Link
                href="/editor"
                className="w-full py-2 rounded-lg bg-[#f43f5e] hover:bg-[#e11d48] text-center text-xs font-bold text-white transition block"
              >
                Entrar al editor
              </Link>
              <a
                href={crearLinkWhatsApp(
                  `Hola, quiero activar el Plan PRO LIMPIEZA (${
                    anual ? "US$169 / año" : "US$16.99 / mes"
                  }) para mis en vivos.`
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 rounded-lg bg-[#16a34a] hover:bg-[#15803d] text-center text-xs font-bold text-white transition block"
              >
                💬 Comprar por WhatsApp
              </a>
            </div>
          </div>

          {/* 4. NEGOCIO DE LIMPIEZA */}
          <div className="bg-[#110c0e] border border-[#261b20] rounded-2xl p-6 flex flex-col justify-between">
            <div>
              <h3 className="text-base font-bold text-white mb-2">
                Negocio de Limpieza
              </h3>
              <div className="mb-5">
                <span className="text-3xl font-black text-white">
                  {anual ? "US$279" : "US$27.99"}
                </span>
                <span className="text-xs text-[#8f8287] ml-1">
                  {anual ? "/ año" : "/ mes"}
                </span>
              </div>
              <ul className="text-xs text-[#c7bcc0] space-y-2.5 mb-8">
                <li>• 60 clips al día</li>
                <li>• Hasta 300 segundos por clip</li>
                <li>• Calidad 1080p, sin marca de agua</li>
                <li>• En vivos ilimitados</li>
                <li>• Tu logo en los clips</li>
                <li>• Link de tus productos en los clips</li>
                <li>• Plantillas antes y después</li>
                <li>• Todo lo del Pro</li>
                <li>• 2,000 minutos de en vivo al mes</li>
              </ul>
            </div>

            <div className="space-y-2">
              <Link
                href="/editor"
                className="w-full py-2 rounded-lg bg-[#1d1518] hover:bg-[#2a1e23] text-center text-xs font-semibold text-white transition block"
              >
                Probar estudio
              </Link>
              <a
                href={crearLinkWhatsApp(
                  `Hola, quiero activar el Plan NEGOCIO DE LIMPIEZA (${
                    anual ? "US$279 / año" : "US$27.99 / mes"
                  }).`
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 rounded-lg bg-[#16a34a] hover:bg-[#15803d] text-center text-xs font-bold text-white transition block"
              >
                💬 Comprar por WhatsApp
              </a>
            </div>
          </div>
        </div>

        {/* Tarjeta Inferior: Pago único por 1 en vivo */}
        <div className="mt-6 bg-[#130d10] border border-[#2b1e23] rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#f43f5e]">
              ¿NO QUIERES MENSUAL?
            </span>
            <h3 className="text-lg font-black text-white mt-0.5">
              US$2.99 por en vivo
            </h3>
            <p className="text-xs text-[#a89ca1] mt-1">
              Te clipeamos 1 en vivo completo y te entregamos tus mejores clips
              listos para publicar.
            </p>
          </div>

          <a
            href={crearLinkWhatsApp(
              "Hola, quiero pagar US$2.99 por 1 solo en vivo completo sin mensualidad."
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 rounded-lg bg-[#16a34a] hover:bg-[#15803d] text-xs font-bold text-white transition whitespace-nowrap"
          >
            💬 Pedir 1 en vivo por WhatsApp
          </a>
        </div>
      </section>

      {/* Pie de página */}
      <footer className="border-t border-[#1e1519] py-6">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between text-[11px] text-[#7a6e73]">
          <span>CLIPS LIMPIEZA</span>
          <span>Procesamiento en tu equipo</span>
        </div>
      </footer>
    </div>
  );
}