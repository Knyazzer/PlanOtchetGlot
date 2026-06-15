# TV Shifts -- obnovlenie posle git pull
# Zapuskay etot skript posle kazhdogo git pull

$projectRoot = $PSScriptRoot
$PG_USER  = "tvshifts"
$PG_PASS  = "tvshifts_pass"
$PG_PORT  = "5433"
$CONTAINER = "planotchetglot-postgres-1"
$dbDir    = Join-Path $projectRoot "packages\db"

# Detect branch -> database name
$branch = (git -C $projectRoot rev-parse --abbrev-ref HEAD 2>$null).Trim()
if (-not $branch) { $branch = "development" }
$dbName = switch ($branch) {
    "master"               { "tvshifts_master" }
    "rebuild-v3"           { "tvshifts_v3" }
    "rebuild-v3-projects"  { "tvshifts_v3" }
    default                { "tvshifts_dev" }
}
$dbUrl = "postgresql://${PG_USER}:${PG_PASS}@localhost:${PG_PORT}/${dbName}"

Write-Host ""
Write-Host "=== TV Shifts Update ===" -ForegroundColor Yellow
Write-Host "  Branch: $branch  ->  DB: $dbName" -ForegroundColor Cyan
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

# Create DB if not exists
$exists = docker exec $CONTAINER psql -U $PG_USER -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$dbName'" 2>$null
$isNewDb = ($exists -ne "1")
if ($isNewDb) {
    Write-Host "      Sozdayu bazu '$dbName'..." -ForegroundColor DarkGray
    docker exec $CONTAINER psql -U $PG_USER -d postgres -c "CREATE DATABASE `"$dbName`";" 2>$null | Out-Null
    Write-Host "      Baza '$dbName' sozdana" -ForegroundColor Green
}

# -- 2. Ustanovit / obnovit pakety + Prisma client --
Write-Host "[2/4] Ustanovka zavisimostey..." -ForegroundColor Cyan
pnpm install --dir $projectRoot
Write-Host "      Zavisimosti ustanovleny" -ForegroundColor DarkGray

Write-Host "      Generiryu Prisma client..." -ForegroundColor DarkGray
$env:DATABASE_URL = $dbUrl
pnpm db:generate
Write-Host "      Prisma client obnovlen" -ForegroundColor DarkGray

# -- 3. Primenit novye migracii (s auto-resolve konfliktov) --
Write-Host "[3/4] Primeneniye migraciy..." -ForegroundColor Cyan
$env:DATABASE_URL = $dbUrl
Set-Location $dbDir

# Resolve any failed migration recorded in _prisma_migrations
$hasMigrTable = docker exec $CONTAINER psql -U $PG_USER -d $dbName -tAc `
    "SELECT 1 FROM information_schema.tables WHERE table_name='_prisma_migrations' LIMIT 1;" 2>$null
if ($hasMigrTable -eq "1") {
    $failedMigration = docker exec $CONTAINER psql -U $PG_USER -d $dbName -tAc `
        "SELECT migration_name FROM _prisma_migrations WHERE rolled_back_at IS NULL AND finished_at IS NULL AND applied_steps_count = 0 LIMIT 1;" 2>$null
    if ($failedMigration) {
        $failedMigration = $failedMigration.Trim()
        Write-Host "      Resolving failed migration: $failedMigration" -ForegroundColor Yellow
        npx prisma migrate resolve --applied $failedMigration 2>&1 | Out-Null
    }
}

# Apply migrations, auto-resolving "already exists" conflicts
$maxAttempts = 50
$attempt = 0
$exitCode = 1
do {
    $attempt++
    $migrateOut = npx prisma migrate deploy 2>&1
    $exitCode = $LASTEXITCODE
    if ($exitCode -eq 0) { break }

    if ($migrateOut -match "Migration name: (\S+)") {
        $failedName = $matches[1].Trim()
        Write-Host "      Conflict in '$failedName' -> marking as applied" -ForegroundColor Yellow
        npx prisma migrate resolve --applied $failedName 2>&1 | Out-Null
    } else {
        Write-Host $migrateOut -ForegroundColor Red
        break
    }
} while ($attempt -lt $maxAttempts)

Set-Location $projectRoot

if ($exitCode -ne 0) {
    Write-Host "      OSHIBKA: migracii ne primeneny" -ForegroundColor Red
    exit 1
}
Write-Host "      Migracii primeneny" -ForegroundColor Green

# Seed new DB
if ($isNewDb) {
    Write-Host "      Seeding initial data..." -ForegroundColor DarkGray
    $env:DATABASE_URL = $dbUrl
    pnpm db:seed | Out-Null
    Write-Host "      Seed complete (admin@tvshifts.ru / admin123)" -ForegroundColor Green
}

# Update .env
$envPath = "$projectRoot\.env"
if (Test-Path $envPath) {
    $envContent = Get-Content $envPath -Raw -Encoding UTF8
    $envContent = $envContent -replace 'DATABASE_URL=.*', "DATABASE_URL=$dbUrl"
    $envContent = $envContent -replace 'POSTGRES_DB=.*', "POSTGRES_DB=$dbName"
    Set-Content $envPath $envContent -Encoding UTF8 -NoNewline
}

# -- 4. Zapustit prilozhenie --
Write-Host "[4/4] Zapusk prilozheniya..." -ForegroundColor Cyan
Write-Host ""
& "$projectRoot\start.ps1"
