"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

/* ───────────── Tipos ───────────── */

type Seccion =
  | "resumen"
  | "directos"
  | "videos"
  | "kick-directos"
  | "kick-videos"
  | "editor"
  | "biblioteca";

interface ClipGuardado {
  id: string;
  titulo: string;
  inicio: string;
  fin: string;
  formato: string;
  url?: string;
  papelera?: boolean;
}

/* El hash de la URL igual que la plataforma de referencia (/editor#directos, #corte...) */
const HASH_POR_SECCION: Record<Seccion, string> = {
  resumen: "",
  directos: "directos",
  videos: "videos",
  "kick-directos": "kick-directos",
  "kick-videos": "kick-videos",
  editor: "corte",
  biblioteca: "clips-automaticos",
};

const SECCION_POR_HASH: Record<string, Seccion> = {
  directos: "directos",
  videos: "videos",
  "kick-directos": "kick-directos",
  "kick-videos": "kick-videos",
  corte: "editor",
  "clips-automaticos": "biblioteca",
};

const MENU: { id: Seccion; label: string; icono: string }[] = [
  { id: "resumen", label: "Resumen", icono: "■" },
  { id: "directos", label: "Directos", icono: "●" },
  { id: "videos", label: "Videos", icono: "▷" },
  { id: "kick-directos", label: "Kick · Directos", icono: "●" },
  { id: "kick-videos", label: "Kick · Videos", icono: "▷" },
  { id: "editor", label: "Editor", icono: "✂" },
  { id: "biblioteca", label: "Biblioteca", icono: "▤" },
];

const NOMBRE_SECCION: Record<Seccion, string> = {
  resumen: "Resumen",
  directos: "Directos",
  videos: "Videos",
  "kick-directos": "Kick · Directos",
  "kick-videos": "Kick · Videos",
  editor: "Editor",
  biblioteca: "Biblioteca",
};

/* ───────────── Utilidades ───────────── */

