# TODO — TV Shifts

Актуальный список задач. Завершённое — в [DONE.md](DONE.md).

---

## 🔄 Workflow — Воронка задач

> Крупный рефакторинг. Вкладка «Таблица» разделяется на две: «Workflow» и «Реестр проектов».
> StatusRow = Задача, MatrixRegistry = Глобальный проект. Макет согласован 2026-04-22.

### Архитектурные решения (зафиксировано)
- `StatusRow.status` — уже содержит нужные статусы (`request → negotiation → preproduction → production → postproduction → delivered / rejected / cancelled`), отдельное поле `workflow_stage` не нужно
- `StatusRow.source='projects_table'` — задачи из Google Sheets; `source='manual'` — созданные вручную в UI
- `ProjectMember.project_id` = UUID `StatusRow`; `group_name` = отдел внутри задачи. Новых таблиц не нужно
- «Задачи из Google Таблиц» — read-only список (`source='projects_table'`), без взаимодействия с воронкой

---

### Ф0 — Навигация: разделить «Таблицу»

- [ ] **AppShell.tsx** — добавить страницу `'workflow'`, переименовать/перенести `'table'` → `'registry'`
  - Навигация: было `Таблица` → стало `Workflow` + `Реестр проектов`
  - `WorkflowPage.tsx` — новый файл
  - `RegistryPage.tsx` — вынести MatrixRegistry-часть из `SyncDataPage.tsx` сюда
  - `SyncDataPage.tsx` — после переноса оставить только служебные вещи (синк, БД, настройки)

---

### Ф1 — WorkflowPage: воронка задач

- [ ] **`apps/web/src/pages/WorkflowPage.tsx`** — новый компонент
  - Pipeline-бар: Запрос → Подключение к проекту → Производство → Сдан + [Не согласован] [Отменён]
  - Центрирован, счётчики на каждом этапе, кликабелен (фильтрует таблицу)
  - Создание строки (`+ Добавить`) только на этапе «Запрос» → `POST /status-rows` с `source='manual'`

- [ ] **Таблица задач** (внутри WorkflowPage)
  - Колонки: Статус · Клиент · Описание · Исп. продюсер · Лин. продюсер · Аккаунт менеджер · Дата (smart-формат) · Формат · Локация · Проект
  - Данные: `GET /status-rows?source=manual&status=...` (фильтр по текущему этапу)
  - Inline-редактирование ячеек
  - Клик на строку → открывает `TaskDetailPanel`

- [ ] **Smart date** — поле Дата принимает `28 мая` / `14-20 мая` / `3, 7, 14 июня` / `апрель`, автоформатирует

- [ ] **Drag & drop между этапами**
  - Правило: только один шаг вперёд по цепочке; в [Не согласован]/[Отменён] — из любого, с confirm-попапом
  - Из «Подключение к проекту» → «Производство»: требует привязанного проекта (guard-попап)
  - Перетаскивание меняет `status` у `StatusRow` через `PATCH /status-rows/:id`
  - Guard «нет проекта»: если есть матрицы клиента — дропдаун выбора; иначе — мини-форма создания (название + продюсер)

- [ ] **Блок «Задачи из Google Таблиц»** (коллапсируемый, под основной таблицей)
  - `GET /status-rows?source=projects_table` — read-only список
  - Те же колонки, без drag-handle и без кнопки добавить
  - Заголовок с датой последнего синка

---

### Ф2 — TaskDetailPanel: панель задачи

- [ ] **`apps/web/src/pages/TaskDetailPanel.tsx`** — новый компонент (боковая панель или модал)
  - Открывается при клике на строку в WorkflowPage
  - Две вкладки: **Инфо** и **Отделы**
  - Без: Ганта, Заметок, Документов, Истории изменений, Матрицы

- [ ] **Вкладка «Инфо»**
  - Поля задачи: клиент, описание, продюсеры, дата, формат, локация, проект
  - Редактируемые inline через `PATCH /status-rows/:id`

