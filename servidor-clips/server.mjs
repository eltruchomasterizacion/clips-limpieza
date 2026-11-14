import http from "node:http";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, createReadStream } from "node:fs";
import { randomBytes, createHash, createHmac, timingSafeEqual } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");
const PUERTO = Number(process.env.PORT) || 4000;
const MAX_SEG = 600;
const MAX_TRABAJOS = 2;
const CARPETA = join(AQUI, "temp");
const ARCHIVO_CLAVE = join(AQUI, "clave.txt");

// Paginas que pueden pedir videos a este servidor
const ORIGENES = ["https://clips-limpieza.vercel.app", "http://localhost:3000"];

const DOMINIOS = [
  "youtube.com", "youtu.be", "kick.com", "twitch.tv",
  "tiktok.com", "instagram.com", "facebook.com", "fb.watch",
];

// ---------- Datos de Upstash (de .env.local) ----------
const env = {};
const archivoEnv = join(RAIZ, ".env.local");
if (existsSync(archivoEnv)) {
  for (const linea of readFileSync(archivoEnv, "utf8").split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const URL_REDIS = (env.UPSTASH_REDIS_REST_URL ?? "").replace(/\/$/, "");
const TOKEN_REDIS = env.UPSTASH_REDIS_REST_TOKEN ?? "";
if (!URL_REDIS || !TOKEN_REDIS) {
  console.error("Faltan UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN en .env.local");
  process.exit(1);
}
const LLAVE = createHash("sha256").update("enlaces:" + TOKEN_REDIS).digest();

const redisCmd = async (cmd) => {
  const r = await fetch(URL_REDIS, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN_REDIS}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const d = await r.json();
  if (d.error) throw new Error(String(d.error));
  return d.result;
};

// ---------- Clave local (solo para /salud) ----------
if (!existsSync(ARCHIVO_CLAVE)) writeFileSync(ARCHIVO_CLAVE, randomBytes(24).toString("hex"));
const CLAVE_LOCAL = readFileSync(ARCHIVO_CLAVE, "utf8").trim();

rmSync(CARPETA, { recursive: true, force: true });
mkdirSync(CARPETA, { recursive: true });

const igual = (a, b) =>
  timingSafeEqual(createHash("sha256").update(String(a)).digest(), createHash("sha256").update(String(b)).digest());

const urlPermitida = (txt) => {
  try {
    const u = new URL(String(txt));
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const host = u.hostname.toLowerCase();
    return DOMINIOS.some((d) => host === d || host.endsWith("." + d)) ? u.toString() : null;
  } catch {
    return null;
  }
};

const verificarToken = (txt) => {
  try {
    const [b64, firma] = String(txt ?? "").split(".");
    if (!b64 || !firma) return null;
    const esperada = createHmac("sha256", LLAVE).update(b64).digest("hex");
    if (firma.length !== esperada.length) return null;
    if (!timingSafeEqual(Buffer.from(firma), Buffer.from(esperada))) return null;
    const p = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
    if (!p || typeof p.e !== "number" || p.e < Date.now()) return null;
    return { p, firma };
  } catch {
    return null;
  }
};

const ejecutar = (cmd, args, tiempoMs = 120000) =>
  new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true });
    let salida = "";
    let errores = "";
    const reloj = setTimeout(() => {
      p.kill("SIGKILL");
      reject(new Error("Tiempo agotado"));
    }, tiempoMs);
    p.stdout.on("data", (d) => (salida += d));
    p.stderr.on("data", (d) => {
      errores += d;
      if (errores.length > 20000) errores = errores.slice(-20000);
    });
    p.on("error", (e) => {
      clearTimeout(reloj);
      reject(new Error(`No se pudo ejecutar ${cmd}: ${e.message}`));
    });
    p.on("close", (codigo) => {
      clearTimeout(reloj);
      if (codigo === 0) return resolve(salida);
      const resumen = errores.trim().split("\n").slice(-3).join(" | ");
      reject(new Error(resumen || `${cmd} termino con codigo ${codigo}`));
    });
  });

const json = (res, estado, cuerpo) => {
  res.writeHead(estado, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(cuerpo));
};

// ---------- Trabajos de descarga ----------
const trabajos = new Map();
const tokensUsados = new Set();

setInterval(() => {
  const ahora = Date.now();
  for (const [id, t] of trabajos) {
    if (ahora - t.creado > 20 * 60 * 1000) {
      rmSync(t.archivo, { force: true });
      trabajos.delete(id);
    }
  }
}, 60000);

const activos = () => [...trabajos.values()].filter((t) => t.estado === "descargando").length;

const iniciarTrabajo = (p, firma) => {
  const id = randomBytes(8).toString("hex");
  const archivo = join(CARPETA, `${id}.mp4`);
  const t = { estado: "descargando", archivo, error: "", firma, creado: Date.now() };
  trabajos.set(id, t);

  (async () => {
    try {
      const info = JSON.parse(await ejecutar("yt-dlp", ["--no-playlist", "--no-warnings", "-J", "--", p.u], 60000));
      if (info.is_live) throw new Error("Este enlace es un directo en curso. Usa un video ya publicado.");
      if (info.duration && p.i >= info.duration) throw new Error("El inicio es mayor que la duracion del video.");
      await ejecutar(
        "yt-dlp",
        [
          "--no-playlist", "--no-warnings",
          "-f", "bv*+ba/b",
          "-S", "res:1080,ext:mp4:m4a",
          "--merge-output-format", "mp4",
          "--download-sections", `*${p.i}-${p.f}`,
          "--force-keyframes-at-cuts",
          "-o", join(CARPETA, `${id}.%(ext)s`),
          "--", p.u,
        ],
        900000
      );
      if (!existsSync(archivo)) throw new Error("No se genero el archivo");
      t.estado = "listo";
    } catch (e) {
      t.estado = "error";
      t.error = String(e.message).slice(0, 300);
      rmSync(archivo, { force: true });
    }
  })();

  return id;
};

