# План разработки V2 — TV Shifts

> Основан на gap-анализе кода (2026-05-08) + финальной модели [`project-model.md`](project-model.md).
> **Продакшн-данных нет. Реальных пользователей нет. Можно сносить всё.**

---

## Стратегия: чистая схема + переиспользование бизнес-логики

Полный rebuild схемы БД и API.
Переиспользование сложных компонентов где уже написана нетривиальная логика.

**Почему не incremental refactor:**
- Нет данных для миграции
- `StatusRow` — неправильное имя, неправильные статусы, плоская структура
- Schema drift (raw SQL колонки) — повод начать чисто
- Incremental = поддерживать две модели одновременно = баги

---

## Что сносим полностью

| Что | Почему |
|-----|--------|
| `status_rows` таблица | Заменяется на `work_items` с правильными статусами и связью с `projects` |
| `gantt_tasks` таблица | Заменяется общей системой `tasks` |
| `StatusRowStatus` enum (8 значений) | Заменяется на `WIStatus` (3 значения) + `ProjectStatus` |
| Все роуты `/status-rows` | Заменяются `/work-items` и `/projects` |
| `WorkflowPage.tsx` | Переписывается под новую модель (логика сохраняется, данные — нет) |
| `TasksPage.tsx` заглушка | Переписывается с нуля (нормальная задачная система) |

---

## Что оставляем / адаптируем

| Что | Решение |
|-----|---------|
| **Google Sheets sync** (`syncService.ts`, `matrixBlockSync.ts`) | Оставить логику, адаптировать под новые имена моделей |
| **ShiftPlanner / InternalShiftsPanel** | Оставить UI-логику, подключить к новым сущностям |
| **Auth / JWT / cookies** | Не трогать |
| **RBAC таблицы** (`roles`, `user_roles`, `role_permissions`) | Оставить, прокинуть в роуты |
| **`matrix_registry`** | Оставить — Google Sheets интеграция |
| **`project_members`** | Оставить — TV-специфика |
| **`shift_entries`** | Оставить — TV-смены |
| **`notifications`** | Оставить таблицу, расширить enum |
| **`change_logs`** | Оставить |
| **Auth plugin, rate-limit, CORS** | Не трогать |
| **Observability** | Не трогать |
| **Docker / nginx / CI** | Не трогать |

---

## Новая схема БД — полная

### Удалить из schema.prisma
```
StatusRow         → DELETE (заменить WorkItem)
GanttTask         → DELETE (заменить Task)
StatusRowStatus   → DELETE (заменить WIStatus + ProjectStatus)
```

### Добавить в schema.prisma