- [ ] **Вкладка «Отделы»**
  - Список групп: `GET /project-members?projectId=:statusRowId` → группировка по `group_name`
  - Каждый отдел — блок с участниками (ФИО, должность, ставка, расписание)
  - Кнопка «+ Добавить отдел» → выбор `group_name` из списка (ТВ, Постпродакшн, Монтаж и т.д.) → создаёт первый `ProjectMember` с этим `group_name`
  - Внутри отдела: те же саб-вкладки что в InternalShiftsPanel (Команда, Планировщик, Фрилансеры, Расходы)
  - Удаление отдела = удаление всех `ProjectMember` с этим `group_name` у данной задачи

---

### Ф3 — RegistryPage: «Реестр проектов»

- [ ] **`apps/web/src/pages/RegistryPage.tsx`** — перенести MatrixRegistry-панель из `SyncDataPage.tsx`
  - Таблица матриц (глобальных проектов): клиент, название, статус, дата
  - Клик на строку → `MatrixDetailModal` (большая панель)

- [ ] **`MatrixDetailModal`** — обновить вкладки
  - Было: «Отделы» (список ProjectMember через группы) → **Стало: «Задачи»** (список StatusRow с `matrixRegistryId = this.id`)
  - Вкладка «Задачи»: список задач, привязанных к этому проекту; клик на задачу → `TaskDetailPanel`
  - Остальные вкладки (Ганта, Заметки, Документы, Инфо) — без изменений

---

### Ф4 — API: минимальные расширения

- [ ] **`GET /status-rows`** — добавить фильтры `?source=` и `?workflowStage=` (маппинг status → stage на бэке)
- [ ] **`POST /status-rows`** — убедиться что поддерживает `source='manual'` без `matrixRegistryId`
- [ ] **`GET /matrix-registry`** — добавить `?clientName=` фильтр для дропдауна выбора проекта в guard-попапе

---

> Порядок: Ф0 → Ф1 → Ф2 → Ф3 → Ф4 (Ф4 делается параллельно по мере нужды в Ф1–Ф3)

---

## 🚧 В разработке (заглушки — бэкенд готов, нужен UI)

- [ ] **Вкладка "Задачи"** — `TasksPage.tsx` — API `/tasks/*` готов полностью
- [ ] **Вкладка "Аналитика"** — `AnalyticsPage.tsx` — API `/analytics/*` готов
- [ ] **Страница профиля** — `ProfilePage.tsx` — API `/auth/me` + `/users/:id` готов

---

## 📐 Стратегический план — Подготовка к масштабированию

> Проект готовится к: ~60 пользователей / 15 одновременно / 10–15 ролей / внешние интеграции.
> Подробности — в [10-roles-and-scale.md](10-roles-and-scale.md).

### Фаза 0 — Тестовая инфраструктура (сделать до следующей фичи)

- [ ] **Изолированная test-база** — добавить `TEST_DATABASE_URL` в `.env`; в `apps/api/src/test/helpers.ts` переключать Prisma-клиент на отдельную БД при `NODE_ENV=test`. Текущая проблема: тесты пишут мусор в dev-БД, `afterAll`-падения оставляют записи.
  - Файл: `apps/api/src/test/helpers.ts` + `docker-compose.dev.yml` (добавить второй контейнер `postgres_test` на порту 5434)
  - Проверка: `pnpm test` не должен создавать ни одной записи в dev-БД

- [ ] **`permissions.ts` — центральный map разрешений** — собрать все `requireRole(...)` (~30 вызовов) в один файл `apps/api/src/config/permissions.ts`. Цель: добавление новой роли = 1 запись в конфиге, а не правка 30+ мест.
  - Структура: `ROLE_PERMISSIONS: Record<Role, Permission[]>` + `hasPermission(role, permission)` хелпер
  - После: заменить `requireRole('admin', 'producer')` на `requirePermission('projects:write')` везде

