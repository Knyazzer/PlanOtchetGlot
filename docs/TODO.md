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
