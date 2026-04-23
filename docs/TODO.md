# TODO — TV Shifts

Актуальный список задач. Завершённое — в [DONE.md](DONE.md).

---

## 🔴 Критические

> Нет активных критических багов.

---

## 🟠 Важно (функциональность / надёжность)

### Баги — подтверждены аудитом 2026-04-21 / 2026-04-23

- [x] **Класс A #9: `workflow-children` — несовпадение ключей кеша** _(исправлено 2026-04-23)_

- [ ] **Класс C: `MicroProjectTab` — стейл `selectedProject` → потеря дней проекта**
  - Файл: `apps/web/src/pages/SyncDataPage.tsx:1604` (`project={selectedProject as any}`)
  - Симптом: пользователь открывает проект из таблицы, добавляет день A, затем день B — день A пропадает
  - Причина: `addDateMutation` читает `project.days` из пропса, а `selectedProject` — замороженный `useState` на момент клика; `onUpdated()` инвалидирует кеш, но `selectedProject` не синхронизируется
  - Фикс: хранить `selectedProjectId: string | null`, читать данные из TanStack Query кеша по ID

- [ ] **Класс A #6: `updateStatus` / `updateBrief` инвалидируют несуществующий ключ**
  - Файл: `apps/web/src/pages/SyncDataPage.tsx:1737` и `:1753`
  - Причина: `qc.invalidateQueries({ queryKey: ['internal-matrix'] })` — а `useQuery` слушает `['internal-matrices', client]`
  - Фикс: заменить на `qc.invalidateQueries({ queryKey: ['internal-matrices'] })`

- [ ] **Класс A #7: `deleteMatrix` не инвалидирует пикер матриц**
  - Файл: `apps/web/src/pages/SyncDataPage.tsx:3191`
  - Фикс: добавить `queryClient.invalidateQueries({ queryKey: ['internal-matrices'] })` в `onSuccess`

- [ ] **Класс A #8: `MatrixFormModal.onSaved` не инвалидирует пикер матриц**
  - Файл: `apps/web/src/pages/SyncDataPage.tsx:3520`
  - Фикс: добавить `queryClient.invalidateQueries({ queryKey: ['internal-matrices'] })` рядом с `['sync-registry']`

### Workflow — производительность при росте данных

- [ ] **`topLevelOnly` без `matrixRegistryId` — нет source-фильтра**
  - Файл: `apps/api/src/routes/statusRows.ts:111`
  - Сейчас: `SELECT id FROM status_rows WHERE parent_task_id IS NULL` — тянет ВСЕ строки без фильтра по source. При большом числе строк из Google Sheets (`source='projects_table'`) запрос возвращает лишнее.
  - Фикс: добавить `AND source = 'manual'` к запросу, когда используется `topLevelOnly` без `matrixRegistryId`

---

## 🟡 Технический долг

- [x] **Орфанный импорт `TaskDetailPanel`** — был в `SyncDataPage.tsx:8`, удалён 2026-04-23.

- [ ] **Дублирование `DEFAULT_GROUP_TIMES`** — константа определена в `InternalShiftsPanel.tsx` и в `TaskDetailPanel.tsx`. Вынести в `apps/web/src/lib/groupDefaults.ts`.

- [ ] **`parent_task_id` не в Zod-схеме `createStatusRowSchema`** — поле обходит валидацию: извлекается из `rawBody` до zod.parse. Неявно, но работает. Добавить явное поле в схему для прозрачности.
  - Файл: `apps/api/src/routes/statusRows.ts:20-38`

- [ ] **Два ключа для одних и тех же данных** — `['micro-projects', matrixRegistryId]` и `['micro-projects-info', entry.id]` запрашивают один и тот же `GET /status-rows?matrixRegistryId=...`. Унифицировать в один ключ или удалить дублирующий.

- [ ] **Schema drift `ProjectMember` / `StatusRow`** — колонки `employment_type`, `rate_plan`, `rate_fact`, `is_approved`, `field_approvals`, `group_name`, `group_schedule`, `parent_task_id` добавлены raw SQL, Prisma-клиент их не знает. Весь доступ через `$queryRawUnsafe`. При регенерации клиента — потеря типизации. Нужна отдельная Prisma-модель или view.

---

## 🧪 Тесты

- [ ] **Нет тестов для WorkflowPage** — новый ключевой компонент без покрытия. Приоритет: drag-and-drop логика `canMove()`, guard при переходе connecting→production.

- [ ] **Нет тестов для TaskDetailPanel** — тест: ранние стадии → EarlyDeptsPanel, поздние → InternalShiftsPanel.

- [ ] **Нет тестов для `parentTaskId` flow в API** — `POST /status-rows` с `parentTaskId`, `GET /status-rows?parentTaskId=`, `GET /status-rows/children-summary`, CASCADE delete при удалении задачи.

- [ ] **E2E через Playwright** — login → открыть Workflow → создать задачу → добавить отдел. Отдельный `playwright.config.ts`, запуск в CI.

- [ ] **Auth guards матрица** — `role × endpoint`: проверить что каждый защищённый роут возвращает 403 для неправильной роли (после завершения Фазы 2 RBAC).

---

## 📐 Стратегический план — Подготовка к масштабированию

> Проект готовится к: ~60 пользователей / 15 одновременно / 10–15 ролей / внешние интеграции.
> Подробности — в [10-roles-and-scale.md](10-roles-and-scale.md).

### Фаза 0 — Тестовая инфраструктура

