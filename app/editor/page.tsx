"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { puntuarVentanas } from "../lib/puntuacion-momentos";

type Seccion = "videos" | "directos" | "editor" | "biblioteca";
type TabEditor = "cortes" | "subtitulos" | "marca" | "stickers" | "efectos";

interface ClipGuardado {
  id: string;
  titulo: string;
  hashtags: string;
  inicio: string;
  fin: string;
  formato: string;
  url: string;
  blob: Blob;
  savedPath?: string;
}

interface MomentoDetectado {
  inicio: number;
  fin: number;
  titulo: string;
  puntaje: number;
  motivo?: string;
}

interface ClipLiveCreado {
  numero: number;
  archivo: string;
  duracion: number;
  hora: string;
  puntaje?: number;
  motivo?: string;
}

interface LineaSubtitulo {
  id: string;
  inicio: number;
  fin: number;
  texto: string;
}

interface ResultadoEnlace {
  plataforma: string;
  esEnVivo?: boolean;
  ytId?: string | null;
  twitchChannel?: string | null;
  kickChannel?: string | null;
  titulo: string;
  thumbnail: string;
  streamUrl: string | null;
  audioUrl?: string | null;
  originalUrl?: string;
  localFile?: File | null;
  momentos: MomentoDetectado[];
  subtitulos?: LineaSubtitulo[];
  tramosIgnorados?: number;
  analisisNota?: string;
  /** Ventana en vivo guardada (para cortar sus momentos en 4K 60fps). */
  ventanaId?: string | null;
  /** Segundos de directo analizados en esa ventana. */
  ventanaEnVivoSegundos?: number;
}

interface SegmentoCorte {
  id: string;
  etiqueta: string;
  archivo?: File;
  streamUrl?: string | null;
  audioUrl?: string | null;
  originalUrl?: string;
  inicio: number;
  fin: number;
}

interface StickerItem {
  id: string;
  tipo: "emoji" | "imagen";
  contenido: string;
  x: number;
  y: number;
  tamano: number;
}

interface TokensCuentas {
  youtubeToken: string;
  tiktokToken: string;
  facebookToken: string;
  facebookPageId: string;
}

const MENU: { id: Seccion; label: string; icono: string }[] = [
  { id: "videos", label: "Videos y Enlaces", icono: "▷" },
  { id: "directos", label: "En Vivos / Streaming", icono: "●" },
  { id: "editor", label: "Editor 9:16 y Pegar", icono: "✂" },
  { id: "biblioteca", label: "Publicar y Biblioteca", icono: "🚀" },
];

const EMOJIS_VIRALES = ["🔥", "😂", "😱", "💯", "⚡", "👀", "💀", "🎯", "🚀", "❤️", "👏", "🤯"];

const EFECTOS_VIDEO: Record<string, { label: string; css: string }> = {
  normal: { label: "Normal (Original)", css: "none" },
  vibrante: { label: "Vibrante 🔥", css: "contrast(1.15) saturate(1.45)" },
  cine: { label: "Cine 🎬", css: "contrast(1.22) saturate(0.85) brightness(0.95)" },
  contraste: { label: "Alto Contraste ⚡", css: "contrast(1.35) saturate(1.1)" },
  byn: { label: "Blanco y Negro 🖤", css: "grayscale(1) contrast(1.25)" },
  calido: { label: "Cálido ☀️", css: "sepia(0.25) saturate(1.3) brightness(1.04)" },
};

const STOPWORDS = new Set([
  "para", "como", "pero", "este", "esta", "estos", "estas", "todo", "todos",
  "sobre", "desde", "hasta", "donde", "quien", "cuando", "porque", "entre",
  "también", "solo", "tiene", "hacer", "puede", "más", "muy", "sin", "con",
  "del", "los", "las", "una", "uno", "unos", "unas", "por", "que", "video",
  "shorts", "youtube", "tiktok", "clip", "clips", "parte", "oficial",
]);

function generarTituloYHashtagsDelContenido(fuenteTexto: string): {
  titulo: string;
  hashtags: string;
} {
  const limpio = fuenteTexto
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\.mp4|\.webm|\.mov/gi, "")
    .replace(/[_|#-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const palabras = limpio
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));

  const unicas: string[] = [];
  for (const p of palabras) {
    if (!unicas.includes(p)) unicas.push(p);
    if (unicas.length >= 5) break;
  }

  const baseTema = limpio.length > 4 ? limpio.slice(0, 65) : "Momento épico captado en vivo";
  const titulo = `¡NO VAS A CREER ESTO! 😱🔥 ${baseTema}`;
  const tagsContenido = unicas.map((w) => `#${w}`);
  const tagsVirales = ["#shorts", "#viral", "#parati", "#fyp", "#reels", "#tendencia"];
  const hashtags = [...tagsContenido, ...tagsVirales].slice(0, 8).join(" ");

  return { titulo, hashtags };
}

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
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "YouTube / Live";
  if (u.includes("tiktok.com")) return "TikTok";
  if (u.includes("instagram.com")) return "Instagram";
  if (u.includes("facebook.com") || u.includes("fb.watch")) return "Facebook";
  if (u.includes("kick.com")) return "Kick";
  if (u.includes("twitch.tv")) return "Twitch";
  return null;
};

// Exportación en 4K a 60fps: 2160x3840 vertical (TikTok/Shorts),
// 3840x2160 horizontal (YouTube), 2160x2160 cuadrado.
const DIMENSIONES: Record<string, Record<string, [number, number]>> = {
  "9:16": { "720p": [720, 1280], "1080p": [1080, 1920], "4K": [2160, 3840] },
  "1:1": { "720p": [720, 720], "1080p": [1080, 1080], "4K": [2160, 2160] },
  "16:9": { "720p": [1280, 720], "1080p": [1920, 1080], "4K": [3840, 2160] },
};

const CAMPO =
  "w-full rounded-lg border border-[#2b1e23] bg-[#0b0709] px-3 py-2 text-xs text-white placeholder:text-[#6f6267] focus:border-[#f43f5e]/65 focus:outline-none";

