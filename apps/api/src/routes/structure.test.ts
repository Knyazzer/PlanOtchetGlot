import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import { prisma } from '@nexus/db'
import { structureRoutes } from './structure'

// Гарды /structure: чтение — любому аутентифицированному, мутации — только admin.

const ADMIN_AUTH_ID = 'test-structure-admin-auth'
const USER_AUTH_ID = 'test-structure-user-auth'
const DEPT_NAME = 'test-structure-dept'

let app: FastifyInstance
let adminToken: string
let userToken: string

beforeAll(async () => {
  app = Fastify()
  await app.register(cookie)
  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
    cookie: { cookieName: 'access_token', signed: false },
  })
  await app.register(structureRoutes, { prefix: '/structure' })
  await app.ready()

  const admin = await prisma.user.upsert({
    where: { authId: ADMIN_AUTH_ID },
    update: { isAdmin: true, isActive: true },
    create: { name: 'Test Structure Admin', authId: ADMIN_AUTH_ID, isAdmin: true },
  })
  const user = await prisma.user.upsert({
    where: { authId: USER_AUTH_ID },
    update: { isAdmin: false, isActive: true },
    create: { name: 'Test Structure User', authId: USER_AUTH_ID },
  })
  adminToken = app.jwt.sign({ sub: admin.authId })
  userToken = app.jwt.sign({ sub: user.authId })
})

afterAll(async () => {
  await prisma.department.deleteMany({ where: { name: DEPT_NAME } })
  await prisma.user.deleteMany({ where: { authId: { in: [ADMIN_AUTH_ID, USER_AUTH_ID] } } })
  await app.close()
})

describe('GET /structure', () => {
  it('401 без токена', async () => {
    const res = await app.inject({ method: 'GET', url: '/structure' })
    expect(res.statusCode).toBe(401)
  })

  it('200 обычному пользователю (чтение — всем аутентифицированным)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/structure',
      headers: { authorization: `Bearer ${userToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.json())).toBe(true)
  })
})

describe('мутации /structure — только admin', () => {
  it('403 на POST /departments не-админу', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/structure/departments',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: DEPT_NAME },
    })
    expect(res.statusCode).toBe(403)
  })

  it('403 на POST /migrate-from-sheets не-админу', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/structure/migrate-from-sheets',
      headers: { authorization: `Bearer ${userToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('admin создаёт/правит/удаляет департамент; невалидное body → 400', async () => {
    const bad = await app.inject({
      method: 'POST',
      url: '/structure/departments',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: '' },
    })
    expect(bad.statusCode).toBe(400)

    const created = await app.inject({
      method: 'POST',
      url: '/structure/departments',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: DEPT_NAME, color: '#123456' },
    })
    expect(created.statusCode).toBe(200)
    const dept = created.json()
    expect(dept.name).toBe(DEPT_NAME)

    const patched = await app.inject({
      method: 'PATCH',
      url: `/structure/departments/${dept.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { color: '#654321' },
    })
    expect(patched.statusCode).toBe(200)
    expect(patched.json().color).toBe('#654321')

    const userDelete = await app.inject({
      method: 'DELETE',
      url: `/structure/departments/${dept.id}`,
      headers: { authorization: `Bearer ${userToken}` },
    })
    expect(userDelete.statusCode).toBe(403)

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/structure/departments/${dept.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(deleted.statusCode).toBe(200)
  })
})
