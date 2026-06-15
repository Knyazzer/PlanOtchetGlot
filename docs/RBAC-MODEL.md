# RBAC: ролевая и функциональная модель (канон)

> Перенесено из исследования донора (`c:/scripts/planotchet/_ANALYSIS/research/20-rbac-functional-model.md`, 2026-06-11) — здесь канонический экземпляр для реализации.
> Статус реализации: хранение (`DepartmentModule`+`OrgLevel`) и ось-2 (`getOrgScope`) — сделаны; реестр модулей/гарды/сид/визуал — см. IMPLEMENTATION-PLAN 1.8.


> Спецификация доступа. Источники: `_ANALYSIS/USAGE-DATA.md` (боевой дамп — главный арбитр),
> `research/03-nexus-state.md` (код ветки `design`), `packages/db/prisma/schema.prisma` (Nexus),
> `apps/api/src/plugins/auth.ts`, роуты `calendar-entries.ts` / `projects.ts` / `users.ts` / `structure.ts` (точечная верификация),
> golden-отчёты `research/10…13` (согласование принятых решений).
> Все пути кода — относительно `c:\scripts\PlanOtchetGlot\`.

---

## 0. Концепция (два кита владельца — зафиксировано, не пересматривается)

**КИТ 1 — функциональная модель.** Есть БАЗОВЫЙ набор у любого пользователя (главная, календарь,
задачи, чаты, личный кабинет, свой план/отчёт) — это то, что уже есть в Nexus. Поверх базы каждый
ДЕПАРТАМЕНТ получает свои модули-механики (финансовый — сметы/бюджеты, HR — статусы и отсутствия, и т.д.).

**КИТ 2 — модель доступа.** Внутри департамента иерархия: сотрудник → руководитель отдела → директор
департамента. Функционал выдаётся НА ДЕПАРТАМЕНТ; уровень в иерархии определяет, **пользоваться** модулем
или **только смотреть**.

Три следствия, на которых построена вся спецификация:

1. **Роль — производная от оргструктуры, не отдельный справочник.** Иерархия уже есть в данных:
   `Department.directorId` (`schema.prisma:76-77`), `Division.headId` (`:90-91`), членство
   `UserDivision` + `position` (`:100-110`). Ничего нового для ролей хранить не нужно.
2. **Модули фиксированы в коде, БД хранит только гранты.** Это НЕ permissions-конструктор
   (отказ от него уже принят: golden 13 §4.2 — «на 57 человек не окупается»). Одна таблица
   `DepartmentModule` (департамент × ключ модуля × минимальный уровень для edit).
3. **Уровень определяет и охват данных (scope).** Для надзорных модулей (Свод, Аналитика, видимость задач):
   сотрудник видит своё → руководитель видит отдел → директор видит департамент → админ видит компанию.
   Это прямое обобщение уже принятого решения golden 13 §4.2 («руководитель видит Свод своего поддерева»).

Сверка с реальностью донора (USAGE-DATA): ядро использования — ежедневный учёт + свод для руководителей
(§5.1), им пользуются **все 57 сотрудников** → это база. Специализация по департаментам видна в данных:
смены — только эфир/монтаж (shift_air 49, shift_edit 24 — §1), финансы/HR живут без проектов (projectId 0%
у сервисных — golden 12 §1.3), доски кастомизируются под клиентов конкретного направления (§4) → это
департаментные модули.

---

## 1. Уровни доступа: производные из оргструктуры

| Уровень | Кто это | Как выводится (без новых таблиц) |
|---|---|---|
| **member** (сотрудник) | рядовой сотрудник отдела | есть запись `UserDivision` (`schema.prisma:100-110`) |
| **head** (руководитель отдела) | руководитель подразделения | `Division.headId === user.id` (`schema.prisma:90-91`) |
| **director** (директор департамента) | глава департамента | `Department.directorId === user.id` (`schema.prisma:76-77`) |
| **admin** (платформенный админ) | техадминистратор системы | `User.isAdmin` (`schema.prisma:34`) — суперфлаг, как сейчас |

Порядок: `member < head < director` (admin — вне шкалы, всегда всё). Уровень вычисляется
**в контексте конкретного департамента** — у пользователя их может быть несколько.

**Правила вывода и краевые случаи:**

- Департаменты пользователя = департаменты его отделов (`UserDivision → Division.deptId`)
  ∪ департаменты, где он `directorId`. Директору не обязательно состоять в `UserDivision`.
- Уровень в департаменте D: `director`, если `D.directorId === user.id`; иначе `head`, если он
  `headId` хотя бы одного отдела D; иначе `member`.
- **Несколько департаментов** (реально: 22 отдела на 10 департаментов, люди на стыках):
  права = объединение модулей всех своих департаментов; уровень считается отдельно в каждом
  (head в Дизайне ≠ head в Радио).
- **Фрилансер** (`userType='freelancer'`, `schema.prisma:38`): обычно без `UserDivision` →
  только база с охватом self, департаментных секций нет. Гость-доступ к доскам — v2.
- **`User.role`** (`admin/producer/user/freelancer`, `schema.prisma:39`) — vestigial
  (research 03 §3: UI предлагает одно значение), в новой модели **не используется**, из UI выпилить.
  `isAdmin` остаётся единственным суперфлагом.
- **Заместители / и.о. / «manager без отдела»** — v2 через точечный оверрайд (§4.4), в v1 не вводить
  (подтверждено golden 13 §4.2: «ручной оверрайд — только по реальному кейсу»).

**Права-режимы:**

- `view` — смотреть: страницы и данные читаются, ни одной мутационной кнопки; бейдж «Просмотр» (§5.2).
- `edit` — пользоваться: создавать/менять записи механики в своём охвате.
- `manage` — администрировать: чужие записи, справочники, выдача грантов. В v1 `manage` = только admin
  (плюс страницы-носители админки открываются модулем `tech.platform`, см. §3).

---

## 2. КИТ 1 · Матрица базового функционала

База — у **каждого** пользователя (включая фрилансеров), грантов не требует, зашита в коде.
Состав выведен из текущего Nexus (research 03 §1) + домен «День/Свод» из golden 10 (ядро донора —
809 дней, USAGE-DATA §1). В ячейках: режим · охват.

| Базовый модуль (носитель в коде) | Сотрудник | Руководитель отдела | Директор департамента | Админ |
|---|---|---|---|---|
| **Главная** — триаж дня (`DashboardPage.tsx`) | edit · self | edit · self + блок «Мой отдел» view | edit · self + блок «Департамент» view | + view · company |
| **Мой план/отчёт** — день: формат, время, минуты (новое, golden 10 §2) | edit · self | edit · self | edit · self | manage · company (правка чужого дня по запросу) |
| **Задачи** — Kanban/Gantt (`TasksPage.tsx`; полевые пермишены `routes/tasks.ts:222-236` сохраняются) | edit · свои/назначенные | + view · задачи отдела | + view · задачи департамента | manage |
| **Треки** (`TracksPage.tsx`; доступ лидер/участник — `routes/tracks.ts:48-79`) | edit · участник/лидер | + view · треки сотрудников отдела | + view · департамента | manage |
| **Календарь** — события + общий слой (`CalendarPage.tsx`) | edit · свои события; view общий/HR-слой | = | = + view расписание департамента | manage + все CalendarEntry |
| **Чаты** (`ChatsPage.tsx`) | edit | = | = | manage (удаление чужих — уже есть, `chats.ts:556`) |
| **Команда** — справочник + оргсхема read-only (golden 13 §3.1-3.2) | view · company | view · company | view · company | manage (через Персонал) |
| **Свод** (новое, golden 10; руководительский экран) | — (его строка живёт в «Мой план/отчёт») | view · отдел | view · департамент | view · company |
| **Аналитика** (golden 12 §А-1) | view · self («моя аналитика») | view · отдел | view · департамент | view · company |
| **Профиль** — тема/статус/пароль (`ProfilePanel.tsx`) | edit · self | = | = | manage (через Персонал) |

Примечания:
- «=» — как у сотрудника. Базовые модули НЕ выключаются грантами — это инвариант платформы.
- Свод/Аналитика — единственные базовые модули, где уровень меняет сам факт доступа к экрану:
  у member экрана Свода нет (его данные — в «Мой план/отчёт»), у head появляется пункт «Свод · отдел».
- Видимость задач отдела у head — это **view**: чужую задачу руководитель читает и комментирует
  через чат-карточку, но полевые пермишены (статус — исполнитель, дедлайн — автор) не отменяются.
- Охваты отдела/департамента вычисляются от `UserDivision`/`WorkItemDivision`
  (`schema.prisma:100-110, 502-512`) — данные для row-level фильтров уже есть.

---

## 3. КИТ 1 · Департаментные модули (10 реальных департаментов)

Принцип: производственные доски — это **один шаблонный модуль** (`prod.board`, `prod.workitems`),
параметризуемый департаментом (концепция шаблонов из CLAUDE.md: Kanban/Calendar/Gantt = базовый компонент
+ конфиг колонок/группировки/фильтра). Уникальный код пишется только для действительно уникальных механик.
Реестр модулей живёт в коде (§4.2), в БД — только гранты.

Пометка: **v1** — выводимо из уже существующих механик Nexus (грант + гард + страница-носитель);
**потом** — требует новой разработки (зависимость указана).

### Сквозные шаблонные модули (выдаются нескольким департаментам)

| Ключ | Механика | Готовность |
|---|---|---|
| `prod.board` | Производственная доска департамента: Kanban-шаблон с конфигом группировки (по клиенту/направлению/статусу) и фильтром «задачи отделов департамента» | **v1** — `TasksPage.tsx` Kanban + конфиг; группировка по клиенту подтверждена реальной кастомизацией (USAGE-DATA §4: S079 «Пятерочка/Перекресток», S030 «КОРП РАДИО/...») |
| `prod.workitems` | Заявки (WorkItem) своих отделов: просмотр, смена статуса, чек-лист производства | **v1** — `WorkItemDivision` (`schema.prisma:502-512`) + WorkflowTab (`ProjectsPage.tsx:864-986`) с фильтром по департаменту |

### По департаментам

| Департамент (факт нагрузки из USAGE-DATA §2) | Модули | v1 / потом | editLevel (сид) |
|---|---|---|---|
| **Персонала (HR)** (hr_hr — 148 задач) | `hr.absences` — отсутствия любому сотруднику: больничные/отпуска/отгулы/неоплачиваемые (CalendarEntry `hr_sick/hr_vacation/hr_unpaid/hr_dayoff` — механика и UI есть, `CalendarPage.tsx`, типы 1:1 с форматами донора: vacation 30, dayoff 8, sick 1, unpaid 1) | **v1** | member |
| | `hr.orgstructure` — редактирование оргструктуры: департаменты/отделы/назначение руководителей (`OrgChart.tsx:800-944`, `routes/structure.ts`) | **v1** | head |
| | `hr.presence` — статусы всех сотрудников: карта присутствия «офис/удалёнка/смена/отсутствует», derived из записей дней | **потом** (v1.5 — нужна сущность «День» из golden 10; ручной ввод присутствия — отказ, урок донора) | member |
| | `hr.vacation-plan` — график отпусков + прогноз «в отпуск через 14 дн / вернулся» (паттерн донора `buildVacationLookahead`) | **потом** | member |
| **Финансовый** (fin_fin — 195; бухгалтерия — отдел этого департамента, отдельного департамента нет) | `fin.expenses` — расходы work-items по всей компании: CRUD `Expense` (`schema.prisma:524-540`, `routes/projects.ts:238-304`) | **v1** | member |
| | `fin.budgets` — сметы/бюджеты work-items: поле `WorkItem.budget` (`schema.prisma:490`) + утверждение | **v1** | head |
| | `fin.company-finance` — сводные финансы проектов: бюджет vs расходы (вкладка «Финансы» `ProjectCardPage.tsx:701-821` работает на реальных данных) — read-only модуль | **v1** | — (read-only) |
| | `fin.registry` — реестр КФПД (Google Sheets — источник истины финансов, golden 12 §П-3: не ломать боевой процесс) | **потом** (v1 — только ссылка «Открыть матрицу») | head |
| **Коммерческий** | `com.clients` — клиенты: CRUD + bulk-import из КФПД (`routes/clients.ts:41-66`) | **v1** | member |
| | `com.projects` — реестр проектов: создание/ведение/статусы Client→Project→WI (`ProjectsPage.tsx`) | **v1** | member |
| | `com.workitems` — сквозной workflow заявок компании: WorkflowTab без фильтра по департаменту | **v1** | head |
| | sales-CRM (воронки, сделки) | **вне скоупа** — решение зафиксировано | — |
| **Технический** | `tech.platform` — страницы админки платформы: Персонал, Справочники, Роли и доступы. Опасные операции (увольнение `users.ts:215`, impersonate `users.ts:269`, bulk-onboard `users.ts:407-463`, выдача доступа) — **только `isAdmin`** независимо от модуля | **v1** | director |
| | `tech.sheets` — интеграции Google Sheets: конфиги/синк (`DatabasePage.tsx`, `routes/database.ts`) | **v1** | member |
| | `tech.support` — техподдержка: support-чаты (`chats.ts:206-229`) + диагностика | **v1** | member |
| | `tech.monitoring` — мониторинг: статусы сервисов, ссылки Grafana/Alloy (`config.alloy`) | **потом** | member |
| **Администрация** (юр.отдел — 222, АХО — 201) | `adm.svod-company` — Свод всей компании (read-only) | **v1** (вместе с доменом Свода) | — (read-only) |
| | `adm.analytics-company` — аналитика компании: 5 вкладок донора (golden 12 §А-1) по всем департаментам | **v1** | — (read-only) |
| | `adm.calendar-global` — общие записи календаря: тип `global` (CalendarEntry — механика есть) | **v1** | member |
| | `adm.announcements` — объявления компании на Главной | **потом** | head |
| **ТВ** (tv_prod — 447) | `prod.board` + `prod.workitems` (см. шаблонные) | **v1** | member |
| | `tv.studio-calendar` — календарь студий: знаменки `znamenka_kaminoka/chernaya/kupol` (CalendarEntry — механика и UI есть) | **v1** | member |
| | `tv.air-shifts` — сетка смен эфир/монтаж (shift_air 49 + shift_edit 24 — единственные реальные пользователи смен, USAGE-DATA §1) | **потом** (нужна сущность «День» + формат смен) | head |
| **Радио** (radio_red — 341) | `prod.board` + `prod.workitems` | **v1** | member |
| | `radio.air-grid` — сетка эфиров/выпусков (календарь-шаблон с конфигом) | **потом** | member |
| **Бренд медиа** (brand_div — 672, самый нагруженный отдел компании) | `prod.board` (дефолт-конфиг — группировка по клиентам: Пятерочка/Перекресток — буквально колонки S079 из USAGE-DATA §4) + `prod.workitems` | **v1** | member |
| | `brand.content-plan` — контент-план: календарь-шаблон по клиентам/площадкам | **потом** | member |
| **Корп медиа** (special_sp — 283) | `prod.board` + `prod.workitems` | **v1** | member |
| | `corp.events` — застройки/мероприятия: доска событий (типы донора «Застройка» 27, «Мероприятие» 5 — USAGE-DATA §2) | **потом** | member |
| **Дизайн** (motion 240 + graph 203) | `design.queue` — очередь заявок на дизайн: `prod.board`-конфиг с группировкой по направлениям motion/graph и входящими от других департаментов | **v1** (конфиг шаблона) | member |
| | `prod.workitems` | **v1** | member |
| | `design.workload` — загрузка дизайнеров: план/факт минут по людям (входные данные — минуты задач, 83/80% заполняемости) | **потом** (после аналитики минут) | head |

Итого v1-грантов: ~26 записей в `department_modules` — один сид-скрипт.

---

## 4. Схема данных (минимум, совместимо с Department/Division/UserDivision)

### 4.1 Prisma — одна новая таблица и один enum

```prisma
enum OrgLevel {
  member
  head
  director

