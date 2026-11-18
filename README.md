# Clips Limpieza — Editor de clips (GRATIS, sin código)

Editor de video para cortar, pegar y exportar clips en **4K a 60fps**,
listos para TikTok, YouTube Shorts, Reels y Facebook.

## Qué incluye esta versión (arreglada)

- **Gratis y sin código de acceso.** Se quitó la puerta de códigos
  (`proxy.ts` ya no pide sesión, `/acceso` redirige al editor).
  No necesitas Redis ni Upstash para usar la web.
- **Clips ilimitados.** Une todos los clips que quieras, sin límite.
- **Exportación en 4K a 60fps.** Vertical 2160x3840 (TikTok/Shorts),
  horizontal 3840x2160 (YouTube) y cuadrado 2160x2160. También hay
  1080p y 720p si lo prefieres.
- **Fondo difuminado arreglado.** En 9:16, la opción
  "Stream Completo + Fondo Difuminado" ahora sí funciona: el video
  completo va de fondo desenfocado y oscuro, y encima el video
  original centrado, sin recortar. También se ve en la vista previa.
- **Error yt-dlp en Vercel arreglado (v2).** Antes la web en Vercel
  fallaba con `spawn yt-dlp ENOENT` y luego con
  `python3: No such file or directory`, porque yt-dlp es un programa
  de Python y Vercel no tiene Python. Ahora en Vercel la descarga de
  YouTube se hace con JavaScript puro (`@distube/ytdl-core`, sin
  Python y sin ningún programa externo), y yt-dlp solo se usa en tu
  PC local, donde `yt-dlp.exe` ya existe junto al proyecto. En
  Vercel nunca se descarga ni se ejecuta yt-dlp.
- **Mejores momentos de verdad (v3).** El botón "⚡ Sacar mejores momentos"
  ya NO corta el video en trozos parejos con puntajes falsos (98, 97, 96).
  Ahora mide de verdad: energía del audio por segundo (picos = risa, gritos,
  música, voz fuerte), cuántas palabras se hablan por segundo (de los
  subtítulos) y cambios de escena (mucho movimiento). Cada ventana candidata
  recibe un puntaje real de 0 a 100 con su razón ("🔊 Pico de audio",
  "💬 Mucha conversación", "🎬 Mucho movimiento") y solo se devuelven las
  que pasan el umbral (55). Los tramos aburridos — silencio, sin conversación,
  imagen quieta — se ignoran por completo y la pantalla dice cuántos se
  ignoraron. Funciona para videos por enlace (`/api/extract`) y para archivos
  subidos (en el navegador, con respaldo en `/api/momentos-archivo`). En los
  directos, el auto-corte sigue corriendo y luego el botón "⚡ Ordenar por
  mejores momentos" puntúa cada clip guardado y pone los mejores primero,
  con filtro para esconder los aburridos.
  texto/marca de agua, logo, stickers, filtros visuales, potencia de
  voz, velocidad del video (0.5x–2x), formatos 9:16 / 1:1 / 16:9.
- **Tienda de música** (`/tienda`): página para vender la carpeta de
  música de DJ Trucho Hd. Los productos y precios son de ejemplo;
  hay que reemplazarlos con sus canciones reales.
- **Reproductor web** (`/musica`): escucha canciones con
  suscripción y sin anuncios. Trae 3 pistas DEMO (tonos de prueba)
  en `public/musica/` para que el reproductor funcione; reemplázalas
  con sus canciones reales y actualiza la lista en
  `app/musica/page.tsx`. La suscripción es solo la página de planes
  ("Próximamente"): **no hay pagos reales conectados**.

## Cómo correrlo en tu PC

```bash
npm install
npm run dev
```

Abre http://localhost:3000

- El editor está en `/editor`, la tienda en `/tienda` y el
  reproductor en `/musica`.
- Para los videos de enlaces en Vercel, el servidor los descarga
  con JavaScript puro (sin Python). En tu PC, si quieres, puedes
  poner `yt-dlp.exe` junto a `package.json` y se usará ahí.
- El servidor aparte `servidor-clips/server.mjs` es opcional
  (ya no lo usa el editor). Si lo corres, ya no exige Redis:
  `node servidor-clips/server.mjs`.

## Mejores momentos EN VIVO (v4) — todas las plataformas

El botón **"⚡ Sacar mejores momentos"** funciona también en directos
(YouTube, TikTok Live, Twitch, Kick, Facebook Live o cualquier .m3u8):

