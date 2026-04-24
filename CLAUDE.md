# CLAUDE.md

Этот файл — навигационная карта для Claude Code при работе в репозитории **TV Shifts**. Читается автоматически при старте сессии. Главный принцип: быть _тонким_ — детали лежат в `docs/` и `schema.prisma`, здесь только то, что нужно знать прямо сейчас.

---

## 📖 Порядок чтения перед работой

Сверяйся с этим списком **до** того, как начинаешь менять код. Если задача попадает в одну из зон — открой соответствующий файл до того, как предлагать решение.

| Зона задачи | Сначала читай |
|-------------|---------------|
| Изменение схемы БД, миграции, новые таблицы | `docs/04-database-schema.md` + `packages/db/prisma/schema.prisma` |
| Правка синхронизации / парсера матриц | `docs/03-data-sources.md` + `docs/05-architecture.md` (секция «Парсер матрицы») |
| Авторизация, роли, permissions | `docs/10-roles-and-scale.md` (обязательно — там целевая RBAC-модель) |
| Деплой, Docker, production | `docs/08-deploy.md` |
| Мониторинг, логирование, метрики | `docs/09-observability.md` |
| Первый запуск на машине | `docs/07-dev-setup.md` |
| Приоритеты, текущие задачи | `docs/TODO.md` — **источник правды** по тому, что делать и в каком порядке |
| Что уже сделано | `docs/DONE.md` |

При расхождении между этим файлом и `docs/TODO.md` — **TODO.md авторитетнее**.

---

## ⚙️ Рабочие правила для Claude в этом проекте

1. **Перед крупным архитектурным решением** (новая таблица, изменение auth, интеграция) — используй `sequentialthinking` MCP. Это проект масштаба 60 пользователей / 10–15 ролей / внешние интеграции, одношаговые ответы здесь почти всегда неполные.
2. **Актуальную документацию библиотек** (Fastify, Prisma, TanStack Query, FullCalendar и т.д.) бери через `context7` MCP, а не из памяти — версии в проекте свежие (React 19, Fastify v4, Prisma v5).
3. **Архитектурные решения, которые уже приняты** — храни в `memory` MCP под ключами `tv-shifts:decision:*`. Если собираешься предложить решение, которое противоречит уже записанному — явно это отметь в ответе.
4. **Фазы развития проекта (Ф0→Ф4)** из `docs/10-roles-and-scale.md` — это последовательность. Не предлагай Ф2 (RBAC), если Ф0 (изоляция тест-БД) ещё не сделана. `permissions.ts` и structured logging из Ф0 уже реализованы.
5. **Не предлагай решения, которые уже отвергнуты** в пользу осознанных компромиссов. См. блок «Принятые компромиссы» ниже.
6. **Не трогай `docs/DONE.md`** — это лог, не план.
7. **При работе с кодом — всегда проверяй тесты.** Цель: `pnpm test` → `163 теста, 0 провалов` (на 2026-04-20). Если падает больше — что-то сломано.

---

## 🎯 Обзор проекта

**TV Shifts** — full-stack веб-приложение для управления сменами, нагрузкой и расписанием проектов на телепроизводстве. Синхронизируется с Google Sheets для импорта данных. UI и документация на русском.

**Целевой масштаб:** ~60 пользователей, ~15 одновременных, 10–15 ролей, интеграции с Битрикс24 и сервером техники.

---

## 🏗 Структура монорепо

pnpm workspace, три пакета:
- `apps/api` — Fastify backend (порт 4000)
- `apps/web` — React + Vite frontend (порт 5173)
- `packages/db` — Prisma schema + миграции + seed

Подробная структура папок — в `docs/05-architecture.md`.

---

## 🔧 Основные команды

Полный список — в `docs/07-dev-setup.md`. Здесь — самое частое:

```bash
# Запуск (Windows, раздельные окна)
.\start.ps1

# Запуск API + Web параллельно (кроссплатформенно)
pnpm dev

# БД отдельно для локальной разработки (PostgreSQL на порту 5433 в dev)
docker compose -f docker-compose.dev.yml up -d

# Тесты
pnpm test                                 # всё
pnpm --filter @tv-shifts/api test         # только API
pnpm --filter @tv-shifts/web test         # только Web
pnpm --filter @tv-shifts/api exec vitest run src/routes/users.test.ts  # один файл

# TypeScript-проверка
pnpm --filter @tv-shifts/web exec tsc --noEmit
pnpm --filter @tv-shifts/api build

# БД (Prisma)
pnpm db:generate    # перегенерация клиента
pnpm db:migrate     # применение миграций
pnpm db:seed        # тестовые данные
pnpm db:studio      # GUI
```