```prisma
// ─── Новые enum'ы ──────────────────────────────────────────────────────────

enum ProjectStatus {
  draft        // Заявка
  active       // Реализация
  done         // Сдан (авто: все WI = done)
  cancelled    // Отменён
  rejected     // Не согласован
}

enum FinancialFlag {
  pending      // Ожидает оплаты
  paid         // Оплачен
}

enum WIStatus {
  draft        // Заявка
  active       // Реализация
  done         // Сдан (авто: все отделы = завершён)
  cancelled    // Отменён
  rejected     // Не согласован
}

enum DeptSubstatus {
  not_started  // Не начат
  in_progress  // В работе
  done         // Завершён
}

enum DeptType {
  production   // ТВ, Радио, Дизайн, Бренд медиа, Корп медиа
  support      // Технический, Спецпроекты
  internal     // Финансы, Персонал, Администрация
}

enum HRStatusType {
  vacation
  sick
  remote
  business_trip
  day_off
}

enum ApprovalStatus {
  pending
  approved
  rejected
}

enum BookingStatus {
  preliminary   // WI в статусе draft
  confirmed     // WI в статусе active
  blocked       // закрыта целиком (ремонт и т.п.)
}

// Расширить NotificationType:
enum NotificationType {
  // sync (существующие)
  no_matrix
  unmatched_name
  data_conflict
  schedule_change
  // бизнес-события (новые)
  task_assigned
  task_overdue
  task_closed
  wi_status_changed
  project_status_changed
  dept_connected_to_wi
  hr_request_created
  hr_request_resolved
  studio_conflict
  meeting_invite
}

// ─── Новые модели ──────────────────────────────────────────────────────────

model Project {
  id               String        @id @default(uuid())
  name             String
  client           String?
  status           ProjectStatus @default(draft)
  financialFlag    FinancialFlag @default(pending)  @map("financial_flag")
  accountManagerId String?       @map("account_manager_id")
  createdAt        DateTime      @default(now()) @map("created_at")
  updatedAt        DateTime      @updatedAt @map("updated_at")

  accountManager   User?         @relation(fields: [accountManagerId], references: [id])
  workItems        WorkItem[]

  @@map("projects")
}

model WorkItem {
  id          String    @id @default(uuid())
  projectId   String    @map("project_id")
  name        String
  format      String?
  location    String?
  date        DateTime?
  status      WIStatus  @default(draft)
  notes       String?
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  project       Project        @relation(fields: [projectId], references: [id], onDelete: Cascade)
  deptLinks     DeptWILink[]
  tasks         Task[]
  studioBookings StudioBooking[]
  // TV-специфика — сохраняем связи
  shiftEntries  ShiftEntry[]
  members       ProjectMember[]

  @@index([date])
  @@map("work_items")
}

model Department {
  id       String    @id @default(uuid())
  name     String    @unique
  type     DeptType
  parentId String?   @map("parent_id")

  parent   Department?  @relation("DeptTree", fields: [parentId], references: [id])
  children Department[] @relation("DeptTree")
  members  DeptMember[]
  wiLinks  DeptWILink[]
  tasks    Task[]
  events   CalendarEvent[]

  @@map("departments")
}

model DeptMember {
  userId String  @map("user_id")
  deptId String  @map("dept_id")
  isHead Boolean @default(false) @map("is_head")

  user User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  dept Department @relation(fields: [deptId], references: [id], onDelete: Cascade)

  @@id([userId, deptId])
  @@map("dept_members")
}

model DeptWILink {
  id        String        @id @default(uuid())
  deptId    String        @map("dept_id")
  wiId      String        @map("wi_id")
  deadline  DateTime?
  substatus DeptSubstatus @default(not_started) @map("substatus")

  dept     Department @relation(fields: [deptId], references: [id])
  workItem WorkItem   @relation(fields: [wiId], references: [id], onDelete: Cascade)

  @@unique([deptId, wiId])
  @@map("dept_wi_links")
}

model HRStatus {
  id         String         @id @default(uuid())
  userId     String         @map("user_id")
  type       HRStatusType
  dateFrom   DateTime       @map("date_from")
  dateTo     DateTime       @map("date_to")
  status     ApprovalStatus @default(pending)
  approverId String?        @map("approver_id")
  approvedAt DateTime?      @map("approved_at")
  createdAt  DateTime       @default(now()) @map("created_at")

  user     User  @relation("HRUser",     fields: [userId],     references: [id])
  approver User? @relation("HRApprover", fields: [approverId], references: [id])

  @@map("hr_statuses")
}

model StudioBooking {
  id        String        @id @default(uuid())
  studio    String        // "znamyanka_black" | "znamyanka_white" | "radio" | ...
  wiId      String?       @map("wi_id")
  date      DateTime
  timeFrom  String?       @map("time_from")
  timeTo    String?       @map("time_to")
  status    BookingStatus @default(preliminary)
  reason    String?
  createdBy String        @map("created_by")
  createdAt DateTime      @default(now()) @map("created_at")

  workItem  WorkItem? @relation(fields: [wiId],      references: [id])
  creator   User      @relation(fields: [createdBy], references: [id])

  @@map("studio_bookings")
}

model CalendarEvent {
  id        String   @id @default(uuid())
  title     String
  date      DateTime
  timeFrom  String?  @map("time_from")
  timeTo    String?  @map("time_to")
  deptId    String?  @map("dept_id")
  creatorId String   @map("creator_id")
  isGlobal  Boolean  @default(false) @map("is_global")
  createdAt DateTime @default(now()) @map("created_at")

  dept         Department?               @relation(fields: [deptId],    references: [id])
  creator      User                      @relation(fields: [creatorId], references: [id])
  participants CalendarEventParticipant[]

  @@map("calendar_events")
}

model CalendarEventParticipant {
  eventId String @map("event_id")
  userId  String @map("user_id")

  event CalendarEvent @relation(fields: [eventId], references: [id], onDelete: Cascade)
  user  User          @relation(fields: [userId],  references: [id])

  @@id([eventId, userId])
  @@map("calendar_event_participants")
}
```

### Расширить Task (существующая таблица)
```prisma
model Task {
  // существующие поля
  id          String     @id @default(uuid())
  title       String
  description String?
  status      TaskStatus @default(open)
  createdBy   String     @map("created_by")
  createdAt   DateTime   @default(now()) @map("created_at")
  updatedAt   DateTime   @updatedAt @map("updated_at")

  // новые поля
  deadline    DateTime?
  deptId      String?    @map("dept_id")
  wiId        String?    @map("wi_id")
  isOverdue   Boolean    @default(false) @map("is_overdue")

  creator     User           @relation(fields: [createdBy], references: [id])
  dept        Department?    @relation(fields: [deptId], references: [id])
  workItem    WorkItem?      @relation(fields: [wiId], references: [id])
  assignments TaskAssignment[]

  @@map("tasks")
}
```