- [ ] **Structured logging с user-контекстом** — Fastify+Pino уже пишет логи, но без `userId` и `role`. Добавить в каждый запрос:
  ```ts
  // apps/api/src/plugins/auth.ts — после jwtVerify
  request.log.info({ userId, role, path: request.url, method: request.method })
  ```
  Без этого при 15 ролях и 60 пользователях дебажить «кто сломал что» невозможно.

---

### Фаза 1 — CI/CD и безопасность данных (до первого релиза с ролями)

- [ ] **GitHub Actions — базовый пайплайн**
  - Файл: `.github/workflows/ci.yml`
  - Jobs: `lint → tsc → test (test DB в Docker service) → build`
  - Триггер: `push` на любой ветке, `pull_request` → main
  - Смысл: изменение прав для роли с ошибкой должно падать в CI, не в prod

- [ ] **Staging-окружение** — отдельный `docker-compose.staging.yml` (копия prod, другие порты/домен). Перед каждым деплоем в prod — накатить на staging, проверить руками.
  - Минимально: отдельная БД + API на том же сервере, другой поддомен

- [ ] **Процедура безопасных миграций**
  - Правило: `backup → migrate → verify → rollback if fail`
  - Автоматизация: скрипт `scripts/safe-migrate.sh` — делает pg_dump, накатывает миграцию, пишет в лог
  - Никаких `DROP COLUMN` без предварительного `ALTER TABLE .. SET DEFAULT` + периода deprecation

- [ ] **Audit log — расширить `change_logs`** — сейчас не логируются: вход/выход пользователя, смена роли, удаление записей. Добавить в `changeLog.ts`:
  - `logEvent(type: 'login' | 'logout' | 'role_change' | 'delete', userId, meta)`
  - Хранить в отдельной таблице `audit_events` или добавить `eventType` к `change_logs`

---

### Фаза 2 — Система ролей (RBAC)

> Подробная схема ролей — в [10-roles-and-scale.md](10-roles-and-scale.md).

- [ ] **Мигрировать `Role` enum → таблица `roles`**
  - Сейчас: `Role` enum в Prisma (3 значения) — каждая новая роль требует `ALTER TYPE` + миграцию
  - Цель: таблица `roles (id, name, description)` + `user_roles (userId, roleId)` + `role_permissions (roleId, permission)`
  - Добавление роли = `INSERT`, не миграция схемы

- [ ] **Таблица permissions и route guard**
  - `permissions (id, name, description)` — список всех действий: `projects:read`, `sync:trigger`, `members:manage`, `kanban:write`, и т.д.
  - `requirePermission(permissionName)` middleware — заменяет `requireRole`
  - Backward compatibility: текущие 3 роли маппируются на permissions через seed

- [ ] **Фронтенд — ролевой рендеринг**
  - Хук `usePermissions()` — список permissions текущего пользователя из `/auth/me`
  - Компонент `<CanDo permission="sync:trigger">` — оборачивает UI-элементы
  - `AppShell.tsx` — навигация фильтруется по permissions, не по hardcoded ролям

- [ ] **Тесты auth guards** — матрица `role × endpoint`
  - Файл: `apps/api/src/routes/auth.guards.test.ts`
  - Для каждого `requirePermission(...)` роута: тест "employee получает 403", тест "нужная роль получает 200"
  - Цель: при добавлении новой роли тест-матрица должна упасть, если разрешение не прописано

---

### Фаза 3 — Интеграции

- [ ] **Архитектура integration layer** — создать `apps/api/src/integrations/` с изолированными модулями:
  - `bitrix/index.ts` — клиент Битрикс24
  - `equipment/index.ts` — клиент сервера техники
  - Правило: если интеграция недоступна — API не падает, пишет warn в лог

- [ ] **Очередь задач для интеграций** — асинхронные вызовы к внешним сервисам нельзя делать синхронно внутри HTTP-запроса (замедляет UI, теряет задачи при перезапуске)
  - Опция A (без Redis): `pg-boss` — очередь поверх PostgreSQL, никаких новых зависимостей
  - Опция B (с Redis): `BullMQ` — быстрее, но требует Redis-контейнера
  - Рекомендация: начать с `pg-boss`, перейти на BullMQ когда Redis появится по другой причине