const formatearTiempo = (total: number) => {
  const s = Math.max(0, Math.floor(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(seg).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

/* Acepta mm:ss, h:mm:ss o segundos sueltos */
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
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "YouTube";
  if (u.includes("tiktok.com")) return "TikTok";
  if (u.includes("instagram.com")) return "Instagram";
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

/* ───────────── Componentes pequeños ───────────── */

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
    <h1 className="mb-2 text-4xl font-black leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
      {children}
    </h1>
  );
}

const CAMPO =
  "w-full rounded-lg border border-[#2b1e23] bg-[#0b0709] px-3.5 py-3 text-sm text-white placeholder:text-[#6f6267] focus:border-[#f43f5e]/60 focus:outline-none";

const BTN_ROSA =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-[#f43f5e] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#e11d48] disabled:cursor-not-allowed disabled:opacity-50";

const BTN_GRIS =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-[#2b1e23] bg-[#150e12] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#21161b] disabled:cursor-not-allowed disabled:opacity-40";

const CARD = "rounded-2xl border border-[#2a1c22] bg-[#150d11]/90";

/* ───────────── Página ───────────── */

export default function EditorStudioPage() {
  const [seccion, setSeccion] = useState<Seccion>("resumen");
  const [menuAbierto, setMenuAbierto] = useState(false);

  /* Automatización */
  const [urlInput, setUrlInput] = useState("");
  const [cantidadClips, setCantidadClips] = useState("auto");
  const [estadoProceso, setEstadoProceso] = useState("En espera");

  /* Editor */
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [duracion, setDuracion] = useState(0);
  const [tiempoActual, setTiempoActual] = useState(0);
  const [inicioTxt, setInicioTxt] = useState("00:00");
  const [finTxt, setFinTxt] = useState("00:30");
  const [aspecto, setAspecto] = useState("9:16");
  const [calidad, setCalidad] = useState("720p");
  const [encuadre, setEncuadre] = useState<"Rellenar" | "Video completo">("Rellenar");
  const [modoGaming, setModoGaming] = useState(false);
  const [subtitulos, setSubtitulos] = useState("Sin subtítulos");
  const [procesando, setProcesando] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [mensaje, setMensaje] = useState("");
  const [resultadoUrl, setResultadoUrl] = useState<string | null>(null);

  /* Biblioteca */
  const [clips, setClips] = useState<ClipGuardado[]>([]);
  const [tabBiblioteca, setTabBiblioteca] = useState<"guardados" | "papelera">("guardados");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pararEnRef = useRef<number | null>(null);

  /* FFmpeg: se carga desde CDN, solo cuando se necesita (ahorra datos en el teléfono) */
  const ffmpegRef = useRef<any>(null);
  const utilRef = useRef<any>(null);
  const cargandoRef = useRef<Promise<void> | null>(null);

  const inicioSeg = Number.isNaN(leerTiempo(inicioTxt)) ? 0 : leerTiempo(inicioTxt);
  const finSeg = Number.isNaN(leerTiempo(finTxt)) ? 0 : leerTiempo(finTxt);
  const duracionClip = Math.max(0, finSeg - inicioSeg);

  /* ── Navegación por hash ── */
  useEffect(() => {
    const leer = () => {
      const h = window.location.hash.replace("#", "");
      setSeccion(SECCION_POR_HASH[h] ?? "resumen");
    };
    leer();
    window.addEventListener("hashchange", leer);
    return () => window.removeEventListener("hashchange", leer);
  }, []);

  const irA = useCallback((s: Seccion) => {
    setSeccion(s);
    setMenuAbierto(false);
    const h = HASH_POR_SECCION[s];
    history.replaceState(null, "", h ? `#${h}` : window.location.pathname);
    window.scrollTo({ top: 0 });
  }, []);

  /* ── Carga de FFmpeg ── */
  const cargarFFmpeg = useCallback(async () => {
    if (ffmpegRef.current) return;
    if (cargandoRef.current) return cargandoRef.current;

    cargandoRef.current = (async () => {
      const BASE_FFMPEG = "https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd";
      const BASE_CORE = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";

      await cargarScript(`${BASE_FFMPEG}/ffmpeg.js`);
      await cargarScript("https://unpkg.com/@ffmpeg/util@0.12.1/dist/umd/index.js");

      // El build UMD de @ffmpeg/ffmpeg se expone como FFmpegWASM
      const { FFmpeg } = (window as any).FFmpegWASM;
      const util = (window as any).FFmpegUtil;
      utilRef.current = util;

      const ffmpeg = new FFmpeg();
      ffmpeg.on("progress", ({ progress }: { progress: number }) => {
        setProgreso(Math.min(100, Math.max(0, Math.round(progress * 100))));
      });

      await ffmpeg.load({
        // El worker también debe ir como blob, si no el navegador lo bloquea por ser de otro dominio
        classWorkerURL: await util.toBlobURL(`${BASE_FFMPEG}/814.ffmpeg.js`, "text/javascript"),
        coreURL: await util.toBlobURL(`${BASE_CORE}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await util.toBlobURL(`${BASE_CORE}/ffmpeg-core.wasm`, "application/wasm"),
      });

      ffmpegRef.current = ffmpeg;
    })();

    try {
      await cargandoRef.current;
    } finally {
      cargandoRef.current = null;
    }
  }, []);

  /* Al abrir el editor, precarga el motor en segundo plano */
  useEffect(() => {
    if (seccion === "editor" && !ffmpegRef.current) {
      cargarFFmpeg().catch((e) => console.error("Motor de video:", e));
    }
  }, [seccion, cargarFFmpeg]);

  /* ── Subida de video ── */
  const abrirSelector = () => fileInputRef.current?.click();

  const manejarSubidaVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (videoSrc) URL.revokeObjectURL(videoSrc);
    setVideoFile(file);
    setVideoSrc(URL.createObjectURL(file));
    setInicioTxt("00:00");
    setFinTxt("00:30");
    setResultadoUrl(null);
    setMensaje("");
    setProgreso(0);
    irA("editor");
    e.target.value = "";
  };

  /* ── Control del reproductor ── */
  const alCargarMetadatos = () => {
    const v = videoRef.current;
    if (!v) return;
    setDuracion(v.duration || 0);
    if (v.duration && v.duration < 30) setFinTxt(formatearTiempo(v.duration));
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

  const marcarInicio = () => videoRef.current && setInicioTxt(formatearTiempo(videoRef.current.currentTime));
  const marcarFin = () => videoRef.current && setFinTxt(formatearTiempo(videoRef.current.currentTime));

  const moverTimeline = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = Number(e.target.value);
    if (videoRef.current) videoRef.current.currentTime = t;
    setTiempoActual(t);
  };

  const probarCorte = () => {
    const v = videoRef.current;
    if (!v || duracionClip <= 0) return;
    v.currentTime = inicioSeg;
    pararEnRef.current = finSeg;
    v.play();
  };

  const validarTramo = (): string | null => {
    if (!videoFile) return "Primero sube un video.";
    if (Number.isNaN(leerTiempo(inicioTxt)) || Number.isNaN(leerTiempo(finTxt)))
      return "Escribe los tiempos como mm:ss o h:mm:ss.";
    if (duracionClip < 1) return "El fin debe ser mayor que el inicio.";
    if (duracion && finSeg > duracion + 0.5) return "El fin está después de que termina el video.";
    return null;
  };

  const guardarTramo = () => {
    const error = validarTramo();
    if (error) return setMensaje(error);
    setClips((prev) => [
      {
        id: Date.now().toString(),
        titulo: `Tramo · ${videoFile!.name.slice(0, 24)}`,
        inicio: formatearTiempo(inicioSeg),
        fin: formatearTiempo(finSeg),
        formato: aspecto,
      },
      ...prev,
    ]);
    setMensaje("Tramo guardado en la biblioteca.");
  };

  /* ── Generar MP4 (se procesa en el dispositivo, sin gastar servidor) ── */
  const generarMP4 = async (descargar: boolean) => {
    const error = validarTramo();
    if (error) return setMensaje(error);

    if (videoFile!.size > 600 * 1024 * 1024) {
      setMensaje("El video pesa más de 600 MB. En el teléfono puede fallar: recórtalo en partes más cortas.");
    }

    try {
      setProcesando(true);
      setProgreso(0);
      setMensaje("Preparando el motor de video…");
      await cargarFFmpeg();

      const ffmpeg = ffmpegRef.current;
      const { fetchFile } = utilRef.current;
      const [w, h] = DIMENSIONES[aspecto][calidad];

      const filtro =
        encuadre === "Rellenar"
          ? `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1`
          : `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`;

      setMensaje("Generando clip en tu dispositivo…");
      await ffmpeg.writeFile("entrada.mp4", await fetchFile(videoFile));

      await ffmpeg.exec([
        "-ss", String(inicioSeg),
        "-i", "entrada.mp4",
        "-t", String(duracionClip),
        "-vf", filtro,
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "28",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        "salida.mp4",
      ]);

      const data = await ffmpeg.readFile("salida.mp4");
      await ffmpeg.deleteFile("entrada.mp4").catch(() => {});
      await ffmpeg.deleteFile("salida.mp4").catch(() => {});

      const blob = new Blob([data as BlobPart], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      setResultadoUrl(url);

      if (descargar) {
        const a = document.createElement("a");
        a.href = url;
        a.download = `clip-${Date.now()}.mp4`;
        a.click();
      }

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
      setProgreso(100);
      setMensaje(descargar ? "Clip descargado y guardado en tu biblioteca." : "Clip listo. Revísalo en la vista previa.");
    } catch (err) {
      console.error(err);
      setMensaje("No se pudo generar el clip. Prueba con un MP4 más corto o con menor calidad.");
    } finally {
      setProcesando(false);
    }
  };

  /* ── Automatización por enlace ── */
  const iniciarAutomatico = () => {
    if (!urlInput.trim()) {
      setEstadoProceso("Pega primero un enlace");
      return;
    }
    const plataforma = detectarPlataforma(urlInput);
    if (!plataforma) {
      setEstadoProceso("Enlace no reconocido");
      return;
    }
    setEstadoProceso(`${plataforma} detectado · falta conectar el servidor de análisis`);
  };

  /* ── Biblioteca ── */
  const moverAPapelera = (id: string, papelera: boolean) =>
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, papelera } : c)));
  const eliminarDefinitivo = (id: string) => setClips((prev) => prev.filter((c) => c.id !== id));

  const guardados = clips.filter((c) => !c.papelera);
  const enPapelera = clips.filter((c) => c.papelera);
  const listaBiblioteca = tabBiblioteca === "guardados" ? guardados : enPapelera;

  const plataformaDetectada = detectarPlataforma(urlInput);
  const [anchoPrev, altoPrev] = aspecto.split(":").map(Number);

  /* ── Bloques reutilizados ── */

  const selectorCantidad = (
    <select value={cantidadClips} onChange={(e) => setCantidadClips(e.target.value)} className={CAMPO}>
      <option value="auto">Automática · según los momentos encontrados</option>
      <option value="2">2 clips (Plan Gratis)</option>
      <option value="25">25 clips (Plan Pro)</option>
    </select>
  );

  const campoEnlace = (etiqueta: string, placeholder: string) => (
    <div>
      <label className="mb-1.5 block text-xs font-bold text-white">{etiqueta}</label>
      <input
        type="url"
        inputMode="url"
        value={urlInput}
        onChange={(e) => setUrlInput(e.target.value)}
        placeholder={placeholder}
        className={CAMPO}
      />
      {plataformaDetectada && (
        <p className="mt-1.5 text-[11px] text-[#c7bcc0]">Plataforma detectada: {plataformaDetectada}</p>
      )}
    </div>
  );

  const bloqueListaClips = (titulo: string) => (
    <div className="mt-8 border-t border-[#21171b] pt-6">
      <h2 className="mb-1 text-xl font-extrabold text-white">{titulo}</h2>
      {guardados.length === 0 ? (
        <p className="text-xs text-[#9e9196]">Los clips generados en este apartado aparecerán aquí y en tu biblioteca.</p>
      ) : (
        <p className="text-xs text-[#9e9196]">
          Tienes {guardados.length} clip{guardados.length === 1 ? "" : "s"} guardado{guardados.length === 1 ? "" : "s"}.{" "}
          <button onClick={() => irA("biblioteca")} className="font-bold text-[#f43f5e] underline">
            Abrir biblioteca →
          </button>
        </p>
      )}
    </div>
  );

  const cardResumen = (
    icono: string,
    titulo: string,
    texto: string,
    enlace: string,
    destino: Seccion
  ) => (
    <button
      onClick={() => irA(destino)}
      className="group rounded-2xl border border-[#2a1c22] bg-[#150d11]/90 p-5 text-left transition hover:border-[#f43f5e]/50"
    >
      <span className="mb-5 flex h-9 w-9 items-center justify-center rounded-lg bg-[#2b141b] text-xs text-[#f43f5e]">
        {icono}
      </span>
      <h3 className="mb-1.5 text-lg font-extrabold text-white">{titulo}</h3>
      <p className="mb-4 text-xs leading-relaxed text-[#9e9196]">{texto}</p>
      <span className="text-xs font-bold text-[#f43f5e]">{enlace} →</span>
    </button>
  );

  const navegacion = (
    <nav className="space-y-1">
      {MENU.map((item) => {
        const activo = seccion === item.id;
        return (
          <button
            key={item.id}
            onClick={() => irA(item.id)}
            className={`flex w-full items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left text-xs font-bold transition ${
              activo
                ? "border-[#f43f5e]/70 bg-[#241318] text-white"
                : "border-transparent text-[#d8cdd1] hover:bg-[#171013]"
            }`}
          >
            <span className="w-3 text-center text-[10px] text-[#f43f5e]">{item.icono}</span>
            {item.label}
          </button>
        );
      })}
    </nav>
  );

  /* ───────────── Render ───────────── */

  return (
    <div className="flex min-h-screen bg-[#07050a] bg-[radial-gradient(ellipse_at_top,#2a0f1a_0%,#07050a_55%)] text-[#f5f0f2]">
      <input ref={fileInputRef} type="file" accept="video/*" onChange={manejarSubidaVideo} className="hidden" />

      {/* Barra lateral (escritorio) */}
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col justify-between border-r border-[#21171b] bg-[#0b070a] p-4 lg:flex">
        <div>
          <Link href="/" className="mb-7 flex items-center gap-2.5 px-1">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f43f5e] text-[10px] text-white">▶</span>
            <span className="text-sm font-black text-white">Clips Limpieza</span>
          </Link>
          {navegacion}
        </div>
        <Link
          href="/#planes"
          className="flex items-center gap-2.5 border-t border-[#1e1519] px-2 pt-4 text-xs font-bold text-[#d8cdd1] hover:text-white"
        >
          <span className="h-2 w-2 rounded-full bg-[#f43f5e]" /> Mi cuenta y planes
        </Link>
      </aside>

      {/* Menú deslizable (teléfono) */}
      {menuAbierto && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setMenuAbierto(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col justify-between border-r border-[#21171b] bg-[#0b070a] p-4">
            <div>
              <div className="mb-7 flex items-center justify-between px-1">
                <span className="flex items-center gap-2.5 text-sm font-black text-white">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f43f5e] text-[10px]">▶</span>
                  Clips Limpieza
                </span>
                <button onClick={() => setMenuAbierto(false)} aria-label="Cerrar menú" className="px-2 text-lg text-[#9e9196]">
                  ✕
                </button>
              </div>
              {navegacion}
            </div>
            <Link
              href="/#planes"
              className="flex items-center gap-2.5 border-t border-[#1e1519] px-2 pt-4 text-xs font-bold text-[#d8cdd1]"
            >
              <span className="h-2 w-2 rounded-full bg-[#f43f5e]" /> Mi cuenta y planes
            </Link>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior (teléfono) */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[#21171b] bg-[#0b070a]/95 px-4 py-3 backdrop-blur lg:hidden">
          <span className="flex items-center gap-2.5 text-sm font-black text-white">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f43f5e] text-[10px]">▶</span>
            Clips Limpieza
          </span>
          <button
            onClick={() => setMenuAbierto(true)}
            aria-label="Abrir menú"
            className="rounded-lg border border-[#2b1e23] px-3 py-2 text-sm text-white"
          >
            ☰
          </button>
        </header>

        <main className="flex flex-1 flex-col justify-between px-4 py-6 sm:px-8 lg:px-12 lg:py-8">
          <div className="mx-auto w-full max-w-6xl">
            <div className="mb-8 border-b border-[#21171b] pb-4 text-xs text-[#9e9196]">
              Estudio / <span className="font-bold text-white">{NOMBRE_SECCION[seccion]}</span>
            </div>

            {/* ── RESUMEN ── */}
            {seccion === "resumen" && (
              <div>
                <Eyebrow>Tu espacio de trabajo</Eyebrow>
                <Titulo>
                  Estudio de <span className="text-[#f43f5e]">clips.</span>
                </Titulo>
                <p className="mb-6 text-sm text-[#c7bcc0]">Elige de dónde vas a sacar tus clips y continúa donde lo dejaste.</p>

                <div className="mb-4 grid gap-4 md:grid-cols-2">
                  <div className={`${CARD} p-4`}>
                    <p className="mb-1 text-[11px] text-[#c7bcc0]">Automatización de directos</p>
                    <p className="text-xl font-extrabold text-white">
                      {estadoProceso === "En espera" ? "Sin directo activo" : estadoProceso}
                    </p>
                  </div>
                  <div className={`${CARD} p-4`}>
                    <p className="mb-1 text-[11px] text-[#c7bcc0]">Clips guardados</p>
                    <p className="text-xl font-extrabold text-white">{guardados.length}</p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {cardResumen("●", "Directos de Kick", "Guarda momentos mientras el streamer sigue en vivo.", "Abrir Kick Live", "kick-directos")}
                  {cardResumen("▷", "Videos de Kick", "Encuentra clips en transmisiones guardadas.", "Abrir videos de Kick", "kick-videos")}
                  {cardResumen("●", "Clips automáticos en vivo", "Detecta momentos mientras el directo sigue en emisión.", "Ir a Directos", "directos")}
                  {cardResumen("▷", "Automatizar clips de un video", "Encuentra momentos en un video publicado o marca tu propio tramo.", "Ir a Videos", "videos")}
                  {cardResumen("▤", "Ver mis clips", "Previsualiza, edita y descarga los clips que ya guardaste.", "Ir a Biblioteca", "biblioteca")}
                </div>
              </div>
            )}

            {/* ── DIRECTOS ── */}
            {seccion === "directos" && (
              <div>
                <Eyebrow>Directos de YouTube, TikTok, Instagram y Facebook</Eyebrow>
                <Titulo>Clips automáticos del directo</Titulo>
                <p className="mb-6 max-w-xl text-sm text-[#c7bcc0]">
                  Pega el enlace del directo. El editor detecta momentos mientras el directo avanza y guarda cada corte en tu biblioteca.
                </p>
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className={`${CARD} space-y-5 p-5 sm:p-6`}>
                    <h2 className="text-xl font-extrabold text-white">Configura el directo</h2>
                    {campoEnlace("Enlace del directo", "https://www.youtube.com/live/…")}
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-white">Cantidad de clips</label>
                      {selectorCantidad}
                    </div>
                    <p className="text-[11px] text-[#9e9196]">Cada clip conserva el momento detectado y unos segundos de contexto.</p>
                    <button onClick={iniciarAutomatico} className={`${BTN_ROSA} w-full sm:w-auto`}>
                      ● Iniciar clips automáticos
                    </button>
                    <div>
                      <button onClick={() => irA("biblioteca")} className="text-xs font-bold text-[#f43f5e] underline">
                        Ver clips guardados →
                      </button>
                    </div>
                  </div>

                  <div className={`${CARD} self-start p-5 sm:p-6`}>
                    <div className="mb-1 flex items-start justify-between gap-3">
                      <h2 className="text-xl font-extrabold text-white">Estado de la automatización</h2>
                      <span className="shrink-0 rounded-full bg-[#2a1b21] px-2.5 py-1 text-[10px] font-bold text-white">
                        {estadoProceso.length > 22 ? "Aviso" : estadoProceso}
                      </span>
                    </div>
                    <p className="mb-4 text-[11px] text-[#9e9196]">
                      {estadoProceso.length > 22 ? estadoProceso : "Podrás seguir la señal aquí al iniciar los clips automáticos."}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-[#2a1c22] bg-[#1a0f14] p-4">
                        <p className="text-[11px] text-[#c7bcc0]">Señal recibida</p>
                        <p className="mt-1 text-2xl font-extrabold text-white">00:00</p>
                      </div>
                      <div className="rounded-xl border border-[#2a1c22] bg-[#1a0f14] p-4">
                        <p className="text-[11px] text-[#c7bcc0]">Clips de esta sesión</p>
                        <p className="mt-1 text-2xl font-extrabold text-white">{guardados.length}</p>
                      </div>
                    </div>
                  </div>
                </div>
                {bloqueListaClips("Clips de directos")}
              </div>
            )}

            {/* ── VIDEOS ── */}
            {seccion === "videos" && (
              <div className={`${CARD} p-5 sm:p-8`}>
                <Eyebrow>Videos publicados · YouTube, TikTok, Instagram, Facebook</Eyebrow>
                <Titulo>Automatización de videos</Titulo>
                <p className="mb-6 max-w-xl text-sm text-[#c7bcc0]">
                  Pega un enlace para encontrar momentos destacados y guardar los clips en tu biblioteca. Cada corte conserva la frase o reacción y su contexto.
                </p>
                {campoEnlace("Enlace del video", "https://www.youtube.com/watch?v=…")}
                <button onClick={iniciarAutomatico} className={`${BTN_ROSA} mt-3 w-full sm:w-auto`}>
                  Iniciar clips automáticos
                </button>
                {estadoProceso !== "En espera" && <p className="mt-2 text-[11px] text-[#f43f5e]">{estadoProceso}</p>}

                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <label className="text-xs font-bold text-white">Cantidad de clips</label>
                  <div className="sm:max-w-sm sm:flex-1">{selectorCantidad}</div>
                </div>
                <p className="mt-3 text-[11px] text-[#9e9196]">
                  La cantidad elegida es un máximo. Cada clip debe tener un momento con contexto y respetar los límites de tu plan.
                </p>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-[11px] text-[#c7bcc0]">¿Quieres marcar tú el tramo?</span>
                  <div className="flex gap-2">
                    <button onClick={() => irA("editor")} className={`${BTN_GRIS} flex-1 py-2 text-xs sm:flex-none`}>
                      Abrir en el editor →
                    </button>
                    <button onClick={abrirSelector} className={`${BTN_GRIS} flex-1 py-2 text-xs sm:flex-none`}>
                      ↑ Importar video
                    </button>
                  </div>
                </div>
                {bloqueListaClips("Clips de videos")}
              </div>
            )}

            {/* ── KICK DIRECTOS ── */}
            {seccion === "kick-directos" && (
              <div>
                <Eyebrow>Kick · En vivo</Eyebrow>
                <Titulo>Clips de directos de Kick</Titulo>
                <p className="mb-6 max-w-xl text-sm text-[#c7bcc0]">
                  Detecta momentos con contexto mientras avanza el directo. Los clips se guardan en tu biblioteca para editarlos y exportarlos.
                </p>
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className={`${CARD} space-y-4 p-5 sm:p-6`}>
                    {campoEnlace("Enlace del canal de Kick", "https://kick.com/streamer")}
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-white">Cantidad de clips</label>
                      {selectorCantidad}
                    </div>
                    <p className="text-[11px] text-[#9e9196]">
                      Buscamos cortes de alrededor de 1:20, respetando las frases completas. Una automatización de directo por cuenta.
                    </p>
                    <button onClick={iniciarAutomatico} className={`${BTN_ROSA} w-full`}>
                      Iniciar clips automáticos
                    </button>
                    <p className="text-[11px] text-[#c7bcc0]">{estadoProceso}</p>
                    <button onClick={() => irA("biblioteca")} className="text-xs font-bold text-[#f43f5e] underline">
                      Ver clips guardados →
                    </button>
                  </div>
                  <div className={`${CARD} self-start p-5 sm:p-6`}>
                    <h2 className="mb-4 text-xl font-extrabold text-white">Señal y actividad</h2>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-[#2a1c22] bg-[#1a0f14] p-4">
                        <p className="text-[11px] text-[#c7bcc0]">Tiempo recibido</p>
                        <p className="mt-1 text-2xl font-extrabold text-white">00:00</p>
                      </div>
                      <div className="rounded-xl border border-[#2a1c22] bg-[#1a0f14] p-4">
                        <p className="text-[11px] text-[#c7bcc0]">Clips guardados</p>
                        <p className="mt-1 text-2xl font-extrabold text-white">{guardados.length}</p>
                      </div>
                    </div>
                  </div>
                </div>
                {bloqueListaClips("Clips de directos de Kick")}
              </div>
            )}

            {/* ── KICK VIDEOS ── */}
            {seccion === "kick-videos" && (
              <div className={`${CARD} p-5 sm:p-8`}>
                <Eyebrow>Kick · Videos guardados</Eyebrow>
                <Titulo>Automatización de videos de Kick</Titulo>
                <p className="mb-6 max-w-xl text-sm text-[#c7bcc0]">
                  Pega un video de una transmisión terminada. Elige la cantidad o déjala en automático. Cada momento tendrá título, hashtag y puntaje estimado.
                </p>
                {campoEnlace("Enlace del video de Kick", "https://kick.com/streamer/videos/…")}
                <button onClick={iniciarAutomatico} className={`${BTN_ROSA} mt-3 w-full sm:w-auto`}>
                  Iniciar clips automáticos
                </button>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <label className="text-xs font-bold text-white">Cantidad de clips</label>
                  <div className="sm:max-w-sm sm:flex-1">{selectorCantidad}</div>
                </div>
                <p className="mt-3 text-[11px] text-[#9e9196]">
                  Elige un máximo de clips o deja que la herramienta seleccione los momentos disponibles según tu plan.
                </p>
                <p className="mt-1 text-[11px] text-[#9e9196]">
                  Copia el enlace de un video concreto desde la sección Videos del canal. Abre los clips guardados en el editor para ajustar el encuadre, la cámara y los subtítulos.
                </p>
                <p className="mt-3 text-[11px] text-[#c7bcc0]">{estadoProceso}</p>
                <button onClick={() => irA("biblioteca")} className="text-xs font-bold text-[#f43f5e] underline">
                  Ver y editar mis clips →
                </button>
                {bloqueListaClips("Clips de videos de Kick")}
              </div>
            )}

            {/* ── EDITOR ── */}
            {seccion === "editor" && (
              <div>
                <Eyebrow>Recorte y exportación</Eyebrow>
                <Titulo>Editor de clips</Titulo>
                <p className="mb-6 text-sm text-[#c7bcc0]">
                  Marca Inicio y Fin, ajusta el resultado y genera tu MP4.{" "}
                  <button onClick={abrirSelector} className="font-bold text-[#f43f5e] underline">
                    Elegir otro video →
                  </button>
                </p>

                <div className="grid gap-6 lg:grid-cols-2">
                  {/* Columna 1: elegir momento */}
                  <section className={`${CARD} p-4 sm:p-5`}>
                    <div className="mb-3 flex items-start gap-3">
                      <span className="mt-0.5 rounded bg-[#2b141b] px-2 py-1 font-mono text-[10px] font-bold text-[#f43f5e]">02</span>
                      <div>
                        <h2 className="text-xl font-extrabold text-white">Elige el momento</h2>
                        <p className="text-[11px] text-[#9e9196]">Reproduce el video y marca el inicio y el fin del clip.</p>
                      </div>
                    </div>

                    <div className="mb-4 flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-[#2a1c22] bg-[#0b0709]">
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
                        <button onClick={abrirSelector} className="p-6 text-center text-sm font-semibold text-white">
                          <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-[#f43f5e]/60 text-[#f43f5e]">
                            ▷
                          </span>
                          Toca aquí para cargar un video
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs font-bold text-white">Inicio</label>
                        <div className="flex gap-1.5">
                          <input value={inicioTxt} onChange={(e) => setInicioTxt(e.target.value)} inputMode="numeric" className={CAMPO} />
                          <button onClick={marcarInicio} disabled={!videoSrc} className={`${BTN_GRIS} px-3 text-xs`}>
                            Marcar
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-bold text-white">Fin</label>
                        <div className="flex gap-1.5">
                          <input value={finTxt} onChange={(e) => setFinTxt(e.target.value)} inputMode="numeric" className={CAMPO} />
                          <button onClick={marcarFin} disabled={!videoSrc} className={`${BTN_GRIS} px-3 text-xs`}>
                            Marcar
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center gap-3">
                      <input
                        type="range"
                        min={0}
                        max={duracion || 1}
                        step={0.1}
                        value={tiempoActual}
                        onChange={moverTimeline}
                        disabled={!videoSrc}
                        className="h-1.5 flex-1 cursor-pointer accent-[#f43f5e]"
                        aria-label="Línea de tiempo"
                      />
                      <span className="font-mono text-[10px] text-[#9e9196]">
                        {formatearTiempo(tiempoActual)} / {formatearTiempo(duracion)}
                      </span>
                    </div>
                    <p className="mt-3 text-[11px] text-[#9e9196]">Usa minutos:segundos u horas:minutos:segundos.</p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button onClick={probarCorte} disabled={!videoSrc} className={`${BTN_GRIS} py-2.5 text-xs`}>
                        ▷ Probar corte
                      </button>
                      <button onClick={guardarTramo} disabled={!videoSrc} className={`${BTN_GRIS} py-2.5 text-xs`}>
                        Guardar tramo
                      </button>
                      <button onClick={() => generarMP4(false)} disabled={!videoSrc || procesando} className={`${BTN_ROSA} py-2.5 text-xs`}>
                        Generar clip →
                      </button>
                    </div>
                  </section>

                  {/* Columna 2: preparar MP4 */}
                  <section className={`${CARD} p-4 sm:p-5`}>
                    <div className="mb-4 flex items-start gap-3">
                      <span className="mt-0.5 rounded bg-[#2b141b] px-2 py-1 font-mono text-[10px] font-bold text-[#f43f5e]">03</span>
                      <div>
                        <h2 className="text-xl font-extrabold text-white">Prepara el MP4</h2>
                        <p className="text-[11px] text-[#9e9196]">Ajusta el formato y comprueba el resultado antes de descargarlo.</p>
                      </div>
                    </div>

                    <div className="grid gap-5 sm:grid-cols-2">
                      {/* Vista previa */}
                      <div>
                        <p className="mb-2 text-xs font-bold text-white">
                          Vista previa{" "}
                          <span className="font-normal text-[#9e9196]">
                            MP4 · {DIMENSIONES[aspecto][calidad][0]} × {DIMENSIONES[aspecto][calidad][1]}
                          </span>
                        </p>
                        <div className="flex flex-col items-center rounded-xl border border-[#2a1c22] bg-[#0f090c] p-3">
                          <div
                            className="flex max-h-72 w-full max-w-[170px] items-center justify-center overflow-hidden rounded-lg border border-[#3a2a31] bg-[#0b0709]"
                            style={{ aspectRatio: `${anchoPrev} / ${altoPrev}` }}
                          >
                            {resultadoUrl ? (
                              <video src={resultadoUrl} controls playsInline className="h-full w-full object-contain" />
                            ) : (
                              <span className="font-mono text-lg font-bold text-[#9e9196]">{aspecto}</span>
                            )}
                          </div>
                          <span className="mt-3 rounded bg-[#1e1519] px-2 py-1 font-mono text-[10px] text-[#f43f5e]">
                            {formatearTiempo(duracionClip)} de clip
                          </span>
                          <button
                            onClick={() => generarMP4(false)}
                            disabled={!videoSrc || procesando}
                            className={`${BTN_GRIS} mt-3 w-full py-2 text-xs`}
                          >
                            Generar y reproducir
                          </button>
                        </div>
                      </div>

                      {/* Ajustes */}
                      <div className="space-y-4">
                        <p className="text-xs font-bold text-white">
                          Ajustes del clip <span className="font-normal text-[#9e9196]">Encuadre y subtítulos</span>
                        </p>
                        <div>
                          <label className="mb-1 block text-xs font-bold text-white">Relación de aspecto</label>
                          <select value={aspecto} onChange={(e) => setAspecto(e.target.value)} className={CAMPO}>
                            <option value="9:16">9:16 · Vertical</option>
                            <option value="1:1">1:1 · Cuadrado</option>
                            <option value="16:9">16:9 · Horizontal</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-bold text-white">Calidad del video</label>
                          <select value={calidad} onChange={(e) => setCalidad(e.target.value)} className={CAMPO}>
                            <option value="720p">720p · Media</option>
                            <option value="1080p">1080p · Alta</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-bold text-white">Encuadre</label>
                          <div className="grid grid-cols-2 gap-2">
                            {(["Rellenar", "Video completo"] as const).map((op) => (
                              <button
                                key={op}
                                onClick={() => setEncuadre(op)}
                                className={`rounded-lg border py-2.5 text-xs font-bold transition ${
                                  encuadre === op
                                    ? "border-[#f43f5e] bg-[#241318] text-white"
                                    : "border-[#2b1e23] bg-[#150e12] text-[#c7bcc0]"
                                }`}
                              >
                                {op}
                              </button>
                            ))}
                          </div>
                        </div>
                        <label className="flex cursor-pointer items-center gap-2.5 text-xs font-bold text-white">
                          <input
                            type="checkbox"
                            checked={modoGaming}
                            onChange={(e) => setModoGaming(e.target.checked)}
                            className="h-4 w-4 accent-[#f43f5e]"
                          />
                          Modo Gaming
                        </label>
                        <div className="border-t border-[#21171b] pt-4">
                          <label className="mb-1 block text-xs font-bold text-white">Subtítulos automáticos</label>
                          <select value={subtitulos} onChange={(e) => setSubtitulos(e.target.value)} className={CAMPO}>
                            <option>Sin subtítulos</option>
                            <option>Español</option>
                            <option>Inglés</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 space-y-2">
                      <button onClick={() => generarMP4(true)} disabled={!videoSrc || procesando} className={`${BTN_ROSA} w-full`}>
                        {procesando ? `Procesando… ${progreso}%` : "↓ Descargar MP4"}
                      </button>
                      <p className="text-[11px] text-[#9e9196]">
                        Los MP4 se descargan con el navegador. Cada MP4 generado también queda en tu biblioteca.
                      </p>
                      {procesando && (
                        <div className="h-1.5 overflow-hidden rounded-full bg-[#21171b]">
                          <div className="h-full bg-[#f43f5e] transition-all" style={{ width: `${progreso}%` }} />
                        </div>
                      )}
                      {mensaje && <p className="text-xs font-semibold text-[#f43f5e]">{mensaje}</p>}
                    </div>
                  </section>
                </div>
              </div>
            )}

            {/* ── BIBLIOTECA ── */}
            {seccion === "biblioteca" && (
              <div>
                <Eyebrow>Tus clips</Eyebrow>
                <Titulo>Biblioteca</Titulo>
                <p className="mb-6 text-sm text-[#c7bcc0]">Abre un clip para verlo completo, editarlo o descargarlo.</p>

                <div className="mb-4 flex gap-2">
                  {(["guardados", "papelera"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTabBiblioteca(t)}
                      className={`rounded-lg border px-4 py-2.5 text-xs font-bold capitalize transition ${
                        tabBiblioteca === t
                          ? "border-[#f43f5e] bg-[#241318] text-white"
                          : "border-[#2b1e23] bg-[#150e12] text-[#d8cdd1]"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <div className="mb-4 flex flex-col gap-3 rounded-xl border border-[#2a1c22] bg-[#150d11]/90 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#2b141b] text-[#f43f5e]">✦</span>
                    <div>
                      <p className="text-sm font-bold text-white">Selección con IA</p>
                      <p className="text-[11px] text-[#9e9196]">
                        Genera títulos, hashtags y puntajes de viralidad estimados para tus clips guardados.
                      </p>
                    </div>
                  </div>
                  <button disabled className={`${BTN_GRIS} py-2 text-xs`}>
                    Analizar clips guardados
                  </button>
                </div>

                {listaBiblioteca.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[#2b1e23] p-8 text-center text-[11px] text-[#9e9196]">
                    {tabBiblioteca === "guardados"
                      ? "Aquí aparecerán los tramos guardados, las exportaciones y los clips automáticos."
                      : "La papelera está vacía."}
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {listaBiblioteca.map((c) => (
                      <div key={c.id} className={`${CARD} p-4`}>
                        {c.url && <video src={c.url} controls playsInline className="mb-3 aspect-video w-full rounded-lg bg-black object-contain" />}
                        <h3 className="mb-1 text-sm font-extrabold text-white">{c.titulo}</h3>
                        <p className="mb-3 text-[11px] text-[#9e9196]">
                          Tramo {c.inicio} a {c.fin} · {c.formato}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {c.url && !c.papelera && (
                            <a
                              href={c.url}
                              download={`${c.titulo}.mp4`}
                              className="rounded-lg bg-[#f43f5e] px-3 py-2 text-[11px] font-bold text-white"
                            >
                              ↓ Descargar MP4
                            </a>
                          )}
                          {c.papelera ? (
                            <>
                              <button onClick={() => moverAPapelera(c.id, false)} className={`${BTN_GRIS} px-3 py-2 text-[11px]`}>
                                Restaurar
                              </button>
                              <button onClick={() => eliminarDefinitivo(c.id)} className={`${BTN_GRIS} px-3 py-2 text-[11px]`}>
                                Eliminar
                              </button>
                            </>
                          ) : (
                            <button onClick={() => moverAPapelera(c.id, true)} className={`${BTN_GRIS} px-3 py-2 text-[11px]`}>
                              A la papelera
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <footer className="mx-auto mt-12 flex w-full max-w-6xl items-center justify-between gap-4 pt-4 font-mono text-[10px] text-[#7a6e73]">
            <span>CLIPS LIMPIEZA</span>
            <span className="text-right">Descarga tus clips en tu equipo.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
