# Phase 4: Department Views (Calendar, Gantt, Board) + Projects Board

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add EventCalendar, Gantt, and Project Board tabs to a unified DeptPage, implement CalendarEvent CRUD API and dept Gantt API, and add a global AllProjectsBoard page.

**Architecture:** `calendarEvents.ts` handles `/calendar/events` CRUD (CalendarEvent model already in schema). `GET /departments/:id/gantt` is added to `departments.ts` — returns Tasks assigned to dept members. `DeptPage.tsx` (3 tabs) replaces `DeptBoardPage.tsx` in the nav. `ProjectsPage.tsx` is a new global projects kanban visible to admin/producer. All UI uses inline styles + TanStack Query; no UI libraries.

**Tech Stack:** Fastify 4, Prisma 5, Zod (API); React 19, TanStack Query, date-fns (UI); inline styles only.

---

## File Map

**Create:**
- `apps/api/src/routes/calendarEvents.ts` — CRUD for `/calendar/events`
- `apps/api/src/routes/calendarEvents.test.ts` — integration tests
- `apps/api/src/routes/deptGantt.test.ts` — gantt endpoint test
- `apps/web/src/pages/DeptPage.tsx` — dept page with 3 tabs (board + calendar + gantt)
- `apps/web/src/pages/EventCalendar.tsx` — calendar tab component
- `apps/web/src/pages/DeptGantt.tsx` — gantt tab component
- `apps/web/src/pages/ProjectsPage.tsx` — global projects kanban

**Modify:**
- `apps/api/src/routes/departments.ts` — add `GET /:id/gantt`
- `apps/api/src/server.ts` — register `calendarEventsRoutes` at `/calendar/events`
- `apps/api/src/test/helpers.ts` — register `calendarEventsRoutes`, `departmentsRoutes`, `projectsRoutes`, `workItemsRoutes`, `deptWiLinksRoutes`
- `apps/api/src/test/factories.ts` — add `createTestDept`, `cleanupTestDept`, `createTestCalendarEvent`, `cleanupTestCalendarEvent`; update `cleanupTestUser`
- `apps/web/src/components/AppShell.tsx` — add DeptPage/ProjectsPage, update nav labels
- `docs/dev-plan-v2.md` — mark Phase 4 complete
- `CLAUDE.md` — update status table

**Delete:**
- `apps/web/src/pages/DeptBoardPage.tsx` — replaced by DeptPage's board tab

---

### Task 1: Calendar Events API + Tests (TDD)

**Files:**
- Create: `apps/api/src/routes/calendarEvents.ts`
- Create: `apps/api/src/routes/calendarEvents.test.ts`
- Modify: `apps/api/src/test/factories.ts`
- Modify: `apps/api/src/test/helpers.ts`
- Modify: `apps/api/src/server.ts`

- [ ] **Step 1: Update `apps/api/src/test/factories.ts` — add dept and calendar event factories**

Add these blocks at the end of the file (before any final exports):

```typescript
// ─── Department ───────────────────────────────────────────────────────────────

interface CreateDeptOptions {
  name?: string
  type?: 'production' | 'support' | 'internal'
}

export async function createTestDept(options: CreateDeptOptions = {}) {
  return prisma.department.create({
    data: {
      name: options.name ?? `Dept-${randomUUID().slice(0, 8)}`,
      type: (options.type ?? 'production') as any,
    },
  })
}

export async function cleanupTestDept(id: string) {
  await prisma.deptMember.deleteMany({ where: { deptId: id } }).catch(() => {})
  await prisma.calendarEvent.deleteMany({ where: { deptId: id } }).catch(() => {})
  await prisma.deptWILink.deleteMany({ where: { deptId: id } }).catch(() => {})
  await prisma.department.delete({ where: { id } }).catch(() => {})
}

// ─── CalendarEvent ─────────────────────────────────────────────────────────────

interface CreateCalendarEventOptions {
  creatorId: string
  deptId?: string
  isGlobal?: boolean
  date?: Date
  title?: string
  participantIds?: string[]
}

export async function createTestCalendarEvent(options: CreateCalendarEventOptions) {
  return prisma.calendarEvent.create({
    data: {
      title:     options.title ?? 'Test Event',
      date:      options.date  ?? new Date(),
      creatorId: options.creatorId,
      deptId:    options.deptId,
      isGlobal:  options.isGlobal ?? false,
      ...(options.participantIds?.length ? {
        participants: {
          createMany: {
            data: options.participantIds.map((userId) => ({ userId })),
            skipDuplicates: true,
          },
        },
      } : {}),
    },
  })
}

export async function cleanupTestCalendarEvent(id: string) {
  await prisma.calendarEvent.delete({ where: { id } }).catch(() => {})
}
```

Also update `cleanupTestUser` — add these two lines **before** the `prisma.user.delete` line:

```typescript
  await prisma.calendarEventParticipant.deleteMany({ where: { userId: id } }).catch(() => {})
  await prisma.calendarEvent.deleteMany({ where: { creatorId: id } }).catch(() => {})
```

- [ ] **Step 2: Update `apps/api/src/test/helpers.ts` — register calendarEventsRoutes**

Add the import at the top with the other route imports:
```typescript
import { calendarEventsRoutes } from '../routes/calendarEvents'
```

Add the registration after the `projectMembersRoutes` line inside `buildApp()`:
```typescript
  await app.register(calendarEventsRoutes, { prefix: '/calendar/events' })
```

- [ ] **Step 3: Write failing tests in `apps/api/src/routes/calendarEvents.test.ts`**

