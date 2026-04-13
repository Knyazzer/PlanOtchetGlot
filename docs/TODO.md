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

В проекте нет ни одного теста. Ниже — план покрытия, расставленный по приоритету.

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

### 🔴 P1 — Критично (парсинг и безопасность)

#### `syncService.ts` — чистые функции (unit)

Файл: `apps/api/src/services/syncService.test.ts`

Эти функции не трогают БД и не обращаются к сети — тестируются изолированно, просто передавая stub-данные Google Sheets API.

- [ ] **`parseSheetDate`** — все три формата:
  - Google serial number (например `45678`) → правильная дата
  - Русский формат `DD.MM.YYYY`
  - ISO-строка
  - Пустая строка / мусор → `null`
  - Serial ≤ 1000 → `null` (не дата, а просто число)

- [ ] **`parseProjectStatus`** — все 8 статусов по русским строкам:
  - `'Запрос'` → `'request'`, `'Сдан'` → `'delivered'`, и т.д.
  - Неизвестная строка → `'request'` (дефолт)

- [ ] **`parseEmploymentType`** — маппинг типов занятости:
  - `'ШТАТ'` → `'staff'`, `'ИП 7%'` → `'ip_7'`, `'СЗТ'` → `'szt'`
  - Регистронезависимость

- [ ] **`bgHexOrNull` / `getCellColor`** — детекция цвета фона:
  - Белый (`{r:1,g:1,b:1}`) → `null`
  - Почти белый (r,g,b ≥ 252 из 255) → `null`
  - Жёлтый/красный/зелёный → hex-строка
  - `null`/`undefined` → `null`

- [ ] **`evalConditionalColor`** — ручной движок условного форматирования:
  - `TEXT_EQ`: совпадает → возвращает цвет; не совпадает → `{bg:null,fg:null}`
  - `TEXT_CONTAINS` / `NOT_BLANK` / `BLANK`
  - Ячейка вне диапазона правила → игнорируется
  - Несколько правил — применяется первое совпавшее

- [ ] **`cellStr`** — приоритет userEnteredValue над effectiveValue:
  - Обычная строка → возвращает trimmed
  - Формула (только effectiveValue) → возвращает effectiveValue
  - Число → строковое представление
  - Пустая ячейка → `''`

- [ ] **`isColored`** — возвращает `true` только если есть ненулевой цвет фона

- [ ] **`extractSpreadsheetId`** — парсинг ID из URL Google Sheets:
  - Полный URL → правильный ID
  - Короткий URL без `/edit` → работает
  - Пустая строка / не-URL → `null`

- [ ] **`serialToDate`** — конвертация Google serial date → JS Date:
  - Serial `45000` → правильная дата (примерно 2023 год)
  - Граничное значение `1` → 1899-12-31
  - Проверка что epoch правильный (Dec 30, 1899)

#### Auth routes (integration, реальная БД)

Файл: `apps/api/src/routes/auth.test.ts`

- [ ] `POST /auth/login` — правильные credentials → 200 + httpOnly cookie `access_token`
- [ ] `POST /auth/login` — неверный пароль → 401
- [ ] `POST /auth/login` — несуществующий email → 401
- [ ] `POST /auth/login` — деактивированный пользователь (`isActive=false`) → 401
- [ ] `POST /auth/refresh` — валидный refresh cookie → 200 + новый `access_token`
- [ ] `POST /auth/refresh` — без cookie / истёкший токен → 401
- [ ] `POST /auth/logout` — очищает оба cookie
- [ ] `GET /auth/me` — с валидным токеном → 200 + данные пользователя
- [ ] `GET /auth/me` — без токена → 401

#### `requireRole` preHandler (integration)

Файл: `apps/api/src/plugins/auth.test.ts`

- [ ] Нет токена → 401
- [ ] Токен валидный, роль совпадает → пропускает (`next()`)
- [ ] Токен валидный, роль не совпадает → 403
- [ ] `requireRole('admin', 'producer')` — producer-токен → пропускает
- [ ] `requireRole('admin', 'producer')` — employee-токен → 403

---

### 🟠 P2 — Важно (бизнес-логика)

#### Конфликты смен (integration)

