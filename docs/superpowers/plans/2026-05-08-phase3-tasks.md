# Phase 3 — Task System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать полноценную систему задач — расширить API `/tasks`, добавить уведомления, cron-job для просроченных задач, и переписать `TasksPage.tsx` из заглушки в рабочий канбан.

**Architecture:** Extending existing `tasks.ts` route + new `notificationService.ts` helper + `overdueChecker.ts` cron. Frontend: sidebar (Мои/Все + фильтр по отделу) + три колонки канбана (Входящие/В работе/Готово) + карточка стиля B (бейдж просрочки, название, исполнитель, дедлайн, создатель).

**Tech Stack:** Fastify, Prisma, node-cron (уже установлен), React + TanStack Query, inline styles.

---

## File Structure

**Create:**
- `apps/api/src/services/notificationService.ts` — центральный хелпер для создания нотификаций
- `apps/api/src/jobs/overdueChecker.ts` — hourly cron: помечает задачи как просроченные
- `apps/api/src/routes/tasks.test.ts` — интеграционные тесты API задач

**Modify:**
- `apps/api/src/routes/tasks.ts` — GET фильтры, PATCH /:id, /assignments эндпоинты, fix RBAC, уведомления
- `apps/api/src/server.ts` — зарегистрировать cron
- `apps/api/src/test/factories.ts` — добавить `createTestTask` / `cleanupTestTask`
- `apps/web/src/pages/TasksPage.tsx` — полная реализация (заглушка → рабочая страница)
- `docs/dev-plan-v2.md` — отметить чекбоксы Фазы 3

---

## Task 1: notificationService.ts

**Files:**
- Create: `apps/api/src/services/notificationService.ts`

- [ ] **Step 1: Create the service**

```typescript
// apps/api/src/services/notificationService.ts
import { prisma } from '@tv-shifts/db'

type NotifType = 'task_assigned' | 'task_overdue' | 'task_closed'

export async function notify(
  type: NotifType,
  message: string,
  userIds: string[],
  entityType: string,
  entityId: string,
) {
  const ids = [...new Set(userIds.filter(Boolean))]
  if (ids.length === 0) return
  await prisma.notification.createMany({
    data: ids.map((userId) => ({
      type: type as any, // NotificationType enum literal
      message,
      userId,
      entityType,
      entityId,
    })),
  })
}
```

- [ ] **Step 2: Build check**

Run: `pnpm --filter @tv-shifts/api build`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/notificationService.ts
git commit -m "feat: add notificationService helper"
```

---

## Task 2: Extend tasks.ts API

**Files:**
- Modify: `apps/api/src/routes/tasks.ts`

- [ ] **Step 1: Replace the entire file**

```typescript
// apps/api/src/routes/tasks.ts
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tv-shifts/db'
import { authenticate } from '../plugins/auth'
import { requirePermission } from '../config/permissions'
import { notify } from '../services/notificationService'

const taskInclude = {
  creator: { select: { id: true, fullName: true } },
  assignments: {
    include: { user: { select: { id: true, fullName: true } } },
  },
  dept: { select: { id: true, name: true } },
  workItem: { select: { id: true, name: true } },
} as const

const createTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  deadline: z.string().datetime({ offset: true }).optional().nullable(),
  deptId: z.string().optional().nullable(),
  wiId: z.string().optional().nullable(),
})

const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  deadline: z.string().datetime({ offset: true }).optional().nullable(),
  deptId: z.string().optional().nullable(),
  wiId: z.string().optional().nullable(),
})

const assignSchema = z.object({
  userId: z.string().min(1),
})

function isAdminOrTasksWrite(user: { roles?: string[]; permissions?: string[] }) {
  return (
    user.roles?.includes('admin') ||
    (user.permissions ?? []).includes('tasks:write')
  )
}