**API-тесты** — интеграционные, используют `buildApp()` из `apps/api/src/test/helpers.ts` и реальный PostgreSQL через `app.inject()`. БД должна быть запущена. Фабрики данных — в `apps/api/src/test/factories.ts`, убирай созданное в `afterEach`/`afterAll`. Запуск в `singleThread` — одно соединение на все тесты.

**Web-тесты** — Vitest + `@testing-library/react` + MSW. Сервер MSW: `apps/web/src/test/msw-server.ts`, поднимается глобально в `apps/web/src/test/setup.ts`.

---

## 🧱 Архитектура — ключевое

### Поток данных
1. Frontend (React) → HTTP → Fastify API
2. Fastify → Prisma → PostgreSQL
3. Sync запускается **только вручную** через `POST /sync/trigger` (admin/producer). Автокрон **не реализован** — `node-cron` установлен, но в `server.ts` не зарегистрирован.

### Старт сервера
`apps/api/src/server.ts` ждёт PostgreSQL (30 попыток × 2с) перед стартом. На каждом старте **все записи `SyncLog` удаляются** — история синхронизаций не переживает рестарт. Порт API: `PORT` env (default 4000).

### Auth
JWT, две httpOnly cookies: `access_token` (15 мин, все пути), `refresh_token` (7 дней, scoped на `/auth/refresh`). `@fastify/jwt` читает cookie автоматически. На фронте — Zustand store (`apps/web/src/stores/auth.ts`), axios-interceptor в `apps/web/src/lib/api.ts` делает автоматический retry на 401 через `/auth/refresh` (interceptor пропускает `/auth/*`, чтобы не было петли).

`POST /auth/login` ограничен rate limit (10 req/min через `@fastify/rate-limit`; плагин `global: false`, остальные роуты без лимита).

Auth guard: `apps/api/src/plugins/auth.ts` — либо `request.jwtVerify()` внутри обработчика, либо `authenticate` / `requireRole(...roles)` как preHandler. `requireRole` принимает несколько ролей: `requireRole('admin', 'producer')`.

### Состояние фронтенда
- **TanStack Query** — всё серверное состояние (fetch, cache, invalidation)
- **Zustand** — только auth (`stores/auth.ts`). Хелперы: `useAuthInit()` (грузит `/auth/me` при старте), `useCurrentUser()`, `useIsAdmin()`, `useIsProducer()` в `apps/web/src/hooks/useAuth.ts`
- **Inline styles** — UI-библиотеки нет (ни shadcn/ui, ни MUI, ни Tailwind)
- **FullCalendar** — только в `CalendarPage.tsx`
- **Навигация** — `useState<Page>` в `AppShell.tsx` (React Router нет). Страницы: `calendar | workflow | analytics | users | tasks | profile | syncdata | deals | database`. Текущая страница — в `localStorage` под ключом `app-page`. Гард проверяет роль, так что манипуляция localStorage не поможет обойти защиту.
- Auth-gate в `App.tsx`: не залогинен → `LoginPage`, залогинен → `AppShell`

### API-роуты (регистрируются в корне, без префикса `/api`)

| Префикс | Файл |
|---------|------|
| `/auth` | `apps/api/src/routes/auth.ts` |
| `/users` | `apps/api/src/routes/users.ts` |
| `/status-rows` | `apps/api/src/routes/statusRows.ts` |
| `/shifts` | `apps/api/src/routes/shifts.ts` |
| `/tasks` | `apps/api/src/routes/tasks.ts` |
| `/notifications` | `apps/api/src/routes/notifications.ts` |
| `/sync` | `apps/api/src/routes/sync.ts` |
| `/change-logs` | `apps/api/src/routes/changeLogs.ts` |
| `/analytics` | `apps/api/src/routes/analytics.ts` |
| `/deals` | `apps/api/src/routes/deals.ts` |
| `/database` | `apps/api/src/routes/database.ts` |
| `/matrix-templates` | `apps/api/src/routes/matrixTemplates.ts` |
| `/internal-matrix` | `apps/api/src/routes/internalMatrix.ts` |
| `/project-members` | `apps/api/src/routes/projectMembers.ts` |
| `/shift-expenses`, `/matrix-gantt`, `/matrix-notes`, `/matrix-documents` | `apps/api/src/routes/matrixExtras.ts` |
| `/kanban-tasks` | `apps/api/src/routes/kanbanTasks.ts` |