```typescript
/**
 * Integration tests for /calendar/events routes.
 * CalendarEvent: per-dept events, global events (admin only), participants.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@tv-shifts/db'
import { buildApp, getAccessToken } from '../test/helpers'
import {
  createTestUser, cleanupTestUser,
  createTestDept, cleanupTestDept,
  createTestCalendarEvent, cleanupTestCalendarEvent,
} from '../test/factories'
import type { FastifyInstance } from 'fastify'

describe('/calendar/events', () => {
  let app: FastifyInstance
  let adminId: string
  let userId: string
  let adminToken: string
  let userToken: string
  let deptId: string

  beforeAll(async () => {
    app = await buildApp()
    const admin = await createTestUser({ role: 'admin' })
    const user  = await createTestUser({ role: 'employee' })
    const dept  = await createTestDept()
    adminId = admin.id
    userId  = user.id
    deptId  = dept.id
    adminToken = await getAccessToken(app, admin.email, 'testpassword123')
    userToken  = await getAccessToken(app, user.email,  'testpassword123')
  })

  afterAll(async () => {
    await cleanupTestDept(deptId)
    await cleanupTestUser(adminId)
    await cleanupTestUser(userId)
    await app.close()
    await prisma.$disconnect()
  })

  // ── GET ─────────────────────────────────────────────────────────────────────

  it('GET /calendar/events returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/calendar/events' })
    expect(res.statusCode).toBe(401)
  })

  it('GET /calendar/events returns dept events', async () => {
    const ev = await createTestCalendarEvent({ creatorId: adminId, deptId })
    const res = await app.inject({
      method: 'GET',
      url: `/calendar/events?deptId=${deptId}`,
      cookies: { access_token: adminToken },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().some((e: any) => e.id === ev.id)).toBe(true)
    await cleanupTestCalendarEvent(ev.id)
  })

  it('GET /calendar/events returns global events regardless of deptId', async () => {
    const ev = await createTestCalendarEvent({ creatorId: adminId, isGlobal: true })
    const res = await app.inject({
      method: 'GET',
      url: `/calendar/events?deptId=${deptId}`,
      cookies: { access_token: adminToken },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().some((e: any) => e.id === ev.id)).toBe(true)
    await cleanupTestCalendarEvent(ev.id)
  })

  it('GET /calendar/events returns events where dept member is a participant', async () => {
    await prisma.deptMember.create({ data: { userId, deptId, isHead: false } })
    // Event has no deptId but tags userId as participant
    const ev = await createTestCalendarEvent({ creatorId: adminId, participantIds: [userId] })
    const res = await app.inject({
      method: 'GET',
      url: `/calendar/events?deptId=${deptId}`,
      cookies: { access_token: adminToken },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().some((e: any) => e.id === ev.id)).toBe(true)
    await cleanupTestCalendarEvent(ev.id)
    await prisma.deptMember.deleteMany({ where: { userId, deptId } })
  })

  // ── POST ────────────────────────────────────────────────────────────────────

  it('POST /calendar/events creates a dept event with participants', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/calendar/events',
      cookies: { access_token: adminToken },
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title:          'Planning Meeting',
        date:           '2026-06-15',
        deptId,
        participantIds: [userId],
      }),
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.title).toBe('Planning Meeting')
    expect(body.participants).toHaveLength(1)
    await cleanupTestCalendarEvent(body.id)
  })

  it('POST /calendar/events 403 when non-admin creates global event', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/calendar/events',
      cookies: { access_token: userToken },
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Global', date: '2026-06-15', isGlobal: true }),
    })
    expect(res.statusCode).toBe(403)
  })

  // ── PATCH ───────────────────────────────────────────────────────────────────

  it('PATCH /calendar/events/:id — creator can update title', async () => {
    const ev = await createTestCalendarEvent({ creatorId: adminId, deptId })
    const res = await app.inject({
      method: 'PATCH',
      url: `/calendar/events/${ev.id}`,
      cookies: { access_token: adminToken },
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Updated Title' }),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().title).toBe('Updated Title')
    await cleanupTestCalendarEvent(ev.id)
  })

  it('PATCH /calendar/events/:id 403 for non-creator', async () => {
    const ev = await createTestCalendarEvent({ creatorId: adminId, deptId })
    const res = await app.inject({
      method: 'PATCH',
      url: `/calendar/events/${ev.id}`,
      cookies: { access_token: userToken },
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Hacked' }),
    })
    expect(res.statusCode).toBe(403)
    await cleanupTestCalendarEvent(ev.id)
  })

  // ── DELETE ──────────────────────────────────────────────────────────────────

  it('DELETE /calendar/events/:id — creator can delete', async () => {
    const ev = await createTestCalendarEvent({ creatorId: adminId })
    const res = await app.inject({
      method: 'DELETE',
      url: `/calendar/events/${ev.id}`,
      cookies: { access_token: adminToken },
    })
    expect(res.statusCode).toBe(204)
  })

  it('DELETE /calendar/events/:id 403 for non-creator', async () => {
    const ev = await createTestCalendarEvent({ creatorId: adminId })
    const res = await app.inject({
      method: 'DELETE',
      url: `/calendar/events/${ev.id}`,
      cookies: { access_token: userToken },
    })
    expect(res.statusCode).toBe(403)
    await cleanupTestCalendarEvent(ev.id)
  })
})
```

- [ ] **Step 4: Run tests — verify they fail because calendarEvents.ts doesn't exist**

```bash
pnpm --filter @tv-shifts/api exec vitest run src/routes/calendarEvents.test.ts
```

Expected: `Error: Cannot find module '../routes/calendarEvents'`

- [ ] **Step 5: Create `apps/api/src/routes/calendarEvents.ts`**

```typescript
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tv-shifts/db'
import { authenticate } from '../plugins/auth'

const eventInclude = {
  creator:      { select: { id: true, fullName: true } },
  participants: { include: { user: { select: { id: true, fullName: true } } } },
} as const

export async function calendarEventsRoutes(app: FastifyInstance) {

  // GET /calendar/events?deptId=&from=&to=
  // Returns: dept events + global events + events where a dept member is a participant
  app.get('/', { preHandler: authenticate }, async (request, reply) => {
    const q = z.object({
      deptId: z.string().optional(),
      from:   z.string().optional(),
      to:     z.string().optional(),
    }).safeParse(request.query)
    if (!q.success) return reply.code(400).send({ error: 'Invalid query' })

    const { deptId, from, to } = q.data
    const fromDate = from ? new Date(from) : undefined
    const toDate   = to   ? new Date(to)   : undefined

    let memberUserIds: string[] = []
    if (deptId) {
      const members = await prisma.deptMember.findMany({
        where: { deptId },
        select: { userId: true },
      })
      memberUserIds = members.map((m) => m.userId)
    }

    return prisma.calendarEvent.findMany({
      where: {
        ...(fromDate || toDate ? {
          date: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate   ? { lte: toDate   } : {}),
          },
        } : {}),
        OR: [
          ...(deptId ? [{ deptId }] : []),
          { isGlobal: true },
          ...(memberUserIds.length > 0
            ? [{ participants: { some: { userId: { in: memberUserIds } } } }]
            : []),
        ],
      },
      include:  eventInclude,
      orderBy:  { date: 'asc' },
    })
  })

  // POST /calendar/events
  // isGlobal requires admin/departments:manage permission
  app.post('/', { preHandler: authenticate }, async (request, reply) => {
    const body = z.object({
      title:          z.string().min(1),
      date:           z.string(),
      timeFrom:       z.string().optional(),
      timeTo:         z.string().optional(),
      deptId:         z.string().optional(),
      isGlobal:       z.boolean().optional(),
      participantIds: z.array(z.string()).optional(),
    }).safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })

    const user = request.user as any
    const { participantIds, ...rest } = body.data

    if (rest.isGlobal && !user.roles?.includes('admin') && !user.permissions?.includes('departments:manage')) {
      return reply.code(403).send({ error: 'Only admins can create global events' })
    }

    const event = await prisma.calendarEvent.create({
      data: {
        title:    rest.title,
        date:     new Date(rest.date),
        timeFrom: rest.timeFrom,
        timeTo:   rest.timeTo,
        deptId:   rest.deptId,
        isGlobal: rest.isGlobal ?? false,
        creatorId: user.id,
        ...(participantIds?.length ? {
          participants: {
            createMany: {
              data: participantIds.map((userId) => ({ userId })),
              skipDuplicates: true,
            },
          },
        } : {}),
      },
      include: eventInclude,
    })

    return reply.code(201).send(event)
  })

  // PATCH /calendar/events/:id — creator or admin only
  app.patch('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      title:    z.string().min(1).optional(),
      date:     z.string().optional(),
      timeFrom: z.string().nullable().optional(),
      timeTo:   z.string().nullable().optional(),
      deptId:   z.string().nullable().optional(),
      isGlobal: z.boolean().optional(),
    }).safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input' })

    const user = request.user as any
    const event = await prisma.calendarEvent.findUnique({ where: { id } })
    if (!event) return reply.code(404).send({ error: 'Event not found' })

    const isCreator = event.creatorId === user.id
    const isAdmin   = user.roles?.includes('admin') || user.permissions?.includes('departments:manage')
    if (!isCreator && !isAdmin) return reply.code(403).send({ error: 'Forbidden' })

    const data = body.data
    const updated = await prisma.calendarEvent.update({
      where: { id },
      data: {
        ...data,
        ...(data.date ? { date: new Date(data.date) } : {}),
      },
      include: eventInclude,
    })

    return reply.code(200).send(updated)
  })

  // DELETE /calendar/events/:id — creator or admin only
  app.delete('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const user = request.user as any
    const event = await prisma.calendarEvent.findUnique({ where: { id } })
    if (!event) return reply.code(404).send({ error: 'Event not found' })

    const isCreator = event.creatorId === user.id
    const isAdmin   = user.roles?.includes('admin') || user.permissions?.includes('departments:manage')
    if (!isCreator && !isAdmin) return reply.code(403).send({ error: 'Forbidden' })

    await prisma.calendarEvent.delete({ where: { id } })
    return reply.code(204).send()
  })
}
```