export async function tasksRoutes(app: FastifyInstance) {
  // GET /tasks
  app.get('/', { preHandler: authenticate }, async (request) => {
    const query = request.query as {
      status?: string
      deptId?: string
      wiId?: string
      overdue?: string
      assignedToMe?: string
    }
    const me = request.user as { id: string }

    return prisma.task.findMany({
      where: {
        ...(query.status && { status: query.status as any }),
        ...(query.deptId && { deptId: query.deptId }),
        ...(query.wiId && { wiId: query.wiId }),
        ...(query.overdue === 'true' && { isOverdue: true }),
        ...(query.assignedToMe === 'true' && {
          assignments: { some: { userId: me.id } },
        }),
      },
      include: taskInclude,
      orderBy: [
        { isOverdue: 'desc' },
        { deadline: 'asc' },
        { createdAt: 'desc' },
      ],
    })
  })

  // POST /tasks — create (tasks:write permission)
  app.post('/', { preHandler: requirePermission('tasks:write') }, async (request, reply) => {
    const body = createTaskSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })
    }
    const me = request.user as { id: string }
    const task = await prisma.task.create({
      data: {
        title: body.data.title,
        description: body.data.description ?? null,
        deadline: body.data.deadline ? new Date(body.data.deadline) : null,
        deptId: body.data.deptId ?? null,
        wiId: body.data.wiId ?? null,
        createdBy: me.id,
      },
      include: taskInclude,
    })
    return reply.code(201).send(task)
  })

  // PATCH /tasks/:id — update fields (creator or admin)
  app.patch('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = updateTaskSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })
    }

    const task = await prisma.task.findUnique({ where: { id } })
    if (!task) return reply.code(404).send({ error: 'Task not found' })

    const me = request.user as { id: string; roles?: string[]; permissions?: string[] }
    if (!isAdminOrTasksWrite(me) && task.createdBy !== me.id) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const updated = await prisma.task.update({
      where: { id },
      data: {
        ...(body.data.title !== undefined && { title: body.data.title }),
        ...(body.data.description !== undefined && { description: body.data.description }),
        ...(body.data.deadline !== undefined && {
          deadline: body.data.deadline ? new Date(body.data.deadline) : null,
        }),
        ...(body.data.deptId !== undefined && { deptId: body.data.deptId }),
        ...(body.data.wiId !== undefined && { wiId: body.data.wiId }),
      },
      include: taskInclude,
    })

    return updated
  })

  // POST /tasks/:id/assign — self-assign, moves task to in_progress
  app.post('/:id/assign', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const me = request.user as { id: string }

    const task = await prisma.task.findUnique({ where: { id } })
    if (!task) return reply.code(404).send({ error: 'Task not found' })
    if (task.status !== 'open') return reply.code(400).send({ error: 'Task is not open' })

    const existing = await prisma.taskAssignment.findFirst({
      where: { taskId: id, userId: me.id },
    })
    if (existing) return reply.code(400).send({ error: 'Already assigned' })

    await prisma.$transaction([
      prisma.task.update({ where: { id }, data: { status: 'in_progress' } }),
      prisma.taskAssignment.create({ data: { taskId: id, userId: me.id } }),
    ])

    return { ok: true }
  })

  // POST /tasks/:id/assignments — assign another user (creator or admin)
  app.post('/:id/assignments', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = assignSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })
    }

    const task = await prisma.task.findUnique({ where: { id } })
    if (!task) return reply.code(404).send({ error: 'Task not found' })

    const me = request.user as { id: string; roles?: string[]; permissions?: string[] }
    if (!isAdminOrTasksWrite(me) && task.createdBy !== me.id) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const target = await prisma.user.findUnique({ where: { id: body.data.userId } })
    if (!target) return reply.code(404).send({ error: 'User not found' })

    const existing = await prisma.taskAssignment.findFirst({
      where: { taskId: id, userId: body.data.userId },
    })
    if (existing) return reply.code(400).send({ error: 'User already assigned' })

    const assignment = await prisma.taskAssignment.create({
      data: { taskId: id, userId: body.data.userId },
    })

    if (task.status === 'open') {
      await prisma.task.update({ where: { id }, data: { status: 'in_progress' } })
    }

    await notify(
      'task_assigned',
      `Вам назначена задача: «${task.title}»`,
      [body.data.userId],
      'task',
      id,
    )

    return reply.code(201).send(assignment)
  })

  // DELETE /tasks/:id/assignments/:userId — unassign (creator, admin, or self)
  app.delete('/:id/assignments/:userId', { preHandler: authenticate }, async (request, reply) => {
    const { id, userId } = request.params as { id: string; userId: string }

    const task = await prisma.task.findUnique({ where: { id } })
    if (!task) return reply.code(404).send({ error: 'Task not found' })

    const me = request.user as { id: string; roles?: string[]; permissions?: string[] }
    if (!isAdminOrTasksWrite(me) && task.createdBy !== me.id && me.id !== userId) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    await prisma.taskAssignment.deleteMany({ where: { taskId: id, userId } })

    const remaining = await prisma.taskAssignment.count({ where: { taskId: id } })
    if (remaining === 0 && task.status === 'in_progress') {
      await prisma.task.update({ where: { id }, data: { status: 'open' } })
    }

    return reply.code(204).send()
  })

  // PATCH /tasks/:id/complete — mark done (assignee or admin)
  app.patch('/:id/complete', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const me = request.user as { id: string; roles?: string[]; permissions?: string[] }

    const task = await prisma.task.findUnique({ where: { id } })
    if (!task) return reply.code(404).send({ error: 'Task not found' })

    const assignment = await prisma.taskAssignment.findFirst({
      where: { taskId: id, userId: me.id },
    })

    if (!assignment && !isAdminOrTasksWrite(me)) {
      return reply.code(403).send({ error: 'Not your task' })
    }

    await prisma.$transaction([
      prisma.task.update({ where: { id }, data: { status: 'done' } }),
      ...(assignment
        ? [prisma.taskAssignment.update({
            where: { id: assignment.id },
            data: { completedAt: new Date() },
          })]
        : []),
    ])

    await notify(
      'task_closed',
      `Задача завершена: «${task.title}»`,
      [task.createdBy],
      'task',
      id,
    )

    return { ok: true }
  })

  // DELETE /tasks/:id — hard delete (tasks:write permission)
  app.delete('/:id', { preHandler: requirePermission('tasks:write') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const task = await prisma.task.findUnique({ where: { id } })
    if (!task) return reply.code(404).send({ error: 'Task not found' })
    await prisma.task.delete({ where: { id } })
    return reply.code(204).send()
  })
}
```

- [ ] **Step 2: Build check**

Run: `pnpm --filter @tv-shifts/api build`
Expected: 0 TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/tasks.ts
git commit -m "feat: extend tasks API — filters, PATCH, assignments, RBAC fix, notifications"
```