### Prisma — ключевые enum'ы
- `Role` — `employee | admin | producer` (**временно!** Ф2 плана — миграция на таблицу `roles`)
- `StatusRowStatus` — `request | negotiation | preproduction | production | postproduction | delivered | rejected | cancelled | manual`
- `StatusRowSource` — `projects_table | manual | separator`
- `EmploymentType` — `staff | ip_7 | ip_8 | ip_10 | szt`
- `ShiftType` — `zastroyka | efir | demontazh`
- `NotificationType` — `no_matrix | unmatched_name | data_conflict | schedule_change`
- `DealStatus` — `preliminary | in_progress | completed`

Полный список моделей и enum'ов — в `packages/db/prisma/schema.prisma` и `docs/04-database-schema.md`.

---

## ⚠️ Принятые компромиссы (осознанные — не предлагай менять без уважительной причины)

- **Навигация через `useState<Page>`, а не React Router.** Deep links и браузерная история не нужны сейчас. В `docs/TODO.md` → «Пожелания» есть пункт миграции на React Router v6 — когда понадобятся deep links.
- **Role как enum из 3 значений.** Будет мигрировано на таблицу `roles` + `user_roles` + `role_permissions` в Фазе 2 плана масштабирования. До тех пор — используй существующий `requireRole`.
- **Инлайн-стили вместо UI-библиотеки.** Сознательно. Не предлагай shadcn/ui / MUI / Tailwind.
- **Sync только вручную.** Автокрон осознанно выключен — проект активно развивается, и ручной контроль важен. `node-cron` установлен но не зарегистрирован в `server.ts`. Есть пункт в TODO → «Пожелания».
- **`pg-boss` для очередей, не BullMQ.** Чтобы не тянуть Redis. Будет пересмотрено, если Redis появится по другой причине.
- **Google Sheets — read-only.** Запись — только через Drive API для внутренних матриц. Не предлагай писать обратно в исходные Sheets.

---

## 🚧 Schema drift — предупреждение

`ProjectMember` и `StatusRow` в `schema.prisma` **не содержат** полей, добавленных через raw SQL миграции. Prisma-клиент про них не знает, весь доступ — через `$queryRawUnsafe`:

- `project_members`: `employment_type`, `rate_plan`, `rate_fact`, `is_approved`, `field_approvals` (JSONB), `group_name`
- `status_rows`: `field_approvals` (JSONB), `group_schedule` (JSONB), `parent_task_id` (TEXT, FK → `status_rows.id` CASCADE DELETE)

**При регенерации Prisma-клиента эти поля исчезнут из рантайма, но останутся в БД.** Задача на рефакторинг (отдельная Prisma-модель или view) — в `docs/TODO.md` → «Технический долг».

### Workaround для залоченного Prisma client
Запущенный API-процесс держит DLL Prisma клиента. Если нужно применить миграцию без перегенерации клиента:
```bash
cd packages/db && DATABASE_URL="..." npx prisma migrate dev --skip-generate
```

Или raw SQL через `$executeRawUnsafe` с явными кастами enum'ов:
```typescript
await prisma.$executeRawUnsafe(
  `UPDATE "status_rows" SET source = 'separator'::"StatusRowSource" WHERE id = $1`,
  id
)
```

---

## 🔗 Google Sheets + Drive

Полная архитектура — в `docs/05-architecture.md` и `docs/03-data-sources.md`. Кратко:

