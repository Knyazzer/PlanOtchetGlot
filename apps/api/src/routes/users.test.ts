/**
 * Integration tests for user management routes.
 * POST /users  — create with bcrypt hash
 * DELETE /users/:id — deactivates (isActive=false), does not physically delete
 * Cannot delete yourself → 400
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import bcrypt from 'bcryptjs'
import { prisma } from '@tv-shifts/db'
import { buildApp, getAccessToken } from '../test/helpers'
import { createTestUser, cleanupTestUser } from '../test/factories'
import type { FastifyInstance } from 'fastify'

describe('POST /users', () => {
  let app: FastifyInstance
  let adminId: string
  let adminToken: string
  const createdIds: string[] = []

  beforeAll(async () => {
    app = await buildApp()
    const admin = await createTestUser({ role: 'admin' })
    adminId = admin.id
    adminToken = await getAccessToken(app, admin.email, 'testpassword123')
  })

  afterAll(async () => {
    for (const id of createdIds) await cleanupTestUser(id).catch(() => {})
    await cleanupTestUser(adminId)
    await app.close()
    await prisma.$disconnect()
  })

  it('creates a user and stores a bcrypt-hashed password (plain text never stored)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/users',
      cookies: { access_token: adminToken },
      payload: {
        fullName: 'Test Bcrypt User',
        email: `bcrypt-test-${Date.now()}@test.invalid`,
        password: 'plaintext-password',
        role: 'employee',
      },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json()

    // Response must not leak the hash or the plain password
    expect(body.passwordHash).toBeUndefined()
    expect(body.password).toBeUndefined()
    expect(body.id).toBeDefined()
    createdIds.push(body.id)

    // Verify hash is stored and verifies correctly
    const dbUser = await prisma.user.findUnique({ where: { id: body.id } })
    expect(dbUser).not.toBeNull()
    const valid = await bcrypt.compare('plaintext-password', dbUser!.passwordHash)
    expect(valid).toBe(true)
  })

  it('duplicate email → 409', async () => {
    const email = `dup-test-${Date.now()}@test.invalid`
    const first = await app.inject({
      method: 'POST',
      url: '/users',
      cookies: { access_token: adminToken },
      payload: { fullName: 'First', email, password: 'password1', role: 'employee' },
    })
    expect(first.statusCode).toBe(201)
    createdIds.push(first.json().id)

    const second = await app.inject({
      method: 'POST',
      url: '/users',
      cookies: { access_token: adminToken },
      payload: { fullName: 'Second', email, password: 'password2', role: 'employee' },
    })
    expect(second.statusCode).toBe(409)
  })

  it('password shorter than 6 chars → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/users',
      cookies: { access_token: adminToken },
      payload: {
        fullName: 'Short Pass',
        email: `short-${Date.now()}@test.invalid`,
        password: '123',
        role: 'employee',
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it('non-admin cannot create users → 403', async () => {
    const emp = await createTestUser({ role: 'employee' })
    const empToken = await getAccessToken(app, emp.email, 'testpassword123')

    const res = await app.inject({
      method: 'POST',
      url: '/users',
      cookies: { access_token: empToken },
      payload: {
        fullName: 'Forbidden User',
        email: `forbidden-${Date.now()}@test.invalid`,
        password: 'password123',
        role: 'employee',
      },
    })
    expect(res.statusCode).toBe(403)

    await cleanupTestUser(emp.id)
  })
})

describe('DELETE /users/:id', () => {
  let app: FastifyInstance
  let adminId: string
  let adminToken: string
  const createdIds: string[] = []

  beforeAll(async () => {
    app = await buildApp()
    const admin = await createTestUser({ role: 'admin' })
    adminId = admin.id
    adminToken = await getAccessToken(app, admin.email, 'testpassword123')
  })

  afterAll(async () => {
    for (const id of createdIds) {
      // Re-activate before cleanup so cleanupTestUser can delete (isActive may be false now)
      await prisma.user.update({ where: { id }, data: { isActive: true } }).catch(() => {})
      await cleanupTestUser(id).catch(() => {})
    }
    await cleanupTestUser(adminId)
    await app.close()
    await prisma.$disconnect()
  })

  it('DELETE sets isActive=false — user is not physically removed from DB', async () => {
    const target = await createTestUser({ role: 'employee' })
    createdIds.push(target.id)

    const res = await app.inject({
      method: 'DELETE',
      url: `/users/${target.id}`,
      cookies: { access_token: adminToken },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().ok).toBe(true)

    // Row still exists in DB
    const dbUser = await prisma.user.findUnique({ where: { id: target.id } })
    expect(dbUser).not.toBeNull()
    expect(dbUser!.isActive).toBe(false)
  })

  it('deactivated user no longer appears in GET /users (isActive filter)', async () => {
    const target = await createTestUser({ role: 'employee' })
    createdIds.push(target.id)

    await app.inject({
      method: 'DELETE',
      url: `/users/${target.id}`,
      cookies: { access_token: adminToken },
    })

    const listRes = await app.inject({
      method: 'GET',
      url: '/users',
      cookies: { access_token: adminToken },
    })

    const users = listRes.json() as { id: string }[]
    expect(users.find((u) => u.id === target.id)).toBeUndefined()
  })

  it('cannot delete yourself → 400', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/users/${adminId}`,
      cookies: { access_token: adminToken },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/yourself/i)

    // Admin must still be active
    const dbUser = await prisma.user.findUnique({ where: { id: adminId } })
    expect(dbUser!.isActive).toBe(true)
  })

  it('non-admin cannot delete users → 403', async () => {
    const emp = await createTestUser({ role: 'employee' })
    const empToken = await getAccessToken(app, emp.email, 'testpassword123')
    const target = await createTestUser({ role: 'employee' })
    createdIds.push(target.id)

    const res = await app.inject({
      method: 'DELETE',
      url: `/users/${target.id}`,
      cookies: { access_token: empToken },
    })

    expect(res.statusCode).toBe(403)

    await cleanupTestUser(emp.id)
  })
})
