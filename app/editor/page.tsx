"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

const WHATSAPP_NUMBER = "18097911746";

type Seccion = "resumen" | "directos" | "videos" | "editor" | "biblioteca" | "activar";
type PlanId = "gratis" | "editor" | "pro" | "estudio" | "agencia";
type PosMarca = "tl" | "tr" | "bl" | "br" | "c";
type PosInterna = PosMarca | "bc";
type ModoMarca = "ninguna" | "texto" | "logo";
type PosTexto = "arriba" | "centro" | "abajo";
type FiltroId = "ninguno" | "bn" | "calido" | "frio" | "vivido" | "vintage";
type OrigenSonido = "sintetico" | "catalogo" | "archivo";

interface ClipGuardado {
  id: string;
  titulo: string;
  inicio: string;
  fin: string;
  formato: string;
  url?: string;
  papelera?: boolean;
}

interface TextoClip {
  id: string;
  texto: string;
  desde: string;
  hasta: string;
  pos: PosTexto;
  tam: number;
  color: string;
  fondo: boolean;
}

interface CapaSonido {
  id: string;
  origen: OrigenSonido;
  ref: string;
  archivo?: File;
  nombre: string;
  inicio: string;
  volumen: number;
  repetir: boolean;
}

interface ItemBiblioteca {
  id: string;
  nombre: string;
  tipo: "efecto" | "musica";
  origen: "sintetico" | "catalogo";
  archivo?: string;
  emoji: string;
}

interface LimitesPlan {
  nombre: string;
  maxSeg: number; // 0 = sin límite
  maxCalidad: "720p" | "1080p";
  totalClips: number;
  clipsDia: number;
  ilimitado: boolean;
  enlaces: boolean;
  marcaPropia: boolean;
  marcaPlataforma: boolean;
}

const PLANES: Record<PlanId, LimitesPlan> = {
  gratis: { nombre: "Gratis", maxSeg: 65, maxCalidad: "720p", totalClips: 5, clipsDia: 0, ilimitado: false, enlaces: false, marcaPropia: false, marcaPlataforma: true },
  editor: { nombre: "Editor", maxSeg: 0, maxCalidad: "1080p", totalClips: 0, clipsDia: 0, ilimitado: true, enlaces: false, marcaPropia: true, marcaPlataforma: false },
  pro: { nombre: "Pro", maxSeg: 180, maxCalidad: "1080p", totalClips: 0, clipsDia: 60, ilimitado: false, enlaces: true, marcaPropia: true, marcaPlataforma: false },
  estudio: { nombre: "Estudio", maxSeg: 300, maxCalidad: "1080p", totalClips: 0, clipsDia: 150, ilimitado: false, enlaces: true, marcaPropia: true, marcaPlataforma: false },
  agencia: { nombre: "Agencia", maxSeg: 600, maxCalidad: "1080p", totalClips: 0, clipsDia: 400, ilimitado: false, enlaces: true, marcaPropia: true, marcaPlataforma: false },
};

const FILTROS: Record<FiltroId, { nombre: string; ff: string; css: string }> = {
  ninguno: { nombre: "Normal", ff: "", css: "" },
  bn: { nombre: "Blanco y negro", ff: "hue=s=0", css: "grayscale(1)" },
  calido: { nombre: "Cálido", ff: "colorchannelmixer=rr=1.08:gg=1.0:bb=0.9", css: "sepia(0.25) saturate(1.2)" },
  frio: { nombre: "Frío", ff: "colorchannelmixer=rr=0.9:gg=1.0:bb=1.1", css: "hue-rotate(12deg) saturate(1.1)" },
  vivido: { nombre: "Vívido", ff: "eq=saturation=1.5:contrast=1.1", css: "saturate(1.5) contrast(1.1)" },
  vintage: { nombre: "Vintage", ff: "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131", css: "sepia(0.8)" },
};

const normalizarPlan = (txt: string): PlanId => {
  const t = txt.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (t.includes("agencia")) return "agencia";
  if (t.includes("estudio")) return "estudio";
  if (t.includes("editor")) return "editor";
  if (t.includes("gratis")) return "gratis";
  return "pro";
};

const HASH_POR_SECCION: Record<Seccion, string> = {
  resumen: "",
  directos: "directos",
  videos: "videos",
  editor: "corte",
  biblioteca: "clips-guardados",
  activar: "activar-licencia",
};

const SECCION_POR_HASH: Record<string, Seccion> = {
  directos: "directos",
  videos: "videos",
  corte: "editor",
  "clips-guardados": "biblioteca",
  "activar-licencia": "activar",
};

const MENU: { id: Seccion; label: string; icono: string }[] = [
  { id: "resumen", label: "Resumen", icono: "■" },
  { id: "directos", label: "En Vivos", icono: "●" },
  { id: "videos", label: "Videos con enlace", icono: "▷" },
  { id: "editor", label: "Editor y Cortes", icono: "✂" },
  { id: "biblioteca", label: "Biblioteca", icono: "▤" },
  { id: "activar", label: "🔑 Licencia", icono: "★" },
];

const NOMBRE_SECCION: Record<Seccion, string> = {
  resumen: "Resumen",
  directos: "En Vivos",
  videos: "Videos con enlace",
  editor: "Editor",
  biblioteca: "Biblioteca",
  activar: "Activación",
};

const DIMENSIONES: Record<string, Record<string, [number, number]>> = {
  "9:16": { "720p": [720, 1280], "1080p": [1080, 1920] },
  "1:1": { "720p": [720, 720], "1080p": [1080, 1080] },
  "16:9": { "720p": [1280, 720], "1080p": [1920, 1080] },
};

const ANCHO_PREVIA: Record<string, string> = {
  "9:16": "w-44",
  "1:1": "w-56",
  "16:9": "w-full max-w-sm",
};

const POS_CLASE: Record<PosMarca, string> = {
  tl: "left-[4%] top-[4%]",
  tr: "right-[4%] top-[4%]",
  bl: "left-[4%] bottom-[4%]",
  br: "right-[4%] bottom-[4%]",
  c: "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
};

const POS_NOMBRE: Record<PosMarca, string> = {
  tl: "↖ Arriba izq.",
  tr: "↗ Arriba der.",
  c: "◎ Centro",
  bl: "↙ Abajo izq.",
  br: "↘ Abajo der.",
};

const POS_TEXTO_CLASE: Record<PosTexto, string> = {
  arriba: "top-[8%]",
  centro: "top-1/2 -translate-y-1/2",
  abajo: "bottom-[12%]",
};

const MAX_TEXTOS = 5;
const MAX_SONIDOS = 4;

// ---------- Sonidos creados por nosotros (sin copyright, se generan en tu navegador) ----------
const TASA = 44100;

const ruidoBuf = (ctx: BaseAudioContext, seg: number) => {
  const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seg), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
};

const tono = (
  ctx: OfflineAudioContext,
  tipo: OscillatorType,
  f0: number,
  f1: number,
  t0: number,
  dur: number,
  vol: number
) => {
  const o = ctx.createOscillator();
  o.type = tipo;
  o.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
};

const golpeRuido = (
  ctx: OfflineAudioContext,
  t0: number,
  dur: number,
  vol: number,
  tipoFiltro: BiquadFilterType,
  freq: number
) => {
  const n = ctx.createBufferSource();
  n.buffer = ruidoBuf(ctx, dur + 0.05);
  const f = ctx.createBiquadFilter();
  f.type = tipoFiltro;
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  n.connect(f);
  f.connect(g);
  g.connect(ctx.destination);
  n.start(t0);
};

