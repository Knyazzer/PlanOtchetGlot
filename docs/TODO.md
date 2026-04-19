# TODO — TV Shifts

Актуальный список задач. Завершённое — в [DONE.md](DONE.md).

---

## 🔴 Критично

> Нет критических багов.

---

## 🟠 Важно

### Автосинхронизация не работает
`server.ts` не содержит ни импорта `node-cron`, ни планировщика. Синхронизация запускается **только вручную** через `POST /sync/trigger`.  
DONE.md и CLAUDE.md утверждают, что cron реализован — это неверно.  
**Действие:** реализовать `cron.schedule('*/30 * * * *', () => runFullSync())` в `server.ts`, либо явно убрать автосинх из документации если это сделано намеренно.

---

## 🚧 В разработке (заглушки)

- [ ] **Вкладка "Задачи"** — `TasksPage.tsx` — бэкенд полностью готов (`/tasks/*`), нужен UI
- [ ] **Вкладка "Аналитика"** — `AnalyticsPage.tsx` — бэкенд готов (`/analytics/*`), нужен UI
- [ ] **Вкладка "Профиль"** — `ProfilePage.tsx` — бэкенд готов (`/users/:id`, `/shifts/monthly-summary`), нужен UI

---

## 📋 Функционал

- [ ] **Diff UI конфликтов** — панель разрешения расхождений данных при синхронизации (`data_conflict`). Уведомление генерируется, но отдельного UI для принятия/отклонения нет
- [ ] **Подтверждение смен (UI)** — эндпоинт `PATCH /shifts/:id/confirm` готов, UI в профиле/admin-панели не реализован
- [ ] **Команда из матрицы при подключении** — при привязке `MatrixRegistry` к `StatusRow` автоматически подтягивать `ProjectAssignment` как `ProjectMember` (сейчас команду нужно добавлять вручную)
- [ ] **"Свод матрица" (placeholder)** — вкладка в деталях матрицы; заглушка «Появится после подключения базы цен сотрудников»
- [ ] **Страница "Проекты" (`ProjectsPage`)** — список всех внутренних матриц с их микропроектами; клик → открывает RegistryDetailModal. Приоритет низкий.

---

## 🟡 Технический долг

- [ ] **Debug `console.log` в `statusRows.ts`** (строки 254–262) — три строки `[matrix-block]` печатаются при каждом `PATCH /status-rows/:id` с `matrixRegistryId`. Оставлены после отладки.

- [ ] **Drift схемы Prisma** — модели `ProjectMember` и `StatusRow` в `schema.prisma` не содержат столбцов, добавленных через raw SQL миграции:
  - `project_members`: `employment_type`, `rate_plan`, `rate_fact`, `is_approved`, `field_approvals`, `group_name`
  - `status_rows`: `field_approvals JSONB`, `group_schedule JSONB`
  
  Из-за этого Prisma-клиент не типизирует эти поля, весь CRUD идёт через `$queryRawUnsafe`. Нет type safety, intellisense не работает.  
  **Действие:** добавить поля в `schema.prisma` и регенерировать клиент (пока без перезапуска API через `--skip-generate`).

- [ ] **Удалить неиспользуемые зависимости из `apps/web`** — 5 пакетов установлены, но нигде не импортируются:
  - `@tanstack/react-router` — навигация через `useState<Page>` в `AppShell.tsx`
  - `react-hook-form` — все формы на `useState`
  - `clsx` — нет CSS-классов, только inline styles
  - `@fullcalendar/interaction` — плагин удалён из `CalendarPage.tsx`, из `package.json` не убрали
  - `@fullcalendar/timegrid` — не используется (только `daygrid`)
  
  Команда: `pnpm --filter @tv-shifts/web remove @tanstack/react-router react-hook-form clsx @fullcalendar/interaction @fullcalendar/timegrid`

- [ ] **`setTimeout` без cleanup в `DatabasePage.tsx`** — мутации ставят `setTimeout(() => setState(false), 2000)` без очистки при анмаунте. При быстром переключении страниц возможны stale-обновления состояния.

---

## 🧪 Тесты

- [ ] **E2E через Playwright**: login → открыть Calendar → убедиться что проекты отображаются
- [ ] **Тесты для `InternalShiftsPanel`** — критичная бизнес-логика (группы, расписание, копирование блоков) не покрыта

---

## ⚪ Пожелания

- [ ] **Пагинация проектов** — `GET /status-rows` без лимита; при большом числе строк возможно замедление
- [ ] **Разбивка God-файлов** — `SyncDataPage.tsx` (3854 строк) и `InternalShiftsPanel.tsx` (1979 строк) сложно поддерживать; разбить на субкомпоненты по функциональным областям
- [ ] **Диапазон дат у проекта** — проект может охватывать несколько дней, сейчас только одна дата или список `ProjectDay`
- [ ] **Цветовая маркировка полей при создании** — подсветка неутверждённых полей в форме создания проекта

---

> Текущий счёт тестов: **172 теста, 0 провалов** (`pnpm test`).
