# DONE — TV Shifts

Всё реализованное на текущий момент. Открытые задачи — в [TODO.md](TODO.md).

---

## Этап 1 — Фундамент

### Инфраструктура
- [x] pnpm монорепо: `apps/api`, `apps/web`, `packages/db`
- [x] TypeScript во всех пакетах
- [x] `docker-compose.yml` (prod): PostgreSQL + API + Web + Nginx + Certbot + автобэкап
- [x] `docker-compose.dev.yml` (dev): только PostgreSQL на порту 5432
- [x] `.env.example` со всеми переменными
- [x] `start.ps1` — запуск API и Web в отдельных окнах PowerShell

### База данных (`packages/db`)
- [x] Prisma schema: 18 моделей — `User`, `StatusRow`, `ProjectDay`, `MatrixRegistry`, `ProjectAssignment`, `ShiftEntry`, `MonthlySummary`, `Task`, `TaskAssignment`, `Notification`, `ChangeLog`, `SyncLog`, `Deal`, `DealStatusRow`, `DealMatrix`, `MatrixTemplate`, `ProjectMember`, `SheetConfig`
- [x] Все enum'ы: `Role`, `StatusRowStatus`, `StatusRowSource`, `EmploymentType`, `ShiftType`, `ShiftSource`, `SyncType`, `SyncStatus`, `NotificationType`, `TaskStatus`, `ChangeSource`, `DayType`, `DealStatus`
- [x] Seed-скрипт: 5 пользователей (admin + 3 employee + producer), тестовые проекты и задачи

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

### Проекты / StatusRow — API (`apps/api/src/routes/statusRows.ts`)
- [x] `GET /status-rows` — список с фильтрами по дате, статусу, поиску; `?withSeparators=true` для включения разделителей
- [x] `GET /status-rows/:id` — детальная строка со сменами внутри assignments
- [x] `POST /status-rows` — ручное создание (admin)
- [x] `PATCH /status-rows/:id` — редактирование (admin), логирование через `logChanges`
- [x] `DELETE /status-rows/:id` — удаление (admin)
- [x] `GET /status-rows/conflicts` — поиск конфликтов (один сотрудник, два проекта в один день)
- [x] Поддержка `ProjectDay` — отдельные дни (застройка/эфир) через `days[]` в теле запроса

### Производственный календарь — Web (`apps/web/src/pages/CalendarPage.tsx`)
- [x] FullCalendar в режиме месяц с навигацией
- [x] Русская локализация, неделя начинается с понедельника
- [x] Проекты как события, цвет по статусу
- [x] Правая панель — проекты без даты (с `dateApproximate` если есть)
- [x] Клик на событие → модалка с полными деталями проекта и составом команды
- [x] История изменений в модалке проекта (вкладка «История»)
- [x] Конфликты — красный фон дат + блок в правой панели с деталями
- [x] Кнопка «+ Проект» для admin → форма ручного создания
- [x] Легенда статусов

---

## Этап 3 — Google Sheets синхронизация

> `apps/api/src/services/syncService.ts` + `apps/api/src/routes/sync.ts`

- [x] Google Sheets клиент через `googleapis` (Service Account auth или `GOOGLE_API_KEY`)
- [x] `extractSpreadsheetId(url)` — извлечение ID из URL
- [x] `isColored(cell)` — детекция подсвеченных ячеек через `userEnteredFormat.backgroundColor`
- [x] Ручная обработка условного форматирования (`evalConditionalColor`) — Google API не возвращает его в `effectiveFormat`
- [x] `syncProjects()` — читает таблицу проектов с форматированием (includeGridData), определяет `uncertainFields` и статус по цветам ячеек, upsert по `googleRowIndex`, создаёт разделители месяцев через raw SQL
- [x] `syncRegistry()` — читает реестр матриц (A–L), upsert по `matrixId`, автосвязка с проектами по spreadsheet ID
- [x] `syncMatrix()` — читает лист `₽ СМЕНЫ` / `₽ СПЕЦИАЛИСТЫ`: строка 2 → даты J–P, строки 4+ → состав команды; upsert `ProjectAssignment` + `ShiftEntry` (только для штатных сотрудников); кэширует результат в `shifts_cache` + `has_shifts_data` на `MatrixRegistry`
- [x] Маппинг типа смены по позиции колонки: J–L → zastroyka, M → efir, N–P → demontazh
- [x] Маппинг `EmploymentType`: ШТАТ/ИП 7%/8%/10%/СЗТ
- [x] Уведомления: `unmatched_name` при ненайденном ФИО, `no_matrix` для проектов без матрицы
- [x] Ретрай при 429/503 (до 3 раз, задержки 3s/6s), задержка 1500ms между матрицами
- [x] `runFullSync()` — оркестрация: projects → registry → matrices; логирует в `SyncLog`
- [x] Abort-механизм: `requestSyncAbort()` устанавливает флаг, матричный цикл проверяет его перед каждой матрицей; сбрасывается в начале `runFullSync()`
- [x] `POST /sync/trigger` — ручной запуск (async, 202); возвращает `totalMatrices`; доступен admin/producer
- [x] `POST /sync/stop` — остановить синхронизацию матриц; доступен admin/producer
- [x] `GET /sync/logs` — история синхронизаций с фильтром по типу (admin + producer)
- [x] `GET /sync/registry` — все записи реестра матриц (raw SQL для camelCase полей)
- [x] `GET /sync/matrix-preview/:matrixId` — просмотр содержимого матрицы из Google Sheets
- [x] `GET /sync/matrix-shifts/:matrixId` — смены из матрицы (из кэша или Google Sheets при `?refresh=true`)
- [x] `POST /sync/reset` — удалить все импортированные данные (raw SQL из-за Prisma DLL lock)
- [x] `GET /sync/sheet-urls` — публичные ссылки на исходные Google Sheets
- [x] node-cron в `server.ts` — запускает `runFullSync()` каждые 30 минут
- [x] `SyncButton` в шапке (admin/producer) — кнопка запуска/стопа, индикатор прогресса матриц, дроп-даун с историей логов; `totalMatrices` хранится в `sessionStorage` для переживания обновлений страницы

