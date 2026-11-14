Write-Host "=== DIAGNOSTICO CLIPS LIMPIEZA ===" -ForegroundColor Cyan

Write-Host "`n[1] Archivos" -ForegroundColor Cyan
$archivos = "lib\servidor.ts","app\api\licencia\route.ts","app\api\uso\route.ts","app\api\admin\route.ts","app\admin\page.tsx","app\editor\page.tsx","public\ffmpeg\ffmpeg.js","public\ffmpeg\ffmpeg-core.wasm"
foreach ($a in $archivos) {
  if (Test-Path $a) {
    $t = (Get-Item $a).Length
    if ($t -gt 0) { Write-Host "OK     $a ($t bytes)" -ForegroundColor Green }
    else { Write-Host "VACIO  $a  <- falta pegar el contenido" -ForegroundColor Red }
  } else { Write-Host "FALTA  $a" -ForegroundColor Red }
}

Write-Host "`n[2] Archivo .env.local" -ForegroundColor Cyan
$vars = @{}
if (-not (Test-Path ".env.local")) {
  if (Test-Path ".env.local.txt") { Write-Host "Se llama .env.local.txt y debe llamarse .env.local (sin .txt)" -ForegroundColor Red }
  else { Write-Host "No existe .env.local en esta carpeta: $((Get-Location).Path)" -ForegroundColor Red }
} else {
  Get-Content ".env.local" | ForEach-Object {
    if ($_ -match '^\s*([A-Z_]+)\s*=\s*(.*)\s*$') { $vars[$matches[1]] = $matches[2].Trim().Trim('"').Trim("'") }
  }
  foreach ($n in "UPSTASH_REDIS_REST_URL","UPSTASH_REDIS_REST_TOKEN","ADMIN_KEY") {
    if ($vars.ContainsKey($n) -and $vars[$n]) {
      $v = $vars[$n]
      $mostrar = if ($v.Length -gt 8) { $v.Substring(0,6) + "..." + " (" + $v.Length + " caracteres)" } else { "(muy corto: " + $v.Length + " caracteres)" }
      Write-Host "OK     $n = $mostrar" -ForegroundColor Green
    } else { Write-Host "FALTA  $n" -ForegroundColor Red }
  }
  if ($vars["UPSTASH_REDIS_REST_URL"] -and ($vars["UPSTASH_REDIS_REST_URL"] -notmatch '^https://')) {
    Write-Host "La URL debe empezar con https:// (la que termina en .upstash.io, no la de redis://)" -ForegroundColor Red
  }
}

Write-Host "`n[3] Conexion con Upstash" -ForegroundColor Cyan
if ($vars["UPSTASH_REDIS_REST_URL"] -and $vars["UPSTASH_REDIS_REST_TOKEN"]) {
  try {
    $r = Invoke-RestMethod -Uri $vars["UPSTASH_REDIS_REST_URL"].TrimEnd("/") -Method Post -Headers @{ Authorization = "Bearer " + $vars["UPSTASH_REDIS_REST_TOKEN"] } -Body '["PING"]' -ContentType "application/json"
    Write-Host "Upstash respondio: $($r.result)" -ForegroundColor Green
  } catch { Write-Host "Upstash NO responde: $($_.Exception.Message)" -ForegroundColor Red }
} else { Write-Host "No se puede probar: faltan datos en .env.local" -ForegroundColor Yellow }

Write-Host "`n[4] Servidor local (npm run dev)" -ForegroundColor Cyan
try {
  $l = Invoke-RestMethod -Uri "http://localhost:3000/api/licencia" -TimeoutSec 20
  Write-Host ("Respuesta de /api/licencia: " + ($l | ConvertTo-Json -Compress)) -ForegroundColor Green
} catch { Write-Host "/api/licencia fallo: $($_.Exception.Message)" -ForegroundColor Red }

Write-Host "`nListo. Copia todo lo que salio arriba y mandamelo." -ForegroundColor Cyan
