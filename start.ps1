# TV Shifts — скрипт запуска для разработки
$projectRoot = $PSScriptRoot

# Убиваем старые процессы на портах 4000 и 5173
foreach ($port in @(4000, 5173)) {
  $pids = netstat -ano | Select-String ":$port\s.*LISTENING" | ForEach-Object {
    ($_ -split '\s+')[-1]
  }
  foreach ($p in $pids) {
    if ($p -match '^\d+$' -and $p -ne '0') {
      Write-Host "Killing old process on port $port (PID $p)" -ForegroundColor DarkGray
      taskkill /PID $p /F 2>$null | Out-Null
    }
  }
}

Start-Sleep -Milliseconds 500

# API
Start-Process powershell -ArgumentList "-NoExit", "-Command", "
  Set-Location '$projectRoot'
  Write-Host 'Starting API on http://localhost:4000' -ForegroundColor Cyan
  pnpm --filter @tv-shifts/api dev
" -WindowStyle Normal

# Web
Start-Process powershell -ArgumentList "-NoExit", "-Command", "
  Set-Location '$projectRoot'
  Write-Host 'Starting Web on http://localhost:5173' -ForegroundColor Green
  pnpm --filter @tv-shifts/web dev
" -WindowStyle Normal

Write-Host ""
Write-Host "TV Shifts запущен!" -ForegroundColor Yellow
Write-Host "  API:  http://localhost:4000" -ForegroundColor Cyan
Write-Host "  Web:  http://localhost:5173" -ForegroundColor Green
Write-Host ""