---

## Фазовый план разработки

### Фаза 0 — Чистка и пересборка схемы ✅ DONE
**Оценка: 3–5 дней**

```
[x] Удалить все миграции из packages/db/prisma/migrations/
[x] Переписать schema.prisma (новые модели выше + адаптированные старые)
[x] pnpm db:push + migration record — единая init-миграция с чистой схемой
[x] Обновить seed: 11 департаментов + пользователи + RBAC (без Role enum)
[x] pnpm build не падает, pnpm test → 163/163 ✅
```

Список файлов для адаптации:
- `apps/api/src/routes/statusRows.ts` → адаптирован под WorkItem (переименование роута — День 3)
- `apps/web/src/pages/WorkflowPage.tsx` → адаптировать под WorkItem API (День 3)
- `apps/web/src/pages/SyncDataPage.tsx` → адаптировать (MatrixRegistry остаётся, День 3+)

---

### Фаза 1 — Проекты и WI ✅ DONE (Day 3, commit 0711814)
**Оценка: 1–2 недели**

```
API:
[x] POST   /projects
[x] GET    /projects          (реестр + фильтры: статус, клиент, формат, период)
[x] GET    /projects/:id
[x] PATCH  /projects/:id      (статус, финансовый флаг, АМ)
[x] DELETE /projects/:id      (admin only)

[x] POST   /projects/:id/work-items
[x] GET    /projects/:id/work-items
[x] GET    /work-items/:id
[x] PATCH  /work-items/:id    (статус, дата, локация, ...)
[x] DELETE /work-items/:id

UI:
[x] WorkflowPage — адаптировать под Project + WorkItem
    Колонки: Заявка / Реализация / Сдан / [Отменён] [Не согласован]
    Карточка = WorkItem (не StatusRow)

Авто-триггеры (backend):
[x] WorkItem → active  → проверить Project, если draft → Project → active
[x] WorkItem → done    → проверить все WI проекта, если все done → Project → done (авто)
```

---

### Фаза 2 — Отделы и привязки ✅ DONE (2026-05-08)
**Оценка: 1 неделя**

```
API:
[x] GET    /departments               (список всех, с _count)
[x] GET    /departments/:id           (с members)
[x] GET    /departments/:id/members
[x] GET    /departments/:id/board     (WI сгруппированные по substatus)
[x] POST   /departments               (admin: departments:manage)
[x] PATCH  /departments/:id           (admin)
[x] DELETE /departments/:id           (admin)
[x] POST   /departments/:id/members   (назначить сотрудника в отдел)
[x] DELETE /departments/:id/members/:userId

[x] POST   /work-items/:id/dept-links         (подключить отдел к WI + дедлайн)
[x] GET    /work-items/:id/dept-links         (список привязок)
[x] PATCH  /dept-wi-links/:id/substatus       (сменить подстатус отдела)
[x] DELETE /dept-wi-links/:id

Авто-триггер:
[x] Все DeptWILink.substatus = done → WorkItem.status = done (авто)
    → cascade: все WI проекта done → Project.status = done

UI:
[x] DeptBoardPage — канбан отдела (колонки: Не начат / В работе / Завершён)
    Навигация: «Отделы» в AppShell (видно всем)
[x] AdminDeptPage — управление отделами (admin only)
    Навигация: «Упр. отделами» в AppShell (только admin)
```

---

### Фаза 3 — Task-система ✅ DONE
**Оценка: 1–2 недели**

```
API (расширить существующий /tasks):
[x] PATCH  /tasks/:id  добавить deadline, deptId, wiId
[x] GET    /tasks?deptId=&wiId=&overdue=true&assignedTo=

[x] POST   /tasks/:id/assignments  (назначить исполнителя)
[x] DELETE /tasks/:id/assignments/:userId

Крон-job:
[x] apps/api/src/jobs/overdueChecker.ts
    — каждый час: Task WHERE deadline < NOW() AND is_overdue=false AND status != done
    — UPDATE is_overdue=true → создать уведомление task_overdue

Уведомления:
[x] task_assigned  → исполнитель
[x] task_overdue   → исполнитель + создатель
[x] task_closed    → создатель

UI:
[x] TasksPage — полноценный (не заглушка)
    Три колонки: Входящие / В работе / Готово
    + раздел «Просроченные» (isOverdue=true)
    Фильтры: по отделу, по WI, только мои
```

