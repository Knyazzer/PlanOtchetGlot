# TV Shifts — Схема базы данных

База данных: **PostgreSQL**. ORM: **Prisma**.

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
├── is_staff        BOOLEAN, DEFAULT true   -- false = фрилансер (не в системе, только справочно)
├── is_active       BOOLEAN, DEFAULT true
├── created_at      TIMESTAMP
└── updated_at      TIMESTAMP
```

---

### projects — Проекты

```sql
projects
├── id                  UUID, PK
├── client              TEXT
├── name                TEXT, NOT NULL
├── exec_producer       TEXT
├── line_producer       TEXT
├── account_manager     TEXT
├── date                DATE, NULLABLE          -- Может быть null (дата неизвестна)
├── date_confirmed      BOOLEAN, DEFAULT false  -- true = дата утверждена
├── date_approximate    TEXT, NULLABLE          -- "май 2026" если точной даты нет
├── time                TIME, NULLABLE
├── format              TEXT
├── location            TEXT
├── status              ENUM(preliminary, ready, completed, manual)
├── source              ENUM(projects_table, manual)  -- откуда пришёл
├── matrix_url          TEXT, NULLABLE          -- Ссылка на матрицу (из таблицы проектов)
├── matrix_registry_id  UUID, FK → matrix_registry, NULLABLE
├── uncertain_fields    TEXT[], DEFAULT '{}'    -- ['date', 'client', ...] — подсвеченные поля
├── google_row_index    INT, NULLABLE           -- Номер строки в Google Sheets
├── created_at          TIMESTAMP
└── updated_at          TIMESTAMP
```

---

### matrix_registry — Реестр матриц

```sql
matrix_registry
├── id              UUID, PK
├── matrix_id       TEXT, UNIQUE, NOT NULL  -- ID из реестра (напр. ТВ2632550)
├── sheet_url       TEXT, NULLABLE          -- Ссылка на Google Sheets матрицы
├── status          TEXT                    -- Производство / Сдан / пусто
├── unit            TEXT                    -- Бизнес-юнит
├── client          TEXT
├── name            TEXT
├── format          TEXT
├── date            DATE, NULLABLE
├── producer        TEXT
├── manager         TEXT
├── curator         TEXT
├── project_id      UUID, FK → projects, NULLABLE  -- связь с проектом
├── last_synced_at  TIMESTAMP
├── created_at      TIMESTAMP
└── updated_at      TIMESTAMP
```

---

### project_assignments — Состав команды проекта

Одна запись = один специалист на одном проекте.

```sql
project_assignments
├── id                  UUID, PK
├── project_id          UUID, FK → projects, NOT NULL
├── user_id             UUID, FK → users, NULLABLE  -- null если ФИО не распознано
├── unmatched_name      TEXT, NULLABLE              -- ФИО из матрицы если не найден в users
├── role_on_site        TEXT                        -- Функция на площадке
├── shift_format        TEXT                        -- Формат смены (Смена до 8ч. и др.)
├── employment_type     ENUM(staff, ip_7, ip_8, ip_10, szt)  -- ШТАТ или фрилансер
├── planned_shifts      INT, DEFAULT 0
├── actual_shifts       INT, DEFAULT 0
├── created_at          TIMESTAMP
└── updated_at          TIMESTAMP
```

---

### shift_entries — Записи смен (по дням)

Одна запись = один выход на смену (один день).

```sql
shift_entries
├── id              UUID, PK
├── assignment_id   UUID, FK → project_assignments, NOT NULL
├── user_id         UUID, FK → users, NOT NULL
├── project_id      UUID, FK → projects, NOT NULL
├── date            DATE, NOT NULL
├── shift_type      ENUM(zastroyka, efir, demontazh)  -- застройка / эфир / демонтаж
├── confirmed       BOOLEAN, DEFAULT false
├── confirmed_by    UUID, FK → users, NULLABLE
├── confirmed_at    TIMESTAMP, NULLABLE
├── source          ENUM(matrix, manual)  -- откуда взялась смена
├── created_at      TIMESTAMP
└── updated_at      TIMESTAMP
```

---

### monthly_summaries — Итоги по месяцам

```sql
monthly_summaries
├── id                  UUID, PK
├── user_id             UUID, FK → users, NOT NULL
├── year                INT, NOT NULL
├── month               INT, NOT NULL           -- 1–12
├── working_days        INT, NOT NULL           -- рабочих дней в месяце
├── threshold           INT, NOT NULL           -- ceil(working_days × 16/22)
├── total_shifts        INT, DEFAULT 0          -- подтверждённые смены
├── overtime_shifts     INT, DEFAULT 0          -- смены сверх порога
├── vacation_days       INT, DEFAULT 0          -- добавлено вручную администратором
├── updated_by          UUID, FK → users, NULLABLE
├── created_at          TIMESTAMP
└── updated_at          TIMESTAMP