  @@schema("nexus")
}

// Гранты: какому департаменту какой модуль выдан и с какого уровня им «пользуются».
// Ниже editLevel — режим «только смотреть». Ключи модулей — из реестра в коде (§4.2).
model DepartmentModule {
  deptId      String   @map("dept_id")
  moduleKey   String   @map("module_key")
  editLevel   OrgLevel @default(member) @map("edit_level")
  grantedById String?  @map("granted_by_id")   // аудит: кто выдал
  createdAt   DateTime @default(now()) @map("created_at")

  department  Department @relation(fields: [deptId], references: [id], onDelete: Cascade)

  @@id([deptId, moduleKey])
  @@index([moduleKey])
  @@map("department_modules")
  @@schema("nexus")
}
```

В `Department` добавить обратную связь `modules DepartmentModule[]`. Всё. Ролей, пермиссий,
user-role-таблиц — **нет**: иерархия уже хранится в `Department.directorId` / `Division.headId` /
`UserDivision`, уровень вычисляется на лету.

### 4.2 Реестр модулей — в коде, не в БД

`apps/api/src/lib/modules.ts` (+ зеркальный тип в web):

```ts
export const MODULES = {
  'hr.absences':        { name: 'Отсутствия',        group: 'HR',          readonly: false },
  'hr.orgstructure':    { name: 'Оргструктура',      group: 'HR',          readonly: false },
  'fin.expenses':       { name: 'Расходы',           group: 'Финансы',     readonly: false },
  'fin.budgets':        { name: 'Бюджеты',           group: 'Финансы',     readonly: false },
  'fin.company-finance':{ name: 'Финансы проектов',  group: 'Финансы',     readonly: true  },
  'com.clients':        { name: 'Клиенты',           group: 'Коммерция',   readonly: false },
  'com.projects':       { name: 'Проекты',           group: 'Коммерция',   readonly: false },
  'com.workitems':      { name: 'Workflow заявок',   group: 'Коммерция',   readonly: false },
  'prod.board':         { name: 'Доска производства',group: 'Производство',readonly: false },
  'prod.workitems':     { name: 'Заявки отдела',     group: 'Производство',readonly: false },
  'tv.studio-calendar': { name: 'Студии (знаменки)', group: 'Производство',readonly: false },
  'design.queue':       { name: 'Очередь дизайна',   group: 'Производство',readonly: false },
  'adm.svod-company':   { name: 'Свод · компания',   group: 'Администрация',readonly: true },
  'adm.analytics-company':{ name:'Аналитика · компания', group:'Администрация', readonly: true },
  'adm.calendar-global':{ name: 'Общий календарь',   group: 'Администрация',readonly: false },
  'tech.platform':      { name: 'Админка платформы', group: 'Платформа',   readonly: false },
  'tech.sheets':        { name: 'Google Sheets',     group: 'Платформа',   readonly: false },
  'tech.support':       { name: 'Техподдержка',      group: 'Платформа',   readonly: false },
} as const
export type ModuleKey = keyof typeof MODULES
```

Zod-валидация грантов — `z.enum(Object.keys(MODULES))`. Добавление модуля = строка в реестре + гард
на роутах + пункт сайдбара; БД-миграций не требует.

### 4.3 Auth-плагин: расчёт access и новые гарды

Сегодня: `plugins/auth.ts:33-36` — select без структуры; `:55` — `roles: user.isAdmin ? ['admin'] : []`;
`requireRole` понимает только `'admin'` (`:69-78`). Расширение `loadUser`:

```ts
// 1-й запрос: пользователь + структура (один findUnique c include)
const user = await prisma.user.findUnique({
  where,
  select: {
    id: true, email: true, name: true, isAdmin: true, canAccessInventory: true, isActive: true,
    divMemberships: { select: { division: { select: { id: true, deptId: true, headId: true } } } },
    divHeadOf:      { select: { id: true, deptId: true } },
    deptDirectorOf: { select: { id: true } },
  },
})
// 2-й запрос: гранты департаментов пользователя
const grants = await prisma.departmentModule.findMany({ where: { deptId: { in: deptIds } } })

