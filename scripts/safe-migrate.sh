#!/usr/bin/env bash
# safe-migrate.sh — применяет Prisma-миграции с предварительным pg_dump.
#
# Использование:
#   DATABASE_URL=postgresql://... ./scripts/safe-migrate.sh
#   или (staging):
#   DATABASE_URL=postgresql://... BACKUP_DIR=./backups/staging ./scripts/safe-migrate.sh

set -euo pipefail

DATABASE_URL="${DATABASE_URL:?DATABASE_URL не задан}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/pre-migrate-${TIMESTAMP}.sql.gz"
LOG_FILE="${BACKUP_DIR}/migrate-${TIMESTAMP}.log"

mkdir -p "$BACKUP_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

# ── 1. Дамп БД ────────────────────────────────────────────────────────────────
log "Начало резервной копии → ${BACKUP_FILE}"
pg_dump "$DATABASE_URL" | gzip > "$BACKUP_FILE"
log "Резервная копия готова ($(du -sh "$BACKUP_FILE" | cut -f1))"

# ── 2. Применение миграций ────────────────────────────────────────────────────
log "Применение миграций (prisma migrate deploy)..."
if npx prisma migrate deploy --schema packages/db/prisma/schema.prisma 2>&1 | tee -a "$LOG_FILE"; then
  log "Миграции применены успешно."
else
  log "ОШИБКА при применении миграций. Резервная копия сохранена: ${BACKUP_FILE}"
  log "Для восстановления: gunzip -c ${BACKUP_FILE} | psql \"\$DATABASE_URL\""
  exit 1
fi

log "Готово. Лог: ${LOG_FILE}"
