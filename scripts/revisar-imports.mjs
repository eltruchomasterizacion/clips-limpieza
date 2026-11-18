import { copyFileSync, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep, basename } from "node:path";

const RAIZ = process.cwd();
const INICIO = process.argv[2] || "app/editor/page.tsx";
const EXT = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", "/index.ts", "/index.tsx"];

const listar = (dir) => {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
};

// Busca un archivo respetando mayusculas (en Vercel/Linux importan)
const buscarExacto = (abs) => {
  const partes = relative(RAIZ, abs).split(sep).filter(Boolean);
  let actual = RAIZ;
  let mayus = false;
  for (const p of partes) {
    const lista = listar(actual);
    if (lista.includes(p)) {
      actual = join(actual, p);
      continue;
    }
    const alt = lista.find((x) => x.toLowerCase() === p.toLowerCase());
    if (!alt) return null;
    mayus = true;
    actual = join(actual, alt);
  }
  return { ruta: actual, mayus };
};

const resolver = (desde, especificador) => {
  const base = resolve(dirname(desde), especificador);
  let ajustado = null;
  for (const e of EXT) {
    const r = buscarExacto(base + e);
    if (r && statSync(r.ruta).isFile()) {
      if (!r.mayus) return { ruta: r.ruta, mayus: false };
      ajustado = ajustado ?? r;
    }
  }
  return ajustado;
};

const leerImports = (archivo) => {
  const texto = readFileSync(archivo, "utf8");
  const lista = [];
  const re = /import\s+(type\s+)?([\s\S]*?)\s+from\s+["'](\.{1,2}\/[^"']+)["']/g;
  let m;
  while ((m = re.exec(texto)) !== null) {
    const cuerpo = m[2];
    const nombres = [];
    const llaves = cuerpo.match(/\{([\s\S]*?)\}/);
    if (llaves) {
      for (const parte of llaves[1].split(",")) {
        const n = parte.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim();
        if (n) nombres.push(n);
      }
    }
    const porDefecto = cuerpo.replace(/\{[\s\S]*?\}/, "").replace(/,/g, "").trim();
    lista.push({ especificador: m[3], nombres, porDefecto: porDefecto || null });
  }
  return lista;
};

const todosLosArchivos = (dir, acumulado = []) => {
  for (const n of listar(dir)) {
    if (["node_modules", ".next", ".git", "exportados"].includes(n)) continue;
    const ruta = join(dir, n);
    const st = statSync(ruta);
    if (st.isDirectory()) todosLosArchivos(ruta, acumulado);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(n)) acumulado.push(ruta);
  }
  return acumulado;
};

const exportaNombre = (texto, nombre) => {
  const a = new RegExp("export\\s+(?:default\\s+)?(?:async\\s+)?(?:function|const|let|class|type|interface|enum)\\s+" + nombre + "\\b");
  const b = new RegExp("export\\s*\\{[^}]*\\b" + nombre + "\\b[^}]*\\}");
  return a.test(texto) || b.test(texto);
};

const buscarCandidato = (imp, archivos) => {
  if (imp.nombres.length > 0) {
    const coinciden = archivos.filter((f) => {
      const t = readFileSync(f, "utf8");
      return imp.nombres.every((n) => exportaNombre(t, n));
    });
    if (coinciden.length === 1) return coinciden[0];
  }
  const quiero = basename(imp.especificador).toLowerCase();
  const mismoNombre = archivos.filter((f) => basename(f).replace(/\.[^.]+$/, "").toLowerCase() === quiero);
  if (mismoNombre.length === 1) return mismoNombre[0];
  return null;
};

const revisar = (inicio) => {
  const pendientes = [resolve(RAIZ, inicio)];
  const vistos = new Set();
  const faltan = [];
  const mayusculas = [];
  while (pendientes.length > 0) {
    const archivo = pendientes.pop();
    if (vistos.has(archivo)) continue;
    vistos.add(archivo);
    for (const imp of leerImports(archivo)) {
      const r = resolver(archivo, imp.especificador);
      if (!r) {
        faltan.push({ desde: archivo, imp });
        continue;
      }
      if (r.mayus) mayusculas.push({ desde: archivo, imp, real: r.ruta });
      if (/\.(ts|tsx|js|jsx|mjs)$/.test(r.ruta)) pendientes.push(r.ruta);
    }
  }
  return { faltan, mayusculas };
};

const rel = (p) => relative(RAIZ, p);

if (!existsSync(resolve(RAIZ, INICIO))) {
  console.log("No encuentro " + INICIO + ". Corre esto desde la carpeta clips-limpieza.");
  process.exit(1);
}

console.log("Revisando las rutas de " + INICIO + " ...\n");
let { faltan, mayusculas } = revisar(INICIO);

if (faltan.length > 0) {
  const archivos = todosLosArchivos(join(RAIZ, "app"));
  for (const f of faltan) {
    const destino = resolve(dirname(f.desde), f.imp.especificador) + (/\.(ts|tsx)$/.test(f.imp.especificador) ? "" : (f.imp.nombres.length === 0 && f.imp.porDefecto ? ".tsx" : ".ts"));
    const origen = buscarCandidato(f.imp, archivos);
    if (origen && !existsSync(destino)) {
      copyFileSync(origen, destino);
      console.log("ARREGLADO  " + rel(f.desde) + " pedia " + f.imp.especificador);
      console.log("           copie " + rel(origen) + "  ->  " + rel(destino) + "\n");
    }
  }
  ({ faltan, mayusculas } = revisar(INICIO));
}

if (faltan.length === 0) console.log("OK  todas las rutas existen.");
for (const f of faltan) {
  console.log("FALTA  " + rel(f.desde) + " importa " + f.imp.especificador);
  const archivos = todosLosArchivos(join(RAIZ, "app"));
  const q = basename(f.imp.especificador).toLowerCase();
  const parecidos = archivos.filter((a) => basename(a).toLowerCase().includes(q.slice(0, 5)));
  if (parecidos.length) console.log("       archivos parecidos: " + parecidos.map(rel).join(" | "));
}
for (const m of mayusculas) {
  console.log("MAYUSCULAS  " + rel(m.desde) + " importa " + m.imp.especificador + " pero el archivo real es " + rel(m.real));
  console.log("            Funciona en Windows pero FALLA en Vercel. Corrige la ruta en el import.");
}
console.log("\nListo.");