// расчёт: level per dept (director > head > member), затем
// modules[key] = isAdmin ? 'edit' : (levelInDept >= grant.editLevel && !MODULES[key].readonly) ? 'edit' : 'view'
;(request as any).user = { ...как сейчас, access: { level, departments, divisions, modules, readonly } }
```

Два запроса на request; при необходимости — in-memory TTL-кеш 60s по userId (57 пользователей —
кеш тривиален). Новые гарды рядом с `requireRole`:

```ts
requireModule(key: ModuleKey, mode: 'view' | 'edit' = 'view')   // 403 { error, module, need }
requireScope(level: 'head' | 'director', deptOrDivIdFromParams) // для Свода/Аналитики
```

`requireRole('admin')` остаётся для опасных операций (Personnel: бан/импersonate/onboard).
Импersonate-защита «нельзя притвориться админом» (`auth.ts:43-45`) сохраняется.

### 4.4 v2 (заготовка, в v1 НЕ делать)

`UserModuleOverride { userId, moduleKey, mode: 'view'|'edit'|'none' }` — точечные исключения
(зам. директора, внешний аудитор). Вводить только по реальному кейсу (golden 13 §4.2).

### 4.5 `/auth/me` — payload для фронта

```jsonc
{
  "id": "…", "name": "…", "isAdmin": false,
  "access": {
    "level": "head",                                    // максимальный уровень (для бейджа в профиле)
    "departments": [{ "id": "d-design", "name": "Дизайн", "level": "head" }],
    "divisions":   [{ "id": "v-motion", "name": "Моушен", "isHead": true }],
    "modules": { "design.queue": "edit", "prod.workitems": "edit", "fin.company-finance": "view" },
    "readonly": false                                   // true в режиме «смотреть как»
  }
}
```

Фронт: хук `useAccess()` поверх стора auth (`stores/auth.ts`); хелперы `can('fin.budgets', 'edit')`,
`scopeFor('svod')`.

### 4.6 Точки замены гардов (закрытие дыр — обязательная пара к снятию гейта)

| Место | Сейчас | Станет |
|---|---|---|
| `apps/web/src/App.tsx:126` | гейт `if (!user.isAdmin) return <PersonalCabinetPage/>` | **снять** — предусловие всей модели |
| `plugins/auth.ts:55` | `roles: isAdmin ? ['admin'] : []` | + объект `access` (§4.3) |
| `routes/calendar-entries.ts:53, 83, 115` | inline `isAdmin` | карта по типу записи: `hr_*` → `hr.absences:edit`; `znamenka_*` → `tv.studio-calendar:edit` ∨ `adm.calendar-global:edit`; `global` → `adm.calendar-global:edit`; admin — всегда |
| `routes/projects.ts:102` (PATCH /projects/:id) | только `authenticate` | `com.projects:edit` ∨ продюсер проекта |
| `routes/projects.ts:199-214` (PATCH/DELETE WI) | только `authenticate` | `com.projects:edit` ∨ `prod.workitems:edit` (WI связан с отделом департамента через `WorkItemDivision`) ∨ одна из трёх ролей WI |
| `routes/projects.ts:250-304` (expenses CRUD) | только `authenticate` | `fin.expenses:edit` ∨ lineProducer этого WI |
| `routes/projects.ts` (GET WI/проектов) | отдаёт всё | поля `budget`/`expenses` в ответе только при `fin.*` (field-level select от access) |
| `routes/structure.ts:31-160` (CRUD структуры) | только `authenticate` — **дыра уже сейчас** | `hr.orgstructure:edit` ∨ admin; `POST /structure/migrate-from-sheets` (`:165`) — только admin |
| `routes/users.ts:78-288` (Personnel) | `requireRole('admin')` | чтение страниц — `tech.platform:edit`; опасные (`:215` deactivate, `:269` impersonate, `:407` bulk-onboard) — только `isAdmin` |
| `apps/web/src/components/AppShell.tsx:58-66` | защита admin-страниц по `isAdmin` | видимость пунктов из `access.modules` |

Новые роуты: `GET/POST/DELETE /access/grants` (admin-only) — админка «Роли и доступы»;
`GET /access/modules` — реестр для UI.

---

## 5. Визуал

### 5.1 Сайдбар по уровням (состав; скин — Figma Sidebar, группы с uppercase-лейблами)

```
СОТРУДНИК (Радио)         РУК. ОТДЕЛА (Дизайн)       ДИРЕКТОР (Финансовый)      АДМИН
── МОЯ РАБОТА             ── МОЯ РАБОТА              ── МОЯ РАБОТА              ── МОЯ РАБОТА
   Главная                   Главная                    Главная                    (всё)
   Мой план/отчёт            Мой план/отчёт             Мой план/отчёт
   Задачи                    Задачи                     Задачи
   Календарь                 Календарь                  Календарь
