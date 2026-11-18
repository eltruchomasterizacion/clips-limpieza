import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { dirExportados } from "../../lib/ruta-exportados";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const action = String(form.get("action") || "open_folder");
    const savedPathRaw = String(form.get("savedPath") || "");
    const savedPath = savedPathRaw ? decodeURIComponent(savedPathRaw) : "";

    // Acción 1: Abrir Windows Explorer con el archivo exacto seleccionado
    if (action === "open_folder") {
      // V7: en Vercel la carpeta es /tmp/exportados, en local ./exportados.
      const exportDir = dirExportados();
      let target = savedPath;

      if (!target || !fs.existsSync(target)) {
        if (fs.existsSync(exportDir)) {
          const files = (await fs.promises.readdir(exportDir))
            .filter((f) => f.endsWith(".mp4"))
            .map((f) => ({
              full: path.join(exportDir, f),
              mtime: fs.statSync(path.join(exportDir, f)).mtimeMs,
            }))
            .sort((a, b) => b.mtime - a.mtime);
          if (files[0]) target = files[0].full;
        }
      }

      if (process.platform === "win32" && target && fs.existsSync(target)) {
        execFile("explorer.exe", [`/select,${target}`], { windowsHide: false });
      }

      return NextResponse.json({
        ok: true,
        path: target || exportDir,
        message: "Carpeta abierta con el video listo seleccionado.",
      });
    }

    // Acción 2: Subida directa vía API oficial de la plataforma
    const plataforma = String(form.get("plataforma") || "");
    const titulo = String(form.get("titulo") || "Short Viral");
    const hashtags = String(form.get("hashtags") || "#shorts #viral");
    const token = String(form.get("token") || "").trim();
    const pageId = String(form.get("pageId") || "").trim();
    const videoFile = form.get("video");

    if (!token) {
      return NextResponse.json(
        {
          error: `Falta el Token API de ${plataforma}. Haz clic en "🔑 Conectar Mis Cuentas" para pegarlo o usa "📂 Abrir Video en Carpeta".`,
        },
        { status: 400 }
      );
    }

    let videoBuffer: Buffer | null = null;
    if (videoFile instanceof File && videoFile.size > 0) {
      videoBuffer = Buffer.from(await videoFile.arrayBuffer());
    } else if (savedPath && fs.existsSync(savedPath)) {
      videoBuffer = await fs.promises.readFile(savedPath);
    }

    if (!videoBuffer) {
      return NextResponse.json({ error: "No se encontró el archivo MP4 para subir." }, { status: 400 });
    }

    const descripcionCompleta = `${titulo}\n\n${hashtags}`;

    // ── YOUTUBE DATA API v3 (Sube el MP4 + Título + Hashtags directo a Shorts) ──
    if (plataforma === "youtube") {
      const boundary = `-------ClipsLimpieza${Date.now()}`;
      const metadata = JSON.stringify({
        snippet: {
          title: `${titulo} #Shorts`.slice(0, 100),
          description: descripcionCompleta,
          tags: hashtags
            .split(/\s+/)
            .map((t) => t.replace(/^#/, ""))
            .filter(Boolean),
          categoryId: "24",
        },
        status: {
          privacyStatus: "public",
          selfDeclaredMadeForKids: false,
        },
      });

      const pre = Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`,
        "utf8"
      );
      const post = Buffer.from(`\r\n--${boundary}--`, "utf8");
      const multipartBody = Buffer.concat([pre, videoBuffer, post]);

      const ytRes = await fetch(
        "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": `multipart/related; boundary=${boundary}`,
            "Content-Length": String(multipartBody.byteLength),
          },
          body: multipartBody,
        }
      );

      const ytJson = await ytRes.json();
      if (!ytRes.ok) {
        return NextResponse.json(
          { error: ytJson?.error?.message || "Error subiendo a YouTube API." },
          { status: 400 }
        );
      }

      return NextResponse.json({
        ok: true,
        url: `https://youtube.com/shorts/${ytJson.id}`,
        message: "¡Publicado directamente en YouTube Shorts!",
      });
    }

    // ── TIKTOK CONTENT POSTING API (Envía el MP4 + Título directo a TikTok) ──
    if (plataforma === "tiktok") {
      const initRes = await fetch(
        "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json; charset=UTF-8",
          },
          body: JSON.stringify({
            source_info: {
              source: "FILE_UPLOAD",
              video_size: videoBuffer.byteLength,
              chunk_size: videoBuffer.byteLength,
              total_chunk_count: 1,
            },
          }),
        }
      );

      const initJson = await initRes.json();
      const uploadUrl = initJson?.data?.upload_url;
      if (!initRes.ok || !uploadUrl) {
        return NextResponse.json(
          { error: initJson?.error?.message || "Error iniciando subida en TikTok API." },
          { status: 400 }
        );
      }

      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "video/mp4",
          "Content-Range": `bytes 0-${videoBuffer.byteLength - 1}/${videoBuffer.byteLength}`,
        },
        body: new Uint8Array(videoBuffer),
      });

      if (!putRes.ok) {
        return NextResponse.json({ error: "Error transfiriendo el MP4 a TikTok." }, { status: 400 });
      }

      return NextResponse.json({
        ok: true,
        message: "¡Video enviado directamente a tu bandeja de TikTok Studio listo para publicar!",
      });
    }

    // ── FACEBOOK REELS GRAPH API ──
    if (plataforma === "facebook") {
      if (!pageId) {
        return NextResponse.json(
          { error: "Falta el ID de tu Página de Facebook en 'Conectar Mis Cuentas'." },
          { status: 400 }
        );
      }

      const startRes = await fetch(
        `https://graph.facebook.com/v21.0/${pageId}/video_reels?upload_phase=start&access_token=${encodeURIComponent(
          token
        )}`,
        { method: "POST" }
      );
      const startJson = await startRes.json();
      if (!startRes.ok || !startJson.video_id) {
        return NextResponse.json(
          { error: startJson?.error?.message || "Error iniciando Facebook Reel." },
          { status: 400 }
        );
      }

      const upRes = await fetch(startJson.upload_url, {
        method: "POST",
        headers: {
          Authorization: `OAuth ${token}`,
          offset: "0",
          file_size: String(videoBuffer.byteLength),
          "Content-Type": "application/octet-stream",
        },
        body: new Uint8Array(videoBuffer),
      });

      if (!upRes.ok) {
        return NextResponse.json({ error: "Error subiendo binario a Facebook Reels." }, { status: 400 });
      }

      const finRes = await fetch(
        `https://graph.facebook.com/v21.0/${pageId}/video_reels?upload_phase=finish&video_id=${
          startJson.video_id
        }&video_state=PUBLISHED&description=${encodeURIComponent(
          descripcionCompleta
        )}&access_token=${encodeURIComponent(token)}`,
        { method: "POST" }
      );
      const finJson = await finRes.json();
      if (!finRes.ok) {
        return NextResponse.json(
          { error: finJson?.error?.message || "Error publicando Facebook Reel." },
          { status: 400 }
        );
      }

      return NextResponse.json({
        ok: true,
        message: "¡Reel publicado directamente en tu Página de Facebook!",
      });
    }

    return NextResponse.json({ error: "Plataforma no soportada." }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Error procesando la subida." },
      { status: 500 }
    );
  }
}