- **Sheets API v4** через Service Account (`GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY`) или `GOOGLE_API_KEY` для публичных таблиц. Per-table ключи в `sheet_configs` перекрывают глобальные.
- **Drive API** через **OAuth2** (отдельные креды: `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN`, `GOOGLE_DRIVE_OWNER_EMAIL`). Используется `apps/api/src/services/driveService.ts`.
- **Sync flow:** `syncService.ts::runFullSync()` → `syncProjects()` → `syncRegistry()` → `syncMatrix()` для каждой. Задержка 1500ms между матрицами. Ретрай 3 раза на 429/503 с задержками 3с/6с.
- **Sync abort:** `requestSyncAbort()` ставит флаг, матричный цикл проверяет его перед каждой матрицей. `POST /sync/stop` → вызов. `_abortRequested` сбрасывается в начале каждого нового `runFullSync()`.
- **Shifts cache:** `shifts_cache` (JSONB) и `has_shifts_data` на `MatrixRegistry` сохраняются **до** матчинга имён — чтобы UI подсветил строки сразу.
- **Internal matrices** (`source = 'internal'` в `matrix_registry`) создаются через `POST /internal-matrix`. ID формат: `INT-{timestamp}`. Drive folder ID — в `sheet_configs` под ключом `drive_folder` (в колонке `sheet_url` — naming convention, не баг).
- **`matrixBlockSync.ts`:** когда `StatusRow` имеет `matrixRegistryId` + `blockSlot`, `syncProjectBlock(projectId)` пишет данные проекта обратно в соответствующий блок листа.

### Парсер матрицы (лист «₽ СМЕНЫ» или «₽ СПЕЦИАЛИСТЫ»)
```
Строка 2:   даты для колонок J–P
Строки 4+:  C=ФИО  G=функция  I=тип занятости  J–P=маркеры (1 = работает)

Тип смены:
  J, K, L  → zastroyka  (до даты проекта)
  M        → efir       (день проекта)
  N, O, P  → demontazh  (после даты проекта)
```
Строка включается, если есть хотя бы одно непустое поле в C/G/I/J–P. «Итог:»-строки пропускаются. `ShiftEntry` создаётся только для `type='staff'`; ИП/СЗТ — только `ProjectAssignment`.

---

## 📐 Архитектура WorkflowPage + TaskDetailPanel

`WorkflowPage.tsx` (~1000 строк) — воронка задач. Два вида контента:
- **Pipeline-бар**: Запрос → Подключение к проекту → Производство → Сдан + [Не согласован] [Отменён]
- **Таблица задач**: `GET /status-rows?source=manual&topLevelOnly=true` — показывает только верхнеуровневые задачи, без отделов-детей

**Drag-and-drop** — pointer events, ghost-карточка. Правило: только один шаг вперёд; в Не согласован/Отменён — из любого. Переход connecting→production требует привязанной матрицы (guard-попап с дропдауном или формой создания).

**Иерархия задача → отдел**: `StatusRow.parent_task_id` (TEXT, CASCADE DELETE). Отделы — дочерние `StatusRow` с `parent_task_id = taskId`. `GET /status-rows/children-summary?parentIds=...` — батч-эндпоинт для чипов на карточках. `topLevelOnly=true` — фильтрует только корневые задачи.

`TaskDetailPanel.tsx` (~450 строк) — боковая панель задачи:
- Левая колонка: все поля задачи (клиент, продюсеры, дата, формат, локация, проект) + заметки
- Правая колонка: ранние стадии (request/negotiation/connecting) → `EarlyDeptsPanel` (чипы + форма); производство → `InternalShiftsPanel` с `parentTaskId`

---

## 📐 Архитектура InternalShiftsPanel

`InternalShiftsPanel.tsx` (~2500 строк) — центральный UI управления сменами внутренних матриц.

**Система групп.** Члены команды группируются по полю `group_name` в `ProjectMember`. Доступные группы зависят от `project.location`:
- `Выезд*` → `VIEZD_GROUPS`: Сбор, Завоз, Монтаж, Эфир, Демонтаж, Вывоз
- `Знаменка*` → `STUDIO_GROUPS`: Сбор, Монтаж, Эфир, Демонтаж
- Без location или формат `Менеджмент` → единый блок «Команда»

**Динамические названия групп** по `project.format`: Съёмки → «Съёмки» вместо «Эфир»; Оффлайн → «Мероприятие»; Менеджмент перекрывает логику location.

**Копирование блока Эфир.** Кнопка ⎘ на группе Эфир/Съёмки/Мероприятие создаёт копию (`efir_2`, `efir_3`, ...) в `group_schedule`. У каждой копии — свой блок дата/время и заметка. × удаляет копию и переносит участников в «Без группы».

**GroupDateBlock.** Правая колонка, растягивается через HTML `rowspan` на все строки участников. Поля: Дата + Время (диапазон от–до) + Начало эфира / Первый мотор / Начало мероприятия (только для Эфир). Хранится в `status_rows.group_schedule` (JSONB) по ID группы, мерж через `|| $1::jsonb`.

