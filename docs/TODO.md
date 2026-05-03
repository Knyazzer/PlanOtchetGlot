# TODO — TV Shifts

Актуальный список задач. Завершённое — в [DONE.md](DONE.md).

---

## 🔴 Критические

> Нет активных критических багов.

---

## 🟡 Технический долг

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

### Фаза 2 — Система ролей (RBAC, продолжение)

- [ ] **UI управления ролями в UsersPage** — выпадающий список ролей, кнопки назначить/снять

- [ ] **Компонент `<CanDo permission="...">` на фронте** — оборачивает UI-элементы

- [ ] **Удалить `enum Role` и `User.role`** — только после того как все старые JWT протухли и все пользователи переведены на RBAC

- [ ] **Тесты auth guards** — `apps/api/src/routes/auth.guards.test.ts`

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
> Grafana Cloud подключён, Grafana Alloy запущен как systemd-сервис, Docker-интеграция активна (метрики контейнеров + логи → Loki).

#### ✅ Уже сделано
- [x] **Grafana Cloud** — аккаунт создан, стек настроен
- [x] **Grafana Alloy** — установлен на VPS, запускается автоматически (`systemd`), собирает логи всех Docker-контейнеров → Loki, метрики cAdvisor → Prometheus
- [x] **Docker integration dashboards** — установлены ("Docker overview", "Docker logs"), данные идут в реальном времени
- [x] **Security** — `server_tokens off` в nginx, Cloudflare security headers

#### 🔲 Шаг 1 — Аудит пользователей через PostgreSQL (нулевой код)

- [ ] **PostgreSQL datasource в Grafana** — подключить prod БД как datasource (read-only пользователь)
- [ ] **Дашборд "Аудит"** — панели: новые пользователи по дням (`users`), кто что изменил (`change_logs`), топ активных пользователей, история синхронизаций (`sync_logs`), уведомления системы (`notifications`)
- [ ] **Дашборд "База данных"** — размер таблиц, количество записей, рост БД во времени (через `pg_stat_user_tables`)

#### 🔲 Шаг 2 — User journey в логах (1 строка кода)

- [ ] **`userId` в Pino-логах** — добавить `request.log = request.log.child({ userId: request.user?.id })` в auth middleware → каждый HTTP-запрос получит userId → в Loki можно фильтровать по пользователю и видеть его полный путь по `reqId`
- [ ] **Дашборд "Активность пользователей"** — фильтр по userId: все запросы, переходы между роутами, время сессии, последнее действие

#### 🔲 Шаг 3 — Метрики API и ошибки

- [ ] **`@fastify/metrics` + Prometheus** — плагин добавляет `/metrics` endpoint; Prometheus scrape → latency p50/p95/p99 по роутам, error rate 4xx/5xx, active connections
  ```bash
  pnpm --filter @tv-shifts/api add @fastify/metrics prom-client
  ```
- [ ] **Дашборд "API Health"** — latency по роутам, всплески ошибок, error rate по времени
- [ ] **Дашборд "Root cause"** — при ошибке 5xx: контекст запроса (userId, reqId, route), предыдущие запросы этого пользователя из Loki, stacktrace

#### 🔲 Шаг 4 — Инфраструктура хоста

- [ ] **Node Exporter** — добавить в `docker-compose.prod.yml`, scrape в Alloy конфиг → диск, сеть, uptime хоста, CPU/RAM на уровне VPS (не контейнеров)
- [ ] **Дашборд "Infrastructure"** — импортировать готовый шаблон ID **1860** (Node Exporter Full) с grafana.com/grafana/dashboards

#### 🔲 Шаг 5 — Алерты и uptime

- [ ] **Grafana Synthetic Monitoring** — HTTP-проверка `https://tvshift.knzteam.ru` каждые 60с → uptime % и latency
- [ ] **Алерт: сайт недоступен** — если synthetic check падает > 2 мин → уведомление (email / Telegram)
- [ ] **Алерт: всплеск 5xx** — если error rate > 5% за 5 мин → уведомление
- [ ] **Алерт: контейнер упал** — если контейнер исчез из cAdvisor → уведомление
- [ ] **Алерт: RAM > 85%** — предупреждение до OOM

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

> Текущий счёт тестов: **163 теста, 0 провалов** (`pnpm test`), стабильно.
> Последнее обновление: 2026-05-03 (Фаза 1 завершена, Фаза 2 RBAC инфраструктура готова, Фаза 4 Observability — Grafana Cloud + Alloy запущены)
