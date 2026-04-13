# TV Shifts — Архитектура и стек

## Технический стек

### Frontend (`apps/web`)

| Инструмент | Версия | Назначение |
|-----------|--------|-----------|
| React | 19 | UI-фреймворк |
| TypeScript | 5+ | Типизация |
| Vite | 8+ | Сборка |
| TanStack Query | v5 | Кэш, синхронизация с сервером |
| FullCalendar | v6 | Производственный календарь |
| Zustand | v5 | Глобальное состояние (только auth) |
| Axios | latest | HTTP-клиент |
| date-fns | latest | Работа с датами |

> **Важно**: нет UI-библиотеки (shadcn/ui, MUI, Tailwind) — весь стиль через inline styles.  
> **Роутинг**: нет React Router — навигация через `useState<Page>` в `AppShell.tsx`, страница сохраняется в `localStorage`.

### Backend (`apps/api`)

| Инструмент | Версия | Назначение |
|-----------|--------|-----------|
| Node.js | 20+ | Runtime |
| TypeScript | 5+ | Типизация |
| Fastify | v4 | HTTP-сервер |
| Prisma | v5 | ORM, миграции |
| @fastify/jwt | latest | JWT авторизация |
| @fastify/cookie | latest | Cookie support |
| @fastify/cors | latest | CORS |
| @fastify/rate-limit | latest | Rate limiting (только `POST /auth/login`, `global: false`) |
| bcryptjs | latest | Хэширование паролей |
| googleapis | latest | Google Sheets API v4 + Google Drive API v3 |
| node-cron | latest | Планировщик синхронизации (каждые 30 мин) |
| zod | latest | Валидация входящих данных |

### База данных

| Инструмент | Назначение |
|-----------|-----------|
| PostgreSQL 16 | Основная БД |
| Prisma Migrate | Управление миграциями |

### Инфраструктура

| Инструмент | Назначение |
|-----------|-----------|
| Docker | Контейнеризация |
| Docker Compose | Оркестрация (dev: только postgres, prod: все сервисы + nginx + certbot + backup) |
| pnpm workspaces | Монорепо |
| Nginx | Reverse proxy + SSL termination (production) |

---

## Структура проекта (монорепо)

```
tv-shifts/
├── apps/
│   ├── web/                    # React-приложение
│   │   └── src/
│   │       ├── pages/          # Страницы (по одной на экран)
│   │       ├── components/     # AppShell (навигация + SyncButton + NotificationBell)
│   │       ├── hooks/          # useAuth (useCurrentUser, useIsAdmin, useIsProducer)
│   │       ├── stores/         # auth.ts — Zustand store
│   │       └── lib/            # api.ts — axios instance с auto-retry на 401
│   │
│   └── api/                    # Fastify-сервер
│       └── src/
│           ├── routes/         # HTTP-роуты (по одному файлу на ресурс)
│           ├── services/       # syncService.ts, driveService.ts, databaseService.ts, changeLog.ts
│           └── plugins/        # auth.ts — authenticate + requireRole preHandlers
│
├── packages/
│   └── db/                     # Prisma schema + generated client
│       ├── prisma/
│       │   ├── schema.prisma
│       │   ├── seed.ts
│       │   └── migrations/
│       └── index.ts            -- экспортирует prisma client и типы
│
├── docker-compose.dev.yml      # dev: только PostgreSQL на порту 5433
├── docker-compose.prod.yml     # prod: api + web + nginx + certbot + backup
├── nginx/nginx.conf
├── start.ps1                   # запуск api + web в отдельных PowerShell окнах (Windows)
└── package.json
```

---

## Авторизация

- JWT access token (15 минут) + refresh token (7 дней) в httpOnly cookies
- `@fastify/jwt` читает cookie `access_token` автоматически
- `preHandler: authenticate` — проверяет JWT, возвращает 401 если нет/просрочен
- `preHandler: requireRole('admin', 'producer')` — проверяет JWT + роль
- Axios interceptor на фронтенде: при 401 автоматически запрашивает `/auth/refresh`, повторяет запрос

---

## Навигация (фронтенд)

Нет React Router. Навигация реализована через:
- `useState<Page>` в `AppShell.tsx` — страницы: `calendar | analytics | users | tasks | profile | syncdata | deals | database`
- Активная страница сохраняется в `localStorage` (ключ `app-page`)
- Часть вкладок скрыта по роли: `users`, `syncdata`, `database` — только admin; `deals` — admin + producer

---

## Google Sheets API

