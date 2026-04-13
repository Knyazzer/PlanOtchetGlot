/**
 * Integration tests for GET /analytics/shifts.
 *
 * Verifies:
 *   - Grouping by user (total, confirmed, byType, projects)
 *   - userId filter — returns only that user's data
 *   - dateFrom/dateTo filter — excludes out-of-range shifts
 *   - employee → 403 (admin/producer only)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@tv-shifts/db'
import { buildApp, getAccessToken } from '../test/helpers'
import {
  createTestUser,
  cleanupTestUser,
  createTestStatusRow,
  cleanupTestStatusRow,
  createTestAssignment,
  createTestShiftEntry,
} from '../test/factories'
import type { FastifyInstance } from 'fastify'

describe('GET /analytics/shifts', () => {
  let app: FastifyInstance
  let adminId: string
  let adminToken: string
  let userId1: string
  let userId2: string
  let projectId: string
  let assignmentId1: string
  let assignmentId2: string

  const DATE = new Date('2025-07-10')
  const DATE2 = new Date('2025-07-11')
  const DATE_OUTSIDE = new Date('2025-08-01')

  beforeAll(async () => {
    app = await buildApp()

    const admin = await createTestUser({ role: 'admin' })
    adminId = admin.id
    adminToken = await getAccessToken(app, admin.email, 'testpassword123')

    const u1 = await createTestUser({ fullName: 'Alice' })
    const u2 = await createTestUser({ fullName: 'Bob' })
    userId1 = u1.id
    userId2 = u2.id

    const project = await createTestStatusRow({ date: DATE })
    projectId = project.id

    const a1 = await createTestAssignment({ projectId, userId: userId1 })
    const a2 = await createTestAssignment({ projectId, userId: userId2 })
    assignmentId1 = a1.id
    assignmentId2 = a2.id

    // Alice: 2 efir (1 confirmed), 1 zastroyka — on project
    await createTestShiftEntry({ assignmentId: assignmentId1, userId: userId1, projectId, date: DATE,  shiftType: 'efir',      confirmed: true })
    await createTestShiftEntry({ assignmentId: assignmentId1, userId: userId1, projectId, date: DATE2, shiftType: 'efir',      confirmed: false })
    await createTestShiftEntry({ assignmentId: assignmentId1, userId: userId1, projectId, date: DATE,  shiftType: 'zastroyka', confirmed: false })
    // Bob: 1 demontazh (confirmed) — same project
    await createTestShiftEntry({ assignmentId: assignmentId2, userId: userId2, projectId, date: DATE,  shiftType: 'demontazh', confirmed: true })
    // Alice: 1 shift outside the query window (should be excluded by dateFrom/dateTo)
    await createTestShiftEntry({ assignmentId: assignmentId1, userId: userId1, projectId, date: DATE_OUTSIDE, shiftType: 'efir', confirmed: false })
  })

  afterAll(async () => {
    await prisma.shiftEntry.deleteMany({ where: { projectId } }).catch(() => {})
    await prisma.projectAssignment.deleteMany({ where: { projectId } }).catch(() => {})
    await cleanupTestStatusRow(projectId)
    await cleanupTestUser(userId1)
    await cleanupTestUser(userId2)
    await cleanupTestUser(adminId)
    await app.close()
    await prisma.$disconnect()
  })

  it('groups shifts by user with correct total/confirmed/byType/projects counts', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/analytics/shifts?dateFrom=2025-07-01&dateTo=2025-07-31',
      cookies: { access_token: adminToken },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      user: { id: string; fullName: string }
      total: number
      confirmed: number
      byType: Record<string, number>
      projects: number
    }[]

    const alice = body.find((e) => e.user.id === userId1)
    const bob   = body.find((e) => e.user.id === userId2)

    expect(alice).toBeDefined()
    expect(alice!.total).toBe(3)             // 2 efir + 1 zastroyka in July
    expect(alice!.confirmed).toBe(1)
    expect(alice!.byType.efir).toBe(2)
    expect(alice!.byType.zastroyka).toBe(1)
    expect(alice!.byType.demontazh).toBe(0)
    expect(alice!.projects).toBe(1)          // all on same project

    expect(bob).toBeDefined()
    expect(bob!.total).toBe(1)
    expect(bob!.confirmed).toBe(1)
    expect(bob!.byType.demontazh).toBe(1)
    expect(bob!.projects).toBe(1)
  })

  it('dateFrom/dateTo filter excludes out-of-range shifts', async () => {
    // Only July — Alice's August shift must not appear
    const res = await app.inject({
      method: 'GET',
      url: '/analytics/shifts?dateFrom=2025-07-01&dateTo=2025-07-31',
      cookies: { access_token: adminToken },
    })

    const body = res.json() as { user: { id: string }; total: number }[]
    const alice = body.find((e) => e.user.id === userId1)
    // July only: 3 shifts (not 4)
    expect(alice!.total).toBe(3)
  })

  it('userId filter returns only that user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/analytics/shifts?dateFrom=2025-07-01&dateTo=2025-07-31&userId=${userId2}`,
      cookies: { access_token: adminToken },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json() as { user: { id: string } }[]
    expect(body.length).toBe(1)
    expect(body[0].user.id).toBe(userId2)
  })

  it('employee cannot access analytics → 403', async () => {
    const emp = await createTestUser({ role: 'employee' })
    const empToken = await getAccessToken(app, emp.email, 'testpassword123')

    const res = await app.inject({
      method: 'GET',
      url: '/analytics/shifts',
      cookies: { access_token: empToken },
    })

    expect(res.statusCode).toBe(403)
    await cleanupTestUser(emp.id)
  })

  it('producer can access analytics → 200', async () => {
    const prod = await createTestUser({ role: 'producer' })
    const prodToken = await getAccessToken(app, prod.email, 'testpassword123')

    const res = await app.inject({
      method: 'GET',
      url: '/analytics/shifts?dateFrom=2025-07-01&dateTo=2025-07-31',
      cookies: { access_token: prodToken },
    })

    expect(res.statusCode).toBe(200)
    await cleanupTestUser(prod.id)
  })
})
