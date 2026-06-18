import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import { prisma } from '@nexus/db'
import { refsRoutes } from './refs'

// Общие справочники: чтение всем, правка значений — только admin.

const P = 'test-refs'
const TEST_VALUE = 'test-refs-value-xyz'
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
  await app.register(refsRoutes, { prefix: '/refs' })
  await app.ready()

  const admin = await prisma.user.create({ data: { name: `${P}-admin`, authId: `${P}-admin`, isAdmin: true } })
  const user = await prisma.user.create({ data: { name: `${P}-user`, authId: `${P}-user` } })
  adminToken = app.jwt.sign({ sub: admin.authId })
  userToken = app.jwt.sign({ sub: user.authId })
})

afterAll(async () => {
  await prisma.refItem.deleteMany({ where: { value: TEST_VALUE } })
  await prisma.user.deleteMany({ where: { authId: { startsWith: P } } })
  await app.close()
})

describe('GET /refs', () => {
  it('отдаёт засеянные списки любому аутентифицированному', async () => {
    const res = await app.inject({ method: 'GET', url: '/refs', headers: { authorization: `Bearer ${userToken}` } })
    expect(res.statusCode).toBe(200)
    const lists = res.json()
    expect(Array.isArray(lists)).toBe(true)
    expect(lists.some((l: any) => l.key === 'positions')).toBe(true)
  })

  it('401 без токена', async () => {
    const res = await app.inject({ method: 'GET', url: '/refs' })
    expect(res.statusCode).toBe(401)
  })
})

describe('POST /refs/:key/items', () => {
  it('admin добавляет значение → 201, оно видно в GET', async () => {
    const add = await app.inject({
      method: 'POST', url: '/refs/positions/items',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { value: TEST_VALUE },
    })
    expect(add.statusCode).toBe(201)

    const list = await app.inject({ method: 'GET', url: '/refs', headers: { authorization: `Bearer ${adminToken}` } })
    const positions = list.json().find((l: any) => l.key === 'positions')
    expect(positions.items.some((i: any) => i.value === TEST_VALUE)).toBe(true)
  })

  it('дубль → 409', async () => {
    const dup = await app.inject({
      method: 'POST', url: '/refs/positions/items',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { value: TEST_VALUE },
    })
    expect(dup.statusCode).toBe(409)
  })

  it('неизвестный список → 404', async () => {
    const res = await app.inject({
      method: 'POST', url: '/refs/nonexistent/items',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { value: 'x' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('не-админ → 403', async () => {
    const res = await app.inject({
      method: 'POST', url: '/refs/positions/items',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { value: 'whatever' },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('DELETE /refs/items/:id', () => {
  it('admin удаляет значение → 204', async () => {
    const item = await prisma.refItem.findFirst({ where: { value: TEST_VALUE } })
    expect(item).toBeTruthy()
    const del = await app.inject({
      method: 'DELETE', url: `/refs/items/${item!.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(del.statusCode).toBe(204)
    expect(await prisma.refItem.count({ where: { value: TEST_VALUE } })).toBe(0)
  })
})
