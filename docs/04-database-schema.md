# TV Shifts — Схема базы данных

База данных: **PostgreSQL**. ORM: **Prisma**. Схема: `packages/db/prisma/schema.prisma`.

---

## Таблицы

### users — Пользователи системы

```sql
users
├── id              UUID, PK
├── full_name       TEXT, NOT NULL          -- ФИО для маппинга из матриц
├── email           TEXT, UNIQUE, NOT NULL
├── password_hash   TEXT, NOT NULL
├── role            ENUM(employee, admin, producer)
├── tab_number      TEXT, NULLABLE          -- Табельный номер (только штат)
├── is_staff        BOOLEAN, DEFAULT true
├── is_active       BOOLEAN, DEFAULT true
├── created_at      TIMESTAMP
└── updated_at      TIMESTAMP
```

---

### status_rows — Строки из таблицы проектов (или ручные)

Соответствует строкам Google Sheets «Таблица проектов». Разделители месяцев хранятся здесь же с `source = 'separator'` — их нужно исключать из большинства запросов.

```sql
status_rows
├── id                  UUID, PK
├── client              TEXT, NULLABLE
├── name                TEXT, NOT NULL
├── exec_producer       TEXT, NULLABLE
├── line_producer       TEXT, NULLABLE
├── account_manager     TEXT, NULLABLE
├── date                TIMESTAMP, NULLABLE
├── date_confirmed      BOOLEAN, DEFAULT false
├── date_approximate    TEXT, NULLABLE          -- "май 2026" если точной даты нет
├── time                TEXT, NULLABLE
├── format              TEXT, NULLABLE
├── location            TEXT, NULLABLE
├── post_production     TEXT, NULLABLE          -- постпродакшн-информация
├── notes               TEXT, NULLABLE
├── status              ENUM(request, negotiation, preproduction, production,
│                            postproduction, delivered, rejected, cancelled, manual)
├── source              ENUM(projects_table, manual, separator)
├── matrix_url          TEXT, NULLABLE          -- прямая ссылка на матрицу (из таблицы проектов)
├── sheet_matrix_id     TEXT, NULLABLE          -- ID матрицы из реестра (напр. ТВ2632550)
├── uncertain_fields    TEXT[], DEFAULT '{}'    -- ['date', 'client', ...] — подсвеченные поля
├── google_row_index    INT, NULLABLE           -- Номер строки в Google Sheets
├── matrix_registry_id  UUID, FK → matrix_registry(id), NULLABLE  -- ручная привязка к матрице
├── block_slot          INT, NULLABLE           -- позиция в блоке для сортировки
├── created_at          TIMESTAMP
└── updated_at          TIMESTAMP

INDEX: status_rows(date)
```

---

### project_days — Отдельные дни проекта

Позволяет проекту иметь несколько дней застройки/эфира с разными датами и временем начала.

```sql
project_days
├── id          UUID, PK
├── project_id  UUID, FK → status_rows(id), CASCADE DELETE
├── date        TIMESTAMP, NOT NULL
├── type        ENUM(zastroyka, efir)
├── start_time  TEXT, NULLABLE
└── created_at  TIMESTAMP
```

---

### matrix_registry — Реестр матриц

Содержит как внешние матрицы (импортированные из Google Sheets, `source = 'google'`), так и внутренние (`source = 'internal'`), созданные через интерфейс.

```sql
matrix_registry
├── id              UUID, PK
├── matrix_id       TEXT, UNIQUE, NOT NULL  -- ID из реестра (напр. ТВ2632550) или INT-{timestamp}
├── sheet_url       TEXT, NULLABLE          -- Ссылка на Google Sheets матрицы
├── status          TEXT, NULLABLE
├── unit            TEXT, NULLABLE          -- Бизнес-юнит
├── client          TEXT, NULLABLE
├── name            TEXT, NULLABLE
├── format          TEXT, NULLABLE
├── date            TIMESTAMP, NULLABLE
├── producer        TEXT, NULLABLE
├── manager         TEXT, NULLABLE
├── curator         TEXT, NULLABLE
├── project_id      UUID, UNIQUE, FK → status_rows(id), NULLABLE  -- связь 1:1 (auto-detect по sheetMatrixId)
├── google_row_index INT, NULLABLE
├── has_shifts_data  BOOLEAN, NULLABLE       -- true если в матрице есть лист со сменами
├── shifts_cache     JSONB, NULLABLE         -- кэш последнего парсинга смен
├── last_synced_at   TIMESTAMP, NULLABLE
├── project_name     TEXT, NULLABLE          -- название проекта (для внутренних матриц)
├── kp_link          TEXT, NULLABLE          -- ссылка на КП
├── brief            TEXT, NULLABLE
├── source           TEXT, DEFAULT 'google'  -- 'google' | 'internal'
├── template_id      UUID, NULLABLE          -- ID использованного шаблона MatrixTemplate
├── created_at       TIMESTAMP
└── updated_at       TIMESTAMP
```

---