- [ ] **Битрикс24 PoC**
  - Изучить API: webhook vs OAuth-приложение
  - Определить точку интеграции: отправка вызывного листа или статуса смены
  - Реализовать как job в очереди: `POST /sync/bitrix/:projectId` → ставит задачу в очередь

- [ ] **Сервер техники — интеграция**
  - `GET /equipment/available?date=&type=` — запрос доступного оборудования по дате и типу
  - `POST /equipment/reserve` — резервирование под проект/отдел
  - `POST /projects/export` — экспорт всех проектов для отображения на equipment-сервере
  - Двусторонняя синхронизация загрузки сотрудников

- [ ] **Упоминания (mentions) — схема БД**
  - Расширить `Notification`: добавить `mentionedUserId`, `sourceType ('task' | 'kanban' | 'note')`, `sourceId`
  - Миграция сейчас, до UI — чтобы не делать миграцию с данными позже
  - Свод дел продюсера: агрегированный view всех незакрытых задач/упоминаний по проектам

---

### Фаза 4 — Observability (мониторинг)

> Детали конфигурации — в [09-observability.md](09-observability.md).

- [ ] **Grafana + PostgreSQL datasource** — нулевой код, максимальная польза сразу
  - Дашборды по `change_logs`, `sync_logs`, `notifications` — кто что менял, когда
  - Особенно важно с ролями: видеть какая роль какие действия совершает

- [ ] **Pino → Loki** — структурированные логи HTTP-запросов с `userId`, `role`, `durationMs`
  - Добавить `userId` и `role` в лог каждого запроса (из декодированного JWT)
  - Promtail читает stdout API-контейнера → Loki → Grafana

- [ ] **`@fastify/metrics` + Prometheus** — latency по роутам, error rate, active connections
  - `pnpm --filter @tv-shifts/api add @fastify/metrics prom-client`
  - Endpoint `GET /metrics` (ограничить доступ по IP или отдельным токеном)

---

## 📋 Функционал — запланированный

### Планировщик смены

- [ ] **«Начало эфира» — маркер-playhead** — двусторонняя синхронизация с полем «Начало эфира» во вкладке «Команда»
- [ ] **Персональные диапазоны участников** — нужна схема хранения (`shift_schedule` JSONB на `project_members`)

### Навигация и структура

- [ ] **Страница "Проекты" (`ProjectsPage`)** — список всех внутренних матриц с их микропроектами; клик → открывает RegistryDetailModal. Приоритет низкий.
- [ ] **Команда из матрицы при подключении** — при привязке `MatrixRegistry` к `StatusRow` автоматически подтягивать `ProjectAssignment` как `ProjectMember`

### Уведомления

- [ ] **Diff UI конфликтов** — тип `data_conflict` определён в enum, но sync не генерирует такие уведомления. Отложено.

---

## 🐛 Баги — подтверждены аудитом Journey (2026-04-21)

### 🔴 Критические (потеря данных)

- [ ] **Класс C: `MicroProjectTab` — стейл `selectedProject` → потеря дней проекта**
  - Файл: `apps/web/src/pages/SyncDataPage.tsx:1604` (`project={selectedProject as any}`)
  - Симптом: пользователь открывает проект из таблицы, добавляет день A, затем день B — день A пропадает
  - Причина: `addDateMutation` читает `project.days` из пропса, а `selectedProject` — замороженный `useState` на момент клика; `onUpdated()` инвалидирует кеш, но `selectedProject` не синхронизируется
  - Фикс: хранить `selectedProjectId: string | null`, читать данные из TanStack Query кеша по ID (не из useState)
  - Контраст: в `InternalShiftsPanel.tsx:544` `project` берётся из живого `useQuery` — там баг отсутствует