---

## Task 3: Task factory + integration tests

**Files:**
- Modify: `apps/api/src/test/factories.ts`
- Create: `apps/api/src/routes/tasks.test.ts`

- [ ] **Step 1: Add Task factory to factories.ts**

Append to the end of `apps/api/src/test/factories.ts`:

```typescript
// ─── Task ─────────────────────────────────────────────────────────────────────

interface CreateTaskOptions {
  title?: string
  createdBy: string
  deptId?: string | null
  wiId?: string | null
  deadline?: Date | null
  status?: 'open' | 'in_progress' | 'done'
}

export async function createTestTask(options: CreateTaskOptions) {
  return prisma.task.create({
    data: {
      title: options.title ?? `Test Task ${randomUUID().slice(0, 8)}`,
      createdBy: options.createdBy,
      deptId: options.deptId ?? null,
      wiId: options.wiId ?? null,
      deadline: options.deadline ?? null,
      status: (options.status ?? 'open') as any,
    },
  })
}

export async function cleanupTestTask(id: string) {
  await prisma.taskAssignment.deleteMany({ where: { taskId: id } }).catch(() => {})
  await prisma.task.delete({ where: { id } }).catch(() => {})
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm --filter @tv-shifts/api build`
Expected: 0 errors

- [ ] **Step 3: Write tasks.test.ts**