── КОМПАНИЯ               ── КОМПАНИЯ                ── КОМПАНИЯ                ── КОМПАНИЯ
   Команда                   Команда                    Команда                    (всё)
                             Свод · отдел               Свод · департамент         Свод · компания
                             Аналитика · отдел          Аналитика · департамент    Аналитика · компания
── РАДИО                  ── ДИЗАЙН                  ── ФИНАНСОВЫЙ              ── АДМИНИСТРИРОВАНИЕ
   Доска производства        Очередь дизайна            Расходы                    Персонал
   Заявки отдела             Заявки отдела              Бюджеты                    База данных
                                                        Финансы проектов 👁         Справочники
                                                                                   Роли и доступы
(чат-док справа — у всех уровней, без изменений)
```

- Департаментная секция называется именем департамента; у людей из двух департаментов — две секции.
- Пункт в режиме view помечается иконкой глаза; чисто read-only модули (`fin.company-finance`) — у всех с глазом.
- Бейджи unread/unseen и поллинг 15s (`AppShell.tsx:100-111`) не меняются; навигация остаётся `useState<Page>`.

### 5.2 Бейдж «только просмотр»

- На странице модуля в режиме view: жёлтый чип `[Eye] Просмотр` рядом с H1 + тултип
  «Редактирование доступно с уровня: руководитель отдела» (текст из `editLevel` гранта).
- Принцип: мутационные контролы **скрываются, а не дизейблятся** (кнопки «+», формы, drag-ручки,
  контекст-меню правок не рендерятся) — у view-пользователя интерфейс выглядит законченным, а не урезанным.
- Сервер дублирует: любой write при view → `403 { error: 'Forbidden', module, need: 'edit' }` —
  UI показывает тост «Только просмотр».

### 5.3 Админка «Роли и доступы» (новая страница, группа «Администрирование»)

- **Таблица департаментов** (10 строк): имя+цвет · директор (из `Department.directorId`, read-only,
  ссылка «изменить в Структуре» — назначение руководителей живёт в оргсхеме, `OrgChart.tsx:800-944`) ·
  отделы/руководители (счётчик) · **чипы выданных модулей**.
- «+ Модуль» → поповер с реестром `MODULES`, сгруппирован (HR/Финансы/Коммерция/Производство/…);
  выбор → селект `editLevel`: «Пользуются все» (member) / «С руководителя отдела» (head) /
  «Только директор» (director) → Выдать = `POST /access/grants`.
- Клик на чип → поповер: переключатель `editLevel`, тултип-аудит «выдал {grantedBy} {createdAt}»,
  кнопка «Отозвать» с **подтверждением словом** (`REVOKE` — паттерн донора `REPLACE_CONFIRM`,
  golden 13 §4). Отзыв удаляет только грант — данные модуля не трогаются.
- Уровни здесь НЕ назначаются — баннер-подсказка: «Руководители определяются оргструктурой».

### 5.4 Переключатель «смотреть как» (отладка доступа)

- Переиспользовать готовый impersonate-контур (`users.ts:269-284` + consume в `App.tsx:23-56`),
  добавив read-only вариант: `POST /users/view-as/:id` → короткий JWT с claim `viewOnly: true`;
  `loadUser` ставит `access.readonly = true` → все edit-проверки отвечают view, все мутации — 403 на сервере.
- UI: в админ-группе сайдбара «Смотреть как…» → поиск сотрудника → перезагрузка с фиолетовой полосой
  сверху: «Вы видите интерфейс как **Мария И.** (руководитель отдела · Дизайн) · только чтение · [Выйти]».
- Ограничения как у impersonate: нельзя смотреть как admin (`auth.ts:43-45`), токен короткоживущий.

---

## 6. Пять сценариев (пошагово)

**С-1. Руководитель отдела дизайна открывает свод.**
1. Login → `/auth/me`: `Division(моушен).headId === user.id` → `level: 'head'`, департамент Дизайн;
   `modules: { 'design.queue':'edit', 'prod.workitems':'edit' }`.
2. В сайдбаре в группе «Компания» появился пункт **«Свод · отдел»**.
3. `GET /svod?divisionId=v-motion&month=2026-06` → гард `requireScope('head', divisionId)`:
   `Division.headId === user.id` → 200. Чужой `divisionId` (graph) → 403.
4. Видит таблицу сотрудников **только моушена**: форматы дней, часы, минуты задач, заполненность
   (по производственному календарю РФ — golden 10 В-3). Директор Дизайна тем же экраном видит оба отдела
   (motion + graph), переключатель отделов в тулбаре.

**С-2. Финансовый директор смотрит расходы work-item.**
1. `Department(Финансовый).directorId === user.id` → `level: 'director'`; гранты департамента:
   `fin.expenses` (editLevel=member→edit), `fin.budgets` (editLevel=head→edit), `fin.company-finance` (view).
2. Открывает Проекты → карточку проекта: вкладка «Финансы» (`ProjectCardPage.tsx:701-821`) рендерится,
   т.к. есть `fin.company-finance`; суммы бюджет/расход видны полностью.
3. `GET /work-items/:id/expenses` (`projects.ts:238`) → 200 со всеми позициями (модуль company-scope).
4. Правит смету: `PATCH /work-items/:id { budget }` → гард `fin.budgets:edit` → 200.
5. Рядовой бухгалтер (member Финансового) тем же экраном: расходы **заносит** (`fin.expenses` editLevel=member),
   бюджет видит **read-only** (editLevel=head) — поле без карандаша + чип «Просмотр».

**С-3. HR заносит больничный другому сотруднику.**
1. HR-специалист — member отдела hr_hr → `hr.absences: 'edit'` (editLevel=member).
2. Календарь → «+ Запись» → модалка CalendarEntry (уже существует в `CalendarPage.tsx`; условие рендера
   меняется с `isAdmin` на `can('hr.absences','edit')`): тип `hr_sick`, сотрудник = монтажёр ТВ
   (`targetUserId`), период «весь день».
3. `POST /calendar-entries` — вместо inline `isAdmin` (`calendar-entries.ts:53`) карта типов:
   `hr_*` → `requireModule('hr.absences','edit')` → 201.
4. Запись видна: всем — в общем календаре (чекбокс-категория HR, `CalendarPage.tsx`); сотруднику —
   в «Мой план/отчёт» (день авто-помечен форматом «больничный»); руководителю отдела ТВ — в Своде отдела.

**С-4. Сотрудник радио пытается открыть бюджеты.**
1. Member отдела radio_red: `modules = { 'prod.board':'edit', 'prod.workitems':'edit' }` — ключей `fin.*` нет.
2. UI: секции «Финансовый» в сайдбаре нет; вкладка «Финансы» в карточке проекта не рендерится;
   поле «Бюджет» в WI-карточке скрыто.
3. Прямой вызов API: `PATCH /work-items/:id { budget: 0 }` → `requireModule('fin.budgets','edit')` →
   `403 { error: 'Forbidden', module: 'fin.budgets', need: 'edit' }`.
4. `GET /work-items/:id` → 200, но **без полей** `budget`/`expenses` (field-level select по access, §4.6).
5. Принцип UX: запретное не показывается вовсе — никаких серых кнопок-дразнилок; сотрудник радио даже
   не знает, что у WI есть бюджет.

**С-5. Админ выдаёт новому департаменту модуль.**
1. Администрирование → «Роли и доступы» → строка «Корп медиа» → «+ Модуль».
2. Поповер реестра → группа «Производство» → «Доска производства» (`prod.board`) →
   editLevel «Пользуются все» → Выдать.
3. `POST /access/grants { deptId, moduleKey: 'prod.board', editLevel: 'member' }` (admin-only) →
   `INSERT department_modules` + `grantedById` для аудита.
4. У всех сотрудников Корп медиа при ближайшем рефетче `/auth/me` (или F5) в сайдбаре появляется секция
   «КОРП МЕДИА → Доска производства»; уровень head/director получает в ней edit-доступ к конфигу доски.
5. Ошибся департаментом → чип → «Отозвать» → ввод слова `REVOKE` → грант удалён, данные не тронуты.

---

## 7. Сверка с USAGE-DATA и принятыми решениями (противоречий нет)

| Решение этой спецификации | Подтверждение |
|---|---|
| База = день+задачи+календарь у всех | ядро донора: 809 дней, 57 сотрудников, задачи 100% по title/assignee/date (USAGE-DATA §1-2, §5.1) |
| Свод — только с уровня head | «свод для руководителей — используют все [руководители]» (§5.1); донор показывал свод по отделам |
| Производные роли вместо справочника | golden 13 §4.2: «admin/user + производная роль руководителя из структуры»; `directorId`/`headId` уже в схеме |
| НЕ permissions-конструктор: модули в коде, в БД только гранты | golden 13 §4.2: «гранулярный RBAC-конструктор на 57 человек не окупается»; одна таблица — соразмерно |
| `prod.board` с группировкой по клиенту как дефолт медиа-департаментов | вся реальная кастомизация донора — группировка по клиентам/направлениям, не по статусам (USAGE-DATA §4) |
| HR-модуль на CalendarEntry `hr_*` | типы 1:1 с живыми форматами донора: vacation 30 / dayoff 8 / sick 1 / unpaid 1 (§1; research 03 §1.8) |
| `tv.air-shifts` — потом, и только ТВ | смены используют только эфир/монтаж: shift_air 49 + shift_edit 24 из 809 (§1) |
| Финансы — модуль департамента, не база | у донора financial-поля жили в реестре Sheets у коммерческого/финансового; сервисные отделы без проектов (golden 12 §1.3) |
| Ownership-гарды одновременно со снятием гейта | research 03 §2.1: PATCH/DELETE проектов/WI/расходов сейчас доступны любому залогиненному; `structure.ts` write вообще без ролей |
| Изоляция ролевой модели в схеме `nexus` | `public.users` хранит только идентичность (SSO-ARCHITECTURE; CLAUDE.md) — `department_modules` живёт в `nexus` |

Замечание владельцу: «бухгалтерия» — отдел внутри департамента Финансовый (отдельного департамента
в реальной структуре нет, USAGE-DATA §Масштаб) — её механики покрыты `fin.*`-модулями с editLevel.

---

## 8. Порядок внедрения v1

1. **Миграция БД**: enum `OrgLevel` + таблица `department_modules`; сид ~26 v1-грантов из §3.
2. **Auth-плагин**: расчёт `access` (2 запроса/TTL-кеш) + гарды `requireModule`/`requireScope`;
   первые API-тесты именно сюда (сейчас тестов API ноль — research 03 §0.4).
3. **Закрытие дыр** (§4.6): `structure.ts`, `projects.ts` (PATCH/DELETE/expenses + field-level budget),
   `calendar-entries.ts` (карта типов). Без этого снимать гейт нельзя.
4. **`/auth/me` access-payload** + `useAccess()` + **снятие гейта `App.tsx:126`** (PersonalCabinetPage
   упраздняется, функции — в ProfilePanel, по плану golden 13).
5. **Сайдбар**: департаментные секции из `access.modules`, иконка-глаз и бейдж «Просмотр».
6. **Админка «Роли и доступы»** + «Смотреть как» (read-only impersonate поверх готового контура).

Зависимости: пункты Свод/Аналитика/«Мой план/отчёт» появляются вместе с доменом ядра (golden 10);
модель доступа к ним готова заранее и не блокирует. `hr.presence`, `tv.air-shifts`, `design.workload`,
`fin.registry`, `corp.events`, `radio.air-grid`, `brand.content-plan`, `adm.announcements`,
`tech.monitoring`, `hr.vacation-plan` — «потом», вводятся записью в реестр + грантом без миграций.
