# TV Shifts — Развёртывание на новой машине

## Что нужно установить один раз

| Инструмент | Зачем | Ссылка |
|-----------|-------|--------|
| **Git** | Клонировать и синхронизировать код | https://git-scm.com |
| **Node.js 20+** | Запускать API и Web | https://nodejs.org |
| **pnpm** | Менеджер пакетов | `npm install -g pnpm` |
| **Docker Desktop** | Запускать PostgreSQL в контейнере (без ручной установки SQL) | https://www.docker.com/products/docker-desktop |

> PostgreSQL устанавливать отдельно **не нужно** — он запускается через Docker.

---

## Первый запуск (новая машина)

### Автоматически (рекомендуется)

```powershell
git clone <ссылка на репозиторий>
cd tv-shifts
.\setup.ps1
```

Скрипт сам: проверит Node.js, установит pnpm и зависимости, поднимет Docker с БД, применит миграции, заполнит тестовыми данными и запустит приложение.

---

### Вручную (если нужно)

### 1. Клонировать репозиторий

```powershell
git clone <ссылка на репозиторий>
cd tv-shifts
```

### 2. Установить зависимости

```powershell
pnpm install
```

### 3. Создать файл переменных окружения

```powershell
copy .env.example .env
```

Файл `.env` уже содержит правильные значения для локальной разработки — **ничего менять не нужно**.

### 4. Запустить базу данных через Docker

```powershell
docker compose -f docker-compose.dev.yml up -d
```

Проверить что БД запустилась:
```powershell
docker compose -f docker-compose.dev.yml ps
# Должно быть: STATUS = running (healthy)
```

### 5. Применить миграции (создать таблицы)

```powershell
cd packages/db
$env:DATABASE_URL="postgresql://tvshifts:tvshifts_pass@localhost:5432/tvshifts"
npx prisma migrate deploy
cd ../..
```

### 6. Заполнить тестовыми данными

```powershell
cd packages/db
$env:DATABASE_URL="postgresql://tvshifts:tvshifts_pass@localhost:5432/tvshifts"
npx ts-node --compiler-options '{\"lib\":[\"ES2020\",\"DOM\"],\"module\":\"commonjs\",\"esModuleInterop\":true,\"skipLibCheck\":true}' prisma/seed.ts
cd ../..
```

### 7. Запустить приложение

```powershell
.\start.ps1
```

Откроются два окна — API и Web.
Открывай в браузере: **http://localhost:5173**

---

## Ежедневный запуск

Убедись что Docker Desktop запущен, потом:

```powershell
.\start.ps1
```

Всё. Больше ничего делать не нужно.

---

## После `git pull` (получил изменения от другого разработчика)

```powershell
git pull
.\update.ps1
```

Скрипт автоматически:
1. Проверит и запустит Docker (БД) если не запущен
2. Установит новые пакеты если изменился `pnpm-lock.yaml`
3. Применит новые миграции если появились новые файлы в `prisma/migrations/`
4. Запустит API и Web

---

## Как понять что появились новые миграции?

После `git pull` смотри на вывод git — если среди изменённых файлов есть что-то вроде:
```
packages/db/prisma/migrations/20260415_add_something/migration.sql
```
— значит нужно запустить `prisma migrate deploy`.

---

## Важно понимать про данные в БД

| Что | Синхронизируется? | Как |
|-----|-------------------|-----|
| Структура таблиц (схема) | ✅ Да | Через миграции в git |
| Тестовые данные | ✅ Да | Через `seed.ts` в git |
| Реальные данные (то что вводили вручную) | ❌ Нет | Каждая машина имеет свою копию |

Это нормально для разработки — на каждой машине свои тестовые данные.

---

## Остановить всё

Закрыть окна API и Web (Ctrl+C или закрыть окна PowerShell).

Остановить базу данных:
```powershell
docker compose -f docker-compose.dev.yml stop
```

---

## Полностью сбросить базу данных (если что-то сломалось)

```powershell
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.dev.yml up -d
# Затем снова шаги 5 и 6 из первого запуска
```