**Drag-and-drop** — pointer events (не HTML5 drag API): `onPointerDown` → ghost-элемент следует за курсором → `pointermove` проверяет `groupBodyRefs` bounding rects → `pointerup` вызывает `updateMember({ groupName })`. Ghost — `position: fixed` клон.

**Удаление ключа в `group_schedule`** — установка ключа в `null` удаляет копию: `PATCH /status-rows/:id/group-schedule` с `{ "efir_2": null }` мержит null в JSONB; фронтенд фильтрует null при чтении.

**Micro-tabs.** У каждой матрицы в `InternalShiftsPanel` — 4 саб-таба: `team` (команда + группы), `planner` (шедулер/канбан), `expenses` (расходы), `freelancers` (фрилансеры — внешний компонент `FreelancersPage.tsx`). `FreelancersPage` — не самостоятельная страница навигации, только саб-таб.

**KanbanBoard.** Для `CREATIVE_FORMATS` (Моушн, Постпродакшн, Дизайн, Саунд-дизайн, Не профильный, **Радио**) саб-таб «Планировщик» показывает `KanbanBoard` вместо `ShiftPlanner`. Три колонки: request / in_progress / done. Таблица `kanban_tasks`, роуты `/kanban-tasks`. Drag-n-drop через pointer events. `KanbanTaskModal` редактирует title, assignee (из `ProjectMember`), даты.

---

## 📐 Архитектура SyncDataPage

Трёхуровневая система фильтров:
1. **Primary filters** — глобальные настройки в поп-апе (⚙ кнопка), в localStorage.
2. **Column filters** — мультиселект в заголовках таблицы, в localStorage.
3. **Column visibility** — тогглы в поп-апе настроек, в localStorage.

**Технические нюансы:**
- Dropdown колонок (`ColDropdown`) рендерится **внутри `<th>` через `position: absolute; top: 100%`** (не как floating overlay), чтобы скроллиться вместе с содержимым. Backdrop `position: fixed; inset: 0` ловит клик вне dropdown. Закрытие по скроллу — через `useEffect`.
- `FilterGroup` определён на **уровне модуля** (не внутри других компонентов) — иначе React пересоздаёт его на каждом рендере, и скролл сбрасывается.
- **Sticky-заголовки:** `thBase` использует `position: sticky; top: 0`. Не переопределяй `position` на отдельных `<th>` — `sticky` также даёт positioning context для абсолютно позиционированных dropdown'ов. Обёртка использует `overflow: clip`, а не `overflow: hidden` — `hidden` создаёт scroll container, который ломает sticky.

**MatrixTabs.tsx** — выделенный файл с компонентами `GanttTab`, `NotesTab`, `DocumentsTab`. Используются внутри `RegistryDetailModal` в `SyncDataPage.tsx`. Все три работают с `/matrix-gantt`, `/matrix-notes`, `/matrix-documents` соответственно.

Также в `SyncDataPage.tsx` содержится UI для:
- **Управления внутренними матрицами** (`/internal-matrix/*`) — создание, редактирование, привязка, проверка наличия в Drive
- **Project members** — участники команды вручную с JSONB-расписанием (`/project-members/*`)
- **Matrix linking** — привязка `MatrixRegistry` к `StatusRow` через `blockSlot` + `matrixRegistryId`

### AppShell SyncButton
Поллит `/sync/logs` и показывает прогресс.
- `totalMatrices` возвращается из `POST /sync/trigger`, хранится в `sessionStorage` (ключ `sync-total-matrices`) — переживает F5. Чистится при успехе или аборте.
- `isRunning = logsRunning || matricesStillExpected` — остаётся `true` даже в 1.5с пауз между матрицами через `totalMatrices > 0 && matrixDone < totalMatrices`.
- `refetchInterval` читает sessionStorage напрямую (не React state), чтобы держать 2с интервал без stale closure.
- Кнопка «Остановить» появляется при `isRunning` и когда все `projects`/`registry` логи завершены (остались только матрицы).

---

## 📋 Прочие нюансы

**Change Log.** `apps/api/src/services/changeLog.ts::logChanges(entityType, entityId, oldData, newData, changedBy, source)`. Диффит old vs new по ключам, каждое изменённое поле — запись в `change_logs`. Обработчики вызывают это после ручных правок; sync использует `source='sync'`. Роут `/change-logs` отдаёт аудит.

**Separator Rows.** `StatusRow` с `source='separator'` — разделители месяцев, инжектятся синком. Без реальных данных. Фронт фильтрует их везде, кроме `SyncDataPage` (через `?withSeparators=true`). В API-list эндпойнтах всегда исключай: `NOT: { source: 'separator' as any }`.