---

## Этап 4 — Учёт смен (API)

- [x] `GET /shifts` — список с фильтрами (userId, projectId, dateFrom, dateTo, confirmed); сотрудник видит только свои
- [x] `POST /shifts` — ручное создание (admin)
- [x] `PATCH /shifts/:id/confirm` — подтвердить смену (admin), логирование
- [x] `PATCH /shifts/:id` — редактирование (admin)
- [x] `GET /shifts/monthly-summary/:userId/:year/:month` — месячный итог, считается на лету если нет записи
- [x] `PATCH /shifts/monthly-summary/:userId/:year/:month/vacation` — установить дни отпуска и порог (admin)

---

## Этап 5 — Уведомления (API + Web)

- [x] `GET /notifications` — список для текущего пользователя + глобальные (userId=null), последние 50
- [x] `PATCH /notifications/:id/read` — отметить прочитанным
- [x] `PATCH /notifications/read-all` — отметить всё прочитанным
- [x] `GET /notifications/count` — количество непрочитанных (для колокольчика)
- [x] `NotificationBell` в шапке — API готов; UI реализован в Этапе 11 (см. ниже)

---

## Этап 5 — Change Log

- [x] `logChanges()` хелпер — сравнивает поля и пишет в `change_logs`
- [x] Логирование в `PATCH /status-rows/:id` и `PATCH /shifts/:id/confirm`
- [x] `GET /change-logs?entityType=&entityId=&limit=` — эндпоинт с фильтрами
- [x] Вкладка «История изменений» в модалке проекта

---

## Этап 6 — Бэклог задач (API)

- [x] `GET /tasks` — список с фильтром по статусу; include creator + assignments с users
- [x] `POST /tasks` — создание (admin)
- [x] `POST /tasks/:id/assign` — взять задачу (любой); меняет статус, создаёт TaskAssignment; транзакция
- [x] `PATCH /tasks/:id/complete` — завершить; проверяет исполнителя или admin; транзакция
- [x] `DELETE /tasks/:id` — удаление (admin)

> **Примечание**: `TasksPage.tsx` (Web) — stub, UI ещё не реализован. См. TODO.

---

## Этап 7 — Аналитика (API)

- [x] `GET /analytics/shifts` — смены по сотрудникам за период, группировка по типу, кол-во проектов
- [x] `GET /analytics/projects` — проекты с составом команды и кол-вом смен
- [x] `GET /analytics/tasks` — задачи с исполнителями + сводка по статусам

> **Примечание**: `AnalyticsPage.tsx` (Web) — stub, UI ещё не реализован. См. TODO.

---

## Этап 8 — Деплой

- [x] `docker-compose.prod.yml` — production конфигурация: postgres (без внешнего порта), api, web, nginx, certbot, backup
- [x] `nginx/nginx.conf` — reverse proxy: HTTP→HTTPS redirect, Let's Encrypt challenge, `/api/` → api:4000, `/` → web:80
- [x] Автоматические бэкапы PostgreSQL — `pg_dump` каждый день в 3:00, хранение 30 дней
- [x] `docs/08-deploy.md` — пошаговая инструкция по деплою, SSL, обновлению, восстановлению из бэкапа

---

## Этап 9 — Сущность Deal (Проекты)

- [x] Переименование `Project` → `StatusRow` в схеме, enum-ах, роутах, сервисах, фронтенде
- [x] Добавлена модель `ProjectDay` для отдельных дней застройки/эфира с типами
- [x] Модели `Deal`, `DealStatusRow`, `DealMatrix` в `schema.prisma`; статусы `preliminary | in_progress | completed`
- [x] `GET /deals` — список со вложенными statusRows и matrices
- [x] `GET /deals/potential` — StatusRow с `sheetMatrixId` совпадающим в MatrixRegistry, без привязки к Deal (admin)
- [x] `GET /deals/:id` — детальный Deal
- [x] `POST /deals` — создать Deal (name, client, status, statusRowIds[], matrixIds[]) (admin)
- [x] `PATCH /deals/:id` — обновить статус, заменить statusRows и matrices (admin)
- [x] `DELETE /deals/:id` — удалить группировку (StatusRow и MatrixRegistry не удаляются) (admin)
- [x] `DealsPage.tsx` — двухпанельный вид: таблица строк статусов (слева) + реестр матриц (справа), SVG-линии связи по `sheetMatrixId`, цветовая палитра групп, фильтры с персистентностью в localStorage

