"use client";

import React, { useState } from "react";
import Link from "next/link";

// Tu WhatsApp (con código de país, sin el signo +)
const WHATSAPP_NUMBER = "18097911746";

type Item = { t: string; pronto?: boolean };

type Plan = {
  id: string;
  nombre: string;
  mensual: string;
  anual: string;
  sufijoMensual: string;
  sufijoAnual: string;
  destacado?: boolean;
  etiqueta?: string;
  items: Item[];
};

const PLANES: Plan[] = [
  {
    id: "gratis",
    nombre: "Gratis",
    mensual: "US$0",
    anual: "US$0",
    sufijoMensual: "para siempre",
    sufijoAnual: "para siempre",
    items: [
      { t: "5 clips guardados en total" },
      { t: "Hasta 65 segundos por clip" },
      { t: "El clip se cuenta cuando lo guardas" },
      { t: "Calidad hasta 720p" },
      { t: "Subtítulos automáticos" },
      { t: "Con marca de agua de Clips Limpieza" },
    ],
  },
  {
    id: "editor",
    nombre: "Editor",
    mensual: "US$4",
    anual: "US$39",
    sufijoMensual: "/ mes",
    sufijoAnual: "/ año (ahorras US$9)",
    etiqueta: "SOLO EDITOR",
    items: [
      { t: "Clips ilimitados durante todo el mes" },
      { t: "Todas las herramientas del editor" },
      { t: "Solo con videos subidos desde tu equipo (archivo)" },
      { t: "Sin enlaces de YouTube, TikTok ni otras plataformas" },
      { t: "Calidad hasta 1080p" },
      { t: "Sin marca de agua de la plataforma" },
      { t: "Subtítulos automáticos" },
      { t: "Tu propia marca de agua (logo o texto)", pronto: true },
      { t: "Efectos y filtros gratis", pronto: true },
      { t: "Sonidos libres de copyright", pronto: true },
    ],
  },
  {
    id: "pro",
    nombre: "Pro",
    mensual: "US$5.99",
    anual: "US$49",
    sufijoMensual: "/ mes",
    sufijoAnual: "/ año (2 meses gratis)",
    destacado: true,
    etiqueta: "MÁS POPULAR",
    items: [
      { t: "Todo lo del plan Editor" },
      { t: "Videos por archivo y por enlace (YouTube y más)" },
      { t: "60 clips al día (1 clip cada 120 segundos)" },
      { t: "Hasta 180 segundos por clip" },
      { t: "Calidad hasta 1080p" },
      { t: "Clips automáticos con IA", pronto: true },
      { t: "Soporte directo por WhatsApp" },
    ],
  },
  {
    id: "estudio",
    nombre: "Estudio",
    mensual: "US$12",
    anual: "US$99",
    sufijoMensual: "/ mes",
    sufijoAnual: "/ año (ahorras US$45)",
    etiqueta: "MÁS CLIPS",
    items: [
      { t: "Todo lo del plan Pro" },
      { t: "150 clips al día (1 clip cada 120 segundos)" },
      { t: "Hasta 300 segundos por clip" },
      { t: "Calidad hasta 1080p" },
      { t: "Clips automáticos con IA", pronto: true },
      { t: "Atención prioritaria por WhatsApp" },
    ],
  },
  {
    id: "agencia",
    nombre: "Agencia",
    mensual: "US$20",
    anual: "US$169",
    sufijoMensual: "/ mes",
    sufijoAnual: "/ año (ahorras US$71)",
    etiqueta: "MÁXIMO",
    items: [
      { t: "Todo lo del plan Estudio" },
      { t: "400 clips al día (1 clip cada 120 segundos)" },
      { t: "Hasta 600 segundos por clip" },
      { t: "Ideal para creadores y equipos que clipean todos los días" },
      { t: "Atención prioritaria por WhatsApp" },
    ],
  },
];