**Notifications.** `Notification` с `userId=null` — глобальные. Прочитанность per-user отслеживается через `user_notification_reads`. Личные используют `notifications.is_read`. `NotificationBell` в `AppShell` поллит `/notifications/count` каждые 30с.

**Matrix Extras.** `apps/api/src/routes/matrixExtras.ts` — 4 CRUD-группы, все через `$queryRawUnsafe`:

| Префикс | Таблица | Scope |
|---------|---------|-------|
| `/shift-expenses` | `shift_expenses` | `project_id` (StatusRow UUID) |
| `/matrix-gantt` | `gantt_tasks` | `matrix_id` (MatrixRegistry UUID) |
| `/matrix-notes` | `matrix_notes` | `matrix_id` |
| `/matrix-documents` | `matrix_documents` | `matrix_id` |

`/matrix-notes` JOIN-fetch'ит `users.full_name` как `author_name`. Запись — `admin | producer`, кроме заметок (любой аутентифицированный).

**Deal.** Группирует `StatusRow` с `MatrixRegistry`-записями. Связи через `DealStatusRow` и `DealMatrix`. Статус: `preliminary | in_progress | completed`. `/deals/potential` возвращает неслинкованные `StatusRow` с совпадающим `sheetMatrixId` в `MatrixRegistry`.

---

## 🧑‍💻 Тестовые аккаунты (после сида)

| Email | Пароль | Роль |
|-------|--------|------|
| admin@tvshifts.ru | admin123 | admin |
| producer@tvshifts.ru | user123 | producer |
| ivanov@tvshifts.ru | user123 | employee |
| petrov@tvshifts.ru | user123 | employee |
| sidorova@tvshifts.ru | user123 | employee |

---

## 🌍 Environment

`.env` загружается из **корня монорепо** (не из `apps/api/`). Копируй `.env.example` → `.env`. Полный список переменных — в `docs/07-dev-setup.md` и `docs/08-deploy.md`. Критичные:

- `DATABASE_URL` — postgres connection string
- `JWT_SECRET` — случайная строка
- `WEB_URL` — origin фронта для CORS
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY` — для Sheets sync
- `GOOGLE_PROJECTS_SHEET_ID` + `GOOGLE_REGISTRY_SHEET_ID` — ID исходных таблиц
- `GOOGLE_DRIVE_*` — OAuth2 креды (отдельно от Sheets)
- `VITE_API_URL` — API URL для фронта при билде

---

## 🚀 Production

```bash
docker compose -f docker-compose.prod.yml up -d
```

Nginx-конфиг в `nginx/`. Скрипт `migrate:deploy` в `packages/db` применяет миграции без перегенерации клиента (безопасно для prod). Детали — в `docs/08-deploy.md`.

---

## 📊 Статус страниц

| Страница | Файл | Статус |
|----------|------|--------|
| Login | `LoginPage.tsx` | ✅ |
| Calendar | `CalendarPage.tsx` | ✅ |
| Workflow | `WorkflowPage.tsx` | ✅ (admin+producer) |
| Task Card | `TaskDetailPanel.tsx` | ✅ (открывается из Workflow) |
| Sync Data | `SyncDataPage.tsx` | ✅ (+ внутренние матрицы, project members, привязка) |
| Users | `UsersPage.tsx` | ✅ |
| Deals | `DealsPage.tsx` | ✅ |
| Database | `DatabasePage.tsx` | ✅ (admin, «БД» в навигации) |
| Notifications | `NotificationBell` в `AppShell.tsx` | ✅ |
| Shift Planner | `ShiftPlanner.tsx` | ✅ (саб-таб «Планировщик» в InternalShiftsPanel) |
| Freelancers | `FreelancersPage.tsx` | ✅ (саб-таб «Фрилансеры» в InternalShiftsPanel) |
| OrgChart | `OrgChartTab.tsx` | ✅ (саб-таб «Структура» в UsersPage; состояние в localStorage `tv-shifts-org-chart`) |
| Tasks | `TasksPage.tsx` | 🚧 (API готов) |
| Analytics | `AnalyticsPage.tsx` | 🚧 (API готов) |
| Profile | `ProfilePage.tsx` | 🚧 (API готов) |

Актуальный список задач и приоритеты — в `docs/TODO.md`.