/**
 * Integration tests for authenticate / requireRole preHandlers.
 * Tests real routes that use these guards to verify 401/403 behaviour.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp, getAccessToken } from '../test/helpers'
import { createTestUser, cleanupTestUser, TEST_PASSWORD } from '../test/factories'
import { prisma } from '@tv-shifts/db'

let app: FastifyInstance

// Пользователи разных ролей
let adminId: string
let adminEmail: string
let producerId: string
let producerEmail: string
let employeeId: string
let employeeEmail: string

beforeAll(async () => {
  app = await buildApp()

  const admin    = await createTestUser({ role: 'admin' })
  const producer = await createTestUser({ role: 'producer' })
  const employee = await createTestUser({ role: 'employee' })

  adminId     = admin.id;    adminEmail    = admin.email
  producerId  = producer.id; producerEmail = producer.email
  employeeId  = employee.id; employeeEmail = employee.email
})

afterAll(async () => {
  await cleanupTestUser(adminId)
  await cleanupTestUser(producerId)
  await cleanupTestUser(employeeId)
  await app.close()
  await prisma.$disconnect()
})

// ─── authenticate (нет токена → 401) ─────────────────────────────────────────

describe('authenticate preHandler', () => {
  it('запрос без токена к защищённому роуту → 401', async () => {
    // GET /status-rows использует preHandler: authenticate
    const res = await app.inject({ method: 'GET', url: '/status-rows' })
    expect(res.statusCode).toBe(401)
  })

  it('запрос с валидным токеном → не 401', async () => {
    const token = await getAccessToken(app, employeeEmail, TEST_PASSWORD)
    const res = await app.inject({
      method: 'GET',
      url: '/status-rows',
      headers: { cookie: `access_token=${token}` },
    })
    expect(res.statusCode).not.toBe(401)
  })
})

// ─── requireRole ─────────────────────────────────────────────────────────────

describe('requireRole preHandler', () => {
  it('employee → GET /users → 403', async () => {
    const token = await getAccessToken(app, employeeEmail, TEST_PASSWORD)
    const res = await app.inject({
      method: 'GET',
      url: '/users',
      headers: { cookie: `access_token=${token}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('admin → GET /users → 200', async () => {
    const token = await getAccessToken(app, adminEmail, TEST_PASSWORD)
    const res = await app.inject({
      method: 'GET',
      url: '/users',
      headers: { cookie: `access_token=${token}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('employee → POST /sync/trigger → 403', async () => {
    const token = await getAccessToken(app, employeeEmail, TEST_PASSWORD)
    const res = await app.inject({
      method: 'POST',
      url: '/sync/trigger',
      headers: { cookie: `access_token=${token}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('producer → POST /sync/trigger → не 403', async () => {
    const token = await getAccessToken(app, producerEmail, TEST_PASSWORD)
    const res = await app.inject({
      method: 'POST',
      url: '/sync/trigger',
      headers: { cookie: `access_token=${token}` },
    })
    // Синхронизация запустится (или вернёт 202/200), но не 403
    expect(res.statusCode).not.toBe(403)
  })

  it('requireRole("admin","producer"): producer → GET /sync/logs → 200', async () => {
    const token = await getAccessToken(app, producerEmail, TEST_PASSWORD)
    const res = await app.inject({
      method: 'GET',
      url: '/sync/logs',
      headers: { cookie: `access_token=${token}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('requireRole("admin","producer"): employee → GET /sync/logs → 403', async () => {
    const token = await getAccessToken(app, employeeEmail, TEST_PASSWORD)
    const res = await app.inject({
      method: 'GET',
      url: '/sync/logs',
      headers: { cookie: `access_token=${token}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('employee → POST /status-rows → 403', async () => {
    const token = await getAccessToken(app, employeeEmail, TEST_PASSWORD)
    const res = await app.inject({
      method: 'POST',
      url: '/status-rows',
      payload: { name: 'Тест' },
      headers: { cookie: `access_token=${token}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('employee → GET /status-rows → 200 (только authenticate, не requireRole)', async () => {
    const token = await getAccessToken(app, employeeEmail, TEST_PASSWORD)
    const res = await app.inject({
      method: 'GET',
      url: '/status-rows',
      headers: { cookie: `access_token=${token}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('нет токена → 401 (не 403)', async () => {
    const res = await app.inject({ method: 'GET', url: '/users' })
    expect(res.statusCode).toBe(401)
  })
})
