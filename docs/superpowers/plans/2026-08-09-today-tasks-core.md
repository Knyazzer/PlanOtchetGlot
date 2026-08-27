# «Задачи на сегодня» — ядро (кусок №1) · план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Превратить блок «Задачи на сегодня» в рабочий набор дня, согласованный с канбаном: список = задачи дня в статусе `inprogress`/`done`, создание кладёт задачу сразу «В работе» на сегодня, чекбокс гоняет `done↔inprogress`, а взятие задачи в работу (где угодно) ставит ей `startDate=сегодня`.

**Architecture:** Единственный источник «дня задачи» — `Task.startDate`. Правило связи Обзор⇄канбан⇄Свод централизовано в `PATCH /tasks/:id` (переход в `inprogress` без явного `startDate` → сегодня). Миграции нет — все поля уже есть (`status`, `startDate`, `doneAt`). `doneAt` PATCH уже проставляет/чистит сам.

**Tech Stack:** Fastify + Zod + Prisma (apps/api), React 19 + TanStack Query (apps/web), Vitest + тест-БД :5434.

## Global Constraints

- Ветка `knyazzer`. **Никогда не пушить** (push только по явному запросу Влада). Коммиты локальные, сообщения по-русски.
- Zod в роутах — только `.safeParse` + `reply.code(400)` (не `.parse`).
- Каждый `useMutation` инвалидирует затронутые запросы (`['tasks']`).
- ID схемы `nexus.*` — тип TEXT (без `::uuid`); в этих задачах raw SQL нет.
- Enum-значения статуса на фронте — строковые литералы (`'inprogress'`, `'done'`, `'backlog'`), не импорт из Prisma.
- Стейджить только явные пути своих файлов (в дереве есть параллельный WIP таблицы — не подметать `git add -A`).
- API-тесты гоняются на тест-БД :5434 (`pnpm --filter @nexus/api test`).

## File Structure

- `apps/api/src/routes/tasks.ts` — POST-схема (+`status`), commonData (+`status`); PATCH update-data (+правило `startDate=сегодня` на переход в `inprogress`). Один файл, одна ответственность (роуты задач) — уже существует, дополняем.
- `apps/api/src/routes/tasks.test.ts` — **новый**: гварды-переходы статуса (POST status, PATCH inprogress→startDate, reopen). Паттерн — как `structure.test.ts`.
- `apps/web/src/pages/DashboardPage.tsx` — `dayTasks` фильтр; `doneMut` тоггл; проп `day` в `TodayTasksTable` + payload создания (`status:'inprogress'`, `startDate:day`).

---

### Task 1: API — POST принимает `status`, PATCH ставит `startDate=сегодня` при взятии в работу

**Files:**
- Modify: `apps/api/src/routes/tasks.ts` (POST ~180-233; PATCH ~350-373)
- Test: `apps/api/src/routes/tasks.test.ts` (создать)

**Interfaces:**
- Produces: `POST /tasks` теперь принимает опц. `status: 'backlog'|'inprogress'|'done'` (default `'backlog'`). `PATCH /tasks/:id` при `status→'inprogress'` и отсутствии `startDate` в теле ставит `startDate = now()`; `doneAt` уже проставляется/чистится существующей логикой (`becomesDone`/`leavesDone`).
- Consumes: существующий `authenticate`, `TASK_SELECT`, `resolveDivisionId`.

