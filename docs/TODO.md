# TODO — TV Shifts

Актуальный список задач по разработке. Что уже готово — в [DONE.md](DONE.md).

---

## 🔴 Баги (исправить в первую очередь)

- [ ] **Сепараторы попадают в панель "Без даты"** — `CalendarPage.tsx:78` — запрос `GET /projects` без фильтра на `source`, нужно добавить `.filter(p => p.source !== 'separator')` на фронте
- [ ] **`GET /projects` возвращает сепараторы** — `routes/projects.ts:46` — добавить `source: { not: 'separator' }` в WHERE, сепараторы нужны только на вкладке Таблицы
- [ ] **`POST /sync/reset` падает** — `routes/sync.ts:44` — `source: { in: ['projects_table', 'separator'] }` не работает в устаревшем Prisma-клиенте (нет `'separator'`), заменить на `$executeRawUnsafe`

---

## 🟡 Технический долг

- [ ] **Мёртвый импорт `interactionPlugin`** — `CalendarPage.tsx:4` — импортируется и передаётся в `plugins[]`, но никакой интерактивности не используется (`selectable`, `editable` нет), убрать
- [ ] **Нет `onDelete: SetNull` на `ShiftEntry.confirmedBy`** — `schema.prisma:221` — при удалении пользователя, который подтверждал смены, будет FK constraint error; добавить `onDelete: SetNull` и сделать миграцию

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
