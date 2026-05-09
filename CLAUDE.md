# CLAUDE.md

Навигационная карта для Claude Code. Читается автоматически при старте сессии.

---

## 🔄 ТЕКУЩЕЕ СОСТОЯНИЕ ПРОЕКТА (обновлено 2026-05-08)

**Идёт глобальный rebuild V2.** Детальный план с чекбоксами — в `docs/dev-plan-v2.md`.

| Фаза | Статус | Коммит |
|------|--------|--------|
| Фаза 0: чистая схема (StatusRow→WorkItem, Role→RBAC) | ✅ DONE | `03eff5f`, `b6c7c62` |
| Фаза 1: /projects + /work-items + WorkflowPage | ✅ DONE | `0711814` |
| Фаза 2: /departments + /dept-wi-links + DeptBoard + AdminDept | ✅ DONE | `ef6ee2f` |
| Фаза 3: Task-система (TasksPage полноценный + overdue cron) | ✅ DONE | `7cbb66c` |
| Фаза 4: Три вида отдела (Календарь, Гантт, Доска) | ✅ DONE | `8034fc8` |
| Фаза 5–6: HR, Студии, Аналитика | ⬜ следующая |

**Ключевые изменения схемы (важно — весь код до rebuild'а устарел):**
- `status_rows` таблица → `work_items` (модель `WorkItem`)
- `StatusRowStatus` (9 значений) → `WIStatus`: `draft | active | done | cancelled | rejected`
- `StatusRowSource` → `WorkItemSource`: `sync | manual | separator | internal`
- `Role` enum на `User` **удалён** — авторизация через RBAC-таблицы (`AppRole`, `UserAppRole`, `RolePermission`)
- Новая таблица `projects` (модель `Project`) — родитель для `WorkItem`
- `WorkItem.parentWiId` (было `parent_task_id`) — иерархия WI → дочерние (отделы)
- **Все ID-колонки — тип `TEXT`** в PostgreSQL (не native uuid). В raw SQL никогда не используй `::uuid` — будет ошибка `operator does not exist: text = uuid`

**Новые роуты Day 3 (Фаза 1):**
- `GET/POST/PATCH/DELETE /projects` — `apps/api/src/routes/projects.ts`
- `GET/POST /projects/:id/work-items` — вложенный в projects.ts
- `GET/POST/PATCH/DELETE /work-items` — `apps/api/src/routes/workItems.ts`
- `POST/GET /work-items/:id/dept-links` — привязка отдела к WI (в workItems.ts)

**Новые роуты Day 4 (Фаза 2):**
- `GET/POST/PATCH/DELETE /departments` — `apps/api/src/routes/departments.ts`
- `GET /departments/:id/members`, `POST /departments/:id/members`, `DELETE /departments/:id/members/:userId`
- `GET /departments/:id/board` — WI сгруппированные по DeptWILink.substatus
- `PATCH /dept-wi-links/:id/substatus`, `DELETE /dept-wi-links/:id` — `apps/api/src/routes/deptWiLinks.ts`

**WorkflowPage** переключён на `/work-items`, статусы: Заявка(`draft`) → Реализация(`active`) → Сдан(`done`).

**Новые страницы (Day 4):**
- `DeptBoardPage.tsx` — канбан-доска отдела, колонки: Не начат / В работе / Завершён
- `AdminDeptPage.tsx` — управление отделами (только admin): дерево, создание, участники
- В AppShell: `deptboard` (всем) + `admindept` (только admin)

---

## 📖 Порядок чтения перед работой

| Зона задачи | Сначала читай |
|-------------|---------------|
| Текущие задачи, приоритеты rebuild'а | `docs/dev-plan-v2.md` — **источник правды** |
| Схема БД, миграции | `packages/db/prisma/schema.prisma` |
| Синхронизация / парсер матриц | `docs/03-data-sources.md` + `docs/05-architecture.md` |
| Авторизация, роли, permissions | `apps/api/src/config/permissions.ts` + `apps/api/src/plugins/auth.ts` |
| Деплой, Docker | `docs/08-deploy.md` |
| Первый запуск | `docs/07-dev-setup.md` |
| CI/CD | `docs/11-github-workflow.md` |

**Не трогай `docs/DONE.md` и `docs/TODO.md`** — логи прошлого, не план.

---

## ⚙️ Рабочие правила

> **`RULES.md` в корне проекта — обязателен к прочтению перед любой новой фичей.**
> Там полный чеклист: реактивность данных, polling, API-стандарты, чеклисты для роутов и страниц.

1. **`pnpm test` должен давать 163 теста, 0 провалов.** Тесты требуют запущенной тест-БД (`docker compose -f docker-compose.dev.yml up -d`). Если БД не запущена — тесты падают с `PrismaClientInitializationError`, это ожидаемо.
2. **Перед архитектурным решением** — читай `docs/dev-plan-v2.md`. Там уже приняты решения по всем крупным вопросам.
3. **Актуальную документацию библиотек** бери через `context7` MCP (React 19, Fastify v4, Prisma v5).
4. **Не трогай** `/status-rows` роут и `statusRows.ts` — они живут параллельно для SyncDataPage и других старых компонентов. Новый код — только в `projects.ts` / `workItems.ts` / `departments.ts`.
5. **Каждый `useMutation` обязан** вызывать `qc.invalidateQueries(...)` в `onSuccess` для всех затронутых ключей — см. таблицу инвалидации в `RULES.md`.
6. **Критичные страницы** (Workflow, DeptBoard, Calendar, Tasks) обязаны иметь `refetchInterval: 30_000` на ключевых запросах.

---

## 🎯 Обзор проекта

**TV Shifts** — full-stack веб-приложение для управления сменами, нагрузкой и расписанием проектов на телепроизводстве. Синхронизируется с Google Sheets. UI на русском.

**Масштаб:** ~60 пользователей, 10–15 ролей, интеграции с Google Sheets / Drive.

---

## 🏗 Структура монорепо

pnpm workspace, три пакета:
- `apps/api` — Fastify backend (порт 4000)
- `apps/web` — React + Vite frontend (порт 5173)
- `packages/db` — Prisma schema + миграции + seed

---

## 🔧 Основные команды

```bash
# Запуск
.\start.ps1          # Windows, раздельные окна
pnpm dev             # кроссплатформенно

# БД (PostgreSQL на порту 5433 в dev)
docker compose -f docker-compose.dev.yml up -d

# Тесты
pnpm test                                              # всё (цель: 163/163)
pnpm --filter @tv-shifts/api test                      # только API
pnpm --filter @tv-shifts/web test                      # только Web
pnpm --filter @tv-shifts/api exec vitest run src/routes/projects.test.ts  # один файл

# TypeScript
pnpm --filter @tv-shifts/api build
pnpm --filter @tv-shifts/web exec tsc --noEmit

# БД (Prisma)
pnpm db:generate      # перегенерация клиента
pnpm db:migrate       # применение миграций (dev)
pnpm db:migrate:test  # тест-БД
pnpm db:seed          # тестовые данные (11 отделов + пользователи + RBAC)
pnpm db:studio        # GUI
```

**API-тесты** — интеграционные, реальный PostgreSQL, `buildApp()` из `apps/api/src/test/helpers.ts`. Фабрики — `apps/api/src/test/factories.ts`. Режим `singleThread`.

> ⚠️ `buildApp()` **не регистрирует** роуты Фазы 1–2 (`projectsRoutes`, `workItemsRoutes`, `departmentsRoutes`, `deptWiLinksRoutes`). Тесты этих роутов создают свой `FastifyInstance` напрямую внутри тестового файла — см. паттерн в `projects.test.ts`.

**Web-тесты** — Vitest + RTL + MSW (`apps/web/src/test/msw-server.ts`).

---

## 🧱 Архитектура — ключевое

### Поток данных
1. Frontend (React) → HTTP → Fastify API
2. Fastify → Prisma → PostgreSQL
3. Sync — только вручную через `POST /sync/trigger`. Автокрон не реализован.

### Auth
JWT, две httpOnly cookies: `access_token` (15 мин), `refresh_token` (7 дней, scoped на `/auth/refresh`).

**RBAC (новая система):** роли хранятся в `AppRole` + `UserAppRole`, права — в `RolePermission`. JWT содержит массив `roles[]` и `permissions[]`. На `User` нет поля `role`.

`requirePermission(permission)` и `requireRole(...roles)` — в `apps/api/src/plugins/auth.ts`.

Fallback (когда RBAC-таблицы пусты): `ROLE_PERMISSIONS` в `apps/api/src/config/permissions.ts`.

### Состояние фронтенда
- **TanStack Query** — серверное состояние
- **Zustand** — только auth (`stores/auth.ts`)
- **Inline styles** — UI-библиотек нет (не предлагай shadcn/MUI/Tailwind)
- **Навигация** — `useState<Page>` в `AppShell.tsx` (React Router нет, не предлагай)
- Страницы: `calendar | workflow | analytics | users | tasks | profile | syncdata | deals | database | deptboard | admindept | projects`

### API-роуты

| Префикс | Файл | Примечание |
|---------|------|-----------|
| `/auth` | `routes/auth.ts` | |
| `/users` | `routes/users.ts` | |
| `/projects` | `routes/projects.ts` | **Фаза 1** — Project CRUD |
| `/work-items` | `routes/workItems.ts` | **Фаза 1** — WorkItem CRUD + авто-триггер Project.status + dept-links |
| `/departments` | `routes/departments.ts` | **Фаза 2** — Dept CRUD + members + board |
| `/dept-wi-links` | `routes/deptWiLinks.ts` | **Фаза 2** — substatus PATCH + DELETE + авто-триггер WI.status |
| `/status-rows` | `routes/statusRows.ts` | legacy — используется SyncDataPage, sync-сервисом |
| `/shifts` | `routes/shifts.ts` | |
| `/tasks` | `routes/tasks.ts` | |
| `/calendar/events` | `routes/calendarEvents.ts` | **Фаза 4** — CalendarEvent CRUD |
| `/notifications` | `routes/notifications.ts` | |
| `/sync` | `routes/sync.ts` | |
| `/change-logs` | `routes/changeLogs.ts` | |
| `/analytics` | `routes/analytics.ts` | |
| `/deals` | `routes/deals.ts` | |
| `/database` | `routes/database.ts` | |
| `/matrix-templates` | `routes/matrixTemplates.ts` | |
| `/internal-matrix` | `routes/internalMatrix.ts` | |
| `/project-members` | `routes/projectMembers.ts` | |
| `/shift-expenses`, `/matrix-gantt`, `/matrix-notes`, `/matrix-documents` | `routes/matrixExtras.ts` | |
| `/kanban-tasks` | `routes/kanbanTasks.ts` | |

### Prisma — актуальные enum'ы

```
WIStatus         draft | active | done | cancelled | rejected
WorkItemSource   sync | manual | separator | internal
ProjectStatus    draft | active | done | cancelled | rejected
FinancialFlag    pending | paid
DeptType         production | support | internal
DeptSubstatus    not_started | in_progress | done
EmploymentType   staff | ip_7 | ip_8 | ip_10 | szt
ShiftType        zastroyka | efir | demontazh
NotificationType no_matrix | unmatched_name | data_conflict | schedule_change | task_assigned | task_overdue | task_closed | wi_status_changed | project_status_changed | dept_connected_to_wi | hr_request_created | hr_request_resolved | studio_conflict | meeting_invite
DealStatus       preliminary | in_progress | completed
TaskStatus       open | in_progress | done
ApprovalStatus   pending | approved | rejected
BookingStatus    preliminary | confirmed | blocked
HRStatusType     vacation | sick | remote | business_trip | day_off
ShiftSource      matrix | manual
SyncType         projects | registry | matrix
SyncStatus       running | success | error
ChangeSource     sync | manual
DayType          zastroyka | efir | deadline | semka
```

### Permissions (актуальные, включая Фазу 2)

```
analytics:read, sync:trigger, sync:logs, sync:admin
projects:write, projects:config
deals:write, shifts:write, tasks:write
matrix:write, matrix-templates:manage, internal-matrix:manage
members:read, members:write, members:bulk
users:manage, database:manage, kanban:delete
departments:manage   ← новый (Фаза 2), только admin
```

---

## ⚠️ Важные технические нюансы

### Raw SQL — ID-колонки это TEXT, не uuid

Все `@id` в schema.prisma используют `@default(uuid())` без `@db.Uuid` → PostgreSQL создаёт колонки как `TEXT NOT NULL`.

```typescript
// ❌ НЕВЕРНО — вызовет: operator does not exist: text = uuid
`WHERE id = $1::uuid`
`WHERE matrix_registry_id = $1::uuid`

// ✅ ВЕРНО — текстовое сравнение, каст не нужен
`WHERE id = $1`
`WHERE id = ANY($1::text[])`   // для массивов
```

### Schema drift

После rebuild V2 большинство полей `WorkItem` уже **в Prisma-схеме** (`schema.prisma`). Через raw SQL нужны только поля в таблице `project_members`, которые не вошли в модель:
- `employment_type`, `rate_plan`, `rate_fact`, `is_approved`, `field_approvals` (JSONB), `group_name`

`WorkItem.fieldApprovals`, `WorkItem.groupSchedule`, `WorkItem.parentWiId` — **уже в schema.prisma**, доступны через Prisma Client напрямую.

### Enum-касты в raw SQL
Enum-значения требуют явного каста:
```typescript
`UPDATE work_items SET source = 'separator'::"WorkItemSource" WHERE id = $1`
```

---

## ⚠️ Принятые компромиссы

- **Навигация через `useState<Page>`** — React Router не нужен, не предлагай.
- **Inline styles** — без UI-библиотек, сознательно.
- **Sync только вручную** — `node-cron` зарегистрирован. Cron-job для просроченных задач: `apps/api/src/jobs/overdueChecker.ts` (каждый час).
- **`/status-rows` роут живёт параллельно с `/work-items`** — SyncDataPage и InternalShiftsPanel ещё на нём. Постепенная миграция.
- **Google Sheets — read-only.** Запись — только через Drive API для внутренних матриц.

---

## 🔗 Google Sheets + Drive

- **Sheets API v4** через Service Account (`GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY`).
- **Drive API** через OAuth2 (`GOOGLE_DRIVE_CLIENT_ID/SECRET/REFRESH_TOKEN/OWNER_EMAIL`) — `driveService.ts`.
- **Sync flow:** `syncService.ts::runFullSync()` → `syncProjects()` → `syncRegistry()` → `syncMatrix()`. Задержка 1500ms между матрицами, ретрай 3× на 429/503.
- **Internal matrices** (`source = 'internal'`) создаются через `POST /internal-matrix`. ID: `INT-{timestamp}`.
- **`matrixBlockSync.ts`** — когда `WorkItem` имеет `matrixRegistryId + blockSlot`, `syncProjectBlock(id)` пишет данные в блок Google Sheet (дебаунс 3с).

### Парсер матрицы (лист «₽ СМЕНЫ» или «₽ СПЕЦИАЛИСТЫ»)
```
Строка 2:   даты для колонок J–P
Строки 4+:  C=ФИО  G=функция  I=тип занятости  J–P=маркеры (1 = работает)
Тип смены:  J,K,L → zastroyka | M → efir | N,O,P → demontazh
```

---

## 📐 Авто-триггеры статусов (каскад)

Реализованы автоматические переходы при смене статуса:

```
WorkItem.status → active
  → если Project.status == draft → Project.status = active

WorkItem.status → done (или все DeptWILink.substatus == done)
  → если все WI проекта done → Project.status = done

DeptWILink.substatus → done (все привязки отдела к WI)
  → WorkItem.status = done
  → далее по цепочке выше
```

Код авто-триггеров:
- `workItems.ts::syncProjectStatus()` — триггер от WI
- `deptWiLinks.ts::syncWIStatusFromDepts()` — триггер от DeptWILink

---

## 📐 Архитектура WorkflowPage

`WorkflowPage.tsx` — воронка задач на `/work-items`.

**Pipeline:** Заявка(`draft`) → Реализация(`active`) → Сдан(`done`) + [Не согласован(`rejected`)] [Отменён(`cancelled`)]

**API:** `GET /work-items?source=manual&topLevelOnly=true`

**Drag:** только один шаг вперёд; в rejected/cancelled — из любого. Переход draft→active требует: клиент + матрица + отделы (guard-попап).

**Иерархия:** `WorkItem.parentWiId` → дочерние WorkItem'ы (отделы). `GET /work-items/children-summary?parentIds=...` — батч для чипов.

`TaskDetailPanel.tsx` (~450 строк) — боковая панель задачи.

---

## 📐 Архитектура DeptBoardPage (Фаза 2)

`DeptBoardPage.tsx` — канбан-доска отдела по подстатусу.

**API:** `GET /departments/:id/board` → `{ not_started: DeptWILink[], in_progress: DeptWILink[], done: DeptWILink[] }`

Каждый `DeptWILink` включает вложенный `workItem` (имя, клиент, формат, дата, проект).

Смена статуса: `PATCH /dept-wi-links/:id/substatus` → авто-триггер если все отделы done.

---

## 📐 Архитектура InternalShiftsPanel

`InternalShiftsPanel.tsx` (~2500 строк) — центральный UI смен внутренних матриц.

**Группы** по `project_members.group_name`. Зависят от `WorkItem.location`:
- `Выезд*` → `VIEZD_GROUPS`: Сбор, Завоз, Монтаж, Эфир, Демонтаж, Вывоз
- `Знаменка*` → `STUDIO_GROUPS`: Сбор, Монтаж, Эфир, Демонтаж
- Менеджмент → единый блок

**`group_schedule`** (JSONB в `work_items`, поле `groupSchedule` в Prisma) — расписание групп по ключу группы. Мерж через `|| $1::jsonb`. Null-значение = удаление ключа.

**Micro-tabs:** `team | planner | expenses | freelancers`. `FreelancersPage` — только саб-таб, не самостоятельная страница.

**KanbanBoard** — для `CREATIVE_FORMATS` (Моушн, Постпродакшн, Дизайн, Саунд-дизайн, Радио, Не профильный).

---

## 📐 Архитектура SyncDataPage

Три уровня фильтров: Primary → Column → Visibility (все в localStorage).

**Нюансы:**
- `FilterGroup` — на уровне модуля (не внутри компонента), иначе скролл сбрасывается.
- `overflow: clip`, не `hidden` — иначе ломается `position: sticky`.

Содержит UI для: внутренних матриц (`/internal-matrix/*`), project members (`/project-members/*`), matrix linking (привязка `MatrixRegistry` к `WorkItem`).

---

## 📋 Прочие нюансы

**Change Log.** `services/changeLog.ts::logChanges(entityType, entityId, old, new, changedBy)`. Роут `/change-logs`.

**Separator rows.** `WorkItem` с `source='separator'` — разделители месяцев из sync. В list-эндпоинтах всегда исключай: `NOT: { source: 'separator' as any }`.

**Notifications.** `userId=null` — глобальные. Per-user прочитанность: `user_notification_reads`. `NotificationBell` поллит `/notifications/count` каждые 30с.

**Deal.** Группирует `WorkItem` с `MatrixRegistry`. Связи через `DealWorkItem` и `DealMatrix`.

**Matrix Extras** (`routes/matrixExtras.ts`):

| Префикс | Таблица | Scope |
|---------|---------|-------|
| `/shift-expenses` | `shift_expenses` | `project_id` (WorkItem UUID) |
| `/matrix-gantt` | `gantt_tasks` | `matrix_id` |
| `/matrix-notes` | `matrix_notes` | `matrix_id` |
| `/matrix-documents` | `matrix_documents` | `matrix_id` |

---

## 🧑‍💻 Тестовые аккаунты (после сида)

| Email | Пароль | Роль |
|-------|--------|------|
| admin@tvshifts.ru | admin123 | admin |
| producer@tvshifts.ru | user123 | producer |
| ivanov@tvshifts.ru | user123 | employee |
| petrov@tvshifts.ru | user123 | employee |
| sidorova@tvshifts.ru | user123 | employee |

Seed также создаёт 11 отделов: Продюсерский центр + ТВ, Радио, Дизайн, Бренд медиа, Корп. медиа (production); Технический, Спецпроекты (support); Финансы, Персонал, Администрация (internal).

---

## 🌍 Environment

`.env` — в корне монорепо (не в `apps/api/`). Ключевые переменные:

```
DATABASE_URL              postgres connection string
TEST_DATABASE_URL         отдельная БД для тестов
JWT_SECRET                случайная строка
WEB_URL                   origin фронта (CORS)
GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY
GOOGLE_PROJECTS_SHEET_ID + GOOGLE_REGISTRY_SHEET_ID
GOOGLE_DRIVE_CLIENT_ID/SECRET/REFRESH_TOKEN/OWNER_EMAIL
VITE_API_URL              встраивается в бандл при сборке — меняй до vite build
```

---

## 🚀 Production

```bash
docker compose -f docker-compose.prod.yml up -d
```

`migrate:deploy` в `packages/db` применяет миграции без перегенерации клиента.

---

## 📊 Статус страниц

| Страница | Файл | Статус |
|----------|------|--------|
| Login | `LoginPage.tsx` | ✅ |
| Calendar | `CalendarPage.tsx` | ✅ |
| Workflow | `WorkflowPage.tsx` | ✅ — draft/active/done, `/work-items` |
| Task Card | `TaskDetailPanel.tsx` | ✅ |
| Dept Board | `DeptBoardPage.tsx` | ✅ Фаза 2 — канбан по substatus |
| Admin Dept | `AdminDeptPage.tsx` | ✅ Фаза 2 — управление отделами (admin) |
| Sync Data | `SyncDataPage.tsx` | ✅ (ещё на `/status-rows`, миграция позже) |
| Users | `UsersPage.tsx` | ✅ |
| Deals | `DealsPage.tsx` | ✅ |
| Database | `DatabasePage.tsx` | ✅ |
| Notifications | `NotificationBell` в `AppShell.tsx` | ✅ |
| Shift Planner | `ShiftPlanner.tsx` | ✅ (саб-таб InternalShiftsPanel) |
| Freelancers | `FreelancersPage.tsx` | ✅ (саб-таб InternalShiftsPanel) |
| OrgChart | `OrgChartTab.tsx` | ✅ (саб-таб UsersPage) |
| Tasks | `TasksPage.tsx` | ✅ Фаза 3 — канбан, Мои/Все, фильтр по отделу, polling |
| Dept Page | `DeptPage.tsx` | ✅ Фаза 4 — 3 вкладки: Доска/Событийный/Гантт |
| Projects Board | `ProjectsPage.tsx` | ✅ Фаза 4 — глобальный канбан проектов |
| Analytics | `AnalyticsPage.tsx` | 🚧 |
| Profile | `ProfilePage.tsx` | 🚧 |