---

## SyncDataPage (Таблицы)

- [x] `SyncDataPage.tsx` — полноценная страница с тремя уровнями фильтрации: первичные фильтры (popup ⚙), колоночные мультиселекты, видимость колонок — всё в localStorage
- [x] `FilterGroup` определён на уровне модуля (не внутри компонента) — предотвращает reset скролла при ре-рендере
- [x] Sticky-заголовки таблицы + абсолютно позиционированные дропдауны внутри `<th>`, обёртка с `overflow: clip`

---

---

## Этап 10 — Источники данных и внутренние матрицы

### Страница Database (`apps/web/src/pages/DatabasePage.tsx`)
- [x] Вкладка «Внешние Google Sheets» — настройка URL и API-ключей для `employees_buffer`, `freelancers`, `kfpd`; `projects` и `registry` отображаются read-only
- [x] Кнопка «Обновить» — принудительная загрузка данных из Google Sheets в кэш (`POST /database/refresh/:key`)
- [x] Просмотр загруженных данных в модальном окне (`GET /database/preview/:key`)
- [x] Вкладка «Внутренние» — настройка Drive папки, URL реестра матриц, CRUD шаблонов матриц
- [x] Страница доступна только admin, nav-метка «БД»

### Конфигурация таблиц — API (`apps/api/src/routes/database.ts`)
- [x] `GET /database/config` — состояние всех таблиц (URL, ключ, rowCount, lastSyncedAt)
- [x] `PATCH /database/config/:key` — сохранить URL / API-ключ в `sheet_configs`
- [x] `POST /database/refresh/:key` — загрузить данные из Google Sheets и закешировать
- [x] `GET /database/preview/:key` — первые 200 строк из кэша в виде columns/rows
- [x] Сервис `databaseService.ts`: `TABLE_KEYS = ['employees_buffer', 'freelancers', 'kfpd']`, кэшируется в `SheetConfig.cachedData`

### Шаблоны матриц — API (`apps/api/src/routes/matrixTemplates.ts`)
- [x] `GET /matrix-templates` — список шаблонов
- [x] `POST /matrix-templates` — добавить шаблон (name + sheetUrl)
- [x] `PATCH /matrix-templates/:id` — обновить
- [x] `POST /matrix-templates/:id/activate` — сделать активным (снимает флаг у всех остальных)
- [x] `DELETE /matrix-templates/:id` — удалить

### Внутренние матрицы — API (`apps/api/src/routes/internalMatrix.ts`)
- [x] `POST /internal-matrix` — создать запись в `matrix_registry` (source='internal'), скопировать шаблон в Drive, записать данные в лист СВОД, добавить строку в реестровую таблицу; ID формат `INT-{timestamp}`
- [x] `PATCH /internal-matrix/:id` — обновить поля
- [x] `DELETE /internal-matrix/:id` — удалить (только source='internal')
- [x] `GET /internal-matrix` — список всех внутренних матриц
- [x] `GET /internal-matrix/by-client/:client` — матрицы по клиенту (для привязки к проекту)
- [x] `POST /internal-matrix/:id/check` — проверить существование файла в Drive; если не найден — автоудаление записи

### Google Drive — сервис (`apps/api/src/services/driveService.ts`)
- [x] OAuth2-аутентификация (отдельно от Service Account для Sheets)
- [x] `copyTemplateToFolder` — скопировать файл в папку Drive
- [x] `setupMatrixPermissions` — настроить права доступа к новому файлу
- [x] `writeSvodData` — записать 10 полей проекта в диапазон `СВОД!C2:C11`
- [x] `appendToInternalRegistry` — добавить строку в реестровую таблицу
- [x] `checkSpreadsheetExists` — проверить наличие файла в Drive

### Участники проекта — API (`apps/api/src/routes/projectMembers.ts`)
- [x] `GET /project-members?projectId=` — список участников проекта
- [x] `POST /project-members` — добавить участника (name, position, shifts JSONB)
- [x] `PATCH /project-members/:id` — обновить
- [x] `DELETE /project-members/:id` — удалить
- [x] UI находится в `SyncDataPage.tsx` — в панели деталей матрицы

---

## Этап 11 — Уведомления (полная реализация)

- [x] Миграция `user_notification_reads` — per-user read tracking для глобальных уведомлений (`userId = null`); `unique(userId, notificationId)`
- [x] `GET /notifications` — возвращает поле `isReadByMe` для каждого уведомления (SQL CASE по типу: личные → `is_read`, глобальные → EXISTS в `user_notification_reads`)
- [x] `GET /notifications/count` — считает непрочитанные только для текущего пользователя, не затрагивая других
- [x] `PATCH /notifications/:id/read` — для личных пишет `is_read = true`, для глобальных вставляет запись в `user_notification_reads`
- [x] `PATCH /notifications/read-all` — для личных batch-update, для глобальных INSERT...SELECT без дублей; больше не сбрасывает счётчик у других пользователей
- [x] `NotificationBell` UI — красный бейдж с числом, дропдаун со списком, иконки по типу уведомления, подсветка непрочитанных, клик → read, "Прочитать все", опрос `/count` каждые 30 сек