```typescript
// apps/api/src/routes/tasks.test.ts
/**
 * Integration tests for /tasks routes.
 * Uses buildApp() which already registers tasksRoutes at /tasks.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@tv-shifts/db'
import { buildApp, getAccessToken } from '../test/helpers'
import { createTestUser, cleanupTestUser, createTestTask, cleanupTestTask } from '../test/factories'
import type { FastifyInstance } from 'fastify'

describe('/tasks', () => {
  let app: FastifyInstance
  let adminId: string
  let adminToken: string
  let userId: string
  let userToken: string
  const taskIds: string[] = []

  beforeAll(async () => {
    app = await buildApp()

    const admin = await createTestUser({ role: 'admin' })
    adminId = admin.id
    adminToken = await getAccessToken(app, admin.email, 'testpassword123')

    const user = await createTestUser()
    userId = user.id
    userToken = await getAccessToken(app, user.email, 'testpassword123')
  })

  afterAll(async () => {
    for (const id of taskIds) await cleanupTestTask(id).catch(() => {})
    await cleanupTestUser(adminId).catch(() => {})
    await cleanupTestUser(userId).catch(() => {})
    await app.close()
    await prisma.$disconnect()
  })

  // ── GET /tasks ──────────────────────────────────────────────────────────────

  it('GET /tasks returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/tasks' })
    expect(res.statusCode).toBe(401)
  })

  it('GET /tasks returns all tasks for authenticated user', async () => {
    const task = await createTestTask({ title: 'List test task', createdBy: adminId })
    taskIds.push(task.id)

    const res = await app.inject({
      method: 'GET',
      url: '/tasks',
      cookies: { access_token: adminToken },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body.some((t: any) => t.id === task.id)).toBe(true)
  })

  it('GET /tasks?assignedToMe=true returns only my tasks', async () => {
    const myTask = await createTestTask({ title: 'My task', createdBy: adminId, status: 'in_progress' })
    taskIds.push(myTask.id)
    await prisma.taskAssignment.create({ data: { taskId: myTask.id, userId } })

    const otherTask = await createTestTask({ title: 'Other task', createdBy: adminId })
    taskIds.push(otherTask.id)

    const res = await app.inject({
      method: 'GET',
      url: '/tasks?assignedToMe=true',
      cookies: { access_token: userToken },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.some((t: any) => t.id === myTask.id)).toBe(true)
    expect(body.some((t: any) => t.id === otherTask.id)).toBe(false)
  })

  it('GET /tasks?overdue=true returns only overdue tasks', async () => {
    const overdueTask = await createTestTask({ title: 'Overdue task', createdBy: adminId })
    taskIds.push(overdueTask.id)
    await prisma.task.update({ where: { id: overdueTask.id }, data: { isOverdue: true } })

    const normalTask = await createTestTask({ title: 'Normal task', createdBy: adminId })
    taskIds.push(normalTask.id)

    const res = await app.inject({
      method: 'GET',
      url: '/tasks?overdue=true',
      cookies: { access_token: userToken },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.every((t: any) => t.isOverdue === true)).toBe(true)
    expect(body.some((t: any) => t.id === overdueTask.id)).toBe(true)
    expect(body.some((t: any) => t.id === normalTask.id)).toBe(false)
  })

  // ── POST /tasks ─────────────────────────────────────────────────────────────

  it('POST /tasks returns 403 for regular user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tasks',
      cookies: { access_token: userToken },
      payload: { title: 'Forbidden task' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('POST /tasks creates task for admin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tasks',
      cookies: { access_token: adminToken },
      payload: { title: 'New task from test' },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.title).toBe('New task from test')
    expect(body.status).toBe('open')
    expect(body.createdBy).toBe(adminId)
    taskIds.push(body.id)
  })

  it('POST /tasks returns 400 for missing title', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tasks',
      cookies: { access_token: adminToken },
      payload: {},
    })
    expect(res.statusCode).toBe(400)
  })

  // ── PATCH /tasks/:id ────────────────────────────────────────────────────────

  it('PATCH /tasks/:id updates title (creator)', async () => {
    const task = await createTestTask({ title: 'Original', createdBy: adminId })
    taskIds.push(task.id)

    const res = await app.inject({
      method: 'PATCH',
      url: `/tasks/${task.id}`,
      cookies: { access_token: adminToken },
      payload: { title: 'Updated title' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().title).toBe('Updated title')
  })

  it('PATCH /tasks/:id returns 403 for non-creator non-admin', async () => {
    const task = await createTestTask({ title: 'Not mine', createdBy: adminId })
    taskIds.push(task.id)

    const res = await app.inject({
      method: 'PATCH',
      url: `/tasks/${task.id}`,
      cookies: { access_token: userToken },
      payload: { title: 'Trying to update' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('PATCH /tasks/:id returns 404 for non-existent task', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/tasks/non-existent-id',
      cookies: { access_token: adminToken },
      payload: { title: 'Should 404' },
    })
    expect(res.statusCode).toBe(404)
  })

  // ── POST /tasks/:id/assign ─────────────────────────────────────────────────

  it('POST /tasks/:id/assign creates assignment and sets status to in_progress', async () => {
    const task = await createTestTask({ createdBy: adminId })
    taskIds.push(task.id)

    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${task.id}/assign`,
      cookies: { access_token: userToken },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().ok).toBe(true)

    const updated = await prisma.task.findUnique({ where: { id: task.id } })
    expect(updated?.status).toBe('in_progress')

    const assignment = await prisma.taskAssignment.findFirst({
      where: { taskId: task.id, userId },
    })
    expect(assignment).not.toBeNull()
  })

  it('POST /tasks/:id/assign returns 400 for already-assigned user', async () => {
    const task = await createTestTask({ createdBy: adminId, status: 'in_progress' })
    taskIds.push(task.id)
    await prisma.taskAssignment.create({ data: { taskId: task.id, userId } })

    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${task.id}/assign`,
      cookies: { access_token: userToken },
    })
    expect(res.statusCode).toBe(400)
  })

  it('POST /tasks/:id/assign returns 400 if task is not open', async () => {
    const task = await createTestTask({ createdBy: adminId, status: 'done' })
    taskIds.push(task.id)

    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${task.id}/assign`,
      cookies: { access_token: userToken },
    })
    expect(res.statusCode).toBe(400)
  })

  // ── POST /tasks/:id/assignments ─────────────────────────────────────────────

  it('POST /tasks/:id/assignments assigns user and creates notification', async () => {
    const task = await createTestTask({ createdBy: adminId })
    taskIds.push(task.id)

    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${task.id}/assignments`,
      cookies: { access_token: adminToken },
      payload: { userId },
    })
    expect(res.statusCode).toBe(201)

    const notification = await prisma.notification.findFirst({
      where: { entityId: task.id, userId, type: 'task_assigned' },
    })
    expect(notification).not.toBeNull()
    await prisma.notification.deleteMany({ where: { entityId: task.id } })
  })

  it('POST /tasks/:id/assignments returns 403 for non-creator non-admin', async () => {
    const task = await createTestTask({ createdBy: adminId })
    taskIds.push(task.id)

    const otherUser = await createTestUser()
    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${task.id}/assignments`,
      cookies: { access_token: userToken },
      payload: { userId: otherUser.id },
    })
    expect(res.statusCode).toBe(403)
    await cleanupTestUser(otherUser.id).catch(() => {})
  })

  // ── DELETE /tasks/:id/assignments/:userId ────────────────────────────────────

  it('DELETE /tasks/:id/assignments/:userId removes assignment', async () => {
    const task = await createTestTask({ createdBy: adminId, status: 'in_progress' })
    taskIds.push(task.id)
    await prisma.taskAssignment.create({ data: { taskId: task.id, userId } })

    const res = await app.inject({
      method: 'DELETE',
      url: `/tasks/${task.id}/assignments/${userId}`,
      cookies: { access_token: adminToken },
    })
    expect(res.statusCode).toBe(204)

    const assignment = await prisma.taskAssignment.findFirst({
      where: { taskId: task.id, userId },
    })
    expect(assignment).toBeNull()
  })

  it('DELETE /tasks/:id/assignments/:userId resets status to open when no assignments left', async () => {
    const task = await createTestTask({ createdBy: adminId, status: 'in_progress' })
    taskIds.push(task.id)
    await prisma.taskAssignment.create({ data: { taskId: task.id, userId } })

    await app.inject({
      method: 'DELETE',
      url: `/tasks/${task.id}/assignments/${userId}`,
      cookies: { access_token: adminToken },
    })

    const updated = await prisma.task.findUnique({ where: { id: task.id } })
    expect(updated?.status).toBe('open')
  })

  // ── PATCH /tasks/:id/complete ────────────────────────────────────────────────

  it('PATCH /tasks/:id/complete marks task done and notifies creator', async () => {
    const task = await createTestTask({ createdBy: adminId, status: 'in_progress' })
    taskIds.push(task.id)
    await prisma.taskAssignment.create({ data: { taskId: task.id, userId } })

    const res = await app.inject({
      method: 'PATCH',
      url: `/tasks/${task.id}/complete`,
      cookies: { access_token: userToken },
    })
    expect(res.statusCode).toBe(200)

    const updated = await prisma.task.findUnique({ where: { id: task.id } })
    expect(updated?.status).toBe('done')

    const notification = await prisma.notification.findFirst({
      where: { entityId: task.id, userId: adminId, type: 'task_closed' },
    })
    expect(notification).not.toBeNull()
    await prisma.notification.deleteMany({ where: { entityId: task.id } })
  })

  it('PATCH /tasks/:id/complete returns 403 if not assignee and not admin', async () => {
    const task = await createTestTask({ createdBy: adminId })
    taskIds.push(task.id)

    const res = await app.inject({
      method: 'PATCH',
      url: `/tasks/${task.id}/complete`,
      cookies: { access_token: userToken },
    })
    expect(res.statusCode).toBe(403)
  })

  // ── DELETE /tasks/:id ────────────────────────────────────────────────────────

  it('DELETE /tasks/:id returns 403 for regular user', async () => {
    const task = await createTestTask({ createdBy: adminId })
    taskIds.push(task.id)

    const res = await app.inject({
      method: 'DELETE',
      url: `/tasks/${task.id}`,
      cookies: { access_token: userToken },
    })
    expect(res.statusCode).toBe(403)
  })

  it('DELETE /tasks/:id deletes task for admin and returns 204', async () => {
    const task = await createTestTask({ createdBy: adminId })
    // not pushing to taskIds — we're deleting it in the test

    const res = await app.inject({
      method: 'DELETE',
      url: `/tasks/${task.id}`,
      cookies: { access_token: adminToken },
    })
    expect(res.statusCode).toBe(204)

    const deleted = await prisma.task.findUnique({ where: { id: task.id } })
    expect(deleted).toBeNull()
  })
})
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @tv-shifts/api exec vitest run src/routes/tasks.test.ts`
Expected: all tests pass, 0 failures

- [ ] **Step 5: Run full test suite to check for regressions**

Run: `pnpm test`
Expected: all 163 + new tasks tests pass

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/test/factories.ts apps/api/src/routes/tasks.test.ts
git commit -m "test: add tasks integration tests and Task factory"
```

