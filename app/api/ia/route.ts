import { NextRequest, NextResponse } from "next/server";
import { redis, COOKIE, Sesion } from "../../lib/acceso";

const LIMITE_DIARIO = 100;
const TIPOS_IMG = ["image/jpeg", "image/png", "image/webp", "image/gif"];

interface Resultado {
  modo: "ia" | "basico";
  ganchos: string[];
  titulo: string;
  descripcion: string;
  hashtags: string;
  textoPortada: string;
  guion: string;
  comentario: string;
  textosPantalla: string[];
  mejorMomento: string;
}

const STOP = new Set([
  "para", "como", "pero", "este", "esta", "estos", "estas", "todo", "todos", "sobre",
  "desde", "hasta", "donde", "quien", "cuando", "porque", "entre", "también", "solo",
  "tiene", "hacer", "puede", "muy", "sin", "con", "del", "los", "las", "una", "uno",
  "unos", "unas", "por", "que", "video", "esto", "eso", "ese", "esa", "pues", "bueno",
  "entonces", "ahora", "aquí", "así", "algo", "cada", "hay", "han", "fue", "son", "ser",
  "está", "están", "tengo", "tienen", "vamos", "vas", "voy", "más", "menos", "ya",
]);

const s = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

const lista = (v: unknown, n: number, max: number): string[] =>
  Array.isArray(v) ? v.map((x) => s(x, max)).filter(Boolean).slice(0, n) : [];

function limpiarHashtags(h: unknown): string {
  const arr = Array.isArray(h) ? h.map(String) : String(h || "").split(/[\s,]+/);
  const out: string[] = [];
  for (const t of arr) {
    const l = t
      .trim()
      .replace(/^#+/, "")
      .toLowerCase()
      .replace(/[^a-z0-9áéíóúñü_]/g, "");
    if (l && !out.includes(l)) out.push(l);
    if (out.length >= 10) break;
  }
  return out.map((x) => `#${x}`).join(" ");
}

function conCredito(descripcion: string, credito: string): string {
  if (!credito) return descripcion;
  return `${descripcion}\n\nCrédito del video original: ${credito}`.trim();
}

function normalizar(obj: any, modo: "ia" | "basico", credito: string): Resultado {
  return {
    modo,
    ganchos: lista(obj?.ganchos, 5, 140),
    titulo: s(obj?.titulo, 100),
    descripcion: conCredito(s(obj?.descripcion, 900), credito),
    hashtags: limpiarHashtags(obj?.hashtags),
    textoPortada: s(obj?.textoPortada, 60),
    guion: s(obj?.guion, 1800),
    comentario: s(obj?.comentario, 1200),
    textosPantalla: lista(obj?.textosPantalla, 6, 60),
    mejorMomento: s(obj?.mejorMomento, 200),
  };
}

function generarBasico(contexto: string, tituloOriginal: string, credito: string): Resultado {
  const base = (tituloOriginal || contexto).replace(/\s+/g, " ").trim();
  const frases = contexto
    .split(/(?<=[.!?¿¡])\s+|\n+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 15);
  const gancho = (frases[0] || base.slice(0, 80) || "Mira lo que pasó aquí").slice(0, 110);

  const conteo = new Map<string, number>();
  const palabras = (base + " " + contexto)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9ñ]+/)
    .filter((w) => w.length >= 5 && !STOP.has(w));
  for (const p of palabras) conteo.set(p, (conteo.get(p) || 0) + 1);
  const top = Array.from(conteo.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([w]) => w);

  const tema = base.slice(0, 60) || "este momento";
  return normalizar(
    {
      ganchos: [
        `¿Viste lo que pasó aquí? ${gancho}`,
        `Esto cambia todo: ${gancho}`,
        `Quédate hasta el final: ${tema}`,
      ],
      titulo: `¡No vas a creer esto! 😱 ${tema}`,
      descripcion: `${gancho}\n\n¿Qué opinas tú? Cuéntame en los comentarios 👇`,
      hashtags: [...top, "shorts", "viral", "parati", "fyp", "reels"],
      textoPortada: tema.split(" ").slice(0, 5).join(" "),
      guion:
        `0-3 s: ${gancho}\n` +
        `3-20 s: deja correr el mejor tramo del clip.\n` +
        `Final: pregunta al público qué opina y pídele que comente.`,
      comentario: `Mi opinión sobre esto: ${gancho} ¿Tú qué harías en su lugar?`,
      textosPantalla: ["¡MIRA ESTO! 👀", "NO LO ESPERABAS", "¿QUÉ OPINAS? 👇"],
      mejorMomento: gancho,
    },
    "basico",
    credito
  );
}