const SONIDOS: {
  id: string;
  nombre: string;
  tipo: "efecto" | "musica";
  emoji: string;
  dur: number;
  gen: (ctx: OfflineAudioContext) => void;
}[] = [
  {
    id: "whoosh",
    nombre: "Whoosh",
    tipo: "efecto",
    emoji: "💨",
    dur: 1,
    gen: (ctx) => {
      const n = ctx.createBufferSource();
      n.buffer = ruidoBuf(ctx, 1);
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.Q.value = 1.5;
      f.frequency.setValueAtTime(300, 0);
      f.frequency.exponentialRampToValueAtTime(4500, 0.5);
      f.frequency.exponentialRampToValueAtTime(500, 1);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, 0);
      g.gain.exponentialRampToValueAtTime(1, 0.45);
      g.gain.exponentialRampToValueAtTime(0.0001, 1);
      n.connect(f);
      f.connect(g);
      g.connect(ctx.destination);
      n.start(0);
    },
  },
  {
    id: "pop",
    nombre: "Pop",
    tipo: "efecto",
    emoji: "💥",
    dur: 0.3,
    gen: (ctx) => tono(ctx, "sine", 700, 150, 0, 0.2, 0.9),
  },
  {
    id: "ding",
    nombre: "Ding",
    tipo: "efecto",
    emoji: "🔔",
    dur: 1.4,
    gen: (ctx) => {
      tono(ctx, "sine", 1318, 1318, 0, 1.3, 0.5);
      tono(ctx, "sine", 2637, 2637, 0, 0.9, 0.22);
      tono(ctx, "sine", 1976, 1976, 0, 1.0, 0.2);
    },
  },
  {
    id: "impacto",
    nombre: "Impacto grave",
    tipo: "efecto",
    emoji: "🥁",
    dur: 1.5,
    gen: (ctx) => {
      tono(ctx, "sine", 140, 35, 0, 1.4, 1);
      golpeRuido(ctx, 0, 0.25, 0.6, "lowpass", 900);
    },
  },
  {
    id: "subida",
    nombre: "Subida de tensión",
    tipo: "efecto",
    emoji: "📈",
    dur: 2.2,
    gen: (ctx) => {
      const n = ctx.createBufferSource();
      n.buffer = ruidoBuf(ctx, 2.2);
      const f = ctx.createBiquadFilter();
      f.type = "highpass";
      f.frequency.setValueAtTime(300, 0);
      f.frequency.exponentialRampToValueAtTime(6000, 2);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, 0);
      g.gain.exponentialRampToValueAtTime(0.9, 2);
      g.gain.exponentialRampToValueAtTime(0.0001, 2.2);
      n.connect(f);
      f.connect(g);
      g.connect(ctx.destination);
      n.start(0);
      tono(ctx, "sawtooth", 200, 1200, 0, 2, 0.25);
    },
  },
  {
    id: "laser",
    nombre: "Láser",
    tipo: "efecto",
    emoji: "🔫",
    dur: 0.5,
    gen: (ctx) => tono(ctx, "sawtooth", 1800, 150, 0, 0.35, 0.5),
  },
  {
    id: "notificacion",
    nombre: "Notificación",
    tipo: "efecto",
    emoji: "📲",
    dur: 0.7,
    gen: (ctx) => {
      tono(ctx, "sine", 880, 880, 0, 0.18, 0.6);
      tono(ctx, "sine", 1320, 1320, 0.16, 0.4, 0.6);
    },
  },
  {
    id: "ritmo",
    nombre: "Ritmo suave",
    tipo: "musica",
    emoji: "🎧",
    dur: 8,
    gen: (ctx) => {
      const b = 60 / 90;
      for (let i = 0; i < 12; i++) {
        const t = i * b;
        tono(ctx, "sine", 130, 45, t, 0.3, 0.9);
        golpeRuido(ctx, t + b / 2, 0.05, 0.25, "highpass", 7000);
        if (i % 2 === 1) golpeRuido(ctx, t, 0.15, 0.35, "bandpass", 1800);
      }
      const bajos = [55, 55, 65.41, 49];
      for (let i = 0; i < 6; i++) tono(ctx, "triangle", bajos[i % 4], bajos[i % 4], i * 2 * b, 2 * b * 0.9, 0.35);
    },
  },
  {
    id: "tension",
    nombre: "Tensión",
    tipo: "musica",
    emoji: "😨",
    dur: 8,
    gen: (ctx) => {
      tono(ctx, "sawtooth", 55, 55, 0, 8, 0.12);
      tono(ctx, "sine", 110, 116, 0, 8, 0.08);
      for (let i = 0; i < 8; i++) {
        tono(ctx, "sine", 70, 40, i, 0.5, 0.7);
        tono(ctx, "sine", 70, 40, i + 0.25, 0.4, 0.45);
      }
    },
  },
  {
    id: "alegre",
    nombre: "Alegre",
    tipo: "musica",
    emoji: "😄",
    dur: 8,
    gen: (ctx) => {
      const acordes = [
        [261.63, 329.63, 392],
        [196, 246.94, 293.66],
        [220, 261.63, 329.63],
        [174.61, 220, 261.63],
      ];
      for (let i = 0; i < 32; i++) {
        const a = acordes[Math.floor(i / 8) % 4];
        tono(ctx, "triangle", a[i % 3] * (i % 2 ? 2 : 1), a[i % 3] * (i % 2 ? 2 : 1), i * 0.25, 0.22, 0.3);
      }
      for (let i = 0; i < 4; i++) tono(ctx, "sine", acordes[i][0] / 2, acordes[i][0] / 2, i * 2, 1.9, 0.35);
    },
  },
];

const aWav = (buf: AudioBuffer): Uint8Array => {
  const canales = buf.numberOfChannels;
  const n = buf.length;
  const bytes = n * canales * 2;
  const out = new ArrayBuffer(44 + bytes);
  const v = new DataView(out);
  const w = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  w(0, "RIFF");
  v.setUint32(4, 36 + bytes, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, canales, true);
  v.setUint32(24, buf.sampleRate, true);
  v.setUint32(28, buf.sampleRate * canales * 2, true);
  v.setUint16(32, canales * 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, bytes, true);
  const datos = Array.from({ length: canales }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < canales; c++) {
      const s = Math.max(-1, Math.min(1, datos[c][i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Uint8Array(out);
};

const extension = (nombre: string) =>
  (nombre.split(".").pop() ?? "mp3").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "mp3";

// ---------- Utilidades generales ----------
const formatearTiempo = (total: number) => {
  const s = Math.max(0, Math.floor(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(seg).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

const leerTiempo = (txt: string): number => {
  const partes = txt.trim().split(":").map((p) => Number(p.replace(",", ".")));
  if (partes.some((n) => Number.isNaN(n) || n < 0)) return NaN;
  if (partes.length === 1) return partes[0];
  if (partes.length === 2) return partes[0] * 60 + partes[1];
  if (partes.length === 3) return partes[0] * 3600 + partes[1] * 60 + partes[2];
  return NaN;
};

const detectarPlataforma = (url: string): string | null => {
  const u = url.toLowerCase();
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "YouTube / Shorts";
  if (u.includes("tiktok.com")) return "TikTok";
  if (u.includes("instagram.com")) return "Instagram";
  if (u.includes("spotify.com")) return "Spotify";
  if (u.includes("facebook.com") || u.includes("fb.watch")) return "Facebook";
  if (u.includes("kick.com")) return "Kick";
  if (u.includes("twitch.tv")) return "Twitch";
  return null;
};

const unidadesDeClip = (segundos: number) => Math.max(1, Math.ceil(segundos / 120));

// ---------- Contadores locales (solo se usan si el servidor de códigos no está configurado) ----------
const hoy = () => new Date().toISOString().slice(0, 10);

const leerNumero = (clave: string): number => {
  try {
    return Number(localStorage.getItem(clave)) || 0;
  } catch {
    return 0;
  }
};

const guardarNumero = (clave: string, valor: number) => {
  try {
    localStorage.setItem(clave, String(valor));
  } catch {
    /* sin almacenamiento */
  }
};

const leerUsoDia = (): number => {
  try {
    if (localStorage.getItem("cl_dia_fecha") !== hoy()) return 0;
    return leerNumero("cl_dia_usados");
  } catch {
    return 0;
  }
};

const guardarUsoDia = (valor: number) => {
  try {
    localStorage.setItem("cl_dia_fecha", hoy());
    localStorage.setItem("cl_dia_usados", String(valor));
  } catch {
    /* sin almacenamiento */
  }
};

// ---------- Imágenes PNG para marcas de agua y textos ----------
const crearMarcaTexto = (texto: string): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    const px = 64;
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    if (!ctx) return reject(new Error("No se pudo crear la marca de agua"));
    const fuente = `bold ${px}px Arial, Helvetica, sans-serif`;
    ctx.font = fuente;
    const ancho = Math.ceil(ctx.measureText(texto).width) + px;
    c.width = ancho;
    c.height = Math.ceil(px * 1.7);
    ctx.font = fuente;
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(texto, px / 2, c.height / 2);
    c.toBlob(async (b) => {
      if (!b) return reject(new Error("No se pudo crear la marca de agua"));
      resolve(new Uint8Array(await b.arrayBuffer()));
    }, "image/png");
  });

const crearTextoPNG = (
  texto: string,
  px: number,
  color: string,
  fondo: boolean,
  maxAncho: number
): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    const lineas = texto.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lineas.length === 0) return reject(new Error("Texto vacío"));
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    if (!ctx) return reject(new Error("No se pudo crear el texto"));

    const fuente = (t: number) => `900 ${t}px Arial, Helvetica, sans-serif`;
    let tam = Math.max(12, Math.round(px));
    ctx.font = fuente(tam);
    let anchoMax = Math.max(...lineas.map((l) => ctx.measureText(l).width));
    let pad = Math.round(tam * 0.4);
    const disponible = maxAncho - pad * 2;
    if (anchoMax > disponible) {
      tam = Math.max(12, Math.floor((tam * disponible) / anchoMax));
      ctx.font = fuente(tam);
      anchoMax = Math.max(...lineas.map((l) => ctx.measureText(l).width));
      pad = Math.round(tam * 0.4);
    }

    const altoLinea = Math.round(tam * 1.25);
    c.width = Math.ceil(anchoMax) + pad * 2;
    c.height = altoLinea * lineas.length + pad * 2;

    ctx.font = fuente(tam);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";

    if (fondo) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0, 0, c.width, c.height);
    }

    lineas.forEach((l, i) => {
      const y = pad + altoLinea * i + altoLinea / 2;
      if (!fondo) {
        ctx.lineWidth = Math.max(2, tam * 0.16);
        ctx.strokeStyle = "rgba(0,0,0,0.95)";
        ctx.strokeText(l, c.width / 2, y);
      }
      ctx.fillStyle = color;
      ctx.fillText(l, c.width / 2, y);
    });

    c.toBlob(async (b) => {
      if (!b) return reject(new Error("No se pudo crear el texto"));
      resolve(new Uint8Array(await b.arrayBuffer()));
    }, "image/png");
  });

const crearMarcaLogo = (file: File): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const nw = img.naturalWidth || 400;
      const nh = img.naturalHeight || 400;
      const esc = Math.min(1, 800 / nw);
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(nw * esc));
      c.height = Math.max(1, Math.round(nh * esc));
      const ctx = c.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        return reject(new Error("No se pudo leer el logo"));
      }
      ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(async (b) => {
        URL.revokeObjectURL(url);
        if (!b) return reject(new Error("No se pudo leer el logo"));
        resolve(new Uint8Array(await b.arrayBuffer()));
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer el logo"));
    };
    img.src = url;
  });

const expresionPosicion = (pos: PosInterna, m: number): string => {
  switch (pos) {
    case "tl":
      return `${m}:${m}`;
    case "tr":
      return `main_w-overlay_w-${m}:${m}`;
    case "bl":
      return `${m}:main_h-overlay_h-${m}`;
    case "br":
      return `main_w-overlay_w-${m}:main_h-overlay_h-${m}`;
    case "bc":
      return `(main_w-overlay_w)/2:main_h-overlay_h-${m}`;
    default:
      return `(main_w-overlay_w)/2:(main_h-overlay_h)/2`;
  }
};

const expresionPosTexto = (pos: PosTexto): string => {
  if (pos === "arriba") return "(main_w-overlay_w)/2:main_h*0.08";
  if (pos === "centro") return "(main_w-overlay_w)/2:(main_h-overlay_h)/2";
  return "(main_w-overlay_w)/2:main_h-overlay_h-main_h*0.12";
};