---

---

## Этап 14 — Эпик «Матрица как проект» (Смены внутри матрицы)

> Полная реализация управления сменами внутри внутренних матриц. UI — `InternalShiftsPanel.tsx`, задействован из `SyncDataPage.tsx`.

### Фаза 1 — Смены внутри матрицы

- [x] **Backend: `?matrixRegistryId` фильтр** — `GET /status-rows` принимает `matrixRegistryId` и возвращает только привязанные проекты
- [x] **Backend: схема `ProjectMember.shifts`** — JSON-значение `{ type, confirmed: "yes"|"pending"|null, timeStart?, timeEnd? }`; обратная совместимость: строка = `{ type: string, confirmed: null }`; поля `employment_type`, `rate_plan`, `rate_fact`, `is_approved`, `field_approvals`, `group_name` добавлены через raw SQL миграции
- [x] **Frontend: `InternalShiftsPanel`** — вкладка смен для внутренних матриц: горизонтальные саб-вкладки «Свод смен» + по одной на каждый `StatusRow` + кнопка «+»
- [x] **Frontend: `MicroProjectTab`** — одна саб-вкладка = один `StatusRow`: шапка проекта (`ProjectInfoPanel`) + таблица команды (`TeamTable`); ячейки — состояние confirmed/pending/null с цветом
- [x] **Frontend: создание `StatusRow` из матрицы** — форма `CreateMicroProjectForm`, при сохранении — привязка к матрице (`matrixRegistryId`) + автоназначение `blockSlot`
- [x] **Backend: `group_name` на участниках** — миграция + поддержка в API (`POST/PATCH /project-members`)

### Фаза 2 — Свод смен

- [x] **`ShiftsSummaryTab` (Свод смен)** — первая саб-вкладка: единая таблица всех участников всех микропроектов матрицы через `useQueries`; цвет ячейки по статусу подтверждения

### Фаза 3 — Доп. функционал смен

- [x] **Копирование микропроекта** — кнопка «Копировать» в заголовке `MicroProjectTab`; копирует `StatusRow` + всех `ProjectMember`; открывает новую вкладку
- [x] **Подтверждение участника** — клик по ячейке: `null → "yes" → null`; ПКМ → `"pending"`; цвет: серый / синий

### Фаза 3.5 — Группы и расписание блоков

- [x] **Группы по локации** — `location` определяет набор групп: `Выезд` → 6 блоков (Сбор, Завоз, Монтаж, Эфир, Демонтаж, Вывоз); `Знаменка*` → 4 блока; участники распределяются по `group_name`, drag-and-drop между группами (pointer events API)
- [x] **Блок расписания правее команды** — `GroupDateBlock` с полями Дата / Время / Начало эфира (первый мотор / начало мероприятия в зависимости от формата); хранится в `status_rows.group_schedule JSONB`; мерж через `|| $1::jsonb`
- [x] **Копирование блока Эфир/Съёмки/Мероприятие** — кнопка ⎘ у заголовка группы; создаёт `efir_2`, `efir_3`, … в `group_schedule`; кнопка × удаляет копию
- [x] **Пометка к блоку** — текстовое поле в заголовке каждой группы, хранится в `GroupScheduleEntry.note`
- [x] **Динамические метки групп по формату** — Съёмки → «Эфир» → «Съёмки»; Оффлайн → «Мероприятие»; Менеджмент → один общий блок без привязки к локации
- [x] **Backend: `group_schedule` на `StatusRow`** — миграция + `GET/PATCH /status-rows/:id/group-schedule`

### Фаза 4 — Вкладки матрицы

- [x] **Диаграмма Ганта** — `GanttTab` в `MatrixTabs.tsx`; модель `GanttTask`; CRUD `/matrix-gantt`; CSS-полосы на временной шкале через inline styles
- [x] **Заметки** — `NotesTab`; модель `MatrixNote` с автором; CRUD `/matrix-notes`; лента с `textarea`
- [x] **Документы** — `DocumentsTab`; модель `MatrixDocument`; CRUD `/matrix-documents`; список ссылок + форма добавления (имя по умолчанию = последний сегмент URL)

### Прочие улучшения в рамках эпика

- [x] Формат проекта — dropdown (`ТВ, Радио, Телерадио, Съёмки, Оффлайн, Менеджмент`) в `CreateMicroProjectForm` и `ProjectInfoPanel`
- [x] Локация проекта — dropdown c вариантами вместо текстового поля
- [x] `HoldToDelete` — удержание кнопки 0.8с для удаления участника; `DeleteConfirmModal` для удаления проекта
- [x] RMB (правая кнопка) по дате участника — массовое подтверждение по столбцу
- [x] Сворачивание столбцов таблицы команды двойным кликом по заголовку

---

## Технический долг (закрыт)

- [x] `docs/04-database-schema.md` — обновлён: добавлены `MatrixTemplate`, `ProjectMember`, `SheetConfig`, `UserNotificationRead`, новые поля `status_rows` и `matrix_registry`, таблица enum'ов, актуальный ERD
- [x] `docs/05-architecture.md` — обновлён: добавлены Google Drive интеграция, `databaseService`, внутренние матрицы, механика уведомлений, порт 5433 в dev, обновлена сетевая схема
- [x] `DELETE /project-members/:id` возвращал `{ ok: true }` при несуществующем ID — исправлено через `RETURNING id` + 404
- [x] Нейминг `sheet_url` для `drive_folder` — добавлен поясняющий комментарий в `schema.prisma`; переименование колонки нецелесообразно (8 файлов)

