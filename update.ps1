# TV Shifts -- obnovlenie posle git pull
# Zapuskay etot skript posle kazhdogo git pull

$projectRoot = $PSScriptRoot

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

# -- 2. Ustanovit / obnovit pakety + Prisma client --
Write-Host "[2/4] Ustanovka zavisimostey..." -ForegroundColor Cyan
pnpm install --dir $projectRoot
Write-Host "      Zavisimosti ustanovleny" -ForegroundColor DarkGray

Write-Host "      Generiryu Prisma client..." -ForegroundColor DarkGray
pnpm db:generate
Write-Host "      Prisma client obnovlen" -ForegroundColor DarkGray

# -- 3. Primenit novye migracii --
Write-Host "[3/4] Primeneniye migraciy..." -ForegroundColor Cyan
# Read DATABASE_URL directly from .env and pass it inline to prisma
$envFile = "$projectRoot\.env"
$dbUrl = $null
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*DATABASE_URL\s*=\s*(.+)$') { $dbUrl = $matches[1].Trim() }
    }
}
if (-not $dbUrl) {
    Write-Host "      OSHIBKA: DATABASE_URL ne nayden v .env" -ForegroundColor Red
    exit 1
}
$env:DATABASE_URL = $dbUrl
Set-Location "$projectRoot\packages\db"
npx prisma migrate deploy
$migrateExit = $LASTEXITCODE
Set-Location $projectRoot
if ($migrateExit -ne 0) {
    Write-Host "      OSHIBKA: migracii ne primeneny" -ForegroundColor Red
    exit 1
}
Write-Host "      Migracii primeneny" -ForegroundColor Green

# -- 4. Zapustit prilozhenie --
Write-Host "[4/4] Zapusk prilozheniya..." -ForegroundColor Cyan
Write-Host ""
& "$projectRoot\start.ps1"