---

### Фаза 4 — Три вида отдела (Календарь, Гантт, Доска)
**Оценка: 2–3 недели**

```
API:
[ ] GET  /departments/:id/board    → WI этого отдела по substatus
[ ] GET  /departments/:id/gantt?from=&to=
         → задачи людей отдела × время + HRStatus как "недоступен"
         → ?userId= фильтр "только мои"

[ ] GET  /calendar/events?deptId=&from=&to=
[ ] POST /calendar/events  { title, date, participantIds, isGlobal }
[ ] PATCH/DELETE /calendar/events/:id

UI:
[ ] DeptPage — страница отдела с тремя вкладками:
    [Событийный] [Гантт] [Доска проектов]
[ ] EventCalendar.tsx — месячный календарь-блоки
[ ] DeptGantt.tsx     — горизонтальные полосы по людям × дням
[ ] DeptBoard.tsx     — канбан по substatus (переиспользовать из Фазы 2)
[ ] AllProjectsBoard.tsx — директорская (Заявка/Реализация/Сдан)
```

---

### Фаза 5 — HR и Студии
**Оценка: 1 неделя**

```
API:
[ ] POST   /hr-statuses             (запрос от сотрудника)
[ ] GET    /hr-statuses?userId=&from=&to=
[ ] PATCH  /hr-statuses/:id/approve { approved: true/false }
           → уведомление сотруднику

[ ] GET    /studios/slots?studio=&from=&to=
[ ] POST   /studios/book    { studio, wiId, date, timeFrom, timeTo }
           → авто-confirm если слот свободен
           → конфликт → уведомление руководителю ТВ
[ ] PATCH  /studios/bookings/:id/block  { reason }
[ ] DELETE /studios/bookings/:id

UI:
[ ] HRPage — сотрудник подаёт заявку, руководитель/HR утверждает
[ ] Интеграция с Гантт — HR-статусы = серый блок "недоступен"
[ ] StudioCalendar — слот-вид по студиям (встроен в EventCalendar ТВ)
```

---

### Фаза 6 — Аналитика
**Оценка: 1 неделя**

```
Бэкенд /analytics готов — нужен только UI:
[ ] AnalyticsPage — финансовый срез (план/факт) + задачный срез (загрузка)
[ ] ProfilePage   — личная статистика сотрудника

Адаптировать к новым сущностям:
[ ] /analytics/projects → работает с Project + WorkItem
[ ] /analytics/tasks    → работает с Task (дедлайны, загрузка)
```

---

## Что НЕ делаем в V2

```
❌ Портал фрилансера (отдельный вход) — V3
❌ Битрикс24 интеграция — V3
❌ Учёт оборудования — V3
❌ Автокрон синхронизации — намеренно ручной
❌ React Router — useState<Page> достаточно
❌ Мобильная версия — V3
❌ Предиктивная аналитика — V3
```

---

## Порядок старта — первые 3 дня

```
День 1: ✅ DONE (commit 03eff5f)
  [x] Удалить migrations/
  [x] Переписать schema.prisma (все новые модели: WorkItem, Project, Dept, RBAC, ...)
  [x] pnpm db:push + migration record → убедиться что схема применилась
  [x] pnpm build → TypeScript компилируется (163 теста, 0 провалов)

День 2: ✅ DONE (commit b6c7c62)
  [x] Обновить seed.ts: 11 департаментов + пользователи без Role enum + RBAC через UserAppRole
  [x] Адаптировать все routes/services под WorkItem (StatusRow→WorkItem, status_rows→work_items)
  [x] Убрать Role enum из auth, permissions, users, shifts, analytics
  [x] Исправить raw SQL: убрать ::uuid касты (все id = TEXT, не native uuid)
  [x] pnpm test → 163/163 ✅

День 3: ✅ DONE (commit 0711814)
  [x] GET/POST/PATCH/DELETE /projects — полный CRUD
  [x] GET/POST /projects/:id/work-items — nested route
  [x] GET/POST/PATCH/DELETE /work-items — с авто-триггером Project.status
  [x] WorkflowPage: статусы 9→5 (draft/active/done), /work-items API
  [x] pnpm test → 163/163 ✅
```

---

> Обновлено: 2026-05-08 (Фаза 2)
> Решение А: мигрировать статусы (вариант 2) ✅
> Решение Б: Admin UI для отделов ✅
> Решение В: новая таблица `projects` + `work_items` (clean rebuild) ✅