---

## Исправленные баги

- [x] Сепараторы попадали в панель "Без даты" — добавлен фильтр `p.source !== 'separator'`
- [x] `GET /status-rows` возвращал сепараторы — добавлен `NOT: { source: 'separator' }` в WHERE
- [x] `POST /sync/reset` падал на `'separator'` — заменено на `$queryRawUnsafe` с прямым SQL
- [x] Мёртвый импорт `interactionPlugin` в `CalendarPage.tsx` — удалён
- [x] Нет `onDelete: SetNull` на `ShiftEntry.confirmedBy` — добавлено в схему через `ALTER TABLE`
- [x] `GET /sync/logs` возвращал 403 для продюсеров — добавлен `'producer'` в `requireRole` на этом роуте
- [x] Debug `console.log` в `syncService.ts` (строки ~229–231) — удалён; мёртвый экспорт `isSyncRunning()` — удалён
- [x] `any`-касты в роутах (`deals.ts`, `shifts.ts`, `users.ts`, `tasks.ts`, `statusRows.ts`) — заменены на типизированные варианты
- [x] `mode: 'insensitive'` в `statusRows.ts` — исправлено на `Prisma.QueryMode.insensitive` (pre-existing TS error)
- [x] Синхронизация: панель прогресса показывала пустое тело при кроне или двойном запуске — добавлен fallback `sessionLogs` → `logs`, placeholder "Инициализация...", idle refetch 30s→5s, сервер возвращает `alreadyRunning: true`
- [x] `POST /sync/reset` удалял внутренние матрицы — добавлен фильтр `source = 'google'`
- [x] Разделители теряли `source = 'separator'` после сдвига строк в Google Sheets — явное указание `source` в UPDATE
- [x] Формула HYPERLINK во внутреннем реестре — исправлено на `=ГИПЕРССЫЛКА(...;...)` (русская локаль, разделитель `;`)
- [x] `pnpm db:studio` не находил `DATABASE_URL` — команда перенесена в корень монорепо: `prisma studio --schema packages/db/prisma/schema.prisma`
- [x] Фильтры "Внешние / Внутренние" в таблицах Проекты и Реестр матриц — кнопки рядом с заголовком, персистентность в localStorage
- [x] `GET /status-rows?dateNull=true` — серверный фильтр "без даты"; CalendarPage больше не загружает все проекты для фильтрации на фронте
- [x] Rate limiting на `POST /auth/login` — защита от брутфорса: max 10 попыток/мин с одного IP через `@fastify/rate-limit` (`global: false`); даунгрейд до v9 (v10 требует Fastify v5, в проекте v4)


---

## Этап 12 — Тесты (P1 + P2)

### Инфраструктура тестирования

- [x] Vitest 4 установлен в `apps/api` (`vitest@4.1.4`, `@vitest/coverage-v8`)
- [x] `apps/api/vitest.config.ts` — `globals: true`, `singleThread: true`, загрузка `.env` через `dotenv` до старта воркеров; `include: ['src/**/*.test.ts']` исключает `dist/`
- [x] `apps/api/src/test/helpers.ts` — `buildApp()` (Fastify с полным набором плагинов/роутов), `getAccessToken(app, email, password)`
- [x] `apps/api/src/test/factories.ts` — `createTestUser`, `createTestStatusRow`, `createTestAssignment`, `createTestShiftEntry`, `createTestMonthlySummary` + cleanup-функции; изоляция через UUID-email и `afterAll`-очистку
- [x] `@fastify/rate-limit` даунгрейд `^10` → `^9` — v10 требует Fastify v5, `buildApp()` падал с проверкой версии

### P1 — Чистые функции и Auth (105 тестов)

- [x] `apps/api/src/services/syncHelpers.ts` — все 13 функций из `syncService.ts` вынесены в отдельный модуль с `import type { sheets_v4 }` (нет runtime-зависимости от googleapis)
- [x] `apps/api/src/services/syncHelpers.test.ts` — 82 unit-теста: `bgHexOrNull`, `evalConditionalColor`, `parseSheetDate`, `parseProjectStatus`, `parseEmploymentType`, `cellStr`, `extractSpreadsheetId`, `serialToDate`, `isColored`
- [x] `apps/api/src/routes/auth.test.ts` — 12 integration-тестов: login/refresh/logout/me, bcrypt, cookie mechanics
- [x] `apps/api/src/plugins/auth.test.ts` — 11 integration-тестов: `authenticate` и `requireRole` с проверкой всех ролей

### P2 — Бизнес-логика (29 тестов)