### project_assignments — Состав команды проекта

Одна запись = один специалист на одном проекте.

```sql
project_assignments
├── id              UUID, PK
├── project_id      UUID, FK → status_rows(id), CASCADE DELETE
├── user_id         UUID, FK → users(id), NULLABLE  -- null если ФИО не распознано
├── unmatched_name  TEXT, NULLABLE              -- ФИО из матрицы если не найден в users
├── role_on_site    TEXT, NULLABLE              -- Функция на площадке
├── shift_format    TEXT, NULLABLE              -- Формат смены (Смена до 8ч. и др.)
├── employment_type ENUM(staff, ip_7, ip_8, ip_10, szt)
├── planned_shifts  INT, DEFAULT 0
├── actual_shifts   INT, DEFAULT 0
├── created_at      TIMESTAMP
└── updated_at      TIMESTAMP
```

---

### shift_entries — Записи смен (по дням)

Одна запись = один выход на смену (один день).

```sql
shift_entries
├── id              UUID, PK
├── assignment_id   UUID, FK → project_assignments(id), CASCADE DELETE
├── user_id         UUID, FK → users(id)
├── project_id      UUID, FK → status_rows(id)
├── date            TIMESTAMP, NOT NULL
├── shift_type      ENUM(zastroyka, efir, demontazh)
├── confirmed       BOOLEAN, DEFAULT false
├── confirmed_by    UUID, FK → users(id), SET NULL ON DELETE, NULLABLE
├── confirmed_at    TIMESTAMP, NULLABLE
├── source          ENUM(matrix, manual)
├── created_at      TIMESTAMP
└── updated_at      TIMESTAMP

INDEX: shift_entries(user_id, date)
INDEX: shift_entries(date)
```

---

### monthly_summaries — Итоги по месяцам

```sql
monthly_summaries
├── id              UUID, PK
├── user_id         UUID, FK → users(id)
├── year            INT, NOT NULL
├── month           INT, NOT NULL       -- 1–12
├── working_days    INT, NOT NULL       -- рабочих дней в месяце
├── threshold       INT, NOT NULL       -- ceil(working_days × 16/22)
├── total_shifts    INT, DEFAULT 0      -- подтверждённые смены
├── overtime_shifts INT, DEFAULT 0      -- смены сверх порога
├── vacation_days   INT, DEFAULT 0      -- добавлено вручную администратором
├── updated_by      UUID, FK → users(id), NULLABLE
├── created_at      TIMESTAMP
└── updated_at      TIMESTAMP

UNIQUE(user_id, year, month)
```

---

### tasks — Бэклог задач

```sql
tasks
├── id          UUID, PK
├── title       TEXT, NOT NULL
├── description TEXT, NULLABLE
├── status      ENUM(open, in_progress, done)
├── created_by  UUID, FK → users(id)
├── created_at  TIMESTAMP
└── updated_at  TIMESTAMP
```

---

### task_assignments — Кто взял задачу

```sql
task_assignments
├── id           UUID, PK
├── task_id      UUID, FK → tasks(id), CASCADE DELETE
├── user_id      UUID, FK → users(id)
├── assigned_at  TIMESTAMP
└── completed_at TIMESTAMP, NULLABLE
```

---

### notifications — Уведомления

`userId = null` означает глобальное уведомление (видно всем). Читаемость глобальных уведомлений отслеживается per-user через `user_notification_reads`.

```sql
notifications
├── id          UUID, PK
├── type        ENUM(no_matrix, unmatched_name, data_conflict, schedule_change)
├── entity_type TEXT, NULLABLE    -- 'project' | 'assignment' | 'shift'
├── entity_id   UUID, NULLABLE
├── message     TEXT
├── user_id     UUID, FK → users(id), NULLABLE  -- null = глобальное (всем)
├── is_read     BOOLEAN, DEFAULT false           -- используется только для личных (user_id IS NOT NULL)
├── created_at  TIMESTAMP
└── updated_at  TIMESTAMP

INDEX: notifications(user_id, is_read)
```

---

### user_notification_reads — Прочитанные глобальные уведомления

Per-user read tracking для уведомлений с `user_id = null`. Личные уведомления используют `notifications.is_read`.

```sql
user_notification_reads
├── id              UUID, PK
├── user_id         UUID, FK → users(id), CASCADE DELETE
├── notification_id UUID, FK → notifications(id), CASCADE DELETE
└── read_at         TIMESTAMP

UNIQUE(user_id, notification_id)
INDEX: user_notification_reads(user_id)
```

---

### change_logs — История изменений

```sql
change_logs
├── id          UUID, PK
├── entity_type TEXT           -- 'project' | 'shift_entry' | 'assignment' | ...
├── entity_id   UUID
├── field       TEXT, NULLABLE -- какое поле изменилось
├── old_value   TEXT, NULLABLE
├── new_value   TEXT, NULLABLE
├── changed_by  UUID, FK → users(id), NULLABLE  -- null = система (синхронизация)
├── source      ENUM(sync, manual)
└── changed_at  TIMESTAMP
```

