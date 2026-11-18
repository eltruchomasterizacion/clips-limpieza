// Mejores momentos EN VIVO para TODAS las plataformas (YouTube, TikTok
// Live, Twitch, Kick, Facebook Live o cualquier .m3u8).
//
// Acepta la URL HLS que el editor YA resolvió para esa plataforma
// (body.streamUrl, la que devuelve /api/extract) o el enlace original
// (body.url) y resuelve el HLS de YouTube con JavaScript puro.
// NO usa yt-dlp ni Python en Vercel.
//
// COMPATIBILIDAD CON EL CÓDIGO DE ENTRADA: el editor es gratis y el código
// de entrada NO es obligatorio, pero si el cliente envía un `codigo` en el
// cuerpo, se acepta y se ignora sin error (no rompe a quien entra con
// código). Las rutas /acceso, /api/acceso y /api/licencia siguen
// funcionando igual que en la v3.
import { NextRequest, NextResponse } from "next/server";
import { esUrlYouTube, obtenerInfoVideo } from "../../lib/youtube-js";
import { analizarEnVivo } from "../../lib/momentos-en-vivo";

const detectarPlataforma = (url: string): string => {
  const u = url.toLowerCase();
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "YouTube";
  if (u.includes("tiktok.com")) return "TikTok";
  if (u.includes("twitch.tv")) return "Twitch";
  if (u.includes("kick.com")) return "Kick";
  if (u.includes("facebook.com") || u.includes("fb.watch")) return "Facebook";
  return "Streaming";
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    // `codigo` (código de entrada) se acepta si viene, pero no es obligatorio.
    const url = String(body?.url || "").trim();
    const streamUrlBody = String(body?.streamUrl || "").trim();
    const durClip = Math.min(300, Math.max(3, Number(body?.duracionClip) || 15));
    const cantidadRaw = body?.cantidadClips;
    const numCant = Number(cantidadRaw);
    const cantidad: number | "ilimitado" =
      cantidadRaw === "ilimitado" || numCant >= 100
        ? "ilimitado"
        : Math.max(1, numCant || 6);

    const plataforma = detectarPlataforma(url || streamUrlBody);

    // 1. Si el editor ya resolvió el HLS de esta plataforma, usarlo directo.
    let hlsUrl: string | null =
      streamUrlBody.includes(".m3u8") ? streamUrlBody : null;

    // 2. YouTube: resolver el manifiesto HLS con JavaScript puro.
    if (!hlsUrl && url && esUrlYouTube(url)) {
      try {
        const info = await obtenerInfoVideo(url);
        if (info.isLive && info.streamUrl?.includes(".m3u8")) {
          hlsUrl = info.streamUrl;
        } else if (info.isLive && info.streamUrl) {
          hlsUrl = info.streamUrl;
        }
      } catch (e: any) {
        return NextResponse.json(
          {
            ok: false,
            plataforma,
            error:
              e?.message ||
              "No se pudo leer este directo de YouTube (YouTube bloqueó la lectura). Prueba con otro enlace o usa el contenedor local.",
          },
          { status: 502 }
        );
      }
    }

    // 3. Sin HLS: en Vercel no hay yt-dlp para resolver Twitch/Kick/
    // Facebook Live. Se dice claro cuál plataforma es y por qué.
    if (!hlsUrl) {
      if (esUrlYouTube(url)) {
        return NextResponse.json(
          {
            ok: false,
            plataforma,
            error:
              "No se pudo leer este directo de YouTube desde este servidor (YouTube bloqueó la lectura, pide verificar que no eres un bot). En Vercel vuelve a intentarlo; si sigue igual, pega la URL HLS (.m3u8) del directo o usa el contenedor local, donde yt-dlp sí lo resuelve.",
            localFallback: true,
          },
          { status: 502 }
        );
      }
      const esDirectoConocido =
        plataforma === "Twitch" || plataforma === "Kick" || plataforma === "Facebook" || plataforma === "TikTok";
      return NextResponse.json(
        {
          ok: false,
          plataforma,
          error: esDirectoConocido
            ? `En Vercel no se puede leer el directo de ${plataforma} sin yt-dlp (no hay Python en el servidor). Usa el contenedor local (tu PC), donde yt-dlp sí resuelve este directo, o pega la URL HLS (.m3u8) directa si la tienes. El auto-corte en vivo sigue funcionando con "Capturar Pantalla en Vivo".`
            : "Este enlace no entregó una URL de directo (HLS) para analizar. Pega el enlace del directo o su URL .m3u8.",
          localFallback: true,
        },
        { status: 502 }
      );
    }

    const resultado = await analizarEnVivo(hlsUrl, durClip, cantidad);
    return NextResponse.json({
      ok: true,
      plataforma,
      ...resultado,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "No se pudo analizar el directo en vivo. Inténtalo de nuevo." },
      { status: 500 }
    );
  }
}
