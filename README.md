# Nexus

Корпоративная система управления Megapolis: задачи, треки, проекты, календарь, чаты, персонал.
Прод: `https://nexus.knzteam.ru` (позже `nexus.megapolis.media`).

- **Web**: http://localhost:5173
- **API**: http://localhost:4000

---

## Быстрый старт

### Требования

- [Node.js 20+](https://nodejs.org/)
- [pnpm](https://pnpm.io/) — `npm install -g pnpm`
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

### Первый запуск

```powershell
pnpm install
docker compose -f docker-compose.dev.yml up -d
pnpm db:migrate
pnpm db:seed
.\start.ps1
```

### Ежедневный запуск

```powershell
.\start.ps1
```

---

## Вход в dev-режиме

Локально аутентификация идёт через `POST /auth/dev-login` — вход **по email без пароля**
(Supabase используется только в production-сборке).

| Email | Роль |
|-------|------|
| admin@nexus.local | администратор |
| user@nexus.local | сотрудник |

Прод-доступы — `docs/CREDENTIALS.md` (gitignored).

---

## Структура проекта

```
apps/
  api/        — Fastify API (порт 4000)
  web/        — React + Vite (порт 5173)
packages/
  db/         — Prisma schema + миграции (схемы public + nexus)
docs/
  TODO.md             — приоритизированный план разработки
  DONE.md             — журнал выполненного
  INTEGRATION.md      — интеграция Nexus ↔ Инвентаризация (общий Supabase, SSO)
  USER-LIFECYCLE.md   — жизненный цикл пользователя
  DEPLOY-RUNBOOK.md   — деплой на прод (частично исторический)
  IMPLEMENTATION-PLAN.md — план переноса ПланОтчета
  DESIGN.md           — дизайн-система
```

Карта проекта для разработки — `CLAUDE.md`; обязательные правила — `RULES.md`.
