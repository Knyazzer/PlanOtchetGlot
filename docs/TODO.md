# TODO — TV Shifts

Актуальный список задач. Завершённое — в [DONE.md](DONE.md).

---

## 🔴 Критические

> Нет активных критических багов.

---

## 🟠 Важно (функциональность / надёжность)

### Баги — подтверждены аудитом 2026-04-21 / 2026-04-23

- [x] **Класс A #9: `workflow-children` — несовпадение ключей кеша** _(исправлено 2026-04-23)_

- [x] **Класс C: `MicroProjectTab` — стейл `selectedProject` → потеря дней проекта** _(исправлено 2026-04-24)_
  - Фикс: `patchDaysCache(updated)` через `qc.setQueriesData(['micro-projects'])` в `onSuccess` всех трёх date-мутаций; кеш обновляется синхронно до следующего действия пользователя

- [x] **Класс A #6: `updateStatus` / `updateBrief` инвалидируют несуществующий ключ** _(исправлено 2026-04-24)_

- [x] **Класс A #7: `deleteMatrix` не инвалидирует пикер матриц** _(исправлено 2026-04-24)_

- [x] **Класс A #8: `MatrixFormModal.onSaved` не инвалидирует пикер матриц** _(исправлено 2026-04-24)_

### Workflow — производительность при росте данных

- [x] **`topLevelOnly` без `matrixRegistryId` — нет source-фильтра** _(исправлено 2026-04-24)_
  - Добавлен `AND source = 'manual'` в SQL-запрос `topLevelOnly` без `matrixRegistryId`

---

## 🟡 Технический долг

- [x] **Орфанный импорт `TaskDetailPanel`** — был в `SyncDataPage.tsx:8`, удалён 2026-04-23.

- [x] **Дублирование `DEFAULT_GROUP_TIMES`** _(исправлено 2026-04-24)_ — вынесено в `apps/web/src/lib/groupDefaults.ts` вместе с `TV_FORMATS` и `FORMATS_WITH_LOCATION`; удалено из `InternalShiftsPanel.tsx` (было внутри компонента — пересоздавалось на каждом рендере) и `TaskDetailPanel.tsx`.

- [x] **`parent_task_id` не в Zod-схеме `createStatusRowSchema`** _(исправлено 2026-04-24)_ — поле добавлено в схему, извлекается из `body.data` вместо `rawBody`.

- [x] **Два ключа для одних и тех же данных** _(исправлено 2026-04-24)_ — `['micro-projects-info', entry.id]` → `['micro-projects', entry.id]`; лишний `invalidate` в `invalidateMicroProjects` удалён.

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

- [x] **Изолированная test-база** _(реализовано 2026-04-24)_
  - `TEST_DATABASE_URL` добавлен в `.env` и `.env.example`; `postgres_test` поднят на порту 5434
  - `vitest.config.ts` уже подменял `DATABASE_URL → TEST_DATABASE_URL`; миграции накатаны на тест-БД
  - `db:migrate:test` переписан на кросс-платформенный `node scripts/migrate-test.cjs` (был `bash -c 'source .env...'`, не работал на Windows)
  - Flaky-тест `syncService.integration.test.ts` устранён: добавлен `prisma.syncLog.deleteMany()` в `beforeAll` — stale-записи от прерванных прогонов больше не мешают
  - Проверка: dev-БД не получает ни одной записи от `pnpm test`

### Фаза 1 — CI/CD и безопасность данных

- [x] **GitHub Actions — базовый пайплайн** _(реализовано 2026-04-24)_
  - Файл: `.github/workflows/ci.yml`
  - Jobs: `lint → tsc → test (test DB в Docker service) → build`
  - Триггер: `push` на любой ветке, `pull_request` → main

- [x] **Staging-окружение** _(реализовано 2026-04-24)_
  - `docker-compose.staging.yml` — изолированная staging-БД, nginx на порту 8080, HTTP (без SSL)
  - `nginx/nginx.staging.conf` — упрощённый nginx без HTTPS и certbot
  - `.env.staging.example` — шаблон переменных для staging

- [x] **Процедура безопасных миграций** _(реализовано 2026-04-24)_
  - `scripts/safe-migrate.sh` — pg_dump → `prisma migrate deploy` → лог; при ошибке — инструкция по откату
  - Никаких `DROP COLUMN` без предварительного периода deprecation

- [x] **Audit log — расширить `change_logs`** _(реализовано 2026-04-24)_
  - `logEvent('login' | 'logout' | 'role_change' | 'delete', entityId, changedBy, meta)` добавлен в `changeLog.ts`
  - `login` и `logout` логируются в `auth.ts`; `role_change` и `delete` — в `users.ts`
  - Записи хранятся в `change_logs` с `entityType = 'user_event'`

### Фаза 2 — Система ролей (RBAC)

> Подробная схема ролей — в [10-roles-and-scale.md](10-roles-and-scale.md).

- [x] **Мигрировать `Role` enum → таблица `roles`** _(реализовано 2026-04-24)_
  - Таблицы: `roles`, `user_roles`, `permissions`, `role_permissions` (миграция `20260424100000_rbac_roles_permissions`)
  - Модели Prisma: `AppRole`, `UserAppRole`, `AppPermission`, `RolePermission`
  - `enum Role` сохранён как legacy поле `User.role` — backward compat с существующими токенами
  - Seed автоматически создаёт 3 роли + 18 permissions + привязывает всех пользователей по legacy role

- [x] **Таблица permissions и route guard** _(реализовано 2026-04-24)_
  - `getUserPermissions(userId)` — читает из `user_roles → role_permissions`
  - `requirePermission` — если JWT имеет `roles[]` → использует `permissions[]`; иначе fallback на enum
  - JWT payload расширен: `{ roles: string[], permissions: string[] }`
  - `/auth/me` возвращает `roles` и `permissions`
  - Новые эндпоинты: `GET/POST /users/:id/roles`, `DELETE /users/:id/roles/:roleId`, `GET /users/roles`

- [x] **Фронтенд — ролевой рендеринг** _(реализовано 2026-04-24)_
  - `AuthUser` расширен: `roles: string[]`, `permissions: string[]`
  - `useIsAdmin()` / `useIsProducer()` читают из `user.roles[]` (fallback на `user.role`)
  - Добавлен хук `useHasPermission(permission: string)`

- [ ] **UI управления ролями в UsersPage** — выпадающий список ролей, кнопки назначить/снять

- [ ] **Компонент `<CanDo permission="...">` на фронте** — оборачивает UI-элементы

- [ ] **Удалить `enum Role` и `User.role`** — только после того как все старые JWT протухли и все пользователи переведены на RBAC

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

> Текущий счёт тестов: **163 теста, 0 провалов** (`pnpm test`), стабильно (flaky sync-тест устранён).
> Последнее обновление: 2026-04-24 (Фаза 0 + Фаза 1 CI/CD завершены)




проверув