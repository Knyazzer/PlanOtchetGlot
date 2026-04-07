# TV Shifts -- pervonachalnaya nastroyka na novoy mashine
# Zapuskay odin raz posle git clone
# Docker Desktop dolzhen byt ustanovlen i zapushchen zaranee

$projectRoot = $PSScriptRoot
$dbDir = Join-Path $projectRoot "packages\db"
$dbUrl = "postgresql://tvshifts:tvshifts_pass@localhost:5432/tvshifts"

Write-Host ""
Write-Host "=== TV Shifts Setup ===" -ForegroundColor Yellow
Write-Host ""

# -- 1. Proverit Node.js --
Write-Host "[1/6] Proverka Node.js..." -ForegroundColor Cyan
$nodeVersion = node --version 2>$null
if (-not $nodeVersion) {
    Write-Host "      OSHIBKA: Node.js ne ustanovlen." -ForegroundColor Red
    Write-Host "      Skachay s https://nodejs.org (versiya 20+)" -ForegroundColor Red
    exit 1
}
Write-Host "      Node.js $nodeVersion" -ForegroundColor DarkGray

# -- 2. Proverit/ustanovit pnpm --
Write-Host "[2/6] Proverka pnpm..." -ForegroundColor Cyan
$pnpmVersion = pnpm --version 2>$null
if (-not $pnpmVersion) {
    Write-Host "      pnpm ne nayden, ustanavlivayu..." -ForegroundColor DarkGray
    npm install -g pnpm
    $pnpmVersion = pnpm --version
}
Write-Host "      pnpm $pnpmVersion" -ForegroundColor DarkGray

# -- 3. Ustanovit zavisimosti --
Write-Host "[3/6] Ustanovka zavisimostey..." -ForegroundColor Cyan
pnpm install --dir $projectRoot
Write-Host "      Gotovo" -ForegroundColor DarkGray

# -- 4. Sozdat .env --
Write-Host "[4/6] Nastroyka peremennykh okruzheniya..." -ForegroundColor Cyan
$envFile = Join-Path $projectRoot ".env"
$envExample = Join-Path $projectRoot ".env.example"
if (-not (Test-Path $envFile)) {
    Copy-Item $envExample $envFile
    Write-Host "      Sozdan .env iz .env.example" -ForegroundColor DarkGray
} else {
    Write-Host "      .env uzhe sushchestvuet, propuskayu" -ForegroundColor DarkGray
}

# -- 5. Zapustit bazu dannykh i primenit migracii --
Write-Host "[5/6] Baza dannykh..." -ForegroundColor Cyan

# Proverit Docker
$dockerRunning = docker info 2>$null
if (-not $dockerRunning) {
    Write-Host "      OSHIBKA: Docker Desktop ne zapushchen." -ForegroundColor Red
    Write-Host "      Zapusti Docker Desktop i povtori setup.ps1" -ForegroundColor Red
    exit 1
}

Write-Host "      Zapuskayu PostgreSQL v Docker..." -ForegroundColor DarkGray
docker compose -f "$projectRoot\docker-compose.dev.yml" up -d

Write-Host "      Ozhidanie gotovnosti BD - 10 sekund..." -ForegroundColor DarkGray
Start-Sleep -Seconds 10

Write-Host "      Primenyayu migracii..." -ForegroundColor DarkGray
$env:DATABASE_URL = $dbUrl
Set-Location $dbDir
npx prisma migrate deploy

Write-Host "      Zapolnyayu testovymi dannymi..." -ForegroundColor DarkGray
npx ts-node --compiler-options '{\"lib\":[\"ES2020\",\"DOM\"],\"module\":\"commonjs\",\"esModuleInterop\":true,\"skipLibCheck\":true}' prisma/seed.ts

Set-Location $projectRoot

# -- 6. Zapustit prilozhenie --
Write-Host "[6/6] Zapusk prilozheniya..." -ForegroundColor Cyan
Write-Host ""
Write-Host "Nastroyka zavershena!" -ForegroundColor Green
Write-Host ""
Write-Host "  Testovye akkaunty:" -ForegroundColor White
Write-Host "    admin@tvshifts.ru    / admin123  (Administrator)" -ForegroundColor DarkGray
Write-Host "    ivanov@tvshifts.ru   / user123   (Sotrudnik)" -ForegroundColor DarkGray
Write-Host "    producer@tvshifts.ru / user123   (Prodyuser)" -ForegroundColor DarkGray
Write-Host ""

& "$projectRoot\start.ps1"
