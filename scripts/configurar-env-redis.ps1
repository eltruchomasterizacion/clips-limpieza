Write-Host "=== Configurar .env.local desde la linea de Upstash ===" -ForegroundColor Cyan

$linea = (Read-Host "1) Pega la linea completa que copiaste (la de redis-cli)").Trim()
if ($linea -notmatch 'redis://default:([^@\s]+)@([^:\s/]+)') {
  Write-Host "No reconoci esa linea. Debe contener redis://default:...@...upstash.io" -ForegroundColor Red
  exit 1
}
$token = $matches[1]
$url = "https://" + $matches[2]

$admin = (Read-Host "2) Inventa tu ADMIN_KEY (clave maestra, minimo 12 caracteres)").Trim()
if ($admin.Length -lt 12) { Write-Host "La ADMIN_KEY debe tener al menos 12 caracteres." -ForegroundColor Red; exit 1 }
if ($admin -eq $token) { Write-Host "La ADMIN_KEY debe ser distinta al token." -ForegroundColor Red; exit 1 }

Write-Host "`nProbando conexion con $url ..." -ForegroundColor Cyan
try {
  $r = Invoke-RestMethod -Uri "$url/ping" -Headers @{ Authorization = "Bearer $token" } -TimeoutSec 20
  if ($r.result -ne "PONG") { throw "Respuesta inesperada: $($r | ConvertTo-Json -Compress)" }
  Write-Host "Upstash respondio: PONG" -ForegroundColor Green
} catch {
  Write-Host "Upstash NO acepto esos datos: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "No se guardo nada. Copia URL y token de la seccion REST API de tu base de datos." -ForegroundColor Red
  exit 1
}

$texto = "UPSTASH_REDIS_REST_URL=$url`nUPSTASH_REDIS_REST_TOKEN=$token`nADMIN_KEY=$admin`n"
[System.IO.File]::WriteAllText((Join-Path (Get-Location) ".env.local"), $texto, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "`n.env.local guardado correctamente." -ForegroundColor Green
Write-Host "Ahora para el servidor con Ctrl + C y vuelve a correr: npm run dev" -ForegroundColor Cyan
