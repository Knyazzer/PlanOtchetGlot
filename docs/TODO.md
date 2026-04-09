# TODO — TV Shifts

Актуальный список задач по разработке. Что уже готово — в [DONE.md](DONE.md).

---

## 🔴 Баги (исправить в первую очередь)

- [x] **Сепараторы попадают в панель "Без даты"** — `CalendarPage.tsx:78` — добавлен фильтр `p.source !== 'separator'`
- [x] **`GET /projects` возвращает сепараторы** — `routes/projects.ts:46` — добавлен `NOT: { source: 'separator' }` в WHERE
- [x] **`POST /sync/reset` падает** — `routes/sync.ts:44` — заменено на `$queryRawUnsafe` с прямым SQL

---

## 🟡 Технический долг

- [x] **Мёртвый импорт `interactionPlugin`** — `CalendarPage.tsx` — удалён импорт и из `plugins[]`
- [x] **Нет `onDelete: SetNull` на `ShiftEntry.confirmedBy`** — `schema.prisma` — добавлено в схему, применено через `ALTER TABLE` напрямую в БД

---

## 🚧 В разработке (заглушки)

- [ ] **Вкладка "Задачи"** — `TasksPage.tsx` — бэкенд полностью готов (`/tasks/*`), нужен UI
- [ ] **Вкладка "Аналитика"** — `AnalyticsPage.tsx` — бэкенд полностью готов (`/analytics/*`), нужен UI
- [ ] **Вкладка "Профиль"** — `ProfilePage.tsx` — бэкенд готов (`/users/:id`, `/shifts/monthly-summary`), нужен UI

---

## 📋 Функционал

- [ ] **Страница Сотрудники** — `UsersPage.tsx` — проверить что работает после изменений, добавить отображение `isStaff`, `tabNumber`
- [ ] **Подтверждение смен** — UI для администратора (`PATCH /shifts/:id/confirm`)
- [ ] **Diff UI конфликтов** — панель разрешения расхождений данных при синхронизации (`data_conflict`)

---

## 💡 Улучшения (низкий приоритет)

- [ ] **Пагинация проектов** — сейчас `GET /projects` без лимита, при большом количестве проектов будет медленно
- [ ] **Фильтр `?dateNull=true` на бэке** — сейчас "Без даты" подгружает все проекты и фильтрует на фронте
- [ ] **Rate limiting на `/auth/login`** — защита от брутфорса (`@fastify/rate-limit`)

---

## 🏗️ Крупная фича: Сущность Проект (Deal)

Цель: объединить данные из таблицы статусов (бывший Google Sheets "таблица проектов") и реестра матриц в единую сущность `Deal`.

### Шаг 1 — Переименование Project → StatusRow в БД

- [ ] Миграция: переименовать таблицу `Project` → `StatusRow`, enum `ProjectSource` → `StatusRowSource`, `ProjectStatus` → `StatusRowStatus`
- [ ] Обновить `schema.prisma`: модель, enum-ы, все связи
- [ ] Обновить API: `routes/projects.ts` → `routes/statusRows.ts`, все `prisma.project` → `prisma.statusRow`, prefix `/projects` → `/status-rows`
- [ ] Обновить `syncService.ts`: все ссылки на `prisma.project` и enum-значения
- [ ] Обновить `server.ts`: регистрация маршрута `/status-rows` вместо `/projects`
- [ ] Обновить фронтенд: все запросы `/projects` → `/status-rows`, типы `Project` → `StatusRow`, переименовать компоненты и переменные

### Шаг 2 — Новая модель Deal в БД

- [ ] Добавить в `schema.prisma` модель `Deal` со статусами `preliminary | in_progress | completed`, many-to-many с `StatusRow` и `MatrixRegistry`
- [ ] Создать миграцию

### Шаг 3 — API /deals

- [ ] `GET /deals` — список всех Deal, сортировка по клиенту (include statusRows + matrices)
- [ ] `GET /deals/potential` — StatusRow с `sheetMatrixId`, у которых есть совпадение в MatrixRegistry, но ещё нет Deal
- [ ] `POST /deals` — создать Deal (name, client, status, matrixIds[], statusRowIds[])
- [ ] `PATCH /deals/:id` — обновить статус, добавить/убрать statusRows и matrices
- [ ] `DELETE /deals/:id` — удалить группировку (StatusRow и MatrixRegistry не удаляются)
- [ ] `syncService`: после синка проверять Deal без матриц — если в StatusRow появился `sheetMatrixId` совпадающий с MatrixRegistry, создавать уведомление

### Шаг 4 — Фронтенд: вкладка Проекты

- [ ] Добавить вкладку **Проекты** в навигацию AppShell (между Таблицы и Профиль)
- [ ] Страница `DealsPage.tsx` с двумя вкладками: **Проекты** и **Потенциальные**
- [ ] Карточка Deal: клиент крупно, название из реестра матриц, названия из строк статусов мелко, бейдж статуса
- [ ] Раскрытие карточки: мини-таблица со строкой реестра и всеми строками статусов
- [ ] Вкладка Потенциальные: карточки с кнопкой "Создать проект", превью данных, кнопка "Сохранить"
- [ ] Форма ручного создания Deal: ввод клиента → фильтрует матрицы и строки по клиенту, мультивыбор матриц и строк статусов
- [ ] Удаление Deal с попапом подтверждения