- Analiza los **últimos 3 minutos** del directo (ventana móvil) con el
  mismo puntuador de siempre: energía de audio, conversación y
  movimiento. Solo devuelve los tramos que pasan el umbral — lo callado
  o aburrido se ignora.
- Si el directo acaba de empezar y no hay audio suficiente ni para un
  clip, lo dice claro: *"El directo acaba de empezar: solo hay Xs de
  audio..."* — ya no dice "sin actividad" por un vivo sin historia.
- Cada momento se corta con **la misma referencia de siempre: 9:16 en
  4K a 60fps con fondo difuminado** (botón "⚡ Cortar 9:16 · 4K 60fps").
- El auto-corte en vivo sigue grabando y **cada clip guardado ya sale
  puntuado por el servidor** con su audio real, así el filtro "solo
  mejores" funciona sin pulsar nada.

Detalles técnicos: los segmentos HLS de un directo son `.ts` y el
ffmpeg-static del proyecto hace segfault leyéndolos, así que el análisis
en vivo usa un demuxer propio en JavaScript (mide el caudal de audio
por segundo). Twitch/Kick/Facebook Live no entregan HLS en Vercel sin
yt-dlp (no hay Python): ahí se dice claro y el contenedor local sigue
siendo la vía. El código de entrada se acepta si viene (`codigo` en el
cuerpo), pero no es obligatorio: el editor sigue siendo gratis.

## Cómo subirlo a Vercel

1. Sube esta carpeta a tu repositorio (sin `node_modules`, `.next`
   ni `.env.local`).
2. En Vercel, crea el proyecto desde ese repositorio.
3. No necesitas variables de entorno para el editor gratis.
4. Ojo: en Vercel los videos largos en 4K pueden tardar más que el
   límite de tiempo de las funciones sin servidor. Para renders
   pesados, usa el contenedor local (tu PC), que no tiene ese límite.

## Notas

- No hay pagos reales: ni la tienda ni la suscripción cobran nada.
- Los videos que subas se procesan con FFmpeg en tu equipo o en
  el servidor donde corra la app. Respeta los derechos de autor
  de los videos que pegues.

## Versión 7 — la carpeta "exportados" ya no rompe Vercel (18 nov 2026)

Fallo exacto encontrado en los Runtime Logs de Vercel (18 nov 15:46 y
15:47 AST, las dos pruebas de "Sacar mejores momentos"): POST
/api/live-auto devolvía 500 con "ENOENT: no such file or directory,
mkdir '/var/task/exportados'". El código hacía
`path.join(process.cwd(), "exportados")` y en Vercel el directorio del
código es DE SOLO LECTURA: solo se puede escribir en /tmp. En el PC
local funcionaba, en Vercel fallaba siempre. Además el editor mostraba
el mensaje genérico de la lista HLS y tapaba ese error real.

Qué cambió:
1. Nueva librería app/lib/ruta-exportados.ts: TODAS las escrituras del
   servidor pasan por ahí. En Vercel la carpeta es /tmp/exportados, en
   local sigue siendo ./exportados junto al proyecto. Afecta a
   /api/live-auto (arranque, auto-corte, subida por pantalla y descarga
   de clips), /api/render, /api/seguimiento, /api/cortar-momento-en-vivo
   y /api/publish, y al caché de Whisper en /api/transcribe (/tmp en
   Vercel). Ya no queda ningún `path.join(process.cwd(), "exportados")`
   directo en el código.
2. /api/live-auto ahora devuelve el error real en español (JSON) si no
   puede crear la carpeta, en vez de un 500 genérico.
3. El analizador en vivo (app/lib/momentos-en-vivo.ts) ya no dice el
   genérico "no entregó una lista HLS": dice el motivo real (HTTP 403,
   tiempo agotado, respuesta que no es una lista, enlace expirado).
   El editor también guarda el error real del auto-corte y lo muestra
   él si el análisis de momentos falla después.
4. Se quitaron los duplicados app/next.config.ts y app/.gitignore (el
   de la raíz es el que usa Next.js; eran idénticos).
5. Se mantiene la v6: lectura de YouTube por Invidious + vía desde el
   navegador, todas las plataformas, código de entrada opcional, 4K
   60fps, gratis sin código obligatorio, clips ilimitados, fondo
   difuminado, /tienda, /musica, sin yt-dlp ni Python en Vercel.

Límite honesto: en Vercel /tmp vive solo mientras exista la instancia
serverless; un clip guardado ahí se descarga o se lleva al Editor 9:16
en esa misma sesión. En local la carpeta "exportados" es permanente,
como siempre.