UNIQUE(user_id, year, month)
```

---

### tasks — Бэклог задач

```sql
tasks
├── id          UUID, PK
├── title       TEXT, NOT NULL
├── description TEXT
├── status      ENUM(open, in_progress, done)
├── created_by  UUID, FK → users, NOT NULL
├── created_at  TIMESTAMP
└── updated_at  TIMESTAMP
```

---

### task_assignments — Кто взял задачу

```sql
task_assignments
├── id              UUID, PK
├── task_id         UUID, FK → tasks, NOT NULL
├── user_id         UUID, FK → users, NOT NULL
├── assigned_at     TIMESTAMP
└── completed_at    TIMESTAMP, NULLABLE
```

---

### notifications — Уведомления

```sql
notifications
├── id              UUID, PK
├── type            ENUM(no_matrix, unmatched_name, data_conflict, schedule_change)
├── entity_type     TEXT        -- 'project' | 'assignment' | 'shift'
├── entity_id       UUID
├── message         TEXT
├── user_id         UUID, FK → users, NULLABLE  -- null = глобальное (всем)
├── is_read         BOOLEAN, DEFAULT false
├── created_at      TIMESTAMP
└── updated_at      TIMESTAMP
```

---

### change_logs — История изменений

```sql
change_logs
├── id              UUID, PK
├── entity_type     TEXT        -- 'project' | 'shift_entry' | 'assignment' | ...
├── entity_id       UUID
├── field           TEXT        -- какое поле изменилось
├── old_value       TEXT
├── new_value       TEXT
├── changed_by      UUID, FK → users, NULLABLE  -- null = система (синхронизация)
├── source          ENUM(sync, manual)
└── changed_at      TIMESTAMP
```

---

### sync_logs — История синхронизаций

```sql
sync_logs
├── id              UUID, PK
├── type            ENUM(projects, registry, matrix)
├── target_id       TEXT, NULLABLE  -- ID матрицы или spreadsheet ID
├── status          ENUM(running, success, error)
├── changes_count   INT, DEFAULT 0
├── errors          JSONB           -- массив ошибок если были
├── started_at      TIMESTAMP
└── finished_at     TIMESTAMP, NULLABLE
```

---

## Связи (ERD кратко)

```
users ──────────────────── shift_entries (user_id)
  │                              │
  │                        project_assignments (user_id)
  │                              │
  └── monthly_summaries     projects ──── matrix_registry
  │                              │
  └── task_assignments ──── tasks
  │
  └── notifications
  └── change_logs
```

---

## Индексы (ключевые)

```sql
-- Быстрый поиск смен по дате и пользователю
CREATE INDEX idx_shift_entries_user_date ON shift_entries(user_id, date);

-- Производственный календарь — смены за период
CREATE INDEX idx_shift_entries_date ON shift_entries(date);

-- Проекты по дате
CREATE INDEX idx_projects_date ON projects(date);

-- Уведомления пользователя
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);

-- Маппинг ФИО
CREATE INDEX idx_users_full_name ON users(full_name);
```
