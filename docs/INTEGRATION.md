# Интеграция Nexus ↔ Инвентаризация

Два приложения на одной инфраструктуре с общим логином (Supabase Auth) и общим справочником сотрудников (`public.users`).

Связанные доки: `DEPLOY-RUNBOOK.md` (деплой), `USER-LIFECYCLE.md` (жизненный цикл), `SECRET-ROTATION.md` (ротация), `SSO-ARCHITECTURE.md` (концепция), `CREDENTIALS.md` (доступы, gitignored).

---

## Статус (2026-06-10)

**Оба приложения в проде, Этап 1 завершён, SSO полностью работает.**

- ✅ Nexus: `https://nexus.knzteam.ru` — мультисхема применена, Supabase Auth, онбординг, жизненный цикл (увольнение/восстановление), массовый онбординг.
- ✅ Inventory: `https://inventory.knzteam.ru` — переехал в схему `inventory`, PostgREST `db-schemas=inventory,public`, читает `public.users`.
- ✅ **SSO замкнут:** вход — портал Nexus (`/login?redirect=`), выход — `/?logout=1` (единый), токены через URL-хеш. Петли входа/логаута устранены.

**Осталось — Этап 2** (см. план ниже): `inventory.profiles` → VIEW над `public.users`.

---

## Ключевые реперные точки (архитектура)

### Инфраструктура
- **VDS** `<VDS_IP>`, домены `*.knzteam.ru` (временные → позже `*.megapolis.media`).
- **Reverse proxy** — Nginx Proxy Manager (контейнер `nginx-proxy-manager-npm-1`), SSL Let's Encrypt. Хосты: `nexus→nexus-web:80`, `auth→supabase-kong:8000` (нужен WS-тумблер для realtime), `inventory→inventory-web:80`, `db→supabase-studio:3000` (Basic Auth).
- **Self-hosted Supabase** (общий): `supabase-db`, `supabase-kong` (API-шлюз), `supabase-auth` (GoTrue), `supabase-rest` (PostgREST), `supabase-pooler` (Supavisor), `supabase-studio`.
- Приложения — **отдельные Docker-контейнеры**. Падение/деплой Nexus **не валит** inventory; существующие сессии работают (refresh через Supabase). НО: вход в оба идёт через портал Nexus → при недоступности Nexus новые входы заблокированы. Общая точка отказа — Supabase + NPM.
- Деплой обоих — CD (push в `master` → GitHub Actions → GHCR → SSH на VDS). Подробно — `DEPLOY-RUNBOOK.md`.

### Схемы БД
| Схема | Что | Пишет | Читает |
|-------|-----|-------|--------|
| `public` | `users` (тонкая идентичность, `id=auth.uid`) | **только Nexus** | оба |
| `nexus` | tasks, tracks, chats, projects, … (~23 табл.) | только Nexus | только Nexus |
| `inventory` | equipment, assignments, profiles, … | только Inventory | только Inventory |

`public.users`: `id uuid PK (=auth.uid), email, name, position, department, is_active, created_at`.

### Роли БД
- `postgres` (НЕ суперюзер в Supabase), `supabase_admin` (суперюзер), `nexus_role`, `inventory_role` (имеет `SELECT` на `public.users`).
- ⚠️ **Отклонение:** прод Nexus коннектится под `postgres` (не `nexus_role`) — т.к. `nexus_role` без `CREATE ON DATABASE` не прогоняет миграции схем. На изоляцию прикладных ролей не влияет; чистая изоляция БД — пункт плана.

### SSO (готово)
- Единый логин — **портал Nexus**. Inventory без сессии → redirect на `nexus.knzteam.ru/login?redirect=<origin>` → после входа токены в хеше → inventory поднимает сессию (`setSession`).
- Единый выход — `nexus.knzteam.ru/?logout=1` (`signOut scope:global` + чистка). «Выйти» в любом приложении ведёт сюда.
- Whitelist redirect-доменов: `*.knzteam.ru`, `*.megapolis.media` (`apps/web/src/lib/sso.ts`).
- `auth.knzteam.ru` — это **API** (Kong/GoTrue), не страница входа.

### Принцип изоляции ролей
Общий слой — только **идентичность** (`auth.users` + `public.users`). Права **внутри** каждого приложения раздаёт оно само: Nexus — `nexus.users` (isAdmin/role); Inventory — свои роли (`admin|operator|viewer`). Друг к другу не лезут.