- [ ] **Step 6: Run tests — verify all pass**

```bash
pnpm --filter @tv-shifts/api exec vitest run src/routes/calendarEvents.test.ts
```

Expected: 8 tests pass, 0 fail.

- [ ] **Step 7: Register `calendarEventsRoutes` in `apps/api/src/server.ts`**

Add the import near the other route imports:
```typescript
import { calendarEventsRoutes } from './routes/calendarEvents'
```

Add the registration after `deptWiLinksRoutes`:
```typescript
  await app.register(calendarEventsRoutes, { prefix: '/calendar/events' })
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/routes/calendarEvents.ts \
        apps/api/src/routes/calendarEvents.test.ts \
        apps/api/src/test/helpers.ts \
        apps/api/src/test/factories.ts \
        apps/api/src/server.ts
git commit -m "feat: add CalendarEvent CRUD API with tests"
```

---

### Task 2: Dept Gantt Endpoint + Register Phase 1-2 Routes in buildApp (TDD)

**Files:**
- Modify: `apps/api/src/routes/departments.ts` — add `GET /:id/gantt`
- Modify: `apps/api/src/test/helpers.ts` — add Phase 1-2 routes to buildApp
- Create: `apps/api/src/routes/deptGantt.test.ts`

- [ ] **Step 1: Register Phase 1-2 routes in `apps/api/src/test/helpers.ts`**

Add these imports at the top of the import block:
```typescript
import { projectsRoutes }     from '../routes/projects'
import { workItemsRoutes }    from '../routes/workItems'
import { departmentsRoutes }  from '../routes/departments'
import { deptWiLinksRoutes }  from '../routes/deptWiLinks'
```

Add these registrations inside `buildApp()` after the `calendarEventsRoutes` line:
```typescript
  await app.register(projectsRoutes,    { prefix: '/projects' })
  await app.register(workItemsRoutes,   { prefix: '/work-items' })
  await app.register(departmentsRoutes, { prefix: '/departments' })
  await app.register(deptWiLinksRoutes, { prefix: '/dept-wi-links' })
```

- [ ] **Step 2: Write failing test in `apps/api/src/routes/deptGantt.test.ts`**

```typescript
/**
 * Integration tests for GET /departments/:id/gantt
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@tv-shifts/db'
import { buildApp, getAccessToken } from '../test/helpers'
import {
  createTestUser, cleanupTestUser,
  createTestDept, cleanupTestDept,
  createTestTask, cleanupTestTask,
} from '../test/factories'
import type { FastifyInstance } from 'fastify'

describe('GET /departments/:id/gantt', () => {
  let app: FastifyInstance
  let adminId: string
  let userId: string
  let deptId: string
  let adminToken: string
  const taskIds: string[] = []

  beforeAll(async () => {
    app = await buildApp()
    const admin = await createTestUser({ role: 'admin' })
    const user  = await createTestUser()
    const dept  = await createTestDept()
    adminId = admin.id
    userId  = user.id
    deptId  = dept.id
    adminToken = await getAccessToken(app, admin.email, 'testpassword123')
    // Make user a dept member
    await prisma.deptMember.create({ data: { userId, deptId, isHead: false } })
  })

  afterAll(async () => {
    for (const id of taskIds) await cleanupTestTask(id).catch(() => {})
    await cleanupTestDept(deptId)
    await cleanupTestUser(adminId)
    await cleanupTestUser(userId)
    await app.close()
    await prisma.$disconnect()
  })

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: `/departments/${deptId}/gantt` })
    expect(res.statusCode).toBe(401)
  })

  it('returns 404 for unknown dept', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/departments/nonexistent-id/gantt',
      cookies: { access_token: adminToken },
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns members and tasks assigned to dept members', async () => {
    const task = await createTestTask({ title: 'Gantt task', createdBy: adminId })
    taskIds.push(task.id)
    // Assign task to dept member
    await prisma.taskAssignment.create({ data: { taskId: task.id, userId } })

    const res = await app.inject({
      method: 'GET',
      url: `/departments/${deptId}/gantt`,
      cookies: { access_token: adminToken },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Array.isArray(body.members)).toBe(true)
    expect(Array.isArray(body.tasks)).toBe(true)
    expect(body.members.some((m: any) => m.id === userId)).toBe(true)
    expect(body.tasks.some((t: any) => t.id === task.id)).toBe(true)
  })

  it('filters by userId query param', async () => {
    const task = await createTestTask({ title: 'My task', createdBy: adminId })
    taskIds.push(task.id)
    await prisma.taskAssignment.create({ data: { taskId: task.id, userId } })

    const res = await app.inject({
      method: 'GET',
      url: `/departments/${deptId}/gantt?userId=${userId}`,
      cookies: { access_token: adminToken },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    // All returned tasks should have userId in their assignments
    expect(body.tasks.every((t: any) =>
      t.assignments.some((a: any) => a.userId === userId)
    )).toBe(true)
  })
})
```

- [ ] **Step 3: Run test — verify it fails**

```bash
pnpm --filter @tv-shifts/api exec vitest run src/routes/deptGantt.test.ts
```

Expected: FAIL — `GET /departments/:id/gantt` not found (404 or wrong behavior).

- [ ] **Step 4: Add `GET /:id/gantt` to `apps/api/src/routes/departments.ts`**

Add this endpoint after the `/:id/board` handler (around line 82, before the `POST /` handler):

```typescript
  // GET /departments/:id/gantt?from=&to=&userId=
  // Returns Tasks assigned to dept members within the date range.
  app.get('/:id/gantt', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const q = z.object({
      from:   z.string().optional(),
      to:     z.string().optional(),
      userId: z.string().optional(),
    }).safeParse(request.query)
    if (!q.success) return reply.code(400).send({ error: 'Invalid query' })

    const dept = await prisma.department.findUnique({ where: { id }, select: { id: true } })
    if (!dept) return reply.code(404).send({ error: 'Department not found' })

    const members = await prisma.deptMember.findMany({
      where: { deptId: id },
      include: { user: { select: { id: true, fullName: true } } },
    })
    const memberUserIds = members.map((m) => m.userId)

    const { from, to, userId } = q.data
    const fromDate = from ? new Date(from) : undefined
    const toDate   = to   ? new Date(to)   : undefined
    const targetIds = userId ? [userId] : memberUserIds

    const tasks = await prisma.task.findMany({
      where: {
        ...(targetIds.length > 0
          ? { assignments: { some: { userId: { in: targetIds } } } }
          : { id: 'no-match' }),
        ...(fromDate || toDate ? {
          AND: [
            ...(fromDate ? [{ OR: [{ deadline: { gte: fromDate } }, { deadline: null }] }] : []),
            ...(toDate   ? [{ createdAt: { lte: toDate } }] : []),
          ],
        } : {}),
      },
      include: {
        assignments: { include: { user: { select: { id: true, fullName: true } } } },
        creator:     { select: { id: true, fullName: true } },
      },
      orderBy: [{ deadline: 'asc' }, { createdAt: 'asc' }],
    })

    return { members: members.map((m) => m.user), tasks }
  })
```

