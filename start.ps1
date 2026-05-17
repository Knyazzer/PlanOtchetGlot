# TV Shifts — branch-aware dev launcher
# Каждая ветка использует свою базу данных. Переключил ветку — запускай этот скрипт.

$projectRoot = $PSScriptRoot
$PG_USER     = "tvshifts"
$PG_PASS     = "tvshifts_pass"
$PG_PORT     = "5433"
$CONTAINER   = "planotchetglot-postgres-1"

# ── Определяем ветку → имя БД ─────────────────────────────────────────────
$branch = (git -C $projectRoot rev-parse --abbrev-ref HEAD 2>$null).Trim()
if (-not $branch) { $branch = "development" }

$dbName = switch ($branch) {
    "master"      { "tvshifts_master" }
    "rebuild-v3"  { "tvshifts_v3" }
    default       { "tvshifts_dev" }
}

$dbUrl = "postgresql://${PG_USER}:${PG_PASS}@localhost:${PG_PORT}/${dbName}"

Write-Host ""
Write-Host "=== TV Shifts ===" -ForegroundColor Yellow
Write-Host "  Ветка:  $branch" -ForegroundColor Cyan
Write-Host "  БД:     $dbName" -ForegroundColor Cyan
Write-Host ""

# ── Проверяем Docker ────────────────────────────────────────────────────────
$running = docker compose -f "$projectRoot\docker-compose.dev.yml" ps --status running --quiet 2>$null
if (-not $running) {
    Write-Host "Запускаю Docker..." -ForegroundColor DarkGray
    docker compose -f "$projectRoot\docker-compose.dev.yml" up -d
    Write-Host "Жду готовности БД..." -ForegroundColor DarkGray
    Start-Sleep -Seconds 5
}

# ── Создаём БД если не существует ───────────────────────────────────────────
$exists = docker exec $CONTAINER psql -U $PG_USER -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$dbName'" 2>$null
if ($exists -ne "1") {
    Write-Host "Создаю базу данных '$dbName'..." -ForegroundColor DarkGray
    docker exec $CONTAINER psql -U $PG_USER -d postgres -c "CREATE DATABASE `"$dbName`";" 2>$null | Out-Null

    # Применяем миграции
    Write-Host "Применяю миграции..." -ForegroundColor DarkGray
    $env:DATABASE_URL = $dbUrl
    Set-Location "$projectRoot\packages\db"
    npx prisma migrate deploy | Out-Null
    Set-Location $projectRoot

    # Сид
    Write-Host "Заполняю начальные данные..." -ForegroundColor DarkGray
    $env:DATABASE_URL = $dbUrl
    pnpm db:seed | Out-Null

    Write-Host "  База '$dbName' готова" -ForegroundColor Green
} else {
    # БД уже есть — только применяем новые миграции
    $pendingCheck = $null
    $env:DATABASE_URL = $dbUrl
    Set-Location "$projectRoot\packages\db"
    $migrateOut = npx prisma migrate deploy 2>&1
    Set-Location $projectRoot
    if ($migrateOut -match "migrations have been applied|No pending migrations") {
        # ok
    } else {
        Write-Host $migrateOut -ForegroundColor DarkGray
    }
}

# ── Обновляем .env ──────────────────────────────────────────────────────────
$envPath = "$projectRoot\.env"
$envContent = Get-Content $envPath -Raw
$envContent = $envContent -replace 'DATABASE_URL=.*', "DATABASE_URL=$dbUrl"
# Обновляем также POSTGRES_DB
$envContent = $envContent -replace 'POSTGRES_DB=.*', "POSTGRES_DB=$dbName"
Set-Content $envPath $envContent -Encoding UTF8 -NoNewline
Write-Host "  .env обновлён (DATABASE_URL → $dbName)" -ForegroundColor DarkGray
Write-Host ""

# ── Убиваем старые процессы ─────────────────────────────────────────────────
function Kill-Port($port) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        foreach ($c in $conn) {
            $pid_ = $c.OwningProcess
            if ($pid_ -and $pid_ -ne 0) {
                Stop-Process -Id $pid_ -Force -ErrorAction SilentlyContinue
            }
        }
        $i = 0
        while ((Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) -and $i -lt 15) {
            Start-Sleep -Milliseconds 200; $i++
        }
    }
}
Kill-Port 4000
Kill-Port 5173

# ── Запускаем API и Web ─────────────────────────────────────────────────────
Start-Process powershell -ArgumentList "-NoExit", "-Command", "
  `$env:DATABASE_URL = '$dbUrl'
  Set-Location '$projectRoot'
  Write-Host 'API  http://localhost:4000  [$branch / $dbName]' -ForegroundColor Cyan
  pnpm --filter @tv-shifts/api dev
" -WindowStyle Normal

Start-Process powershell -ArgumentList "-NoExit", "-Command", "
  Set-Location '$projectRoot'
  Write-Host 'Web  http://localhost:5173  [$branch]' -ForegroundColor Green
  pnpm --filter @tv-shifts/web dev
" -WindowStyle Normal

Write-Host "TV Shifts запущен!" -ForegroundColor Yellow
Write-Host "  API: http://localhost:4000" -ForegroundColor Cyan
Write-Host "  Web: http://localhost:5173" -ForegroundColor Green
Write-Host ""
Write-Host "Чтобы переключить ветку:" -ForegroundColor DarkGray
Write-Host "  git checkout rebuild-v3" -ForegroundColor DarkGray
Write-Host "  .\start.ps1" -ForegroundColor DarkGray
Write-Host ""
