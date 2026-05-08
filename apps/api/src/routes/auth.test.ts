/**
 * Integration tests for /auth/* routes.
 * Requires a live PostgreSQL database (DATABASE_URL from .env).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../test/helpers'
import { createTestUser, cleanupTestUser, TEST_PASSWORD } from '../test/factories'
import { prisma } from '@tv-shifts/db'

let app: FastifyInstance
let userId: string
let userEmail: string

beforeAll(async () => {
  app = await buildApp()
  const user = await createTestUser({ role: 'employee' })
  userId    = user.id
  userEmail = user.email
})

afterAll(async () => {
  await cleanupTestUser(userId)
  await app.close()
  await prisma.$disconnect()
})

// ─── POST /auth/login ─────────────────────────────────────────────────────────

describe('POST /auth/login', () => {
  it('правильные credentials → 200 + httpOnly cookie access_token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: userEmail, password: TEST_PASSWORD },
    })
    expect(res.statusCode).toBe(200)

    const body = res.json()
    expect(body.user.email).toBe(userEmail)
    expect(body.user.roles).toContain('employee')
    expect(body.user.passwordHash).toBeUndefined() // не утекает в ответе

    const accessCookie  = res.cookies.find((c) => c.name === 'access_token')
    const refreshCookie = res.cookies.find((c) => c.name === 'refresh_token')
    expect(accessCookie).toBeDefined()
    expect(accessCookie?.httpOnly).toBe(true)
    expect(refreshCookie).toBeDefined()
    expect(refreshCookie?.httpOnly).toBe(true)
  })

  it('неверный пароль → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: userEmail, password: 'неверный_пароль' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('несуществующий email → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'nonexistent@test.invalid', password: TEST_PASSWORD },
    })
    expect(res.statusCode).toBe(401)
  })

  it('деактивированный пользователь → 401', async () => {
    const inactive = await createTestUser({ isActive: false })
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: inactive.email, password: TEST_PASSWORD },
      })
      expect(res.statusCode).toBe(401)
    } finally {
      await cleanupTestUser(inactive.id)
    }
  })

  it('невалидный email → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'не-email', password: TEST_PASSWORD },
    })
    expect(res.statusCode).toBe(400)
  })
})

// ─── POST /auth/refresh ───────────────────────────────────────────────────────

describe('POST /auth/refresh', () => {
  it('валидный refresh cookie → 200 + новый access_token', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: userEmail, password: TEST_PASSWORD },
    })
    const refreshToken = loginRes.cookies.find((c) => c.name === 'refresh_token')?.value
    expect(refreshToken).toBeDefined()

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { cookie: `refresh_token=${refreshToken}` },
    })
    expect(res.statusCode).toBe(200)
    const newAccess = res.cookies.find((c) => c.name === 'access_token')
    expect(newAccess).toBeDefined()
    expect(newAccess?.httpOnly).toBe(true)
  })

  it('без cookie → 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/refresh' })
    expect(res.statusCode).toBe(401)
  })

  it('невалидный токен → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { cookie: 'refresh_token=not.a.valid.jwt' },
    })
    expect(res.statusCode).toBe(401)
  })
})

// ─── POST /auth/logout ────────────────────────────────────────────────────────

describe('POST /auth/logout', () => {
  it('очищает оба cookie', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: userEmail, password: TEST_PASSWORD },
    })
    const accessToken = loginRes.cookies.find((c) => c.name === 'access_token')?.value!

    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { cookie: `access_token=${accessToken}` },
    })
    expect(res.statusCode).toBe(200)

    // Fastify clearCookie задаёт maxAge=0 или expires в прошлом
    const clearedAccess  = res.cookies.find((c) => c.name === 'access_token')
    const clearedRefresh = res.cookies.find((c) => c.name === 'refresh_token')
    const isCleared = (c: typeof clearedAccess) =>
      c == null || c.maxAge === 0 || (c.expires != null && new Date(c.expires) <= new Date())
    expect(isCleared(clearedAccess)).toBe(true)
    expect(isCleared(clearedRefresh)).toBe(true)
  })
})

// ─── GET /auth/me ─────────────────────────────────────────────────────────────

describe('GET /auth/me', () => {
  it('валидный access_token → 200 + данные пользователя', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: userEmail, password: TEST_PASSWORD },
    })
    const accessToken = loginRes.cookies.find((c) => c.name === 'access_token')?.value!

    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: `access_token=${accessToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.email).toBe(userEmail)
    expect(body.id).toBe(userId)
    expect(body.passwordHash).toBeUndefined()
  })

  it('без токена → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/me' })
    expect(res.statusCode).toBe(401)
  })

  it('невалидный токен → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: 'access_token=bad.token.here' },
    })
    expect(res.statusCode).toBe(401)
  })
})