- [ ] **Класс A #6: `updateStatus` / `updateBrief` инвалидируют несуществующий ключ**
  - Файл: `apps/web/src/pages/SyncDataPage.tsx:1737` и `:1753`
  - Симптом: смена статуса или брифа внутренней матрицы не отражается в UI до перезагрузки
  - Причина: `qc.invalidateQueries({ queryKey: ['internal-matrix'] })` — а `useQuery` слушает `['internal-matrices', client]`; разные ключи, инвалидация не доходит
  - Фикс: заменить на `qc.invalidateQueries({ queryKey: ['internal-matrices'] })`

### 🟠 Важные

- [ ] **Класс A #7: `deleteMatrix` не инвалидирует пикер матриц**
  - Файл: `apps/web/src/pages/SyncDataPage.tsx:3191`
  - Симптом: удалённая матрица остаётся в дропдауне привязки `StatusRow`
  - Фикс: добавить `queryClient.invalidateQueries({ queryKey: ['internal-matrices'] })` в `onSuccess`

- [ ] **Класс A #8: `MatrixFormModal.onSaved` не инвалидирует пикер матриц**
  - Файл: `apps/web/src/pages/SyncDataPage.tsx:3520`
  - Симптом: новая/отредактированная матрица не появляется в дропдауне привязки до перезагрузки
  - Фикс: добавить `queryClient.invalidateQueries({ queryKey: ['internal-matrices'] })` рядом с `['sync-registry']`

---

## 🟡 Технический долг

- [ ] **Два ключа для одних и тех же данных** — `['micro-projects', matrixRegistryId]` и `['micro-projects-info', entry.id]` запрашивают один и тот же `GET /status-rows?matrixRegistryId=...`. Унифицировать в один ключ или удалить дублирующий.

- [ ] **Schema drift `ProjectMember` / `StatusRow`** — колонки `employment_type`, `rate_plan`, `rate_fact`, `is_approved`, `field_approvals`, `group_name`, `group_schedule` добавлены raw SQL, Prisma-клиент их не знает. Весь доступ через `$queryRawUnsafe`. При регенерации клиента — потеря типизации. Нужна отдельная Prisma-модель или view.

- [ ] **`node-cron` в `05-architecture.md`** — в доке написано «каждые 30 мин автоматически», но auto-cron **не реализован**. Только ручной `POST /sync/trigger`. Исправить доку или реализовать cron.

---

## 🧪 Тесты

- [ ] **E2E через Playwright** — login → открыть Calendar → убедиться что проекты отображаются. Нужен отдельный `playwright.config.ts`, запуск в CI.
- [ ] **Auth guards матрица** — `role × endpoint`: проверить что каждый защищённый роут возвращает 403 для неправильной роли (сделать после `permissions.ts`)
- [ ] **Тесты для `InternalShiftsPanel`** — группы, расписание, копирование блоков
- [ ] **Тесты для KanbanBoard** — мутации + invalidation flow

---

## ⚪ Пожелания

- [ ] **Пагинация проектов** — `GET /status-rows` без лимита; при большом числе строк возможно замедление
- [ ] **Разбивка God-файлов** — `SyncDataPage.tsx` (~3900 строк) и `InternalShiftsPanel.tsx` (~2500 строк) — разбить на субкомпоненты по функциональным областям
- [ ] **Диапазон дат у проекта** — проект может охватывать несколько дней, сейчас только одна дата
- [ ] **Цветовая маркировка полей при создании** — подсветка неутверждённых полей в форме
- [ ] **pgBouncer** — connection pooling между Fastify и Postgres. Не нужен сейчас (15 concurrent), нужен при росте нагрузки или появлении фоновых воркеров.
- [ ] **React Router** — текущий `useState<Page>` не поддерживает deep links и браузерную историю. Миграция на React Router v6 разблокирует прямые ссылки на проект/матрицу.

---

> Текущий счёт тестов: **163 теста, 0 провалов** (`pnpm test`).
> Последнее обновление: 2026-04-21