- [x] `apps/api/src/routes/statusRows.test.ts` — 5 тестов `GET /status-rows/conflicts`: конфликт при одинаковой дате, нет конфликта при разных датах, фильтры `dateFrom`/`dateTo`, 401 без токена
- [x] `apps/api/src/routes/shifts.test.ts` — 5 тестов `GET /shifts/monthly-summary`: on-the-fly расчёт, overtime, доступ employee к чужому → 403, admin видит любой
- [x] `apps/api/src/services/syncService.test.ts` — 12 unit-тестов `fetchMatrixShifts` (legacy формат): колонки J/M/N-P, числа-тоталы не производят смен, пустые строки пропускаются, `employmentType`/`dates`/`activeCols` корректны; googleapis замокирован через `vi.mock`
- [x] `apps/api/src/services/syncService.integration.test.ts` — 7 integration-тестов `runFullSync()`: SyncLog success/error, пропуск матриц без URL, изоляция ошибок, abort до матричного цикла, сброс `_abortRequested`, создание separator-строк; googleapis и `prisma.matrixRegistry.findMany` замокированы для изоляции от реальных данных БД

**Итого: 134 теста, 0 провалов**

---

## Этап 13 — Тесты (P3 + P4)

### Инфраструктура Web-тестов

- [x] Vitest 4 установлен в `apps/web`; `apps/web/vitest.config.ts` — jsdom + `@vitejs/plugin-react` + `resolve.alias` для React (устраняет коллизию двух экземпляров React при pnpm-монорепо: корневой `node_modules/react` vs `apps/web/node_modules/react` → оба указывают на одну копию)
- [x] `apps/web/src/test/setup.ts` — MSW server lifecycle (`beforeAll` / `afterEach` / `afterAll`)
- [x] `apps/web/src/test/msw-server.ts` — shared MSW instance через `setupServer()` из `msw/node`
- [x] Скрипты `"test"`, `"test:watch"`, `"test:coverage"` добавлены в `apps/web/package.json`
- [x] Корневой скрипт `"test": "pnpm -r test"` добавлен в `package.json` монорепо

### P3 — Краевые случаи и фронтенд (16 тестов)

- [x] `apps/api/src/routes/statusRows.patch.test.ts` — 7 тестов `PATCH /status-rows/:id`: изменение поля → `change_log` с `oldValue`/`newValue`/`changedBy`; то же значение → лог не создаётся; `matrixRegistryId` и `blockSlot` через raw SQL; не-admin → 403; несуществующий id → 404
- [x] `apps/api/src/routes/users.test.ts` — 8 тестов `POST /users` и `DELETE /users/:id`: bcrypt-хеш хранится, не утекает в ответ; дубль email → 409; пароль < 6 символов → 400; `DELETE` ставит `isActive=false` без физического удаления; деактивированный не виден в `GET /users`; нельзя удалить себя → 400; не-admin → 403
- [x] `apps/web/src/lib/api.test.ts` — 5 тестов axios 401-перехватчика: 401 → refresh → retry → 200; refresh тоже 401 → ошибка прокидывается; `/auth/*` не ретраятся (защита от петли); параллельные 401 → refresh вызывается дважды (задокументированное ограничение — нет очереди); non-401 ошибки проходят без ретрая
- [x] `apps/web/src/hooks/useAuth.test.ts` — 4 теста `useAuthInit`: `/auth/me` 200 → `setUser(data)` + `setLoading(false)`; 401/500/network error → `setUser(null)` + `setLoading(false)`

### P4 — Расширенное покрытие (13 тестов + 2 снэпшота)

- [x] `apps/api/src/routes/internalMatrix.test.ts` — 5 тестов `POST /internal-matrix`: Drive не настроен → матрица в БД с `source='internal'` и `sheetUrl=null`; имя генерируется из `client + projectName + date`; Drive настроен → `copyTemplateToFolder` вызывается, URL сохраняется; Drive падает → матрица всё равно создаётся, ответ содержит `driveError`; не-admin → 403
- [x] `apps/api/src/routes/analytics.test.ts` — 5 тестов `GET /analytics/shifts`: группировка по пользователю (`total`, `confirmed`, `byType`, `projects`); `dateFrom`/`dateTo` отрезает сдвиги вне диапазона; `userId` фильтр; employee → 403; producer → 200
- [x] `apps/api/src/routes/statusRows.snapshot.test.ts` — 3 теста + 2 снэпшота `GET /status-rows`: snapshot ключей и типов всех 27+ полей полного ответа; `slim=true` — отсутствие join-полей; `withSeparators=true` — параметр принимается без ошибки

**Итого: 172 теста, 0 провалов** (14 тестовых файлов)

---

## Этап 14 — Отделы, Канбан и UI-доработки (сборки 86–106)

### Отделы (Канбан для творческих отделов)

- [x] **`KanbanBoard` компонент** — встроен в `InternalShiftsPanel.tsx` под кнопкой «Планировщик» для форматов `CREATIVE_FORMATS` (Моушн, Постпродакшн, Дизайн, Саунд-дизайн, Не профильный); три колонки: Заявка / В работе / Сделано
- [x] **Drag-and-drop задач** — pointer events (не HTML5 drag API); ghost-карточка при перетаскивании; смена колонки через `PATCH /kanban-tasks/:id`
- [x] **`KanbanTaskModal`** — редактирование задачи: заголовок, исполнитель (из `ProjectMember`), даты начала / конца; сохранение через `PATCH`, удаление через `DELETE`; drag-and-drop без открытия модалки
- [x] **API `kanbanTasks.ts`** — `GET`, `POST`, `PATCH`, `DELETE /kanban-tasks`; JOIN с `users` (creator_name) и `project_members` (assignee_name) в GET; raw SQL через `$queryRawUnsafe`
- [x] **Таблица `kanban_tasks` в БД** — поля: `project_id`, `title`, `status`, `created_by`, `assignee_id`, `date_start`, `date_end`

