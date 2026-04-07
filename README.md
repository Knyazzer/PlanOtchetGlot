# TV Shifts

Приложение для управления сменами и загруженностью ТВ-команды.

- **Web**: http://localhost:5173
- **API**: http://localhost:4000
- **Документация**: [docs/README.md](docs/README.md)

---

## Быстрый старт (первый запуск)

### 1. Требования

- [Node.js 20+](https://nodejs.org/)
- [pnpm](https://pnpm.io/) — `npm install -g pnpm`
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) — для базы данных

### 2. Клонировать и установить зависимости

```powershell
git clone <repo-url>
cd tv-shifts
pnpm install
```

### 3. Настроить переменные окружения

```powershell
copy .env.example .env
```

`.env` уже содержит правильные значения для локальной разработки — менять ничего не нужно.

### 4. Запустить базу данных

```powershell
docker compose -f docker-compose.dev.yml up -d
```

> Если PostgreSQL уже установлен локально — создай пользователя и БД вручную (см. ниже).

### 5. Применить миграции и заполнить тестовыми данными

```powershell
# Миграция
cd packages/db
$env:DATABASE_URL="postgresql://tvshifts:tvshifts_pass@localhost:5432/tvshifts"
npx prisma migrate deploy

# Seed (тестовые пользователи и проекты)
npx ts-node --compiler-options '{\"lib\":[\"ES2020\",\"DOM\"],\"module\":\"commonjs\",\"esModuleInterop\":true,\"skipLibCheck\":true}' prisma/seed.ts
cd ../..
```

### 6. Запустить приложение

```powershell
.\start.ps1
```

Откроются два окна PowerShell — API и Web.

---

## Тестовые аккаунты

| Email | Пароль | Роль |
|-------|--------|------|
| admin@tvshifts.ru | admin123 | Администратор |
| ivanov@tvshifts.ru | user123 | Сотрудник |
| petrov@tvshifts.ru | user123 | Сотрудник |
| sidorova@tvshifts.ru | user123 | Сотрудник |
| producer@tvshifts.ru | user123 | Продюсер |

---

## Ежедневный запуск

После первоначальной настройки — только одна команда:

```powershell
.\start.ps1
```

> Убедись что Docker Desktop запущен и контейнер `postgres` работает.

---

## Если PostgreSQL установлен локально (без Docker)

Вместо шага 4 выполни в pgAdmin или psql:

```sql
CREATE USER tvshifts WITH PASSWORD 'tvshifts_pass' CREATEDB;
CREATE DATABASE tvshifts OWNER tvshifts;
```

---

## Структура проекта

```
apps/
  api/        — Fastify API (Node.js + TypeScript)
  web/        — React приложение (Vite + TypeScript)
packages/
  db/         — Prisma schema + миграции
docs/         — Документация проекта
```
