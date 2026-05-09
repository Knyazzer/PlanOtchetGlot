import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp, getAccessToken } from '../test/helpers'
import {
  createTestUser, cleanupTestUser,
  createTestStudioBooking, cleanupTestStudioBooking,
} from '../test/factories'
import type { FastifyInstance } from 'fastify'

describe('Studios API', () => {
  let app: FastifyInstance
  let userId: string
  let userToken: string
  let adminId: string
  let adminToken: string

  beforeAll(async () => {
    app = await buildApp()

    const employee = await createTestUser({ role: 'employee' })
    userId    = employee.id
    userToken = await getAccessToken(app, employee.email, 'testpassword123')

    const admin = await createTestUser({ role: 'admin' })
    adminId    = admin.id
    adminToken = await getAccessToken(app, admin.email, 'testpassword123')
  })

  afterAll(async () => {
    await cleanupTestUser(userId).catch(() => {})
    await cleanupTestUser(adminId).catch(() => {})
    await app.close()
  })

  it('POST /studios/book — creates confirmed booking when slot free', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/studios/book',
      cookies: { access_token: userToken },
      payload: {
        studio: 'znamyanka_kamin',
        title: 'Meeting',
        date: '2026-07-01',
        timeFrom: '10:00',
        timeTo: '11:00',
      },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.status).toBe('confirmed')
    expect(body.studio).toBe('znamyanka_kamin')
    expect(body.title).toBe('Meeting')
    await cleanupTestStudioBooking(body.id)
  })

  it('POST /studios/book — preliminary when slot conflicts', async () => {
    const existing = await createTestStudioBooking({
      createdBy: adminId,
      studio: 'znamyanka_black',
      date: new Date('2026-08-01'),
      timeFrom: '09:00',
      timeTo: '12:00',
      status: 'confirmed',
    })
    const res = await app.inject({
      method: 'POST',
      url: '/studios/book',
      cookies: { access_token: userToken },
      payload: {
        studio: 'znamyanka_black',
        title: 'Overlap',
        date: '2026-08-01',
        timeFrom: '11:00',
        timeTo: '13:00',
      },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.status).toBe('preliminary')
    await cleanupTestStudioBooking(body.id)
    await cleanupTestStudioBooking(existing.id)
  })

  it('GET /studios/slots — returns bookings for studio + date range', async () => {
    const booking = await createTestStudioBooking({
      createdBy: userId,
      studio: 'romanov',
      date: new Date('2026-09-15'),
    })
    const res = await app.inject({
      method: 'GET',
      url: '/studios/slots?studio=romanov&from=2026-09-01&to=2026-09-30',
      cookies: { access_token: userToken },
    })
    expect(res.statusCode).toBe(200)
    const ids = res.json().map((b: any) => b.id)
    expect(ids).toContain(booking.id)
    await cleanupTestStudioBooking(booking.id)
  })

  it('PATCH /studios/bookings/:id/block — admin can block', async () => {
    const booking = await createTestStudioBooking({ createdBy: userId })
    const res = await app.inject({
      method: 'PATCH',
      url: `/studios/bookings/${booking.id}/block`,
      cookies: { access_token: adminToken },
      payload: { reason: 'Ремонт' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('blocked')
    await cleanupTestStudioBooking(booking.id)
  })

  it('PATCH /studios/bookings/:id/block — employee cannot block', async () => {
    const booking = await createTestStudioBooking({ createdBy: userId })
    const res = await app.inject({
      method: 'PATCH',
      url: `/studios/bookings/${booking.id}/block`,
      cookies: { access_token: userToken },
      payload: { reason: 'test' },
    })
    expect(res.statusCode).toBe(403)
    await cleanupTestStudioBooking(booking.id)
  })

  it('DELETE /studios/bookings/:id — creator can delete own booking', async () => {
    const booking = await createTestStudioBooking({ createdBy: userId })
    const res = await app.inject({
      method: 'DELETE',
      url: `/studios/bookings/${booking.id}`,
      cookies: { access_token: userToken },
    })
    expect(res.statusCode).toBe(204)
    // record already deleted by route
  })

  it('DELETE /studios/bookings/:id — non-owner gets 403', async () => {
    const booking = await createTestStudioBooking({ createdBy: adminId })
    const res = await app.inject({
      method: 'DELETE',
      url: `/studios/bookings/${booking.id}`,
      cookies: { access_token: userToken },
    })
    expect(res.statusCode).toBe(403)
    await cleanupTestStudioBooking(booking.id)
  })
})
