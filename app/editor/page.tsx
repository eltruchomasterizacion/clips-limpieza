"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

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

export default function EditorStudioPage() {
  const [seccion, setSeccion] = useState<Seccion>("resumen");
  const [menuAbierto, setMenuAbierto] = useState(false);

  const [urlInput, setUrlInput] = useState("");
  const [cantidadClips, setCantidadClips] = useState("auto");
  const [estadoProceso, setEstadoProceso] = useState("En espera");

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

  const [clips, setClips] = useState<ClipGuardado[]>([]);
  const [tabBiblioteca, setTabBiblioteca] = useState<"guardados" | "papelera">("guardados");

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

  const cargarFFmpeg = useCallback(async () => {
    if (ffmpegRef.current) return;
    if (cargandoRef.current) return cargandoRef.current;

    cargandoRef.current = (async () => {
      const BASE_FFMPEG = "https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd";
      const BASE_CORE = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";

      await cargarScript(`${BASE_FFMPEG}/ffmpeg.js`);
      await cargarScript("https://unpkg.com/@ffmpeg/util@0.12.1/dist/umd/index.js");

      const { FFmpeg } = (window as any).FFmpegWASM;
      const util = (window as any).FFmpegUtil;
      utilRef.current = util;

      const ffmpeg = new FFmpeg();
      ffmpeg.on("progress", ({ progress }: { progress: number }) => {
        setProgreso(Math.min(100, Math.max(0, Math.round(progress * 100))));
      });

      await ffmpeg.load({
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
    if (!videoFile) return "Primero sube un video o importa tu grabación.";
    if (Number.isNaN(leerTiempo(inicioTxt)) || Number.isNaN(leerTiempo(finTxt)))
      return "Escribe los tiempos como mm:ss.";
    if (duracionClip < 1) return "El fin debe ser mayor que el inicio.";
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

  const generarMP4 = async (descargar: boolean) => {
    const error = validarTramo();
    if (error) return setMensaje(error);

    try {
      setProcesando(true);
      setProgreso(0);
      setMensaje("Preparando motor de video…");
      await cargarFFmpeg();

      const ffmpeg = ffmpegRef.current;
      const { fetchFile } = utilRef.current;
      const [w, h] = DIMENSIONES[aspecto][calidad];

      const filtro =
        encuadre === "Rellenar"
          ? `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1`
          : `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`;

      setMensaje("Recortando clip en tu dispositivo…");
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
      setMensaje(descargar ? "¡Clip descargado con éxito!" : "Clip listo.");
    } catch (err) {
      console.error(err);
      setMensaje("Error procesando el video. Prueba con un archivo más corto.");
    } finally {
      setProcesando(false);
    }
  };

  const iniciarAutomatico = () => {
    if (!urlInput.trim()) {
      setEstadoProceso("Pega primero un enlace válido");
      return;
    }
    const plataforma = detectarPlataforma(urlInput);
    if (!plataforma) {
      setEstadoProceso("Enlace no reconocido");
      return;
    }
    // Redirección inteligente a WhatsApp para pedidos en vivo o carga del editor
    setEstadoProceso(`Enlace de ${plataforma} listo. Redirigiendo para procesar...`);
    const mensajeWp = `Hola, quiero extraer clips automáticos de este ${plataforma}: ${urlInput}`;
    window.open(`https://wa.me/18290000000?text=${encodeURIComponent(mensajeWp)}`, "_blank");
  };

  const guardados = clips.filter((c) => !c.papelera);
  const enPapelera = clips.filter((c) => c.papelera);
  const listaBiblioteca = tabBiblioteca === "guardados" ? guardados : enPapelera;

  const plataformaDetectada = detectarPlataforma(urlInput);
  const [anchoPrev, altoPrev] = aspecto.split(":").map(Number);

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
        <p className="mt-1.5 text-[11px] text-[#f43f5e]">Plataforma detectada: {plataformaDetectada} ✓</p>
      )}
    </div>
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

  return (
    <div className="flex min-h-screen bg-[#07050a] text-[#f5f0f2]">
      <input ref={fileInputRef} type="file" accept="video/*" onChange={manejarSubidaVideo} className="hidden" />

      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col justify-between border-r border-[#21171b] bg-[#0b070a] p-4 lg:flex">
        <div>
          <Link href="/" className="mb-7 flex items-center gap-2.5 px-1">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f43f5e] text-[10px] text-white">▶</span>
            <span className="text-sm font-black text-white">Clips Limpieza</span>
          </Link>
          {navegacion}
        </div>
        <Link href="/#planes" className="flex items-center gap-2.5 border-t border-[#1e1519] px-2 pt-4 text-xs font-bold text-[#d8cdd1]">
          <span className="h-2 w-2 rounded-full bg-[#f43f5e]" /> Mi cuenta y planes
        </Link>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[#21171b] bg-[#0b070a]/95 px-4 py-3 backdrop-blur lg:hidden">
          <span className="flex items-center gap-2.5 text-sm font-black text-white">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f43f5e] text-[10px]">▶</span>
            Clips Limpieza
          </span>
          <button onClick={() => setMenuAbierto(true)} className="rounded-lg border border-[#2b1e23] px-3 py-2 text-sm text-white">☰</button>
        </header>

        <main className="flex flex-1 flex-col justify-between px-4 py-6 sm:px-8 lg:px-12">
          <div className="mx-auto w-full max-w-6xl">
            <div className="mb-8 border-b border-[#21171b] pb-4 text-xs text-[#9e9196]">
              Estudio / <span className="font-bold text-white">{NOMBRE_SECCION[seccion]}</span>
            </div>

            {seccion === "resumen" && (
              <div>
                <Eyebrow>Tu espacio de trabajo</Eyebrow>
                <Titulo>Estudio de <span className="text-[#f43f5e]">clips.</span></Titulo>
                <p className="mb-6 text-sm text-[#c7bcc0]">Pega tus enlaces de en vivo o sube tus grabaciones para generar contenido viral al instante.</p>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <button onClick={() => irA("directos")} className={`${CARD} p-5 text-left transition hover:border-[#f43f5e]/50`}>
                    <h3 className="mb-1 text-lg font-extrabold text-white">Clips de Directos (Live)</h3>
                    <p className="text-xs text-[#9e9196]">Procesa transmisiones en vivo de YouTube o plataformas compatibles.</p>
                  </button>
                  <button onClick={() => irA("editor")} className={`${CARD} p-5 text-left transition hover:border-[#f43f5e]/50`}>
                    <h3 className="mb-1 text-lg font-extrabold text-white">Editor Manual</h3>
                    <p className="text-xs text-[#9e9196]">Sube un archivo de video y recorta tus mejores momentos.</p>
                  </button>
                  <button onClick={() => irA("biblioteca")} className={`${CARD} p-5 text-left transition hover:border-[#f43f5e]/50`}>
                    <h3 className="mb-1 text-lg font-extrabold text-white">Mi Biblioteca</h3>
                    <p className="text-xs text-[#9e9196]">Descarga tus clips listos en formato MP4.</p>
                  </button>
                </div>
              </div>
            )}

            {(seccion === "directos" || seccion === "videos") && (
              <div className={`${CARD} p-6 sm:p-8 space-y-5`}>
                <Eyebrow>Extracción de enlaces</Eyebrow>
                <Titulo>Saca clips de tus Lives y Videos</Titulo>
                <p className="text-sm text-[#c7bcc0]">Pega el link de tu transmisión. Al iniciar, el sistema enviará los datos a tu WhatsApp o procesará el corte.</p>
                {campoEnlace("Enlace del en vivo o video", "https://www.youtube.com/watch?v=...")}
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-white">Cantidad de clips</label>
                  {selectorCantidad}
                </div>
                <div className="flex flex-wrap gap-3 pt-2">
                  <button onClick={iniciarAutomatico} className={BTN_ROSA}>💬 Enviar enlace y procesar</button>
                  <button onClick={abrirSelector} className={BTN_GRIS}>↑ O subir video desde el equipo</button>
                </div>
                <p className="text-xs text-[#f43f5e]">{estadoProceso}</p>
              </div>
            )}

            {seccion === "editor" && (
              <div className="grid gap-6 lg:grid-cols-2">
                <section className={`${CARD} p-4 sm:p-5`}>
                  <h2 className="text-xl font-extrabold text-white mb-3">Editor de Recorte</h2>
                  <div className="mb-4 flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-black">
                    {videoSrc ? (
                      <video ref={videoRef} src={videoSrc} controls playsInline onLoadedMetadata={alCargarMetadatos} onTimeUpdate={alActualizarTiempo} className="h-full w-full object-contain" />
                    ) : (
                      <button onClick={abrirSelector} className={BTN_ROSA}>↑ Seleccionar archivo de video</button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="text-xs text-white">Inicio (mm:ss)</label>
                      <input value={inicioTxt} onChange={(e) => setInicioTxt(e.target.value)} className={CAMPO} />
                    </div>
                    <div>
                      <label className="text-xs text-white">Fin (mm:ss)</label>
                      <input value={finTxt} onChange={(e) => setFinTxt(e.target.value)} className={CAMPO} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={probarCorte} className={BTN_GRIS}>▷ Probar</button>
                    <button onClick={() => generarMP4(true)} disabled={procesando} className={BTN_ROSA}>
                      {procesando ? `Generando ${progreso}%` : "↓ Descargar MP4"}
                    </button>
                  </div>
                  {mensaje && <p className="text-xs text-[#f43f5e] mt-2">{mensaje}</p>}
                </section>

                <section className={`${CARD} p-4 sm:p-5`}>
                  <h2 className="text-xl font-extrabold text-white mb-3">Ajustes Verticales (9:16)</h2>
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs text-white">Formato</label>
                      <select value={aspecto} onChange={(e) => setAspecto(e.target.value)} className={CAMPO}>
                        <option value="9:16">9:16 · Vertical (TikTok / Shorts)</option>
                        <option value="1:1">1:1 · Cuadrado</option>
                        <option value="16:9">16:9 · Horizontal</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-white">Calidad</label>
                      <select value={calidad} onChange={(e) => setCalidad(e.target.value)} className={CAMPO}>
                        <option value="720p">720p (Rápido)</option>
                        <option value="1080p">1080p (Alta definición)</option>
                      </select>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {seccion === "biblioteca" && (
              <div>
                <Titulo>Biblioteca de Clips</Titulo>
                {guardados.length === 0 ? (
                  <p className="text-xs text-[#9e9196] mt-4">No hay clips guardados todavía. Usa el editor para exportar tu primer MP4.</p>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-4">
                    {guardados.map((c) => (
                      <div key={c.id} className={`${CARD} p-4`}>
                        {c.url && <video src={c.url} controls className="mb-3 aspect-video w-full rounded bg-black object-contain" />}
                        <h3 className="text-sm font-bold text-white">{c.titulo}</h3>
                        <p className="text-xs text-[#9e9196] mb-3">{c.inicio} a {c.fin} · {c.formato}</p>
                        {c.url && <a href={c.url} download="clip.mp4" className="inline-block bg-[#f43f5e] px-3 py-2 text-xs font-bold text-white rounded">↓ Descargar MP4</a>}
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