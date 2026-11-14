"use client";

import React, { useState } from "react";
import Link from "next/link";

interface FilaLicencia {
  codigo: string;
  plan: string;
  dias: number;
  estado: string;
  creada: number;
  activadaEn: number;
  expira: number;
  nota: string;
}

interface FilaActividad {
  t: number;
  plan: string;
  codigo: string;
  dispositivo: string;
  detalle: string;
}

const CAMPO =
  "w-full rounded-lg border border-[#2b1e23] bg-[#0b0709] px-3.5 py-2.5 text-sm text-white placeholder:text-[#6f6267] focus:border-[#f43f5e]/65 focus:outline-none";
const BTN =
  "inline-flex items-center justify-center rounded-lg bg-[#f43f5e] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#e11d48] disabled:opacity-60";
const BTN_GRIS =
  "inline-flex items-center justify-center rounded-lg border border-[#2b1e23] bg-[#150e12] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#21161b]";
const CARD = "rounded-2xl border border-[#2a1c22] bg-[#150d11]/90 p-5";

const fecha = (ms: number) => (ms ? new Date(ms).toLocaleString("es", { dateStyle: "short", timeStyle: "short" }) : "—");

export default function AdminPage() {
  const [clave, setClave] = useState("");
  const [dentro, setDentro] = useState(false);
  const [licencias, setLicencias] = useState<FilaLicencia[]>([]);
  const [actividad, setActividad] = useState<FilaActividad[]>([]);
  const [plan, setPlan] = useState("editor");
  const [dias, setDias] = useState(30);
  const [cantidad, setCantidad] = useState(1);
  const [nota, setNota] = useState("");
  const [nuevos, setNuevos] = useState<string[]>([]);
  const [mensaje, setMensaje] = useState("");
  const [cargando, setCargando] = useState(false);

  const llamar = async (cuerpo: Record<string, unknown>) => {
    const r = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-key": clave },
      body: JSON.stringify(cuerpo),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error ?? "Error");
    return d;
  };

  const refrescar = async () => {
    const d = await llamar({ accion: "listar" });
    setLicencias(d.licencias ?? []);
    setActividad(d.actividad ?? []);
  };

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setCargando(true);
    setMensaje("");
    try {
      await refrescar();
      setDentro(true);
    } catch (err: any) {
      setMensaje(err.message);
    } finally {
      setCargando(false);
    }
  };

  const crear = async () => {
    setCargando(true);
    setMensaje("");
    try {
      const d = await llamar({ accion: "crear", plan, dias, cantidad, nota });
      setNuevos(d.codigos);
      setNota("");
      await refrescar();
    } catch (err: any) {
      setMensaje(err.message);
    } finally {
      setCargando(false);
    }
  };

  const accion = async (a: "liberar" | "revocar", codigo: string) => {
    const texto =
      a === "revocar"
        ? `¿Borrar el código ${codigo}? El cliente perderá el acceso.`
        : `¿Liberar ${codigo} para activarlo en otro dispositivo?`;
    if (!window.confirm(texto)) return;
    try {
      await llamar({ accion: a, codigo });
      await refrescar();
    } catch (err: any) {
      setMensaje(err.message);
    }
  };

  const copiar = (texto: string) => navigator.clipboard?.writeText(texto);

  const mensajeCliente = (codigo: string) =>
    `Hola, aquí está tu código de activación: ${codigo}\n\nEntra a ${window.location.origin}/editor#activar-licencia, pégalo y pulsa "Activar Acceso". El código es personal y solo funciona en un dispositivo.`;

  if (!dentro) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#07050a] p-4 text-white">
        <form onSubmit={entrar} className={`${CARD} w-full max-w-sm space-y-4`}>
          <h1 className="text-2xl font-black">Panel del dueño</h1>
          <p className="text-xs text-[#c7bcc0]">Escribe tu clave maestra (la variable ADMIN_KEY).</p>
          <input
            type="password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            placeholder="Clave maestra"
            className={CAMPO}
            autoComplete="off"
          />
          <button type="submit" disabled={cargando || !clave} className={`${BTN} w-full`}>
            {cargando ? "Verificando..." : "Entrar"}
          </button>
          {mensaje && <p className="text-xs font-bold text-[#f43f5e]">{mensaje}</p>}
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07050a] px-4 py-8 text-[#f5f0f2]">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-black">Panel del dueño</h1>
          <Link href="/editor" className={BTN_GRIS}>Ir al editor</Link>
        </div>

        <section className={`${CARD} space-y-4`}>
          <h2 className="text-lg font-extrabold">Crear códigos</h2>
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <label className="text-[11px]">Plan</label>
              <select value={plan} onChange={(e) => setPlan(e.target.value)} className={CAMPO}>
                <option value="editor">Editor</option>
                <option value="pro">Pro</option>
                <option value="estudio">Estudio</option>
                <option value="agencia">Agencia</option>
              </select>
            </div>
            <div>
              <label className="text-[11px]">Días de acceso</label>
              <input type="number" min={1} max={400} value={dias} onChange={(e) => setDias(Number(e.target.value))} className={CAMPO} />
            </div>
            <div>
              <label className="text-[11px]">Cantidad</label>
              <input type="number" min={1} max={20} value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} className={CAMPO} />
            </div>
            <div>
              <label className="text-[11px]">Nota (cliente)</label>
              <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. Juan" maxLength={80} className={CAMPO} />
            </div>
          </div>
          <p className="text-[11px] text-[#9e9196]">
            Los días se cuentan desde que el cliente activa el código. Para un mes pon 30; para un año, 365.
          </p>
          <button onClick={crear} disabled={cargando} className={BTN}>+ Generar código</button>

          {nuevos.length > 0 && (
            <div className="space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
              <p className="text-xs font-bold text-emerald-300">Códigos nuevos:</p>
              {nuevos.map((c) => (
                <div key={c} className="flex flex-wrap items-center gap-2">
                  <code className="font-mono text-sm text-white">{c}</code>
                  <button onClick={() => copiar(c)} className={BTN_GRIS}>Copiar código</button>
                  <button onClick={() => copiar(mensajeCliente(c))} className={BTN_GRIS}>Copiar mensaje para WhatsApp</button>
                </div>
              ))}
            </div>
          )}
          {mensaje && <p className="text-xs font-bold text-[#f43f5e]">{mensaje}</p>}
        </section>

        <section className={`${CARD} space-y-3`}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold">Códigos ({licencias.length})</h2>
            <button onClick={refrescar} className={BTN_GRIS}>Actualizar</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[#9e9196]">
                <tr>
                  <th className="py-2 pr-3">Código</th>
                  <th className="pr-3">Plan</th>
                  <th className="pr-3">Estado</th>
                  <th className="pr-3">Vence</th>
                  <th className="pr-3">Nota</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {licencias.map((l) => (
                  <tr key={l.codigo} className="border-t border-[#2b1e23]">
                    <td className="py-2 pr-3 font-mono">{l.codigo}</td>
                    <td className="pr-3">{l.plan}</td>
                    <td className={`pr-3 font-bold ${l.estado === "activa" ? "text-emerald-400" : l.estado === "vencida" ? "text-red-400" : "text-amber-400"}`}>
                      {l.estado}
                    </td>
                    <td className="pr-3">{l.expira ? fecha(l.expira) : `${l.dias} días al activar`}</td>
                    <td className="pr-3">{l.nota || "—"}</td>
                    <td className="space-x-1.5 whitespace-nowrap text-right">
                      <button onClick={() => copiar(mensajeCliente(l.codigo))} className={BTN_GRIS}>Mensaje</button>
                      {l.estado !== "sin usar" && (
                        <button onClick={() => accion("liberar", l.codigo)} className={BTN_GRIS}>Liberar</button>
                      )}
                      <button onClick={() => accion("revocar", l.codigo)} className={BTN_GRIS}>Borrar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {licencias.length === 0 && <p className="py-3 text-xs text-[#9e9196]">Todavía no hay códigos.</p>}
          </div>
        </section>

        <section className={`${CARD} space-y-3`}>
          <h2 className="text-lg font-extrabold">Actividad reciente</h2>
          {actividad.length === 0 ? (
            <p className="text-xs text-[#9e9196]">Todavía no hay clips generados.</p>
          ) : (
            <div className="space-y-1.5 text-xs">
              {actividad.map((a, i) => (
                <div key={i} className="flex flex-wrap gap-x-4 border-t border-[#2b1e23] pt-1.5">
                  <span className="text-[#9e9196]">{fecha(a.t)}</span>
                  <span className="font-bold">{a.plan}</span>
                  <span className="font-mono">{a.codigo || `visitante ${a.dispositivo}`}</span>
                  <span>{a.detalle}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}