Also ensure `z` is imported at the top of `departments.ts` (it already is).

- [ ] **Step 5: Run tests — verify all pass**

```bash
pnpm --filter @tv-shifts/api exec vitest run src/routes/deptGantt.test.ts
```

Expected: 4 tests pass, 0 fail.

- [ ] **Step 6: Run full test suite — verify no regressions**

```bash
pnpm --filter @tv-shifts/api test
```

Expected: all previously passing tests still pass (new route registrations in buildApp are additive).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/departments.ts \
        apps/api/src/routes/deptGantt.test.ts \
        apps/api/src/test/helpers.ts
git commit -m "feat: add dept gantt API + register Phase1-2 routes in buildApp"
```

---

### Task 3: DeptPage.tsx — Skeleton + Board Tab

Replace `DeptBoardPage` in the nav with a 3-tab `DeptPage`. The Board tab contains the same WI-substatus kanban logic from `DeptBoardPage`.

**Files:**
- Create: `apps/web/src/pages/DeptPage.tsx`
- Modify: `apps/web/src/components/AppShell.tsx`
- Delete: `apps/web/src/pages/DeptBoardPage.tsx`

- [ ] **Step 1: Create `apps/web/src/pages/DeptPage.tsx`**

```typescript
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useIsAdmin } from '../hooks/useAuth'

// ─── Types ────────────────────────────────────────────────────────────────────

type DeptType = 'production' | 'support' | 'internal'
type DeptSubstatus = 'not_started' | 'in_progress' | 'done'
type Tab = 'board' | 'calendar' | 'gantt'

type Department = {
  id: string
  name: string
  type: DeptType
  parentId: string | null
  parent: { id: string; name: string } | null
  _count: { members: number; wiLinks: number }
}

type WIRef = {
  id: string; name: string; client: string | null; format: string | null
  location: string | null; date: string | null; status: string; notes: string | null
  project: { id: string; name: string; status: string } | null
}

type BoardLink = {
  id: string; deptId: string; wiId: string; deadline: string | null
  substatus: DeptSubstatus; createdAt: string; workItem: WIRef
}

type Board = { not_started: BoardLink[]; in_progress: BoardLink[]; done: BoardLink[] }

// ─── Constants ────────────────────────────────────────────────────────────────

const SUBSTATUS_LABEL: Record<DeptSubstatus, string> = {
  not_started: 'Не начат', in_progress: 'В работе', done: 'Завершён',
}
const SUBSTATUS_COLOR: Record<DeptSubstatus, string> = {
  not_started: '#64748b', in_progress: '#2563eb', done: '#16a34a',
}
const SUBSTATUS_BG: Record<DeptSubstatus, string> = {
  not_started: '#f1f5f9', in_progress: '#eff6ff', done: '#f0fdf4',
}
const COLUMNS: DeptSubstatus[] = ['not_started', 'in_progress', 'done']
const NEXT: Record<DeptSubstatus, DeptSubstatus | null> = {
  not_started: 'in_progress', in_progress: 'done', done: null,
}
const PREV: Record<DeptSubstatus, DeptSubstatus | null> = {
  not_started: null, in_progress: 'not_started', done: 'in_progress',
}

// ─── Board sub-components ─────────────────────────────────────────────────────