Файл: `apps/api/src/routes/statusRows.test.ts`

- [ ] `GET /status-rows/conflicts` — один сотрудник, два проекта в одну дату → возвращает конфликт
- [ ] `GET /status-rows/conflicts` — один сотрудник, разные даты → пустой массив
- [ ] `GET /status-rows/conflicts` — фильтр `dateFrom`/`dateTo` работает

#### `runFullSync()` — оркестрация (integration, Google API замокирован)

Файл: `apps/api/src/services/syncService.integration.test.ts`

Mock: `vi.mock('googleapis', ...)` — возвращать фиксированные stub-данные листов.

- [ ] Полный цикл: projects → registry → matrices → записи появились в БД
- [ ] `requestSyncAbort()` до запуска matrix-цикла → цикл прерывается, SyncLog содержит статус abort
- [ ] Ошибка Google API на одной матрице → остальные матрицы продолжают обрабатываться, ошибка попадает в SyncLog
- [ ] Повторный запуск сбрасывает `_abortRequested`
- [ ] Разделители месяцев (`separator`) создаются корректно между строками разных месяцев

#### Парсинг матрицы (`fetchMatrixShifts`) (unit, stub данных)

- [ ] Строка с `"1"` в колонке J (застройка) → `ShiftType.zastroyka`
- [ ] Колонка M (эфир) → `ShiftType.efir`
- [ ] Колонки N–P (демонтаж) → `ShiftType.demontazh`
- [ ] Строка `"Итог:"` → пропускается
- [ ] Строка без данных в C/G/I/J–P → пропускается
- [ ] Только ШТАТ получает `ShiftEntry`, ИП/СЗТ — нет

#### Месячный итог (`GET /shifts/monthly-summary`) (integration)

- [ ] Нет записи в `MonthlySummary` → считается на лету из `ShiftEntry`
- [ ] Смены сверх порога → `overtimeShifts > 0`
- [ ] Сотрудник видит только свой итог; другой userId → 403

#### Ролевой доступ к маршрутам (integration, smoke-тест)

Таблица: роут → допустимые роли → ожидаемый код при чужой роли.

- [ ] `POST /sync/trigger` — employee → 403
- [ ] `GET /sync/logs` — employee → 403; producer → 200
- [ ] `POST /status-rows` — producer/employee → 403
- [ ] `GET /status-rows` — employee → 200 (authenticate, не requireRole)
- [ ] `GET /users` — employee → 403

---

### 🟡 P3 — Желательно (краевые случаи и фронтенд)

#### PATCH /status-rows/:id — логирование изменений (integration)

- [ ] Изменение поля → запись появляется в `change_logs`
- [ ] `matrixRegistryId` / `blockSlot` обновляются через raw SQL и возвращаются в ответе

#### Управление пользователями (integration)

- [ ] `POST /users` — создаётся с захешированным паролем (bcrypt)
- [ ] `DELETE /users/:id` — деактивирует (`isActive=false`), не удаляет физически
- [ ] Нельзя удалить самого себя → 400

#### Frontend: axios 401 retry (unit)

Файл: `apps/web/src/lib/api.test.ts`

- [ ] Первый запрос → 401 → перехватчик вызывает `/auth/refresh` → повторяет исходный запрос
- [ ] Refresh тоже 401 → разлогинивает (setUser(null))
- [ ] Параллельные запросы с 401 → refresh вызывается один раз, остальные ждут

#### Frontend: useAuthInit (unit, msw)

Файл: `apps/web/src/hooks/useAuth.test.ts`

- [ ] `/auth/me` → 200 → `user` установлен в store
- [ ] `/auth/me` → 401 → `user` остаётся `null`, показывается LoginPage

---

### ⚪ P4 — Пожелания (когда всё выше закрыто)

- [ ] E2E-тесты через Playwright: login flow → открыть Calendar → убедиться что проекты отображаются
- [ ] `POST /internal-matrix` — Drive-операции замоканы → матрица создаётся в БД с `source='internal'`
- [ ] `GET /analytics/shifts` — возвращает корректную группировку по пользователям и типам смен
- [ ] Снэпшот-тест структуры ответа `GET /status-rows` — защита от случайного изменения формата