const HERRAMIENTAS: {
  n: string;
  tag: string;
  titulo: string;
  desc: string;
  pronto?: boolean;
}[] = [
  {
    n: "01",
    tag: "RECORTE",
    titulo: "Encuentra el momento",
    desc: "Marca el inicio y el fin, prueba el corte y genera tu clip en segundos.",
  },
  {
    n: "02",
    tag: "FORMATO",
    titulo: "Listo para TikTok, Reels y Shorts",
    desc: "Formato vertical 9:16, cuadrado o horizontal, con calidad hasta 1080p.",
  },
  {
    n: "03",
    tag: "SUBTÍTULOS",
    titulo: "Texto que sigue la voz",
    desc: "Subtítulos automáticos grandes que puedes ubicar donde mejor se vean.",
  },
  {
    n: "04",
    tag: "MARCA DE AGUA",
    titulo: "Tu marca en cada clip",
    desc: "Sube tu logo o escribe tu usuario, elige posición, tamaño y transparencia.",
    pronto: true,
  },
  {
    n: "05",
    tag: "EFECTOS",
    titulo: "Filtros y efectos gratis",
    desc: "Transiciones, filtros de color y efectos de texto para que el clip destaque.",
    pronto: true,
  },
  {
    n: "06",
    tag: "SONIDOS",
    titulo: "Sonidos libres de copyright",
    desc: "Biblioteca de sonidos y música que puedes usar sin que te bloqueen el video.",
    pronto: true,
  },
];

const PREGUNTAS = [
  {
    q: "¿Cómo pago?",
    a: "Eliges tu plan, pulsas el botón de WhatsApp y hablas directo conmigo. Cuando recibo tu pago te envío un código único para activar tu plan.",
  },
  {
    q: "¿Cómo se cuentan los clips?",
    a: "Un clip se cuenta cuando lo guardas. En el plan Gratis tienes 5 clips de hasta 65 segundos. En los planes Pro, Estudio y Agencia, cada 120 segundos de clip cuenta como 1 clip: uno de 100 segundos cuenta 1 y uno de 180 segundos cuenta 2. El plan Editor no tiene límite de clips.",
  },
  {
    q: "¿Qué incluye el plan Editor de US$4?",
    a: "Clips ilimitados durante todo el mes con todas las herramientas del editor, pero solo con videos que subas desde tu equipo. No usa enlaces de YouTube, TikTok ni otras plataformas. Si quieres usar enlaces, desde el plan Pro los tienes incluidos.",
  },
  {
    q: "¿Qué plan me conviene?",
    a: "Si solo editas videos que ya tienes en tu equipo, el plan Editor. Si quieres trabajar con enlaces, Pro. Si clipeas todos los días y necesitas más cantidad y clips más largos, Estudio o Agencia.",
  },
  {
    q: "¿Puedo probar antes de pagar?",
    a: "Sí. El plan Gratis te deja guardar 5 clips sin tarjeta. Pruebas el editor y decides después.",
  },
  {
    q: "¿Mis videos se suben a algún servidor?",
    a: "El procesamiento se hace en tu propio equipo, en tu navegador. Tus videos no se guardan en nuestros servidores.",
  },
  {
    q: "¿El código lo puedo compartir?",
    a: "No. Cada código es único para un solo cliente y un solo acceso.",
  },
  {
    q: "¿Qué significa Próximamente?",
    a: "Son herramientas que estamos construyendo ahora mismo. Los clientes de pago las reciben apenas salgan, sin pagar de más.",
  },
];