// ---------- Motor de video: primero tu carpeta /ffmpeg, y si falla, la nube ----------
const RUTAS_FFMPEG = {
  local: {
    ffmpeg: "/ffmpeg/ffmpeg.js",
    util: "/ffmpeg/util.js",
    worker: "/ffmpeg/814.ffmpeg.js",
    core: "/ffmpeg/ffmpeg-core.js",
    wasm: "/ffmpeg/ffmpeg-core.wasm",
  },
  nube: {
    ffmpeg: "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js",
    util: "https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/umd/index.js",
    worker: "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/umd/814.ffmpeg.js",
    core: "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js",
    wasm: "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm",
  },
};

const cargarScript = (src: string) =>
  new Promise<void>((resolve, reject) => {
    const previo = document.querySelector(`script[src="${src}"]`);
    if (previo && previo.getAttribute("data-ok") === "1") return resolve();
    if (previo) previo.remove();
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => {
      s.setAttribute("data-ok", "1");
      resolve();
    };
    s.onerror = () => {
      s.remove();
      reject(new Error("No se pudo cargar " + src));
    };
    document.head.appendChild(s);
  });

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[#f43f5e]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#f43f5e]" />
      {children}
    </p>
  );
}

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="mb-2 text-3xl font-black leading-[1.05] tracking-tight text-white sm:text-4xl">
      {children}
    </h1>
  );
}

const CAMPO =
  "w-full rounded-lg border border-[#2b1e23] bg-[#0b0709] px-3.5 py-2.5 text-sm text-white placeholder:text-[#6f6267] focus:border-[#f43f5e]/65 focus:outline-none";

