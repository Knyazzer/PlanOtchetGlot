# TV Shifts -- skript zapuska dlya razrabotki
$projectRoot = $PSScriptRoot

function Kill-Port($port) {
    $result = & cmd /c "netstat -ano | findstr :$port" 2>$null
    foreach ($line in $result) {
        if ($line -match '\s+(\d+)$') {
            $p = $matches[1]
            if ($p -ne '0') {
                Write-Host "  Killing PID $p on port $port..." -ForegroundColor DarkGray
                & cmd /c "taskkill /PID $p /F" 2>$null | Out-Null
            }
        }
    }
}

Write-Host ""
Write-Host "Stopping old processes..." -ForegroundColor DarkGray
Kill-Port 4000
Kill-Port 5173
Write-Host "  Ports cleared" -ForegroundColor DarkGray
Write-Host ""

# API
Start-Process powershell -ArgumentList "-NoExit", "-Command", "
  Set-Location '$projectRoot'
  Write-Host 'Starting API on http://localhost:4000' -ForegroundColor Cyan
  pnpm --filter @nexus/api dev
" -WindowStyle Normal

# Web
Start-Process powershell -ArgumentList "-NoExit", "-Command", "
  Set-Location '$projectRoot'
  Write-Host 'Starting Web on http://localhost:5173' -ForegroundColor Green
  pnpm --filter @nexus/web dev
" -WindowStyle Normal

Write-Host "TV Shifts started!" -ForegroundColor Yellow
Write-Host "  API:  http://localhost:4000" -ForegroundColor Cyan
Write-Host "  Web:  http://localhost:5173" -ForegroundColor Green
Write-Host ""
