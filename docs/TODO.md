# TODO — TV Shifts

Актуальный список задач по разработке. Что уже готово — в [DONE.md](DONE.md).

---

## 🔴 Баги

> Нет открытых багов.

---

## 🚧 В разработке (заглушки)

- [ ] **Вкладка "Задачи"** — `TasksPage.tsx` — бэкенд полностью готов (`/tasks/*`), нужен UI
- [ ] **Вкладка "Аналитика"** — `AnalyticsPage.tsx` — бэкенд полностью готов (`/analytics/*`), нужен UI
- [ ] **Вкладка "Профиль"** — `ProfilePage.tsx` — бэкенд готов (`/users/:id`, `/shifts/monthly-summary`), нужен UI

---

## 📋 Функционал

- [ ] **Команда из матрицы при подключении** — при привязке матрицы к проекту автоматически подтягивать состав команды (сотрудники и роли) из данных матрицы в поля проекта
- [ ] **Диапазон дат у проекта** — проект может иметь дату начала и конца (или список съёмочных дней); привязка к месячному блоку идёт по первой дате, но блок учитывает весь диапазон
- [ ] **Цветовая маркировка полей при создании проекта** — поля формы подсвечиваются разными цветами в зависимости от степени утверждённости данных (например: утверждено / предварительно / под вопросом)
- [ ] **Подтверждение смен** — UI для администратора (`PATCH /shifts/:id/confirm`)
- [ ] **Diff UI конфликтов** — панель разрешения расхождений данных при синхронизации (`data_conflict`)
- [ ] **Страница Сотрудники** — `UsersPage.tsx` — добавить отображение `isStaff`, `tabNumber` после рефакторинга

---

## 🟡 Технический долг

- [ ] **Удалить неиспользуемые зависимости из `apps/web`** — 5 пакетов установлены, но ни разу не импортируются в исходном коде:
  - `@tanstack/react-router` — навигация реализована через `useState<Page>` в `AppShell.tsx`
  - `react-hook-form` — все формы на `useState`
  - `clsx` — нет CSS-классов, только inline styles
  - `@fullcalendar/interaction` — плагин удалён из `CalendarPage.tsx`, из `package.json` не убрали
  - `@fullcalendar/timegrid` — не используется, только `daygrid`

  Команда: `pnpm --filter @tv-shifts/web remove @tanstack/react-router react-hook-form clsx @fullcalendar/interaction @fullcalendar/timegrid`

- [ ] **`setTimeout` без cleanup в `DatabasePage.tsx`** — мутации ставят `setTimeout(() => setState(false), 2000)` без очистки при анмаунте. В React 19 не крашит, но при быстром переключении страниц возможны stale-обновления состояния.

---

## 💡 Улучшения (низкий приоритет)

- [ ] **Пагинация проектов** — сейчас `GET /status-rows` без лимита, при большом количестве строк будет медленно

---

## 🧪 Тесты

### Готово

- [x] **Стек настроен**: Vitest 4, `apps/api/vitest.config.ts`, `apps/api/package.json` → `pnpm --filter @tv-shifts/api test`
- [x] **Фабрики расширены**: `apps/api/src/test/factories.ts` — `createTestUser`, `createTestStatusRow`, `createTestAssignment`, `createTestShiftEntry`, `createTestMonthlySummary` + cleanup-функции
- [x] **buildApp()**: `apps/api/src/test/helpers.ts` — Fastify с полным набором плагинов и роутов для `app.inject()`
- [x] **`syncHelpers.ts`** — вынесены все чистые функции из `syncService.ts` (82 unit-теста, 0 провалов)
- [x] **Auth routes P1** — `apps/api/src/routes/auth.test.ts` (12 integration-тестов)
- [x] **requireRole P1** — `apps/api/src/plugins/auth.test.ts` (11 integration-тестов)
- [x] **Конфликты смен P2** — `apps/api/src/routes/statusRows.test.ts` (5 integration-тестов)
- [x] **Monthly-summary P2** — `apps/api/src/routes/shifts.test.ts` (5 integration-тестов)
- [x] **fetchMatrixShifts P2** — `apps/api/src/services/syncService.test.ts` (12 unit-тестов, googleapis замокирован)
- [x] **runFullSync P2** — `apps/api/src/services/syncService.integration.test.ts` (7 integration-тестов, googleapis + prisma.matrixRegistry.findMany замокированы)

Итого API P1+P2: **134 теста, 0 провалов**.

---

### Стек и настройка