---

### sync_logs — История синхронизаций

Очищается при каждом старте сервера (`prisma.syncLog.deleteMany({})`).

```sql
sync_logs
├── id           UUID, PK
├── type         ENUM(projects, registry, matrix)
├── target_id    TEXT, NULLABLE  -- ID матрицы или spreadsheet ID
├── status       ENUM(running, success, error)
├── changes_count INT, DEFAULT 0
├── errors       JSONB, DEFAULT '[]'
├── started_at   TIMESTAMP
└── finished_at  TIMESTAMP, NULLABLE
```

---

### deals — Группировки проектов

```sql
deals
├── id         UUID, PK
├── name       TEXT, NULLABLE
├── client     TEXT, NULLABLE
├── status     ENUM(preliminary, in_progress, completed)
├── created_at TIMESTAMP
└── updated_at TIMESTAMP
```

### deal_status_rows — M2M: Deal ↔ StatusRow

```sql
deal_status_rows
├── deal_id       UUID, FK → deals(id), CASCADE DELETE
└── status_row_id UUID, FK → status_rows(id), CASCADE DELETE

PK(deal_id, status_row_id)
```

### deal_matrices — M2M: Deal ↔ MatrixRegistry

```sql
deal_matrices
├── deal_id   UUID, FK → deals(id), CASCADE DELETE
└── matrix_id UUID, FK → matrix_registry(id), CASCADE DELETE

PK(deal_id, matrix_id)
```

---

### matrix_templates — Шаблоны матриц

Шаблоны Google Sheets для создания внутренних матриц через Drive API. Только один шаблон может быть активным одновременно.

```sql
matrix_templates
├── id         UUID, PK
├── name       TEXT, NOT NULL
├── sheet_url  TEXT, NOT NULL  -- URL шаблонного Google Sheet
├── is_active  BOOLEAN, DEFAULT false
├── created_at TIMESTAMP
└── updated_at TIMESTAMP
```

---

### project_members — Ручной состав команды

Участники проекта, добавленные вручную (в отличие от `project_assignments`, которые заполняются из матриц). Смены хранятся как JSONB `{ "2024-03-15": "1", "2024-03-16": "8-18" }`.

```sql
project_members
├── id         UUID, PK
├── project_id UUID, FK → status_rows(id), CASCADE DELETE
├── name       TEXT, NOT NULL
├── position   TEXT, NULLABLE
├── shifts     JSONB, DEFAULT '{}'
├── created_at TIMESTAMP
└── updated_at TIMESTAMP
```

---

### sheet_configs — Конфигурация внешних источников данных

Хранит URL и API-ключи для всех внешних источников. Ключи (`table_key`): `projects`, `registry`, `employees_buffer`, `freelancers`, `kfpd`, `internal_registry`, `drive_folder`.

> Примечание: для ключа `drive_folder` поле `sheet_url` содержит URL папки Google Drive (не таблицы) — используется как универсальное поле конфигурационного URL.

```sql
sheet_configs
├── id            UUID, PK
├── table_key     TEXT, UNIQUE, NOT NULL
├── sheet_url     TEXT, NULLABLE   -- URL источника; для drive_folder — URL папки Drive
├── api_key       TEXT, NULLABLE   -- Google API Key (для публичных таблиц)
├── cached_data   JSONB, NULLABLE  -- кэш последнего импорта
├── last_synced_at TIMESTAMP, NULLABLE
└── updated_at    TIMESTAMP
```

---

## Enum'ы

| Enum | Значения |
|------|---------|
| `Role` | `employee`, `admin`, `producer` |
| `StatusRowStatus` | `request`, `negotiation`, `preproduction`, `production`, `postproduction`, `delivered`, `rejected`, `cancelled`, `manual` |
| `StatusRowSource` | `projects_table`, `manual`, `separator` |
| `EmploymentType` | `staff`, `ip_7`, `ip_8`, `ip_10`, `szt` |
| `ShiftType` | `zastroyka`, `efir`, `demontazh` |
| `ShiftSource` | `matrix`, `manual` |
| `DayType` | `zastroyka`, `efir` |
| `TaskStatus` | `open`, `in_progress`, `done` |
| `NotificationType` | `no_matrix`, `unmatched_name`, `data_conflict`, `schedule_change` |
| `ChangeSource` | `sync`, `manual` |
| `DealStatus` | `preliminary`, `in_progress`, `completed` |

---

## Связи (ERD кратко)

```
users ──────────────────── shift_entries (user_id, confirmed_by)
  │                              │
  │                        project_assignments (user_id)
  │                              │
  ├── monthly_summaries     status_rows ──── matrix_registry ──── matrix_templates (template_id)
  │                         │    │  └──── project_days
  ├── task_assignments ─── tasks │
  │                              ├── project_members
  ├── notifications               ├── deal_status_rows ──── deals ──── deal_matrices ──── matrix_registry
  │    └── user_notification_reads
  └── change_logs
```
