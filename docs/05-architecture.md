# TV Shifts — Архитектура и стек

## Технический стек

### Frontend (`apps/web`)

| Инструмент | Версия | Назначение |
|-----------|--------|-----------|
| React | 18+ | UI-фреймворк |
| TypeScript | 5+ | Типизация |
| Vite | 5+ | Сборка |
| TanStack Router | latest | Роутинг |
| TanStack Query | v5 | Кэш, синхронизация с сервером |
| FullCalendar | v6 | Производственный календарь |
| shadcn/ui | latest | UI-компоненты (таблицы, формы, модалки) |
| Tailwind CSS | v3 | Стили |
| Zustand | latest | Глобальное состояние (UI) |

### Backend (`apps/api`)

| Инструмент | Версия | Назначение |
|-----------|--------|-----------|
| Node.js | 20+ | Runtime |
| TypeScript | 5+ | Типизация |
| Fastify | v4 | HTTP-сервер |
| Prisma | v5 | ORM, миграции |
| @fastify/jwt | latest | JWT авторизация |
| bcrypt | latest | Хэширование паролей |
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
| Docker Compose | Оркестрация локального окружения |
| pnpm workspaces | Монорепо |
| Nginx | Reverse proxy (фаза 2, сервер) |

---

## Структура проекта (монорепо)

```
tv-shifts/
├── apps/
│   ├── web/                    # React-приложение
│   │   ├── src/
│   │   │   ├── pages/          # Страницы (calendar, admin, profile, backlog)
│   │   │   ├── components/     # UI-компоненты
│   │   │   ├── hooks/          # TanStack Query хуки
│   │   │   ├── stores/         # Zustand сторы
│   │   │   └── lib/            # Утилиты, конфиги
│   │   └── vite.config.ts
│   │
│   └── api/                    # Fastify-сервер
│       ├── src/
│       │   ├── routes/         # HTTP-роуты
│       │   ├── services/       # Бизнес-логика
│       │   ├── sync/           # Google Sheets синхронизация
│       │   │   ├── projects-parser.ts
│       │   │   ├── registry-parser.ts
│       │   │   └── matrix-parser.ts
│       │   ├── scheduler/      # node-cron задачи
│       │   └── plugins/        # Fastify плагины (jwt, cors, etc.)
│       └── tsconfig.json
│
├── packages/
│   └── db/                     # Prisma schema + generated client
│       ├── prisma/
│       │   ├── schema.prisma
│       │   └── migrations/
│       └── index.ts
│
├── docker-compose.yml
├── docker-compose.prod.yml
├── pnpm-workspace.yaml
└── package.json
```

---

## Сетевая схема (локальная сеть)

```
[Браузер сотрудника] ──HTTP──> [Docker: Nginx :80]
                                        │
                          ┌─────────────┼─────────────┐
                          ▼             ▼             
                   [web :3000]   [api :4000]
                                        │
                                 [postgres :5432]
                                        │
                               [Google Sheets API]
```

---

## Авторизация

- JWT access token (15 минут) + refresh token (7 дней)
- Токены хранятся в httpOnly cookies
- Роли проверяются на уровне middleware Fastify

---

## Google Sheets API

- Используется **Google Sheets API v4** (read-only)
- Аутентификация через **Service Account** (JSON-ключ, не требует OAuth пользователя)
- Читаем: значения ячеек + форматирование (цвет фона) + объединённые ячейки
- Запрос: `spreadsheets.get` с `includeGridData: true` для получения цветов

### Rate limits

Google Sheets API: 60 запросов в минуту на проект.
При ~50 матрицах синхронизация идёт батчами с задержками между запросами.

---

## Парсер матрицы (логика)

```typescript
// Псевдокод парсера листа ₽ СМЕНЫ
function parseMatrixShifts(sheet: GoogleSheet, projectDate: Date) {
  // 1. Читаем строку 2 → получаем даты для колонок J-P
  const dates = readDatesRow(sheet, row=2, cols='J:P')

  // 2. Для каждой строки начиная с 4
  for (const row of sheet.rows.from(4)) {
    const name = row.C           // ФИО
    const role = row.G           // Функция
    const empType = row.I        // ШТАТ или ИП/СЗТ

    if (!name) continue          // Пустая строка — пропускаем

    // 3. Для каждой даты смотрим маркер
    for (const [colIndex, date] of dates.entries()) {
      const marker = row[colIndex]  // 1 или пусто
      if (!marker) continue

      // 4. Определяем тип смены по позиции
      const shiftType = date < projectDate ? 'застройка'
                      : date > projectDate ? 'демонтаж'
                      : 'эфир'

      yield { name, role, empType, date, shiftType }
    }
  }
}
```
