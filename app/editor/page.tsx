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
  const [subtitulos, setSubtitulos] = useState("Subtítulos grandes");
  const [procesandoMp4, setProcesandoMp4] = useState(false);
  const [progresoTexto, setProgresoTexto] = useState("");

  const [clips, setClips] = useState<ClipGuardado[]>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
  // Usamos "any" y cargamos dinámicamente para evitar que Vercel rompa la página
  const ffmpegRef = useRef<any>(null);

  useEffect(() => {
    const loadFFmpeg = async () => {
      try {
        const { FFmpeg } = await import("@ffmpeg/ffmpeg");
        const ffmpeg = new FFmpeg();
        await ffmpeg.load();
        ffmpegRef.current = ffmpeg;
        setFfmpegLoaded(true);
      } catch (err) {
        console.error("Error cargando FFmpeg:", err);
      }
    };
    loadFFmpeg();
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
    const duracion = Math.max(1, finSeg - inicioSeg);

    try {
      setProcesandoMp4(true);
      setProgresoTexto("Procesando clip en tu computadora (sin gastar servidor)...");

      // Carga de utilidad segura
      const { fetchFile } = await import("@ffmpeg/util");

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
                      <p className="text-[11px] text-[#8f8287]">Clips de esta sesión</p>
                      <p className="text-lg font-black text-white mt-1">{clips.length}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {seccion === "editor" && (
            <div>
              <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#f43f5e] mb-1">● RECORTE Y EXPORTACIÓN</p>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-3xl font-black text-white">Editor de clips</h1>
                  <p className="text-xs text-[#9e9196]">Marca Inicio y Fin, ajusta el formato vertical y genera tu MP4.</p>
                </div>
                <button onClick={() => fileInputRef.current?.click()} className="bg-[#f43f5e] hover:bg-[#e11d48] text-white text-xs font-bold px-4 py-2 rounded-lg transition">↑ Subir video</button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 bg-[#120c0f] border border-[#261b20] rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[10px] font-bold bg-[#2b141b] text-[#f43f5e] px-2 py-0.5 rounded">02</span>
                    <h2 className="text-sm font-bold text-white">Elige el momento</h2>
                  </div>

                  <div className="aspect-video bg-[#090708] border border-[#21171b] rounded-xl overflow-hidden flex items-center justify-center mb-4">
                    {videoSrc ? (
                      <video ref={videoRef} src={videoSrc} controls className="w-full h-full object-contain" />
                    ) : (
                      <button onClick={() => fileInputRef.current?.click()} className="text-center p-6 text-xs text-[#9e9196] hover:text-white">
                        <div className="w-10 h-10 rounded-full border border-[#f43f5e]/50 text-[#f43f5e] flex items-center justify-center mx-auto mb-2">▶</div>
                        Haz clic aquí para cargar un video
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                      <label className="block text-[11px] text-[#8f8287] mb-1">Inicio (segundos)</label>
                      <div className="flex gap-1.5">
                        <input type="number" value={inicioSeg} onChange={(e) => setInicioSeg(Number(e.target.value))} className="w-full bg-[#090708] border border-[#2b1e23] rounded-lg px-3 py-1.5 text-xs text-white" />
                        <button onClick={marcarInicioActual} className="px-3 py-1.5 bg-[#1e1519] hover:bg-[#2c1f25] rounded-lg text-[11px] font-semibold">Marcar</button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#8f8287] mb-1">Fin (segundos)</label>
                      <div className="flex gap-1.5">
                        <input type="number" value={finSeg} onChange={(e) => setFinSeg(Number(e.target.value))} className="w-full bg-[#090708] border border-[#2b1e23] rounded-lg px-3 py-1.5 text-xs text-white" />
                        <button onClick={marcarFinActual} className="px-3 py-1.5 bg-[#1e1519] hover:bg-[#2c1f25] rounded-lg text-[11px] font-semibold">Marcar</button>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button onClick={guardarTramoEnBiblioteca} className="px-4 py-2 bg-[#1e1519] hover:bg-[#2c1f25] rounded-lg text-xs font-semibold text-white">Guardar tramo</button>
                    <button onClick={generarYDescargarMP4} disabled={procesandoMp4} className="bg-[#f43f5e] hover:bg-[#e11d48] disabled:opacity-50 px-4 py-2 rounded-lg text-xs font-bold text-white">
                      {procesandoMp4 ? "Procesando..." : "Generar clip →"}
                    </button>
                  </div>
                  {progresoTexto && <p className="text-[11px] text-[#f43f5e] mt-3">{progresoTexto}</p>}
                </div>

                <div className="lg:col-span-5 bg-[#120c0f] border border-[#261b20] rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[10px] font-bold bg-[#2b141b] text-[#f43f5e] px-2 py-0.5 rounded">03</span>
                    <h2 className="text-sm font-bold text-white">Prepara el MP4</h2>
                  </div>
                  <div className="grid grid-cols-12 gap-4 items-start">
                    <div className="col-span-5">
                      <p className="text-[10px] text-[#8f8287] mb-1.5">Vista previa</p>
                      <div className="aspect-[9/16] bg-[#090708] border border-[#2b1e23] rounded-xl flex flex-col items-center justify-center p-2 text-center">
                        <span className="text-xs font-bold text-[#8f8287]">{aspecto.split(" ")[0]}</span>
                        <span className="text-[10px] text-[#f43f5e] mt-1">{Math.max(0, finSeg - inicioSeg)}s</span>
                      </div>
                    </div>
                    <div className="col-span-7 space-y-3">
                      <div>
                        <label className="block text-[10px] text-[#8f8287] mb-1">Relación de aspecto</label>
                        <select value={aspecto} onChange={(e) => setAspecto(e.target.value)} className="w-full bg-[#090708] border border-[#2b1e23] rounded-lg px-2.5 py-1.5 text-xs text-white">
                          <option>9:16 - Vertical</option>
                          <option>1:1 - Cuadrado</option>
                          <option>16:9 - Horizontal</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#8f8287] mb-1">Calidad del video</label>
                        <select value={calidad} onChange={(e) => setCalidad(e.target.value)} className="w-full bg-[#090708] border border-[#2b1e23] rounded-lg px-2.5 py-1.5 text-xs text-white">
                          <option>720p - Media (Gratis)</option>
                          <option>1080p - Alta</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#8f8287] mb-1">Encuadre</label>
                        <div className="grid grid-cols-2 gap-1.5">
                          <button onClick={() => setEncuadre("Rellenar")} className={`py-1.5 rounded text-[11px] font-semibold border ${encuadre === "Rellenar" ? "border-[#f43f5e] bg-[#241318] text-white" : "border-[#2b1e23] text-[#8f8287]"}`}>Rellenar</button>
                          <button onClick={() => setEncuadre("Video completo")} className={`py-1.5 rounded text-[11px] font-semibold border ${encuadre === "Video completo" ? "border-[#f43f5e] bg-[#241318] text-white" : "border-[#2b1e23] text-[#8f8287]"}`}>Completo</button>
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-[11px] text-[#c7bcc0] cursor-pointer">
                        <input type="checkbox" checked={antesDespues} onChange={(e) => setAntesDespues(e.target.checked)} className="accent-[#f43f5e]" />
                        Modo Antes y Después
                      </label>
                      <button onClick={generarYDescargarMP4} disabled={procesandoMp4} className="w-full py-2.5 bg-[#f43f5e] hover:bg-[#e11d48] rounded-lg text-xs font-bold text-white transition">↓ Descargar MP4</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {seccion === "biblioteca" && (
            <div>
              <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#f43f5e] mb-1">● TUS CLIPS</p>
              <h1 className="text-3xl font-black text-white mb-2">Biblioteca</h1>
              <p className="text-xs text-[#9e9196] mb-6">Abre un clip para verlo completo, editarlo o descargarlo.</p>
              {clips.length === 0 ? (
                <div className="border border-dashed border-[#2b1e23] rounded-2xl p-12 text-center text-xs text-[#8f8287]">Aquí aparecerán los tramos guardados y clips exportados.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {clips.map((c) => (
                    <div key={c.id} className="bg-[#120c0f] border border-[#261b20] rounded-xl p-4">
                      <h3 className="text-xs font-bold text-white mb-1">{c.titulo}</h3>
                      <p className="text-[11px] text-[#8f8287] mb-3">Tramo: {c.inicio} → {c.fin} · {c.formato}</p>
                      {c.url && (
                        <a href={c.url} download={`${c.titulo}.mp4`} className="inline-block px-3 py-1.5 bg-[#f43f5e] rounded-lg text-[11px] font-bold text-white">↓ Descargar MP4</a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <footer className="max-w-5xl w-full mx-auto pt-12 mt-12 border-t border-[#1e1519] flex items-center justify-between text-[11px] text-[#7a6e73]">
          <span>CLIPS LIMPIEZA</span>
          <span>Descarga tus clips en tu equipo.</span>
        </footer>
      </main>
    </div>
  );
}