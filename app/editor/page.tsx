                <div className="bg-[#120c0f] border border-[#261b20] rounded-2xl p-5 space-y-4">
                  <h2 className="text-sm font-bold text-white">Tramo del clip</h2>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="inicio" className="block text-[11px] text-[#9e9196] mb-1">Inicio (segundos)</label>
                      <input id="inicio" type="number" min={0} max={duracionVideo || undefined} value={inicioSeg} onChange={(event) => setInicioSeg(Math.max(0, Number(event.target.value) || 0))} className="w-full bg-[#090708] border border-[#2b1e23] rounded-lg px-3 py-2 text-sm text-white" />
                      <p className="text-[10px] text-[#8f8287] mt-1">{formatearTiempo(inicioSeg)}</p>
                    </div>
                    <div>
                      <label htmlFor="fin" className="block text-[11px] text-[#9e9196] mb-1">Final (segundos)</label>
                      <input id="fin" type="number" min={1} max={duracionVideo || undefined} value={finSeg} onChange={(event) => setFinSeg(Math.max(1, Number(event.target.value) || 1))} className="w-full bg-[#090708] border border-[#2b1e23] rounded-lg px-3 py-2 text-sm text-white" />
                      <p className="text-[10px] text-[#8f8287] mt-1">{formatearTiempo(finSeg)}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={marcarInicioActual} disabled={!videoSrc} className="bg-[#1c1317] border border-[#33242a] disabled:opacity-40 text-white text-xs px-3 py-2 rounded-lg">Usar tiempo actual como inicio</button>
                    <button type="button" onClick={marcarFinActual} disabled={!videoSrc} className="bg-[#1c1317] border border-[#33242a] disabled:opacity-40 text-white text-xs px-3 py-2 rounded-lg">Usar tiempo actual como final</button>
                  </div>
                  <div>
                    <label htmlFor="aspecto" className="block text-[11px] text-[#9e9196] mb-1.5">Formato</label>
                    <select id="aspecto" value={aspecto} onChange={(event) => setAspecto(event.target.value as Aspecto)} className="w-full bg-[#090708] border border-[#2b1e23] rounded-lg px-3 py-2 text-xs text-white">
                      <option>9:16 - Vertical</option>
                      <option>1:1 - Cuadrado</option>
                      <option>16:9 - Horizontal</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="calidad" className="block text-[11px] text-[#9e9196] mb-1.5">Resolución</label>
                      <select id="calidad" value={calidad} onChange={(event) => setCalidad(event.target.value as Calidad)} className="w-full bg-[#090708] border border-[#2b1e23] rounded-lg px-3 py-2 text-xs text-white">
                        <option value="1080p">1080p</option>
                        <option value="720p">720p</option>
                        <option value="480p">480p</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="encuadre" className="block text-[11px] text-[#9e9196] mb-1.5">Encuadre</label>
                      <select id="encuadre" value={encuadre} onChange={(event) => setEncuadre(event.target.value as "Rellenar" | "Video completo")} className="w-full bg-[#090708] border border-[#2b1e23] rounded-lg px-3 py-2 text-xs text-white">
                        <option value="Rellenar">Rellenar</option>
                        <option value="Video completo">Video completo</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button type="button" onClick={guardarTramoEnBiblioteca} disabled={!videoFile} className="bg-[#1c1317] border border-[#33242a] disabled:opacity-40 text-white text-xs font-semibold px-4 py-2.5 rounded-lg">Guardar selección</button>
                    <button type="button" onClick={generarYDescargarMP4} disabled={!videoFile || procesandoMp4} className="bg-[#f43f5e] hover:bg-[#e11d48] disabled:opacity-50 text-white text-xs font-bold px-4 py-2.5 rounded-lg">{procesandoMp4 ? "Exportando..." : "Exportar clip MP4"}</button>
                  </div>
                </div>

                <div className="bg-[#120c0f] border border-[#261b20] rounded-2xl p-5 space-y-4">
                  <div>
                    <h2 className="text-sm font-bold text-white mb-2">Motor de video</h2>
                    <p className="text-xs text-[#8f8287]">FFmpeg WebAssembly se descarga una vez y se ejecuta en el navegador. La primera carga puede ocupar varias decenas de MB.</p>
                    <div className="mt-3 flex flex-wrap gap-2 items-center">
                      <button type="button" onClick={cargarMotorVideo} disabled={ffmpegLoaded || cargandoFfmpeg} className="bg-[#1c1317] border border-[#33242a] disabled:opacity-50 text-white text-xs font-semibold px-4 py-2.5 rounded-lg">
                        {ffmpegLoaded ? "Motor cargado" : cargandoFfmpeg ? "Cargando motor..." : "Cargar motor de video"}
                      </button>
                      <span className={`text-[11px] ${ffmpegLoaded ? "text-emerald-400" : "text-[#9e9196]"}`}>{ffmpegLoaded ? "Listo" : "No cargado"}</span>
                    </div>
                  </div>
                  {procesandoMp4 && (
                    <div>
                      <div className="flex justify-between text-[11px] text-[#c7bcc0] mb-1"><span>Procesando</span><span>{progreso}%</span></div>
                      <div className="h-2 rounded-full bg-[#291c22] overflow-hidden"><div className="h-full bg-[#f43f5e] transition-all" style={{ width: `${progreso}%` }} /></div>
                    </div>
                  )}
                  {progresoTexto && <p className="text-xs text-[#c7bcc0]">{progresoTexto}</p>}
                  {errorFfmpeg && <p role="alert" className="text-xs text-red-300">{errorFfmpeg}</p>}
                  <div className="border-t border-[#261b20] pt-4">
                    <h3 className="text-xs font-bold text-white mb-2">Archivo seleccionado</h3>
                    <p className="text-xs text-[#8f8287] break-all">{videoFile?.name ?? "Ningún archivo importado"}</p>
                    {duracionVideo > 0 && <p className="text-xs text-[#8f8287] mt-1">Duración: {formatearTiempo(duracionVideo)}</p>}
                    <p className="text-xs text-[#8f8287] mt-3">Duración del recorte: {formatearTiempo(Math.max(0, finSeg - inicioSeg))}</p>
                  </div>
                </div>
              </div>
            </section>
          )}

          {seccion === "biblioteca" && (
            <section>
              <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#f43f5e] mb-1">● TUS ARCHIVOS</p>
              <h1 className="text-3xl font-black text-white mb-2">Biblioteca de clips.</h1>
              <p className="text-xs text-[#9e9196] mb-6">Los registros se mantienen en memoria mientras esta página permanezca abierta. Para conservar un MP4, descarga el archivo exportado.</p>
              {clips.length === 0 ? (
                <div className="bg-[#120c0f] border border-dashed border-[#49313a] rounded-2xl p-10 text-center">
                  <p className="text-sm font-bold text-white">Todavía no hay clips guardados.</p>
                  <p className="text-xs text-[#8f8287] mt-2">Importa un video y guarda una selección o exporta un MP4.</p>
                  <button type="button" onClick={() => setSeccion("editor")} className="mt-4 bg-[#f43f5e] text-white text-xs font-bold px-4 py-2.5 rounded-lg">Abrir Editor</button>
                </div>
              ) : (
                <div className="space-y-3">
                  {clips.map((clip) => (
                    <article key={clip.id} className="bg-[#120c0f] border border-[#261b20] rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-sm font-bold text-white break-words">{clip.titulo}</h2>
                        <p className="text-xs text-[#8f8287] mt-1">{clip.inicio} – {clip.fin} · {clip.formato}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {clip.url && <button type="button" onClick={() => abrirVideo(clip)} className="bg-[#1c1317] border border-[#33242a] text-white text-xs px-3 py-2 rounded-lg">Abrir</button>}
                        <button type="button" onClick={() => eliminarClip(clip.id)} className="border border-red-900/70 text-red-300 text-xs px-3 py-2 rounded-lg">Eliminar</button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
