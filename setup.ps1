# TV Shifts — первоначальная настройка на новой машине
# Запускай один раз после git clone
# Docker Desktop должен быть установлен и запущен заранее

$projectRoot = $PSScriptRoot
$dbDir = Join-Path $projectRoot "packages\db"
$dbUrl = "postgresql://tvshifts:tvshifts_pass@localhost:5432/tvshifts"

Write-Host ""
Write-Host "=== TV Shifts Setup ===" -ForegroundColor Yellow
Write-Host ""

# ── 1. Проверить Node.js ──────────────────────────────────────────────────────
Write-Host "[1/6] Проверка Node.js..." -ForegroundColor Cyan
$nodeVersion = node --version 2>$null
if (-not $nodeVersion) {
    Write-Host "      ОШИБКА: Node.js не установлен." -ForegroundColor Red
    Write-Host "      Скачай с https://nodejs.org (версия 20+)" -ForegroundColor Red
    exit 1
}
Write-Host "      Node.js $nodeVersion" -ForegroundColor DarkGray

# ── 2. Проверить/установить pnpm ─────────────────────────────────────────────
Write-Host "[2/6] Проверка pnpm..." -ForegroundColor Cyan
$pnpmVersion = pnpm --version 2>$null
if (-not $pnpmVersion) {
    Write-Host "      pnpm не найден, устанавливаю..." -ForegroundColor DarkGray
    npm install -g pnpm
    $pnpmVersion = pnpm --version
}
Write-Host "      pnpm $pnpmVersion" -ForegroundColor DarkGray

# ── 3. Установить зависимости ─────────────────────────────────────────────────
Write-Host "[3/6] Установка зависимостей..." -ForegroundColor Cyan
pnpm install --dir $projectRoot
Write-Host "      Готово" -ForegroundColor DarkGray

# ── 4. Создать .env ───────────────────────────────────────────────────────────
Write-Host "[4/6] Настройка переменных окружения..." -ForegroundColor Cyan
$envFile = Join-Path $projectRoot ".env"
$envExample = Join-Path $projectRoot ".env.example"
if (-not (Test-Path $envFile)) {
    Copy-Item $envExample $envFile
    Write-Host "      Создан .env из .env.example" -ForegroundColor DarkGray
} else {
    Write-Host "      .env уже существует, пропускаю" -ForegroundColor DarkGray
}

# ── 5. Запустить базу данных и применить миграции ─────────────────────────────
Write-Host "[5/6] База данных..." -ForegroundColor Cyan

# Проверить Docker
$dockerRunning = docker info 2>$null
if (-not $dockerRunning) {
    Write-Host "      ОШИБКА: Docker Desktop не запущен." -ForegroundColor Red
    Write-Host "      Запусти Docker Desktop и повтори setup.ps1" -ForegroundColor Red
    exit 1
}

Write-Host "      Запускаю PostgreSQL в Docker..." -ForegroundColor DarkGray
docker compose -f "$projectRoot\docker-compose.dev.yml" up -d

Write-Host "      Ожидание готовности БД (10 сек)..." -ForegroundColor DarkGray
Start-Sleep -Seconds 10

Write-Host "      Применяю миграции..." -ForegroundColor DarkGray
$env:DATABASE_URL = $dbUrl
Set-Location $dbDir
npx prisma migrate deploy

Write-Host "      Заполняю тестовыми данными..." -ForegroundColor DarkGray
npx ts-node --compiler-options '{\"lib\":[\"ES2020\",\"DOM\"],\"module\":\"commonjs\",\"esModuleInterop\":true,\"skipLibCheck\":true}' prisma/seed.ts

Set-Location $projectRoot

# ── 6. Запустить приложение ───────────────────────────────────────────────────
Write-Host "[6/6] Запуск приложения..." -ForegroundColor Cyan
Write-Host ""
Write-Host "✓ Настройка завершена!" -ForegroundColor Green
Write-Host ""
Write-Host "  Тестовые аккаунты:" -ForegroundColor White
Write-Host "    admin@tvshifts.ru    / admin123  (Администратор)" -ForegroundColor DarkGray
Write-Host "    ivanov@tvshifts.ru   / user123   (Сотрудник)" -ForegroundColor DarkGray
Write-Host "    producer@tvshifts.ru / user123   (Продюсер)" -ForegroundColor DarkGray
Write-Host ""

& "$projectRoot\start.ps1"
