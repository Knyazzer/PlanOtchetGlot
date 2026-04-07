# TV Shifts — обновление после git pull
# Запускай этот скрипт после каждого git pull

$projectRoot = $PSScriptRoot
$dbDir = Join-Path $projectRoot "packages\db"
$dbUrl = "postgresql://tvshifts:tvshifts_pass@localhost:5432/tvshifts"

Write-Host ""
Write-Host "=== TV Shifts Update ===" -ForegroundColor Yellow
Write-Host ""

# ── 1. Проверить что Docker запущен ───────────────────────────────────────────
Write-Host "[1/4] Проверка Docker..." -ForegroundColor Cyan
$dockerRunning = docker compose -f "$projectRoot\docker-compose.dev.yml" ps --quiet 2>$null
if (-not $dockerRunning) {
    Write-Host "      Запускаю базу данных..." -ForegroundColor DarkGray
    docker compose -f "$projectRoot\docker-compose.dev.yml" up -d
    Write-Host "      Ожидание готовности БД..." -ForegroundColor DarkGray
    Start-Sleep -Seconds 5
} else {
    Write-Host "      БД уже запущена" -ForegroundColor DarkGray
}

# ── 2. Установить новые пакеты если изменился lockfile ───────────────────────
Write-Host "[2/4] Проверка зависимостей..." -ForegroundColor Cyan
$lockChanged = git -C $projectRoot diff HEAD@{1} --name-only 2>$null | Select-String "pnpm-lock.yaml"
if ($lockChanged) {
    Write-Host "      Обнаружены новые пакеты, устанавливаю..." -ForegroundColor DarkGray
    pnpm install --dir $projectRoot
} else {
    Write-Host "      Зависимости актуальны" -ForegroundColor DarkGray
}

# ── 3. Применить новые миграции если появились ────────────────────────────────
Write-Host "[3/4] Проверка миграций..." -ForegroundColor Cyan
$migrationsChanged = git -C $projectRoot diff HEAD@{1} --name-only 2>$null | Select-String "prisma/migrations"
if ($migrationsChanged) {
    Write-Host "      Обнаружены новые миграции, применяю..." -ForegroundColor DarkGray
    $env:DATABASE_URL = $dbUrl
    Set-Location $dbDir
    npx prisma migrate deploy
    Set-Location $projectRoot
    Write-Host "      Миграции применены" -ForegroundColor Green
} else {
    Write-Host "      Миграции актуальны" -ForegroundColor DarkGray
}

# ── 4. Запустить приложение ───────────────────────────────────────────────────
Write-Host "[4/4] Запуск приложения..." -ForegroundColor Cyan
Write-Host ""
& "$projectRoot\start.ps1"
