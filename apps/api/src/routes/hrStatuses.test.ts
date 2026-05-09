import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@tv-shifts/db'
import { buildApp, getAccessToken } from '../test/helpers'
import {
  createTestUser, cleanupTestUser,
  createTestHRStatus, cleanupTestHRStatus,
} from '../test/factories'
import type { FastifyInstance } from 'fastify'

describe('HR Statuses API', () => {
  let app: FastifyInstance
  let employeeId: string
  let employeeToken: string
  let adminId: string
  let adminToken: string

  beforeAll(async () => {
    app = await buildApp()

    const employee = await createTestUser({ role: 'employee' })
    employeeId    = employee.id
    employeeToken = await getAccessToken(app, employee.email, 'testpassword123')

    const admin = await createTestUser({ role: 'admin' })
    adminId    = admin.id
    adminToken = await getAccessToken(app, admin.email, 'testpassword123')
  })

  afterAll(async () => {
    await cleanupTestUser(employeeId).catch(() => {})
    await cleanupTestUser(adminId).catch(() => {})
    await app.close()
    await prisma.$disconnect()
  })

  it('POST /hr-statuses — creates pending request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/hr-statuses',
      cookies: { access_token: employeeToken },
      payload: { type: 'vacation', dateFrom: '2026-06-01', dateTo: '2026-06-07', notes: 'Summer' },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.status).toBe('pending')
    expect(body.type).toBe('vacation')
    await cleanupTestHRStatus(body.id)
  })

  it('GET /hr-statuses — employee sees only own', async () => {
    const own   = await createTestHRStatus({ userId: employeeId })
    const other = await createTestHRStatus({ userId: adminId })
    const res = await app.inject({
      method: 'GET',
      url: '/hr-statuses',
      cookies: { access_token: employeeToken },
    })
    expect(res.statusCode).toBe(200)
    const ids = res.json().map((r: any) => r.id)
    expect(ids).toContain(own.id)
    expect(ids).not.toContain(other.id)
    await cleanupTestHRStatus(own.id)
    await cleanupTestHRStatus(other.id)
  })

  it('GET /hr-statuses — admin sees all', async () => {
    const record = await createTestHRStatus({ userId: employeeId })
    const res = await app.inject({
      method: 'GET',
      url: '/hr-statuses',
      cookies: { access_token: adminToken },
    })
    expect(res.statusCode).toBe(200)
    const ids = res.json().map((r: any) => r.id)
    expect(ids).toContain(record.id)
    await cleanupTestHRStatus(record.id)
  })

  it('PATCH /hr-statuses/:id/approve — admin approves', async () => {
    const record = await createTestHRStatus({ userId: employeeId })
    const res = await app.inject({
      method: 'PATCH',
      url: `/hr-statuses/${record.id}/approve`,
      cookies: { access_token: adminToken },
      payload: { approved: true },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('approved')
    await cleanupTestHRStatus(record.id)
  })

  it('PATCH /hr-statuses/:id/approve — employee cannot approve', async () => {
    const record = await createTestHRStatus({ userId: employeeId })
    const res = await app.inject({
      method: 'PATCH',
      url: `/hr-statuses/${record.id}/approve`,
      cookies: { access_token: employeeToken },
      payload: { approved: true },
    })
    expect(res.statusCode).toBe(403)
    await cleanupTestHRStatus(record.id)
  })

  it('DELETE /hr-statuses/:id — owner can cancel pending', async () => {
    const record = await createTestHRStatus({ userId: employeeId, status: 'pending' })
    const res = await app.inject({
      method: 'DELETE',
      url: `/hr-statuses/${record.id}`,
      cookies: { access_token: employeeToken },
    })
    expect(res.statusCode).toBe(204)
    // record already deleted by route, no cleanup needed
  })
})