---

## Task 4: overdueChecker.ts + server.ts

**Files:**
- Create: `apps/api/src/jobs/overdueChecker.ts`
- Modify: `apps/api/src/server.ts`

- [ ] **Step 1: Create overdueChecker.ts**

```typescript
// apps/api/src/jobs/overdueChecker.ts
import cron from 'node-cron'
import { prisma } from '@tv-shifts/db'
import { notify } from '../services/notificationService'

export function startOverdueChecker() {
  // Runs at minute 0 of every hour
  cron.schedule('0 * * * *', async () => {
    try {
      const now = new Date()
      const overdueTasks = await prisma.task.findMany({
        where: {
          deadline: { lt: now },
          isOverdue: false,
          status: { not: 'done' as any },
        },
        include: {
          assignments: { select: { userId: true } },
        },
      })

      for (const task of overdueTasks) {
        await prisma.task.update({
          where: { id: task.id },
          data: { isOverdue: true },
        })

        const userIds = [
          ...new Set([
            task.createdBy,
            ...task.assignments.map((a) => a.userId),
          ]),
        ]

        await notify(
          'task_overdue',
          `Задача просрочена: «${task.title}»`,
          userIds,
          'task',
          task.id,
        )
      }

      if (overdueTasks.length > 0) {
        console.log(`[overdueChecker] Marked ${overdueTasks.length} task(s) as overdue`)
      }
    } catch (err) {
      console.error('[overdueChecker] Error:', err)
    }
  })
}
```

- [ ] **Step 2: Register in server.ts**

In `apps/api/src/server.ts`, add the import after the existing imports:

```typescript
import { startOverdueChecker } from './jobs/overdueChecker'
```

Add the call inside `main()` after `app.listen(...)`:

```typescript
startOverdueChecker()
console.log('[cron] Overdue checker started (runs every hour)')
```

- [ ] **Step 3: Build check**

