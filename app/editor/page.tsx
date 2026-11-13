"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

type Seccion =
  | "resumen"
  | "directos"
  | "videos"
  | "editor"
  | "biblioteca"
  | "activar";

interface ClipGuardado {
  id: string;
  titulo: string;
  inicio: string;
  fin: string;
  formato: string;
  url?: string;
  papelera?: boolean;
}

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
  { id: "directos", label: "En Vivos (Lives)", icono: "●" },
  { id: "videos", label: "Videos Normales", icono: "▷" },
  { id: "editor", label: "Editor y Cortes", icono: "✂" },
  { id: "biblioteca", label: "Biblioteca", icono: "▤" },
  { id: "activar", label: "🔑 Activar Licencia", icono: "★" },
];

const NOMBRE_SECCION: Record<Seccion, string> = {
  resumen: "Resumen",
  directos: "En Vivos",
  videos: "Videos Normales",
  editor: "Editor",
  biblioteca: "Biblioteca",
  activar: "Activación de Licencia",
};

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
  const partes = txt.trim().split(":").map((p) => Number(p));
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
  if (u.includes("instagram.com")) return "Instagram Reels";
  if (u.includes("spotify.com")) return "Spotify";
  if (u.includes("facebook.com") || u.includes("fb.watch")) return "Facebook";
  if (u.includes("kick.com")) return "Kick";
  if (u.includes("twitch.tv")) return "Twitch";
  return null;
};

const DIMENSIONES: Record<string, Record<string, [number, number]>> = {
  "9:16": { "720p": [720, 1280], "1080p": [1080, 1920] },
  "1:1": { "720p": [720, 720], "1080p": [1080, 1080] },
  "16:9": { "720p": [1280, 720], "1080p": [1920, 1080] },
};

const cargarScript = (src: string) =>
  new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("No se pudo cargar " + src));
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
    <h1 className="mb-2 text-3xl font-black leading-[1.05] tracking-tight text-white sm:text-4xl lg:text-5xl">
      {children}
    </h1>
  );
}

const CAMPO =
  "w-full rounded-lg border border-[#2b1e23] bg-[#0b0709] px-3.5 py-2.5 text-sm text-white placeholder:text-[#6f6267] focus:border-[#f43f5e]/65 focus:outline-none";

const BTN_ROSA =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-[#f43f5e] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#e11d48]";

const BTN_GRIS =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-[#2b1e23] bg-[#150e12] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#21161b]";

const CARD = "rounded-2xl border border-[#2a1c22] bg-[#150d11]/90 p-5 sm:p-6";

export default function EditorStudioPage() {
  const [seccion, setSeccion] = useState<Seccion>("resumen");
  const [menuAbierto, setMenuAbierto] = useState(false);

  const [urlInput, setUrlInput] = useState("");
  const [estadoProceso, setEstadoProceso] = useState("En espera");

  const [licenciaActiva, setLicenciaActiva] = useState(false);
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
  const [textoMarcaAgua, setTextoMarcaAgua] = useState("@TuMarca");
  
  const [procesando, setProcesando] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [mensaje, setMensaje] = useState("");
  const [resultadoUrl, setResultadoUrl] = useState<string | null>(null);

  const [clips, setClips] = useState<ClipGuardado[]>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pararEnRef = useRef<number | null>(null);

  const ffmpegRef = useRef<any>(null);
  const utilRef = useRef<any>(null);
  const cargandoRef = useRef<Promise<void> | null>(null);

  const inicioSeg = Number.isNaN(leerTiempo(inicioTxt)) ? 0 : leerTiempo(inicioTxt);
  const finSeg = Number.isNaN(leerTiempo(finTxt)) ? 0 : leerTiempo(finTxt);
  const duracionClip = Math.max(0, finSeg - inicioSeg);

  useEffect(() => {
    const licenciaGuardada = localStorage.getItem("trucho_licencia_activa");
    if (licenciaGuardada === "true") {
      setLicenciaActiva(true);
    }

    const leer = () => {
      const h = window.location.hash.replace("#", "");
      setSeccion(SECCION_POR_HASH[h] ?? "resumen");
    };
    leer();
    window.addEventListener("hashchange", leer);
    return () => window.removeEventListener("hashchange", leer);
  }, []);

  const activarCodigoUnico = (e: React.FormEvent) => {
    e.preventDefault();
    const codigoLimpio = codigoInput.trim();
    const LLAVE_MAESTRA = "ELTRUCHO-ADMIN-MASTER";
    const codigosValidosClientes = ["TRUCHO-PRO-777", "VIP-LIVES-2026", "CLIENTE-PREMIUM-1", "CLIP-MASTER-99"];

    if (codigoLimpio === LLAVE_MAESTRA || codigosValidosClientes.includes(codigoLimpio)) {
      localStorage.setItem("trucho_licencia_activa", "true");
      setLicenciaActiva(true);
      setMensajeLicencia("¡Licencia activada con éxito! Acceso libre concedido.");
      setTimeout(() => irA("editor"), 1000);
    } else {
      setMensajeLicencia("Código incorrecto o inválido.");
    }
  };

  const irA = useCallback((s: Seccion) => {
    setSeccion(s);
    setMenuAbierto(false);
    const h = HASH_