const BTN_ROSA =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-[#f43f5e] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#e11d48] disabled:opacity-50";

const BTN_GRIS =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-[#2b1e23] bg-[#150e12] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#21161b] disabled:opacity-50";

const CARD = "rounded-2xl border border-[#2a1c22] bg-[#150d11]/90 p-4 sm:p-5";

function envolverLineas(
  ctx: CanvasRenderingContext2D,
  texto: string,
  maxWidth: number
): string[] {
  const palabras = texto.split(/\s+/).filter(Boolean);
  const lineas: string[] = [];
  let actual = "";
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (ctx.measureText(prueba).width > maxWidth && actual) {
      lineas.push(actual);
      actual = p;
    } else {
      actual = prueba;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

export default function EditorStudioPage() {
  const [seccion, setSeccion] = useState<Seccion>("directos");
  const [tabEditor, setTabEditor] = useState<TabEditor>("cortes");
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [hostActual, setHostActual] = useState("localhost");

  const [urlInput, setUrlInput] = useState("");
  const [analizandoLink, setAnalizandoLink] = useState(false);
  const [avisoLink, setAvisoLink] = useState("");
  const [resultadoLink, setResultadoLink] = useState<ResultadoEnlace | null>(null);
  const [previewStartSec, setPreviewStartSec] = useState<number>(0);
  const [corteActivoPreviewIdx, setCorteActivoPreviewIdx] = useState<number | null>(null);
  const [procesandoMomentoIdx, setProcesandoMomentoIdx] = useState<number | null>(null);

  const [formatoAuto, setFormatoAuto] = useState("9:16");
  const [encuadre, setEncuadre] = useState<"crop" | "blur">("blur");
  const [duracionClipAuto, setDuracionClipAuto] = useState(15);
  const [cantidadClipsNum, setCantidadClipsNum] = useState<number>(100);
  const [marcaAuto, setMarcaAuto] = useState("@TuMarca");

  const esIlimitado = cantidadClipsNum >= 100;

  const [grabandoLive, setGrabandoLive] = useState(false);
  const [segundosLiveGrabados, setSegundosLiveGrabados] = useState(0);
  const [clipsLiveGuardadosDisco, setClipsLiveGuardadosDisco] = useState(0);
  const [autoCorteEnVivoActivo, setAutoCorteEnVivoActivo] = useState(true);

  const [liveServerJobId, setLiveServerJobId] = useState<string | null>(null);
  const [liveServerActivo, setLiveServerActivo] = useState(false);
  const [liveServerClipsCount, setLiveServerClipsCount] = useState(0);
  const [liveServerLista, setLiveServerLista] = useState<ClipLiveCreado[]>([]);
  const [soloMejoresLive, setSoloMejoresLive] = useState(false);
  const [ordenandoLive, setOrdenandoLive] = useState(false);
  const [segundosTranscurridosServidor, setSegundosTranscurridosServidor] = useState(0);
  const [cargandoClipLiveArchivo, setCargandoClipLiveArchivo] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const liveStreamRef = useRef<MediaStream | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const linkVideoRef = useRef<HTMLVideoElement | null>(null);
  const contadorAutoBrowserRef = useRef<number>(0);

  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [nombreProyecto, setNombreProyecto] = useState("");
  const [tiempoActual, setTiempoActual] = useState(0);

  const [inicioTxt, setInicioTxt] = useState("00:00");
  const [finTxt, setFinTxt] = useState("00:15");
  const [cortes, setCortes] = useState<SegmentoCorte[]>([]);

  const [subtitulos, setSubtitulos] = useState<LineaSubtitulo[]>([]);
  const [generandoSubs, setGenerandoSubs] = useState(false);
  const [estadoSubs, setEstadoSubs] = useState("");
  const [subPos, setSubPos] = useState<"abajo" | "centro" | "arriba">("abajo");
  const [subColor, setSubColor] = useState("#ffffff");
  const [subTamano, setSubTamano] = useState(42);

  const [textoMarcaAgua, setTextoMarcaAgua] = useState("@TuMarca");
  const [marcaPos, setMarcaPos] = useState<"br" | "bl" | "tr" | "tl" | "center">("tr");
  const [marcaColor, setMarcaColor] = useState("#ffffff");
  const [logoMarcaDataUrl, setLogoMarcaDataUrl] = useState<string | null>(null);

  const [stickers, setStickers] = useState<StickerItem[]>([]);
  const [aspecto, setAspecto] = useState("9:16");
  const [calidad, setCalidad] = useState("4K");
  const [velocidad, setVelocidad] = useState(1);
  const [efecto, setEfecto] = useState("normal");
  const [audioGain, setAudioGain] = useState(1.25);

  const [procesando, setProcesando] = useState(false);
  const [progresoPaso, setProgresoPaso] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [clipFinalReciente, setClipFinalReciente] = useState<ClipGuardado | null>(null);
  const [clips, setClips] = useState<ClipGuardado[]>([]);

  const [mostrarConfigTokens, setMostrarConfigTokens] = useState(false);
  const [subiendoDirecto, setSubiendoDirecto] = useState<string | null>(null);
  const [estadoPublicacion, setEstadoPublicacion] = useState("");
  const [tokens, setTokens] = useState<TokensCuentas>({
    youtubeToken: "",
    tiktokToken: "",
    facebookToken: "",
    facebookPageId: "",
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const stickerInputRef = useRef<HTMLInputElement | null>(null);

  const sincrpZEAWYtiB6bJ16NuLbGCc6CZ6jJdKfb63 = useCallback(async () => {
    try {
      const r = await fetch("/api/live-auto");
      const d = await r.json();
      if (d.ok && d.activo && Array.isArray(d.clipsLista)) {
        if (d.jobId) setLiveServerJobId(d.jobId);
        setLiveServerActivo(true);
        setLiveServerLista(d.clipsLista);
        setLiveServerClipsCount(d.clipsGenerados || d.clipsLista.length);
      }
    } catch {
      // Ignorar
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setHostActual(window.location.hostname || "localhost");
    }
    try {
      const saved = localStorage.getItem("clips_limpieza_tokens");
      if (saved) setTokens(JSON.parse(saved));
    } catch {
      // Ignorar
    }
    sincrpZEAWYtiB6bJ16NuLbGCc6CZ6jJdKfb63();
  }, [sincrpZEAWYtiB6bJ16NuLbGCc6CZ6jJdKfb63]);

  useEffect(() => {
    const streamUrl = resultadoLink?.streamUrl;
    const videoEl = linkVideoRef.current;
    if (!streamUrl || !videoEl) return;

    if (streamUrl.includes(".m3u8")) {
      if (videoEl.canPlayType("application/vnd.apple.mpegurl")) {
        videoEl.src = streamUrl;
        videoEl.play().catch(() => {});
        return;
      }
      let hlsInstance: any = null;
      const cargarHls = async () => {
        try {
          const importarCDN = new Function("u", "return import(u)");
          const mod = await importarCDN("https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.mjs");
          const Hls = mod.default;
          if (Hls && Hls.isSupported()) {
            hlsInstance = new Hls();
            hlsInstance.loadSource(streamUrl);
            hlsInstance.attachMedia(videoEl);
            hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
              videoEl.play().catch(() => {});
            });
          }
        } catch {
          // Continuar
        }
      };
      cargarHls();
      return () => {
        if (hlsInstance) hlsInstance.destroy();
      };
    } else {
      videoEl.src = streamUrl;
      if (previewStartSec > 0) videoEl.currentTime = previewStartSec;
      videoEl.play().catch(() => {});
    }
  }, [resultadoLink?.streamUrl, previewStartSec]);

  const asignarRefVideoEnVivo = useCallback((el: HTMLVideoElement | null) => {
    liveVideoRef.current = el;
    if (el && liveStreamRef.current) {
      if (el.srcObject !== liveStreamRef.current) {
        el.srcObject = liveStreamRef.current;
      }
      el.muted = true;
      el.play().catch(() => {});
    }
  }, []);

  const guardarTokensLocal = (nuevos: TokensCuentas) => {
    setTokens(nuevos);
    try {
      localStorage.setItem("clips_limpieza_tokens", JSON.stringify(nuevos));
    } catch {
      // Ignorar
    }
  };

  useEffect(() => {
    if (!grabandoLive) {
      setSegundosLiveGrabados(0);
      return;
    }

    const timer = setInterval(() => {
      setSegundosLiveGrabados((prev) => {
        const nuevo = prev + 1;
        if (
          autoCorteEnVivoActivo &&
          nuevo > 0 &&
          nuevo % duracionClipAuto === 0 &&
          chunksRef.current.length > 0
        ) {
          if (!esIlimitado && contadorAutoBrowserRef.current >= cantidadClipsNum) {
            recorderRef.current?.stop();
            return nuevo;
          }

          const numActual = contadorAutoBrowserRef.current + 1;
          contadorAutoBrowserRef.current = numActual;

          const blobSegmento = new Blob(chunksRef.current.splice(0, chunksRef.current.length), {
            type: "video/webm",
          });

          const form = new FormData();
          form.append("chunk", blobSegmento, `seg-${numActual}.webm`);
          form.append("encuadre", encuadre);
          form.append("marca", marcaAuto);
          form.append("numeroClip", String(numActual));

          fetch("/api/live-auto", { method: "POST", body: form })
            .then((r) => r.json())
            .then((d) => {
              if (d.ok && d.nombreArchivo) {
                setClipsLiveGuardadosDisco((c) => c + 1);
                setLiveServerLista((prevLista) => [
                  {
                    numero: numActual,
                    archivo: d.nombreArchivo,
                    duracion: duracionClipAuto,
                    hora: new Date().toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    }),
                  },
                  ...prevLista,
                ]);
                setAvisoLink(
                  `💾 Clip #${numActual} (${duracionClipAuto}s) guardado y listo para llevar al editor.`
                );
              }
            })
            .catch(() => {});

          if (!esIlimitado && numActual >= cantidadClipsNum) {
            setTimeout(() => recorderRef.current?.stop(), 500);
          }
        }
        return nuevo;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [
    grabandoLive,
    autoCorteEnVivoActivo,
    duracionClipAuto,
    esIlimitado,
    cantidadClipsNum,
    encuadre,
    marcaAuto,
  ]);

  useEffect(() => {
    if (!liveServerJobId || !liveServerActivo) {
      setSegundosTranscurridosServidor(0);
      return;
    }

    const reloj = setInterval(() => {
      setSegundosTranscurridosServidor((s) => s + 1);
    }, 1000);

    const poll = setInterval(async () => {
      try {
        const r = await fetch(`/api/live-auto?jobId=${encodeURIComponent(liveServerJobId)}`);
        const d = await r.json();
        if (d.ok) {
          setLiveServerClipsCount(d.clipsGenerados || 0);
          if (Array.isArray(d.clipsLista)) {
            setLiveServerLista(d.clipsLista);
          }
          if (d.error) {
            setAvisoLink(`⚠️ ${d.error}`);
          } else if (d.ultimoArchivo) {
            setAvisoLink(
              `🟢 Grabando en vivo: ${d.clipsGenerados} ${
                d.objetivoClips === "ilimitado" ? "(∞ Ilimitado)" : `/ ${d.objetivoClips}`
              } clips cortados en tiempo real → último: ${d.ultimoArchivo}`
            );
          }
          if (!d.activo) {
            setLiveServerActivo(false);
          }
        }
      } catch {
        // Ignorar
      }
    }, 2500);

    return () => {
      clearInterval(reloj);
      clearInterval(poll);
    };
  }, [liveServerJobId, liveServerActivo]);

  const inicioSeg = Number.isNaN(leerTiempo(inicioTxt)) ? 0 : leerTiempo(inicioTxt);
  const finSeg = Number.isNaN(leerTiempo(finTxt)) ? 0 : leerTiempo(finTxt);
  const duracionClip = Math.max(0, finSeg - inicioSeg);

  const subtituloActivo = subtitulos.find(
    (s) => tiempoActual >= s.inicio && tiempoActual <= s.fin
  );

  const irA = useCallback((s: Seccion) => {
    setSeccion(s);
    setMenuAbierto(false);
    window.scrollTo({ top: 0 });
  }, []);

  const previsualizarCorteEnPantalla = (m: MomentoDetectado, idx: number) => {
    setCorteActivoPreviewIdx(idx);
    setPreviewStartSec(m.inicio);
    if (linkVideoRef.current && !resultadoLink?.streamUrl?.includes(".m3u8")) {
      linkVideoRef.current.currentTime = m.inicio;
      linkVideoRef.current.play().catch(() => {});
    }
  };

  const previsualizarClipLiveEnPantalla = (nombreArchivo: string) => {
    setResultadoLink((prev) => ({
      plataforma: prev?.plataforma || "Directo En Vivo",
      esEnVivo: false,
      ytId: null,
      twitchChannel: null,
      kickChannel: null,
      titulo: nombreArchivo,
      thumbnail: "",
      streamUrl: `/api/live-auto?file=${encodeURIComponent(nombreArchivo)}`,
      momentos: [],
    }));
    setPreviewStartSec(0);
  };

  // V7: devuelve {ok, error} — antes, si el auto-corte fallaba en el
  // servidor (p. ej. el mkdir 500 de la v6), su error se tapaba con el
  // mensaje genérico de "lista HLS" que venía después. Ahora el error
  // real se guarda y se muestra.
  const iniciarAutoClipeoServidorEnVivo = async (
    urlOpcional?: string,
    streamDirectoOpcional?: string | null
  ): Promise<{ ok: boolean; error: string | null }> => {
    const enlaceAUsar = (urlOpcional || urlInput).trim();
    if (!enlaceAUsar && !streamDirectoOpcional) {
      setAvisoLink("Pega primero el enlace del streaming en vivo arriba.");
      return { ok: false, error: "Pega primero el enlace del streaming en vivo arriba." };
    }

    try {
      setAvisoLink("🔴 Conectando al directo en vivo para cortar en tiempo real...");
      const res = await fetch("/api/live-auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          url: enlaceAUsar,
          streamUrl: streamDirectoOpcional || null,
          duracionClip: duracionClipAuto,
          cantidadClips: esIlimitado ? "ilimitado" : cantidadClipsNum,
          encuadre,
          marca: marcaAuto,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        // Error REAL del servidor (no genérico): se muestra tal cual y se
        // devuelve para que no lo tape el mensaje de después.
        const errReal =
          data?.error ||
          `El servidor devolvió HTTP ${res.status} al iniciar el auto-corte.`;
        setAvisoLink(errReal);
        return { ok: false, error: errReal };
      }

      setLiveServerLista([]);
      setLiveServerClipsCount(0);
      setClipsLiveGuardadosDisco(0);
      setLiveServerJobId(data.jobId);
      setLiveServerActivo(true);
      setSegundosTranscurridosServidor(0);
      setAvisoLink(
        `🟢 Viendo directo en pantalla y grabando en tiempo real: soltará un clip 9:16 cada ${duracionClipAuto}s (${
          esIlimitado ? "∞ ILIMITADO sin parar" : `hasta llegar a ${cantidadClipsNum} clips`
        }).`
      );
      return { ok: true, error: null };
    } catch {
      setAvisoLink("Error de conexión al iniciar el modo continuo.");
      return { ok: false, error: "Error de conexión al iniciar el modo continuo." };
    }
  };

  const detenerAutoClipeoServidorEnVivo = async () => {
    if (liveServerJobId) {
      const res = await fetch("/api/live-auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop", jobId: liveServerJobId }),
      }).catch(() => null);
      if (res) {
        const d = await res.json().catch(() => null);
        if (Array.isArray(d?.clipsLista)) setLiveServerLista(d.clipsLista);
        if (typeof d?.clipsGenerados === "number") setLiveServerClipsCount(d.clipsGenerados);
      }
    }
    setLiveServerActivo(false);
    setAvisoLink(
      "⏹ Grabación detenida. Ya puedes seleccionar cualquier clip abajo para llevarlo al Editor 9:16."
    );
  };

  const limpiarListaClipsEnVivo = async () => {
    setLiveServerLista([]);
    setLiveServerClipsCount(0);
    setClipsLiveGuardadosDisco(0);
    setLiveServerActivo(false);
    setLiveServerJobId(null);
    setResultadoLink(null);
    setCortes([]);
    await fetch("/api/live-auto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear" }),
    }).catch(() => {});
    setAvisoLink("🗑 Lista limpiada. Listo para otro streaming.");
  };

  const generarCapaBaseBlob = async (
    w: number,
    h: number,
    marcaTexto: string,
    incluirStickersYLogo: boolean
  ): Promise<Blob | null> => {
    const tieneTexto = marcaTexto.trim().length > 0;
    const tieneExtras = incluirStickersYLogo && (stickers.length > 0 || Boolean(logoMarcaDataUrl));
    if (!tieneTexto && !tieneExtras) return null;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    if (incluirStickersYLogo && logoMarcaDataUrl) {
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          const logoW = Math.round(w * 0.24);
          const logoH = Math.round((img.height / img.width) * logoW);
          let lx = w - logoW - 28;
          let ly = 40;
          if (marcaPos === "bl") {
            lx = 28;
            ly = h - logoH - 40;
          } else if (marcaPos === "br") {
            lx = w - logoW - 28;
            ly = h - logoH - 40;
          } else if (marcaPos === "tl") {
            lx = 28;
            ly = 40;
          } else if (marcaPos === "center") {
            lx = Math.round((w - logoW) / 2);
            ly = Math.round((h - logoH) / 2);
          }
          ctx.globalAlpha = 0.92;
          ctx.drawImage(img, lx, ly, logoW, logoH);
          ctx.globalAlpha = 1;
          resolve();
        };
        img.onerror = () => resolve();
        img.src = logoMarcaDataUrl;
      });
    } else if (tieneTexto) {
      const fontSize = Math.round(w * 0.04);
      ctx.font = `800 ${fontSize}px sans-serif`;
      const metrics = ctx.measureText(marcaTexto.trim());
      const boxW = Math.round(metrics.width + 28);
      const boxH = Math.round(fontSize + 18);

      let bx = w - boxW - 28;
      let by = 40;
      if (marcaPos === "bl") {
        bx = 28;
        by = h - boxH - 40;
      } else if (marcaPos === "br") {
        bx = w - boxW - 28;
        by = h - boxH - 40;
      } else if (marcaPos === "tl") {
        bx = 28;
        by = 40;
      } else if (marcaPos === "center") {
        bx = Math.round((w - boxW) / 2);
        by = Math.round((h - boxH) / 2);
      }

      ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
      ctx.beginPath();
      ctx.roundRect(bx, by, boxW, boxH, 10);
      ctx.fill();

      ctx.fillStyle = marcaColor || "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(marcaTexto.trim(), bx + boxW / 2, by + boxH / 2);
    }

    if (incluirStickersYLogo) {
      for (const st of stickers) {
        const px = Math.round((st.x / 100) * w);
        const py = Math.round((st.y / 100) * h);
        const scale = w / 360;
        const sz = Math.round(st.tamano * scale);

        if (st.tipo === "emoji") {
          ctx.font = `${sz}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(st.contenido, px, py);
        } else {
          await new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => {
              const ih = Math.round((img.height / img.width) * sz);
              ctx.drawImage(img, px - sz / 2, py - ih / 2, sz, ih);
              resolve();
            };
            img.onerror = () => resolve();
            img.src = st.contenido;
          });
        }
      }
    }

    return await new Promise((res) => canvas.toBlob(res, "image/png"));
  };

  const generarCapaSubtituloBlob = async (
    w: number,
    h: number,
    texto: string
  ): Promise<Blob | null> => {
    const limpio = texto.trim();
    if (!limpio) return null;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const fontSize = Math.round(subTamano * (w / 720));
    ctx.font = `900 ${fontSize}px sans-serif`;
    const lineas = envolverLineas(ctx, limpio.toUpperCase(), Math.round(w * 0.86));
    const lineH = Math.round(fontSize * 1.25);
    const totalH = lineas.length * lineH + 26;

    const maxLineW = Math.max(...lineas.map((l) => ctx.measureText(l).width));
    const boxW = Math.min(w - 32, Math.round(maxLineW + 46));
    const boxX = Math.round((w - boxW) / 2);

    let boxY = Math.round(h * 0.74);
    if (subPos === "arriba") boxY = Math.round(h * 0.14);
    else if (subPos === "centro") boxY = Math.round((h - totalH) / 2);

    ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, totalH, 16);
    ctx.fill();

    ctx.fillStyle = subColor || "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    lineas.forEach((l, idx) => {
      const cy = boxY + 14 + lineH * idx + lineH / 2;
      ctx.fillText(l, w / 2, cy);
    });

    return await new Promise((res) => canvas.toBlob(res, "image/png"));
  };

  const generarClipDeMomento = async (momento: MomentoDetectado, idx: number) => {
    if (!resultadoLink) return;

    try {
      setProcesandoMomentoIdx(idx);
      previsualizarCorteEnPantalla(momento, idx);
      setAvisoLink(
        `⚡ Transcribiendo audio real y cortando "${momento.titulo}" (${formatearTiempo(
          momento.inicio
        )} → ${formatearTiempo(momento.fin)}) en 9:16...`
      );

      let listaSubs = resultadoLink.subtitulos || subtitulos;
      if (listaSubs.length === 0) {
        try {
          const formTr = new FormData();
          if (resultadoLink.localFile) formTr.append("video", resultadoLink.localFile);
          if (resultadoLink.originalUrl) formTr.append("originalUrl", resultadoLink.originalUrl);
          formTr.append("inicio", String(momento.inicio));
          formTr.append("duracion", String(momento.fin - momento.inicio));

          const trRes = await fetch("/api/transcribe", { method: "POST", body: formTr });
          const trData = await trRes.json();
          if (trData.ok && Array.isArray(trData.subtitulos) && trData.subtitulos.length > 0) {
            listaSubs = trData.subtitulos.map((s: LineaSubtitulo) => ({
              ...s,
              inicio: s.inicio + momento.inicio,
              fin: s.fin + momento.inicio,
            }));
          }
        } catch {
          // Continuar
        }
      }

      const [w, h] = DIMENSIONES[formatoAuto][calidad] || DIMENSIONES[formatoAuto]["4K"];
      const form = new FormData();

      if (resultadoLink.localFile) {
        form.append("file_0", resultadoLink.localFile);
        form.append(
          "segmentos",
          JSON.stringify([
            {
              tipo: "archivo",
              fileKey: "file_0",
              inicio: momento.inicio,
              fin: momento.fin,
            },
          ])
        );
      } else {
        form.append(
          "segmentos",
          JSON.stringify([
            {
              tipo: "url",
              originalUrl: resultadoLink.originalUrl,
              streamUrl: resultadoLink.streamUrl,
              audioUrl: resultadoLink.audioUrl,
              inicio: momento.inicio,
              fin: momento.fin,
            },
          ])
        );
      }

      form.append("aspecto", formatoAuto);
      form.append("calidad", calidad);
      form.append("encuadre", encuadre);
      form.append("velocidad", String(velocidad));
      form.append("efecto", "normal");
      form.append("audioGain", String(audioGain));
      form.append("tituloSubAuto", resultadoLink.titulo);

      const overlayMarca = await generarCapaBaseBlob(w, h, marcaAuto, false);
      if (overlayMarca) {
        form.append("overlayBase", overlayMarca, "marca.png");
      }

      const subsTramo = listaSubs
        .filter((s) => s.fin >= momento.inicio && s.inicio <= momento.fin)
        .map((s) => ({
          inicio: Math.max(0, s.inicio - momento.inicio),
          fin: Math.min(momento.fin - momento.inicio, s.fin - momento.inicio),
          texto: s.texto,
        }))
        .filter((s) => s.fin - s.inicio >= 0.3);

      const subsMeta: { inicio: number; fin: number }[] = [];
      for (let sIdx = 0; sIdx < Math.min(100, subsTramo.length); sIdx++) {
        const pngSub = await generarCapaSubtituloBlob(w, h, subsTramo[sIdx].texto);
        if (!pngSub) continue;
        form.append(`sub_${subsMeta.length}`, pngSub, `sub_${subsMeta.length}.png`);
        subsMeta.push({ inicio: subsTramo[sIdx].inicio, fin: subsTramo[sIdx].fin });
      }
      form.append("subsMeta", JSON.stringify(subsMeta));

      const resp = await fetch("/api/render", {
        method: "POST",
        body: form,
      });

      if (!resp.ok) {
        const errJ = await resp.json().catch(() => ({}));
        throw new Error(errJ.error || "No se pudo procesar el clip.");
      }

      const savedPath = resp.headers.get("X-Saved-Path") || "";
      const blob = await resp.blob();
      const urlDescarga = URL.createObjectURL(blob);

      const metaViral = generarTituloYHashtagsDelContenido(
        `${resultadoLink.titulo} ${momento.titulo}`
      );

      const guardado: ClipGuardado = {
        id: `${Date.now()}`,
        titulo: metaViral.titulo,
        hashtags: metaViral.hashtags,
        inicio: formatearTiempo(momento.inicio),
        fin: formatearTiempo(momento.fin),
        formato: formatoAuto,
        url: urlDescarga,
        blob,
        savedPath,
      };

      setClips((prev) => [guardado, ...prev]);
      setClipFinalReciente(guardado);
      setAvisoLink(
        `✅ "${momento.titulo}" cortado en 9:16 con subtítulos reales quemados. Listo para publicar.`
      );
    } catch (e: any) {
      setAvisoLink(e?.message || "No se pudo cortar el clip.");
    } finally {
      setProcesandoMomentoIdx(null);
    }
  };

  const agregarMomentoAPegar = (momento: MomentoDetectado) => {
    if (!resultadoLink) return;
    setCortes((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random()}`,
        etiqueta: `${momento.titulo} (${resultadoLink.titulo.slice(0, 26)})`,
        archivo: resultadoLink.localFile || undefined,
        streamUrl: resultadoLink.streamUrl,
        audioUrl: resultadoLink.audioUrl,
        originalUrl: resultadoLink.originalUrl,
        inicio: momento.inicio,
        fin: momento.fin,
      },
    ]);
    if (!nombreProyecto) setNombreProyecto(resultadoLink.titulo);
    setAvisoLink(`✓ "${momento.titulo}" agregado a la cola (${cortes.length + 1} clips).`);
  };

  // VÍA DESDE EL NAVEGADOR (v6): cuando YouTube bloquea la lectura
  // desde el servidor de Vercel, el video se resuelve desde el navegador
  // del usuario: su IP de casa no está bloqueada y la API de Invidious
  // permite peticiones desde el navegador (CORS). Devuelve el HLS del
  // directo y las URLs directas de audio/video de Google Video, que el
  // servidor sí puede leer (Google Video no hace bot-check). null si
  // ninguna instancia de Invidious responde.
  const resolverYouTubeDesdeNavegador = async (videoId: string) => {
    const instancias = [
      "https://yt.chocolatemoo53.com",
      "https://invidious.privacyredirect.com",
      "https://iv.datura.network",
    ];
    for (const base of instancias) {
      try {
        const ctrl = new AbortController();
        const temporizador = setTimeout(() => ctrl.abort(), 10000);
        const res = await fetch(`${base}/api/v1/videos/${videoId}`, {
          signal: ctrl.signal,
        });
        clearTimeout(temporizador);
        if (!res.ok) continue;
        const d = await res.json();
        if (!d?.title) continue;
        const adaptativos: any[] = Array.isArray(d.adaptiveFormats) ? d.adaptiveFormats : [];
        const audios = adaptativos
          .filter((f) => (f.type || "").startsWith("audio/mp4") && f.url)
          .sort((a, b) => (a.itag === 140 ? 0 : a.itag === 139 ? 1 : 2) - (b.itag === 140 ? 0 : b.itag === 139 ? 1 : 2));
        const videos = adaptativos
          .filter((f) => (f.type || "").startsWith("video/mp4") && f.url && (f.height || 0) > 0 && (f.height || 0) <= 2160)
          .sort((a, b) => (b.height || 0) - (a.height || 0));
        return {
          titulo: String(d.title),
          duracion: Number(d.lengthSeconds || 0),
          isLive: Boolean(d.liveNow),
          hlsUrl: typeof d.hlsUrl === "string" && d.hlsUrl.startsWith("http") ? d.hlsUrl : null,
          audioUrl: audios[0]?.url || null,
          streamUrl: videos[0]?.url || null,
        };
      } catch {
        continue;
      }
    }
    return null;
  };

  const sacarMejoresMomentosDeEnlace = async () => {
    if (!urlInput.trim()) {
      setAvisoLink("Pega primero el enlace del video o streaming en vivo.");
      return;
    }

    try {
      setAnalizandoLink(true);
      setAvisoLink("⚡ Analizando el video para sacar SOLO los mejores momentos (audio, conversación y movimiento)...");
      setResultadoLink(null);
      setLiveServerLista([]);
      setLiveServerClipsCount(0);
      setClipsLiveGuardadosDisco(0);
      setCortes([]);
      setCorteActivoPreviewIdx(null);
      setPreviewStartSec(0);

      // ENLACE HLS DIRECTO (.m3u8): no pasa por /api/extract, porque
      // YouTube a veces bloquea la lectura desde Vercel (BOT_CHECK) y el
      // extracto fingiría un video grabado sin momentos. Con el .m3u8 se
      // va directo al analizador en vivo, que es el que sí lo lee.
      if (urlInput.trim().toLowerCase().includes(".m3u8")) {
        setAvisoLink("⚡ Analizando los últimos minutos del directo (enlace HLS directo) para sacar SOLO los mejores momentos...");
        try {
          const resHls = await fetch("/api/momentos-en-vivo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: urlInput.trim(),
              streamUrl: urlInput.trim(),
              duracionClip: Math.min(300, Math.max(3, duracionClipAuto)),
              cantidadClips: esIlimitado ? "ilimitado" : Math.max(1, cantidadClipsNum),
            }),
          });
          const dHls = await resHls.json().catch(() => null);
          if (dHls?.ok) {
            const momentosHls: MomentoDetectado[] = Array.isArray(dHls.momentos) ? dHls.momentos : [];
            setResultadoLink({
              plataforma: dHls.plataforma || "Streaming",
              esEnVivo: true,
              ytId: null,
              twitchChannel: null,
              kickChannel: null,
              titulo: "Directo en vivo (HLS)",
              thumbnail: "",
              streamUrl: urlInput.trim(),
              audioUrl: null,
              originalUrl: urlInput.trim(),
              localFile: null,
              momentos: momentosHls,
              subtitulos: [],
              tramosIgnorados: dHls.tramosIgnorados || 0,
              analisisNota: dHls.mensaje,
              ventanaId: dHls.ventanaId || null,
              ventanaEnVivoSegundos: dHls.ventanaSegundos || 0,
            });
            if (momentosHls[0]) {
              setPreviewStartSec(momentosHls[0].inicio);
              setCorteActivoPreviewIdx(0);
            }
            setAvisoLink(
              dHls.mensaje ||
                (momentosHls.length === 0
                  ? "En los últimos minutos del directo no hubo ningún tramo con actividad suficiente. Vuelve a intentarlo en unos minutos."
                  : "")
            );
          } else {
            setAvisoLink(
              dHls?.error || "No se pudo analizar este enlace HLS. Prueba con otro enlace o usa el contenedor local."
            );
          }
        } catch {
          setAvisoLink("No se pudo analizar este enlace HLS ahora. Prueba de nuevo en unos segundos.");
        } finally {
          setAnalizandoLink(false);
        }
        return;
      }

      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: urlInput.trim(),
          duracionClip: Math.min(300, Math.max(3, duracionClipAuto)),
          cantidadClips: esIlimitado ? "ilimitado" : Math.max(1, cantidadClipsNum),
        }),
      });

      let data = await res.json();
      if (!res.ok || !data.ok) {
        setAvisoLink(data.error || "No se pudo analizar este enlace.");
        return;
      }

      // VÍA DESDE EL NAVEGADOR (v6): si el servidor no pudo leer el
      // enlace de YouTube (YouTube bloqueó la lectura desde Vercel con
      // su verificación anti-bot) o no sacó ni duración ni URLs, NO se
      // muestra el error sin más: se resuelve el video desde el
      // navegador del usuario y se reintenta con esas URLs directas.
      const servidorNoPudoLeerYouTube =
        Boolean(data.bloqueadoPorYouTube) ||
        (String(data.plataforma || "").includes("YouTube") &&
          Number(data.duracionTotal || 0) <= 0 &&
          !data.streamUrl &&
          !data.audioUrl);
      if (servidorNoPudoLeerYouTube) {
        const idVideo =
          data.ytId ||
          (urlInput.trim().match(/(?:watch\?v=|live\/|shorts\/|embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/) || [])[1] ||
          null;
        setAvisoLink(
          "YouTube bloqueó la lectura desde el servidor de Vercel (verificación anti-bot). Probando otra vía desde tu navegador…"
        );
        const resuelto = idVideo ? await resolverYouTubeDesdeNavegador(idVideo) : null;
        if (!resuelto) {
          setAvisoLink(
            "YouTube bloqueó la lectura de este enlace desde el servidor de Vercel (verificación anti-bot) y tampoco se pudo resolver desde tu navegador. Prueba con otro enlace, pega la URL HLS (.m3u8) del directo si la tienes, o usa el contenedor local (tu PC), donde yt-dlp sí lo lee."
          );
          return;
        }
        if (resuelto.isLive && resuelto.hlsUrl) {
          // Directo: el HLS que resolvió el navegador lo analiza el
          // servidor (Google Video no hace bot-check). Sigue el flujo
          // normal de en vivo de abajo.
          data = {
            ...data,
            esEnVivo: true,
            titulo: resuelto.titulo,
            streamUrl: resuelto.hlsUrl,
            audioUrl: resuelto.audioUrl,
            analisisNota: undefined,
          };
        } else if (resuelto.audioUrl || resuelto.streamUrl) {
          // Grabado: reintentar el extracto pasando las URLs directas
          // que resolvió el navegador.
          setAvisoLink("⚡ Se resolvió el video desde tu navegador. Analizando los mejores momentos…");
          const res2 = await fetch("/api/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: urlInput.trim(),
              duracionClip: Math.min(300, Math.max(3, duracionClipAuto)),
              cantidadClips: esIlimitado ? "ilimitado" : Math.max(1, cantidadClipsNum),
              streamUrlDirecto: resuelto.streamUrl,
              audioUrlDirecto: resuelto.audioUrl,
              duracionTotalDirecta: resuelto.duracion,
            }),
          });
          const data2 = await res2.json().catch(() => null);
          if (!data2?.ok) {
            setAvisoLink(
              "YouTube bloqueó la lectura de este enlace desde el servidor de Vercel (verificación anti-bot). Se resolvió desde tu navegador, pero el análisis tampoco pudo arrancar. Prueba con otro enlace o usa el contenedor local (tu PC)."
            );
            return;
          }
          data = data2;
        } else {
          setAvisoLink(
            "YouTube bloqueó la lectura de este enlace desde el servidor de Vercel (verificación anti-bot) y la vía del navegador tampoco entregó URLs para analizar. Prueba con otro enlace, pega la URL HLS (.m3u8) del directo si la tienes, o usa el contenedor local (tu PC)."
          );
          return;
        }
      }

      const subsDetectados: LineaSubtitulo[] = Array.isArray(data.subtitulos)
        ? data.subtitulos
        : [];
      if (subsDetectados.length > 0) {
        setSubtitulos(subsDetectados);
      }

      setResultadoLink({
        plataforma: data.plataforma,
        esEnVivo: Boolean(data.esEnVivo),
        ytId: data.ytId || null,
        twitchChannel: data.twitchChannel || null,
        kickChannel: data.kickChannel || null,
        titulo: data.titulo,
        thumbnail: data.thumbnail,
        streamUrl: data.streamUrl,
        audioUrl: data.audioUrl || null,
        originalUrl: data.originalUrl || urlInput.trim(),
        localFile: null,
        momentos: data.momentos || [],
        subtitulos: subsDetectados,
        tramosIgnorados: data.tramosIgnorados || 0,
        analisisNota: data.analisisNota,
      });

      if (data.esEnVivo) {
        // EN VIVO: primero arranca el auto-corte (sigue grabando y cada
        // clip ya sale puntuado por el servidor) y DESPUÉS se analizan
        // los últimos minutos del directo con el mismo puntuador. Un vivo
        // no tiene duración, así que NUNCA se dice "no tiene tramos con
        // actividad" solo porque no hay video grabado: si acaba de
        // empezar, se dice claro que todavía no hay audio suficiente.
        const autoCorte = await iniciarAutoClipeoServidorEnVivo(
          data.originalUrl || urlInput.trim(),
          data.streamUrl || null
        );
        setAvisoLink("⚡ Analizando los últimos minutos del directo para sacar SOLO los mejores momentos...");
        try {
          const resVivo = await fetch("/api/momentos-en-vivo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: data.originalUrl || urlInput.trim(),
              streamUrl: data.streamUrl || null,
              duracionClip: Math.min(300, Math.max(3, duracionClipAuto)),
              cantidadClips: esIlimitado ? "ilimitado" : Math.max(1, cantidadClipsNum),
            }),
          });
          const dVivo = await resVivo.json().catch(() => null);
          if (dVivo?.ok) {
            const momentosVivo: MomentoDetectado[] = Array.isArray(dVivo.momentos)
              ? dVivo.momentos
              : [];
            setResultadoLink((prev) =>
              prev
                ? {
                    ...prev,
                    momentos: momentosVivo,
                    tramosIgnorados: dVivo.tramosIgnorados || 0,
                    analisisNota: dVivo.mensaje,
                    ventanaId: dVivo.ventanaId || null,
                    ventanaEnVivoSegundos: dVivo.ventanaSegundos || 0,
                  }
                : prev
            );
            if (momentosVivo[0]) {
              setPreviewStartSec(momentosVivo[0].inicio);
              setCorteActivoPreviewIdx(0);
            }
            setAvisoLink(
              dVivo.mensaje ||
                (momentosVivo.length === 0
                  ? "En los últimos minutos del directo no hubo ningún tramo con actividad suficiente. El auto-corte sigue grabando; vuelve a intentarlo en unos minutos."
                  : "")
            );
          } else {
            // V7: si el auto-corte falló en el servidor, ese es el error
            // real y se muestra él, no el mensaje genérico.
            setAvisoLink(
              (!autoCorte.ok && autoCorte.error) ||
                dVivo?.error ||
                "No se pudo analizar este directo en vivo ahora. El auto-corte sigue grabando; puntúa los clips con 'Ordenar por mejores momentos'."
            );
          }
        } catch {
          setAvisoLink(
            (!autoCorte.ok && autoCorte.error) ||
              "No se pudo analizar este directo en vivo ahora. El auto-corte sigue grabando; puntúa los clips con 'Ordenar por mejores momentos'."
          );
        }
      } else {
        if (data.momentos?.[0]) {
          setPreviewStartSec(data.momentos[0].inicio);
          setCorteActivoPreviewIdx(0);
        }
        // El mensaje genérico "no tiene tramos" SOLO cuando de verdad se
        // analizó el video y no pasó nada el umbral. Si YouTube bloqueó
        // la lectura (bloqueadoPorYouTube) o ni siquiera se pudo leer el
        // enlace, se muestra el motivo real (data.analisisNota), nunca el
        // genérico: antes ese mensaje salía aunque nada se hubiera
        // analizado, y eso era lo que confundía.
        setAvisoLink(
          data.analisisNota ||
            (data.analisisHecho && data.momentos?.length === 0
              ? "Este video no tiene tramos con actividad suficiente para sacar mejores momentos."
              : data.momentos?.length === 0
                ? "No se pudo analizar este enlace desde el servidor. Prueba con otro enlace o usa el contenedor local."
                : "")
        );
      }
    } catch {
      setAvisoLink("Error de conexión al analizar el enlace.");
    } finally {
      setAnalizandoLink(false);
    }
  };

  // Corta un momento EN VIVO con LA REFERENCIA: 4K 60fps, fondo
  // difuminado 9:16, desde la ventana guardada por /api/momentos-en-vivo.
  // Los tiempos del momento son relativos a esa ventana, no al inicio del
  // directo, por eso NO se usa el corte de video grabado (proxy/render).
  const cortarMomentoEnVivo = async (momento: MomentoDetectado, idx: number) => {
    const ventanaId = resultadoLink?.ventanaId;
    if (!ventanaId) {
      setAvisoLink("Esa ventana en vivo ya no está guardada. Usa los clips del auto-corte de abajo.");
      return;
    }
    setProcesandoMomentoIdx(idx);
    setAvisoLink(`⚡ Cortando "${momento.titulo}" en 9:16 4K 60fps...`);
    try {
      const res = await fetch("/api/cortar-momento-en-vivo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ventanaId,
          inicio: momento.inicio,
          fin: momento.fin,
          encuadre,
          marca: marcaAuto,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setAvisoLink(
          data?.error ||
            "No se pudo cortar ese momento en vivo. Usa los clips del auto-corte de abajo."
        );
        return;
      }
      setAvisoLink(
        `✅ "${momento.titulo}" cortado en 9:16 4K 60fps (${data.nombreArchivo}). Está en la biblioteca / exportados, listo para publicar.`
      );
    } catch {
      setAvisoLink("Error de conexión al cortar ese momento en vivo.");
    } finally {
      setProcesandoMomentoIdx(null);
    }
  };

  // MEJORES MOMENTOS DE VERDAD en el navegador: se decodifica el audio y se
  // mide el RMS real por segundo. Las ventanas con silencio o sin actividad
  // se ignoran (umbral 55). Antes esto cortaba trozos parejos con puntajes
  // falsos 98, 97, 96. Si el navegador no puede leer el audio, el servidor
  // lo analiza con ffmpeg (/api/momentos-archivo).
  const detectarMomentosEnArchivo = async (file: File, etiquetaOrigen: string) => {
    setAnalizandoLink(true);
    setAvisoLink("Analizando el audio para encontrar los mejores momentos...");
    const segClip = Math.min(300, Math.max(3, duracionClipAuto));
    let momentos: MomentoDetectado[] = [];
    let tramosIgnorados = 0;
    let analisisNota: string | undefined;

    try {
      const buf = await file.arrayBuffer();
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      const audio = await ctx.decodeAudioData(buf);
      const durTotal = Math.max(3, Math.floor(audio.duration));
      const canal = audio.getChannelData(0);
      const porSegundo = audio.sampleRate;
      const energiaPorSegundo: number[] = [];
      for (let s = 0; s < durTotal; s++) {
        const ini = s * porSegundo;
        const fin = Math.min(canal.length, (s + 1) * porSegundo);
        let suma = 0;
        let n = 0;
        for (let i = ini; i < fin; i += 4) {
          suma += canal[i] * canal[i];
          n++;
        }
        const rms = n > 0 ? Math.sqrt(suma / n) : 0;
        energiaPorSegundo.push(rms <= 0.0001 ? -60 : 20 * Math.log10(rms));
      }
      await ctx.close();

      const res = puntuarVentanas({
        energiaPorSegundo,
        duracionTotal: durTotal,
        durClip: segClip,
        cantidad: esIlimitado ? "ilimitado" : Math.max(1, cantidadClipsNum),
      });
      momentos = res.momentos;
      tramosIgnorados = res.tramosIgnorados;
    } catch {
      // Respaldo en el servidor (ffmpeg): mismo analizador, mismo umbral.
      try {
        const form = new FormData();
        form.append("video", file);
        form.append("duracionClip", String(segClip));
        form.append("cantidadClips", esIlimitado ? "ilimitado" : String(cantidadClipsNum));
        const res = await fetch("/api/momentos-archivo", { method: "POST", body: form });
        const data = await res.json();
        if (res.ok && data.ok) {
          momentos = data.momentos || [];
          tramosIgnorados = data.tramosIgnorados || 0;
          analisisNota = data.analisisNota;
        } else {
          analisisNota = "No se pudo leer el audio de este archivo.";
        }
      } catch {
        analisisNota = "No se pudo leer el audio de este archivo.";
      }
    }

    const localObjectUrl = URL.createObjectURL(file);

    setResultadoLink({
      plataforma: etiquetaOrigen,
      esEnVivo: false,
      titulo: file.name,
      thumbnail: "",
      streamUrl: localObjectUrl,
      localFile: file,
      momentos,
      tramosIgnorados,
      analisisNota,
    });
    setPreviewStartSec(momentos[0]?.inicio || 0);
    setCorteActivoPreviewIdx(0);
    setAvisoLink(
      analisisNota ||
        (momentos.length === 0
          ? "Este video no tiene tramos con actividad suficiente para sacar mejores momentos."
          : "")
    );
    setAnalizandoLink(false);
  };

  const iniciarCapturaLive = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: true,
      });

      setResultadoLink(null);
      setLiveServerLista([]);
      setLiveServerClipsCount(0);
      liveStreamRef.current = stream;
      chunksRef.current = [];
      contadorAutoBrowserRef.current = 0;
      setClipsLiveGuardadosDisco(0);

      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
        ? "video/webm;codecs=vp8,opus"
        : "video/webm";
      const recorder = new MediaRecorder(stream, { mimeType: mime });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        liveStreamRef.current = null;
        setGrabandoLive(false);

        if (chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: "video/webm" });
          const file = new File([blob], `directo-en-vivo-${Date.now()}.webm`, {
            type: "video/webm",
          });
          await detectarMomentosEnArchivo(file, "Directo En Vivo");
        }
      };

      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (recorder.state !== "inactive") recorder.stop();
      });

      recorderRef.current = recorder;
      recorder.start(1000);
      setGrabandoLive(true);

      setTimeout(() => {
        if (liveVideoRef.current && liveStreamRef.current) {
          liveVideoRef.current.srcObject = liveStreamRef.current;
          liveVideoRef.current.play().catch(() => {});
        }
      }, 100);

      setAvisoLink(
        autoCorteEnVivoActivo
          ? `🔴 Viendo directo en pantalla y auto-cortando cada ${duracionClipAuto}s (${
              esIlimitado ? "∞ Ilimitado sin parar" : `meta: ${cantidadClipsNum} clips`
            })...`
          : "🔴 Viendo directo en pantalla. Pulsa '✂ Clipear Ahora' cuando pase un buen momento."
      );
    } catch {
      setAvisoLink("Captura cancelada. Elige la pestaña o ventana del directo con audio.");
    }
  };

  const clipearMomentoEnVivoAhora = () => {
    if (!grabandoLive || chunksRef.current.length === 0) return;
    const blobParcial = new Blob([...chunksRef.current], { type: "video/webm" });
    const fileParcial = new File([blobParcial], `clip-en-vivo-${Date.now()}.webm`, {
      type: "video/webm",
    });
    const fin = Math.max(3, segundosLiveGrabados % duracionClipAuto || duracionClipAuto);
    const ini = Math.max(0, fin - duracionClipAuto);

    setCortes((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random()}`,
        etiqueta: `Clip En Vivo #${prev.length + 1}`,
        archivo: fileParcial,
        inicio: ini,
        fin,
      },
    ]);
    if (!nombreProyecto) setNombreProyecto("Directo En Vivo Viral");
    setAvisoLink(`✂ ¡Clip en vivo capturado (${cortes.length + 1} en cola para pegar)!`);
  };

  const detenerCapturaLive = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    } else {
      setGrabandoLive(false);
    }
  };

  const cargarVideoEnEditor = (file: File) => {
    if (videoSrc) URL.revokeObjectURL(videoSrc);
    setVideoFile(file);
    setVideoSrc(URL.createObjectURL(file));
    if (!nombreProyecto) setNombreProyecto(file.name);
    setInicioTxt("00:00");
    setFinTxt(formatearTiempo(duracionClipAuto));
    setMensaje("");
    irA("editor");
  };

  const cargarClipLiveEnEditor = async (
    nombreArchivo: string,
    durSeg: number,
    soloAgregarCola = false
  ) => {
    try {
      setCargandoClipLiveArchivo(nombreArchivo);
      const resp = await fetch(`/api/live-auto?file=${encodeURIComponent(nombreArchivo)}`);
      if (!resp.ok) {
        setAvisoLink("No se pudo abrir ese archivo.");
        return;
      }
      const blob = await resp.blob();
      const file = new File([blob], nombreArchivo, { type: "video/mp4" });

      if (soloAgregarCola) {
        setCortes((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${Math.random()}`,
            etiqueta: nombreArchivo,
            archivo: file,
            inicio: 0,
            fin: Math.max(3, durSeg || duracionClipAuto),
          },
        ]);
        if (!nombreProyecto) setNombreProyecto(resultadoLink?.titulo || "Directo En Vivo Viral");
        setAvisoLink(`✓ "${nombreArchivo}" agregado a la cola del Editor (${cortes.length + 1} clips).`);
      } else {
        setCortes([
          {
            id: `${Date.now()}-${Math.random()}`,
            etiqueta: nombreArchivo,
            archivo: file,
            inicio: 0,
            fin: Math.max(3, durSeg || duracionClipAuto),
          },
        ]);
        cargarVideoEnEditor(file);
      }
    } catch {
      setAvisoLink("Error cargando el clip al editor.");
    } finally {
      setCargandoClipLiveArchivo(null);
    }
  };

  const llevarTodosClipsLiveAlEditor = async () => {
    if (liveServerLista.length === 0) return;
    try {
      setCargandoClipLiveArchivo("TODOS");
      setAvisoLink(`⏳ Llevando ${liveServerLista.length} clips en vivo hacia el Editor 9:16...`);
      const nuevosSegmentos: SegmentoCorte[] = [];
      let primerFile: File | null = null;

      const ordenados = [...liveServerLista].reverse();
      for (const item of ordenados) {
        const resp = await fetch(`/api/live-auto?file=${encodeURIComponent(item.archivo)}`);
        if (!resp.ok) continue;
        const blob = await resp.blob();
        const file = new File([blob], item.archivo, { type: "video/mp4" });
        if (!primerFile) primerFile = file;
        nuevosSegmentos.push({
          id: `${Date.now()}-${Math.random()}`,
          etiqueta: `Clip En Vivo #${item.numero} (${item.archivo})`,
          archivo: file,
          inicio: 0,
          fin: Math.max(3, item.duracion || duracionClipAuto),
        });
      }

      if (nuevosSegmentos.length > 0) {
        setCortes(nuevosSegmentos);
        if (primerFile) {
          if (videoSrc) URL.revokeObjectURL(videoSrc);
          setVideoFile(primerFile);
          setVideoSrc(URL.createObjectURL(primerFile));
        }
        setNombreProyecto(resultadoLink?.titulo || "Directo En Vivo Viral");
        setAvisoLink("");
        irA("editor");
      }
    } catch {
      setAvisoLink("No se pudieron cargar todos los clips al editor.");
    } finally {
      setCargandoClipLiveArchivo(null);
    }
  };

  // EN VIVO: el auto-corte no puede saber el futuro, así que corta continuo
  // y LUEGO se puntúa cada clip guardado con su audio real (RMS). Los
  // mejores quedan primero y el filtro "solo mejores" esconde los aburridos.
  const ordenarClipsLivePorMejores = async () => {
    if (liveServerLista.length === 0 || ordenandoLive) return;
    setOrdenandoLive(true);
    setAvisoLink("⚡ Puntuando los clips en vivo por su audio real...");
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      const puntuados: ClipLiveCreado[] = [];
      for (const item of liveServerLista) {
        try {
          const resp = await fetch(`/api/live-auto?file=${encodeURIComponent(item.archivo)}`);
          if (!resp.ok) {
            puntuados.push(item);
            continue;
          }
          const buf = await (await resp.blob()).arrayBuffer();
          const audio = await ctx.decodeAudioData(buf);
          const canal = audio.getChannelData(0);
          let suma = 0;
          let n = 0;
          for (let i = 0; i < canal.length; i += 4) {
            suma += canal[i] * canal[i];
            n++;
          }
          const rmsDb = n > 0 ? 20 * Math.log10(Math.sqrt(suma / n) || 0.0001) : -60;
          const energia = Math.max(0, Math.min(1, (rmsDb + 50) / 40));
          const puntaje = Math.round(100 * energia);
          puntuados.push({
            ...item,
            puntaje,
            motivo: puntaje >= 70 ? "🔊 Pico de audio" : puntaje >= 55 ? "🔊 Audio activo" : "🔇 Casi sin audio",
          });
        } catch {
          puntuados.push(item);
        }
      }
      await ctx.close();
      puntuados.sort((a, b) => (b.puntaje ?? 0) - (a.puntaje ?? 0));
      setLiveServerLista(puntuados);
      setSoloMejoresLive(true);
      const mejores = puntuados.filter((p) => (p.puntaje ?? 0) >= 55).length;
      setAvisoLink(
        `⚡ ${mejores} de ${puntuados.length} clips en vivo son mejores momentos. Los aburridos están escondidos (quita el filtro para verlos).`
      );
    } finally {
      setOrdenandoLive(false);
    }
  };

  const manejarSubidaVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    if (seccion === "videos" || seccion === "directos") {
      await detectarMomentosEnArchivo(file, "Video Local");
    } else {
      cargarVideoEnEditor(file);
    }
  };

  const generarSubtitulosAutomaticos = async () => {
    const archivoBase = videoFile || cortes.find((c) => c.archivo)?.archivo;
    const enlaceBase = cortes.find((c) => c.originalUrl)?.originalUrl || resultadoLink?.originalUrl;

    if (!archivoBase && !enlaceBase) {
      setEstadoSubs("Primero sube un video o carga un clip.");
      return;
    }

    try {
      setGenerandoSubs(true);
      setEstadoSubs("🎙️ Transcribiendo voz real del video en tu PC...");

      const form = new FormData();
      if (archivoBase) {
        form.append("video", archivoBase);
        form.append("inicio", String(inicioSeg));
        form.append("duracion", String(Math.max(10, duracionClip || 60)));
      } else if (enlaceBase) {
        const primerCorte = cortes[0];
        form.append("originalUrl", enlaceBase);
        form.append("inicio", String(primerCorte?.inicio || 0));
        form.append(
          "duracion",
          String(primerCorte ? Math.max(5, primerCorte.fin - primerCorte.inicio) : duracionClipAuto)
        );
      }

      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setEstadoSubs(`⚠️ ${data.error || "No se pudo transcribir el audio."}`);
        return;
      }

      if (Array.isArray(data.subtitulos) && data.subtitulos.length > 0) {
        setSubtitulos(data.subtitulos);
        setEstadoSubs(`✅ ¡${data.subtitulos.length} líneas transcritas con éxito!`);
      } else {
        setEstadoSubs(data.aviso || "No se detectó voz hablada en este tramo.");
      }
    } catch {
      setEstadoSubs("Error de conexión al transcribir el audio.");
    } finally {
      setGenerandoSubs(false);
    }
  };

  const agregarCorteManual = () => {
    if (!videoFile) return setMensaje("Carga primero un video.");
    if (duracionClip < 1) return setMensaje("El tiempo de Fin debe ser mayor al Inicio.");

    setCortes((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random()}`,
        etiqueta: `${videoFile.name.slice(0, 22)} (${formatearTiempo(inicioSeg)}→${formatearTiempo(
          finSeg
        )})`,
        archivo: videoFile,
        inicio: inicioSeg,
        fin: finSeg,
      },
    ]);
    setMensaje(`Corte agregado (${cortes.length + 1} en lista para pegar).`);
  };

  const moverCorte = (idx: number, dir: -1 | 1) => {
    const dest = idx + dir;
    if (dest < 0 || dest >= cortes.length) return;
    const copia = [...cortes];
    const [item] = copia.splice(idx, 1);
    copia.splice(dest, 0, item);
    setCortes(copia);
  };

  const manejarSubidaLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setLogoMarcaDataUrl(String(reader.result));
    reader.readAsDataURL(f);
    e.target.value = "";
  };

  const manejarSubidaSticker = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      setStickers((prev) => [
        ...prev,
        {
          id: `${Date.now()}`,
          tipo: "imagen",
          contenido: String(reader.result),
          x: 50,
          y: 35,
          tamano: 64,
        },
      ]);
    };
    reader.readAsDataURL(f);
    e.target.value = "";
  };

  const agregarEmoji = (emoji: string) => {
    setStickers((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random()}`,
        tipo: "emoji",
        contenido: emoji,
        x: 50,
        y: 35,
        tamano: 48,
      },
    ]);
  };

  const pegarYExportarVideoFinal = async () => {
    const listaFinal: SegmentoCorte[] =
      cortes.length > 0
        ? cortes
        : videoFile && duracionClip >= 1
        ? [
            {
              id: "unico",
              etiqueta: videoFile.name,
              archivo: videoFile,
              inicio: inicioSeg,
              fin: finSeg,
            },
          ]
        : [];

    if (listaFinal.length === 0) {
      setMensaje("Agrega al menos un corte o selecciona un video.");
      return;
    }

    try {
      setProcesando(true);
      setMensaje("");

      let subsParaUsar = subtitulos;
      if (subsParaUsar.length === 0) {
        setProgresoPaso("🎙️ Transcribiendo voz real del video antes de quemar subtítulos...");
        try {
          const formTr = new FormData();
          const seg0 = listaFinal[0];
          if (seg0.archivo) {
            formTr.append("video", seg0.archivo);
            formTr.append("inicio", String(seg0.inicio));
            formTr.append("duracion", String(Math.max(5, seg0.fin - seg0.inicio)));
          } else if (seg0.originalUrl) {
            formTr.append("originalUrl", seg0.originalUrl);
            formTr.append("inicio", String(seg0.inicio));
            formTr.append("duracion", String(Math.max(5, seg0.fin - seg0.inicio)));
          }
          const trRes = await fetch("/api/transcribe", { method: "POST", body: formTr });
          const trData = await trRes.json();
          if (trData.ok && Array.isArray(trData.subtitulos) && trData.subtitulos.length > 0) {
            subsParaUsar = trData.subtitulos.map((s: LineaSubtitulo) => ({
              ...s,
              inicio: s.inicio + seg0.inicio,
              fin: s.fin + seg0.inicio,
            }));
            setSubtitulos(subsParaUsar);
          }
        } catch {
          // Continuar
        }
      }

      setProgresoPaso(`⚡ Cortando y uniendo ${listaFinal.length} clips en 9:16 con subtítulos...`);

      const [w, h] = DIMENSIONES[aspecto][calidad];
      const form = new FormData();

      const mapaArchivos = new Map<File, string>();
      const segmentosSerializados = listaFinal.map((seg) => {
        if (seg.archivo) {
          let fileKey = mapaArchivos.get(seg.archivo);
          if (!fileKey) {
            fileKey = `file_${mapaArchivos.size}`;
            mapaArchivos.set(seg.archivo, fileKey);
            form.append(fileKey, seg.archivo);
          }
          return {
            tipo: "archivo",
            fileKey,
            inicio: seg.inicio,
            fin: seg.fin,
          };
        }
        return {
          tipo: "url",
          originalUrl: seg.originalUrl,
          streamUrl: seg.streamUrl,
          audioUrl: seg.audioUrl,
          inicio: seg.inicio,
          fin: seg.fin,
        };
      });

      form.append("segmentos", JSON.stringify(segmentosSerializados));
      form.append("aspecto", aspecto);
      form.append("calidad", calidad);
      form.append("encuadre", encuadre);
      form.append("velocidad", String(velocidad));
      form.append("efecto", efecto);
      form.append("audioGain", String(audioGain));

      const textoTituloBase =
        nombreProyecto || listaFinal[0]?.etiqueta || "MOMENTO EPICO CAPTADO EN VIVO";
      form.append("tituloSubAuto", textoTituloBase);

      const overlayBase = await generarCapaBaseBlob(w, h, textoMarcaAgua, true);
      if (overlayBase) {
        form.append("overlayBase", overlayBase, "overlay_base.png");
      }

      const subsSecuencia: { inicio: number; fin: number; texto: string }[] = [];
      if (subsParaUsar.length > 0) {
        let offsetAcumulado = 0;
        for (const seg of listaFinal) {
          const durSeg = Math.max(1, seg.fin - seg.inicio);
          const delTramo = subsParaUsar.filter(
            (s) => s.fin >= seg.inicio && s.inicio <= seg.fin
          );
          for (const s of delTramo) {
            const relIni = Math.max(0, s.inicio - seg.inicio) + offsetAcumulado;
            const relFin = Math.min(durSeg, s.fin - seg.inicio) + offsetAcumulado;
            if (relFin - relIni >= 0.3) {
              subsSecuencia.push({ inicio: relIni, fin: relFin, texto: s.texto });
            }
          }
          offsetAcumulado += durSeg;
        }
      }

      const subsMeta: { inicio: number; fin: number }[] = [];
      for (let sIdx = 0; sIdx < Math.min(100, subsSecuencia.length); sIdx++) {
        const sub = subsSecuencia[sIdx];
        const pngSub = await generarCapaSubtituloBlob(w, h, sub.texto);
        if (!pngSub) continue;
        form.append(`sub_${subsMeta.length}`, pngSub, `sub_${subsMeta.length}.png`);
        subsMeta.push({ inicio: sub.inicio, fin: sub.fin });
      }
      form.append("subsMeta", JSON.stringify(subsMeta));

      const resp = await fetch("/api/render", {
        method: "POST",
        body: form,
      });

      if (!resp.ok) {
        const errJ = await resp.json().catch(() => ({}));
        throw new Error(errJ.error || "Error al renderizar.");
      }

      const savedPath = resp.headers.get("X-Saved-Path") || "";
      const blobFinal = await resp.blob();
      const urlFinal = URL.createObjectURL(blobFinal);

      if (videoSrc) URL.revokeObjectURL(videoSrc);
      setVideoSrc(urlFinal);
      setVideoFile(new File([blobFinal], "short-viral-9-16.mp4", { type: "video/mp4" }));

      const metaViral = generarTituloYHashtagsDelContenido(
        [textoTituloBase, ...subsParaUsar.slice(0, 4).map((s) => s.texto)].join(" ")
      );
      const totalSeg = listaFinal.reduce((acc, s) => acc + Math.max(1, s.fin - s.inicio), 0);

      const videoGuardado: ClipGuardado = {
        id: `${Date.now()}`,
        titulo: metaViral.titulo,
        hashtags: metaViral.hashtags,
        inicio: "00:00",
        fin: formatearTiempo(totalSeg),
        formato: aspecto,
        url: urlFinal,
        blob: blobFinal,
        savedPath,
      };

      setClips((prev) => [videoGuardado, ...prev]);
      setClipFinalReciente(videoGuardado);
      setProgresoPaso("");
      setMensaje(
        "✅ ¡Video 9:16 pegado con subtítulos dentro! Ya puedes subirlo directamente abajo."
      );
    } catch (e: any) {
      setProgresoPaso("");
      setMensaje(e?.message || "No se pudo completar el renderizado.");
    } finally {
      setProcesando(false);
    }
  };

  const publicarDirectamenteEnRed = async (
    plataforma: "youtube" | "tiktok" | "facebook",
    clip: ClipGuardado
  ) => {
    try {
      setSubiendoDirecto(plataforma);
      setEstadoPublicacion(
        `🚀 Subiendo el video MP4 + título viral + hashtags a ${plataforma.toUpperCase()}...`
      );

      const form = new FormData();
      form.append("action", "upload_direct");
      form.append("plataforma", plataforma);
      form.append("titulo", clip.titulo);
      form.append("hashtags", clip.hashtags);
      form.append("savedPath", clip.savedPath || "");
      form.append("video", clip.blob, "short-viral.mp4");

      if (plataforma === "youtube") form.append("token", tokens.youtubeToken);
      if (plataforma === "tiktok") form.append("token", tokens.tiktokToken);
      if (plataforma === "facebook") {
        form.append("token", tokens.facebookToken);
        form.append("pageId", tokens.facebookPageId);
      }

      const res = await fetch("/api/publish", {
        method: "POST",
        body: form,
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setEstadoPublicacion(`⚠️ ${data.error || "No se pudo subir por API."}`);
        return;
      }

      setEstadoPublicacion(
        `✅ ${data.message}${data.url ? ` → Enlace: ${data.url}` : ""}`
      );
    } catch {
      setEstadoPublicacion("⚠️ Error de conexión al subir el video.");
    } finally {
      setSubiendoDirecto(null);
    }
  };

  const abrirArchivoSeleccionadoEnCarpeta = async (clip: ClipGuardado) => {
    navigator.clipboard.writeText(`${clip.titulo}\n\n${clip.hashtags}`).catch(() => {});
    const form = new FormData();
    form.append("action", "open_folder");
    form.append("savedPath", clip.savedPath || "");
    await fetch("/api/publish", { method: "POST", body: form }).catch(() => {});
    setEstadoPublicacion(
      "📂 ¡Carpeta abierta con tu video seleccionado y título+hashtags copiados!"
    );
  };

  const compartirArchivoNativo = async (clip: ClipGuardado) => {
    const file = new File([clip.blob], "short-viral-9-16.mp4", { type: "video/mp4" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: clip.titulo,
          text: `${clip.titulo}\n\n${clip.hashtags}`,
        });
        return;
      } catch {
        // Ignorar
      }
    }
    await abrirArchivoSeleccionadoEnCarpeta(clip);
  };

  const navegacion = (
    <nav className="space-y-1">
      {MENU.map((item) => {
        const activo = seccion === item.id;
        return (
          <button
            key={item.id}
            onClick={() => irA(item.id)}
            className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-xs font-bold transition ${
              activo
                ? "border-[#f43f5e]/70 bg-[#241318] text-white"
                : "border-transparent text-[#d8cdd1] hover:bg-[#171013]"
            }`}
          >
            <span className="w-3 text-center text-[10px] text-[#f43f5e]">{item.icono}</span>
            <span className="flex-1">{item.label}</span>
            {item.id === "editor" && cortes.length > 0 && (
              <span className="rounded-full bg-[#f43f5e] px-1.5 py-0.2 text-[10px] text-white">
                {cortes.length}
              </span>
            )}
            {item.id === "biblioteca" && clips.length > 0 && (
              <span className="rounded-full bg-emerald-500 px-1.5 py-0.2 text-[10px] text-black">
                {clips.length}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );

  const duracionTotalCortes = cortes.reduce((acc, c) => acc + Math.max(0, c.fin - c.inicio), 0);
  const progresoSegundoActual =
    duracionClipAuto > 0 ? segundosTranscurridosServidor % duracionClipAuto : 0;

  return (
    <div className="flex min-h-screen bg-[#07050a] text-[#f5f0f2]">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        onChange={manejarSubidaVideo}
        className="hidden"
      />
      <input
        ref={logoInputRef}
        type="file"
        accept="image/*"
        onChange={manejarSubidaLogo}
        className="hidden"
      />
      <input
        ref={stickerInputRef}
        type="file"
        accept="image/*"
        onChange={manejarSubidaSticker}
        className="hidden"
      />

      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col justify-between border-r border-[#21171b] bg-[#0b070a] p-4 lg:flex">
        <div>
          <Link href="/" className="mb-6 flex items-center gap-2 px-1">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#f43f5e] text-[10px] text-white">
              ▶
            </span>
            <span className="text-xs font-black text-white">Clips Limpieza 9:16</span>
          </Link>
          {navegacion}
        </div>
        <div className="space-y-2 border-t border-[#1e1519] px-1 pt-3 text-[11px]">
          <div>
            <div className="text-[#9e9196]">Modo Captura:</div>
            <div className="font-bold text-emerald-400">
              {esIlimitado ? "∞ Ilimitado (Sin límite)" : `1 a 100 (${cantidadClipsNum})`}
            </div>
          </div>
          <div>
            <div className="text-[#9e9196]">Sesión Actual:</div>
            <div className="font-bold text-cyan-400">
              {liveServerLista.length + clips.length} videos MP4
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[#21171b] bg-[#0b070a]/95 px-4 py-3 backdrop-blur lg:hidden">
          <span className="flex items-center gap-2 text-xs font-black text-white">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#f43f5e] text-[10px]">
              ▶
            </span>
            Clips Limpieza 9:16
          </span>
          <button
            onClick={() => setMenuAbierto(!menuAbierto)}
            className="rounded-lg border border-[#2b1e23] px-3 py-1.5 text-xs text-white"
          >
            ☰ Menú
          </button>
        </header>

        {menuAbierto && (
          <div className="border-b border-[#21171b] bg-[#0b070a] p-4 lg:hidden">{navegacion}</div>
        )}

        <main className="flex-1 px-4 py-6 sm:px-8">
          <div className="mx-auto w-full max-w-6xl">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-[#21171b] pb-3 text-xs text-[#9e9196]">
              <div>
                Estudio Personal TikTok &amp; Shorts /{" "}
                <span className="font-bold text-white">
                  {MENU.find((m) => m.id === seccion)?.label}
                </span>
              </div>
              {cortes.length > 0 && seccion !== "editor" && (
                <button onClick={() => irA("editor")} className={BTN_ROSA}>
                  ✂ Ir a Pegar {cortes.length} Clips en 9:16 →
                </button>
              )}
            </div>

            {(seccion === "videos" || seccion === "directos") && (
              <div className="grid gap-5 lg:grid-cols-12">
                <div className={`${CARD} space-y-3 lg:col-span-5`}>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#f43f5e]">
                      ● PANTALLA EN VIVO · CONTENEDOR 9:16
                    </span>
                    <span className="rounded bg-[#241318] px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-400">
                      {grabandoLive
                        ? `REC ${formatearTiempo(segundosLiveGrabados)}`
                        : liveServerActivo
                        ? `EN VIVO · ${liveServerClipsCount} clips`
                        : corteActivoPreviewIdx !== null
                        ? `Corte #${corteActivoPreviewIdx + 1}`
                        : "En espera"}
                    </span>
                  </div>

                  <div className="relative mx-auto aspect-[9/16] w-full max-w-[310px] overflow-hidden rounded-2xl border-2 border-[#f43f5e]/60 bg-black shadow-xl">
                    {grabandoLive ? (
                      <video
                        ref={asignarRefVideoEnVivo}
                        autoPlay
                        muted
                        playsInline
                        className="h-full w-full object-contain"
                      />
                    ) : resultadoLink?.ytId ? (
                      <iframe
                        key={`${resultadoLink.ytId}-${previewStartSec}`}
                        src={`https://www.youtube.com/embed/${resultadoLink.ytId}?autoplay=1&mute=0&playsinline=1&start=${previewStartSec}&rel=0`}
                        title="Streaming YouTube En Vivo"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                        className="h-full w-full border-0"
                      />
                    ) : resultadoLink?.twitchChannel ? (
                      <iframe
                        src={`https://player.twitch.tv/?channel=${resultadoLink.twitchChannel}&parent=${hostActual}&autoplay=true`}
                        title="Twitch Live"
                        allowFullScreen
                        className="h-full w-full border-0"
                      />
                    ) : resultadoLink?.kickChannel ? (
                      <iframe
                        src={`https://player.kick.com/${resultadoLink.kickChannel}?autoplay=true`}
                        title="Kick Live"
                        allowFullScreen
                        className="h-full w-full border-0"
                      />
                    ) : resultadoLink?.streamUrl ? (
                      <video
                        ref={linkVideoRef}
                        controls
                        autoPlay
                        playsInline
                        className={`h-full w-full ${
                          encuadre === "crop" ? "object-cover" : "object-contain"
                        }`}
                      />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center p-5 text-center">
                        <span className="mb-2 text-3xl">📺</span>
                        <p className="text-xs font-bold text-white">
                          Visor de Streaming y Videos En Vivo
                        </p>
                        <p className="mt-1 text-[11px] text-[#9e9196]">
                          Pega un enlace de TikTok Live, YouTube Live, Kick o Twitch y pulsa{" "}
                          <strong className="text-white">&quot;▶ Ver En Vivo y Cortar&quot;</strong>{" "}
                          para verlo aquí en pantalla mientras se corta en tiempo real.
                        </p>
                      </div>
                    )}

                    {procesandoMomentoIdx !== null && (
                      <div className="pointer-events-none absolute inset-x-2 top-2 rounded-lg bg-[#f43f5e] px-3 py-1.5 text-center text-[11px] font-black text-white shadow-lg">
                        ⚡ CORTANDO CLIP #{procesandoMomentoIdx + 1} EN 9:16...
                      </div>
                    )}

                    {(grabandoLive || liveServerActivo) && (
                      <div className="pointer-events-none absolute inset-x-2 bottom-2 rounded-lg bg-black/85 px-3 py-1.5 text-center text-[10px] font-bold text-emerald-400">
                        🔴 Cortando en tiempo real: {progresoSegundoActual}s / {duracionClipAuto}s (
                        {esIlimitado ? "∞ Sin límite" : `${liveServerClipsCount}/${cantidadClipsNum}`})
                      </div>
                    )}
                  </div>

                  {grabandoLive && (
                    <button
                      type="button"
                      onClick={clipearMomentoEnVivoAhora}
                      className={`${BTN_ROSA} w-full py-2.5`}
                    >
                      ✂ Clipear Manualmente Ahora ({duracionClipAuto}s)
                    </button>
                  )}
                </div>

                <div className="space-y-4 lg:col-span-7">
                  <div className={`${CARD} space-y-4`}>
                    <div>
                      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#f43f5e]">
                        ● TIKTOK &amp; SHORTS 9:16 · TIEMPO REAL SIN LÍMITE
                      </p>
                      <h1 className="text-2xl font-black sm:text-3xl">
                        {seccion === "directos"
                          ? "Ver Streaming En Vivo y Cortar Sin Parar"
                          : "Videos con Enlace y Directos"}
                      </h1>
                    </div>

                    <div>
                      <input
                        type="url"
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        placeholder="Pega enlace de TikTok Live, YouTube Live, Kick, Twitch o Facebook..."
                        className={CAMPO}
                      />
                      {detectarPlataforma(urlInput) && (
                        <p className="mt-1 text-xs font-semibold text-[#f43f5e]">
                          Origen detectado: {detectarPlataforma(urlInput)} ✓
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-[#2b1e23] bg-[#0b0709] p-3">
                        <div className="mb-1.5 flex items-center justify-between">
                          <label className="text-[11px] font-bold text-white">
                            Segundos por cada clip:
                          </label>
                          <span className="font-mono text-xs font-bold text-[#f43f5e]">
                            {duracionClipAuto}s
                          </span>
                        </div>
                        <input
                          type="number"
                          min={3}
                          max={300}
                          value={duracionClipAuto}
                          onChange={(e) =>
                            setDuracionClipAuto(
                              Math.min(300, Math.max(3, Number(e.target.value) || 15))
                            )
                          }
                          className={CAMPO}
                        />
                        <div className="mt-2 flex flex-wrap gap-1">
                          {[15, 30, 45, 60, 90].map((seg) => (
                            <button
                              key={seg}
                              type="button"
                              onClick={() => setDuracionClipAuto(seg)}
                              className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                                duracionClipAuto === seg
                                  ? "bg-[#f43f5e] text-white"
                                  : "bg-[#1a1115] text-[#c7bcc0]"
                              }`}
                            >
                              {seg}s
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-xl border border-[#2b1e23] bg-[#0b0709] p-3">
                        <div className="mb-1.5 flex items-center justify-between">
                          <label className="text-[11px] font-bold text-white">
                            Cantidad (1 a 100 → Ilimitado):
                          </label>
                          <span
                            className={`font-mono text-xs font-bold ${
                              esIlimitado ? "text-emerald-400" : "text-[#f43f5e]"
                            }`}
                          >
                            {esIlimitado ? "∞ ILIMITADO" : `${cantidadClipsNum} clips`}
                          </span>
                        </div>

                        <input
                          type="range"
                          min={1}
                          max={100}
                          value={Math.min(100, cantidadClipsNum)}
                          onChange={(e) => setCantidadClipsNum(Number(e.target.value))}
                          className="mb-2 w-full accent-[#f43f5e]"
                        />

                        <div className="flex flex-wrap gap-1">
                          {[5, 15, 30, 50, 80].map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setCantidadClipsNum(n)}
                              className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                                cantidadClipsNum === n
                                  ? "bg-[#f43f5e] text-white"
                                  : "bg-[#1a1115] text-[#c7bcc0]"
                              }`}
                            >
                              {n}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => setCantidadClipsNum(100)}
                            className={`rounded px-2.5 py-0.5 text-[10px] font-bold ${
                              esIlimitado
                                ? "bg-emerald-500 text-black"
                                : "bg-[#1a1115] text-emerald-400"
                            }`}
                          >
                            100 · ∞ Ilimitado
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="mb-1 block text-[11px] text-[#9e9196]">
                          Encuadre Vertical 9:16
                        </label>
                        <select
                          value={encuadre}
                          onChange={(e) => setEncuadre(e.target.value as "crop" | "blur")}
                          className={CAMPO}
                        >
                          <option value="blur">9:16 Stream Completo + Fondo Difuminado</option>
                          <option value="crop">9:16 Pantalla Llena (Zoom Centro)</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] text-[#9e9196]">Marca de Agua</label>
                        <input
                          type="text"
                          value={marcaAuto}
                          onChange={(e) => {
                            setMarcaAuto(e.target.value);
                            setTextoMarcaAgua(e.target.value);
                          }}
                          placeholder="@TuMarca"
                          className={CAMPO}
                        />
                      </div>
                    </div>

                    <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-[#2b1e23] bg-[#0b0709] px-3 py-2 text-xs">
                      <input
                        type="checkbox"
                        checked={autoCorteEnVivoActivo}
                        onChange={(e) => setAutoCorteEnVivoActivo(e.target.checked)}
                        className="accent-[#f43f5e]"
                      />
                      <span>
                        <strong className="text-white">Auto-Cortar Continuo (Modo Dormir):</strong>{" "}
                        <span className="text-[#9e9196]">
                          Va cortando y guardando en disco en tiempo real cada {duracionClipAuto}s sin detenerse ni llenar RAM.
                        </span>
                      </span>
                    </label>

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={sacarMejoresMomentosDeEnlace}
                        disabled={analizandoLink}
                        className={BTN_ROSA}
                      >
                        {analizandoLink
                          ? "Conectando en vivo..."
                          : esIlimitado
                          ? "▶ Ver En Vivo y Cortar ILIMITADO"
                          : `▶ Ver En Vivo y Cortar (${cantidadClipsNum} clips)`}
                      </button>

                      <button
                        type="button"
                        onClick={sacarMejoresMomentosDeEnlace}
                        disabled={analizandoLink}
                        className="rounded-lg bg-amber-400 px-3.5 py-2 text-xs font-black text-black"
                        title="Analiza el video o directo y devuelve SOLO los tramos con actividad (audio, conversación, movimiento). Los aburridos se ignoran."
                      >
                        {analizandoLink ? "⚡ Analizando momentos..." : "⚡ Sacar mejores momentos"}
                      </button>

                      {liveServerActivo && (
                        <button
                          type="button"
                          onClick={detenerAutoClipeoServidorEnVivo}
                          className="rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-black text-black"
                        >
                          ⏹ Detener En Vivo ({liveServerClipsCount} guardados)
                        </button>
                      )}

                      <button
                        onClick={grabandoLive ? detenerCapturaLive : iniciarCapturaLive}
                        className={grabandoLive ? BTN_ROSA : BTN_GRIS}
                      >
                        {grabandoLive
                          ? `⏹ Detener Pantalla (${clipsLiveGuardadosDisco} guardados)`
                          : "🔴 Capturar Pantalla en Vivo"}
                      </button>

                      <button onClick={() => fileInputRef.current?.click()} className={BTN_GRIS}>
                        ↑ Subir Video
                      </button>
                    </div>

                    {avisoLink && <p className="text-xs font-semibold text-amber-400">{avisoLink}</p>}
                  </div>

                  {(resultadoLink?.esEnVivo || liveServerActivo || liveServerLista.length > 0) && (
                    <div className={`${CARD} border-emerald-500/40 space-y-3`}>
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#24181d] pb-2.5">
                        <div className="min-w-0 flex-1">
                          <span className="font-mono text-[10px] font-bold uppercase text-emerald-400">
                            ● DIRECTO EN VIVO · {liveServerLista.length} CLIPS DE ESTA SESIÓN
                          </span>
                          <h3 className="truncate text-sm font-extrabold text-white">
                            {resultadoLink?.titulo || "Clips Captados En Vivo"}
                          </h3>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {liveServerActivo && (
                            <span className="rounded-lg bg-[#0b0709] px-3 py-1 font-mono text-xs font-bold text-emerald-400">
                              Siguiente en {Math.max(1, duracionClipAuto - progresoSegundoActual)}s
                            </span>
                          )}

                          {liveServerLista.length > 0 && (
                            <button
                              type="button"
                              disabled={ordenandoLive}
                              onClick={ordenarClipsLivePorMejores}
                              className="rounded-lg bg-amber-400 px-3 py-2 text-xs font-black text-black"
                              title="Puntúa cada clip en vivo por su audio real y pone los mejores primero. Los aburridos quedan escondidos."
                            >
                              {ordenandoLive ? "⚡ Puntuando..." : "⚡ Ordenar por mejores momentos"}
                            </button>
                          )}

                          {soloMejoresLive && liveServerLista.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setSoloMejoresLive(false)}
                              className="rounded-lg border border-amber-400/60 bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-300"
                            >
                              ⚡ Solo mejores: SÍ (toca para ver todos)
                            </button>
                          )}

                          {liveServerLista.length > 0 && (
                            <button
                              type="button"
                              onClick={limpiarListaClipsEnVivo}
                              className="rounded-lg border border-red-900/70 bg-red-950/50 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-900/50"
                            >
                              🗑 Limpiar Lista
                            </button>
                          )}

                          {liveServerLista.length > 0 && (
                            <button
                              type="button"
                              disabled={cargandoClipLiveArchivo !== null}
                              onClick={llevarTodosClipsLiveAlEditor}
                              className={BTN_ROSA}
                            >
                              {cargandoClipLiveArchivo === "TODOS"
                                ? "Enviando al editor..."
                                : `✂ Llevar TODOS (${liveServerLista.length}) al Editor 9:16 →`}
                            </button>
                          )}
                        </div>
                      </div>

                      {liveServerLista.length === 0 ? (
                        <div className="rounded-xl border border-[#2b1e23] bg-[#0b0709] p-4 text-center">
                          <p className="text-xs font-bold text-white">
                            {liveServerActivo
                              ? `⏳ Grabando el primer bloque de ${duracionClipAuto} segundos en tiempo real...`
                              : "Aún no hay clips guardados de este directo."}
                          </p>
                          {liveServerActivo && (
                            <p className="mt-1 text-[11px] text-[#9e9196]">
                              Transcurrido: <strong className="text-emerald-400">{progresoSegundoActual}s</strong> de {duracionClipAuto}s. Apenas pasen los {duracionClipAuto}s aparecerá aquí el <strong className="text-white">Clip #1</strong> listo para llevar al Editor.
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                          {liveServerLista
                            .filter((item) => !soloMejoresLive || (item.puntaje ?? 0) >= 55)
                            .map((item) => (
                            <div
                              key={item.archivo}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#2b1e23] bg-[#0b0709] p-2.5"
                            >
                              <div className="min-w-0 flex-1">
                                <span className="text-xs font-extrabold text-emerald-400">
                                  ✓ Clip En Vivo #{item.numero} ({item.duracion}s)
                                  {typeof item.puntaje === "number" && (
                                    <span className="ml-2 rounded-md bg-amber-400/20 px-1.5 py-0.5 font-mono text-[11px] font-black text-amber-300">
                                      ⭐ {item.puntaje}/100 {item.motivo || ""}
                                    </span>
                                  )}
                                </span>
                                <p className="mt-0.5 truncate font-mono text-[11px] text-[#9e9196]">
                                  {item.hora} → {item.archivo}
                                </p>
                              </div>

                              <div className="flex flex-wrap gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => previsualizarClipLiveEnPantalla(item.archivo)}
                                  className={BTN_GRIS}
                                >
                                  👁 Ver
                                </button>
                                <button
                                  type="button"
                                  disabled={cargandoClipLiveArchivo !== null}
                                  onClick={() =>
                                    cargarClipLiveEnEditor(item.archivo, item.duracion, true)
                                  }
                                  className={BTN_GRIS}
                                >
                                  + Cola
                                </button>
                                <button
                                  type="button"
                                  disabled={cargandoClipLiveArchivo !== null}
                                  onClick={() =>
                                    cargarClipLiveEnEditor(item.archivo, item.duracion, false)
                                  }
                                  className={BTN_ROSA}
                                >
                                  {cargandoClipLiveArchivo === item.archivo
                                    ? "Abriendo..."
                                    : "✂ Llevar al Editor →"}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {resultadoLink && resultadoLink.momentos.length > 0 && (
                    <div className={`${CARD} space-y-3`}>
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#24181d] pb-2.5">
                        <div className="min-w-0 flex-1">
                          <span className="font-mono text-[10px] font-bold uppercase text-[#f43f5e]">
                            {resultadoLink.plataforma} · {resultadoLink.momentos.length} mejores momentos
                          </span>
                          <h3 className="truncate text-sm font-extrabold text-white">
                            {resultadoLink.titulo}
                          </h3>
                          {resultadoLink.esEnVivo && (resultadoLink.ventanaEnVivoSegundos ?? 0) > 0 && (
                            <p className="mt-1 text-[11px] font-semibold text-sky-300">
                              📡 En vivo: estos momentos son de los últimos{" "}
                              {resultadoLink.ventanaEnVivoSegundos}s del directo (los tiempos son
                              relativos a esa ventana, no al inicio del directo).
                            </p>
                          )}
                          {(resultadoLink.tramosIgnorados ?? 0) > 0 && (
                            <p className="mt-1 text-[11px] font-semibold text-amber-300">
                              ⚡ Se ignoraron {resultadoLink.tramosIgnorados} tramos sin actividad
                              (silencio o sin conversación) — solo quedaron los mejores momentos.
                            </p>
                          )}
                          {resultadoLink.analisisNota && (
                            <p className="mt-1 text-[11px] text-[#9e9196]">{resultadoLink.analisisNota}</p>
                          )}
                        </div>

                        {!resultadoLink.esEnVivo && (
                        <button
                          type="button"
                          onClick={() => {
                            const nuevos: SegmentoCorte[] = resultadoLink.momentos.map((m) => ({
                              id: `${Date.now()}-${Math.random()}`,
                              etiqueta: `${m.titulo} (${resultadoLink.titulo.slice(0, 26)})`,
                              archivo: resultadoLink.localFile || undefined,
                              streamUrl: resultadoLink.streamUrl,
                              audioUrl: resultadoLink.audioUrl,
                              originalUrl: resultadoLink.originalUrl,
                              inicio: m.inicio,
                              fin: m.fin,
                            }));
                            setCortes(nuevos);
                            setNombreProyecto(resultadoLink.titulo);
                            irA("editor");
                          }}
                          className={BTN_ROSA}
                        >
                          ✂ Pegar TODOS ({resultadoLink.momentos.length}) en 9:16 →
                        </button>
                        )}
                      </div>

                      <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                        {resultadoLink.momentos.map((m, i) => {
                          const viendoEste = corteActivoPreviewIdx === i;
                          return (
                            <div
                              key={i}
                              className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border p-2.5 transition ${
                                viendoEste
                                  ? "border-[#f43f5e] bg-[#221117]"
                                  : "border-[#2b1e23] bg-[#0b0709]"
                              }`}
                            >
                              <div>
                                <span className="text-xs font-extrabold text-white">{m.titulo}</span>
                                <span className="ml-2 rounded-md bg-amber-400/20 px-1.5 py-0.5 font-mono text-[11px] font-black text-amber-300">
                                  ⭐ {m.puntaje}/100
                                </span>
                                {m.motivo && (
                                  <span className="ml-1 text-[11px] font-semibold text-amber-200">
                                    {m.motivo}
                                  </span>
                                )}
                                <p className="mt-0.5 font-mono text-[11px] text-[#9e9196]">
                                  {formatearTiempo(m.inicio)} → {formatearTiempo(m.fin)} (
                                  {m.fin - m.inicio}s)
                                </p>
                              </div>

                              <div className="flex flex-wrap gap-1.5">
                                {resultadoLink.esEnVivo ? (
                                  <button
                                    type="button"
                                    onClick={() => cortarMomentoEnVivo(m, i)}
                                    disabled={procesandoMomentoIdx !== null}
                                    className={BTN_ROSA}
                                  >
                                    {procesandoMomentoIdx === i
                                      ? "Cortando..."
                                      : "⚡ Cortar 9:16 · 4K 60fps"}
                                  </button>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => previsualizarCorteEnPantalla(m, i)}
                                      className={BTN_GRIS}
                                    >
                                      👁 Ver corte
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => agregarMomentoAPegar(m)}
                                      className={BTN_GRIS}
                                    >
                                      + Cola
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => generarClipDeMomento(m, i)}
                                      disabled={procesandoMomentoIdx !== null}
                                      className={BTN_ROSA}
                                    >
                                      {procesandoMomentoIdx === i ? "Cortando..." : "⚡ Cortar 9:16"}
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {seccion === "editor" && (
              <div className="space-y-6">
                <div className="grid gap-5 lg:grid-cols-12">
                  <section className={`${CARD} space-y-3 lg:col-span-5`}>
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-extrabold">Vista Previa 9:16 (TikTok / Shorts)</h2>
                      <button onClick={() => fileInputRef.current?.click()} className={BTN_GRIS}>
                        ↑ Subir Video
                      </button>
                    </div>

                    <div className="relative mx-auto flex aspect-[9/16] w-full max-w-[300px] items-center justify-center overflow-hidden rounded-2xl border-2 border-[#2b1e23] bg-black shadow-2xl">
                      {videoSrc ? (
                        <>
                          {encuadre === "blur" && (
                            <video
                              src={videoSrc}
                              muted
                              playsInline
                              aria-hidden
                              className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-90 blur-2xl"
                            />
                          )}
                          <video
                            ref={videoRef}
                            src={videoSrc}
                            controls
                            playsInline
                            style={{ filter: EFECTOS_VIDEO[efecto]?.css || "none" }}
                            onTimeUpdate={() =>
                              videoRef.current && setTiempoActual(videoRef.current.currentTime)
                            }
                            className={`relative z-10 h-full w-full ${
                              encuadre === "crop" ? "object-cover" : "object-contain"
                            }`}
                          />

                          {logoMarcaDataUrl ? (
                            <img
                              src={logoMarcaDataUrl}
                              alt="Logo"
                              className="pointer-events-none absolute right-3 top-4 h-9 w-auto opacity-90"
                            />
                          ) : (
                            textoMarcaAgua.trim() && (
                              <span
                                style={{ color: marcaColor }}
                                className="pointer-events-none absolute right-3 top-4 rounded bg-black/65 px-2 py-0.5 text-[11px] font-bold"
                              >
                                {textoMarcaAgua}
                              </span>
                            )
                          )}

                          {stickers.map((st) => (
                            <div
                              key={st.id}
                              style={{ left: `${st.x}%`, top: `${st.y}%` }}
                              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 select-none"
                            >
                              {st.tipo === "emoji" ? (
                                <span style={{ fontSize: `${Math.round(st.tamano * 0.6)}px` }}>
                                  {st.contenido}
                                </span>
                              ) : (
                                <img
                                  src={st.contenido}
                                  alt="Sticker"
                                  style={{ width: `${Math.round(st.tamano * 0.65)}px` }}
                                />
                              )}
                            </div>
                          ))}

                          <div
                            className={`pointer-events-none absolute inset-x-3 text-center ${
                              subPos === "arriba"
                                ? "top-12"
                                : subPos === "centro"
                                ? "top-1/2 -translate-y-1/2"
                                : "bottom-14"
                            }`}
                          >
                            <span
                              style={{ color: subColor }}
                              className="inline-block rounded-lg bg-black/85 px-2.5 py-1 text-xs font-black uppercase shadow-lg"
                            >
                              {subtituloActivo?.texto ||
                                subtitulos[0]?.texto ||
                                "SUBTÍTULO AUTOMÁTICO 9:16"}
                            </span>
                          </div>
                        </>
                      ) : resultadoLink?.ytId ? (
                        <iframe
                          key={`ed-${resultadoLink.ytId}-${previewStartSec}`}
                          src={`https://www.youtube.com/embed/${resultadoLink.ytId}?autoplay=1&start=${previewStartSec}&rel=0`}
                          title="Vista previa en vivo"
                          allow="autoplay; encrypted-media"
                          className="h-full w-full border-0"
                        />
                      ) : (
                        <div className="space-y-2 p-5 text-center">
                          <p className="text-xs font-bold text-white">
                            {cortes.length > 0
                              ? `${cortes.length} clips listos para pegar en 9:16 (${formatearTiempo(
                                  duracionTotalCortes
                                )})`
                              : "Pantalla Vertical 9:16"}
                          </p>
                          <p className="text-[11px] text-[#9e9196]">
                            Todos los cortes se exportan en 4K (2160x3840) a 60fps, con subtítulos reales quemados adentro.
                          </p>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={pegarYExportarVideoFinal}
                      disabled={procesando || (!videoFile && cortes.length === 0)}
                      className={`${BTN_ROSA} w-full py-3 text-sm`}
                    >
                      {procesando
                        ? "⚡ Procesando en 9:16..."
                        : cortes.length > 1
                        ? `🎬 Pegar ${cortes.length} Clips en 9:16 + Subtítulos`
                        : "🎬 Generar Video 9:16 + Subtítulos"}
                    </button>

                    {progresoPaso && (
                      <p className="text-center text-xs font-bold text-cyan-400">{progresoPaso}</p>
                    )}

                    {mensaje && (
                      <p
                        className={`text-center text-xs font-semibold ${
                          mensaje.startsWith("✅") ? "text-emerald-400" : "text-amber-400"
                        }`}
                      >
                        {mensaje}
                      </p>
                    )}
                  </section>

                  <section className={`${CARD} space-y-4 lg:col-span-7`}>
                    <div className="flex flex-wrap gap-1.5 border-b border-[#24181d] pb-3">
                      {(
                        [
                          ["cortes", `✂ Pegar Clips (${cortes.length})`],
                          ["subtitulos", `💬 Subtítulos (${subtitulos.length || "Auto"})`],
                          ["marca", "🏷️ Marca de Agua"],
                          ["stickers", "😀 Stickers"],
                          ["efectos", "🎨 Encuadre/Efectos"],
                        ] as [TabEditor, string][]
                      ).map(([id, label]) => (
                        <button
                          key={id}
                          onClick={() => setTabEditor(id)}
                          className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                            tabEditor === id
                              ? "bg-[#f43f5e] text-white"
                              : "bg-[#0b0709] text-[#c7bcc0] hover:bg-[#1f1419]"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {tabEditor === "cortes" && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <div className="mb-1 flex items-center justify-between">
                              <label className="text-[11px] text-[#9e9196]">Inicio (mm:ss)</label>
                              <button
                                type="button"
                                onClick={() => setInicioTxt(formatearTiempo(tiempoActual))}
                                className="text-[10px] font-bold text-[#f43f5e]"
                              >
                                Usar actual
                              </button>
                            </div>
                            <input
                              value={inicioTxt}
                              onChange={(e) => setInicioTxt(e.target.value)}
                              className={CAMPO}
                            />
                          </div>
                          <div>
                            <div className="mb-1 flex items-center justify-between">
                              <label className="text-[11px] text-[#9e9196]">Fin (mm:ss)</label>
                              <button
                                type="button"
                                onClick={() => setFinTxt(formatearTiempo(tiempoActual))}
                                className="text-[10px] font-bold text-[#f43f5e]"
                              >
                                Usar actual
                              </button>
                            </div>
                            <input
                              value={finTxt}
                              onChange={(e) => setFinTxt(e.target.value)}
                              className={CAMPO}
                            />
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={agregarCorteManual}
                            disabled={!videoFile}
                            className={BTN_ROSA}
                          >
                            + Agregar Corte ({duracionClip}s)
                          </button>
                          <button
                            type="button"
                            onClick={() => irA("directos")}
                            className={BTN_GRIS}
                          >
                            + Traer Más Cortes En Vivo
                          </button>
                          {cortes.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setCortes([])}
                              className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs font-bold text-red-300"
                            >
                              Vaciar lista
                            </button>
                          )}
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs font-bold">
                            <span>Secuencia a pegar ({cortes.length} clips)</span>
                            {cortes.length > 0 && (
                              <span className="text-emerald-400">
                                Total unido: {formatearTiempo(duracionTotalCortes)}
                              </span>
                            )}
                          </div>

                          <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                            {cortes.map((c, idx) => (
                              <div
                                key={c.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#2b1e23] bg-[#0b0709] px-3 py-2 text-xs"
                              >
                                <div className="min-w-0 flex-1">
                                  <span className="font-bold text-[#f43f5e]">#{idx + 1} </span>
                                  <span className="font-semibold text-white">{c.etiqueta}</span>
                                </div>

                                <div className="flex items-center gap-1.5">
                                  {c.archivo && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (videoSrc) URL.revokeObjectURL(videoSrc);
                                        setVideoFile(c.archivo!);
                                        setVideoSrc(URL.createObjectURL(c.archivo!));
                                      }}
                                      className="rounded bg-[#1b1216] px-2 py-0.5 text-[10px] font-bold text-cyan-300"
                                    >
                                      👁 Ver
                                    </button>
                                  )}
                                  <label className="text-[10px] text-[#9e9196]">
                                    Ini:
                                    <input
                                      type="number"
                                      min={0}
                                      value={c.inicio}
                                      onChange={(e) => {
                                        const val = Math.max(0, Number(e.target.value) || 0);
                                        setCortes((prev) =>
                                          prev.map((x) =>
                                            x.id === c.id
                                              ? { ...x, inicio: val, fin: Math.max(val + 1, x.fin) }
                                              : x
                                          )
                                        );
                                      }}
                                      className="ml-1 w-12 rounded border border-[#2b1e23] bg-[#150e12] px-1 py-0.5 text-white"
                                    />
                                  </label>
                                  <label className="text-[10px] text-[#9e9196]">
                                    Fin:
                                    <input
                                      type="number"
                                      min={1}
                                      value={c.fin}
                                      onChange={(e) => {
                                        const val = Math.max(c.inicio + 1, Number(e.target.value) || 1);
                                        setCortes((prev) =>
                                          prev.map((x) =>
                                            x.id === c.id ? { ...x, fin: val } : x
                                          )
                                        );
                                      }}
                                      className="ml-1 w-12 rounded border border-[#2b1e23] bg-[#150e12] px-1 py-0.5 text-white"
                                    />
                                  </label>
                                  <button
                                    onClick={() => moverCorte(idx, -1)}
                                    className="rounded bg-[#1b1216] px-1.5 py-0.5 text-[10px]"
                                  >
                                    ↑
                                  </button>
                                  <button
                                    onClick={() => moverCorte(idx, 1)}
                                    className="rounded bg-[#1b1216] px-1.5 py-0.5 text-[10px]"
                                  >
                                    ↓
                                  </button>
                                  <button
                                    onClick={() =>
                                      setCortes((prev) => prev.filter((x) => x.id !== c.id))
                                    }
                                    className="rounded bg-red-950/60 px-1.5 py-0.5 text-[10px] text-red-300"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {tabEditor === "subtitulos" && (
                      <div className="space-y-3">
                        <p className="text-xs text-emerald-400">
                          ✓ Los subtítulos transcritos se queman dentro del video vertical 9:16 al exportar.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={generarSubtitulosAutomaticos}
                            disabled={generandoSubs}
                            className={BTN_ROSA}
                          >
                            {generandoSubs
                              ? "🎙️ Transcribiendo voz real..."
                              : "🎙️ Transcribir Subtítulos Reales"}
                          </button>

                          <button
                            onClick={() =>
                              setSubtitulos((prev) => [
                                ...prev,
                                {
                                  id: `${Date.now()}`,
                                  inicio: Math.floor(tiempoActual),
                                  fin: Math.floor(tiempoActual) + 4,
                                  texto: "MIRA LO QUE PASÓ AQUÍ 🔥",
                                },
                              ])
                            }
                            className={BTN_GRIS}
                          >
                            + Añadir frase
                          </button>
                        </div>

                        {estadoSubs && (
                          <p className="text-xs font-semibold text-amber-400">{estadoSubs}</p>
                        )}

                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="mb-1 block text-[10px] text-[#9e9196]">Posición</label>
                            <select
                              value={subPos}
                              onChange={(e) => setSubPos(e.target.value as any)}
                              className={CAMPO}
                            >
                              <option value="abajo">Abajo (Estilo TikTok)</option>
                              <option value="centro">Centro</option>
                              <option value="arriba">Arriba</option>
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-[10px] text-[#9e9196]">Color</label>
                            <input
                              type="color"
                              value={subColor}
                              onChange={(e) => setSubColor(e.target.value)}
                              className="h-9 w-full cursor-pointer rounded-lg border border-[#2b1e23] bg-[#0b0709] p-1"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-[10px] text-[#9e9196]">Tamaño</label>
                            <input
                              type="number"
                              min={22}
                              max={72}
                              value={subTamano}
                              onChange={(e) => setSubTamano(Number(e.target.value) || 42)}
                              className={CAMPO}
                            />
                          </div>
                        </div>

                        <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                          {subtitulos.map((s) => (
                            <div
                              key={s.id}
                              className="flex items-center gap-2 rounded-lg border border-[#2b1e23] bg-[#0b0709] p-2"
                            >
                              <span className="shrink-0 font-mono text-[10px] text-[#f43f5e]">
                                {formatearTiempo(s.inicio)}-{formatearTiempo(s.fin)}
                              </span>
                              <input
                                value={s.texto}
                                onChange={(e) =>
                                  setSubtitulos((prev) =>
                                    prev.map((x) =>
                                      x.id === s.id ? { ...x, texto: e.target.value } : x
                                    )
                                  )
                                }
                                className="flex-1 bg-transparent text-xs text-white focus:outline-none"
                              />
                              <button
                                onClick={() =>
                                  setSubtitulos((prev) => prev.filter((x) => x.id !== s.id))
                                }
                                className="text-xs text-red-400"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {tabEditor === "marca" && (
                      <div className="space-y-3">
                        <div>
                          <label className="mb-1 block text-[11px] text-[#9e9196]">
                            Tu Marca de Agua (Texto)
                          </label>
                          <input
                            value={textoMarcaAgua}
                            onChange={(e) => setTextoMarcaAgua(e.target.value)}
                            placeholder="@TuMarca"
                            className={CAMPO}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="mb-1 block text-[11px] text-[#9e9196]">Posición</label>
                            <select
                              value={marcaPos}
                              onChange={(e) => setMarcaPos(e.target.value as any)}
                              className={CAMPO}
                            >
                              <option value="tr">Arriba Derecha</option>
                              <option value="tl">Arriba Izquierda</option>
                              <option value="br">Abajo Derecha</option>
                              <option value="bl">Abajo Izquierda</option>
                              <option value="center">Centro</option>
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-[11px] text-[#9e9196]">Color</label>
                            <input
                              type="color"
                              value={marcaColor}
                              onChange={(e) => setMarcaColor(e.target.value)}
                              className="h-9 w-full cursor-pointer rounded-lg border border-[#2b1e23] bg-[#0b0709] p-1"
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-2 border-t border-[#24181d] pt-3">
                          <button
                            type="button"
                            onClick={() => logoInputRef.current?.click()}
                            className={BTN_GRIS}
                          >
                            ↑ Subir Logo PNG
                          </button>
                          {logoMarcaDataUrl && (
                            <button
                              type="button"
                              onClick={() => setLogoMarcaDataUrl(null)}
                              className="text-xs text-red-400"
                            >
                              Quitar logo
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {tabEditor === "stickers" && (
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-1.5">
                          {EMOJIS_VIRALES.map((em) => (
                            <button
                              key={em}
                              type="button"
                              onClick={() => agregarEmoji(em)}
                              className="rounded-lg border border-[#2b1e23] bg-[#0b0709] px-2.5 py-1.5 text-lg hover:border-[#f43f5e]"
                            >
                              {em}
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => stickerInputRef.current?.click()}
                          className={BTN_GRIS}
                        >
                          ↑ Subir Sticker PNG
                        </button>
                      </div>
                    )}

                    {tabEditor === "efectos" && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="mb-1 block text-[11px] text-[#9e9196]">
                              Encuadre TikTok / Shorts (9:16)
                            </label>
                            <select
                              value={encuadre}
                              onChange={(e) => setEncuadre(e.target.value as "crop" | "blur")}
                              className={CAMPO}
                            >
                              <option value="blur">Stream Completo + Fondo Difuminado</option>
                              <option value="crop">Pantalla Completa (Zoom Centro)</option>
                            </select>
                          </div>

                          <div>
                            <label className="mb-1 block text-[11px] text-[#9e9196]">
                              Filtro Visual
                            </label>
                            <select
                              value={efecto}
                              onChange={(e) => setEfecto(e.target.value)}
                              className={CAMPO}
                            >
                              {Object.entries(EFECTOS_VIDEO).map(([k, v]) => (
                                <option key={k} value={k}>
                                  {v.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="mb-1 block text-[11px] text-[#9e9196]">
                              Formato (Vertical)
                            </label>
                            <select
                              value={aspecto}
                              onChange={(e) => setAspecto(e.target.value)}
                              className={CAMPO}
                            >
                              <option value="9:16">9:16 Vertical (TikTok &amp; Shorts)</option>
                              <option value="1:1">1:1 Cuadrado</option>
                              <option value="16:9">16:9 Horizontal</option>
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-[11px] text-[#9e9196]">
                              Calidad de exportación
                            </label>
                            <select
                              value={calidad}
                              onChange={(e) => setCalidad(e.target.value)}
                              className={CAMPO}
                            >
                              <option value="4K">4K · 2160p a 60fps (YouTube y TikTok)</option>
                              <option value="1080p">1080p a 60fps</option>
                              <option value="720p">720p a 60fps</option>
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-[11px] text-[#9e9196]">
                              Velocidad del video
                            </label>
                            <select
                              value={velocidad}
                              onChange={(e) => setVelocidad(Number(e.target.value))}
                              className={CAMPO}
                            >
                              <option value={0.5}>0.5x · Lento</option>
                              <option value={1}>1x · Normal</option>
                              <option value={1.25}>1.25x · Rápido</option>
                              <option value={1.5}>1.5x · Muy rápido</option>
                              <option value={2}>2x · Doble</option>
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-[11px] text-[#9e9196]">
                              Potencia de Voz
                            </label>
                            <select
                              value={audioGain}
                              onChange={(e) => setAudioGain(Number(e.target.value))}
                              className={CAMPO}
                            >
                              <option value={1}>100% Original</option>
                              <option value={1.25}>125% Voz Clara</option>
                              <option value={1.5}>150% Alto Impacto</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    )}
                  </section>
                </div>

                {clipFinalReciente && (
                  <div className={`${CARD} border-[#f43f5e]/70 space-y-4`}>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#24181d] pb-3">
                      <div>
                        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                          ● VIDEO 9:16 CON SUBTÍTULOS LISTO
                        </span>
                        <h2 className="text-xl font-black text-white">
                          Publicar Directamente Desde Aquí
                        </h2>
                      </div>

                      <button
                        type="button"
                        onClick={() => setMostrarConfigTokens(!mostrarConfigTokens)}
                        className={BTN_GRIS}
                      >
                        🔑 Conectar Mis Cuentas (API Directa)
                      </button>
                    </div>

                    {mostrarConfigTokens && (
                      <div className="grid gap-3 rounded-xl border border-[#2b1e23] bg-[#0b0709] p-4 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-[11px] font-bold text-red-400">
                            YouTube Access Token (OAuth Bearer):
                          </label>
                          <input
                            type="password"
                            value={tokens.youtubeToken}
                            onChange={(e) =>
                              guardarTokensLocal({ ...tokens, youtubeToken: e.target.value })
                            }
                            placeholder="ya29.a0..."
                            className={CAMPO}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-bold text-pink-400">
                            TikTok Access Token (Content Posting API):
                          </label>
                          <input
                            type="password"
                            value={tokens.tiktokToken}
                            onChange={(e) =>
                              guardarTokensLocal({ ...tokens, tiktokToken: e.target.value })
                            }
                            placeholder="act.token..."
                            className={CAMPO}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-bold text-blue-400">
                            Facebook Page Access Token:
                          </label>
                          <input
                            type="password"
                            value={tokens.facebookToken}
                            onChange={(e) =>
                              guardarTokensLocal({ ...tokens, facebookToken: e.target.value })
                            }
                            placeholder="EAAB..."
                            className={CAMPO}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-bold text-blue-400">
                            ID de Página de Facebook:
                          </label>
                          <input
                            type="text"
                            value={tokens.facebookPageId}
                            onChange={(e) =>
                              guardarTokensLocal({ ...tokens, facebookPageId: e.target.value })
                            }
                            placeholder="1029384756..."
                            className={CAMPO}
                          />
                        </div>
                      </div>
                    )}

                    <div className="grid gap-5 md:grid-cols-12">
                      <div className="md:col-span-4">
                        <video
                          src={clipFinalReciente.url}
                          controls
                          className="mx-auto aspect-[9/16] max-h-[380px] rounded-xl bg-black object-contain"
                        />
                      </div>

                      <div className="space-y-3 md:col-span-8">
                        <div>
                          <label className="mb-1 block text-[11px] font-bold text-[#d8cdd1]">
                            Título viral generado automáticamente:
                          </label>
                          <input
                            value={clipFinalReciente.titulo}
                            onChange={(e) => {
                              const val = e.target.value;
                              setClipFinalReciente({ ...clipFinalReciente, titulo: val });
                            }}
                            className={CAMPO}
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-[11px] font-bold text-[#d8cdd1]">
                            Hashtags virales generados automáticamente:
                          </label>
                          <input
                            value={clipFinalReciente.hashtags}
                            onChange={(e) => {
                              const val = e.target.value;
                              setClipFinalReciente({ ...clipFinalReciente, hashtags: val });
                            }}
                            className={CAMPO}
                          />
                        </div>

                        <div className="space-y-2 pt-1">
                          <p className="text-[11px] font-bold text-[#9e9196]">
                            1. Subida directa con archivo MP4 + título + hashtags incluidos:
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={subiendoDirecto !== null}
                              onClick={() => publicarDirectamenteEnRed("youtube", clipFinalReciente)}
                              className="rounded-lg bg-[#dc2626] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#b91c1c]"
                            >
                              {subiendoDirecto === "youtube"
                                ? "Subiendo a YouTube..."
                                : "🚀 Subir Directo a YouTube Shorts"}
                            </button>

                            <button
                              type="button"
                              disabled={subiendoDirecto !== null}
                              onClick={() => publicarDirectamenteEnRed("tiktok", clipFinalReciente)}
                              className="rounded-lg border border-[#f43f5e] bg-[#111111] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#1f161a]"
                            >
                              {subiendoDirecto === "tiktok"
                                ? "Subiendo a TikTok..."
                                : "🚀 Subir Directo a TikTok"}
                            </button>

                            <button
                              type="button"
                              disabled={subiendoDirecto !== null}
                              onClick={() =>
                                publicarDirectamenteEnRed("facebook", clipFinalReciente)
                              }
                              className="rounded-lg bg-[#2563eb] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#1d4ed8]"
                            >
                              {subiendoDirecto === "facebook"
                                ? "Subiendo a Facebook..."
                                : "🚀 Subir Directo a Facebook Reels"}
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2 border-t border-[#24181d] pt-3">
                          <p className="text-[11px] font-bold text-[#9e9196]">
                            2. Si no usas tokens API, abre el archivo ya seleccionado o compártelo directo:
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => compartirArchivoNativo(clipFinalReciente)}
                              className={BTN_ROSA}
                            >
                              📤 Compartir / Subir Archivo Directo
                            </button>

                            <button
                              type="button"
                              onClick={() => abrirArchivoSeleccionadoEnCarpeta(clipFinalReciente)}
                              className={BTN_GRIS}
                            >
                              📂 Abrir Video Seleccionado en Carpeta + Copiar Textos
                            </button>

                            <a
                              href={clipFinalReciente.url}
                              download={`short-viral-9-16-${Date.now()}.mp4`}
                              className={BTN_GRIS}
                            >
                              ↓ Guardar Copia MP4
                            </a>
                          </div>
                        </div>

                        {estadoPublicacion && (
                          <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/50 p-3 text-xs font-bold text-emerald-300">
                            {estadoPublicacion}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {seccion === "biblioteca" && (
              <div className="space-y-4">
                <h1 className="text-2xl font-black">Videos 9:16 Listos para Subir</h1>
                {clips.length === 0 ? (
                  <p className="text-xs text-[#9e9196]">
                    Todos los clips automáticos en vivo se guardan directamente en{" "}
                    <code className="text-white">C:\Users\eric\clips-limpieza\exportados</code>.
                  </p>
                ) : (
                  <div className="grid gap-5 md:grid-cols-2">
                    {clips.map((c) => (
                      <div key={c.id} className={`${CARD} space-y-3`}>
                        <video
                          src={c.url}
                          controls
                          className="mx-auto aspect-[9/16] max-h-[340px] rounded-xl bg-black object-contain"
                        />
                        <input
                          value={c.titulo}
                          onChange={(e) =>
                            setClips((prev) =>
                              prev.map((x) =>
                                x.id === c.id ? { ...x, titulo: e.target.value } : x
                              )
                            )
                          }
                          className={CAMPO}
                        />
                        <input
                          value={c.hashtags}
                          onChange={(e) =>
                            setClips((prev) =>
                              prev.map((x) =>
                                x.id === c.id ? { ...x, hashtags: e.target.value } : x
                              )
                            )
                          }
                          className={CAMPO}
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => publicarDirectamenteEnRed("youtube", c)}
                            className="rounded-lg bg-[#dc2626] px-3 py-2 text-xs font-bold text-white"
                          >
                            🚀 Subir a YouTube
                          </button>
                          <button
                            type="button"
                            onClick={() => publicarDirectamenteEnRed("tiktok", c)}
                            className="rounded-lg border border-[#f43f5e] bg-[#111] px-3 py-2 text-xs font-bold text-white"
                          >
                            🚀 Subir a TikTok
                          </button>
                          <button
                            type="button"
                            onClick={() => abrirArchivoSeleccionadoEnCarpeta(c)}
                            className={BTN_GRIS}
                          >
                            📂 Abrir Seleccionado + Copiar
                          </button>
                        </div>
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
