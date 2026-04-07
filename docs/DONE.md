# DONE — TV Shifts

Всё реализованное на текущий момент. Открытые задачи — в [TODO.md](TODO.md).

---

## Этап 1 — Фундамент

### Инфраструктура
- [x] pnpm монорепо: `apps/api`, `apps/web`, `packages/db`
- [x] TypeScript во всех пакетах
- [x] `docker-compose.yml` (prod): PostgreSQL + API + Web
- [x] `docker-compose.dev.yml` (dev): только PostgreSQL на порту 5433
- [x] `.env.example` со всеми переменными
- [x] `start.ps1` — запуск API и Web в отдельных окнах PowerShell

### База данных (`packages/db`)
- [x] Prisma schema: 11 моделей — `User`, `Project`, `MatrixRegistry`, `ProjectAssignment`, `ShiftEntry`, `MonthlySummary`, `Task`, `TaskAssignment`, `Notification`, `ChangeLog`, `SyncLog`
- [x] Все enum'ы: `Role`, `ProjectStatus`, `ProjectSource`, `EmploymentType`, `ShiftType`, `ShiftSource`, `SyncType`, `SyncStatus`, `NotificationType`, `TaskStatus`, `ChangeSource`
- [x] Первая миграция (`20260407085319_init`)
- [x] Seed-скрипт: 5 пользователей (admin + 3 employee + producer), 2 проекта, 2 задачи

### Авторизация — API (`apps/api/src/routes/auth.ts`)
- [x] `POST /auth/login` — JWT access (15 мин) + refresh (7 дн) в httpOnly cookies
- [x] `POST /auth/refresh` — обновление access token по refresh cookie
- [x] `POST /auth/logout` — очистка cookies
- [x] `GET /auth/me` — данные текущего пользователя

### Авторизация — Web
- [x] `LoginPage` — форма email/пароль с валидацией и ошибками
- [x] Zustand auth store (`apps/web/src/stores/auth.ts`)
- [x] `useAuthInit` — восстановление сессии через `/auth/me` при загрузке
- [x] Protected routing — если нет user, показывается `LoginPage`
- [x] `useCurrentUser`, `useIsAdmin`, `useIsProducer` хуки

### Пользователи — API (`apps/api/src/routes/users.ts`)
- [x] `GET /users` — список с фильтром по поиску и роли (admin)
- [x] `GET /users/:id` — сотрудник видит только себя
- [x] `POST /users` — создание с bcrypt-хешированием пароля (admin)
- [x] `PATCH /users/:id` — редактирование, с ограничениями по роли
- [x] `DELETE /users/:id` — деактивация `isActive=false`, нельзя себя (admin)

### Пользователи — Web (`apps/web/src/pages/UsersPage.tsx`)
- [x] Таблица сотрудников: ФИО, email, роль, таб. №, тип, действия
- [x] Поиск по имени / email
- [x] Цветные бейджи ролей
- [x] Модалка создания сотрудника с выбором роли
- [x] Кнопка деактивации с подтверждением

---

## Этап 2 — Производственный календарь

### Проекты — API (`apps/api/src/routes/projects.ts`)
- [x] `GET /projects` — список с фильтрами по дате, статусу, поиску; включает assignments
- [x] `GET /projects/:id` — детальный проект со сменами внутри assignments
- [x] `POST /projects` — ручное создание (admin)
- [x] `PATCH /projects/:id` — редактирование (admin)
- [x] `DELETE /projects/:id` — удаление (admin)
- [x] `GET /projects/conflicts` — поиск конфликтов (один сотрудник, два проекта в один день)

### Производственный календарь — Web (`apps/web/src/pages/CalendarPage.tsx`)
- [x] FullCalendar в режиме месяц / неделя с переключением
- [x] Русская локализация, неделя начинается с понедельника
- [x] Проекты как события, цвет по статусу (preliminary / ready / completed / manual)
- [x] Правая панель — проекты без даты (с `dateApproximate` если есть)
- [x] Клик на событие → модалка с полными деталями проекта и составом команды
- [x] Кнопка «+ Проект» для admin/producer → форма ручного создания
- [x] Легенда статусов

---

## Этап 3 — Google Sheets синхронизация

> `apps/api/src/services/syncService.ts` + `apps/api/src/routes/sync.ts`