const BTN_ROSA =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-[#f43f5e] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#e11d48] disabled:cursor-not-allowed disabled:opacity-60";

const BTN_GRIS =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-[#2b1e23] bg-[#150e12] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#21161b] disabled:cursor-not-allowed disabled:opacity-60";

const BTN_VERDE =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-[#16a34a] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#15803d]";

const CARD = "rounded-2xl border border-[#2a1c22] bg-[#150d11]/90 p-5 sm:p-6";

export default function EditorStudioPage() {
  const [seccion, setSeccion] = useState<Seccion>("resumen");
  const [menuAbierto, setMenuAbierto] = useState(false);

  const [urlInput, setUrlInput] = useState("");

  // Licencia (verificada en el servidor)
  const [servidorListo, setServidorListo] = useState(false);
  const [licenciaActiva, setLicenciaActiva] = useState(false);
  const [planActual, setPlanActual] = useState("");
  const [maestro, setMaestro] = useState(false);
  const [expira, setExpira] = useState<number | null>(null);
  const [planPrueba, setPlanPrueba] = useState<PlanId | null>(null);
  const [codigoInput, setCodigoInput] = useState("");
  const [mensajeLicencia, setMensajeLicencia] = useState("");

  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [duracion, setDuracion] = useState(0);
  const [tiempoActual, setTiempoActual] = useState(0);
  const [inicioTxt, setInicioTxt] = useState("00:00");
  const [finTxt, setFinTxt] = useState("00:30");
  const [aspecto, setAspecto] = useState("9:16");
  const [calidad, setCalidad] = useState("720p");
  const [encuadre, setEncuadre] = useState<"Rellenar" | "Video completo">("Rellenar");

  const [modoMarca, setModoMarca] = useState<ModoMarca>("ninguna");
  const [textoMarca, setTextoMarca] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [posMarca, setPosMarca] = useState<PosMarca>("br");
  const [tamanoMarca, setTamanoMarca] = useState(25);
  const [opacidadMarca, setOpacidadMarca] = useState(85);

  const [filtro, setFiltro] = useState<FiltroId>("ninguno");
  const [brillo, setBrillo] = useState(0);
  const [contraste, setContraste] = useState(100);
  const [saturacion, setSaturacion] = useState(100);
  const [velocidad, setVelocidad] = useState(1);
  const [fundido, setFundido] = useState(false);
  const [espejo, setEspejo] = useState(false);
  const [vineta, setVineta] = useState(false);
  const [textos, setTextos] = useState<TextoClip[]>([]);

  // Paso 8: sonidos
  const [capasSonido, setCapasSonido] = useState<CapaSonido[]>([]);
  const [volOriginal, setVolOriginal] = useState(100);
  const [silenciarOriginal, setSilenciarOriginal] = useState(false);
  const [pestanaSonido, setPestanaSonido] = useState<"efecto" | "musica">("efecto");
  const [catalogoExtra, setCatalogoExtra] = useState<ItemBiblioteca[]>([]);
  const [sonandoId, setSonandoId] = useState<string | null>(null);

  const [procesando, setProcesando] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [mensaje, setMensaje] = useState("");

  const [clips, setClips] = useState<ClipGuardado[]>([]);
  const [usadosTotal, setUsadosTotal] = useState(0);
  const [usadosDia, setUsadosDia] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previaRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const pararEnRef = useRef<number | null>(null);

  const ffmpegRef = useRef<any>(null);
  const utilRef = useRef<any>(null);
  const cargandoRef = useRef<Promise<void> | null>(null);
  const logRef = useRef<string[]>([]);
  const cacheSonidos = useRef<Map<string, Uint8Array>>(new Map());
  const audioPrevRef = useRef<HTMLAudioElement | null>(null);
  const urlPrevRef = useRef<string | null>(null);

  const planId: PlanId = planPrueba ?? (licenciaActiva ? normalizarPlan(planActual) : "gratis");
  const usarServidor = servidorListo && !planPrueba;
  const plan: LimitesPlan = maestro
    ? { ...PLANES.agencia, nombre: "Maestro", maxSeg: 0, totalClips: 0, clipsDia: 0, ilimitado: true }
    : PLANES[planId];
  const calidadUsada = plan.maxCalidad === "720p" ? "720p" : calidad;

  const inicioSeg = Number.isNaN(leerTiempo(inicioTxt)) ? 0 : leerTiempo(inicioTxt);
  const finSeg = Number.isNaN(leerTiempo(finTxt)) ? 0 : leerTiempo(finTxt);
  const duracionClip = Math.max(0, finSeg - inicioSeg);
  const duracionFinal = duracionClip / velocidad;

  const textoUso = maestro
    ? "Acceso maestro · sin límites"
    : plan.totalClips > 0
      ? `Clips gratis usados: ${usadosTotal}/${plan.totalClips}`
      : plan.ilimitado
        ? "Clips ilimitados"
        : `Clips de hoy: ${usadosDia}/${plan.clipsDia}`;

  const cssFiltro = [
    FILTROS[filtro].css,
    `brightness(${(1 + brillo / 200).toFixed(2)})`,
    `contrast(${(contraste / 100).toFixed(2)})`,
    `saturate(${(saturacion / 100).toFixed(2)})`,
  ]
    .filter(Boolean)
    .join(" ");

  const biblioteca: ItemBiblioteca[] = [
    ...SONIDOS.map((s) => ({
      id: s.id,
      nombre: s.nombre,
      tipo: s.tipo,
      origen: "sintetico" as const,
      emoji: s.emoji,
    })),
    ...catalogoExtra,
  ];

  const aplicarUso = (tipo: string, usados: number) => {
    if (tipo === "total") setUsadosTotal(usados);
    if (tipo === "dia") setUsadosDia(usados);
  };

  const cargarUsoServidor = useCallback(() => {
    fetch("/api/uso")
      .then((r) => r.json())
      .then((d) => {
        if (d.configurado) aplicarUso(d.tipo, Number(d.usados) || 0);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setUsadosTotal(leerNumero("cl_gratis_usados"));
    setUsadosDia(leerUsoDia());

    // Solo en tu PC (desarrollo): /editor?plan=pro para probar los planes
    if (process.env.NODE_ENV !== "production") {
      const p = new URLSearchParams(window.location.search).get("plan");
      if (p) setPlanPrueba(normalizarPlan(p));
    }

    fetch("/api/licencia")
      .then((r) => r.json())
      .then((d) => {
        setServidorListo(!!d.configurado);
        setLicenciaActiva(!!d.activa);
        setPlanActual(d.planId ?? "");
        setMaestro(!!d.maestro);
        setExpira(d.expira ?? null);
        if (d.configurado) cargarUsoServidor();
      })
      .catch(() => {});

    // Catálogo opcional de sonidos libres que tú agregues en public/sonidos/catalogo.json
    fetch("/sonidos/catalogo.json")
      .then((r) => (r.ok ? r.json() : []))
      .then((lista) => {
        if (!Array.isArray(lista)) return;
        setCatalogoExtra(
          lista
            .filter((x: any) => x && x.archivo && x.nombre)
            .map((x: any, i: number) => ({
              id: `cat-${i}`,
              nombre: String(x.nombre),
              tipo: x.tipo === "musica" ? "musica" : "efecto",
              origen: "catalogo" as const,
              archivo: String(x.archivo),
              emoji: x.tipo === "musica" ? "🎵" : "🔊",
            }))
        );
      })
      .catch(() => {});

    const leer = () => {
      const h = window.location.hash.replace("#", "");
      setSeccion(SECCION_POR_HASH[h] ?? "resumen");
    };
    leer();
    window.addEventListener("hashchange", leer);
    return () => window.removeEventListener("hashchange", leer);
  }, [cargarUsoServidor]);

  const irA = useCallback((s: Seccion) => {
    setSeccion(s);
    setMenuAbierto(false);
    const h = HASH_POR_SECCION[s];
    history.replaceState(null, "", h ? `#${h}` : window.location.pathname + window.location.search);
    window.scrollTo({ top: 0 });
  }, []);

  const activarCodigoUnico = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensajeLicencia("Verificando...");
    try {
      const r = await fetch("/api/licencia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "canjear", codigo: codigoInput }),
      });
      const d = await r.json();
      if (r.ok && d.activa) {
        setServidorListo(true);
        setLicenciaActiva(true);
        setPlanActual(d.planId ?? "");
        setMaestro(!!d.maestro);
        setExpira(d.expira ?? null);
        setMensajeLicencia("¡Licencia activada con éxito!");
        cargarUsoServidor();
        setTimeout(() => irA("editor"), 1000);
      } else {
        setMensajeLicencia(d.error ?? "Código incorrecto o inválido.");
      }
    } catch {
      setMensajeLicencia("No se pudo conectar. Intenta de nuevo.");
    }
  };

  const llamarUso = async (accion: "verificar" | "confirmar"): Promise<any> => {
    try {
      const r = await fetch("/api/uso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion, segundos: duracionClip, calidad: calidadUsada }),
      });
      const d = await r.json();
      return { ...d, ok: r.ok && !!d.ok };
    } catch {
      return { ok: false, error: "No se pudo verificar tu plan. Revisa tu conexión." };
    }
  };

  // Carga el motor de video: tu carpeta /ffmpeg primero y la nube como respaldo
  const cargarFFmpeg = useCallback(async () => {
    if (ffmpegRef.current) return;
    if (cargandoRef.current) return cargandoRef.current;

    cargandoRef.current = (async () => {
      const errores: string[] = [];
      for (const origen of ["local", "nube"] as const) {
        const r = RUTAS_FFMPEG[origen];
        try {
          await cargarScript(r.ffmpeg);
          await cargarScript(r.util);

          const { FFmpeg } = (window as any).FFmpegWASM;
          const util = (window as any).FFmpegUtil;

          const ffmpeg = new FFmpeg();
          ffmpeg.on("progress", ({ progress }: { progress: number }) => {
            setProgreso(Math.min(100, Math.max(0, Math.round(progress * 100))));
          });
          ffmpeg.on("log", ({ message }: { message: string }) => {
            logRef.current = [...logRef.current.slice(-12), message];
          });

          await ffmpeg.load({
            classWorkerURL: await util.toBlobURL(r.worker, "text/javascript"),
            coreURL: await util.toBlobURL(r.core, "text/javascript"),
            wasmURL: await util.toBlobURL(r.wasm, "application/wasm"),
          });

          utilRef.current = util;
          ffmpegRef.current = ffmpeg;
          return;
        } catch (e: any) {
          errores.push(`${origen}: ${e?.message ?? e}`);
        }
      }
      throw new Error("No se pudo iniciar el motor de video. " + errores.join(" | "));
    })();

    try {
      await cargandoRef.current;
    } finally {
      cargandoRef.current = null;
    }
  }, []);

  const abrirSelector = () => fileInputRef.current?.click();
  const abrirSelectorLogo = () => logoInputRef.current?.click();
  const abrirSelectorAudio = () => audioInputRef.current?.click();

  const manejarSubidaVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (videoSrc) URL.revokeObjectURL(videoSrc);
    setVideoFile(file);
    setVideoSrc(URL.createObjectURL(file));
    setInicioTxt("00:00");
    setFinTxt("00:30");
    setMensaje("");
    setProgreso(0);
    irA("editor");
    e.target.value = "";
  };

  const manejarSubidaLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (logoUrl) URL.revokeObjectURL(logoUrl);
    setLogoFile(file);
    setLogoUrl(URL.createObjectURL(file));
    setModoMarca("logo");
    e.target.value = "";
  };

  const manejarSubidaAudio = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (capasSonido.length >= MAX_SONIDOS) {
      setMensaje(`Máximo ${MAX_SONIDOS} sonidos por clip.`);
    } else {
      setCapasSonido((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${prev.length}`,
          origen: "archivo",
          ref: "",
          archivo: file,
          nombre: file.name,
          inicio: "00:00",
          volumen: 60,
          repetir: false,
        },
      ]);
    }
    e.target.value = "";
  };

  const alCargarMetadatos = () => {
    const v = videoRef.current;
    if (!v) return;
    setDuracion(v.duration || 0);
    const tope = plan.maxSeg > 0 ? plan.maxSeg : 30;
    const fin = Math.min(v.duration || 30, Math.min(30, tope));
    setFinTxt(formatearTiempo(fin));
  };

  const alActualizarTiempo = () => {
    const v = videoRef.current;
    if (!v) return;
    setTiempoActual(v.currentTime);
    if (pararEnRef.current !== null && v.currentTime >= pararEnRef.current) {
      v.pause();
      pararEnRef.current = null;
    }
  };

  const moverVideo = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = t;
    setTiempoActual(t);
  };

  useEffect(() => {
    const p = previaRef.current;
    if (p && videoSrc && p.readyState >= 1) p.currentTime = inicioSeg;
  }, [inicioSeg, videoSrc]);

  const probarCorte = () => {
    const v = videoRef.current;
    if (!v || duracionClip <= 0) return;
    v.currentTime = inicioSeg;
    pararEnRef.current = finSeg;
    v.play();
  };

  const marcarInicio = () => setInicioTxt(formatearTiempo(tiempoActual));
  const marcarFin = () => setFinTxt(formatearTiempo(tiempoActual));

  // ---------- Textos ----------
  const agregarTexto = () => {
    if (textos.length >= MAX_TEXTOS) return;
    setTextos((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${prev.length}`,
        texto: "",
        desde: "00:00",
        hasta: formatearTiempo(Math.max(1, Math.round(duracionFinal || 5))),
        pos: "abajo",
        tam: 7,
        color: "#ffffff",
        fondo: false,
      },
    ]);
  };

  const actualizarTexto = (id: string, cambios: Partial<TextoClip>) =>
    setTextos((prev) => prev.map((t) => (t.id === id ? { ...t, ...cambios } : t)));

  const quitarTexto = (id: string) => setTextos((prev) => prev.filter((t) => t.id !== id));

  const restablecerEfectos = () => {
    setFiltro("ninguno");
    setBrillo(0);
    setContraste(100);
    setSaturacion(100);
    setVelocidad(1);
    setFundido(false);
    setEspejo(false);
    setVineta(false);
  };

  // ---------- Sonidos ----------
  const generarWav = async (id: string): Promise<Uint8Array> => {
    const guardado = cacheSonidos.current.get(id);
    if (guardado) return guardado;
    const def = SONIDOS.find((s) => s.id === id);
    if (!def) throw new Error("Sonido no encontrado: " + id);
    const ctx = new OfflineAudioContext(1, Math.ceil(TASA * def.dur), TASA);
    def.gen(ctx);
    const buf = await ctx.startRendering();
    const wav = aWav(buf);
    cacheSonidos.current.set(id, wav);
    return wav;
  };

  const detenerPrevia = () => {
    audioPrevRef.current?.pause();
    audioPrevRef.current = null;
    if (urlPrevRef.current) {
      URL.revokeObjectURL(urlPrevRef.current);
      urlPrevRef.current = null;
    }
    setSonandoId(null);
  };

  const escuchar = async (item: ItemBiblioteca) => {
    if (sonandoId === item.id) return detenerPrevia();
    detenerPrevia();
    try {
      let url: string;
      if (item.origen === "sintetico") {
        const wav = await generarWav(item.id);
        url = URL.createObjectURL(new Blob([wav.slice() as BlobPart], { type: "audio/wav" }));
        urlPrevRef.current = url;
      } else {
        url = `/sonidos/${item.archivo}`;
      }
      const a = new Audio(url);
      a.onended = detenerPrevia;
      audioPrevRef.current = a;
      setSonandoId(item.id);
      await a.play();
    } catch {
      detenerPrevia();
      setMensaje("No se pudo reproducir el sonido en este navegador.");
    }
  };

  const agregarSonido = (item: ItemBiblioteca) => {
    if (capasSonido.length >= MAX_SONIDOS) {
      setMensaje(`Máximo ${MAX_SONIDOS} sonidos por clip.`);
      return;
    }
    setCapasSonido((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${prev.length}`,
        origen: item.origen,
        ref: item.origen === "sintetico" ? item.id : (item.archivo ?? ""),
        nombre: item.nombre,
        inicio: "00:00",
        volumen: item.tipo === "musica" ? 35 : 80,
        repetir: item.tipo === "musica",
      },
    ]);
  };

  const actualizarCapa = (id: string, cambios: Partial<CapaSonido>) =>
    setCapasSonido((prev) => prev.map((c) => (c.id === id ? { ...c, ...cambios } : c)));

  const quitarCapa = (id: string) => setCapasSonido((prev) => prev.filter((c) => c.id !== id));

  // ---------- Validación ----------
  const validar = (): string | null => {
    if (!videoFile) return "Primero selecciona un archivo de video.";
    if (videoFile.size > 1_500_000_000)
      return "El archivo es muy grande para el navegador (más de 1.5 GB). Recórtalo antes.";
    if (Number.isNaN(leerTiempo(inicioTxt)) || Number.isNaN(leerTiempo(finTxt)))
      return "Escribe los tiempos en formato mm:ss.";
    if (duracionClip < 1) return "El fin debe ser mayor que el inicio.";
    if (plan.maxSeg > 0 && duracionClip > plan.maxSeg)
      return `Tu plan ${plan.nombre} permite clips de hasta ${plan.maxSeg} segundos. Acorta el tramo.`;
    if (plan.totalClips > 0 && usadosTotal >= plan.totalClips)
      return `Ya usaste tus ${plan.totalClips} clips gratis. Activa un plan para seguir creando.`;
    if (!plan.ilimitado && plan.clipsDia > 0) {
      const unidades = unidadesDeClip(duracionClip);
      if (usadosDia + unidades > plan.clipsDia)
        return `Este clip cuenta como ${unidades} y hoy te quedan ${Math.max(0, plan.clipsDia - usadosDia)} de ${plan.clipsDia}.`;
    }
    if (modoMarca === "texto" && plan.marcaPropia && !textoMarca.trim())
      return "Escribe el texto de tu marca de agua o elige 'Sin marca'.";
    if (modoMarca === "logo" && plan.marcaPropia && !logoFile)
      return "Sube tu logo o elige 'Sin marca'.";
    for (const t of textos) {
      if (!t.texto.trim()) continue;
      const a = leerTiempo(t.desde);
      const b = leerTiempo(t.hasta);
      if (Number.isNaN(a) || Number.isNaN(b)) return "Revisa los tiempos de tus textos (mm:ss).";
      if (b <= a) return "En cada texto, 'Hasta' debe ser mayor que 'Desde'.";
    }
    for (const c of capasSonido) {
      const t = leerTiempo(c.inicio);
      if (Number.isNaN(t)) return `Revisa el inicio del sonido "${c.nombre}" (mm:ss).`;
      if (t >= duracionFinal) return `El sonido "${c.nombre}" empieza después de que termina el clip.`;
    }
    return null;
  };

  // ---------- Generar el MP4 ----------
  const generarMP4 = async () => {
    const error = validar();
    if (error) return setMensaje(error);

    if (usarServidor) {
      setMensaje("Verificando tu plan...");
      const v = await llamarUso("verificar");
      if (!v.ok) return setMensaje(v.error ?? "Tu plan no permite este clip.");
    }

    const nombresTemporales: string[] = [];
    try {
      setProcesando(true);
      setProgreso(0);
      logRef.current = [];
      setMensaje("Cargando motor de video (la primera vez tarda unos segundos)...");
      await cargarFFmpeg();

      const ffmpeg = ffmpegRef.current;
      const { fetchFile } = utilRef.current;
      const [w, h] = DIMENSIONES[aspecto][calidadUsada];
      const margen = Math.round(w * 0.04);

      // 1) Video: formato + filtros y efectos
      const base =
        encuadre === "Rellenar"
          ? `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1`
          : `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`;

      const efectos: string[] = [base];
      if (filtro !== "ninguno") efectos.push(FILTROS[filtro].ff);
      if (brillo !== 0 || contraste !== 100 || saturacion !== 100) {
        efectos.push(
          `eq=brightness=${(brillo / 200).toFixed(2)}:contrast=${(contraste / 100).toFixed(2)}:saturation=${(saturacion / 100).toFixed(2)}`
        );
      }
      if (espejo) efectos.push("hflip");
      if (vineta) efectos.push("vignette=PI/4");
      if (velocidad !== 1) efectos.push(`setpts=PTS/${velocidad}`);
      if (fundido) {
        efectos.push("fade=t=in:st=0:d=0.5");
        efectos.push(`fade=t=out:st=${Math.max(0, duracionFinal - 0.5).toFixed(2)}:d=0.5`);
      }

      // 2) Audio simple (cuando no hay sonidos extra ni cambios de volumen)
      const audioSimple: string[] = [];
      if (velocidad !== 1) audioSimple.push(`atempo=${velocidad}`);
      if (fundido) {
        audioSimple.push("afade=t=in:st=0:d=0.5");
        audioSimple.push(`afade=t=out:st=${Math.max(0, duracionFinal - 0.5).toFixed(2)}:d=0.5`);
      }

      // 3) Imágenes encima del video: textos y marcas de agua
      setMensaje("Preparando textos, marca de agua y sonidos...");
      const capas: {
        archivo: string;
        datos: Uint8Array;
        escalaPx: number | null;
        opacidad: number;
        pos: string;
        enable?: string;
      }[] = [];

      for (const t of textos) {
        if (!t.texto.trim()) continue;
        const a = leerTiempo(t.desde);
        const b = leerTiempo(t.hasta);
        capas.push({
          archivo: `t${capas.length}.png`,
          datos: await crearTextoPNG(t.texto, (w * t.tam) / 100, t.color, t.fondo, w * 0.92),
          escalaPx: null,
          opacidad: 1,
          pos: expresionPosTexto(t.pos),
          enable: `between(t,${a.toFixed(2)},${b.toFixed(2)})`,
        });
      }

      if (plan.marcaPropia && modoMarca === "texto" && textoMarca.trim()) {
        capas.push({
          archivo: `t${capas.length}.png`,
          datos: await crearMarcaTexto(textoMarca.trim()),
          escalaPx: Math.max(16, Math.round((w * tamanoMarca) / 100)),
          opacidad: opacidadMarca / 100,
          pos: expresionPosicion(posMarca, margen),
        });
      }
      if (plan.marcaPropia && modoMarca === "logo" && logoFile) {
        capas.push({
          archivo: `t${capas.length}.png`,
          datos: await crearMarcaLogo(logoFile),
          escalaPx: Math.max(16, Math.round((w * tamanoMarca) / 100)),
          opacidad: opacidadMarca / 100,
          pos: expresionPosicion(posMarca, margen),
        });
      }
      if (plan.marcaPlataforma) {
        capas.push({
          archivo: `t${capas.length}.png`,
          datos: await crearMarcaTexto("Clips Limpieza"),
          escalaPx: Math.max(16, Math.round(w * 0.28)),
          opacidad: 0.85,
          pos: expresionPosicion("bc", margen),
        });
      }

      let cadena = `[0:v]${efectos.join(",")}[v0]`;
      capas.forEach((c, i) => {
        const escala = c.escalaPx ? `scale=${c.escalaPx}:-1,` : "";
        cadena += `;[${i + 1}:v]${escala}format=rgba,colorchannelmixer=aa=${c.opacidad.toFixed(2)}[m${i}]`;
        cadena += `;[v${i}][m${i}]overlay=${c.pos}${c.enable ? `:enable='${c.enable}'` : ""}[v${i + 1}]`;
      });
      const etiquetaFinal = `v${capas.length}`;

      // 4) Sonidos y música
      const audios: { archivo: string; datos: Uint8Array; repetir: boolean; ms: number; vol: number }[] = [];
      for (let i = 0; i < capasSonido.length; i++) {
        const c = capasSonido[i];
        let datos: Uint8Array;
        let nombreArchivo: string;
        if (c.origen === "sintetico") {
          datos = (await generarWav(c.ref)).slice();
          nombreArchivo = `s${i}.wav`;
        } else if (c.origen === "catalogo") {
          datos = await fetchFile(`/sonidos/${c.ref}`);
          nombreArchivo = `s${i}.${extension(c.ref)}`;
        } else {
          datos = await fetchFile(c.archivo as File);
          nombreArchivo = `s${i}.${extension(c.archivo?.name ?? "audio.mp3")}`;
        }
        audios.push({
          archivo: nombreArchivo,
          datos,
          repetir: c.repetir,
          ms: Math.round(leerTiempo(c.inicio) * 1000),
          vol: c.volumen / 100,
        });
      }

      const usarGrafoAudio = audios.length > 0 || silenciarOriginal || volOriginal !== 100;

      const construirAudio = (conOriginal: boolean): string => {
        const fmt = "aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo";
        const partes: string[] = [];
        const etiquetas: string[] = ["[a0]"];

        if (conOriginal && !silenciarOriginal) {
          const cad = [fmt];
          if (velocidad !== 1) cad.push(`atempo=${velocidad}`);
          cad.push(`volume=${(volOriginal / 100).toFixed(2)}`);
          partes.push(`[0:a]${cad.join(",")}[a0]`);
        } else {
          partes.push(`anullsrc=r=44100:cl=stereo[a0]`);
        }

        audios.forEach((a, i) => {
          const idx = 1 + capas.length + i;
          partes.push(`[${idx}:a]${fmt},adelay=${a.ms}|${a.ms},apad,volume=${a.vol.toFixed(2)}[a${i + 1}]`);
          etiquetas.push(`[a${i + 1}]`);
        });

        const n = etiquetas.length;
        partes.push(
          n === 1
            ? `[a0]anull[amix]`
            : `${etiquetas.join("")}amix=inputs=${n}:duration=first:dropout_transition=0,volume=${n}[amix]`
        );
        partes.push(
          fundido
            ? `[amix]afade=t=in:st=0:d=0.5,afade=t=out:st=${Math.max(0, duracionFinal - 0.5).toFixed(2)}:d=0.5[aout]`
            : `[amix]anull[aout]`
        );
        return partes.join(";");
      };

      setMensaje("Procesando clip...");
      await ffmpeg.writeFile("entrada.mp4", await fetchFile(videoFile as File));
      nombresTemporales.push("entrada.mp4", "salida.mp4");
      for (const c of capas) {
        await ffmpeg.writeFile(c.archivo, c.datos);
        nombresTemporales.push(c.archivo);
      }
      for (const a of audios) {
        await ffmpeg.writeFile(a.archivo, a.datos);
        nombresTemporales.push(a.archivo);
      }

      const armarArgumentos = (conOriginal: boolean) => {
        const grafoAudio = usarGrafoAudio ? construirAudio(conOriginal) : "";
        return [
          "-y",
          "-ss", String(inicioSeg),
          "-t", String(duracionClip),
          "-i", "entrada.mp4",
          ...capas.flatMap((c) => ["-i", c.archivo]),
          ...audios.flatMap((a) => [...(a.repetir ? ["-stream_loop", "-1"] : []), "-i", a.archivo]),
          "-filter_complex", grafoAudio ? `${cadena};${grafoAudio}` : cadena,
          "-map", `[${etiquetaFinal}]`,
          ...(grafoAudio
            ? ["-map", "[aout]"]
            : ["-map", "0:a?", ...(audioSimple.length > 0 ? ["-af", audioSimple.join(",")] : [])]),
          "-t", duracionFinal.toFixed(2),
          "-c:v", "libx264",
          "-preset", "ultrafast",
          "-crf", calidadUsada === "1080p" ? "26" : "28",
          "-pix_fmt", "yuv420p",
          "-c:a", "aac",
          "-b:a", "128k",
          "-movflags", "+faststart",
          "salida.mp4",
        ];
      };

      let codigo = await ffmpeg.exec(armarArgumentos(true));
      // Si el video no tiene audio, reintenta usando silencio como base
      if (codigo !== 0 && usarGrafoAudio) {
        codigo = await ffmpeg.exec(armarArgumentos(false));
      }
      if (codigo !== 0) {
        const ultimo = logRef.current.filter(Boolean).slice(-2).join(" · ");
        throw new Error(ultimo || "FFmpeg terminó con código " + codigo);
      }

      const data = await ffmpeg.readFile("salida.mp4");
      const blob = new Blob([data as BlobPart], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `clip-${Date.now()}.mp4`;
      a.click();

      setClips((prev) => [
        {
          id: Date.now().toString(),
          titulo: `Clip · ${formatearTiempo(inicioSeg)} a ${formatearTiempo(finSeg)}`,
          inicio: formatearTiempo(inicioSeg),
          fin: formatearTiempo(finSeg),
          formato: aspecto,
          url,
        },
        ...prev,
      ]);

      // El clip se cuenta cuando se guarda
      if (usarServidor) {
        const c = await llamarUso("confirmar");
        if (c.ok) aplicarUso(c.tipo, Number(c.usados) || 0);
      } else if (plan.totalClips > 0) {
        const nuevo = usadosTotal + 1;
        setUsadosTotal(nuevo);
        guardarNumero("cl_gratis_usados", nuevo);
      } else if (!plan.ilimitado) {
        const nuevo = usadosDia + unidadesDeClip(duracionClip);
        setUsadosDia(nuevo);
        guardarUsoDia(nuevo);
      }

      setProgreso(100);
      setMensaje("¡Clip guardado en tu biblioteca y descargado!");

      fetch("/api/licencia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "actividad", detalle: `Clip ${aspecto} ${calidadUsada} ${Math.round(duracionClip)}s` }),
      }).catch(() => {});
    } catch (err: any) {
      console.error(err);
      const detalle = err?.message ? ` (${String(err.message).slice(0, 220)})` : "";
      setMensaje(`Error al procesar el video${detalle}`);
    } finally {
      try {
        for (const n of nombresTemporales) await ffmpegRef.current?.deleteFile(n);
      } catch {
        /* archivos ya limpiados */
      }
      setProcesando(false);
    }
  };

  const linkWhatsApp = (texto: string) =>
    `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(texto)}`;

  const guardados = clips.filter((c) => !c.papelera);

  const navegacion = (
    <nav className="space-y-1">
      {MENU.map((item) => {
        const activo = seccion === item.id;
        return (
          <button
            key={item.id}
            onClick={() => irA(item.id)}
            className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-xs font-bold transition ${
              activo ? "border-[#f43f5e]/70 bg-[#241318] text-white" : "border-transparent text-[#d8cdd1] hover:bg-[#171013]"
            }`}
          >
            <span className="w-3 text-center text-[10px] text-[#f43f5e]">{item.icono}</span>
            {item.label}
          </button>
        );
      })}
    </nav>
  );

  const panelEnlaces = (titulo: string) => (
    <div className={`${CARD} mx-auto max-w-xl space-y-4`}>
      <Eyebrow>Enlaces</Eyebrow>
      <Titulo>{titulo}</Titulo>

      {plan.enlaces ? (
        <>
          <p className="text-xs text-[#c7bcc0]">
            Tu plan {plan.nombre} incluye enlaces y directos. Estamos conectando el servidor que los procesa;
            mientras tanto puedes sacar clips subiendo el archivo.
          </p>
          <div>
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://..."
              className={CAMPO}
            />
            {detectarPlataforma(urlInput) && (
              <p className="mt-1 text-[11px] text-[#f43f5e]">Plataforma: {detectarPlataforma(urlInput)} ✓</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button disabled className={BTN_ROSA}>⚡ Próximamente</button>
            <button onClick={abrirSelector} className={BTN_GRIS}>↑ Subir video del equipo</button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-[#c7bcc0]">
            Los enlaces de YouTube, TikTok, Kick y directos están disponibles en los planes Pro, Estudio y Agencia.
            Con tu plan {plan.nombre} puedes editar videos subidos desde tu equipo.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <button onClick={abrirSelector} className={BTN_ROSA}>↑ Subir video del equipo</button>
            <a
              href={linkWhatsApp("Hola, quiero activar un plan con enlaces y directos (Pro, Estudio o Agencia).")}
              target="_blank"
              rel="noopener noreferrer"
              className={BTN_VERDE}
            >
              💬 Ver planes por WhatsApp
            </a>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[#07050a] text-[#f5f0f2]">
      <input ref={fileInputRef} type="file" accept="video/*" onChange={manejarSubidaVideo} className="hidden" />
      <input ref={logoInputRef} type="file" accept="image/*" onChange={manejarSubidaLogo} className="hidden" />
      <input ref={audioInputRef} type="file" accept="audio/*" onChange={manejarSubidaAudio} className="hidden" />

      <aside className="sticky top-0 hidden h-screen w-52 shrink-0 flex-col justify-between border-r border-[#21171b] bg-[#0b070a] p-4 lg:flex">
        <div>
          <Link href="/" className="mb-6 flex items-center gap-2 px-1">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#f43f5e] text-[10px] text-white">▶</span>
            <span className="text-xs font-black text-white">Clips Limpieza</span>
          </Link>
          {navegacion}
        </div>
        <div className="border-t border-[#1e1519] px-1 pt-3">
          <div className="mb-0.5 text-[10px] text-[#9e9196]">Plan:</div>
          <div className={`text-xs font-bold ${planId === "gratis" && !maestro ? "text-amber-400" : "text-emerald-400"}`}>
            {planId === "gratis" && !maestro ? "○ Gratis" : `● ${plan.nombre}`}
          </div>
          <div className="mt-1 text-[10px] text-[#9e9196]">{textoUso}</div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[#21171b] bg-[#0b070a]/95 px-4 py-3 backdrop-blur lg:hidden">
          <span className="flex items-center gap-2 text-xs font-black text-white">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#f43f5e] text-[10px]">▶</span>
            Clips Limpieza
          </span>
          <button onClick={() => setMenuAbierto(!menuAbierto)} className="rounded-lg border border-[#2b1e23] px-3 py-1.5 text-xs text-white">
            ☰ Menú
          </button>
        </header>

        {menuAbierto && <div className="border-b border-[#21171b] bg-[#0b070a] p-4 lg:hidden">{navegacion}</div>}

        <main className="flex flex-1 flex-col px-4 py-6 sm:px-8">
          <div className="mx-auto w-full max-w-5xl">
            <div className="mb-6 border-b border-[#21171b] pb-3 text-xs text-[#9e9196]">
              Estudio / <span className="font-bold text-white">{NOMBRE_SECCION[seccion]}</span>
            </div>

            {seccion === "activar" && (
              <div className={`${CARD} mx-auto max-w-md space-y-4`}>
                <Eyebrow>Activación</Eyebrow>
                <Titulo>Llave o Código</Titulo>

                {licenciaActiva && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
                    ✓ Plan {plan.nombre} activo
                    {expira ? ` · vence el ${new Date(expira).toLocaleDateString("es")}` : ""}
                  </div>
                )}

                <p className="text-xs text-[#c7bcc0]">
                  Introduce el código de tu plan. Es personal y solo funciona para un cliente.
                </p>
                <form onSubmit={activarCodigoUnico} className="space-y-3">
                  <input
                    type="text"
                    value={codigoInput}
                    onChange={(e) => setCodigoInput(e.target.value)}
                    placeholder="Ej. CLIP-XXXX-XXXX-XXXX"
                    className={CAMPO}
                    autoComplete="off"
                  />
                  <button type="submit" className={`${BTN_ROSA} w-full`}>🔓 Activar Acceso</button>
                </form>
                {mensajeLicencia && <p className="text-xs font-bold text-[#f43f5e]">{mensajeLicencia}</p>}

                {!licenciaActiva && (
                  <a
                    href={linkWhatsApp("Hola, quiero comprar un plan de Clips Limpieza.")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${BTN_VERDE} w-full`}
                  >
                    💬 Comprar mi código por WhatsApp
                  </a>
                )}
              </div>
            )}

            {seccion === "resumen" && (
              <div className="space-y-5">
                <div>
                  <Eyebrow>Panel Principal</Eyebrow>
                  <Titulo>
                    Estudio de <span className="text-[#f43f5e]">clips.</span>
                  </Titulo>
                  <p className="text-xs text-[#c7bcc0] sm:text-sm">
                    Corta tus videos, ponles marca de agua, textos, filtros y sonidos, y descárgalos listos para publicar.
                  </p>
                </div>

                {planId === "gratis" && !maestro && (
                  <div className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-300">
                    <span>Plan Gratis: {textoUso}. Activa un plan para quitar los límites.</span>
                    <button onClick={() => irA("activar")} className="font-bold underline">Activar</button>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-3">
                  <button onClick={() => irA("directos")} className={`${CARD} text-left transition hover:border-[#f43f5e]/50`}>
                    <h3 className="mb-1 text-base font-extrabold text-white">En Vivos</h3>
                    <p className="text-xs text-[#9e9196]">Clips de directos (planes Pro y superiores).</p>
                  </button>
                  <button onClick={() => irA("videos")} className={`${CARD} text-left transition hover:border-[#f43f5e]/50`}>
                    <h3 className="mb-1 text-base font-extrabold text-white">Videos con enlace</h3>
                    <p className="text-xs text-[#9e9196]">Clips desde enlaces (planes Pro y superiores).</p>
                  </button>
                  <button onClick={() => irA("editor")} className={`${CARD} text-left transition hover:border-[#f43f5e]/50`}>
                    <h3 className="mb-1 text-base font-extrabold text-white">Editor y Marca</h3>
                    <p className="text-xs text-[#9e9196]">Corta y pon tu logo al instante.</p>
                  </button>
                </div>
              </div>
            )}

            {seccion === "directos" && panelEnlaces("En Vivos / Lives")}
            {seccion === "videos" && panelEnlaces("Videos con enlace")}

            {seccion === "editor" && (
              <div className="grid items-start gap-5 lg:grid-cols-2">
                <div className="space-y-5">
                  {/* 1. Recorte */}
                  <section className={CARD}>
                    <h2 className="mb-3 text-lg font-extrabold text-white">1. Elige el momento</h2>

                    <div className="mb-3 flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-black">
                      {videoSrc ? (
                        <video
                          ref={videoRef}
                          src={videoSrc}
                          controls
                          playsInline
                          onLoadedMetadata={alCargarMetadatos}
                          onTimeUpdate={alActualizarTiempo}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <button onClick={abrirSelector} className={BTN_ROSA}>↑ Seleccionar video del equipo</button>
                      )}
                    </div>

                    {videoSrc && (
                      <>
                        <input
                          type="range"
                          min={0}
                          max={duracion || 1}
                          step={0.1}
                          value={tiempoActual}
                          onChange={(e) => moverVideo(Number(e.target.value))}
                          className="mb-1 w-full accent-[#f43f5e]"
                        />
                        <p className="mb-3 text-right font-mono text-[10px] text-[#9e9196]">
                          {formatearTiempo(tiempoActual)} / {formatearTiempo(duracion)}
                        </p>
                      </>
                    )}

                    <div className="mb-3 grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[11px] text-white">Inicio (mm:ss)</label>
                        <div className="flex gap-1.5">
                          <input value={inicioTxt} onChange={(e) => setInicioTxt(e.target.value)} className={CAMPO} />
                          <button onClick={marcarInicio} disabled={!videoSrc} className={BTN_GRIS}>Marcar</button>
                        </div>
                      </div>
                      <div>
                        <label className="text-[11px] text-white">Fin (mm:ss)</label>
                        <div className="flex gap-1.5">
                          <input value={finTxt} onChange={(e) => setFinTxt(e.target.value)} className={CAMPO} />
                          <button onClick={marcarFin} disabled={!videoSrc} className={BTN_GRIS}>Marcar</button>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={probarCorte} disabled={!videoSrc} className={BTN_GRIS}>▷ Probar corte</button>
                      <button onClick={abrirSelector} className={BTN_GRIS}>↑ Cambiar video</button>
                    </div>

                    <p className="mt-3 text-[11px] text-[#9e9196]">
                      Duración del clip: {duracionClip}s
                      {plan.maxSeg > 0 ? ` · máximo en tu plan: ${plan.maxSeg}s` : " · sin límite de duración"}
                      {planId !== "gratis" && !plan.ilimitado ? ` · cuenta como ${unidadesDeClip(duracionClip)} clip(s)` : ""}
                    </p>
                  </section>

                  {/* 2. Filtros y efectos */}
                  <section className={`${CARD} space-y-4`}>
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-extrabold text-white">2. Filtros y efectos</h2>
                      <button onClick={restablecerEfectos} className="text-[11px] font-bold text-[#f43f5e] underline">
                        Restablecer
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {(Object.keys(FILTROS) as FiltroId[]).map((f) => (
                        <button
                          key={f}
                          onClick={() => setFiltro(f)}
                          className={`rounded-lg border px-2 py-2 text-[11px] font-bold transition ${
                            filtro === f ? "border-[#f43f5e]/70 bg-[#241318] text-white" : "border-[#2b1e23] text-[#c7bcc0]"
                          }`}
                        >
                          {FILTROS[f].nombre}
                        </button>
                      ))}
                    </div>

                    <div className="space-y-2">
                      <div>
                        <label className="text-[11px] text-white">Brillo: {brillo}</label>
                        <input type="range" min={-50} max={50} value={brillo} onChange={(e) => setBrillo(Number(e.target.value))} className="w-full accent-[#f43f5e]" />
                      </div>
                      <div>
                        <label className="text-[11px] text-white">Contraste: {contraste}%</label>
                        <input type="range" min={50} max={150} value={contraste} onChange={(e) => setContraste(Number(e.target.value))} className="w-full accent-[#f43f5e]" />
                      </div>
                      <div>
                        <label className="text-[11px] text-white">Saturación: {saturacion}%</label>
                        <input type="range" min={0} max={200} value={saturacion} onChange={(e) => setSaturacion(Number(e.target.value))} className="w-full accent-[#f43f5e]" />
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] text-white">Velocidad</label>
                      <select value={velocidad} onChange={(e) => setVelocidad(Number(e.target.value))} className={CAMPO}>
                        <option value={0.5}>0.5x · Cámara lenta</option>
                        <option value={0.75}>0.75x</option>
                        <option value={1}>1x · Normal</option>
                        <option value={1.25}>1.25x</option>
                        <option value={1.5}>1.5x</option>
                        <option value={2}>2x · Rápido</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          ["Fundido", fundido, setFundido],
                          ["Espejo", espejo, setEspejo],
                          ["Viñeta", vineta, setVineta],
                        ] as [string, boolean, React.Dispatch<React.SetStateAction<boolean>>][]
                      ).map(([nombre, activo, setActivo]) => (
                        <button
                          key={nombre}
                          onClick={() => setActivo(!activo)}
                          className={`rounded-lg border px-2 py-2 text-[11px] font-bold transition ${
                            activo ? "border-[#f43f5e]/70 bg-[#241318] text-white" : "border-[#2b1e23] text-[#c7bcc0]"
                          }`}
                        >
                          {activo ? "✓ " : ""}{nombre}
                        </button>
                      ))}
                    </div>
                  </section>

                  {/* 3. Textos */}
                  <section className={`${CARD} space-y-4`}>
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-extrabold text-white">3. Textos y subtítulos</h2>
                      <span className="text-[11px] text-[#9e9196]">{textos.length}/{MAX_TEXTOS}</span>
                    </div>
                    <p className="text-[11px] text-[#c7bcc0]">
                      Escribe el texto y elige en qué segundos del clip final aparece. Para subtítulos, agrega un texto por frase.
                    </p>

                    {textos.map((t, i) => (
                      <div key={t.id} className="space-y-2.5 rounded-xl border border-[#2b1e23] p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-white">Texto {i + 1}</span>
                          <button onClick={() => quitarTexto(t.id)} className="text-[11px] font-bold text-[#f43f5e]">Quitar</button>
                        </div>
                        <textarea
                          value={t.texto}
                          onChange={(e) => actualizarTexto(t.id, { texto: e.target.value })}
                          placeholder="Escribe aquí tu texto"
                          rows={2}
                          maxLength={120}
                          className={`${CAMPO} resize-none`}
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-white">Desde (mm:ss)</label>
                            <input value={t.desde} onChange={(e) => actualizarTexto(t.id, { desde: e.target.value })} className={CAMPO} />
                          </div>
                          <div>
                            <label className="text-[10px] text-white">Hasta (mm:ss)</label>
                            <input value={t.hasta} onChange={(e) => actualizarTexto(t.id, { hasta: e.target.value })} className={CAMPO} />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(["arriba", "centro", "abajo"] as PosTexto[]).map((p) => (
                            <button
                              key={p}
                              onClick={() => actualizarTexto(t.id, { pos: p })}
                              className={`rounded-lg border px-2 py-1.5 text-[10px] font-bold capitalize transition ${
                                t.pos === p ? "border-[#f43f5e]/70 bg-[#241318] text-white" : "border-[#2b1e23] text-[#c7bcc0]"
                              }`}
                            >
                              {p}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <label className="text-[10px] text-white">Tamaño: {t.tam}%</label>
                            <input type="range" min={4} max={14} value={t.tam} onChange={(e) => actualizarTexto(t.id, { tam: Number(e.target.value) })} className="w-full accent-[#f43f5e]" />
                          </div>
                          <div>
                            <label className="block text-[10px] text-white">Color</label>
                            <input type="color" value={t.color} onChange={(e) => actualizarTexto(t.id, { color: e.target.value })} className="h-8 w-10 cursor-pointer rounded border border-[#2b1e23] bg-transparent" />
                          </div>
                          <button
                            onClick={() => actualizarTexto(t.id, { fondo: !t.fondo })}
                            className={`rounded-lg border px-2 py-1.5 text-[10px] font-bold transition ${
                              t.fondo ? "border-[#f43f5e]/70 bg-[#241318] text-white" : "border-[#2b1e23] text-[#c7bcc0]"
                            }`}
                          >
                            Fondo
                          </button>
                        </div>
                      </div>
                    ))}

                    <button onClick={agregarTexto} disabled={textos.length >= MAX_TEXTOS} className={`${BTN_GRIS} w-full`}>
                      + Agregar texto
                    </button>
                  </section>

                  {/* 4. Sonidos y música */}
                  <section className={`${CARD} space-y-4`}>
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-extrabold text-white">4. Sonidos y música</h2>
                      <span className="text-[11px] text-[#9e9196]">{capasSonido.length}/{MAX_SONIDOS}</span>
                    </div>
                    <p className="text-[11px] text-[#c7bcc0]">
                      Sonidos creados por nosotros, libres de copyright. Escucha con ▷ y agrégalos al clip con +.
                    </p>

                    <div className="space-y-2 rounded-xl border border-[#2b1e23] p-3">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] text-white">
                          Audio original: {silenciarOriginal ? "silenciado" : `${volOriginal}%`}
                        </label>
                        <button
                          onClick={() => setSilenciarOriginal(!silenciarOriginal)}
                          className={`rounded-lg border px-2 py-1 text-[10px] font-bold transition ${
                            silenciarOriginal ? "border-[#f43f5e]/70 bg-[#241318] text-white" : "border-[#2b1e23] text-[#c7bcc0]"
                          }`}
                        >
                          {silenciarOriginal ? "✓ Silenciado" : "Silenciar"}
                        </button>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={150}
                        value={volOriginal}
                        disabled={silenciarOriginal}
                        onChange={(e) => setVolOriginal(Number(e.target.value))}
                        className="w-full accent-[#f43f5e] disabled:opacity-40"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          ["efecto", "Efectos"],
                          ["musica", "Música"],
                        ] as ["efecto" | "musica", string][]
                      ).map(([id, label]) => (
                        <button
                          key={id}
                          onClick={() => setPestanaSonido(id)}
                          className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${
                            pestanaSonido === id ? "border-[#f43f5e]/70 bg-[#241318] text-white" : "border-[#2b1e23] text-[#c7bcc0]"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                      {biblioteca
                        .filter((s) => s.tipo === pestanaSonido)
                        .map((s) => (
                          <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-[#2b1e23] px-3 py-2">
                            <span className="truncate text-xs font-bold text-white">
                              {s.emoji} {s.nombre}
                            </span>
                            <div className="flex shrink-0 gap-1.5">
                              <button onClick={() => escuchar(s)} className="rounded-lg border border-[#2b1e23] px-2.5 py-1 text-xs font-bold text-white hover:bg-[#21161b]">
                                {sonandoId === s.id ? "■" : "▷"}
                              </button>
                              <button onClick={() => agregarSonido(s)} className="rounded-lg bg-[#f43f5e] px-2.5 py-1 text-xs font-bold text-white hover:bg-[#e11d48]">
                                +
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>

                    <div>
                      <button onClick={abrirSelectorAudio} className={`${BTN_GRIS} w-full`}>↑ Subir mi propio audio</button>
                      <p className="mt-1.5 text-[10px] text-[#9e9196]">
                        Usa solo audios propios o con permiso. Si subes música con copyright, la responsabilidad es tuya.
                      </p>
                    </div>

                    {capasSonido.map((c) => (
                      <div key={c.id} className="space-y-2 rounded-xl border border-[#2b1e23] p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[11px] font-bold text-white">🎵 {c.nombre}</span>
                          <button onClick={() => quitarCapa(c.id)} className="shrink-0 text-[11px] font-bold text-[#f43f5e]">Quitar</button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-white">Empieza en (mm:ss)</label>
                            <input value={c.inicio} onChange={(e) => actualizarCapa(c.id, { inicio: e.target.value })} className={CAMPO} />
                          </div>
                          <div>
                            <label className="text-[10px] text-white">Volumen: {c.volumen}%</label>
                            <input type="range" min={5} max={150} value={c.volumen} onChange={(e) => actualizarCapa(c.id, { volumen: Number(e.target.value) })} className="mt-2 w-full accent-[#f43f5e]" />
                          </div>
                        </div>
                        <label className="flex items-center gap-2 text-[11px] text-[#c7bcc0]">
                          <input type="checkbox" checked={c.repetir} onChange={(e) => actualizarCapa(c.id, { repetir: e.target.checked })} className="accent-[#f43f5e]" />
                          Repetir mientras dure el clip
                        </label>
                      </div>
                    ))}
                  </section>
                </div>

                {/* Columna derecha */}
                <section className={`${CARD} space-y-4`}>
                  <h2 className="text-lg font-extrabold text-white">5. Formato y marca de agua</h2>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[11px] text-white">Relación de aspecto</label>
                      <select value={aspecto} onChange={(e) => setAspecto(e.target.value)} className={CAMPO}>
                        <option value="9:16">9:16 · Vertical</option>
                        <option value="1:1">1:1 · Cuadrado</option>
                        <option value="16:9">16:9 · Horizontal</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-white">Calidad</label>
                      <select value={calidadUsada} onChange={(e) => setCalidad(e.target.value)} className={CAMPO}>
                        <option value="720p">720p · Rápido</option>
                        <option value="1080p" disabled={plan.maxCalidad === "720p"}>
                          {plan.maxCalidad === "720p" ? "1080p · Plan de pago" : "1080p · Alta definición"}
                        </option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {(["Rellenar", "Video completo"] as const).map((op) => (
                      <button
                        key={op}
                        onClick={() => setEncuadre(op)}
                        className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${
                          encuadre === op ? "border-[#f43f5e]/70 bg-[#241318] text-white" : "border-[#2b1e23] text-[#c7bcc0]"
                        }`}
                      >
                        {op}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-3 rounded-xl border border-[#2b1e23] p-3.5">
                    <p className="text-xs font-bold text-white">Tu marca de agua</p>

                    {!plan.marcaPropia ? (
                      <div className="space-y-2">
                        <p className="text-[11px] text-[#c7bcc0]">
                          En el plan Gratis se agrega la marca de Clips Limpieza. Con un plan de pago quitas esa marca y
                          pones la tuya (texto o logo).
                        </p>
                        <a
                          href={linkWhatsApp("Hola, quiero un plan para poner mi propia marca de agua.")}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`${BTN_VERDE} text-xs`}
                        >
                          💬 Activar plan por WhatsApp
                        </a>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-3 gap-2">
                          {(
                            [
                              ["ninguna", "Sin marca"],
                              ["texto", "Texto"],
                              ["logo", "Logo"],
                            ] as [ModoMarca, string][]
                          ).map(([id, label]) => (
                            <button
                              key={id}
                              onClick={() => setModoMarca(id)}
                              className={`rounded-lg border px-2 py-2 text-xs font-bold transition ${
                                modoMarca === id ? "border-[#f43f5e]/70 bg-[#241318] text-white" : "border-[#2b1e23] text-[#c7bcc0]"
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>

                        {modoMarca === "texto" && (
                          <input
                            type="text"
                            value={textoMarca}
                            onChange={(e) => setTextoMarca(e.target.value)}
                            placeholder="@TuCanal"
                            maxLength={40}
                            className={CAMPO}
                          />
                        )}

                        {modoMarca === "logo" && (
                          <div className="flex items-center gap-3">
                            <button onClick={abrirSelectorLogo} className={BTN_GRIS}>↑ {logoFile ? "Cambiar logo" : "Subir logo"}</button>
                            {logoFile && <span className="truncate text-[11px] text-[#c7bcc0]">{logoFile.name}</span>}
                          </div>
                        )}

                        {modoMarca !== "ninguna" && (
                          <>
                            <div className="grid grid-cols-3 gap-1.5">
                              {(Object.keys(POS_NOMBRE) as PosMarca[]).map((p) => (
                                <button
                                  key={p}
                                  onClick={() => setPosMarca(p)}
                                  className={`rounded-lg border px-1.5 py-1.5 text-[10px] font-bold transition ${
                                    posMarca === p ? "border-[#f43f5e]/70 bg-[#241318] text-white" : "border-[#2b1e23] text-[#c7bcc0]"
                                  }`}
                                >
                                  {POS_NOMBRE[p]}
                                </button>
                              ))}
                            </div>
                            <div>
                              <label className="text-[11px] text-white">Tamaño: {tamanoMarca}%</label>
                              <input type="range" min={10} max={60} value={tamanoMarca} onChange={(e) => setTamanoMarca(Number(e.target.value))} className="w-full accent-[#f43f5e]" />
                            </div>
                            <div>
                              <label className="text-[11px] text-white">Opacidad: {opacidadMarca}%</label>
                              <input type="range" min={20} max={100} value={opacidadMarca} onChange={(e) => setOpacidadMarca(Number(e.target.value))} className="w-full accent-[#f43f5e]" />
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>

                  <div>
                    <p className="mb-2 text-[11px] font-bold text-white">
                      Vista previa · {aspecto} · {calidadUsada}
                    </p>
                    <div className="flex justify-center">
                      <div
                        className={`relative overflow-hidden rounded-lg border border-[#2b1e23] bg-black ${ANCHO_PREVIA[aspecto]}`}
                        style={{ aspectRatio: aspecto.replace(":", " / "), containerType: "inline-size" } as React.CSSProperties}
                      >
                        {videoSrc ? (
                          <video
                            ref={previaRef}
                            src={videoSrc}
                            muted
                            playsInline
                            preload="metadata"
                            onLoadedMetadata={() => {
                              if (previaRef.current) previaRef.current.currentTime = inicioSeg;
                            }}
                            className={`h-full w-full ${encuadre === "Rellenar" ? "object-cover" : "object-contain"}`}
                            style={{ filter: cssFiltro, transform: espejo ? "scaleX(-1)" : undefined }}
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[11px] text-[#6f6267]">Sube un video</div>
                        )}

                        {vineta && (
                          <div
                            className="pointer-events-none absolute inset-0"
                            style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.7) 100%)" }}
                          />
                        )}

                        {textos
                          .filter((t) => t.texto.trim())
                          .map((t) => (
                            <div
                              key={t.id}
                              className={`absolute left-1/2 max-w-[92%] -translate-x-1/2 whitespace-pre-wrap text-center font-black leading-tight ${POS_TEXTO_CLASE[t.pos]} ${
                                t.fondo ? "rounded bg-black/60 px-[2cqw] py-[1cqw]" : ""
                              }`}
                              style={{
                                color: t.color,
                                fontSize: `${t.tam}cqw`,
                                textShadow: t.fondo ? "none" : "0 0 4px #000, 0 0 4px #000, 0 0 2px #000",
                              }}
                            >
                              {t.texto}
                            </div>
                          ))}

                        {plan.marcaPropia && modoMarca === "texto" && textoMarca.trim() && (
                          <div
                            className={`absolute whitespace-nowrap rounded bg-black/45 px-1.5 py-0.5 font-bold text-white ${POS_CLASE[posMarca]}`}
                            style={{ opacity: opacidadMarca / 100, fontSize: `${Math.max(7, tamanoMarca / 3)}px` }}
                          >
                            {textoMarca}
                          </div>
                        )}
                        {plan.marcaPropia && modoMarca === "logo" && logoUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={logoUrl}
                            alt="Logo"
                            className={`absolute h-auto ${POS_CLASE[posMarca]}`}
                            style={{ width: `${tamanoMarca}%`, opacity: opacidadMarca / 100 }}
                          />
                        )}
                        {plan.marcaPlataforma && (
                          <div className="absolute bottom-[3%] left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/45 px-1.5 py-0.5 text-[8px] font-bold text-white/85">
                            Clips Limpieza
                          </div>
                        )}
                      </div>
                    </div>
                    <p className="mt-2 text-center text-[10px] text-[#9e9196]">
                      La vista previa es aproximada y no incluye sonidos. Duración final: {duracionFinal.toFixed(1)}s
                    </p>
                  </div>

                  <div className="space-y-2 border-t border-[#2b1e23] pt-4">
                    <button onClick={generarMP4} disabled={procesando || !videoSrc} className={`${BTN_ROSA} w-full`}>
                      {procesando ? `Procesando ${progreso}%` : "↓ Generar y descargar MP4"}
                    </button>
                    {procesando && (
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#2b1e23]">
                        <div className="h-full bg-[#f43f5e] transition-all" style={{ width: `${progreso}%` }} />
                      </div>
                    )}
                    {mensaje && <p className="text-xs font-bold text-[#f43f5e]">{mensaje}</p>}
                    <p className="text-[11px] text-[#9e9196]">
                      {textoUso}. Cada MP4 también queda en tu biblioteca mientras no cierres la página.
                    </p>
                  </div>
                </section>
              </div>
            )}

            {seccion === "biblioteca" && (
              <div>
                <Titulo>Biblioteca</Titulo>
                {guardados.length === 0 ? (
                  <p className="mt-3 text-xs text-[#9e9196]">No hay clips guardados todavía.</p>
                ) : (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {guardados.map((c) => (
                      <div key={c.id} className={CARD}>
                        {c.url && <video src={c.url} controls className="mb-2.5 aspect-video w-full rounded bg-black object-contain" />}
                        <h3 className="text-xs font-bold text-white">{c.titulo}</h3>
                        <p className="mb-2 text-[11px] text-[#9e9196]">
                          {c.inicio} - {c.fin} · {c.formato}
                        </p>
                        {c.url && (
                          <a href={c.url} download="clip.mp4" className="inline-block rounded bg-[#f43f5e] px-3 py-1.5 text-xs font-bold text-white">
                            ↓ Descargar
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}