// ---------- Servidor web ----------
const servidor = http.createServer(async (req, res) => {
  try {
    const origen = req.headers.origin ?? "";
    if (ORIGENES.includes(origen)) {
      res.setHeader("Access-Control-Allow-Origin", origen);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "content-type, x-token, x-server-key");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }

    const ruta = (req.url ?? "").split("?")[0];
    const consulta = new URL(req.url ?? "/", "http://x").searchParams;

    if (req.method === "GET" && ruta === "/salud") {
      if (!igual(req.headers["x-server-key"] ?? "", CLAVE_LOCAL)) return json(res, 401, { error: "Clave incorrecta" });
      const ytdlp = (await ejecutar("yt-dlp", ["--version"], 20000)).trim();
      const ffmpeg = (await ejecutar("ffmpeg", ["-version"], 20000)).split("\n")[0];
      return json(res, 200, { ok: true, ytdlp, ffmpeg, trabajos: activos() });
    }

    const tk = verificarToken(req.headers["x-token"]);
    if (!tk) return json(res, 401, { error: "Autorizacion no valida o vencida" });

    if (req.method === "POST" && ruta === "/trabajo") {
      const p = tk.p;
      if (!urlPermitida(p.u)) return json(res, 400, { error: "Enlace no permitido" });
      if (!Number.isFinite(p.i) || !Number.isFinite(p.f) || p.i < 0 || p.f <= p.i) {
        return json(res, 400, { error: "Tiempos no validos" });
      }
      if (p.f - p.i > MAX_SEG) return json(res, 400, { error: `El tramo maximo es de ${MAX_SEG} segundos` });
      if (tokensUsados.has(tk.firma)) return json(res, 409, { error: "Esta autorizacion ya se uso. Vuelve a intentarlo." });
      if (activos() >= MAX_TRABAJOS) return json(res, 429, { error: "El servidor esta ocupado. Intenta en un minuto." });
      tokensUsados.add(tk.firma);
      return json(res, 200, { id: iniciarTrabajo(p, tk.firma) });
    }

    const id = consulta.get("id") ?? "";
    const t = trabajos.get(id);
    if (!t || t.firma !== tk.firma) return json(res, 404, { error: "Trabajo no encontrado" });

    if (req.method === "GET" && ruta === "/estado") {
      return json(res, 200, { estado: t.estado, error: t.error });
    }

    if (req.method === "GET" && ruta === "/archivo") {
      if (t.estado !== "listo" || !existsSync(t.archivo)) return json(res, 409, { error: "El video todavia no esta listo" });
      res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": statSync(t.archivo).size });
      const lectura = createReadStream(t.archivo);
      lectura.on("close", () => {
        rmSync(t.archivo, { force: true });
        trabajos.delete(id);
      });
      res.on("close", () => lectura.destroy());
      return lectura.pipe(res);
    }

    return json(res, 404, { error: "No existe" });
  } catch (e) {
    return json(res, 500, { error: String(e.message).slice(0, 300) });
  }
});

// ---------- Tunel publico de Cloudflare ----------
let tunel = null;
let urlPublica = "";

const registrar = async () => {
  try {
    await redisCmd(["SET", "srv:url", urlPublica, "EX", 120]);
  } catch (e) {
    console.log("No se pudo avisar a Upstash:", e.message);
  }
};

const iniciarTunel = () => {
  const candidatos = [
    join(process.env.LOCALAPPDATA ?? "", "Microsoft", "WinGet", "Links", "cloudflared.exe"),
    "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe",
    "C:\\Program Files\\cloudflared\\cloudflared.exe",
  ];
  const exe = candidatos.find((c) => existsSync(c)) ?? "cloudflared";

  tunel = spawn(exe, ["tunnel", "--url", `http://127.0.0.1:${PUERTO}`, "--no-autoupdate"], { windowsHide: true });
  tunel.on("error", () => {
    console.log("No encontre cloudflared. Instalalo con: winget install --id Cloudflare.cloudflared -e");
    console.log("El servidor sigue activo, pero sin direccion publica.");
  });

  const alSalida = (d) => {
    const m = String(d).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m && !urlPublica) {
      urlPublica = m[0];
      console.log("Tunel publico:", urlPublica);
      registrar().then(() => console.log("Direccion registrada. La web ya ve el servidor en linea."));
      setInterval(registrar, 40000);
    }
  };
  tunel.stdout.on("data", alSalida);
  tunel.stderr.on("data", alSalida);
  tunel.on("close", () => console.log("El tunel se cerro."));
};

const apagar = async () => {
  try {
    await redisCmd(["DEL", "srv:url"]);
  } catch {
    /* sin conexion */
  }
  tunel?.kill();
  process.exit(0);
};
process.on("SIGINT", apagar);
process.on("SIGTERM", apagar);
process.on("exit", () => tunel?.kill());

servidor.listen(PUERTO, "127.0.0.1", () => {
  console.log(`Servidor de clips listo en http://127.0.0.1:${PUERTO}`);
  iniciarTunel();
});
