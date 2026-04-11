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
| bcryptjs | latest | Хэширование паролей |
| googleapis | latest | Google Sheets API v4 (read-only) |
| node-cron | latest | Планировщик синхронизации |
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
│           ├── services/       # syncService.ts, changeLog.ts
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
├── docker-compose.yml          # dev: только PostgreSQL
├── docker-compose.prod.yml     # prod: api + web + nginx + certbot + backup
├── nginx/nginx.conf
├── start.ps1                   # запуск api + web в отдельных PowerShell окнах
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
- `useState<Page>` в `AppShell.tsx` — список страниц: `calendar | analytics | users | tasks | profile | syncdata | deals`
- Активная страница сохраняется в `localStorage` (ключ `app-page`)
- Часть вкладок скрыта по роли: `analytics`, `users`, `syncdata` — только admin

---

## Google Sheets API

- Используется **Google Sheets API v4** (read-only)
- Аутентификация: **Service Account** (приватные таблицы) или `GOOGLE_API_KEY` (публичные)
- Читаем: значения ячеек (`userEnteredValue` / `effectiveValue`) + форматирование (цвет фона) + объединённые ячейки
- Запрос: `spreadsheets.get` с `includeGridData: true` для получения цветов
- Google API не возвращает условное форматирование в `effectiveFormat` — оцениваем правила вручную (`evalConditionalColor`)

### Rate limits и retry

- Google Sheets API: 60 запросов/мин на проект
- Задержка 1500ms между матрицами (~2 запроса каждая → ~80/мин при 50 матрицах)
- При 429/503: ретрай до 3 раз с задержками 3s / 6s

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
```

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
                           [Google Sheets API]
```
