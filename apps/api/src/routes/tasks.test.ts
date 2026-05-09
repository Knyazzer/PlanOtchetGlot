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

  it('POST /tasks/:id/assign returns 400 when user is already assigned', async () => {
    // Task is open but user already has an assignment — tests the duplicate guard
    const task = await createTestTask({ createdBy: adminId, status: 'open' })
    taskIds.push(task.id)
    await prisma.taskAssignment.create({ data: { taskId: task.id, userId } })

    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${task.id}/assign`,
      cookies: { access_token: userToken },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('Already assigned')
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
    expect(res.json().error).toBe('Task is not open')
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
    expect(res.json().ok).toBe(true)

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
    // not in taskIds — deleted by this test

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