### RegistryDetailModal — вкладка Инфо

- [x] **Финансовый виджет** — бюджет план/факт по специалистам + расходам с расчётом налога; «пончик» прогресса Ганта
- [x] **Редактируемые поля** — KP-ссылка, формат, дата, продюсер, менеджер, куратор, бизнес-юнит (MultiSelect), бриф; сохранение через `PATCH /internal-matrix/:id`
- [x] **Изменение статуса** — dropdown прямо в Info-вкладке; `PATCH /internal-matrix/:id`
- [x] **Бриф** — textarea с авто-сохранением; синхронизируется при переходе между матрицами

### `RegistryDetailModal` — прочие улучшения

- [x] **`MultiSelect` компонент** — выпадающий список с множественным выбором; закрытие по клику вне; `position: fixed` для dropdown чтобы не обрезался родителем
- [x] **Название проекта в заголовке модалки** — `localEntry.projectName` / `name` / `matrixId`; local state `localEntry` — живые обновления статуса без рефетча всего реестра
- [x] **Синхронизация `briefText`** — `useEffect` по `[entry.id, entry.brief]`, чтобы бриф менялся при открытии другой матрицы
- [x] **Кнопка «Удалить»** вместо «Проверить» в шапке карточки проекта

### ProfilePage

- [x] **`ProfilePage.tsx`** — профиль пользователя, месячная сводка, список смен с кнопкой «Подтвердить» для admin; выбор месяца через UI

### ShiftPlanner (завершён)

- [x] **Временные пресеты для ТВ/Телерадио** — при первом открытии вкладки без данных автоматически заполняет `group_schedule`
- [x] **Таймлайн-компонент** — CSS grid 4-cell, синхронизация скролла через JS listener
- [x] **Рендер блоков из `group_schedule`** — динамический диапазон, шаг 30 мин, greedy stacking
- [x] **Person-first строки** — секции по бригадам, коннектор-линия
- [x] **Drag-and-drop блоков** — перемещение + resize краёв; прямой DOM, `render()` на pointerup
- [x] **Попап даты блока** — клик → ◄ дата ► + Закрыть; шаг ±1440 мин
- [x] **Резайз диапазона участника** — ручки на краях бара, зажаты диапазоном блока, шаг 30 мин
- [x] **Зум** — кнопки +/− (×1.3), 18%–600%; Ctrl+колесо с привязкой к курсору
- [x] **Сохранение изменений** — `PATCH /status-rows/:id/group-schedule` для дат/времён блоков
- [x] **«Свод матрица» (placeholder)** — вкладка добавлена в `RegistryDetailModal`, заглушка «Появится после подключения базы цен сотрудников»

---

## Сессия 2026-04-20 — Исправление кэш-багов и тестов

### Исправленные баги TanStack Query (кэш-инвалидация)

- [x] **KanbanBoard race condition** — убран `invalidate()` из `onClose` в `KanbanTaskModal` (`InternalShiftsPanel.tsx:2354`); `patchTask.onSuccess` с `setQueryData` достаточен; устранён сценарий «нужно нажать сохранить дважды»
- [x] **Открытая карточка отдела показывала устаревшие данные** — `updateProject.onSuccess` теперь вызывает `setQueryData(['micro-projects', matrixRegistryId!])` сразу, без ожидания рефетча (`InternalShiftsPanel.tsx:781`)
- [x] **Счётчик задач Ганта в вкладке Инфо не обновлялся** — исправлен ключ запроса с `'matrix-gantt'` на `'gantt-tasks'` в `SyncDataPage.tsx:2297`; теперь совпадает с ключом инвалидации в `MatrixTabs.tsx:66`
- [x] **Новые отделы не появлялись в таблице проектов** — `handleCreated/Deleted/Copied` вынесены в `invalidateMicroProjects()`, добавлена инвалидация `['status-rows-sync']` и `['micro-projects-info', matrixRegistryId]` (`InternalShiftsPanel.tsx:461`)
- [x] **Вкладка Инфо: финансовые данные не обновлялись** — `['micro-projects-info']` теперь инвалидируется из `handleCreated`, `handleDeleted`, `handleCopied`
- [x] **PATCH `/kanban-tasks` не возвращал `assignee_name`** — добавлен подзапрос к `project_members` в RETURNING (`kanbanTasks.ts:90`)

### Технический долг

- [x] **`removeMember` лишний сетевой запрос** — заменён `invalidateQueries` на `setQueryData(...filter)` (`InternalShiftsPanel.tsx:1483`)

### Тестовая инфраструктура

- [x] **`statusRows.patch.test.ts` утечка в БД** — `prisma.matrixRegistry.create` падал из-за schema drift (`unit: TEXT[]` vs `String`); исправлено на `$queryRawUnsafe` INSERT с `gen_random_uuid()` и явным `updated_at`; `afterAll` защищён `if (matrixId)`
- [x] **`internalMatrix.test.ts` 4 провала** — тесты проверяли устаревшее поведение (Drive-интеграция в POST, строка вместо массива для `unit`, проверка года '2025'); приведены в соответствие с текущей реализацией (POST не вызывает Drive, Drive-синхронизация вынесена в `/sync-to-drive`)
- [x] **Мусор `patch-test-matrix-*` в dev-БД** — удалены вручную; корень устранён исправлением теста

