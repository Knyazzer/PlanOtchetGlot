# Деплой на сервер

## Требования к серверу

- Ubuntu 22.04+
- Docker + Docker Compose v2
- 1 GB RAM минимум
- Домен, указывающий на IP сервера

## Первый запуск

### 1. Клонировать репозиторий

```bash
git clone <repo> /opt/tv-shifts
cd /opt/tv-shifts
```

### 2. Создать `.env`

```bash
cp .env.example .env
nano .env
```

Обязательно заполнить:
```
POSTGRES_USER=tvshifts
POSTGRES_PASSWORD=<сложный пароль>
POSTGRES_DB=tvshifts
JWT_SECRET=<64 случайных символа>
WEB_URL=https://your-domain.ru
VITE_API_URL=https://your-domain.ru/api
GOOGLE_API_KEY=<ключ>
GOOGLE_PROJECTS_SHEET_ID=<id>
GOOGLE_REGISTRY_SHEET_ID=<id>
```

### 3. Получить SSL-сертификат (Let's Encrypt)

Временно поднять nginx только на HTTP:
```bash
docker compose -f docker-compose.prod.yml up -d nginx certbot
```

Получить сертификат:
```bash
docker compose -f docker-compose.prod.yml run certbot certonly \
  --webroot -w /var/www/certbot \
  -d your-domain.ru \
  --email your@email.com \
  --agree-tos --no-eff-email
```

### 4. Заменить домен в nginx.conf

```bash
sed -i 's/${DOMAIN}/your-domain.ru/g' nginx/nginx.conf
```

### 5. Запустить всё

```bash
docker compose -f docker-compose.prod.yml up -d
```

### 6. Применить миграции и seed

```bash
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy
docker compose -f docker-compose.prod.yml exec api npx ts-node packages/db/prisma/seed.ts
```

---

## Обновление

```bash
git pull
docker compose -f docker-compose.prod.yml build api web
docker compose -f docker-compose.prod.yml up -d api web
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy
```

---

## Полезные команды

```bash
# Логи
docker compose -f docker-compose.prod.yml logs -f api

# Перезапуск сервиса
docker compose -f docker-compose.prod.yml restart api

# Подключиться к БД
docker compose -f docker-compose.prod.yml exec postgres psql -U tvshifts

# Ручной бэкап
docker compose -f docker-compose.prod.yml exec backup \
  pg_dump -h postgres -U tvshifts tvshifts | gzip > backups/manual_$(date +%Y%m%d).sql.gz

# Восстановление из бэкапа
gunzip -c backups/backup_YYYYMMDD.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U tvshifts tvshifts
```

---

## Мониторинг

Healthcheck endpoint: `GET https://your-domain.ru/api/health` → `{"status":"ok"}`

Для алертов можно настроить uptime-мониторинг (UptimeRobot, BetterStack и т.п.) на этот URL.