const SISTEMA = `Eres un editor experto en contenido viral en español para TikTok, YouTube Shorts y Reels.
Recibes la transcripción de un clip (o su contexto), y a veces una imagen de referencia, y creas el material para publicarlo.

Reglas:
- Basa todo SOLO en la transcripción, el contexto y la imagen. No inventes hechos, nombres, cifras ni citas.
- Si recibes una imagen de referencia, úsala: fíjate en lo que se ve (escena, objetos, expresiones, colores, texto visible) para el gancho, el texto de portada y los textos de pantalla. No identifiques a personas reales por su cara ni digas quiénes son. Si el usuario escribe quién aparece, puedes usar ese dato.
- El título y los ganchos deben generar curiosidad pero ser verdaderos: nada que prometa algo que el clip no muestra.
- El "comentario" es una opinión, análisis o contexto ORIGINAL que el creador dice por encima del clip, en primera persona. No copies frases de la transcripción: aporta algo nuevo.
- No hagas promesas de ganar dinero, curas médicas ni resultados garantizados.
- Escribe en español natural, directo, con energía acorde al tono pedido.

Responde SOLO con un objeto JSON válido, sin texto antes ni después ni bloques de código, con estas claves:
{
  "ganchos": [3 frases cortas para los primeros 3 segundos],
  "titulo": "título de máximo 90 caracteres, con 1-2 emojis",
  "descripcion": "descripción de 2-4 líneas con pregunta final para generar comentarios",
  "hashtags": [8 hashtags sin el símbolo #],
  "textoPortada": "máximo 6 palabras en mayúsculas",
  "guion": "plan del short con tiempos: gancho, desarrollo y cierre",
  "comentario": "texto original de narración o comentario del creador, ajustado a la duración pedida",
  "textosPantalla": [4 textos cortos de máximo 5 palabras para poner en pantalla],
  "mejorMomento": "frase o idea del clip donde conviene empezar"
}`;

function parsearImagen(v: unknown): { media_type: string; data: string } | null {
  const txt = String(v ?? "");
  if (!txt || txt.length > 5_500_000) return null;
  const m = txt.match(/^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=]+)$/i);
  if (!m) return null;
  const tipo = m[1].toLowerCase();
  if (!TIPOS_IMG.includes(tipo)) return null;
  return { media_type: tipo, data: m[2] };
}

async function sesionDe(req: NextRequest): Promise<Sesion | null> {
  const token = req.cookies.get(COOKIE)?.value;
  if (!token) return null;
  try {
    return await redis.get<Sesion>(`sesion:${token}`);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const contexto = String(body?.contexto || "").trim().slice(0, 12000);
    const tituloOriginal = String(body?.tituloOriginal || "").trim().slice(0, 200);
    const credito = String(body?.credito || "").trim().slice(0, 200);
    const plataforma = String(body?.plataforma || "todas");
    const tono = String(body?.tono || "energético");
    const duracion = Math.min(180, Math.max(10, Number(body?.duracion) || 30));
    const img = parsearImagen(body?.imagen);

    if (!contexto && !tituloOriginal && !img) {
      return NextResponse.json(
        { error: "Pon la transcripción, el título del clip o una foto de referencia." },
        { status: 400 }
      );
    }

    const key = (process.env.ANTHROPIC_API_KEY || "").trim();
    if (!key) {
      return NextResponse.json({
        ok: true,
        resultado: generarBasico(contexto, tituloOriginal, credito),
        aviso: img
          ? "Modo básico (sin IA): no hay ANTHROPIC_API_KEY en .env.local, así que la foto de referencia no se pudo analizar."
          : "Modo básico (sin IA): no hay ANTHROPIC_API_KEY en .env.local. Con la key, los textos salen mucho mejores.",
      });
    }

    // Límite diario para códigos de amigos (el dueño no tiene límite)
    const sesion = await sesionDe(req);
    if (sesion && !sesion.admin) {
      const hoy = new Date().toISOString().slice(0, 10);
      const clave = `ia:${sesion.codigo}:${hoy}`;
      const usos = await redis.incr(clave);
      if (usos === 1) await redis.expire(clave, 86400);
      if (usos > LIMITE_DIARIO) {
        return NextResponse.json(
          { error: `Llegaste al límite de ${LIMITE_DIARIO} generaciones de hoy. Vuelve mañana.` },
          { status: 429 }
        );
      }
    }

    const mensaje =
      `Plataforma: ${plataforma}\n` +
      `Tono: ${tono}\n` +
      `Duración objetivo del short: ${duracion} segundos\n` +
      `Título original del video: ${tituloOriginal || "(no indicado)"}\n\n` +
      `Transcripción o contexto del clip:\n${contexto || "(no hay transcripción)"}` +
      (img ? "\n\nTe adjunto una imagen de referencia del clip." : "");

    const contenido: any[] = [];
    if (img) {
      contenido.push({
        type: "image",
        source: { type: "base64", media_type: img.media_type, data: img.data },
      });
    }
    contenido.push({ type: "text", text: mensaje });

    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: (process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5").trim(),
          max_tokens: 1800,
          system: SISTEMA,
          messages: [{ role: "user", content: contenido }],
        }),
        signal: AbortSignal.timeout(60000),
      });

      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(data?.error?.message || `La API respondió ${r.status}`);
      }

      const texto: string = data?.content?.find((b: any) => b?.type === "text")?.text || "";
      const ini = texto.indexOf("{");
      const fin = texto.lastIndexOf("}");
      if (ini < 0 || fin <= ini) throw new Error("La IA no devolvió el formato esperado.");

      const obj = JSON.parse(texto.slice(ini, fin + 1));
      return NextResponse.json({ ok: true, resultado: normalizar(obj, "ia", credito) });
    } catch (e: any) {
      return NextResponse.json({
        ok: true,
        resultado: generarBasico(contexto, tituloOriginal, credito),
        aviso: `La IA falló (${e?.message || "error"}). Te di el modo básico para que no pierdas tiempo.`,
      });
    }
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Error generando el contenido." },
      { status: 500 }
    );
  }
}