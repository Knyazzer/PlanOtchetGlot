# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Навигационная карта для Claude Code.

> **Название проекта: Nexus** (`nexus.megapolis.media`)
> Переименование в коде (пакеты, переменные, заголовки) — отдельная задача, см. TODO.

---

## 🔄 ТЕКУЩЕЕ СОСТОЯНИЕ

**Ветки:** разработка в `knyazzer` / `daewoo-matiz` → мердж в `dev` → PR в `master` (аппрув только Влада; push в master = автодеплой через CD). Полная стратегия и история squash-чистки — [docs/BRANCHING.md](docs/BRANCHING.md).

**Что реализовано:**
- Auth: **Supabase Auth** (self-hosted) — вход через `signInWithPassword` на фронте; `dev-login` для локалки; онбординг с временными паролями + форс-смена; SSO-портал для inventory; жизненный цикл (увольнение = бан + архив)
- Users: штат + фрилансеры, lifecycle (deactivate/reactivate), автоген табельных (S### / FL#), импорт из Sheets (рудимент), импersonation
- Chats: полный модуль — `direct`, `self` (заметки), `support`, `group`; WebSocket хаб, WS-токен, оптимистичные обновления
- Tasks / Tracks / Projects / Clients: полный CRUD; финансы WI (бюджет + расходы по статьям)
- Calendar / Events / Calendar-entries
- PersonnelPage, DatabasePage (admin), OrgChart

**Visibility gate снят (rebuild-v4):** AppShell доступен всем сотрудникам; admin-страницы (Персонал, База данных) — только админам. Дефолтная страница — «Главная» для всех.

**Планы и журнал:** `docs/TODO.md` (приоритизированный план), `docs/DONE.md` (история), `docs/AUDIT-2026-06-11.md` (полный аудит), `docs/IMPLEMENTATION-PLAN.md` (перенос ПланОтчета, со статус-таблицей), `docs/RBAC-MODEL.md` (ролевая/функциональная модель: база + модули 10 департаментов + визуал — канон), **`docs/RBAC-REDESIGN-2026-08-28.md`** (редизайн ролевой модели: UI мастер-детейл департамент↔матрица, аудит/чистка 4 рудиментов, перегруппировка по областям, **идеология «доступ→UI»** — право расширяет существующую вкладку, не плодит новую; черновик на вычитку), `docs/STRATEGIC-GOALS.md` (спека механики стратегических целей квартал/год: каскад департамент→отдел, вклады из план-отчёта, закрытие периода — черновик, ждёт ревью). **`docs/ECOSYSTEM-AGGREGATION.md`** — архитектурный фундамент «Nexus как слой сведения экосистемы» (агрегация задач/уведомлений из внешних продуктов, канон рабочей единицы, **раздел §9 «что заложить сейчас / чего не хардкодить при закрытии техдолга»** — читать перед правкой модели задач/уведомлений/отчёта). **`docs/REQUESTS-MODULE.md`** — спека модуля «Заявки» (отпуск/больничный/отгул → согласование руководителем → статус + заявление docx; под-вкладка в «Мой кабинет»; MVP по этапам). **`docs/DAY-STATUS-MODEL.md`** — спека разделения «место»(place: office/remote/project/trip) и «статус»(status: working/weekend/vacation/sick/dayoff) дня; основа консистентности статусов во всех экранах; 8 слоёв рефактора. **`docs/PERIOD-LOCK-2026-08-29.md`** — концепт server-side фиксации прошлых недель (нельзя править задним числом; мягкий grace + напоминание, не «блокировка»); ПОГЛОЩАЕТ клиентские guard'ы закрытия дня/переноса задач — правила должны жить на сервере ([[server-side-enforcement-never-trust-client]]); черновик. **`docs/DECISION-2026-08-09-metrics-and-backend.md`** — решения: (1) метрики сотрудников = только сухие факты без формул (убрать вычисляемую «эффективность/нагрузку» из AnalyticsPage, сырые данные сохранить для будущей BI); (2) бэкенд = профессиональные паттерны (ACID-транзакции/аудит-лог/outbox/ledger), НЕ переписывание — стек уже Fastify+TS+Prisma, не Express. **`docs/superpowers/specs/2026-08-09-today-tasks-working-set-design.md`** — «Задачи на сегодня» как рабочий набор дня: `startDate`=день задачи, список = день+статус{inprogress,done}, чекбокс `done↔inprogress`, связь Обзор⇄канбан⇄Свод через `startDate`; декомпозиция на 5 кусков (ядро → порядок → drag на др. день → история → шаблоны), строим по очереди. **`docs/POSTMORTEM-2026-08-10-vacation-orphan-day.md`** — дебаг-кейс «отпуск-сирота» в дне (симптом→отладка→причина→решение): осиротевший `day_entries.day_format='vacation'` без активной заявки (`unreflectLeave` не отработал, вероятно залипший tsx-watch API); методология поиска + чек-лист. **`docs/superpowers/notes-2026-08-09-obzor-polish-and-visibility.md`** — отложенное: полировка таблицы «Задачи на сегодня» (drag ещё не гладкий — известная проблема; обводка выпадашки при клике как у чипа «Время»; чип времени показывать `00:00`; короткие разделители столбцов внутри строки) + **спека разделения видимости Стратегии** (кабинет = только своя область даже у дир/рук; страница «Стратегия»: сотрудник — свой департамент, рук/дир — вся компания).

---

## 🏗 Структура монорепо

pnpm workspace, три пакета:
- `apps/api` — Fastify backend (порт 4000), `src/server.ts` — точка входа
- `apps/web` — React + Vite frontend (порт 5173)
- `packages/db` — Prisma schema + миграции

```
apps/api/src/
  plugins/        auth.ts (authenticate, requireRole), wsHub.ts
  routes/         один файл на префикс
  services/       databaseService.ts (конфиг Google Sheets — рудимент, модуль отключён)
apps/web/src/
  components/     AppShell.tsx, OrgChart.tsx, ProfilePanel.tsx
  hooks/          useAuth.ts
  lib/            api.ts (axios + Supabase Bearer + 401-retry), supabase.ts, sso.ts, utils.ts (cn)
  pages/          по одному файлу на страницу
  stores/         auth.ts (Zustand)
  styles/         kit.css (Tailwind v4 + shadcn-токены, ветка design)
```

---

## 🔧 Основные команды

```bash
# Запуск
.\start.ps1          # Windows, раздельные окна
pnpm dev             # кроссплатформенно

# БД (PostgreSQL: dev на порту 5433, test на 5434)
docker compose -f docker-compose.dev.yml up -d

# Prisma
pnpm db:generate     # перегенерация клиента
pnpm db:migrate      # применение миграций (dev)
pnpm db:migrate:test # применить миграции на тестовую БД (node scripts/migrate-test.cjs)
pnpm db:seed         # сид: admin@nexus.local + user@nexus.local (в dev вход через dev-login БЕЗ пароля)
pnpm db:studio       # GUI

# TypeScript
pnpm --filter @nexus/api build
pnpm --filter @nexus/web exec tsc --noEmit

# Линтинг (только web)
pnpm --filter @nexus/web lint

# Тесты (Vitest)
pnpm test                                  # все пакеты, run mode
pnpm --filter @nexus/api test          # API (тест-БД :5434, fileParallelism: false)
pnpm --filter @nexus/web test          # web (jsdom + MSW)
pnpm --filter @nexus/web test:coverage # покрытие
```

> ⚠️ **Состояние тестов:** прежний набор удалён при сбросе до скелета (rebuild-v3, `55efc8e`). Сейчас: `apps/web/src/hooks/useAuth.test.ts` + `apps/api/src/routes/structure.test.ts` (гарды /structure); api-скрипт с `--passWithNoTests` до восстановления покрытия. Инфраструктура (vitest, MSW, тест-БД) рабочая. План — `docs/TODO.md`. Новые фичи — снова с тестами.

**Чеклист перед коммитом** (из RULES.md §7):
```bash
pnpm --filter @nexus/api build              # 0 TypeScript ошибок
pnpm --filter @nexus/web exec tsc --noEmit  # 0 TypeScript ошибок
pnpm test                                       # зелёные (нужна запущенная БД)
```

---

## ⚙️ Правила разработки (rebuild-v3)

1. **Spec first** — перед каждой фичей: схема данных + API-контракт + UI-эскиз обсуждаются и фиксируются
2. **One feature at a time** — backend → тест → frontend → браузер → только потом следующая фича
3. **Никакой следующей фичи**, пока предыдущая не подтверждена в браузере
4. **Этот CLAUDE.md обновляется** после каждой добавленной фичи (роут-таблица, страницы)

---

## 🏛 Архитектура — основа

### Auth и RBAC
**Supabase Auth** (self-hosted GoTrue). Прод: фронт логинится `supabase.auth.signInWithPassword`, к API ходит с `Authorization: Bearer <supabase access token>` (`lib/api.ts`, request-интерсептор); 401-интерсептор делает `refreshSession` и повторяет запрос один раз. Дев: `POST /auth/dev-login` (только `NODE_ENV !== 'production'`) — вход по email без пароля, кука `access_token`.

Плагин `apps/api/src/plugins/auth.ts`: `authenticate` верифицирует JWT (общий `JWT_SECRET` с Supabase), резолвит юзера по `authId` (= JWT `sub`) или по `nexus_user_id` (импersonation-токен), обогащает `request.user` данными из `nexus.users` (id, isAdmin, isActive…). Неактивный → 401. Импersonation админа запрещён.

⚠️ `requireRole(...roles)` фактически проверяет **только** `'admin'` (по `nexus.users.isAdmin`); любая другая роль молча пропустит любого аутентифицированного. Перед вводом гардов `producer`/`freelancer` — доработать плагин (поля `role`/`userType` в БД уже есть).

**Онбординг/lifecycle:** «Выдать доступ» (`POST /auth/onboard/:userId`) создаёт `auth.users` (временный пароль, форс-смена) + `public.users` + связку `auth_id`; если email уже занят — привязка существующего аккаунта. Увольнение = `POST /users/:id/deactivate` (бан GoTrue + `public.is_active=false` + снять табельный), восстановление — `/reactivate`. Аккаунты не удаляем (архив). Детали: `docs/USER-LIFECYCLE.md`, `docs/SSO-ARCHITECTURE.md`, `docs/INTEGRATION.md`.

**Компромисс (осознанный):** временный пароль хранится открытым текстом в `nexus.users.tempPassword` и виден в админ-списках — админ раздаёт пароли лично (SMTP нет); чистится после смены пароля.

**Аккаунты прода (разделены 2026-06-15):**
- `nexus-admin@megapolis.media` — мастер-админ (isAdmin=true, **isSystemAccount=true**). Не видна в Personnel/Team/Svod/Analytics. Не в `public.users`, не в inventory. Только для входа в AppShell.
- `v.gerwald@megapolis.media` — обычный сотрудник (isAdmin=false, can_access_inventory=true). Доступен в кабинете сотрудника + Инвентаризация.
- `is_system_account` (bool, `nexus.users`) — фильтруется во всех роутах списков пользователей (users/members/staff/freelancers, svod, analytics, structure). Уникальный флаг — только у nexus-admin.

### Стек фронтенда
- **TanStack Query** — серверное состояние; `queryClient` создаётся в `main.tsx`
- **Zustand** — auth store (`stores/auth.ts`), содержит `user` и `setUser`
- **UI-кит** — Tailwind + shadcn/ui (Radix) для компонентов, **recharts** для графиков аналитики, **lucide** для иконок. Тема через `data-theme` на `<html>` (`document.documentElement`). Визуальный эталон — Figma-макеты в `.figma/` (`ux-ui prototype v1/`, `v2/`). База кита подключена на ветке `design` (`styles/kit.css`, Tailwind v4 + shadcn-токены). *(Прежнее правило «только inline styles, без UI-библиотек» отменено 2026-06-09 — признано рудиментом.)*
- **Единый ui-kit экосистемы** (`megapolis-platform/ui-kit`, copy-in в `src/ui-kit/`, конфиг `apps/web/ui-kit.config.json`, синк `sync.mjs`/сверка `check.mjs`): **AppShell** (меню/профиль/шапка, бренд «Нексус» кириллицей, акцент #7B61FF), `DatePicker`/`TimePicker`/`ClockDial` (выбор даты/времени в календаре). Правило `.sidebar-dark`-scoped preflight в `styles/kit.css` (Nexus без глобального preflight). Идёт поэтапная адаптация — роадмап `docs/superpowers/plans/2026-08-02-calendar-and-visual-roadmap.md`.
- **`HeaderPortal`** (`components/HeaderPortal.tsx`) — страницы телепортируют свои контролы (вкладки/поиск/фильтры) в правый слот китовой шапки AppShell (`toolbar`); заголовок раздела даёт сам AppShell. Так сделаны Команда/Задачи/Аналитика/Календарь (внутристраничные шапки убраны).
- **Навигация** — `useState<Page>` в `AppShell.tsx`, выбранная страница сохраняется в `localStorage('nexus:page')`; React Router нет
- **Дата-утилиты** — `date-fns`
- **PWA (установленное приложение)** — справочник возможностей/механик: [docs/PWA-DESKTOP-APP.md](docs/PWA-DESKTOP-APP.md) (кастом-окно/титлбар, детект режима standalone, Web Push + Badging, камера-микрофон/WebRTC/скриншеринг, Serial/USB/HID, диплинки, офлайн-очередь, привязка к профилю Chrome ≠ Google, локальный тест). Приоритет применения — **Nexus**.

### WebSocket
`apps/api/src/plugins/wsHub.ts` — хаб для fan-out WS-сообщений по chatId. Клиент получает ws-token (одноразовый JWT, 60s) через `GET /chats/ws-token` чтобы обойти `SameSite=lax`.
`disconnectWS()` экспортируется из `ChatsPage.tsx` и вызывается при logout в `AppShell`.

### SSO-портал (вход для всех приложений Megapolis)
`lib/sso.ts`: whitelist доменов (`*.knzteam.ru`, `*.megapolis.media`), `?redirect=` валидируется и обрезается до origin+path (анти-414), guard от петли редиректов (sessionStorage, >3 за 15с → экран ошибки). Сессия передаётся в URL-хеше (`#access_token=…&refresh_token=…`). Единый логаут: `/?logout=1` → `LogoutConsumer` в `App.tsx` (`signOut({scope:'global'})`). SSO-redirect работает только в prod-сборке (`!import.meta.env.DEV`).

### Тесты

**API** (`apps/api`): Vitest + node environment. Используют `TEST_DATABASE_URL` — реальная тестовая БД на порту 5434. `fileParallelism: false` — тесты БД не параллелятся.

**Web** (`apps/web`): Vitest + jsdom, `@testing-library/react`, **MSW** для HTTP-мокирования. Setup-файл: `src/test/setup.ts` (запускает MSW-сервер). `react`/`react-dom` резолвятся из корневого `node_modules` во избежание дублирования инстанса хуков.

**Фактическое покрытие** — см. предупреждение в разделе «Основные команды» (один тест; план восстановления в `docs/TODO.md`).

---

## 🚦 Обязательные правила кода

Полные чеклисты — в **`RULES.md`**. Ключевые правила, нарушение которых приводит к багам:

### Каждый `useMutation` ОБЯЗАН инвалидировать затронутые запросы
```typescript
const update = useMutation({
  mutationFn: (data) => api.patch(`/work-items/${id}`, data),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ['work-items'] })
    qc.invalidateQueries({ queryKey: ['work-item', id] })
    qc.invalidateQueries({ queryKey: ['projects'] })  // если WI влияет на Project
  },
})
```
Правило «всех родителей»: WI изменился → инвалидируй Project; Task изменился → инвалидируй WorkItem (если есть wiId).

### Polling для многопользовательских страниц
```typescript
useQuery({ queryKey: ['work-items'], queryFn: ..., refetchInterval: 30_000, refetchIntervalInBackground: false })
```
Обязателен на: `ProjectsPage` (work-items), `TasksPage` (задачи), `CalendarPage` (события). Не нужен на страницах настроек.

### HTTP-коды API
```
GET → 200 | POST → 201 | PATCH → 200 | DELETE → 204
400 + { error, details } | 404 + { error: 'X not found' } | 403 | 401
```

### Никогда не делать
```
❌ React Router — навигация через useState<Page>, это осознанное решение
❌ Случайный зоопарк UI-библиотек — единый дом-кит: Tailwind + shadcn/ui (Radix) + recharts + lucide
❌ Цвета не из docs/DESIGN.md
❌ ::uuid на ID nexus-схемы И public.users в raw SQL (там ID — TEXT); только auth.users.id — uuid, ему каст НУЖЕН
❌ useMutation без invalidateQueries
❌ Роут без preHandler authenticate / requireRole
❌ any без комментария почему иначе нельзя
❌ Enum-значения на фронте импортировать из Prisma — только строковые литералы
❌ Zod .parse в роутах — только .safeParse + reply.code(400)
```

### Raw SQL: ID по схемам
```typescript
// nexus.* — все ID тип TEXT:
WHERE id = $1              // ✅ без каста
WHERE id = ANY($1::text[]) // ✅ для массивов

// public.users.id — ТЕПЕРЬ TEXT (миграция add_posts_pulse) — БЕЗ ::uuid:
UPDATE public.users SET is_active = false WHERE id = ${authId}         // ✅ text = text
// auth.users.id — uuid, каст нужен при сравнении/вставке в SQL:
SELECT id::text AS id FROM auth.users WHERE email = ${email}           // ✅ uuid → text на выходе
```

---

## 📋 API

| Префикс | Файл | Что делает |
|---------|------|-----------|
| `/health` | `server.ts` | healthcheck |
| `/auth` | `routes/auth.ts` | logout, dev-login (не-prod), me, me/profile, me/theme, change-password, impersonate/consume, onboard/:userId (admin) |
| `/users` | `routes/users.ts` | members; staff + freelancers (GET ?includeInactive / POST с автогеном табельного); PATCH /:id; lifecycle: /:id/deactivate, /:id/reactivate; /:id/reset-password; impersonate/:id; bulk-onboard; импорт из Sheets: staff-import(+/refresh), freelancers-import, bulk-import-staff, bulk-import-freelancers — всё admin |
| `/chats` | `routes/chats.ts` | ws-token, WebSocket, list, unread, direct, self, support, **group** (создание, PATCH name/color, members add/remove, DELETE), messages CRUD, read, member patch |
| `/tasks` | `routes/tasks.ts` | задачи: CRUD (+?scope=team), unseen-count, /:id/seen, /:id/log. Привязки задачи (независимые, nullable): `trackId`, `projectId`, **`goalId`** (стратегическая цель — учитывается в прогрессе цели); все три в POST/PATCH + task-select |
| `/events` | `routes/events.ts` | личные события (meeting/task/personal) — CRUD + авто-задачи участникам; **опц. `trackId`** (§9 «событие по треку» → видно в деталях трека) |
| `/calendar-entries` | `routes/calendar-entries.ts` | общие записи (Знаменки/HR) — чтение всем, write admin |
| `/database` | `routes/database.ts` | Google Sheets: config, refresh/:key, preview/:key — admin |
| `/structure` | `routes/structure.ts` | дерево департаментов/отделов (GET — всем аутентифицированным), мутации + migrate-from-sheets — admin, Zod-валидация |
| `/tracks` | `routes/tracks.ts` | треки: CRUD, PUT members, stages CRUD, PATCH tasks/:taskId/track. PATCH /:id принимает **`goalId`** (привязка/отвязка трека к стратегической цели, Фаза 3; лидер/админ, проверка существования цели). **§9 трек=чат:** POST авто-создаёт групповой чат (`Chat.trackId`, лидер=админ, участники автоподключаются), PUT members синкает состав чата; detail/список отдают `chat.id` |
| `/clients` | `routes/clients.ts` | клиенты: CRUD (write admin), bulk-import из КФПД col A |
| `/projects` | `routes/projects.ts` | проекты CRUD (DELETE admin) + вложенные work-items (GET/POST) |
| `/day-entries` | `routes/day-entries.ts` | день сотрудника: GET ?from&to[&userId — по орг-охвату], PUT upsert своего дня, POST /apply-period (≤370 дн, keepFilled), DELETE /:date, GET /formats; admin: GET /formats/versions, POST /formats (новая версия с 1-го числа месяца) |
| `/work-schedule` | `routes/work-schedule.ts` | график работы (HR): GET /me, **GET /presence** (присутствие штата на сегодня из DayEntry+графика — Пульс «кто работает»), GET /:userId (орг-охват), PUT /:userId (admin/HR-модуль). Недельный паттерн типов дня + часы → «тип дня по умолчанию» (подсказка; НЕ факт, отчёт считает только DayEntry) |
| `/svod` | `routes/svod.ts` | Свод: GET ?divisionId&month — сетка день×сотрудник (формат+минуты+задачи по startDate), подвал (часы/баллы/задачи); RBAC: member свой отдел, head/director/admin |
| `/board` | `routes/board.ts` | личная доска: GET (колонки+размещения), POST/PATCH/DELETE /columns, PUT /placements (columnId null → убрать) |
| `/notifications` | `routes/notifications.ts` | derived-агрегатор: лента TaskLog чужих действий над моими задачами (7 дн) + события сегодня/завтра + заявки + **подключения к чужим трекам** (`tracks`: TrackMember.joinedAt, leaderId≠me, 7 дн); прочитанность — на клиенте (localStorage-метки, у треков `nexus:tracks-seen-at`) |
| `/access` | `routes/access.ts` | admin: registry (реестр модулей из кода), grants GET/PUT (выдача/уровень/отзыв модуля департаменту) |
| `/analytics` | `routes/analytics.ts` | GET ?from&to&scope=self\|team\|company — KPI/сотрудники/проекты по формулам донора; businessDays по производственному календарю РФ (`services/calendarRf.ts`); company — admin или модуль adm.analytics-company |
| `/work-items` | `routes/projects.ts` | сводный GET (фильтры status/projectId/producerId/search), GET/:id (+треки с прогрессом, расходы), PATCH, DELETE, PUT /:id/departments, расходы /:id/expenses CRUD |
| `/company-goals` | `routes/company-goals.ts` | цели компании (тезисы для микро-блока на Пульсе): GET — всем; PUT (замена всего списка) — admin |
| `/personal-goals` | `routes/personal-goals.ts` | личные цели сотрудника (блок «Мои цели» в Обзоре кабинета): GET/PUT — свои (замена списка, с флагом done) |
| `/task-templates` | `routes/task-templates.ts` | шаблоны задач (пресеты) — «штампы» для быстрого создания обычной Task: GET/POST/PATCH/DELETE только СВОИ (403 на чужой). Пресет = не задача; инстанцирование (клик по шаблону) идёт через обычный `POST /tasks` с предзаполнением — **по тем же условиям, что и ручное «Добавить задачу»**: гейт `canAddTask` (день активен) → всегда `inprogress` на выбранный день, иначе нельзя (тост). UI — правая панель `TaskTemplatesPanel` + кнопка «Шаблонная задача» в кабинете |
| `/strategic-goals` | `routes/strategic-goals.ts` | стратегические цели (квартал/год), каскад департамент→отдел, `kind` goal\|growth (зоны роста): GET ?periodKey&scope — **видимость разграничена**: `scope=cabinet` (Обзор/кабинет) = только СВОЯ область даже у дир/рук (цели уровня своих департаментов `divisionId=null` + цели своих отделов); по умолчанию (страница «Стратегия») = сотрудник видит свой департамент, **рук/дир — всю компанию**; admin — все. Плюс прогресс `tasksTotal/tasksDone/trackCount` на каждой цели, **GET /:id** (детали: привязанные треки с прогрессом + прямые задачи + roll-up дочерних для департамента), **GET /:id/log** (история изменений — StrategicGoalLog), POST/PATCH/DELETE (director/head/admin), PATCH /:id/close (статус+итог, закрытие вручную). Все мутации пишут историю (`logGoal`, экспортируется — треки тоже логируют привязку). Канбан + панель деталей с вкладками Обзор/История и привязкой/созданием трека — StrategyPage. **Прогресс цели = задачи её треков (Track.goalId) + прямые Task.goalId; у департамента — roll-up по целям отделов**. RBAC привязки: `canContributeToGoal` (админ/директор департамента/рук/сотрудник отдела цели) — вклад ≠ правка |
| `/meeting-notes` | `routes/meeting-notes.ts` | «Доработки к собранию» (заметки уровня департамента на период): GET ?deptId&periodKey, PUT (upsert, director/admin) |
| `/requests` | `routes/requests.ts` | заявки (отпуск/больничный/отгул): GET /types, /unseen-count, GET ?scope=mine\|inbox, POST, PATCH /:id/decision (одобрение → **отражение в DayEntry.status** на дни диапазона), /:id/cancel (автор), /:id/revoke (отзыв одобренной → откат статуса дней), GET /:id/document (docx). Согласующий = рук. отдела→директор→админ. Спеки — docs/REQUESTS-MODULE.md, docs/DAY-STATUS-MODEL.md |

**Новый роут — чеклист:** файл в `routes/`, зарегистрировать в `server.ts`, **добавить префикс в `apps/web/nginx.conf`** (allow-list прокси — иначе путь уйдёт в SPA-fallback и фронт получит `index.html` вместо JSON → краш `X.find is not a function`, см. `docs/POSTMORTEM-2026-06-15-proxy-allowlist.md`), `preHandler` auth, Zod-валидация через `.safeParse`, тест `*.test.ts` рядом, обновить таблицу выше.

**Chats endpoints:**
- `GET /chats/ws-token` — одноразовый JWT (60s) для WS handshake
- `GET /chats/ws` — WebSocket (auth via ?token=)
- `GET /chats` — список чатов текущего пользователя
- `GET /chats/unread` — map chatId→count непрочитанных
- `POST /chats/direct/:userId` — создать/найти direct чат (advisory lock по паре ID)
- `POST /chats/self` — чат-заметки (идемпотентный, advisory lock)
- `POST /chats/support` — чат с техподдержкой (идемпотентный, advisory lock; участники — все админы)
- `POST /chats/group` — групповой чат (name, color, memberIds; создатель = group-admin)
- `PATCH /chats/:id` — название/цвет группы (group-admin или системный админ)
- `GET /chats/:id/members`, `POST /chats/:id/members`, `DELETE /chats/:id/members/:userId` — участники группы
- `DELETE /chats/:id` — удалить групповой чат (физически, каскадом)
- `GET /chats/:id/messages` — история (cursor pagination, ?before=&limit=)
- `POST /chats/:id/messages` — отправить сообщение
- `PATCH /chats/:id/messages/:msgId` — редактировать
- `DELETE /chats/:id/messages/:msgId` — soft delete
- `POST /chats/:id/read` — пометить прочитанным
- `PATCH /chats/:id/member` — isFavorite / isPinned / isArchived

**WebSocket события:** `message:new`, `message:edited`, `message:deleted`, `chat:read`

**Events endpoints:**
- `GET /events?from=YYYY-MM-DD&to=YYYY-MM-DD` — события, где текущий пользователь автор или участник
- `GET /events/:id`, `POST /events`, `PATCH /events/:id`, `DELETE /events/:id`
- Типы: `meeting` | `task` | `personal`

**Calendar-entries endpoints (admin only для write):**
- `GET /calendar-entries?from=&to=` — все публичные записи (видны всем)
- `POST /calendar-entries`, `PATCH /calendar-entries/:id`, `DELETE /calendar-entries/:id`
- Типы: `global` | `znamenka_kaminoka` | `znamenka_chernaya` | `znamenka_kupol` | `hr_sick` | `hr_vacation` | `hr_unpaid` | `hr_dayoff`

---

## 🖥 Страницы

`ChatsPage` — **не страница в навигации**, а overlay (`chatOpen` state в `AppShell`). Открывается из любой страницы через `setChatsProps` + `setChatOpen(true)`.

Гейты до AppShell (в `App.tsx`): `?impersonate=` → ImpersonateConsumer; `?logout=1` → LogoutConsumer; нет юзера → Login; `mustChangePassword` → ChangePassword; не-админ → PersonalCabinet (**visibility gate**); иначе AppShell.

| Страница | Файл | Статус | Видимость (с учётом гейта) |
|----------|------|--------|-----------|
| Login | `LoginPage.tsx` | ✅ dev: dev-login без пароля; prod: Supabase + SSO-redirect | — |
| ChangePassword | `ChangePasswordPage.tsx` | ✅ форс-смена временного пароля | все при `mustChangePassword` |
| PersonalCabinet | `PersonalCabinetPage.tsx` | ✅ профиль, смена пароля, переход в Инвентаризацию | не-админы (вся их поверхность) |
| AppShell | `AppShell.tsx` | ✅ sidebar + nav + unread badge + чат-панель справа | admin |
| Chats | `ChatsPage.tsx` | ✅ полный чат-модуль | правая панель AppShell (`chatOpen`) |
| Dashboard | `DashboardPage.tsx` | ✅ задачи на сегодня, дедлайны (1/3/7д), события сегодня | admin (до снятия гейта) |
| Calendar | `CalendarPage.tsx` | ✅ месяц/неделя/день, API данные, sidebar категорий | admin (до снятия гейта) |
| Tasks | `TasksPage.tsx` | ✅ Kanban + Gantt, вкладки «Задачи» / «Треки» | admin (до снятия гейта) |
| Svod | `SvodPage.tsx` | ✅ rebuild-v4: месячная сетка день×сотрудник, легенда, подвал; клик по ячейке → DayModal (свой день — правка). **Больше НЕ отдельный пункт меню** — вложен внутренней вкладкой в Analytics (persist `nexus:analytics-tab`; миграция старого `page='svod'`→`analytics`) | все (вкладка в Аналитике) |
| Analytics | `AnalyticsPage.tsx` | ✅ rebuild-v4: KPI + recharts-чарт + вкладки Сотрудники/Эффективность/Проекты + CSV; **внутренние вкладки `[Аналитика \| Свод]`** — переключатель в китовой шапке (HeaderPortal) | все (company-скоуп по модулю) |
| Team | `TeamPage.tsx` | ✅ rebuild-v4: оргдерево департамент→отдел→сотрудники, поиск, директор/руководитель | все |
| Strategy | `StrategyPage.tsx` | ✅ Фаза 1: цели квартала/года по департаментам→отделам, статусы, создание/правка/закрытие (итог); видимость своего департамента; спека docs/STRATEGIC-GOALS.md | все (свой департамент) |
| Settings | `SettingsPage.tsx` | ✅ rebuild-v4: 6 вкладок (скелет v2); живые — Форматы дня (версионирование Q-DAY-5), Роли и доступы (гранты модулей) | все; админ-вкладки — admin |
| Tracks | `TracksPage.tsx` | ✅ вкладка внутри Tasks; модал формы переиспользуют Projects | admin (до снятия гейта) |
| Projects | `ProjectsPage.tsx` | ✅ подстраницы «Реестр» / «Workflow» (sidebar), детальная панель WI | admin (до снятия гейта) |
| ProjectCard | `ProjectCardPage.tsx` | ✅ открывается из ProjectsPage | admin (до снятия гейта) |
| Personnel | `PersonnelPage.tsx` | ✅ штат/фрилансеры/структура; карточка: доступ, пароли, увольнение | admin only |
| Database | `DatabasePage.tsx` | ✅ Google Sheets sync | admin only |

**Новая страница — чеклист:** файл в `pages/`, добавить значение в `type Page` (`AppShell.tsx`), пункт в `USER_NAV`/`ADMIN_NAV`, рендер `{page === '...' && <Page />}` в `<main>`, обновить таблицу выше.

---

## 🌍 Environment

`.env` в корне монорепо:
```
DATABASE_URL=postgresql://tvshifts:tvshifts_pass@localhost:5433/tvshifts_v3
TEST_DATABASE_URL=postgresql://tvshifts:tvshifts_pass@localhost:5434/tvshifts_test
JWT_SECRET=...                  # общий с Supabase (валидация токенов в API)
WEB_URL=http://localhost:5173
VITE_API_URL=http://localhost:4000
# Supabase (прод; в dev не нужны — вход через dev-login)
SUPABASE_URL=...                # ВНУТРЕННИЙ адрес Kong (http://supabase-kong:8000), не https://auth.…
SUPABASE_SERVICE_ROLE_KEY=...   # admin API GoTrue (onboard, бан, сброс пароля)
VITE_SUPABASE_URL=...           # для фронта: https://auth.knzteam.ru
VITE_SUPABASE_ANON_KEY=...
VITE_INVENTORY_URL=...          # кнопка перехода в Инвентаризацию (default https://inventory.knzteam.ru)
# Google Sheets (модуль database; URL листов сидируются при старте)
GOOGLE_API_KEY=...
SHEET_URL_EMPLOYEES_BUFFER=...
SHEET_URL_FREELANCERS=...
SHEET_URL_KFPD=...
```

Staging: `.env.staging.example` + `docker-compose.staging.yml`. Прод-доступы — `docs/CREDENTIALS.md` (gitignored).

---

## 🚀 Production

```bash
docker compose -f docker-compose.prod.yml up -d
```

Деплой идёт через CD (push в `master` → GitHub Actions → GHCR → SSH на VDS). Подробнее: `docs/DEPLOY-RUNBOOK.md` (пошаговый ранбук) и `docs/INTEGRATION.md`. SSL — автоматически через Nginx Proxy Manager.

> ⚠️ **Перед крупным деплоем (много миграций) — обязательно [docs/DEPLOY-DB-PRECHECK-2026-08-27.md](docs/DEPLOY-DB-PRECHECK-2026-08-27.md):** миграции катятся автоматически (`Dockerfile` CMD `prisma migrate deploy && node server.js`), бэкапа в пайплайне нет. Ранбук проверки БД: бэкап → read-only проверки прода (дубли tabNumber, FK на public.users, история миграций) → генеральная репетиция `migrate deploy` на клоне прод-БД. GO только после зелёной репетиции на клоне.

Мониторинг: Grafana Alloy (`config.alloy`) + Postgres Exporter (`postgres-exporter/queries.yaml`).

---

## 🎨 Дизайн и прототипы

### Дизайн-система
**`docs/DESIGN.md`** — единый источник палитры, типографики и правил компонентов. Все новые компоненты и страницы соответствуют этому файлу. **Цвета — только отсюда** (палитра из RULES.md §9 устарела, не использовать).

### HTML-прототипы (`docs/ui-prototypes/`)
Эталонные реализации всех ключевых UI-паттернов. Перед разработкой любой страницы — читать соответствующий прототип.

| Файл | Что внутри |
|------|-----------|
| `tvshifts-brandbook.html` | Живой референс дизайн-системы, date picker, clock dial |
| `tvshifts-calendar.html` | Месяц/неделя/день, drag-to-create, overlap layout, edit modal |
| `tvshifts-kanban.html` | Drag-and-drop доска, карточки задач |
| `tvshifts-gantt.html` | Временная шкала, drag/resize баров задач |
| `tvshifts-node-canvas.html` | Pan/zoom холст, ноды и рёбра, minimap |
| `tvshifts-orgchart.html` | Оргсхема структуры компании |
| `tvshifts-project-card.html` | Карточка проекта |
| `wi-list-view.html` | Список Work Items |
| `wi-structure-variants.html` | Варианты структуры WI |
| `wi-tab-variants.html` | Варианты вкладок WI |
| `SPECS.md` | Полные спецификации механик каждого прототипа + концепция шаблонов |

### Концепция шаблонов
Calendar, Kanban, Gantt — это **базовые компоненты** с конфигом, а не отдельные страницы под каждый отдел. Конфигурируется: набор колонок, правило группировки, фильтр данных. Базовая механика — не меняется.

### Правила переноса HTML → React
**`RULES.md` раздел 11** — обязательный протокол. Ключевое: визуальная сверка с прототипом до и после подключения данных. Ни одна механика не считается перенесённой без ручной проверки в браузере.

---

## 🗂 Концептуальная модель рабочих объектов

```
Задачи        → атомарные единицы работы
Треки         → внутренние инициативы (с этапами или без)
Проекты       → производственные проекты с клиентами
```

**Треки** — инструмент для внутренней работы команды: редакционные планы, подготовка эфира, внутренние улучшения. Нет клиентов, нет финансов.

**Проекты** — производственные проекты с клиентами. Схема: `Client → Project → WorkItem → Track`. WorkItem — конкретная съёмка/задача в рамках проекта (дата, формат, локация, три роли: execProducer, lineProducer, accountManager). Track может быть опционально привязан к WorkItem через `workItemId`.

> Поля `type`, `clientName`, `projectName` на модели `Track` — vestigial, не отображать в UI, не использовать.

---

## ⚠️ Важное

- **ID по схемам**: `nexus.*` и `public.users` — `TEXT` (без `::uuid`; `public.users.id` стал TEXT миграцией add_posts_pulse); только `auth.users.id` — `uuid` (каст `::uuid` в SQL). См. раздел «Raw SQL».
- **Prisma models** — `PublicUser` (схема public), `User`, `Department`, `Division`, `UserDivision`, `SheetConfig`, `Track`, `Stage`, `TrackMember`, `Task`, `TaskLog`, `Chat`, `ChatMember`, `Message`, `MessageReaction`, `MessageMention`, `Event`, `EventParticipant`, `CalendarEntry`, `Client`, `Project`, `WorkItem`, `WorkItemDivision`, `Expense`, `DayEntry`, `DayFormatVersion`, `WorkSchedule`, `Post`, `BoardColumn`, `TaskPlacement`, `RefList`, `RefItem`, `DepartmentModule`, `StrategicGoal`, `StrategicGoalLog`, `MeetingNote`, `Request`, `CompanyGoal`, `PersonalGoal`
- **Мультисхема**: `public` (тонкая идентичность, пишет только Nexus) + `nexus` (всё остальное). `nexus.users.authId` = `auth.users.id` = `public.users.id`
- **User model**: поля `name` (не `fullName`) и `department` (не `dept`) — переименованы для совместимости с `public.users`
- **Заготовки в схеме чатов** (без эндпоинтов, осознанно): reply/forward, `scheduledAt`, реакции, упоминания, `inviteToken`, `Chat.projectId`
- **WS singleton** — `disconnectWS()` экспортируется из `ChatsPage.tsx`, вызывается при logout в AppShell
- **Advisory locks** — `pg_advisory_xact_lock(hashtext('self:${id}'))`, `support:${id}`, `direct:${idA:idB}` предотвращают гонку при параллельных запросах
- **Soft deletes** — сообщения помечаются `deletedAt`; групповой чат целиком удаляется физически (каскад)
- **Импорт из Google Sheets** (персонал/фрилансеры/структура) — рудимент после разовой первичной загрузки (см. `docs/USER-LIFECYCLE.md`); новых сотрудников заводим вручную
- **`RULES.md`** — обязательный документ с полными чеклистами для новых роутов, страниц и HTML→React переноса
- **`ACCOUNTS.md`** — dev-аккаунты; прод-доступы — `docs/CREDENTIALS.md` (gitignored)
