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

  const probarCorte = () => {
    const v = videoRef.current;
    if (!v || duracionClip <= 0) return;
    v.currentTime = inicioSeg;
    pararEnRef.current = finSeg;
    v.play();
  };

  const validarTramo = (): string | null => {
    if (!videoFile) return "Primero selecciona un archivo de video.";
    if (Number.isNaN(leerTiempo(inicioTxt)) || Number.isNaN(leerTiempo(finTxt)))
      return "Escribe los tiempos en formato mm:ss.";
    if (duracionClip < 1) return "El fin debe ser mayor que el inicio.";
    return null;
  };

  const generarMP4 = async (descargar: boolean) => {
    const error = validarTramo();
    if (error) return setMensaje(error);

    try {
      setProcesando(true);
      setProgreso(0);
      setMensaje("Cargando motor de video...");
      await cargarFFmpeg();

      const ffmpeg = ffmpegRef.current;
      const { fetchFile } = utilRef.current;
      const [w, h] = DIMENSIONES[aspecto][calidad];

      let filtro =
        encuadre === "Rellenar"
          ? `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1`
          : `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`;

      if (textoMarcaAgua.trim()) {
        const textoEscapado = textoMarcaAgua.replace(/:/g, '\\:').replace(/'/g, '');
        filtro += `,drawtext=text='${textoEscapado}':fontcolor=white:fontsize=24:x=w-tw-30:y=h-th-30:box=1:boxcolor=black@0.5:boxborderw=8`;
      }

      setMensaje("Procesando clip y aplicando marca de agua...");
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
        a.download = `clip-marca-${Date.now()}.mp4`;
        a.click();
      }

      setClips((prev) => [
        {
          id: Date.now().toString(),
          titulo: `Clip con Marca · ${formatearTiempo(inicioSeg)} a ${formatearTiempo(finSeg)}`,
          inicio: formatearTiempo(inicioSeg),
          fin: formatearTiempo(finSeg),
          formato: aspecto,
          url,
        },
        ...prev,
      ]);
      setProgreso(100);
      setMensaje(descargar ? "¡Descargado con éxito!" : "Clip generado correctamente.");
    } catch (err) {
      console.error(err);
      setMensaje("Error al procesar el video. Intenta con uno más corto.");
    } finally {
      setProcesando(false);
    }
  };

  const accionEnlace = () => {
    if (!urlInput.trim()) {
      setEstadoProceso("Pega primero un enlace válido");
      return;
    }
    if (licenciaActiva) {
      setEstadoProceso("¡Enlace verificado! Sube tu video o usa el editor.");
      irA("editor");
    } else {
      const plataforma = detectarPlataforma(urlInput) || "Video";
      const mensajeWp = `Hola, quiero procesar clips automáticos de este enlace de ${plataforma}: ${urlInput}`;
      window.open(`https://wa.me/18097911746?text=${encodeURIComponent(mensajeWp)}`, "_blank");
    }
  };

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

  return (
    <div className="flex min-h-screen bg-[#07050a] text-[#f5f0f2]">
      <input ref={fileInputRef} type="file" accept="video/*" onChange={manejarSubidaVideo} className="hidden" />

      <aside className="sticky top-0 hidden h-screen w-52 shrink-0 flex-col justify-between border-r border-[#21171b] bg-[#0b070a] p-4 lg:flex">
        <div>
          <Link href="/" className="mb-6 flex items-center gap-2 px-1">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#f43f5e] text-[10px] text-white">▶</span>
            <span className="text-xs font-black text-white">Clips Limpieza</span>
          </Link>
          {navegacion}
        </div>
        <div className="border-t border-[#1e1519] px-1 pt-3">
          <div className="text-[10px] text-[#9e9196] mb-0.5">Estado:</div>
          <div className={`text-xs font-bold ${licenciaActiva ? "text-emerald-400" : "text-amber-400"}`}>
            {licenciaActiva ? "● Activa (Master)" : "○ Sin Licencia"}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[#21171b] bg-[#0b070a]/95 px-4 py-3 backdrop-blur lg:hidden">
          <span className="flex items-center gap-2 text-xs font-black text-white">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#f43f5e] text-[10px]">▶</span>
            Clips Limpieza
          </span>
          <button onClick={() => setMenuAbierto(!menuAbierto)} className="rounded-lg border border-[#2b1e23] px-3 py-1.5 text-xs text-white">☰ Menú</button>
        </header>

        {menuAbierto && (
          <div className="border-b border-[#21171b] bg-[#0b070a] p-4 lg:hidden">
            {navegacion}
          </div>
        )}

        <main className="flex flex-1 flex-col justify-between px-4 py-6 sm:px-8">
          <div className="mx-auto w-full max-w-5xl">
            <div className="mb-6 border-b border-[#21171b] pb-3 text-xs text-[#9e9196]">
              Estudio / <span className="font-bold text-white">{NOMBRE_SECCION[seccion]}</span>
            </div>

            {seccion === "activar" && (
              <div className={`${CARD} max-w-md mx-auto space-y-4`}>
                <Eyebrow>Activación</Eyebrow>
                <Titulo>Llave o Código</Titulo>
                <p className="text-xs text-[#c7bcc0]">
                  Introduce tu llave maestra de administrador o el código de tu plan mensual.
                </p>
                <form onSubmit={activarCodigoUnico} className="space-y-3">
                  <div>
                    <input
                      type="text"
                      value={codigoInput}
                      onChange={(e) => setCodigoInput(e.target.value)}
                      placeholder="Ej. ELTRUCHO-ADMIN-MASTER"
                      className={CAMPO}
                    />
                  </div>
                  <button type="submit" className={`${BTN_ROSA} w-full`}>
                    🔓 Activar Acceso
                  </button>
                </form>
                {mensajeLicencia && <p className="text-xs font-bold text-[#f43f5e]">{mensajeLicencia}</p>}
              </div>
            )}

            {seccion === "resumen" && (
              <div className="space-y-5">
                <div>
                  <Eyebrow>Panel Principal</Eyebrow>
                  <Titulo>Estudio de <span className="text-[#f43f5e]">Clips.</span></Titulo>
                  <p className="text-xs sm:text-sm text-[#c7bcc0]">TikTok, YouTube, Shorts y Spotify con tu propia marca de agua.</p>
                </div>
                
                {!licenciaActiva && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-300 flex items-center justify-between">
                    <span>⚠️ Licencia no activa en este navegador.</span>
                    <button onClick={() => irA("activar")} className="underline font-bold">Activar</button>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-3">
                  <button onClick={() => irA("directos")} className={`${CARD} text-left transition hover:border-[#f43f5e]/50`}>
                    <h3 className="mb-1 text-base font-extrabold text-white">En Vivos (Lives)</h3>
                    <p className="text-xs text-[#9e9196]">Procesa transmisiones en directo.</p>
                  </button>
                  <button onClick={() => irA("videos")} className={`${CARD} text-left transition hover:border-[#f43f5e]/50`}>
                    <h3 className="mb-1 text-base font-extrabold text-white">Videos Normales</h3>
                    <p className="text-xs text-[#9e9196]">Extrae clips para tus redes.</p>
                  </button>
                  <button onClick={() => irA("editor")} className={`${CARD} text-left transition hover:border-[#f43f5e]/50`}>
                    <h3 className="mb-1 text-base font-extrabold text-white">Editor y Marca</h3>
                    <p className="text-xs text-[#9e9196]">Corta y pon tu logo al instante.</p>
                  </button>
                </div>
              </div>
            )}

            {(seccion === "directos" || seccion === "videos") && (
              <div className={`${CARD} space-y-4 max-w-xl mx-auto`}>
                <Eyebrow>Enlaces</Eyebrow>
                <Titulo>{seccion === "directos" ? "En Vivos / Lives" : "Videos Normales"}</Titulo>
                <p className="text-xs text-[#c7bcc0]">Pega tu enlace de YouTube, TikTok, Spotify o plataformas compatibles.</p>
                <div>
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className={CAMPO}
                  />
                  {detectarPlataforma(urlInput) && (
                    <p className="mt-1 text-[11px] text-[#f43f5e]">Plataforma: {detectarPlataforma(urlInput)} ✓</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2.5 pt-1">
                  <button onClick={accionEnlace} className={BTN_ROSA}>
                    {licenciaActiva ? "⚡ Ir al Editor" : "💬 Consultar WhatsApp"}
                  </button>
                  <button onClick={abrirSelector} className={BTN_GRIS}>↑ Subir Video Local</button>
                </div>
                <p className="text-xs text-[#f43f5e]">{estadoProceso}</p>
              </div>
            )}

            {seccion === "editor" && (
              <div className="grid gap-5 lg:grid-cols-2">
                <section className={CARD}>
                  <h2 className="text-lg font-extrabold text-white mb-3">Editor de Recorte</h2>
                  <div className="mb-3 flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-black">
                    {videoSrc ? (
                      <video ref={videoRef} src={videoSrc} controls playsInline onLoadedMetadata={alCargarMetadatos} onTimeUpdate={alActualizarTiempo} className="h-full w-full object-contain" />
                    ) : (
                      <button onClick={abrirSelector} className={BTN_ROSA}>↑ Seleccionar Archivo</button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 mb-3">
                    <div>
                      <label className="text-[11px] text-white">Inicio (mm:ss)</label>
                      <input value={inicioTxt} onChange={(e) => setInicioTxt(e.target.value)} className={CAMPO} />
                    </div>
                    <div>
                      <label className="text-[11px] text-white">Fin (mm:ss)</label>
                      <input value={finTxt} onChange={(e) => setFinTxt(e.target.value)} className={CAMPO} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={probarCorte} className={BTN_GRIS}>▷ Probar</button>
                    <button onClick={() => generarMP4(true)} disabled={procesando} className={BTN_ROSA}>
                      {procesando ? `Procesando ${progreso}%` : "↓ Descargar MP4"}
                    </button>
                  </div>
                  {mensaje && <p className="text-xs text-[#f43f5e] mt-2">{mensaje}</p>}
                </section>

                <section className={CARD}>
                  <h2 className="text-lg font-extrabold text-white mb-3">Marca y Formato</h2>
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-[11px] font-bold text-white">Texto de Marca de Agua</label>
                      <input
                        type="text"
                        value={textoMarcaAgua}
                        onChange={(e) => setTextoMarcaAgua(e.target.value)}
                        placeholder="@TuCanal"
                        className={CAMPO}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-white">Relación de Aspecto</label>
                      <select value={aspecto} onChange={(e) => setAspecto(e.target.value)} className={CAMPO}>
                        <option value="9:16">9:16 · Vertical (TikTok, Shorts)</option>
                        <option value="1:1">1:1 · Cuadrado</option>
                        <option value="16:9">16:9 · Horizontal (YouTube)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-white">Calidad</label>
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
                <Titulo>Biblioteca</Titulo>
                {guardados.length === 0 ? (
                  <p className="text-xs text-[#9e9196] mt-3">No hay clips guardados todavía.</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mt-4">
                    {guardados.map((c) => (
                      <div key={c.id} className={CARD}>
                        {c.url && <video src={c.url} controls className="mb-2.5 aspect-video w-full rounded bg-black object-contain" />}
                        <h3 className="text-xs font-bold text-white">{c.titulo}</h3>
                        <p className="text-[11px] text-[#9e9196] mb-2">{c.inicio} - {c.fin} · {c.formato}</p>
                        {c.url && <a href={c.url} download="clip.mp4" className="inline-block bg-[#f43f5e] px-3 py-1.5 text-xs font-bold text-white rounded">↓ Descargar</a>}
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