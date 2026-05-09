# TV Shifts -- skript zapuska dlya razrabotki
$projectRoot = $PSScriptRoot

function Kill-Port($port) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        foreach ($c in $conn) {
            $pid = $c.OwningProcess
            if ($pid -and $pid -ne 0) {
                Write-Host "  Killing PID $pid on port $port..." -ForegroundColor DarkGray
                Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
            }
        }
        # Zhdat' poka port osvoboditsya (do 3 sekund)
        $i = 0
        while ((Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) -and $i -lt 15) {
            Start-Sleep -Milliseconds 200
            $i++
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
  pnpm --filter @tv-shifts/api dev
" -WindowStyle Normal

# Web
Start-Process powershell -ArgumentList "-NoExit", "-Command", "
  Set-Location '$projectRoot'
  Write-Host 'Starting Web on http://localhost:5173' -ForegroundColor Green
  pnpm --filter @tv-shifts/web dev
" -WindowStyle Normal

Write-Host "TV Shifts started!" -ForegroundColor Yellow
Write-Host "  API:  http://localhost:4000" -ForegroundColor Cyan
Write-Host "  Web:  http://localhost:5173" -ForegroundColor Green
Write-Host ""