function formatDate(d: string | null) {
  if (!d) return null
  return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function WICard({ link, deptId }: { link: BoardLink; deptId: string }) {
  const qc = useQueryClient()
  const move = useMutation({
    mutationFn: (substatus: DeptSubstatus) =>
      api.patch(`/dept-wi-links/${link.id}/substatus`, { substatus }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dept-board', deptId] }),
  })
  const next = NEXT[link.substatus]
  const prev = PREV[link.substatus]
  const overdue = link.deadline ? new Date(link.deadline) < new Date() : false

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px', marginBottom: 8 }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, color: '#1e293b' }}>{link.workItem.name}</div>
      {link.workItem.project && (
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{link.workItem.project.name}</div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
        {link.workItem.client && (
          <span style={{ fontSize: 11, padding: '2px 6px', background: '#f1f5f9', borderRadius: 4, color: '#475569' }}>
            {link.workItem.client}
          </span>
        )}
        {link.workItem.date && (
          <span style={{ fontSize: 11, padding: '2px 6px', background: '#fef3c7', borderRadius: 4, color: '#92400e' }}>
            Эфир: {formatDate(link.workItem.date)}
          </span>
        )}
      </div>
      {link.deadline && (
        <div style={{ fontSize: 12, marginBottom: 8, color: overdue ? '#dc2626' : '#475569', fontWeight: overdue ? 600 : 400 }}>
          Дедлайн: {formatDate(link.deadline)}{overdue ? ' ⚠ просрочен' : ''}
        </div>
      )}
      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
        {prev && (
          <button
            onClick={() => move.mutate(prev)}
            disabled={move.isPending}
            style={{ fontSize: 11, padding: '3px 8px', border: '1px solid #e2e8f0', borderRadius: 4, background: '#fff', cursor: 'pointer', color: '#64748b' }}
          >
            ← {SUBSTATUS_LABEL[prev]}
          </button>
        )}
        {next && (
          <button
            onClick={() => move.mutate(next)}
            disabled={move.isPending}
            style={{ fontSize: 11, padding: '3px 8px', border: 'none', borderRadius: 4, background: SUBSTATUS_COLOR[next], color: '#fff', cursor: 'pointer' }}
          >
            {SUBSTATUS_LABEL[next]} →
          </button>
        )}
      </div>
    </div>
  )
}

function BoardColumn({ title, links, color, bg, deptId }: {
  title: string; links: BoardLink[]; color: string; bg: string; deptId: string
}) {
  return (
    <div style={{ flex: 1, minWidth: 260, background: bg, borderRadius: 10, padding: '12px 12px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>{title}</span>
        <span style={{ marginLeft: 'auto', background: color, color: '#fff', borderRadius: 10, padding: '1px 8px', fontSize: 12, fontWeight: 600 }}>
          {links.length}
        </span>
      </div>
      {links.map((link) => <WICard key={link.id} link={link} deptId={deptId} />)}
      {links.length === 0 && (
        <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, paddingTop: 20 }}>Нет задач</div>
      )}
    </div>
  )
}

function DeptBoard({ deptId }: { deptId: string }) {
  const { data: board, isLoading } = useQuery<Board>({
    queryKey: ['dept-board', deptId],
    queryFn: () => api.get(`/departments/${deptId}/board`).then((r) => r.data),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })

  if (isLoading) return <div style={{ padding: 32, color: '#64748b' }}>Загрузка доски...</div>
  if (!board) return null

  return (
    <div style={{ padding: 24, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      {COLUMNS.map((col) => (
        <BoardColumn
          key={col}
          title={SUBSTATUS_LABEL[col]}
          links={board[col]}
          color={SUBSTATUS_COLOR[col]}
          bg={SUBSTATUS_BG[col]}
          deptId={deptId}
        />
      ))}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TAB_LABEL: Record<Tab, string> = {
  board:    'Доска проектов',
  calendar: 'Событийный',
  gantt:    'Гантт',
}

export function DeptPage() {
  const isAdmin = useIsAdmin()
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('board')

  const { data: departments = [], isLoading } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then((r) => r.data),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })

  const activeDept = departments.find((d) => d.id === selectedDeptId)

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{ width: 220, borderRight: '1px solid #e2e8f0', overflowY: 'auto', background: '#fff', flexShrink: 0 }}>
        <div style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Отделы
        </div>
        {isLoading && <div style={{ padding: '8px 16px', color: '#94a3b8', fontSize: 13 }}>Загрузка...</div>}
        {departments.map((dept) => (
          <button
            key={dept.id}
            onClick={() => setSelectedDeptId(dept.id)}
            style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '8px 16px',
              border: 'none', background: selectedDeptId === dept.id ? '#eff6ff' : 'transparent',
              color: selectedDeptId === dept.id ? '#2563eb' : '#374151',
              fontWeight: selectedDeptId === dept.id ? 600 : 400,
              cursor: 'pointer', fontSize: 14,
              borderLeft: selectedDeptId === dept.id ? '3px solid #2563eb' : '3px solid transparent',
            }}
          >
            {dept.parent ? <span style={{ color: '#94a3b8', fontSize: 12 }}>{dept.parent.name} / </span> : null}
            {dept.name}
          </button>
        ))}
        {isAdmin && (
          <div style={{ padding: '16px 16px 8px', borderTop: '1px solid #e2e8f0', marginTop: 8 }}>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('tvshifts:navigate', { detail: { page: 'admindept' } }))}
              style={{ fontSize: 12, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Управление отделами →
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!selectedDeptId ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8', fontSize: 15 }}>
            Выберите отдел в списке слева
          </div>
        ) : (
          <>
            {/* Tab bar */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#fff', padding: '0 24px', flexShrink: 0 }}>
              <div style={{ flex: 1, display: 'flex' }}>
                {(['board', 'calendar', 'gantt'] as Tab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    style={{
                      padding: '12px 20px', border: 'none', background: 'none', cursor: 'pointer',
                      fontWeight: tab === t ? 600 : 400,
                      color: tab === t ? '#2563eb' : '#64748b',
                      borderBottom: tab === t ? '2px solid #2563eb' : '2px solid transparent',
                      fontSize: 14,
                    }}
                  >
                    {TAB_LABEL[t]}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#64748b' }}>
                <strong style={{ color: '#1e293b' }}>{activeDept?.name}</strong>
                {activeDept?.parent && <span>· {activeDept.parent.name}</span>}
              </div>
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              {tab === 'board'    && <DeptBoard    deptId={selectedDeptId} />}
              {tab === 'calendar' && (
                <div style={{ padding: 32, color: '#94a3b8' }}>
                  EventCalendar — Task 4
                </div>
              )}
              {tab === 'gantt' && (
                <div style={{ padding: 32, color: '#94a3b8' }}>
                  DeptGantt — Task 5
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update `apps/web/src/components/AppShell.tsx`**

Replace the `DeptBoardPage` import with `DeptPage`:
```typescript
// Remove:
import { DeptBoardPage } from '../pages/DeptBoardPage'
// Add:
import { DeptPage } from '../pages/DeptPage'
```

In the `navItems` array, rename the syncdata label from `'Проекты'` to `'Данные'`:
```typescript
{ id: 'syncdata', label: 'Данные', adminOnly: true },
```

In the JSX section that renders pages, find `{page === 'deptboard' && <DeptBoardPage />}` and replace with:
```typescript
{page === 'deptboard' && <DeptPage />}
```

- [ ] **Step 3: Delete `apps/web/src/pages/DeptBoardPage.tsx`**

```bash
Remove-Item "apps/web/src/pages/DeptBoardPage.tsx"
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm --filter @tv-shifts/web exec tsc --noEmit
```

Expected: no errors related to DeptBoardPage or DeptPage.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/DeptPage.tsx \
        apps/web/src/components/AppShell.tsx
git rm apps/web/src/pages/DeptBoardPage.tsx
git commit -m "feat: replace DeptBoardPage with 3-tab DeptPage (board tab implemented)"
```

---

### Task 4: EventCalendar Tab

**Files:**
- Create: `apps/web/src/pages/EventCalendar.tsx`
- Modify: `apps/web/src/pages/DeptPage.tsx` — replace calendar placeholder

- [ ] **Step 1: Create `apps/web/src/pages/EventCalendar.tsx`**

```typescript
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay } from 'date-fns'
import { ru } from 'date-fns/locale'
import { api } from '../lib/api'
import { useCurrentUser } from '../hooks/useAuth'

type CalendarEvent = {
  id: string
  title: string
  date: string
  timeFrom: string | null
  timeTo: string | null
  deptId: string | null
  isGlobal: boolean
  creatorId: string
  creator: { id: string; fullName: string }
  participants: { userId: string; user: { id: string; fullName: string } }[]
}

interface CreateForm {
  title: string
  date: string
  timeFrom: string
  timeTo: string
  isGlobal: boolean
  participantIds: string[]
}

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

// Monday-first day index (0=Mon … 6=Sun)
function mondayIndex(date: Date) {
  const d = getDay(date) // 0=Sun
  return d === 0 ? 6 : d - 1
}

export function EventCalendar({ deptId }: { deptId: string }) {
  const user = useCurrentUser()
  const qc = useQueryClient()
  const [month, setMonth] = useState(() => new Date())
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<CreateForm>({
    title: '', date: '', timeFrom: '', timeTo: '', isGlobal: false, participantIds: [],
  })

  const from = format(startOfMonth(month), 'yyyy-MM-dd')
  const to   = format(endOfMonth(month),   'yyyy-MM-dd')

  const { data: events = [] } = useQuery<CalendarEvent[]>({
    queryKey: ['calendar-events', deptId, from, to],
    queryFn: () => api.get(`/calendar/events?deptId=${deptId}&from=${from}&to=${to}`).then((r) => r.data),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })

  const { data: members = [] } = useQuery<{ id: string; user: { id: string; fullName: string } }[]>({
    queryKey: ['dept-members', deptId],
    queryFn: () => api.get(`/departments/${deptId}/members`).then((r) => r.data),
  })

  const createEvent = useMutation({
    mutationFn: (data: Partial<CreateForm> & { date: string; title: string }) =>
      api.post('/calendar/events', { ...data, deptId }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar-events', deptId] })
      setShowCreate(false)
      setForm({ title: '', date: '', timeFrom: '', timeTo: '', isGlobal: false, participantIds: [] })
    },
  })

  const deleteEvent = useMutation({
    mutationFn: (id: string) => api.delete(`/calendar/events/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar-events', deptId] }),
  })

  const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) })
  const firstOffset = mondayIndex(days[0])

  // Events grouped by day
  const eventsByDay = new Map<string, CalendarEvent[]>()
  for (const ev of events) {
    const key = ev.date.slice(0, 10)
    if (!eventsByDay.has(key)) eventsByDay.set(key, [])
    eventsByDay.get(key)!.push(ev)
  }

  const selectedEvents = selectedDay
    ? (eventsByDay.get(format(selectedDay, 'yyyy-MM-dd')) ?? [])
    : []

  function prevMonth() { setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1)) }
  function nextMonth() { setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1)) }

  function openCreate(day: Date) {
    setForm((f) => ({ ...f, date: format(day, 'yyyy-MM-dd') }))
    setShowCreate(true)
  }

  return (
    <div style={{ padding: 24, display: 'flex', gap: 24, height: '100%', boxSizing: 'border-box' }}>
      {/* Month grid */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <button onClick={prevMonth} style={{ border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', width: 32, height: 32, cursor: 'pointer', fontSize: 16 }}>‹</button>
          <span style={{ fontWeight: 700, fontSize: 18, color: '#1e293b', minWidth: 180, textAlign: 'center' }}>
            {format(month, 'LLLL yyyy', { locale: ru })}
          </span>
          <button onClick={nextMonth} style={{ border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', width: 32, height: 32, cursor: 'pointer', fontSize: 16 }}>›</button>
          <button
            onClick={() => { setSelectedDay(null); setShowCreate(true); setForm((f) => ({ ...f, date: format(new Date(), 'yyyy-MM-dd') })) }}
            style={{ marginLeft: 'auto', padding: '6px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            + Событие
          </button>
        </div>

        {/* Weekday labels */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
          {WEEKDAYS.map((d) => (
            <div key={d} style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#94a3b8', padding: '4px 0' }}>{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
          {/* Offset cells */}
          {Array.from({ length: firstOffset }).map((_, i) => (
            <div key={`off-${i}`} />
          ))}
          {days.map((day) => {
            const key  = format(day, 'yyyy-MM-dd')
            const evs  = eventsByDay.get(key) ?? []
            const isSelected = selectedDay ? isSameDay(day, selectedDay) : false
            const isToday = isSameDay(day, new Date())

            return (
              <div
                key={key}
                onClick={() => setSelectedDay(isSelected ? null : day)}
                style={{
                  minHeight: 72, border: `1px solid ${isSelected ? '#2563eb' : '#e2e8f0'}`,
                  borderRadius: 6, padding: '4px 6px', cursor: 'pointer',
                  background: isSelected ? '#eff6ff' : '#fff',
                  boxShadow: isSelected ? '0 0 0 2px #bfdbfe' : 'none',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: isToday ? 700 : 400, color: isToday ? '#2563eb' : '#374151', marginBottom: 4 }}>
                  {day.getDate()}
                </div>
                {evs.slice(0, 3).map((ev) => (
                  <div key={ev.id} style={{
                    fontSize: 11, background: ev.isGlobal ? '#fef9c3' : '#dbeafe',
                    color: ev.isGlobal ? '#854d0e' : '#1e40af',
                    borderRadius: 3, padding: '1px 4px', marginBottom: 2,
                    overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                  }}>
                    {ev.title}
                  </div>
                ))}
                {evs.length > 3 && (
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>+{evs.length - 3}</div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Side panel — selected day events or create form */}
      <div style={{ width: 280, flexShrink: 0 }}>
        {showCreate ? (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, color: '#1e293b' }}>Новое событие</div>
            <input
              placeholder="Название"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14, marginBottom: 10, boxSizing: 'border-box' }}
            />
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14, marginBottom: 10, boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input type="time" value={form.timeFrom} onChange={(e) => setForm((f) => ({ ...f, timeFrom: e.target.value }))}
                placeholder="С" style={{ flex: 1, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14 }} />
              <input type="time" value={form.timeTo} onChange={(e) => setForm((f) => ({ ...f, timeTo: e.target.value }))}
                placeholder="До" style={{ flex: 1, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14 }} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Участники</div>
              <div style={{ maxHeight: 120, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6, padding: 6 }}>
                {members.map((m) => (
                  <label key={m.user.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0', cursor: 'pointer', fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={form.participantIds.includes(m.user.id)}
                      onChange={(e) => setForm((f) => ({
                        ...f,
                        participantIds: e.target.checked
                          ? [...f.participantIds, m.user.id]
                          : f.participantIds.filter((id) => id !== m.user.id),
                      }))}
                    />
                    {m.user.fullName}
                  </label>
                ))}
                {members.length === 0 && <div style={{ color: '#94a3b8', fontSize: 12 }}>Нет участников</div>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => createEvent.mutate({ title: form.title, date: form.date, timeFrom: form.timeFrom || undefined, timeTo: form.timeTo || undefined, isGlobal: form.isGlobal, participantIds: form.participantIds })}
                disabled={!form.title || !form.date || createEvent.isPending}
                style={{ flex: 1, padding: '8px 0', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
              >
                Создать
              </button>
              <button
                onClick={() => setShowCreate(false)}
                style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 13 }}
              >
                Отмена
              </button>
            </div>
          </div>
        ) : selectedDay ? (
          <div>
            <div style={{ fontWeight: 600, fontSize: 15, color: '#1e293b', marginBottom: 12 }}>
              {format(selectedDay, 'd MMMM', { locale: ru })}
            </div>
            {selectedEvents.length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: 13 }}>Нет событий</div>
            ) : (
              selectedEvents.map((ev) => (
                <div key={ev.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px', marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b', marginBottom: 4 }}>{ev.title}</div>
                  {(ev.timeFrom || ev.timeTo) && (
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                      {ev.timeFrom}{ev.timeTo ? ` — ${ev.timeTo}` : ''}
                    </div>
                  )}
                  {ev.isGlobal && (
                    <span style={{ fontSize: 11, background: '#fef9c3', color: '#854d0e', borderRadius: 4, padding: '2px 6px', marginBottom: 6, display: 'inline-block' }}>
                      Глобальное
                    </span>
                  )}
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
                    {ev.creator.fullName}
                  </div>
                  {ev.participants.length > 0 && (
                    <div style={{ fontSize: 12, color: '#475569' }}>
                      {ev.participants.map((p) => p.user.fullName).join(', ')}
                    </div>
                  )}
                  {ev.creatorId === user?.id && (
                    <button
                      onClick={() => deleteEvent.mutate(ev.id)}
                      disabled={deleteEvent.isPending}
                      style={{ marginTop: 8, fontSize: 11, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      Удалить
                    </button>
                  )}
                </div>
              ))
            )}
            <button
              onClick={() => openCreate(selectedDay)}
              style={{ marginTop: 8, width: '100%', padding: '8px 0', border: '1px dashed #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#64748b', fontSize: 13 }}
            >
              + Добавить событие
            </button>
          </div>
        ) : (
          <div style={{ color: '#94a3b8', fontSize: 13, paddingTop: 8 }}>
            Выберите день для просмотра событий
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Replace calendar placeholder in `apps/web/src/pages/DeptPage.tsx`**

Replace the import section at the top with:
```typescript
import { EventCalendar } from './EventCalendar'
```

Replace the placeholder block:
```typescript
// Remove:
              {tab === 'calendar' && (
                <div style={{ padding: 32, color: '#94a3b8' }}>
                  EventCalendar — Task 4
                </div>
              )}
// Add:
              {tab === 'calendar' && <EventCalendar deptId={selectedDeptId} />}
```

- [ ] **Step 3: Check TypeScript**

```bash
pnpm --filter @tv-shifts/web exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/EventCalendar.tsx apps/web/src/pages/DeptPage.tsx
git commit -m "feat: implement EventCalendar tab in DeptPage"
```

---

### Task 5: DeptGantt Tab

**Files:**
- Create: `apps/web/src/pages/DeptGantt.tsx`
- Modify: `apps/web/src/pages/DeptPage.tsx` — replace gantt placeholder

- [ ] **Step 1: Create `apps/web/src/pages/DeptGantt.tsx`**

```typescript
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns'
import { ru } from 'date-fns/locale'
import { api } from '../lib/api'

type TaskStatus = 'open' | 'in_progress' | 'done'

type GanttTask = {
  id: string
  title: string
  status: TaskStatus
  deadline: string | null
  isOverdue: boolean
  createdAt: string
  creator: { id: string; fullName: string }
  assignments: { userId: string; user: { id: string; fullName: string } }[]
}

type GanttData = {
  members: { id: string; fullName: string }[]
  tasks: GanttTask[]
}

const STATUS_COLOR: Record<TaskStatus, string> = {
  open:        '#3b82f6',
  in_progress: '#f59e0b',
  done:        '#16a34a',
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  open:        'Открыта',
  in_progress: 'В работе',
  done:        'Готово',
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}

export function DeptGantt({ deptId }: { deptId: string }) {
  const [from, setFrom] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [to,   setTo  ] = useState(() => format(endOfMonth(new Date()),   'yyyy-MM-dd'))
  const [filterUserId, setFilterUserId] = useState<string>('')

  const url = `/departments/${deptId}/gantt?from=${from}&to=${to}${filterUserId ? `&userId=${filterUserId}` : ''}`

  const { data, isLoading } = useQuery<GanttData>({
    queryKey: ['dept-gantt', deptId, from, to, filterUserId],
    queryFn: () => api.get(url).then((r) => r.data),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })

  const fromDate = new Date(from)
  const toDate   = new Date(to)
  const rangeMs  = toDate.getTime() - fromDate.getTime() || 1

  const days = eachDayOfInterval({ start: fromDate, end: toDate })

  function barStyle(task: GanttTask) {
    const start  = new Date(task.createdAt)
    const end    = task.deadline ? new Date(task.deadline) : toDate
    const left   = Math.max(0, (start.getTime() - fromDate.getTime()) / rangeMs) * 100
    const right  = Math.min(rangeMs, end.getTime() - fromDate.getTime()) / rangeMs * 100
    const width  = Math.max(1, right - left)
    const color  = task.isOverdue ? '#dc2626' : STATUS_COLOR[task.status]
    return { left: `${left}%`, width: `${width}%`, background: color }
  }

  return (
    <div style={{ padding: 24, height: '100%', boxSizing: 'border-box', overflow: 'auto' }}>
      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: '#64748b' }}>С:</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} />
          <span style={{ fontSize: 13, color: '#64748b' }}>По:</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} />
        </div>
        <select
          value={filterUserId}
          onChange={(e) => setFilterUserId(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: '#fff' }}
        >
          <option value="">Все сотрудники</option>
          {data?.members.map((m) => (
            <option key={m.id} value={m.id}>{m.fullName}</option>
          ))}
        </select>
        <div style={{ fontSize: 13, color: '#94a3b8', marginLeft: 'auto' }}>
          {data?.tasks.length ?? 0} задач
        </div>
      </div>

      {isLoading && <div style={{ color: '#64748b', fontSize: 14 }}>Загрузка...</div>}

      {data && data.tasks.length === 0 && (
        <div style={{ color: '#94a3b8', fontSize: 14, textAlign: 'center', paddingTop: 40 }}>
          Нет задач в выбранном периоде
        </div>
      )}

      {data && data.tasks.length > 0 && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
          {/* Column headers */}
          <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
            <div style={{ width: 320, flexShrink: 0, padding: '8px 16px', fontWeight: 600, fontSize: 12, color: '#64748b', borderRight: '1px solid #e2e8f0' }}>
              Задача
            </div>
            <div style={{ flex: 1, position: 'relative', padding: '4px 0', display: 'flex' }}>
              {/* Show month markers evenly */}
              {days.filter((_, i) => i % 7 === 0 || i === 0).map((day) => {
                const pct = (day.getTime() - fromDate.getTime()) / rangeMs * 100
                return (
                  <div key={day.toISOString()} style={{ position: 'absolute', left: `${pct}%`, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', paddingLeft: 4 }}>
                    <span style={{ fontSize: 10, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                      {format(day, 'd MMM', { locale: ru })}
                    </span>
                    <span style={{ width: 1, flex: 1, background: '#e2e8f0' }} />
                  </div>
                )
              })}
            </div>
          </div>

          {/* Task rows */}
          {data.tasks.map((task, idx) => (
            <div
              key={task.id}
              style={{
                display: 'flex', alignItems: 'center',
                borderBottom: idx < data.tasks.length - 1 ? '1px solid #f1f5f9' : 'none',
                minHeight: 48,
              }}
            >
              {/* Info column */}
              <div style={{ width: 320, flexShrink: 0, padding: '8px 16px', borderRight: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: task.isOverdue ? '#dc2626' : STATUS_COLOR[task.status],
                  }} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {task.title}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, paddingLeft: 16 }}>
                  {task.assignments.slice(0, 3).map((a) => (
                    <div key={a.userId} title={a.user.fullName} style={{
                      width: 22, height: 22, borderRadius: '50%', background: '#e0e7ff',
                      color: '#4338ca', fontSize: 9, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      {initials(a.user.fullName)}
                    </div>
                  ))}
                  {task.deadline && (
                    <span style={{ fontSize: 11, color: task.isOverdue ? '#dc2626' : '#94a3b8', marginLeft: 4 }}>
                      до {new Date(task.deadline).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}
                    </span>
                  )}
                </div>
              </div>

              {/* Timeline column */}
              <div style={{ flex: 1, position: 'relative', height: 48, overflow: 'hidden' }}>
                {/* Zebra background for weekends */}
                <div
                  style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(90deg, transparent 0, transparent calc(100% / 7 * 5), #f8fafc calc(100% / 7 * 5), #f8fafc calc(100% / 7))' }}
                />
                {/* Task bar */}
                <div style={{
                  position: 'absolute',
                  top: 14, height: 20, borderRadius: 4,
                  ...barStyle(task),
                  opacity: task.status === 'done' ? 0.6 : 1,
                  minWidth: 4,
                }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
        {(Object.entries(STATUS_LABEL) as [TaskStatus, string][]).map(([s, label]) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b' }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: STATUS_COLOR[s] }} />
            {label}
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b' }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: '#dc2626' }} />
          Просрочена
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Replace gantt placeholder in `apps/web/src/pages/DeptPage.tsx`**

Add import at the top:
```typescript
import { DeptGantt } from './DeptGantt'
```

Replace the placeholder block:
```typescript
// Remove:
              {tab === 'gantt' && (
                <div style={{ padding: 32, color: '#94a3b8' }}>
                  DeptGantt — Task 5
                </div>
              )}
// Add:
              {tab === 'gantt' && <DeptGantt deptId={selectedDeptId} />}
```

- [ ] **Step 3: Check TypeScript**

```bash
pnpm --filter @tv-shifts/web exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/DeptGantt.tsx apps/web/src/pages/DeptPage.tsx
git commit -m "feat: implement DeptGantt tab in DeptPage"
```

---

### Task 6: ProjectsPage + AppShell Nav Update + Docs

**Files:**
- Create: `apps/web/src/pages/ProjectsPage.tsx`
- Modify: `apps/web/src/components/AppShell.tsx`
- Modify: `docs/dev-plan-v2.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Create `apps/web/src/pages/ProjectsPage.tsx`**

```typescript
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useCurrentUser } from '../hooks/useAuth'

type ProjectStatus = 'draft' | 'active' | 'done' | 'cancelled' | 'rejected'

type Project = {
  id: string
  name: string
  status: ProjectStatus
  client: string | null
  createdAt: string
  accountManager: { id: string; fullName: string } | null
}

const STATUS_LABEL: Record<ProjectStatus, string> = {
  draft:     'Заявка',
  active:    'Реализация',
  done:      'Сдан',
  cancelled: 'Отменён',
  rejected:  'Не согласован',
}

const STATUS_COLOR: Record<ProjectStatus, string> = {
  draft:     '#64748b',
  active:    '#2563eb',
  done:      '#16a34a',
  cancelled: '#94a3b8',
  rejected:  '#dc2626',
}

const STATUS_BG: Record<ProjectStatus, string> = {
  draft:     '#f1f5f9',
  active:    '#eff6ff',
  done:      '#f0fdf4',
  cancelled: '#f8fafc',
  rejected:  '#fef2f2',
}

// Main columns (left 3), archive (right 2)
const MAIN_STATUSES: ProjectStatus[] = ['draft', 'active', 'done']
const ARCHIVE_STATUSES: ProjectStatus[] = ['cancelled', 'rejected']

const TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  draft:     ['active', 'rejected', 'cancelled'],
  active:    ['done', 'cancelled'],
  done:      ['active'],
  cancelled: ['draft'],
  rejected:  ['draft'],
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: '2-digit' })
}

function ProjectCard({ project, canWrite }: { project: Project; canWrite: boolean }) {
  const qc = useQueryClient()
  const move = useMutation({
    mutationFn: (status: ProjectStatus) =>
      api.patch(`/projects/${project.id}`, { status }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['all-projects'] }),
  })

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px', marginBottom: 8 }}>
      <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b', marginBottom: 4 }}>{project.name}</div>
      {project.client && (
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>{project.client}</div>
      )}
      {project.accountManager && (
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>
          Менеджер: {project.accountManager.fullName}
        </div>
      )}
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>
        {formatDate(project.createdAt)}
      </div>
      {canWrite && TRANSITIONS[project.status].length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {TRANSITIONS[project.status].map((next) => (
            <button
              key={next}
              onClick={() => move.mutate(next)}
              disabled={move.isPending}
              style={{
                fontSize: 11, padding: '3px 8px', border: 'none', borderRadius: 4,
                background: STATUS_COLOR[next], color: '#fff', cursor: 'pointer',
              }}
            >
              → {STATUS_LABEL[next]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ProjectColumn({ status, projects, canWrite }: {
  status: ProjectStatus; projects: Project[]; canWrite: boolean
}) {
  return (
    <div style={{ flex: 1, minWidth: 220, background: STATUS_BG[status], borderRadius: 10, padding: '12px 12px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: STATUS_COLOR[status], flexShrink: 0 }} />
        <span style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>{STATUS_LABEL[status]}</span>
        <span style={{ marginLeft: 'auto', background: STATUS_COLOR[status], color: '#fff', borderRadius: 10, padding: '1px 8px', fontSize: 12, fontWeight: 600 }}>
          {projects.length}
        </span>
      </div>
      {projects.map((p) => <ProjectCard key={p.id} project={p} canWrite={canWrite} />)}
      {projects.length === 0 && (
        <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, paddingTop: 20 }}>Нет проектов</div>
      )}
    </div>
  )
}

export function ProjectsPage() {
  const user = useCurrentUser()
  const [showArchive, setShowArchive] = useState(false)
  const canWrite = user?.permissions?.includes('projects:write') ?? false

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ['all-projects'],
    queryFn: () => api.get('/projects').then((r) => r.data),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })

  const byStatus = (status: ProjectStatus) => projects.filter((p) => p.status === status)

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1e293b' }}>Доска проектов</h1>
        <div style={{ fontSize: 13, color: '#64748b' }}>Всего: {projects.length}</div>
        <button
          onClick={() => setShowArchive((v) => !v)}
          style={{ marginLeft: 'auto', padding: '6px 14px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 13, color: '#64748b' }}
        >
          {showArchive ? 'Скрыть архив' : 'Показать архив'}
        </button>
      </div>

      {isLoading && <div style={{ color: '#64748b' }}>Загрузка...</div>}

      {!isLoading && (
        <>
          {/* Main columns */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: showArchive ? 24 : 0 }}>
            {MAIN_STATUSES.map((s) => (
              <ProjectColumn key={s} status={s} projects={byStatus(s)} canWrite={canWrite} />
            ))}
          </div>

          {/* Archive */}
          {showArchive && (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                Архив
              </div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                {ARCHIVE_STATUSES.map((s) => (
                  <ProjectColumn key={s} status={s} projects={byStatus(s)} canWrite={canWrite} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update `apps/web/src/components/AppShell.tsx`**

Add import:
```typescript
import { ProjectsPage } from '../pages/ProjectsPage'
```

Update the `Page` type — add `'projects'`:
```typescript
type Page = 'calendar' | 'analytics' | 'users' | 'tasks' | 'profile' | 'syncdata' | 'deals' | 'database' | 'workflow' | 'deptboard' | 'admindept' | 'projects'
```

Update `valid` array in the `useState` initializer — add `'projects'`:
```typescript
const valid: Page[] = ['calendar', 'analytics', 'users', 'tasks', 'profile', 'syncdata', 'deals', 'database', 'workflow', 'deptboard', 'admindept', 'projects']
```

Add to `navItems` array (after `workflow`, before `deptboard`):
```typescript
{ id: 'projects', label: 'Проекты', adminOrProducer: true },
```

Add JSX render case (in the block that renders pages by `page` value):
```typescript
{page === 'projects' && <ProjectsPage />}
```

- [ ] **Step 3: Check TypeScript**

```bash
pnpm --filter @tv-shifts/web exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Update `docs/dev-plan-v2.md` — mark Phase 4 complete**

Find the Phase 4 section and change all `[ ]` to `[x]`.

- [ ] **Step 5: Update `CLAUDE.md` — update status table and page list**

In the phase table, change:
```
| Фаза 4: Три вида отдела (Календарь, Гантт, Доска) | ⬜ следующая |
```
to:
```
| Фаза 4: Три вида отдела (Календарь, Гантт, Доска) | ✅ DONE | <commit-sha> |
```

In the API routes table, add:
```
| `/calendar/events` | `routes/calendarEvents.ts` | **Фаза 4** — CalendarEvent CRUD |
```

In the page status table, add/update:
```
| Dept Page | `DeptPage.tsx` | ✅ Фаза 4 — 3 вкладки: Доска/Событийный/Гантт |
| Projects Board | `ProjectsPage.tsx` | ✅ Фаза 4 — глобальный канбан проектов |
```

In the nav pages list, add `projects` to the type union comment.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/ProjectsPage.tsx \
        apps/web/src/components/AppShell.tsx \
        docs/dev-plan-v2.md \
        CLAUDE.md
git commit -m "feat: add ProjectsPage (AllProjectsBoard) + Phase 4 docs"
```