- [x] Google Sheets клиент через `googleapis` (Service Account auth)
- [x] `extractSpreadsheetId(url)` — извлечение ID из URL
- [x] `isColored(cell)` — детекция подсвеченных ячеек через `userEnteredFormat.backgroundColor`
- [x] `syncProjects()` — читает таблицу проектов с форматированием (includeGridData), определяет `uncertainFields` и статус по цветам ячеек, upsert по `googleRowIndex`
- [x] `syncRegistry()` — читает реестр матриц (A–L), upsert по `matrixId`, автосвязка с проектами по spreadsheet ID
- [x] `syncMatrix()` — читает лист `₽ СМЕНЫ`: строка 2 → даты J–P, строки 4+ → состав команды; upsert `ProjectAssignment` + `ShiftEntry` (только для штатных сотрудников)
- [x] Маппинг типа смены по позиции колонки: J–L → zastroyka, M → efir, N–P → demontazh
- [x] Маппинг `EmploymentType`: ШТАТ/ИП 7%/8%/10%/СЗТ
- [x] Уведомления: `unmatched_name` при ненайденном ФИО, `no_matrix` для проектов без матрицы
- [x] `runFullSync()` — оркестрация: projects → registry → matrices; логирует в `SyncLog` с кол-вом изменений и ошибками
- [x] `POST /sync/trigger` — ручной запуск (async, 202); доступен admin/producer
- [x] `GET /sync/logs` — история синхронизаций с фильтром по типу
- [x] node-cron в `server.ts` — запускает `runFullSync()` каждые 30 минут

---

## Этап 4 — Учёт смен (API)

> Web-часть — в TODO.

- [x] `GET /shifts` — список с фильтрами (userId, projectId, dateFrom, dateTo, confirmed); сотрудник видит только свои
- [x] `POST /shifts` — ручное создание (admin)
- [x] `PATCH /shifts/:id/confirm` — подтвердить смену (admin)
- [x] `PATCH /shifts/:id` — редактирование (admin)
- [x] `GET /shifts/monthly-summary/:userId/:year/:month` — месячный итог, считается на лету если нет записи
- [x] `PATCH /shifts/monthly-summary/:userId/:year/:month/vacation` — установить дни отпуска и порог (admin); `threshold = ceil(workingDays × 16/22)`

---

## Этап 5 — Уведомления (API)

> Web-часть — в TODO.

- [x] `GET /notifications` — список для текущего пользователя + глобальные (userId=null), последние 50
- [x] `PATCH /notifications/:id/read` — отметить прочитанным
- [x] `PATCH /notifications/read-all` — отметить всё прочитанным
- [x] `GET /notifications/count` — количество непрочитанных (для колокольчика)

---

## Этап 4 — Учёт смен (Web)

- [x] `ProfilePage` — месячные смены со счётчиками (итого / порог / переработка / отпуск), навигация по месяцам
- [x] Для admin — выбор сотрудника через селект
- [x] Смены сгруппированы по дате, тип смены цветом, статус подтверждения
- [x] Конфликты на `CalendarPage` — красный фон дат + блок в правой панели с деталями

---

## Этап 5 — Уведомления (Web) + Change Log

- [x] `NotificationBell` в шапке — бейдж с кол-вом непрочитанных, обновление каждые 60 сек
- [x] Дроп-даун: непрочитанные сверху, прочитанные снизу; кнопка «Прочитать все»; клик по уведомлению помечает прочитанным
- [x] `logChanges()` хелпер — сравнивает поля и пишет в `change_logs`
- [x] Логирование в `PATCH /projects/:id` и `PATCH /shifts/:id/confirm`
- [x] `GET /change-logs?entityType=&entityId=` — эндпоинт с фильтрами
- [x] Вкладка «История изменений» в модалке проекта — diff старое/новое со временем и автором

---

## Этап 6 — Бэклог задач

### Задачи — API (`apps/api/src/routes/tasks.ts`)
- [x] `GET /tasks` — список с фильтром по статусу; include creator + assignments с users
- [x] `POST /tasks` — создание (admin)
- [x] `POST /tasks/:id/assign` — взять задачу (any); меняет статус на `in_progress`, создаёт `TaskAssignment`; транзакция
- [x] `PATCH /tasks/:id/complete` — завершить; проверяет что это задача исполнителя или admin; транзакция
- [x] `DELETE /tasks/:id` — удаление (admin)

### Задачи — Web (`apps/web/src/pages/TasksPage.tsx`)
- [x] Список задач с фильтром по статусу (Все / Открыта / В работе / Готово)
- [x] Отображение исполнителя и даты создания
- [x] Кнопка «Взять» для открытых задач
- [x] Кнопка «Завершить» для исполнителя или admin
- [x] Кнопка «×» удаления (admin)
- [x] Модалка создания задачи с названием и описанием (admin)