**Фреймворк:** [Vitest](https://vitest.dev/) — подходит для обоих пакетов (Vite-совместим для web, TS-нативен для api).

**API-тесты:** `app.inject()` из Fastify (встроенный HTTP-клиент без открытия порта). База данных — **реальная PostgreSQL** (отдельная тестовая БД через `TEST_DATABASE_URL` в `.env.test`), не моки — иначе расхождения схемы не поймать. Google API (`googleapis`) — мокировать через `vi.mock`.

**Frontend-тесты:** `@testing-library/react` + `msw` для перехвата API-запросов.

**Установка:**
```
# API
pnpm --filter @tv-shifts/api add -D vitest @vitest/coverage-v8

# Web
pnpm --filter @tv-shifts/web add -D vitest @vitest/coverage-v8 @testing-library/react @testing-library/user-event msw jsdom
```

Конфиги: `apps/api/vitest.config.ts`, `apps/web/vitest.config.ts`.
Скрипты: `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:coverage": "vitest run --coverage"`.

**Изоляция integration-тестов:** каждый тест-файл должен очищать затронутые таблицы в `afterEach` (или оборачивать операции в транзакцию с роллбэком). Без этого тесты влияют друг на друга при параллельном запуске.

**Тестовые фабрики:** создать `apps/api/src/test/factories.ts` с хелперами `createTestUser(role?)`, `createTestProject()`, `createTestShift()` — чтобы не дублировать setup в каждом тесте.

**Важно перед написанием unit-тестов `syncService`:** чистые функции (`parseSheetDate`, `cellStr`, `bgHexOrNull` и др.) нужно вынести в `apps/api/src/services/syncHelpers.ts` и импортировать оттуда в `syncService.ts`. Прямой импорт `syncService.ts` в тесте тянет `prisma` и `googleapis` — тест сломается без окружения.

---

### 🔴 P1 — Критично (парсинг и безопасность) ✅ Реализовано

#### `syncService.ts` — чистые функции (unit) ✅

Файл: `apps/api/src/services/syncService.test.ts`

Эти функции не трогают БД и не обращаются к сети — тестируются изолированно, просто передавая stub-данные Google Sheets API.

- [x] **`parseSheetDate`** — все три формата (serial / DD.MM.YYYY / ISO), мусор/пустая → `null`, serial ≤ 1000 → `null`
- [x] **`parseProjectStatus`** — все 8 статусов по русским строкам, неизвестная → `'request'`
- [x] **`parseEmploymentType`** — ШТАТ/ИП 7%/СЗТ и т.д., регистронезависимо
- [x] **`bgHexOrNull` / `getCellColor`** — белый/почти-белый → `null`, цветной → hex
- [x] **`evalConditionalColor`** — TEXT_EQ / TEXT_CONTAINS / NOT_BLANK / BLANK, first-match priority
- [x] **`cellStr`** — приоритет userEnteredValue, формулы, числа, пустая ячейка
- [x] **`isColored`** — `true` только при ненулевом фоне
- [x] **`extractSpreadsheetId`** — полный URL / без `/edit` / не-URL → `null`
- [x] **`serialToDate`** — serial → JS Date, проверка epoch Dec 30 1899

#### Auth routes (integration, реальная БД) ✅

Файл: `apps/api/src/routes/auth.test.ts`

- [x] `POST /auth/login` — правильные credentials → 200 + httpOnly cookie `access_token`
- [x] `POST /auth/login` — неверный пароль → 401
- [x] `POST /auth/login` — несуществующий email → 401
- [x] `POST /auth/login` — деактивированный пользователь (`isActive=false`) → 401
- [x] `POST /auth/refresh` — валидный refresh cookie → 200 + новый `access_token`
- [x] `POST /auth/refresh` — без cookie / истёкший токен → 401
- [x] `POST /auth/logout` — очищает оба cookie
- [x] `GET /auth/me` — с валидным токеном → 200 + данные пользователя
- [x] `GET /auth/me` — без токена → 401

#### `requireRole` preHandler (integration) ✅

Файл: `apps/api/src/plugins/auth.test.ts`

- [x] Нет токена → 401
- [x] Токен валидный, роль совпадает → пропускает (`next()`)
- [x] Токен валидный, роль не совпадает → 403
- [x] `requireRole('admin', 'producer')` — producer-токен → пропускает
- [x] `requireRole('admin', 'producer')` — employee-токен → 403

---

### 🟠 P2 — Важно (бизнес-логика) ✅ Реализовано

#### Конфликты смен (integration) ✅

Файл: `apps/api/src/routes/statusRows.test.ts`

- [x] `GET /status-rows/conflicts` — один сотрудник, два проекта в одну дату → возвращает конфликт
- [x] `GET /status-rows/conflicts` — один сотрудник, разные даты → пустой массив
- [x] `GET /status-rows/conflicts` — фильтр `dateFrom`/`dateTo` работает

#### `runFullSync()` — оркестрация (integration, Google API замокирован) ✅

Файл: `apps/api/src/services/syncService.integration.test.ts`

Mock: `vi.mock('googleapis', ...)` + `vi.spyOn(prisma.matrixRegistry, 'findMany')` — полная изоляция от реальных данных.

- [x] Полный цикл: projects → registry → SyncLog-записи с типами `projects`/`registry` в БД
- [x] `requestSyncAbort()` до матричного цикла → matrix SyncLog не создаётся
- [x] Ошибка Google API на одной матрице → её SyncLog `status=error`, остальные продолжают (`status=success`)
- [x] Повторный запуск сбрасывает `_abortRequested`
- [x] Разделители месяцев (`separator`) создаются корректно при наличии строки только с колонкой A

#### Парсинг матрицы (`fetchMatrixShifts`) (unit, stub данных) ✅

Файл: `apps/api/src/services/syncService.test.ts`

- [x] `"1"` в колонке J (offset 0) → `shifts[0] = true`
- [x] `"1"` в колонке M (offset 3) → `shifts[3] = true`
- [x] `"1"` в колонках N–P (offsets 4–6) → `shifts[4-6] = true`
- [x] Строка с числами (не `"1"`) в shift-колонках → все `shifts = false` (итоговые строки не создают смен)
- [x] Пустая строка (нет name/role/employment/"1") → пропускается
- [x] `employmentType` передаётся в выходную строку как есть (фильтрация ШТАТ/ИП происходит в `syncMatrix`)

#### Месячный итог (`GET /shifts/monthly-summary`) (integration) ✅

Файл: `apps/api/src/routes/shifts.test.ts`

- [x] Нет записи в `MonthlySummary` → считается на лету из `ShiftEntry` (только подтверждённые смены)
- [x] Смены сверх порога → `overtimeShifts > 0`
- [x] Сотрудник видит только свой итог; другой userId → 403

#### Ролевой доступ к маршрутам (integration, smoke-тест) ✅

Покрыто в `apps/api/src/plugins/auth.test.ts` (P1):

- [x] `POST /sync/trigger` — employee → 403
- [x] `GET /sync/logs` — employee → 403; producer → 200
- [x] `POST /status-rows` — producer/employee → 403
- [x] `GET /status-rows` — employee → 200 (authenticate, не requireRole)
- [x] `GET /users` — employee → 403

---

### 🟡 P3 — Желательно (краевые случаи и фронтенд) ✅ Реализовано

#### PATCH /status-rows/:id — логирование изменений (integration) ✅

Файл: `apps/api/src/routes/statusRows.patch.test.ts`

- [x] Изменение поля → запись появляется в `change_logs` с `oldValue`/`newValue`/`changedBy`/`source`
- [x] Одинаковое значение при PATCH → `change_log` не создаётся
- [x] `matrixRegistryId` / `blockSlot` обновляются через raw SQL и возвращаются в ответе
- [x] Не-admin → 403; несуществующий id → 404

#### Управление пользователями (integration) ✅

Файл: `apps/api/src/routes/users.test.ts`

- [x] `POST /users` — создаётся с bcrypt-хешем, хеш не утекает в ответ
- [x] `POST /users` — дублирующийся email → 409; пароль < 6 символов → 400
- [x] `DELETE /users/:id` — деактивирует (`isActive=false`), не удаляет физически
- [x] Деактивированный не появляется в `GET /users`
- [x] Нельзя удалить самого себя → 400; не-admin → 403

#### Frontend: axios 401 retry (unit) ✅

Файл: `apps/web/src/lib/api.test.ts`

- [x] Первый запрос → 401 → перехватчик вызывает `/auth/refresh` → повторяет исходный запрос
- [x] Refresh тоже 401 → исходная ошибка пробрасывается, цикла нет
- [x] `/auth/*` маршруты не повторяются при 401 — refresh не вызывается (защита от петли)
- [x] Параллельные запросы с 401 → refresh вызывается дважды (задокументированное ограничение — нет очереди)
- [x] Non-401 ошибки проходят без ретрая

#### Frontend: useAuthInit (unit, msw) ✅

Файл: `apps/web/src/hooks/useAuth.test.ts`

- [x] `/auth/me` → 200 → `setUser` вызван с данными пользователя, `setLoading(false)`
- [x] `/auth/me` → 401/500 → `setUser(null)`, `setLoading(false)`
- [x] Сетевая ошибка → `setUser(null)`, `setLoading(false)`

**Инфраструктура (web):**
- `apps/web/vitest.config.ts` — jsdom, `@vitejs/plugin-react`, `resolve.alias` для React (исправляет коллизию двух экземпляров React в pnpm-монорепо)
- `apps/web/src/test/setup.ts` — MSW server lifecycle
- `apps/web/src/test/msw-server.ts` — shared MSW instance

Итого P3: **16 новых тестов, 0 провалов**. Общий счёт: **150 тестов, 0 провалов**.

---

### ⚪ P4 — Пожелания (когда всё выше закрыто)

- [ ] E2E-тесты через Playwright: login flow → открыть Calendar → убедиться что проекты отображаются
- [ ] `POST /internal-matrix` — Drive-операции замоканы → матрица создаётся в БД с `source='internal'`
- [ ] `GET /analytics/shifts` — возвращает корректную группировку по пользователям и типам смен
- [ ] Снэпшот-тест структуры ответа `GET /status-rows` — защита от случайного изменения формата