- Используется **Google Sheets API v4** (read-only для синхронизации)
- Аутентификация: **Service Account** (`GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY`) или `GOOGLE_API_KEY` для публичных таблиц
- Per-table API ключи хранятся в `sheet_configs` и переопределяют глобальные env-переменные
- Читаем: значения ячеек (`userEnteredValue` / `effectiveValue`) + форматирование (цвет фона) + объединённые ячейки
- Запрос: `spreadsheets.get` с `includeGridData: true` для получения цветов
- Google API не возвращает условное форматирование в `effectiveFormat` — оцениваем правила вручную (`evalConditionalColor`)

### Rate limits и retry

- Google Sheets API: 60 запросов/мин на проект
- Задержка 1500ms между матрицами (~2 запроса каждая → ~80/мин при 50 матрицах)
- При 429/503: ретрай до 3 раз с задержками 3s / 6s

---

## Google Drive API

Используется отдельно от Sheets API, через **OAuth2** (не Service Account):
- Credentials: `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN`, `GOOGLE_DRIVE_OWNER_EMAIL`
- Сервис: `apps/api/src/services/driveService.ts`

Операции при создании внутренней матрицы (`POST /internal-matrix`):
1. `copyTemplateToFolder` — копирует шаблонный Google Sheet в папку Drive
2. `setupMatrixPermissions` — настраивает права доступа
3. `writeSvodData` — записывает 10 полей проекта в `СВОД!C2:C11`
4. `appendToInternalRegistry` — добавляет строку в реестровую таблицу через Service Account

---

## Синхронизация (`syncService.ts`)

Полный цикл запускается по cron (каждые 30 мин) или вручную (`POST /sync/trigger`).

```
runFullSync():
  1. syncProjects()  → upsert status_rows из Google Sheets «Таблица проектов»
     └─ задержка 1s
  2. syncRegistry()  → upsert matrix_registry из Google Sheets «Реестр матриц»
     └─ задержка 1s
  3. for each matrix with sheetUrl:
       syncMatrix()  → парсит лист «₽ СМЕНЫ», upsert project_assignments + shift_entries
                     → сохраняет shifts_cache + has_shifts_data сразу (до матчинга имён)
       └─ задержка 1500ms
```

Каждый шаг создаёт запись `SyncLog` со статусом `running → success/error`.  
Abort-механизм: `POST /sync/stop` → `requestSyncAbort()` → флаг проверяется перед каждой матрицей.

### Источники данных (`databaseService.ts`)

Дополнительные таблицы (буфер сотрудников, фрилансеры, КФПД) управляются через `DatabasePage`:
- Конфигурация хранится в `sheet_configs` (URL + API ключ)
- `POST /database/refresh/:key` — загружает данные в `cachedData` (JSONB)
- Данные доступны через `GET /database/preview/:key`

---

## Парсер матрицы (логика)

```
Лист «₽ СМЕНЫ» (или «₽ СПЕЦИАЛИСТЫ»):

Строка 2:    [даты для колонок J–P]
Строки 4+:   C=ФИО  G=функция  I=тип занятости  J–P=маркеры (1 = работает)

Маппинг типа смены:
  J, K, L  → zastroyka  (до даты проекта)
  M        → efir        (день проекта)
  N, O, P  → demontazh  (после даты проекта)

Строка включается если есть хотя бы одно непустое поле в C/G/I/J–P.
Строки «Итог:» пропускаются.
ShiftEntry создаётся только для type = 'staff'; ИП/СЗТ — только ProjectAssignment.
```

---

## Внутренние матрицы

`MatrixRegistry` записи с `source = 'internal'` создаются через `POST /internal-matrix`. ID формат: `INT-{timestamp}`. Процесс:
1. Создаётся запись в `matrix_registry`
2. Копируется шаблон (активный `MatrixTemplate`) в папку Drive
3. Записываются данные проекта в лист `СВОД`
4. Добавляется строка в внутренний реестр (Google Sheet)

Привязка к проекту (`StatusRow`) через поле `matrix_registry_id` + `block_slot` в `status_rows`.

---

## Уведомления

`Notification` записи с `userId = null` — глобальные (видны всем). Читаемость глобальных уведомлений per-user отслеживается через `user_notification_reads` (join-таблица). Личные уведомления используют `notifications.is_read`.

Создаются синхронизацией:
- `unmatched_name` — ФИО из матрицы не найден в `users`
- `no_matrix` — проект без привязанной матрицы

---

## Сетевая схема (production)

```
[Браузер] ──HTTPS──> [Nginx :443]
                         │
               ┌─────────┴──────────┐
               ▼                    ▼
          [web :80]           [api :4000]
                                    │
                             [postgres :5432]
                                    │
                    ┌───────────────┴──────────────┐
                    ▼                              ▼
          [Google Sheets API]           [Google Drive API]
          (Service Account)                  (OAuth2)
```