**Счёт тестов после сессии: 163 теста, 0 провалов**

---

## Этап 15 — Workflow: воронка задач + иерархия задача→отдел (сессия 2026-04-22–23)

### WorkflowPage (`apps/web/src/pages/WorkflowPage.tsx`, ~1000 строк)

- [x] **Канбан-воронка** — pipeline-бар с этапами: Запрос → Подключение к проекту → Производство → Сдан + [Не согласован] [Отменён]; счётчики на каждом этапе; кликабельна (фильтрует список)
- [x] **Таблица задач** — `GET /status-rows?source=manual&topLevelOnly=true`; колонки: статус, клиент, название, продюсеры, дата, формат, локация, проект; inline-редактирование всех полей
- [x] **Создание задачи** — кнопка «+ Добавить задачу» только на этапе «Запрос»; KFPD-данные для автодополнения клиентов и продюсеров
- [x] **Drag-and-drop между этапами** — pointer events API, ghost-карточка; правило: один шаг вперёд, в Не согласован/Отменён — из любого с confirm; transition connecting→production требует привязанного проекта
- [x] **Guard-попап «нет проекта»** — при попытке перетащить без `matrixRegistryId`: дропдаун матриц клиента (`GET /internal-matrix/by-client/:client`) или форма создания новой матрицы
- [x] **Блок отделов под карточкой** — кнопка «Отделы» на каждой задаче; чипы с названиями отделов из `children-summary` API; в стадии Производство — открывает детальную карточку
- [x] **AppShell**: страница `'workflow'` добавлена, доступна admin + producer

### TaskDetailPanel (`apps/web/src/pages/TaskDetailPanel.tsx`, ~450 строк)

- [x] **Двухколонный layout** — левая: все поля задачи + заметки; правая: контекстная панель
- [x] **Контекстная правая панель** — ранние стадии (request/negotiation/connecting) → `EarlyDeptsPanel` (чипы отделов + форма добавления); производство → полный `InternalShiftsPanel`
- [x] **Inline-редактирование** — все поля задачи через `PATCH /status-rows/:id`; поле «Проект» показывает привязанную матрицу
- [x] **Заметки** — textarea с сохранением через `PATCH`; синхронизация при смене задачи

### Иерархия задача → отдел (`parent_task_id`)

- [x] **Миграция БД** — добавлена колонка `parent_task_id TEXT REFERENCES status_rows(id) ON DELETE CASCADE`; CASCADE: при удалении задачи все её отделы удаляются автоматически
- [x] **API: `topLevelOnly` фильтр** — `GET /status-rows?topLevelOnly=true` исключает дочерние строки (отделы) из списка задач; работает с `matrixRegistryId` и без него
- [x] **API: `children-summary` endpoint** — `GET /status-rows/children-summary?parentIds=id1,id2,...` возвращает `{ [parentId]: string[] }` — названия отделов для чипов на канбан-карточках
- [x] **API: `parentTaskId` в POST** — отдел создаётся с привязкой к задаче (`parent_task_id = taskId`), минуя `matrixRegistryId`
- [x] **Сброс задач при удалении проекта** — `DELETE /internal-matrix/:id`: перед удалением фиксируются привязанные задачи, после FK-cascade сброса — переводятся в статус `connecting`

### InternalShiftsPanel — расширения

- [x] **`parentTaskId` prop** — панель умеет работать в двух режимах: по `matrixRegistryId` (глобальный проект) и по `parentTaskId` (задача); `CreateMicroProjectForm` учитывает оба режима
- [x] **Авто-заполнение `group_schedule` при создании ТВ-отдела** — при создании отдела с форматом Трансляция/Телерадио/Съемки + локацией автоматически устанавливается сегодняшняя дата и стандартные времена по группам: Сбор 07–10, Завоз 10–11, Монтаж 11–16, Эфир 16–18 (старт 16:30), Демонтаж 18–20, Вывоз 20–21
- [x] **'Радио' в `CREATIVE_FORMATS`** — формат Радио теперь показывает KanbanBoard вместо ShiftPlanner
- [x] **Шаг 30 минут в time-инпутах** — все `<input type="time">` в GroupDateBlock и TimeField получили `step={1800}`

### Исправленные баги

- [x] **Отделы появлялись как самостоятельные задачи** — `source='manual'` отделы (с `parent_task_id`) попадали в список задач при `?source=manual`; исправлено фильтром `topLevelOnly=true`
- [x] **ТВ-чипы показывали только формат** — `deptLabel` возвращал `d.format` («Трансляция») без префикса; исправлено: `TV_FORMATS.includes(fmt) ? \`ТВ:${fmt}\` : fmt`
- [x] **Фейковые вкладки отделов до выбора задачи** — `InternalShiftsPanel` запрашивал по `matrixRegistryId` и показывал workflow-задачи как вкладки; исправлено показом placeholder до выбора задачи
