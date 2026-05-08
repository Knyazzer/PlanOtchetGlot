/**
 * Integration tests for GET /status-rows/conflicts.
 * Uses a real PostgreSQL database (dev DB).
 * Each test creates its own data and cleans up in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@tv-shifts/db'
import { buildApp, getAccessToken } from '../test/helpers'
import {
  createTestUser,
  cleanupTestUser,
  createTestWorkItem,
  cleanupTestWorkItem,
  createTestAssignment,
  createTestShiftEntry,
} from '../test/factories'
import type { FastifyInstance } from 'fastify'

describe('GET /status-rows/conflicts', () => {
  let app: FastifyInstance
  let token: string

  // Shared test data — created once before all tests
  let userId: string
  let userId2: string
  let projectId1: string
  let projectId2: string
  let assignmentId1: string
  let assignmentId2: string

  const DATE_A = new Date('2024-06-15T10:00:00.000Z')
  const DATE_B = new Date('2024-06-16T10:00:00.000Z')

  beforeAll(async () => {
    app = await buildApp()

    // Admin token for the endpoint (authenticate preHandler)
    const admin = await createTestUser({ role: 'admin' })
    userId = admin.id
    token = await getAccessToken(app, admin.email, 'testpassword123')

    // Second user for isolation tests
    const user2 = await createTestUser({ role: 'employee' })
    userId2 = user2.id

    // Two projects
    const project1 = await createTestWorkItem({ name: 'Conflicts Project A' })
    projectId1 = project1.id
    const project2 = await createTestWorkItem({ name: 'Conflicts Project B' })
    projectId2 = project2.id

    // Assignments linking the admin user to both projects
    const asgn1 = await createTestAssignment({ projectId: projectId1, userId })
    assignmentId1 = asgn1.id
    const asgn2 = await createTestAssignment({ projectId: projectId2, userId })
    assignmentId2 = asgn2.id
  })

  afterAll(async () => {
    // ShiftEntries are deleted cascadevia ProjectAssignment or directly
    await prisma.shiftEntry.deleteMany({
      where: { userId: { in: [userId, userId2] } },
    }).catch(() => {})
    await cleanupTestWorkItem(projectId1)
    await cleanupTestWorkItem(projectId2)
    await cleanupTestUser(userId)
    await cleanupTestUser(userId2)
    await app.close()
    await prisma.$disconnect()
  })

  it('one employee, two projects on the same date → returns conflict', async () => {
    // Create two shift entries for the same user on the same day
    const shift1 = await createTestShiftEntry({
      assignmentId: assignmentId1,
      userId,
      projectId: projectId1,
      date: DATE_A,
      shiftType: 'efir',
    })
    const shift2 = await createTestShiftEntry({
      assignmentId: assignmentId2,
      userId,
      projectId: projectId2,
      date: DATE_A,
      shiftType: 'efir',
    })

    const res = await app.inject({
      method: 'GET',
      url: '/status-rows/conflicts',
      cookies: { access_token: token },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()

    // Find the conflict for our user on DATE_A
    const conflict = body.find(
      (c: any) =>
        c.user.id === userId &&
        new Date(c.date).toISOString().startsWith('2024-06-15'),
    )
    expect(conflict).toBeDefined()
    expect(conflict.shifts).toHaveLength(2)

    const shiftIds = conflict.shifts.map((s: any) => s.shiftId)
    expect(shiftIds).toContain(shift1.id)
    expect(shiftIds).toContain(shift2.id)

    // Cleanup for this test
    await prisma.shiftEntry.deleteMany({ where: { id: { in: [shift1.id, shift2.id] } } })
  })

  it('one employee, different dates → no conflict for that employee', async () => {
    // Two shifts on different days — should NOT conflict
    const shift1 = await createTestShiftEntry({
      assignmentId: assignmentId1,
      userId,
      projectId: projectId1,
      date: DATE_A,
      shiftType: 'efir',
    })
    const shift2 = await createTestShiftEntry({
      assignmentId: assignmentId2,
      userId,
      projectId: projectId2,
      date: DATE_B,
      shiftType: 'efir',
    })

    const res = await app.inject({
      method: 'GET',
      url: '/status-rows/conflicts',
      cookies: { access_token: token },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()

    // No conflict on DATE_A or DATE_B for this user (only 1 shift each)
    const conflictsForUser = body.filter((c: any) => c.user.id === userId)
    expect(conflictsForUser).toHaveLength(0)

    await prisma.shiftEntry.deleteMany({ where: { id: { in: [shift1.id, shift2.id] } } })
  })

  it('dateFrom/dateTo filter — excludes shifts outside the range', async () => {
    // Conflicting shifts on DATE_A
    const shift1 = await createTestShiftEntry({
      assignmentId: assignmentId1,
      userId,
      projectId: projectId1,
      date: DATE_A,       // 2024-06-15
      shiftType: 'efir',
    })
    const shift2 = await createTestShiftEntry({
      assignmentId: assignmentId2,
      userId,
      projectId: projectId2,
      date: DATE_A,
      shiftType: 'efir',
    })

    // dateFrom after DATE_A → conflict should not appear
    const res = await app.inject({
      method: 'GET',
      url: '/status-rows/conflicts?dateFrom=2024-06-16',
      cookies: { access_token: token },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()

    const conflict = body.find(
      (c: any) =>
        c.user.id === userId &&
        new Date(c.date).toISOString().startsWith('2024-06-15'),
    )
    expect(conflict).toBeUndefined()

    await prisma.shiftEntry.deleteMany({ where: { id: { in: [shift1.id, shift2.id] } } })
  })

  it('dateFrom/dateTo filter — includes shifts inside the range', async () => {
    const shift1 = await createTestShiftEntry({
      assignmentId: assignmentId1,
      userId,
      projectId: projectId1,
      date: DATE_A,       // 2024-06-15
      shiftType: 'efir',
    })
    const shift2 = await createTestShiftEntry({
      assignmentId: assignmentId2,
      userId,
      projectId: projectId2,
      date: DATE_A,
      shiftType: 'efir',
    })

    // Range that includes DATE_A
    const res = await app.inject({
      method: 'GET',
      url: '/status-rows/conflicts?dateFrom=2024-06-14&dateTo=2024-06-16',
      cookies: { access_token: token },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()

    const conflict = body.find(
      (c: any) =>
        c.user.id === userId &&
        new Date(c.date).toISOString().startsWith('2024-06-15'),
    )
    expect(conflict).toBeDefined()
    expect(conflict.shifts).toHaveLength(2)

    await prisma.shiftEntry.deleteMany({ where: { id: { in: [shift1.id, shift2.id] } } })
  })

  it('requires authentication → 401 without token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/status-rows/conflicts',
    })
    expect(res.statusCode).toBe(401)
  })
})