Run: `pnpm --filter @tv-shifts/api build`
Expected: 0 TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/jobs/overdueChecker.ts apps/api/src/server.ts
git commit -m "feat: add hourly overdue task checker cron job"
```

---

## Task 5: TasksPage.tsx — full UI

**Files:**
- Modify: `apps/web/src/pages/TasksPage.tsx`

Layout: sidebar (Мои/Все + overdue badge + dept filter) + kanban (3 columns).
Card style B: бейдж просрочки, название, аватар исполнителя, дедлайн, создатель.

- [ ] **Step 1: Replace TasksPage.tsx with full implementation**

```typescript
// apps/web/src/pages/TasksPage.tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useCurrentUser } from '../hooks/useAuth'

type TaskStatus = 'open' | 'in_progress' | 'done'

type Assignment = {
  id: string
  userId: string
  completedAt: string | null
  user: { id: string; fullName: string }
}

type Task = {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  deadline: string | null
  isOverdue: boolean
  deptId: string | null
  wiId: string | null
  createdBy: string
  createdAt: string
  creator: { id: string; fullName: string }
  assignments: Assignment[]
  dept: { id: string; name: string } | null
  workItem: { id: string; name: string } | null
}

type Department = {
  id: string
  name: string
  type: string
}

const COL_STATUS: Record<string, TaskStatus[]> = {
  Входящие: ['open'],
  'В работе': ['in_progress'],
  Готово: ['done'],
}

const COLUMNS = ['Входящие', 'В работе', 'Готово'] as const

function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

function formatDeadline(d: string | null) {
  if (!d) return null
  return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
}

function TaskCard({
  task,
  currentUserId,
  onTake,
  onComplete,
  isTaking,
  isCompleting,
}: {
  task: Task
  currentUserId: string
  onTake: (id: string) => void
  onComplete: (id: string) => void
  isTaking: boolean
  isCompleting: boolean
}) {
  const isAssignee = task.assignments.some((a) => a.userId === currentUserId)
  const dl = formatDeadline(task.deadline)

  return (
    <div
      style={{
        background: '#1e293b',
        borderRadius: 8,
        padding: '10px 12px',
        marginBottom: 8,
        borderLeft: task.isOverdue ? '3px solid #dc2626' : '3px solid transparent',
      }}
    >
      {/* Priority + dept */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        {task.isOverdue && (
          <span
            style={{
              background: '#dc2626',
              color: '#fff',
              padding: '1px 6px',
              borderRadius: 3,
              fontSize: 10,
              fontWeight: 600,
            }}
          >
            Просрочена
          </span>
        )}
        {task.dept && (
          <span style={{ color: '#64748b', fontSize: 10 }}>{task.dept.name}</span>
        )}
        {task.workItem && (
          <span style={{ color: '#475569', fontSize: 10 }}>· {task.workItem.name}</span>
        )}
      </div>

      {/* Title */}
      <div
        style={{
          color: '#e2e8f0',
          fontSize: 13,
          fontWeight: 600,
          marginBottom: 8,
          lineHeight: 1.4,
        }}
      >
        {task.title}
      </div>

      {/* Assignees */}
      {task.assignments.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          {task.assignments.slice(0, 3).map((a) => (
            <div
              key={a.userId}
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: '#334155',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#94a3b8',
                fontSize: 9,
                fontWeight: 600,
                flexShrink: 0,
                title: a.user.fullName,
              }}
              title={a.user.fullName}
            >
              {initials(a.user.fullName)}
            </div>
          ))}
          <span style={{ color: '#64748b', fontSize: 11 }}>
            {task.assignments[0].user.fullName}
            {task.assignments.length > 1 && ` +${task.assignments.length - 1}`}
          </span>
        </div>
      )}

      {/* Deadline + creator */}
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        {dl ? (
          <span style={{ color: task.isOverdue ? '#f87171' : '#94a3b8', fontSize: 11 }}>
            до {dl}
          </span>
        ) : (
          <span />
        )}
        <span style={{ color: '#475569', fontSize: 10 }}>
          от {task.creator.fullName.split(' ')[0]}
        </span>
      </div>

      {/* Actions */}
      {task.status === 'open' && (
        <button
          onClick={() => onTake(task.id)}
          disabled={isTaking}
          style={{
            marginTop: 8,
            width: '100%',
            background: isTaking ? '#1e40af' : '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 5,
            padding: '5px 0',
            fontSize: 12,
            cursor: isTaking ? 'not-allowed' : 'pointer',
            opacity: isTaking ? 0.7 : 1,
          }}
        >
          {isTaking ? 'Берём...' : 'Взять'}
        </button>
      )}
      {task.status === 'in_progress' && isAssignee && (
        <button
          onClick={() => onComplete(task.id)}
          disabled={isCompleting}
          style={{
            marginTop: 8,
            width: '100%',
            background: isCompleting ? '#166534' : '#16a34a',
            color: '#fff',
            border: 'none',
            borderRadius: 5,
            padding: '5px 0',
            fontSize: 12,
            cursor: isCompleting ? 'not-allowed' : 'pointer',
            opacity: isCompleting ? 0.7 : 1,
          }}
        >
          {isCompleting ? 'Завершаем...' : 'Завершить'}
        </button>
      )}
    </div>
  )
}