export default function HomePage() {
  const [anual, setAnual] = useState(false);

  const linkWhatsApp = (mensaje: string) =>
    `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(mensaje)}`;

  return (
    <div className="min-h-screen bg-[#090708] font-sans text-[#f5f0f2] selection:bg-[#f43f5e] selection:text-white">
      {/* Navegación */}
      <header className="sticky top-0 z-50 border-b border-[#241a1e] bg-[#090708]/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f43f5e] text-xs font-black text-white shadow-lg shadow-[#f43f5e]/20">
              ▶
            </div>
            <span className="text-sm font-bold tracking-tight text-white">
              Clips Limpieza
            </span>
          </div>

          <nav className="hidden items-center gap-8 text-xs font-medium text-[#a89ca1] md:flex">
            <a href="#herramientas" className="transition hover:text-white">
              Herramientas
            </a>
            <a href="#como-funciona" className="transition hover:text-white">
              Cómo funciona
            </a>
            <a href="#planes" className="transition hover:text-white">
              Planes
            </a>
            <a href="#preguntas" className="transition hover:text-white">
              Preguntas
            </a>
          </nav>

          <Link
            href="/editor"
            className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-bold text-black transition hover:bg-gray-200"
          >
            Abrir editor <span>→</span>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative mx-auto max-w-6xl px-6 pb-14 pt-16 text-center">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-gradient-to-b from-[#f43f5e]/10 to-transparent" />
        <span className="mb-4 inline-block text-[10px] font-bold uppercase tracking-[0.2em] text-[#f43f5e]">
          DEL VIDEO AL CLIP EN MINUTOS
        </span>
        <h1 className="mx-auto mb-5 max-w-3xl text-4xl font-black leading-[1.08] tracking-tight text-white md:text-6xl">
          Tus mejores momentos,{" "}
          <span className="text-[#f43f5e]">listos para compartir.</span>
        </h1>
        <p className="mx-auto mb-8 max-w-2xl text-sm leading-relaxed text-[#a89ca1] md:text-base">
          Corta, ponle{" "}
          <span className="font-semibold text-white">subtítulos</span>, formato
          vertical y calidad hasta{" "}
          <span className="font-semibold text-white">1080p</span>. Todo desde
          tu navegador, sin instalar nada y sin pagar para empezar.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/editor"
            className="rounded-lg bg-[#f43f5e] px-6 py-3 text-xs font-bold text-white shadow-lg shadow-[#f43f5e]/20 transition hover:bg-[#e11d48]"
          >
            Crear mi primer clip gratis →
          </Link>
          <a
            href="#planes"
            className="rounded-lg border border-[#2b1e23] bg-[#140e11] px-6 py-3 text-xs font-bold text-white transition hover:bg-[#1d1418]"
          >
            Ver planes
          </a>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-[11px] text-[#8f8287]">
          <span>✔ Sin tarjeta para empezar</span>
          <span>✔ Funciona en celular y PC</span>
          <span>✔ Tus videos se procesan en tu equipo</span>
          <span>✔ Soporte directo por WhatsApp</span>
        </div>
      </section>

      {/* Herramientas */}
      <section id="herramientas" className="mx-auto max-w-6xl px-6 py-16">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#f43f5e]">
          HERRAMIENTAS DEL EDITOR
        </p>
        <h2 className="mb-8 text-3xl font-black text-white md:text-4xl">
          Dale forma a cada clip.
        </h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {HERRAMIENTAS.map((h) => (
            <div
              key={h.n}
              className="rounded-2xl border border-[#261b20] bg-[#110c0e] p-6"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#f43f5e]">
                  {h.n} / {h.tag}
                </span>
                {h.pronto && (
                  <span className="rounded-full bg-[#f59e0b]/15 px-2 py-0.5 text-[9px] font-bold uppercase text-[#f59e0b]">
                    Próximamente
                  </span>
                )}
              </div>
              <h3 className="mb-2 mt-2 text-lg font-bold text-white">
                {h.titulo}
              </h3>
              <p className="text-xs leading-relaxed text-[#9e9196]">{h.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Cómo funciona */}
      <section
        id="como-funciona"
        className="mx-auto max-w-6xl border-t border-[#1e1519] px-6 py-14"
      >
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#f43f5e]">
              CÓMO FUNCIONA
            </p>
            <h2 className="text-3xl font-black text-white md:text-4xl">
              Del video al MP4.
            </h2>
          </div>

          <ol className="max-w-md space-y-2 text-xs text-[#b5a8ad]">
            <li>
              <strong className="text-white">1. Carga el video.</strong> Sube
              un archivo desde tu equipo (o pega un enlace desde el plan Pro).
            </li>
            <li>
              <strong className="text-white">2. Prepara el clip.</strong> Elige
              el tramo, el formato y la calidad.
            </li>
            <li>
              <strong className="text-white">3. Reproduce y descarga.</strong>{" "}
              Revisa el resultado y guarda tu MP4.
            </li>
          </ol>

          <Link
            href="/editor"
            className="self-start rounded-full bg-[#f43f5e] px-5 py-2.5 text-xs font-bold text-white transition hover:bg-[#e11d48] md:self-center"
          >
            Ir al editor ↗
          </Link>
        </div>
      </section>

      {/* Planes */}
      <section
        id="planes"
        className="mx-auto max-w-6xl border-t border-[#1e1519] px-6 py-16"
      >
        <div className="mb-10 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#f43f5e]">
              PLANES
            </p>
            <h2 className="mb-2 text-3xl font-black text-white md:text-4xl">
              Precios claros, sin sorpresas.
            </h2>
            <p className="text-xs text-[#9e9196]">
              Empieza gratis. Si te gusta, activa tu plan por WhatsApp.
            </p>
          </div>

          <div className="inline-flex items-center self-start rounded-full border border-[#2b1e23] bg-[#140e11] p-1">
            <button
              onClick={() => setAnual(false)}
              className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
                !anual ? "bg-[#f43f5e] text-white" : "text-[#9e9196]"
              }`}
            >
              Mensual
            </button>
            <button
              onClick={() => setAnual(true)}
              className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
                anual ? "bg-[#f43f5e] text-white" : "text-[#9e9196]"
              }`}
            >
              Anual (Ahorra)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {PLANES.map((p) => {
            const precio = anual ? p.anual : p.mensual;
            const sufijo = anual ? p.sufijoAnual : p.sufijoMensual;
            const esGratis = p.id === "gratis";
            return (
              <div
                key={p.id}
                className={`flex flex-col justify-between rounded-2xl p-6 ${
                  p.destacado
                    ? "border border-[#f43f5e]/60 bg-[#150d10] shadow-xl shadow-[#f43f5e]/5"
                    : "border border-[#261b20] bg-[#110c0e]"
                }`}
              >
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-base font-bold text-white">
                      {p.nombre}
                    </h3>
                    {p.etiqueta && (
                      <span className="rounded-full bg-[#f43f5e]/20 px-2 py-0.5 text-[10px] font-bold text-[#f43f5e]">
                        {p.etiqueta}
                      </span>
                    )}
                  </div>

                  <div className="mb-5">
                    <span className="text-3xl font-black text-white">
                      {precio}
                    </span>
                    <span className="ml-1.5 text-xs text-[#8f8287]">
                      {sufijo}
                    </span>
                  </div>

                  <ul className="mb-8 space-y-2.5 text-xs text-[#d6cbcf]">
                    {p.items.map((it) => (
                      <li key={it.t} className="flex items-start gap-2">
                        <span className="text-[#f43f5e]">✓</span>
                        <span>
                          {it.t}
                          {it.pronto && (
                            <span className="ml-1.5 rounded-full bg-[#f59e0b]/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#f59e0b]">
                              Pronto
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {esGratis ? (
                  <Link
                    href="/editor"
                    className="block w-full rounded-lg border border-[#33242a] bg-[#1d1518] py-2.5 text-center text-xs font-bold text-white transition hover:bg-[#2a1e23]"
                  >
                    Empezar gratis
                  </Link>
                ) : (
                  <div className="space-y-2">
                    <Link
                      href="/editor"
                      className="block w-full rounded-lg bg-[#1d1518] py-2 text-center text-xs font-semibold text-white transition hover:bg-[#2a1e23]"
                    >
                      Probar el editor
                    </Link>
                    <a
                      href={linkWhatsApp(
                        `Hola, quiero activar el plan ${p.nombre.toUpperCase()} (${precio} ${sufijo}).`
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full rounded-lg bg-[#16a34a] py-2.5 text-center text-xs font-bold text-white transition hover:bg-[#15803d]"
                    >
                      💬 Comprar por WhatsApp
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="mt-6 text-center text-[11px] text-[#7a6e73]">
          Al pagar recibes un código único de activación. Un código, un cliente,
          un acceso.
        </p>
      </section>

      {/* Preguntas */}
      <section
        id="preguntas"
        className="mx-auto max-w-3xl border-t border-[#1e1519] px-6 py-16"
      >
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#f43f5e]">
          PREGUNTAS FRECUENTES
        </p>
        <h2 className="mb-8 text-3xl font-black text-white md:text-4xl">
          Antes de empezar.
        </h2>

        <div className="space-y-3">
          {PREGUNTAS.map((f) => (
            <details
              key={f.q}
              className="group rounded-xl border border-[#261b20] bg-[#110c0e] p-4"
            >
              <summary className="cursor-pointer list-none text-sm font-bold text-white">
                <span className="mr-2 text-[#f43f5e] group-open:hidden">+</span>
                <span className="mr-2 hidden text-[#f43f5e] group-open:inline">
                  −
                </span>
                {f.q}
              </summary>
              <p className="mt-3 text-xs leading-relaxed text-[#a89ca1]">
                {f.a}
              </p>
            </details>
          ))}
        </div>

        <div className="mt-10 text-center">
          <a
            href={linkWhatsApp("Hola, tengo una pregunta sobre Clips Limpieza.")}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-lg bg-[#16a34a] px-6 py-3 text-xs font-bold text-white transition hover:bg-[#15803d]"
          >
            💬 Hablar conmigo por WhatsApp
          </a>
        </div>
      </section>

      {/* Pie */}
      <footer className="border-t border-[#1e1519] py-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 text-[11px] text-[#7a6e73]">
          <span>CLIPS LIMPIEZA</span>
          <span>Procesamiento en tu equipo</span>
        </div>
      </footer>
    </div>
  );
}