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
- [x] `NotificationBell` в шапке — **заглушка** («В разработке»); API готов, UI временно отключён до проработки механики для разных ролей

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
