# Аккаунты Nexus (dev)

> Прод-доступы (Supabase, VDS, сервисные ключи) — в `docs/CREDENTIALS.md` (gitignored).

## Локальная разработка

В dev-режиме вход через `POST /auth/dev-login` — **по email, пароль не проверяется**
(форма логина в dev-сборке шлёт только email; Supabase Auth работает лишь в production).

Сид (`pnpm db:seed`, `packages/db/prisma/seed.ts`):

| Email | Кто | Что видит |
|-------|-----|-----------|
| admin@nexus.local | Администратор (`isAdmin: true`) | полный AppShell: Главная, Календарь, Задачи, Проекты + Персонал, База данных |
| user@nexus.local | Тестовый сотрудник | только PersonalCabinetPage (visibility gate — производственная часть не открыта не-админам) |

## Ролевая модель (текущая)

- Реально действует один гард — `admin` (`nexus.users.isAdmin`); все остальные аутентифицированные пользователи равны.
- Поля `role` (`user`) и `userType` (`staff` | `freelancer`) есть в БД, но в гардах пока не используются.
- Роли Инвентаризации полностью изолированы — выдаёт её админ внутри своего приложения (см. `docs/SSO-ARCHITECTURE.md`).

## Обновление данных

После изменений в seed.ts: `pnpm db:seed`
Полный сброс: `pnpm --filter @nexus/db exec prisma migrate reset --force && pnpm db:seed`
