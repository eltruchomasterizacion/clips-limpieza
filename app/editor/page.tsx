"use client";

import React, { useState, useRef, useEffect } from "react";
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
}

export default function EditorStudioPage() {
  const [seccion, setSeccion] = useState<Seccion>("resumen");

  const [urlInput, setUrlInput] = useState("");
  const [cantidadClips, setCantidadClips] = useState("auto");
  const [estadoProceso, setEstadoProceso] = useState("En espera");

  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [inicioSeg, setInicioSeg] = useState(0);
  const [finSeg, setFinSeg] = useState(30);
  const [aspecto, setAspecto] = useState("9:16 - Vertical");
  const [calidad, setCalidad] = useState("720p - Media");
  const [encuadre, setEncuadre] = useState<"Rellenar" | "Video completo">("Rellenar");
  const [antesDespues, setAntesDespues] = useState(false);
  const [procesandoMp4, setProcesandoMp4] = useState(false);
  const [progresoTexto, setProgresoTexto] = useState("");

  const [clips, setClips] = useState<ClipGuardado[]>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
  // Usamos referencias libres para evitar los bloqueos de Vercel
  const ffmpegRef = useRef<any>(null);
  const fetchFileRef = useRef<any>(null);

  useEffect(() => {
    const cargarMotorVideo = async () => {
      try {
        // Truco: Cargamos FFmpeg directo de la nube (CDN) para engañar a Vercel
        const cargarScript = (src: string) => {
          return new Promise((resolve) => {
            const s = document.createElement("script");
            s.src = src;
            s.onload = resolve;
            document.head.appendChild(s);
          });
        };

        await cargarScript("https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js");
        await cargarScript("https://unpkg.com/@ffmpeg/util@0.12.1/dist/umd/index.js");

        const { FFmpeg } = (window as any).FFmpeg;
        const { toBlobURL, fetchFile } = (window as any).FFmpegUtil;
        fetchFileRef.current = fetchFile;

        const ffmpeg = new FFmpeg();
        
        // Descargamos el núcleo pesado en la memoria del cliente
        const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });

        ffmpegRef.current = ffmpeg;
        setFfmpegLoaded(true);
      } catch (err) {
        console.error("Error iniciando motor de video:", err);
      }
    };
    cargarMotorVideo();
  }, []);

  const formatearTiempo = (segundos: number) => {
    const mins = Math.floor(segundos / 60);
    const secs = Math.floor(segundos % 60);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const manejarSubidaVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setVideoSrc(url);
    setInicioSeg(0);
    setFinSeg(30);
    setSeccion("editor");
  };

  const marcarInicioActual = () => {
    if (videoRef.current) {
      setInicioSeg(Math.floor(videoRef.current.currentTime));
    }
  };

  const marcarFinActual = () => {
    if (videoRef.current) {
      setFinSeg(Math.floor(videoRef.current.currentTime));
    }
  };

  const guardarTramoEnBiblioteca = () => {
    if (!videoFile) return;
    const nuevo: ClipGuardado = {
      id: Date.now().toString(),
      titulo: `Clip - ${videoFile.name.slice(0, 20)}`,
      inicio: formatearTiempo(inicioSeg),
      fin: formatearTiempo(finSeg),
      formato: aspecto,
      url: videoSrc || undefined,
    };
    setClips([nuevo, ...clips]);
    alert("Tramo guardado en Biblioteca");
  };

  const generarYDescargarMP4 = async () => {
    if (!videoFile) {
      alert("Primero sube un video para recortar.");
      return;
    }
    if (!ffmpegLoaded || !ffmpegRef.current) {
      alert("El motor de video aún está cargando. Espera unos segundos e intenta de nuevo.");
      return;
    }
    
    const ffmpeg = ffmpegRef.current;
    const fetchFile = fetchFileRef.current;
    const duracion = Math.max(1, finSeg - inicioSeg);

    try {
      setProcesandoMp4(true);
      setProgresoTexto("Procesando clip en tu computadora (sin gastar servidor)...");

      await ffmpeg.writeFile("entrada.mp4", await fetchFile(videoFile));

      await ffmpeg.exec([
        "-ss", String(inicioSeg),
        "-i", "entrada.mp4",
        "-t", String(duracion),
        "-c", "copy",
        "salida.mp4",
      ]);

      const data = await ffmpeg.readFile("salida.mp4");
      const blob = new Blob([data as BlobPart], { type: "video/mp4" });
      const downloadUrl = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `clip-limpieza-${Date.now()}.mp4`;
      a.click();

      setClips([
        {
          id: Date.now().toString(),
          titulo: `Clip Exportado (${formatearTiempo(inicioSeg)} - ${formatearTiempo(finSeg)})`,
          inicio: formatearTiempo(inicioSeg),
          fin: formatearTiempo(finSeg),
          formato: aspecto,
          url: downloadUrl,
        },
        ...clips,
      ]);
      setProgresoTexto("¡Clip descargado con éxito!");
    } catch (err) {
      console.error(err);
      setProgresoTexto("Error procesando. Verifica que el archivo sea un MP4 válido.");
    } finally {
      setProcesandoMp4(false);
    }
  };

  const simularAutomatizacion = () => {
    if (!urlInput.trim()) {
      alert("Pega primero el enlace del directo.");
      return;
    }
    setEstadoProceso("Analizando momentos de limpieza...");
    setTimeout(() => {
      setEstadoProceso("Listo: 2 clips enviados a Biblioteca");
      setClips((prev) => [
        {
          id: Date.now().toString(),
          titulo: "Momento Satisfactorio #1",
          inicio: "04:12",
          fin: "04:58",
          formato: "9:16 - Vertical",
        },
        ...prev,
      ]);
    }, 1800);
  };

  const menuItems: { id: Seccion; label: string; icon: string }[] = [
    { id: "resumen", label: "Resumen", icon: "▪" },
    { id: "directos", label: "Directos", icon: "◉" },
    { id: "videos", label: "Videos", icon: "▶" },
    { id: "kick-directos", label: "Kick - Directos", icon: "◉" },
    { id: "kick-videos", label: "Kick - Videos", icon: "▶" },
    { id: "editor", label: "Editor", icon: "✂" },
    { id: "biblioteca", label: "Biblioteca", icon: "▤" },
  ];

  return (
    <div className="min-h-screen bg-[#090708] text-[#f5f0f2] flex font-sans">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        onChange={manejarSubidaVideo}
        className="hidden"
      />

      <aside className="w-56 shrink-0 bg-[#0d090b] border-r border-[#21171b] flex flex-col justify-between p-4">
        <div>
          <Link href="/" className="flex items-center gap-2.5 px-2 mb-8">
            <div className="w-6 h-6 rounded-md bg-[#f43f5e] flex items-center justify-center text-[10px] font-black text-white">▶</div>
            <span className="font-bold text-sm text-white">Clips Limpieza</span>
          </Link>
          <nav className="space-y-1">
            {menuItems.map((item) => {
              const activo = seccion === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setSeccion(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition text-left ${
                    activo ? "bg-[#241318] text-white border border-[#f43f5e]/40" : "text-[#9e9196] hover:text-white hover:bg-[#171013]"
                  }`}
                >
                  <span className="text-[#f43f5e]">{item.icon}</span>
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
        <div className="pt-4 border-t border-[#1e1519]">
          <Link href="/#planes" className="flex items-center gap-2 px-2 py-2 text-xs text-[#b5a8ad] hover:text-white transition">
            <span className="w-2 h-2 rounded-full bg-[#f43f5e]"></span> Mi cuenta y planes
          </Link>
        </div>
      </aside>

      <main className="flex-1 flex flex-col justify-between p-8 overflow-y-auto">
        <div className="max-w-5xl w-full mx-auto">
          <div className="text-[11px] text-[#7a6e73] mb-6">
            Estudio / <span className="text-white capitalize">{seccion}</span>
          </div>

          {seccion === "resumen" && (
            <div>
              <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#f43f5e] mb-1">● TU ESPACIO DE TRABAJO</p>
              <h1 className="text-3xl md:text-4xl font-black text-white mb-2">Estudio de <span className="text-[#f43f5e]">clips.</span></h1>
              <p className="text-xs text-[#9e9196] mb-6">Elige de dónde vas a sacar tus clips de limpieza y continúa donde lo dejaste.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="bg-[#120c0f] border border-[#261b20] rounded-xl p-4">
                  <p className="text-[11px] text-[#8f8287] mb-1">Automatización de directos</p>
                  <p className="text-sm font-bold text-white">{estadoProceso}</p>
                </div>
                <div className="bg-[#120c0f] border border-[#261b20] rounded-xl p-4">
                  <p className="text-[11px] text-[#8f8287] mb-1">Clips guardados</p>
                  <p className="text-xl font-black text-white">{clips.length}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div onClick={() => setSeccion("directos")} className="cursor-pointer bg-[#120c0f] hover:border-[#f43f5e]/50 border border-[#261b20] rounded-xl p-5 transition">
                  <h3 className="text-sm font-bold text-white mb-1">Clips automáticos en vivo</h3>
                  <p className="text-xs text-[#8f8287] mb-4">Detecta antes y después mientras el directo sigue en emisión.</p>
                  <span className="text-xs font-bold text-white">Ir a Directos →</span>
                </div>
                <div onClick={() => setSeccion("editor")} className="cursor-pointer bg-[#120c0f] hover:border-[#f43f5e]/50 border border-[#261b20] rounded-xl p-5 transition">
                  <h3 className="text-sm font-bold text-white mb-1">Editor de video</h3>
                  <p className="text-xs text-[#8f8287] mb-4">Sube tus grabaciones y recorta los mejores momentos.</p>
                  <span className="text-xs font-bold text-white">Ir al Editor →</span>
                </div>
                <div onClick={() => setSeccion("biblioteca")} className="cursor-pointer bg-[#120c0f] hover:border-[#f43f5e]/50 border border-[#261b20] rounded-xl p-5 transition">
                  <h3 className="text-sm font-bold text-white mb-1">Ver mis clips</h3>
                  <p className="text-xs text-[#8f8287] mb-4">Previsualiza y descarga los clips que ya guardaste.</p>
                  <span className="text-xs font-bold text-white">Ir a Biblioteca →</span>
                </div>
              </div>
            </div>
          )}

          {(seccion === "directos" || seccion === "videos" || seccion === "kick-directos" || seccion === "kick-videos") && (
            <div>
              <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#f43f5e] mb-1">● AUTOMATIZACIÓN DE CLIPS</p>
              <h1 className="text-3xl font-black text-white mb-2">
                {seccion === "directos" && "Clips automáticos del directo"}
                {seccion === "videos" && "Automatización de videos"}
                {seccion === "kick-directos" && "Clips de directos de Kick"}
                {seccion === "kick-videos" && "Automatización de videos de Kick"}
              </h1>
              <p className="text-xs text-[#9e9196] mb-6">Pega el enlace de tu transmisión de limpieza para detectar momentos satisfactorios y guardar cada corte en tu biblioteca.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-[#120c0f] border border-[#261b20] rounded-2xl p-6 space-y-4">
                  <h2 className="text-sm font-bold text-white">Configura el enlace</h2>
                  <div>
                    <label className="block text-[11px] text-[#9e9196] mb-1.5">Enlace del directo o video</label>
                    <input type="text" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder="https://www.youtube.com/live/..." className="w-full bg-[#090708] border border-[#2b1e23] rounded-lg px-3 py-2 text-xs text-white" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#9e9196] mb-1.5">Cantidad de clips</label>
                    <select value={cantidadClips} onChange={(e) => setCantidadClips(e.target.value)} className="w-full bg-[#090708] border border-[#2b1e23] rounded-lg px-3 py-2 text-xs text-white">
                      <option value="auto">Automática · según momentos de limpieza</option>
                      <option value="2">2 clips (Plan Gratis)</option>
                      <option value="25">25 clips (Plan Pro Limpieza)</option>
                    </select>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <button onClick={simularAutomatizacion} className="bg-[#f43f5e] hover:bg-[#e11d48] text-white text-xs font-bold px-4 py-2.5 rounded-lg transition">● Iniciar clips automáticos</button>
                    <button onClick={() => fileInputRef.current?.click()} className="bg-[#1c1317] hover:bg-[#291c22] border border-[#33242a] text-white text-xs font-semibold px-4 py-2.5 rounded-lg transition">↑ Importar video local</button>
                  </div>
                </div>
                <div className="bg-[#120c0f] border border-[#261b20] rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-bold text-white">Estado de la automatización</h2>
                    <span className="text-[10px] bg-[#1e1519] text-[#c7bcc0] px-2.5 py-1 rounded-full">{estadoProceso}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[#090708] border border-[#21171b] rounded-xl p-4">
                      <p className="text-[11px] text-[#8f8287]">Señal recibida</p>
                      <p className="text-lg font-black text-white mt-1">00:00</p>
                    </div>
                    <div className="bg-[#090708] border border-[#21171b] rounded-xl p-4">
                      <p className="text-[11px