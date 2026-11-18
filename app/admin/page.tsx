"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface Reg {
  codigo: string;
  nota: string;
  maxDispositivos: number;
  dispositivos: string[];
  activo: boolean;
  creado: number;
  expira?: number | null;
}

const PRESETS: { dias: number; label: string }[] = [
  { dias: 0.5, label: "½ día" },
  { dias: 1, label: "1 día" },
  { dias: 3, label: "3 días" },
  { dias: 7, label: "7 días" },
  { dias: 30, label: "30 días" },
  { dias: 90, label: "90 días" },
  { dias: 180, label: "180 días" },
  { dias: 365, label: "1 año" },
];

const CAMPO =
  "w-full rounded-lg border border-[#2b1e23] bg-[#0b0709] px-3 py-2 text-xs text-white placeholder:text-[#6f6267] focus:border-[#f43f5e]/65 focus:outline-none";
const BTN_ROSA =
  "rounded-lg bg-[#f43f5e] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#e11d48] disabled:opacity-50";
const BTN_GRIS =
  "rounded-lg border border-[#2b1e23] bg-[#150e12] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#21161b]";

function textoRestante(expira?: number | null): { texto: string; vencido: boolean } {
  if (typeof expira !== "number") return { texto: "sin vencimiento", vencido: false };
  const ms = expira - Date.now();
  if (ms <= 0) return { texto: "VENCIDO", vencido: true };
  const horas = ms / 3600000;
  if (horas < 24) return { texto: `vence en ${Math.max(1, Math.round(horas))} h`, vencido: false };
  return { texto: `vence en ${Math.ceil(horas / 24)} días`, vencido: false };
}

function fechaCorta(ms?: number | null): string {
  if (typeof ms !== "number") return "";
  return new Date(ms).toLocaleString("es", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PaginaAdmin() {
  const [lista, setLista] = useState<Reg[]>([]);
  const [nota, setNota] = useState("");
  const [maxDisp, setMaxDisp] = useState(1);
  const [dias, setDias] = useState<number>(30);
  const [msg, setMsg] = useState("");

  const llamar = useCallback(async (body: any) => {
    const r = await fetch("/api/acceso", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { ok: r.ok, data: await r.json().catch(() => ({})) };
  }, []);

  const cargar = useCallback(async () => {
    const { ok, data } = await llamar({ action: "listar" });
    if (ok) setLista(data.codigos || []);
    else setMsg(data.error || "No se pudo cargar.");
  }, [llamar]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const crear = async () => {
    const { ok, data } = await llamar({
      action: "crear",
      nota,
      maxDispositivos: maxDisp,
      dias,
    });
    if (ok) {
      setMsg(`✅ Código creado: ${data.codigo} · vence ${fechaCorta(data.expira)}`);
      try {
        await navigator.clipboard.writeText(data.codigo);
        setMsg(`✅ Código creado y copiado: ${data.codigo} · vence ${fechaCorta(data.expira)}`);
      } catch {
        // Ignorar
      }
      setNota("");
      cargar();
    } else {
      setMsg(data.error || "No se pudo crear.");
    }
  };

  const accion = async (body: any) => {
    await llamar(body);
    cargar();
  };

  const salir = async () => {
    await llamar({ action: "logout" });
    window.location.href = "/acceso";
  };

  return (
    <div className="min-h-screen bg-[#07050a] px-4 py-8 text-[#f5f0f2]">
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#f43f5e]">
              ● PANEL DEL DUEÑO
            </p>
            <h1 className="text-2xl font-black">Códigos de acceso</h1>
          </div>
          <div className="flex gap-2">
            <Link href="/editor" className={BTN_GRIS}>
              Ir al editor
            </Link>
            <button onClick={salir} className={BTN_GRIS}>
              Salir
            </button>
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border border-[#2a1c22] bg-[#150d11]/90 p-4">
          <div className="grid gap-2 sm:grid-cols-3">
            <input
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Para quién es (ej. Juan)"
              className={`${CAMPO} sm:col-span-2`}
            />
            <select
              value={maxDisp}
              onChange={(e) => setMaxDisp(Number(e.target.value))}
              className={CAMPO}
            >
              <option value={1}>1 dispositivo</option>
              <option value={2}>2 dispositivos</option>
              <option value={3}>3 dispositivos</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold text-white">
              Duración del código (de ½ día hasta 365 días):
            </label>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.dias}
                  type="button"
                  onClick={() => setDias(p.dias)}
                  className={`rounded px-2.5 py-1 text-[11px] font-bold ${
                    dias === p.dias ? "bg-[#f43f5e] text-white" : "bg-[#1a1115] text-[#c7bcc0]"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0.5}
                max={365}
                step={0.5}
                value={dias}
                onChange={(e) =>
                  setDias(Math.min(365, Math.max(0.5, Number(e.target.value) || 0.5)))
                }
                className={`${CAMPO} max-w-[120px]`}
              />
              <span className="text-[11px] text-[#9e9196]">
                días (cuenta desde que creas el código)
              </span>
            </div>
          </div>

          <button onClick={crear} className={BTN_ROSA}>
            + Crear código nuevo
          </button>
          {msg && <p className="text-xs font-semibold text-emerald-400">{msg}</p>}
        </div>

        <div className="space-y-2">
          {lista.length === 0 ? (
            <p className="text-xs text-[#9e9196]">Aún no has creado códigos.</p>
          ) : (
            lista.map((r) => {
              const rest = textoRestante(r.expira);
              return (
                <div
                  key={r.codigo}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#2b1e23] bg-[#0b0709] p-3"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-black text-white">{r.codigo}</p>
                    <p className="text-[11px] text-[#9e9196]">
                      {r.nota || "Sin nombre"} · {r.dispositivos.length}/{r.maxDispositivos}{" "}
                      dispositivos ·{" "}
                      <span className={r.activo ? "text-emerald-400" : "text-red-400"}>
                        {r.activo ? "activo" : "desactivado"}
                      </span>
                    </p>
                    <p
                      className={`text-[11px] font-bold ${
                        rest.vencido ? "text-red-400" : "text-amber-400"
                      }`}
                    >
                      {rest.texto}
                      {typeof r.expira === "number" ? ` · ${fechaCorta(r.expira)}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => accion({ action: "extender", codigo: r.codigo, dias: 7 })}
                      className={BTN_GRIS}
                    >
                      +7 días
                    </button>
                    <button
                      onClick={() => accion({ action: "extender", codigo: r.codigo, dias: 30 })}
                      className={BTN_GRIS}
                    >
                      +30 días
                    </button>
                    <button
                      onClick={() =>
                        accion({ action: "activar", codigo: r.codigo, activo: !r.activo })
                      }
                      className={BTN_GRIS}
                    >
                      {r.activo ? "Desactivar" : "Activar"}
                    </button>
                    <button
                      onClick={() => accion({ action: "reiniciar", codigo: r.codigo })}
                      className={BTN_GRIS}
                    >
                      Reiniciar dispositivos
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`¿Borrar el código ${r.codigo}?`)) {
                          accion({ action: "borrar", codigo: r.codigo });
                        }
                      }}
                      className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-1.5 text-[11px] font-bold text-red-300"
                    >
                      Borrar
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}