## Versión 6 — YouTube se lee aunque Vercel esté bloqueado (18 nov 2026)

Reproducido en vivo 18 nov 14:52 AST con t8HuqJeu6LE: pegar el enlace,
"Sacar mejores momentos", ~1 minuto analizando y luego "No se pudo leer
este enlace desde el servidor (sin duración ni URL de descarga)". El
reproductor de YouTube sí sonaba en el visor: solo fallaba la lectura
del servidor. Causa raíz: un enlace watch?v= de un directo NO se
detectaba como en vivo (el detector solo miraba la URL), y como getInfo
estaba bloqueado, el extracto lo trataba como video grabado de 0 s.

Qué cambió:
1. Vía alternativa en el servidor (app/lib/youtube-alternativo.ts):
   cuando getInfo falla, se prueba Invidious (instancia
   yt.chocolatemoo53.com, verificada para t8HuqJeu6LE en vivo y para
   dQw4w9WgXcQ grabado) y luego la página watch de YouTube. Ninguna usa
   InnerTube, así que YouTube no ve la IP de Vercel como bot. Devuelven
   título, si es en vivo, duración, HLS y URLs directas de audio/video.
2. Vía desde el navegador: si el servidor tampoco puede, el editor lo
   dice claro —"YouTube bloqueó la lectura desde el servidor de Vercel
   (verificación anti-bot). Probando otra vía desde tu navegador…"— y
   resuelve el video desde el navegador del usuario (su IP de casa no
   está bloqueada, Invidious tiene CORS). Las URLs directas que saca se
   mandan al servidor, que analiza el audio de Google Video (que no hace
   bot-check). Verificado: el extracto con esas URLs devuelve los
   mismos 6 momentos que el camino normal.
3. Los mensajes ya nombran a YouTube siempre que es YouTube quien
   bloquea; nunca más sale el genérico "no se pudo leer" sin decir por
   qué.

Verificado (servidor local, 18 nov): /api/extract con t8HuqJeu6LE da
en vivo + URL de descarga; /api/momentos-en-vivo con el HLS de Invidious
devuelve 2 momentos (puntajes 75 y 64) en 30 s; /api/extract con
dQw4w9WgXcQ devuelve 6 momentos (79-83) e ignora 8 tramos. npm run
build pasa.

Límite honesto: Invidious es una instancia pública y puede caerse o
cambiar; si eso pasa, la vía del navegador prueba otras instancias y,
si todo falla, queda el contenedor local (tu PC, con yt-dlp) o pegar la
URL HLS directa.

## Versión 5 — mejores momentos en vivo, de verdad (18 nov 2026)

Causa del error de la v4, verificada con el directo t8HuqJeu6LE ("La Familia
P. Luche MARATÓN"): DOS cosas a la vez.
1. En Vercel, YouTube bloquea la lectura con ytdl-core ("Sign in to confirm
   you're not a bot", BOT_CHECK en todos los clientes). El extracto caía en
   silencio a oEmbed y fingía un video grabado de 0 segundos sin momentos:
   de ahí el mensaje falso "Este video no tiene tramos con actividad
   suficiente". Ahora, cuando YouTube bloquea, la pantalla dice la verdad
   ("YouTube bloqueó la lectura... pega la URL HLS o usa el contenedor
   local") y nunca más sale el mensaje genérico sin haber analizado nada.
2. Aunque el HLS se resolviera, la v4 elegía la variante de video de menor
   ancho de banda, que en YouTube Live es SOLO VIDEO (itag 269, sin audio):
   el medidor no encontraba pista de audio y devolvía "no se pudo medir".
   El audio vive en la pista separada #EXT-X-MEDIA (itag 139). Ahora se usa
   esa pista primero. Verificado con un HLS sintético (fuerte 0-15 s,
   silencio 15-45 s, fuerte 45-60 s): devolvió exactamente los dos tramos
   fuertes (puntaje 92) e ignoró los 2 tramos callados.
Además: si pegas una URL .m3u8 directa, el editor va directo al analizador
en vivo sin pasar por el extracto; y cuando nada pasa el umbral, el mensaje
dice el mejor puntaje que hubo (p. ej. "mejor puntaje: 41 de 100, umbral 55").
Límite honesto: YouTube puede seguir bloqueando la lectura desde Vercel en
cualquier momento (es su verificación anti-bot, no un fallo de la app); en
ese caso el camino que siempre funciona es el contenedor local (tu PC, con
yt-dlp y tus cookies de navegador) o pegar la URL HLS directa.
