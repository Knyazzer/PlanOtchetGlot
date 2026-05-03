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
- [x] **PostgreSQL метрики** — `postgres-exporter` контейнер, custom queries (users, change_logs, sync_logs, notifications), scrape в Alloy
- [x] **API метрики** — `prom-client`, `/metrics` endpoint, `tvshifts_http_requests_total` + `tvshifts_http_duration_seconds`, scrape каждые 15с
- [x] **userId в логах** — Pino child logger с userId в auth middleware, фильтрация по пользователю в Loki
- [x] **Node Exporter** — метрики хоста (CPU/RAM/диск/сеть), дашборд Node Exporter Full (ID 1860) импортирован
- [x] **Synthetic Monitoring** — HTTP-проверка `https://tvshift.knzteam.ru` каждые 60с, 4 зонда (Франкфурт, Лондон, Париж, Стокгольм)
- [x] **Gateway nginx** — изоляция tvshifts/tvonly через `/opt/gateway/`, SSL-сертификат на оба домена, Alloy фильтрует tvonly контейнеры

#### 🔲 Шаг 5 — Алерты (contact point не настроен)

- [ ] **Contact point** — настроить куда слать уведомления (email или Telegram)
- [ ] **Алерт: сайт недоступен** — если synthetic check падает > 2 мин → уведомление
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
