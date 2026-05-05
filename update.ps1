# TV Shifts -- obnovlenie posle git pull
# Zapuskay etot skript posle kazhdogo git pull

$projectRoot = $PSScriptRoot
$dbDir = Join-Path $projectRoot "packages\db"
$dbUrl = "postgresql://tvshifts:tvshifts_pass@localhost:5433/tvshifts"

Write-Host ""
Write-Host "=== TV Shifts Update ===" -ForegroundColor Yellow
Write-Host ""

# -- 1. Proverit chto Docker zapushchen --
Write-Host "[1/4] Proverka Docker..." -ForegroundColor Cyan
$dockerRunning = docker compose -f "$projectRoot\docker-compose.dev.yml" ps --status running --quiet 2>$null
if (-not $dockerRunning) {
    Write-Host "      Zapuskayu bazu dannykh..." -ForegroundColor DarkGray
    docker compose -f "$projectRoot\docker-compose.dev.yml" up -d
    Write-Host "      Ozhidanie gotovnosti BD - 5 sekund..." -ForegroundColor DarkGray
    Start-Sleep -Seconds 5
} else {
    Write-Host "      BD uzhe zapushchena" -ForegroundColor DarkGray
}

# -- 2. Ustanovit / obnovit pakety --
Write-Host "[2/5] Ustanovka zavisimostey..." -ForegroundColor Cyan
pnpm install --dir $projectRoot
Write-Host "      Zavisimosti ustanovleny" -ForegroundColor DarkGray

# -- 3. Primenit novye migracii --
Write-Host "[3/5] Primeneniye migraciy..." -ForegroundColor Cyan
$env:DATABASE_URL = $dbUrl
Set-Location $dbDir
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) {
    Set-Location $projectRoot
    Write-Host "      OSHIBKA: migracii ne primeneny (BD nedostupna?)" -ForegroundColor Red
    exit 1
}
Set-Location $projectRoot
Write-Host "      Migracii primeneny" -ForegroundColor Green

# -- 4. Sobrat paket @tv-shifts/db --
Write-Host "[4/5] Sborka @tv-shifts/db..." -ForegroundColor Cyan
pnpm --filter @tv-shifts/db build
if ($LASTEXITCODE -ne 0) {
    Write-Host "      OSHIBKA: sborka @tv-shifts/db ne udalas" -ForegroundColor Red
    exit 1
}
Write-Host "      @tv-shifts/db sobran" -ForegroundColor Green

# -- 5. Zapustit prilozhenie --
Write-Host "[5/5] Zapusk prilozheniya..." -ForegroundColor Cyan
Write-Host ""
& "$projectRoot\start.ps1"