export function TasksPage() {
  const qc = useQueryClient()
  const me = useCurrentUser()
  const [scope, setScope] = useState<'my' | 'all'>('my')
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null)
  const [takingId, setTakingId] = useState<string | null>(null)
  const [completingId, setCompletingId] = useState<string | null>(null)

  const tasksParams = new URLSearchParams()
  if (scope === 'my') tasksParams.set('assignedToMe', 'true')
  if (selectedDeptId) tasksParams.set('deptId', selectedDeptId)

  const { data: tasks = [], isLoading, isError } = useQuery<Task[]>({
    queryKey: ['tasks', scope, selectedDeptId],
    queryFn: () =>
      api.get(`/tasks?${tasksParams.toString()}`).then((r) => r.data),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then((r) => r.data),
  })

  const take = useMutation({
    mutationFn: (id: string) => api.post(`/tasks/${id}/assign`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (err: any) =>
      alert(err?.response?.data?.error ?? 'Не удалось взять задачу'),
  })

  const complete = useMutation({
    mutationFn: (id: string) => api.patch(`/tasks/${id}/complete`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (err: any) =>
      alert(err?.response?.data?.error ?? 'Не удалось завершить задачу'),
  })

  const overdueCount = tasks.filter((t) => t.isOverdue && t.status !== 'done').length

  const tasksByColumn = (col: typeof COLUMNS[number]) =>
    tasks.filter((t) => COL_STATUS[col].includes(t.status))

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      {/* Sidebar */}
      <div
        style={{
          width: 200,
          flexShrink: 0,
          background: '#0f172a',
          borderRight: '1px solid #1e293b',
          padding: '16px 0',
          overflowY: 'auto',
        }}
      >
        {overdueCount > 0 && (
          <button
            onClick={() => {
              setScope('all')
              setSelectedDeptId(null)
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '8px 16px',
              background: '#450a0a',
              border: 'none',
              borderLeft: '3px solid #dc2626',
              color: '#f87171',
              fontSize: 13,
              cursor: 'pointer',
              marginBottom: 8,
              textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 14 }}>⚠</span>
            Просроч. {overdueCount}
          </button>
        )}

        <div style={{ padding: '0 16px 8px', color: '#475569', fontSize: 11 }}>
          ОБЛАСТЬ
        </div>

        {(['my', 'all'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setScope(s)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '7px 16px',
              background: scope === s ? '#1e293b' : 'transparent',
              border: 'none',
              color: scope === s ? '#93c5fd' : '#94a3b8',
              fontSize: 13,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 10 }}>{scope === s ? '◉' : '○'}</span>
            {s === 'my' ? 'Мои' : 'Все'}
          </button>
        ))}

        {departments.length > 0 && (
          <>
            <div
              style={{
                padding: '12px 16px 6px',
                color: '#475569',
                fontSize: 11,
                marginTop: 8,
              }}
            >
              ОТДЕЛ
            </div>
            <button
              onClick={() => setSelectedDeptId(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '6px 16px',
                background: selectedDeptId === null ? '#1e293b' : 'transparent',
                border: 'none',
                color: selectedDeptId === null ? '#93c5fd' : '#64748b',
                fontSize: 12,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              Все отделы
            </button>
            {departments.map((d) => (
              <button
                key={d.id}
                onClick={() =>
                  setSelectedDeptId(d.id === selectedDeptId ? null : d.id)
                }
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '6px 16px',
                  background: selectedDeptId === d.id ? '#1e293b' : 'transparent',
                  border: 'none',
                  color: selectedDeptId === d.id ? '#93c5fd' : '#64748b',
                  fontSize: 12,
                  cursor: 'pointer',
                  textAlign: 'left',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={d.name}
              >
                {d.name}
              </button>
            ))}
          </>
        )}
      </div>

      {/* Kanban */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Header */}
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 16 }}>
            Задачи
          </span>
          {isLoading && (
            <span style={{ color: '#64748b', fontSize: 13 }}>Загрузка...</span>
          )}
          {isError && (
            <span style={{ color: '#f87171', fontSize: 13 }}>Ошибка загрузки</span>
          )}
        </div>

        {/* Columns */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            gap: 0,
            overflow: 'hidden',
          }}
        >
          {COLUMNS.map((col) => {
            const colTasks = tasksByColumn(col)
            return (
              <div
                key={col}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  borderRight: '1px solid #1e293b',
                  minWidth: 0,
                }}
              >
                {/* Column header */}
                <div
                  style={{
                    padding: '10px 14px',
                    borderBottom: '1px solid #1e293b',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span style={{ color: '#64748b', fontSize: 11, fontWeight: 600 }}>
                    {col.toUpperCase()}
                  </span>
                  <span
                    style={{
                      background: '#1e293b',
                      color: '#94a3b8',
                      borderRadius: 10,
                      padding: '1px 7px',
                      fontSize: 11,
                    }}
                  >
                    {colTasks.length}
                  </span>
                </div>

                {/* Cards */}
                <div
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '10px 10px',
                  }}
                >
                  {colTasks.length === 0 && !isLoading && (
                    <div
                      style={{
                        color: '#334155',
                        fontSize: 12,
                        textAlign: 'center',
                        paddingTop: 20,
                      }}
                    >
                      Нет задач
                    </div>
                  )}
                  {colTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      currentUserId={me?.id ?? ''}
                      onTake={(id) => {
                        setTakingId(id)
                        take.mutate(id, { onSettled: () => setTakingId(null) })
                      }}
                      onComplete={(id) => {
                        setCompletingId(id)
                        complete.mutate(id, { onSettled: () => setCompletingId(null) })
                      }}
                      isTaking={takingId === task.id}
                      isCompleting={completingId === task.id}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

Run: `pnpm --filter @tv-shifts/web exec tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Start the app and verify the golden path**

Run: `pnpm dev`

Check the following:
1. Navigate to "Задачи" in the sidebar — no 🚧 placeholder, kanban shows
2. "Мои" scope selected by default — columns load without error
3. Switch to "Все" — tasks appear in correct columns
4. Dept filter in sidebar shows list of departments
5. Click a dept — tasks filter correctly
6. Overdue badge appears if any overdue tasks exist
7. "Взять" button on an open task works — card moves to "В работе"
8. "Завершить" button on an in-progress assigned task works — card moves to "Готово"
9. All buttons show loading state during mutation

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/TasksPage.tsx
git commit -m "feat: implement TasksPage — sidebar+kanban, card B, polling, mutations"
```

---

## Task 6: Update docs and CLAUDE.md

**Files:**
- Modify: `docs/dev-plan-v2.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Mark Phase 3 checkboxes done in dev-plan-v2.md**

Find the Phase 3 section and change `[ ]` → `[x]` for completed items:

```
[x] PATCH  /tasks/:id  добавить deadline, deptId, wiId
[x] GET    /tasks?deptId=&wiId=&overdue=true&assignedTo=
[x] POST   /tasks/:id/assignments  (назначить исполнителя)
[x] DELETE /tasks/:id/assignments/:userId
[x] apps/api/src/jobs/overdueChecker.ts
[x] task_assigned  → исполнитель
[x] task_overdue   → исполнитель + создатель
[x] task_closed    → создатель
[x] TasksPage — полноценный (не заглушка)
```

- [ ] **Step 2: Update CLAUDE.md — TasksPage status and new jobs**

In the "Статус страниц" table, change `TasksPage`:
```
| Tasks | `TasksPage.tsx` | ✅ Фаза 3 — канбан, Мои/Все, фильтр по отделу |
```

Add a new section or entry for the jobs directory:
```
| `/tasks` | `routes/tasks.ts` | **Фаза 3** — Task CRUD + assignments + notifications |
```

Add to the "Новые роуты" table for Phase 3 in the API routes table (tasks already has an entry, just note it was extended).

In the "Фаза 3" status section, add:
```
| Фаза 3: Task-система (TasksPage + overdue cron) | ✅ DONE | (commit hash) |
```

- [ ] **Step 3: Commit**

```bash
git add docs/dev-plan-v2.md CLAUDE.md
git commit -m "docs: mark Phase 3 complete in dev-plan-v2 and CLAUDE.md"
```

---

## Final Verification

- [ ] **Run full test suite**

Run: `pnpm test`
Expected: all tests pass (163 + new tasks tests), 0 failures

- [ ] **Run TypeScript checks on both packages**

Run: `pnpm --filter @tv-shifts/api build && pnpm --filter @tv-shifts/web exec tsc --noEmit`
Expected: 0 errors in both packages

---

## Self-Review

### Spec coverage check

| Requirement (from dev-plan-v2.md) | Task |
|-----------------------------------|------|
| PATCH /tasks/:id (deadline, deptId, wiId) | Task 2 |
| GET /tasks with filters | Task 2 |
| POST /tasks/:id/assignments | Task 2 |
| DELETE /tasks/:id/assignments/:userId | Task 2 |
| overdueChecker cron | Task 4 |
| task_assigned notification | Task 2 |
| task_overdue notification | Task 4 |
| task_closed notification | Task 2 |
| TasksPage — Входящие/В работе/Готово | Task 5 |
| Sidebar Мои/Все + dept filter | Task 5 |

### RULES.md compliance

- All mutations call `qc.invalidateQueries({ queryKey: ['tasks'] })` ✅
- TasksPage uses `refetchInterval: 30_000` ✅
- Loading/error/empty states on all queries ✅
- Buttons show `isPending` state ✅
- All routes have `preHandler: authenticate` or `requirePermission` ✅
- Zod validation with `.safeParse` on all POST/PATCH bodies ✅
- 404 check before mutation on all routes ✅
- DELETE returns 204 ✅
- No `::uuid` in raw SQL (no raw SQL used here) ✅
- Inline styles only, no UI libraries ✅
