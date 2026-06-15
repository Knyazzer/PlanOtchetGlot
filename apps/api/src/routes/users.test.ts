import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import { prisma } from '@nexus/db'
import { usersRoutes } from './users'

// PATCH /users/:id — admin может менять canAccessPlatform; не-админ отбивается гардом.

const ADMIN_AUTH_ID = 'test-users-admin-auth'
const USER_AUTH_ID = 'test-users-nonadmin-auth'
const TARGET_AUTH_ID = 'test-users-target-auth'

let app: FastifyInstance
let adminToken: string
let userToken: string
let targetId: string

beforeAll(async () => {
  app = Fastify()
  await app.register(cookie)
  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
    cookie: { cookieName: 'access_token', signed: false },
  })
  await app.register(usersRoutes, { prefix: '/users' })
  await app.ready()

  const admin = await prisma.user.upsert({
    where: { authId: ADMIN_AUTH_ID },
    update: { isAdmin: true, isActive: true },
    create: { name: 'Test Users Admin', authId: ADMIN_AUTH_ID, isAdmin: true },
  })
  await prisma.user.upsert({
    where: { authId: USER_AUTH_ID },
    update: { isAdmin: false, isActive: true },
    create: { name: 'Test Users NonAdmin', authId: USER_AUTH_ID },
  })
  const target = await prisma.user.upsert({
    where: { authId: TARGET_AUTH_ID },
    update: { isActive: true, canAccessPlatform: false },
    create: { name: 'Test Platform Target', authId: TARGET_AUTH_ID, userType: 'staff' },
  })
  targetId = target.id
  adminToken = app.jwt.sign({ sub: ADMIN_AUTH_ID })
  userToken = app.jwt.sign({ sub: USER_AUTH_ID })  // не-админ → requireRole отобьёт 403
})

afterAll(async () => {
  await prisma.user.deleteMany({ where: { authId: { in: [ADMIN_AUTH_ID, USER_AUTH_ID, TARGET_AUTH_ID] } } })
  await app.close()
})

describe('PATCH /users/:id — canAccessPlatform', () => {
  it('admin включает флаг → 200 и canAccessPlatform=true в ответе', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${targetId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { canAccessPlatform: true },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().canAccessPlatform).toBe(true)
  })

  it('не-админ → 403', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${targetId}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { canAccessPlatform: false },
    })
    expect(res.statusCode).toBe(403)
  })
})
