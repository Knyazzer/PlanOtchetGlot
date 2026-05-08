/**
 * Integration tests for GET /shifts/monthly-summary/:userId/:year/:month.
 * Uses a real PostgreSQL database (dev DB).
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
  createTestMonthlySummary,
} from '../test/factories'
import type { FastifyInstance } from 'fastify'

const YEAR  = 2024
const MONTH = 3   // March

describe('GET /shifts/monthly-summary/:userId/:year/:month', () => {
  let app: FastifyInstance

  let adminId: string
  let adminToken: string
  let employeeId: string
  let employeeToken: string
  let employee2Id: string
  let employee2Token: string

  let projectId: string
  let assignmentId: string

  beforeAll(async () => {
    app = await buildApp()

    const admin = await createTestUser({ role: 'admin' })
    adminId = admin.id
    adminToken = await getAccessToken(app, admin.email, 'testpassword123')

    const emp = await createTestUser({ role: 'employee' })
    employeeId = emp.id
    employeeToken = await getAccessToken(app, emp.email, 'testpassword123')

    const emp2 = await createTestUser({ role: 'employee' })
    employee2Id = emp2.id
    employee2Token = await getAccessToken(app, emp2.email, 'testpassword123')

    const project = await createTestWorkItem({ name: 'Monthly Summary Project' })
    projectId = project.id

    const asgn = await createTestAssignment({ projectId, userId: employeeId })
    assignmentId = asgn.id
  })

  afterAll(async () => {
    await prisma.shiftEntry.deleteMany({ where: { userId: employeeId } }).catch(() => {})
    await prisma.monthlySummary.deleteMany({ where: { userId: { in: [employeeId, employee2Id] } } }).catch(() => {})
    await cleanupTestWorkItem(projectId)
    await cleanupTestUser(adminId)
    await cleanupTestUser(employeeId)
    await cleanupTestUser(employee2Id)
    await app.close()
    await prisma.$disconnect()
  })

  it('no MonthlySummary record → computed on the fly, totalShifts = count of confirmed shifts', async () => {
    // Ensure no monthly summary exists for employeeId in YEAR/MONTH
    await prisma.monthlySummary.deleteMany({
      where: { userId: employeeId, year: YEAR, month: MONTH },
    })

    // Create 3 confirmed shifts in March 2024
    const shifts = await Promise.all([
      createTestShiftEntry({
        assignmentId,
        userId: employeeId,
        projectId,
        date: new Date(`${YEAR}-0${MONTH}-05T10:00:00.000Z`),
        confirmed: true,
      }),
      createTestShiftEntry({
        assignmentId,
        userId: employeeId,
        projectId,
        date: new Date(`${YEAR}-0${MONTH}-10T10:00:00.000Z`),
        confirmed: true,
      }),
      createTestShiftEntry({
        assignmentId,
        userId: employeeId,
        projectId,
        date: new Date(`${YEAR}-0${MONTH}-20T10:00:00.000Z`),
        confirmed: true,
      }),
    ])

    // Also create an unconfirmed shift — should NOT be counted
    const unconfirmedShift = await createTestShiftEntry({
      assignmentId,
      userId: employeeId,
      projectId,
      date: new Date(`${YEAR}-0${MONTH}-25T10:00:00.000Z`),
      confirmed: false,
    })

    const res = await app.inject({
      method: 'GET',
      url: `/shifts/monthly-summary/${employeeId}/${YEAR}/${MONTH}`,
      cookies: { access_token: adminToken },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.userId).toBe(employeeId)
    expect(body.year).toBe(YEAR)
    expect(body.month).toBe(MONTH)
    expect(body.totalShifts).toBe(3)      // only confirmed
    expect(body.overtimeShifts).toBe(0)   // no threshold set on the fly
    expect(body.threshold).toBeNull()     // no stored summary → threshold is null

    // Cleanup
    await prisma.shiftEntry.deleteMany({
      where: { id: { in: [...shifts.map((s) => s.id), unconfirmedShift.id] } },
    })
  })

  it('stored MonthlySummary with overtime → overtimeShifts > 0', async () => {
    // Directly create a summary record with 20 shifts and threshold of 16
    const summary = await createTestMonthlySummary({
      userId:        employeeId,
      year:          YEAR,
      month:         MONTH + 1,   // April, distinct from other tests
      workingDays:   22,
      threshold:     16,
      totalShifts:   20,
      overtimeShifts: 4,          // 20 - 16 = 4 overtime shifts
    })

    const res = await app.inject({
      method: 'GET',
      url: `/shifts/monthly-summary/${employeeId}/${YEAR}/${MONTH + 1}`,
      cookies: { access_token: adminToken },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.totalShifts).toBe(20)
    expect(body.threshold).toBe(16)
    expect(body.overtimeShifts).toBe(4)

    await prisma.monthlySummary.delete({ where: { id: summary.id } }).catch(() => {})
  })

  it('employee can view their own monthly summary', async () => {
    await prisma.monthlySummary.deleteMany({
      where: { userId: employeeId, year: YEAR, month: MONTH + 2 },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/shifts/monthly-summary/${employeeId}/${YEAR}/${MONTH + 2}`,
      cookies: { access_token: employeeToken },
    })

    // No data → on-the-fly 0 shifts, still 200
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.userId).toBe(employeeId)
    expect(body.totalShifts).toBe(0)
  })

  it('employee cannot view another employee\'s monthly summary → 403', async () => {
    // employee2 tries to access employee1's summary
    const res = await app.inject({
      method: 'GET',
      url: `/shifts/monthly-summary/${employeeId}/${YEAR}/${MONTH}`,
      cookies: { access_token: employee2Token },
    })

    expect(res.statusCode).toBe(403)
  })

  it('admin can view any employee\'s monthly summary', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/shifts/monthly-summary/${employeeId}/${YEAR}/${MONTH}`,
      cookies: { access_token: adminToken },
    })

    expect(res.statusCode).toBe(200)
  })
})
