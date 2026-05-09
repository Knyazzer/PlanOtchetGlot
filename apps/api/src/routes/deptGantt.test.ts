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