- [ ] **Step 1: Написать падающие тесты** — создать `apps/api/src/routes/tasks.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import { prisma } from '@nexus/db'
import { tasksRoutes } from './tasks'

// Кусок №1: POST принимает status; PATCH при переходе в inprogress ставит startDate=сегодня.
const AUTH_ID = 'test-tasks-core-auth'
const CLEANUP_TITLES = ['tc-post-status', 'tc-patch-inprogress', 'tc-reopen']

let app: FastifyInstance
let token: string
let userId: string

const isToday = (d: string | Date) => {
  const x = new Date(d); const n = new Date()
  return x.getFullYear() === n.getFullYear() && x.getMonth() === n.getMonth() && x.getDate() === n.getDate()
}

beforeAll(async () => {
  app = Fastify()
  await app.register(cookie)
  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
    cookie: { cookieName: 'access_token', signed: false },
  })
  await app.register(tasksRoutes, { prefix: '/tasks' })
  await app.ready()

  const user = await prisma.user.upsert({
    where: { authId: AUTH_ID },
    update: { isActive: true },
    create: { name: 'Test Tasks Core', authId: AUTH_ID },
  })
  userId = user.id
  token = app.jwt.sign({ sub: AUTH_ID })
})

afterAll(async () => {
  await prisma.task.deleteMany({ where: { assigneeId: userId } })
  await prisma.user.deleteMany({ where: { authId: AUTH_ID } })
  await app.close()
})

describe('POST /tasks — status', () => {
  it('создаёт задачу сразу в статусе inprogress', async () => {
    const res = await app.inject({
      method: 'POST', url: '/tasks',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'tc-post-status', assigneeId: userId, status: 'inprogress' },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().status).toBe('inprogress')
  })
})

describe('PATCH /tasks/:id — переход в inprogress ставит startDate=сегодня', () => {
  it('backlog со старой датой → inprogress → startDate сегодня', async () => {
    const t = await prisma.task.create({
      data: {
        title: 'tc-patch-inprogress', assignedById: userId, assigneeId: userId,
        status: 'backlog', startDate: new Date('2020-01-01T00:00:00Z'),
      },
      select: { id: true },
    })
    const res = await app.inject({
      method: 'PATCH', url: `/tasks/${t.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: 'inprogress' },
    })
    expect(res.statusCode).toBe(200)
    expect(isToday(res.json().startDate)).toBe(true)
  })

  it('reopen done→inprogress: startDate сегодня и doneAt очищен', async () => {
    const t = await prisma.task.create({
      data: {
        title: 'tc-reopen', assignedById: userId, assigneeId: userId,
        status: 'done', startDate: new Date('2020-01-01T00:00:00Z'), doneAt: new Date('2020-01-02T00:00:00Z'),
      },
      select: { id: true },
    })
    const res = await app.inject({
      method: 'PATCH', url: `/tasks/${t.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: 'inprogress' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().doneAt).toBeNull()
    expect(isToday(res.json().startDate)).toBe(true)
  })
})
```

- [ ] **Step 2: Прогнать — убедиться, что падает**

Run: `pnpm --filter @nexus/api test -- tasks.test`
Ожидание: FAIL (POST не знает `status` → он игнорируется, задача `backlog`; PATCH не ставит `startDate`).

- [ ] **Step 3: POST — принять `status`.** В `apps/api/src/routes/tasks.ts`, в Zod-схеме POST (после `startDate: z.string().optional(),`) добавить:

```typescript
      status:      z.enum(['backlog', 'inprogress', 'done']).default('backlog'),
```

В деструктуризации `body.data` добавить `status`:

```typescript
    const { title, description, assigneeId, deadline, startDate, status, trackId, stageId, goalId,
            type, client, projectId, plannedMinutes, actualMinutes, repeatRule, repeatUntil } = body.data
```

В объект `commonData` добавить строку:

```typescript
      status: status as any, // строковый литерал → TaskStatus enum
```

- [ ] **Step 4: PATCH — ставить `startDate=сегодня` при взятии в работу.** После строк `becomesDone`/`leavesDone` добавить:

```typescript
    // «взял задачу в работу» → она падает в сегодняшний рабочий набор (если день не задан явно).
    // Централизует связь Обзор⇄канбан⇄Свод: единый источник дня — startDate.
    const becomesInProgress = d.status === 'inprogress' && task.status !== 'inprogress'
    const autoStartToday = becomesInProgress && d.startDate === undefined
```

В объекте `data` у `prisma.task.update` (рядом со строкой про `startDate`) добавить:

```typescript
        ...(autoStartToday && { startDate: new Date() }),
```

(Порядок важен: `autoStartToday` активен только когда `d.startDate === undefined`, поэтому со строкой `...(d.startDate !== undefined && { startDate: ... })` конфликта нет.)

- [ ] **Step 5: Прогнать — убедиться, что зелёно**

Run: `pnpm --filter @nexus/api test -- tasks.test`
Ожидание: PASS (3 кейса).

- [ ] **Step 6: Тайпчек API**

Run: `pnpm --filter @nexus/api build`
Ожидание: 0 ошибок TypeScript.

- [ ] **Step 7: Коммит**

```bash
git add apps/api/src/routes/tasks.ts apps/api/src/routes/tasks.test.ts
git commit -m "feat(tasks): POST принимает status; PATCH ставит startDate=сегодня при взятии в работу (ядро задач на сегодня)"
```

---

### Task 2: Frontend — Обзор показывает рабочий набор дня, создание кладёт «В работе», чекбокс done↔inprogress

**Files:**
- Modify: `apps/web/src/pages/DashboardPage.tsx` (`doneMut` ~164-167; `dayTasks` ~172-178; `TodayTasksTable` вызов ~212 и объявление ~375; `create` мутация внутри `TodayTasksTable`)

**Interfaces:**
- Consumes: `POST /tasks` с `status:'inprogress'` + `startDate` (Task 1); `PATCH /tasks/:id` c `status:'inprogress'` при снятии галки.
- Produces: `TodayTasksTable` получает новый проп `day: string` (= `selDate`).

- [ ] **Step 1: Фильтр `dayTasks` — только мой рабочий набор дня.** Заменить блок `dayTasks` (строки ~172-178) на:

```typescript
  const dayTasks = regularTasks.filter(t =>
    t.assignee.id === currentUser?.id &&
    (t.status === 'inprogress' || t.status === 'done') &&
    toDay(t.startDate) === selDate,
  )
```

- [ ] **Step 2: Чекбокс `done ↔ inprogress` (не backlog).** В `doneMut` (строка ~165) заменить payload:

```typescript
    mutationFn: (t: Task) => api.patch(`/tasks/${t.id}`, { status: t.status === 'done' ? 'inprogress' : 'done' }),
```

- [ ] **Step 3: Пробросить день в таблицу.** В JSX-вызове `<TodayTasksTable ... />` (около строки 212) добавить проп:

```tsx
          day={selDate}
```

В сигнатуре `TodayTasksTable` (объявление ~375) добавить `day` в деструктуризацию и тип:

```tsx
function TodayTasksTable({ title, tasks, meId, day, onOpen, onToggle, onChanged, onAdd: _onAdd }: {
  title: string; tasks: Task[]; meId?: string; day: string
  onOpen: (t: Task) => void; onToggle: (t: Task) => void; onChanged: () => void; onAdd: () => void
}) {
```

- [ ] **Step 4: Создание кладёт задачу «В работе» на выбранный день.** В мутации `create` внутри `TodayTasksTable` заменить тело POST на:

```typescript
    mutationFn: (d: Draft) => api.post('/tasks', {
      title: d.title.trim(), assigneeId: meId, status: 'inprogress', startDate: day,
      client: d.client || null, projectId: d.projectId || null, plannedMinutes: toMinutes(d.time),
    }),
```

- [ ] **Step 5: Тайпчек web**

Run: `pnpm --filter @nexus/web exec tsc --noEmit`
Ожидание: 0 ошибок.

- [ ] **Step 6: Проверка в браузере** (dev должен быть запущен; при залипшем tsx watch — перезапустить API)

1. В Обзоре создать задачу → она появилась в списке дня и в колонке «В работе» на канбане (страница «Задачи»).
2. Отметить готово → зачёркнута, осталась в списке; на доске уехала в «Готово».
3. Снять галку → вернулась в «В работе» (не в Бэклог).
4. Переключить день вперёд → список пуст; вернуть день → задача на месте.
5. На доске перетащить бэклог-задачу в «В работе» → она появилась в сегодняшнем Обзоре.

- [ ] **Step 7: Коммит**

```bash
git add apps/web/src/pages/DashboardPage.tsx
git commit -m "feat(dashboard): «Задачи на сегодня» = рабочий набор дня (inprogress+done, создание в работу, чекбокс done↔inprogress)"
```

---

## Self-Review

- **Покрытие спеки:** список=день+{inprogress,done} → Task 2 Step 1 ✓; создание→inprogress+сегодня → Task 1 (POST status) + Task 2 Step 4 ✓; чекбокс done↔inprogress → Task 2 Step 2 ✓; правило API →inprogress ставит startDate → Task 1 Step 4 ✓; doneAt — уже в коде (спека это отмечает) ✓; выполненные остаются / нет авто-переноса → следствие фильтра Task 2 Step 1 ✓; согласованность со Сводом (startDate) — правило Task 1 ✓. Куски №2-5 явно вне скоупа (см. спеку).
- **Плейсхолдеры:** нет — весь код приведён.
- **Согласованность типов:** `status` строковый литерал везде; `day: string` в проп/вызове совпадает; `dayTasks` использует `currentUser?.id` (есть в DashboardPage, передаётся как `meId`) и `t.assignee.id` (есть в `TASK_SELECT`).

## Не входит (следующие куски)

№2 порядок (drag, `manualOrder`), №3 drag на другой день, №4 логи истории, №5 шаблоны — отдельные планы.
