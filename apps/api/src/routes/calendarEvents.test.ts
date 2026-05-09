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