### Регистрация и жизненный цикл (Nexus — единая точка)
- Заведение: профиль (`nexus.users`) → «Выдать доступ» (`POST /auth/onboard`) создаёт `auth.users` (временный пароль) + `public.users` + связку `auth_id`. Если email уже в `auth.users` — привязка существующего. Массово — `POST /users/bulk-onboard`.
- Первый вход — форс-смена пароля. Табельный — автоген (`S###` штат / `FL#` фрилансер).
- Увольнение (`/users/:id/deactivate`) = бан `auth.users` + `isActive=false` + снять табельный + `public.is_active=false` → вход заблокирован везде. Восстановление (`/reactivate`) = снять бан. Аккаунты не удаляем (архив). Детали — `USER-LIFECYCLE.md`.
- Саморегистрации нет.

---

## Текущий план продолжения (Этап 2 и остальное)

### A. Inventory: `profiles` → VIEW над `public.users` (главное Этапа 2)
Сейчас `inventory.profiles` — отдельная таблица-копия (данные расходятся с `public.users`; триггер `handle_new_user` плодит профили на каждый auth-аккаунт). Цель — сделать `public.users` источником идентичности, а роли вынести отдельно.

**Предусловия (Nexus, ✅):** `public.users` заполняется при онбординге (`id=auth.uid`); **массовый онбординг выполнен** — все сотрудники с корп-почтой уже в `public.users`; `inventory_role` имеет `SELECT` на `public.users`.

**⚠️ Роли не помещаются в `public.users`** (там нет `role`) → вынести в отдельную таблицу. Миграция (на стороне Inventory):
```sql
-- 1. Роли — отдельно
CREATE TABLE inventory.user_roles (user_id uuid PRIMARY KEY, role text NOT NULL DEFAULT 'viewer');
INSERT INTO inventory.user_roles (user_id, role) SELECT id, role FROM inventory.profiles ON CONFLICT DO NOTHING;

-- 2. profiles → VIEW (БЕЗ department — inventory убрал его в миграции 021)
DROP VIEW IF EXISTS inventory.profile_names;          -- зависит от profiles (миграция 019)
ALTER TABLE inventory.profiles RENAME TO profiles_old;
CREATE VIEW inventory.profiles AS
  SELECT pu.id, pu.name, ur.role, pu.email, pu.is_active
  FROM public.users pu JOIN inventory.user_roles ur ON ur.user_id = pu.id;
CREATE VIEW inventory.profile_names AS SELECT id, name FROM inventory.profiles;
```
Следствия: VIEW не записываемый → запись идентичности идёт в `public.users` (Nexus), роли — в `user_roles`; убрать триггер `handle_new_user` и `allowed_emails` (доступ = явная строка в `user_roles`, убирает протечку «домен → авто-admin»).

> ℹ️ **`department` НЕ тащим в VIEW.** Inventory убрал `department` из профилей (миграция `021_remove_departments`, функция `current_user_department()` дропнута, операторы без department-ограничений). `department` остаётся **только в Nexus** (`public.users` его хранит, но inventory им не пользуется).

### B. Nexus
- (Опц.) `DATABASE_URL` → `nexus_role` для чистой изоляции БД (выдать роли права на схемы / разделить миграционную и рантайм-роли).
- **Этап 2 жизненного цикла:** API Nexus↔Inventory — перед увольнением спрашивать у inventory разрешение (незданное оборудование), ручной аппрув. Проверка оборудования: `SELECT FROM inventory.employee_assignments WHERE user_id=$1 AND returned_at IS NULL`. Детали — `USER-LIFECYCLE.md`.
- (Опц.) RLS на `public.users` — только с политиками (иначе сломает чтение inventory). Не срочно.

### C. Сквозное
- **Ротация секретов** (JWT_SECRET, пароль БД были в истории git) — по `SECRET-ROTATION.md`.
- **Миграция домена** `knzteam.ru → megapolis.media` — DNS + NPM + `cd.yml` build-args (`VITE_*`) + `.env` + Supabase URL. Whitelist уже включает megapolis.
- **SMTP** в Supabase — для писем (восстановление пароля, magic link). Сейчас нет → пароли выдаём временные вручную.

---

## Соглашение об именовании
snake_case таблицы (мн.ч.), `user_id` для ссылки на пользователя, `id uuid` PK, `created_at timestamptz`, булевы `is_*`.