- [ ] **Изолированная test-база** — добавить `TEST_DATABASE_URL` в `.env`; в `apps/api/src/test/helpers.ts` переключать Prisma-клиент на отдельную БД при `NODE_ENV=test`. Текущая проблема: тесты пишут данные в dev-БД, `afterAll`-падения оставляют записи.
  - Файл: `apps/api/src/test/helpers.ts` + `docker-compose.dev.yml` (добавить `postgres_test` на порту 5434)
  - Проверка: `pnpm test` не должен создавать ни одной записи в dev-БД

### Фаза 1 — CI/CD и безопасность данных

- [ ] **GitHub Actions — базовый пайплайн**
  - Файл: `.github/workflows/ci.yml`
  - Jobs: `lint → tsc → test (test DB в Docker service) → build`
  - Триггер: `push` на любой ветке, `pull_request` → main

- [ ] **Staging-окружение** — отдельный `docker-compose.staging.yml`. Перед каждым деплоем в prod — накатить на staging.

- [ ] **Процедура безопасных миграций**
  - Скрипт `scripts/safe-migrate.sh` — делает pg_dump, накатывает миграцию, пишет в лог
  - Никаких `DROP COLUMN` без предварительного периода deprecation

- [ ] **Audit log — расширить `change_logs`** — сейчас не логируются: вход/выход пользователя, смена роли, удаление записей.
  - `logEvent(type: 'login' | 'logout' | 'role_change' | 'delete', userId, meta)`

### Фаза 2 — Система ролей (RBAC)

> Подробная схема ролей — в [10-roles-and-scale.md](10-roles-and-scale.md).

- [ ] **Мигрировать `Role` enum → таблица `roles`**
  - Сейчас: `Role` enum в Prisma (3 значения) — каждая новая роль требует `ALTER TYPE` + миграцию
  - Цель: таблица `roles (id, name, description)` + `user_roles (userId, roleId)` + `role_permissions (roleId, permission)`

- [ ] **Таблица permissions и route guard**
  - `permissions (id, name, description)` — список всех действий
  - `requirePermission(permissionName)` — уже реализован в `config/permissions.ts`, но опирается на enum-роли. Переключить на таблицу.

- [ ] **Фронтенд — ролевой рендеринг**
  - Хук `usePermissions()` — список permissions из `/auth/me`
  - Компонент `<CanDo permission="sync:trigger">` — оборачивает UI-элементы

- [ ] **Тесты auth guards матрица** — `apps/api/src/routes/auth.guards.test.ts`

### Фаза 3 — Интеграции

- [ ] **Архитектура integration layer** — `apps/api/src/integrations/` с изолированными модулями (`bitrix/`, `equipment/`)

- [ ] **Битрикс24 PoC** — изучить API (webhook vs OAuth), реализовать как job в очереди

- [ ] **Сервер техники — интеграция**
  - `GET /equipment/available?date=&type=`
  - `POST /equipment/reserve`
  - Двусторонняя синхронизация загрузки

- [ ] **Упоминания (mentions) — схема БД** — расширить `Notification` (добавить `mentionedUserId`, `sourceType`, `sourceId`) сейчас, до UI

### Фаза 4 — Observability

> Детали конфигурации — в [09-observability.md](09-observability.md).

- [ ] **Grafana + PostgreSQL datasource** — дашборды по `change_logs`, `sync_logs`, `notifications`

- [ ] **Pino → Loki** — добавить Promtail для отправки логов API в Loki → Grafana

- [ ] **`@fastify/metrics` + Prometheus** — latency по роутам, error rate, active connections

---

## 📋 Функционал — запланированный

### Планировщик смены

- [ ] **«Начало эфира» — маркер-playhead** — двусторонняя синхронизация с полем «Начало эфира» во вкладке «Команда»
- [ ] **Персональные диапазоны участников** — нужна схема хранения (`shift_schedule` JSONB на `project_members`)

### Навигация и структура

- [ ] **Страница "Проекты" (`ProjectsPage`)** — список всех внутренних матриц с их микропроектами. Приоритет низкий.
- [ ] **Команда из матрицы при подключении** — при привязке `MatrixRegistry` к `StatusRow` автоматически подтягивать `ProjectAssignment` как `ProjectMember`

### Уведомления

- [ ] **Diff UI конфликтов** — тип `data_conflict` определён в enum, но sync не генерирует такие уведомления. Отложено.

---

## 🚧 В разработке (заглушки — бэкенд готов, нужен UI)

- [ ] **Вкладка "Задачи"** — `TasksPage.tsx` — API `/tasks/*` готов полностью
- [ ] **Вкладка "Аналитика"** — `AnalyticsPage.tsx` — API `/analytics/*` готов
- [ ] **Страница профиля** — `ProfilePage.tsx` — API готов, UI реализован частично

---

## ⚪ Пожелания

- [ ] **Пагинация проектов** — `GET /status-rows` без лимита; при большом числе строк возможно замедление
- [ ] **Разбивка God-файлов** — `SyncDataPage.tsx` (~3300 строк) и `InternalShiftsPanel.tsx` (~2580 строк) — разбить на субкомпоненты
- [ ] **Smart date input в WorkflowPage** — принимать `28 мая` / `14-20 мая` / `3, 7, 14 июня` / `апрель`; сейчас только `<input type="date">`
- [ ] **Диапазон дат у проекта** — проект может охватывать несколько дней, сейчас только одна дата
- [ ] **pgBouncer** — connection pooling. Не нужен сейчас (15 concurrent), нужен при росте нагрузки.
- [ ] **React Router** — текущий `useState<Page>` не поддерживает deep links. Миграция на React Router v6 разблокирует прямые ссылки.
- [ ] **Автокрон синхронизации** — `node-cron` установлен, но не активирован. Ручной контроль приоритетен на текущем этапе.

---

> Текущий счёт тестов: **163 теста, 0 провалов** (`pnpm test`).
> Последнее обновление: 2026-04-23
