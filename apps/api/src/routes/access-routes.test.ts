import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import { prisma } from '@nexus/db'
import { accessRoutes } from './access'
import { dayEntriesRoutes } from './day-entries'

// Админ-API: гранты модулей (/access) и версии форматов дня (Q-DAY-5).

const P = 'test-accessroutes'
let app: FastifyInstance
let deptId: string
let adminToken: string
let userToken: string

beforeAll(async () => {
  app = Fastify()
  await app.register(cookie)
  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
    cookie: { cookieName: 'access_token', signed: false },
  })
  await app.register(accessRoutes, { prefix: '/access' })
  await app.register(dayEntriesRoutes, { prefix: '/day-entries' })
  await app.ready()

  const admin = await prisma.user.create({ data: { name: `${P}-admin`, authId: `${P}-admin`, isAdmin: true } })
  const user = await prisma.user.create({ data: { name: `${P}-user`, authId: `${P}-user` } })
  const dept = await prisma.department.create({ data: { name: `${P}-dept` } })
  deptId = dept.id
  adminToken = app.jwt.sign({ sub: admin.authId })
  userToken = app.jwt.sign({ sub: user.authId })
})

afterAll(async () => {
  await prisma.departmentModule.deleteMany({ where: { deptId } })
  await prisma.department.delete({ where: { id: deptId } })
  await prisma.dayFormatVersion.deleteMany({ where: { key: 'test_fmt' } })
  await prisma.user.deleteMany({ where: { authId: { startsWith: P } } })
  await app.close()
})

describe('/access', () => {
  it('не-админу — 403', async () => {
    const res = await app.inject({ method: 'GET', url: '/access/grants', headers: { authorization: `Bearer ${userToken}` } })
    expect(res.statusCode).toBe(403)
  })

  it('выдача → смена уровня → отзыв гранта', async () => {
    const grant = await app.inject({
      method: 'PUT', url: '/access/grants', headers: { authorization: `Bearer ${adminToken}` },
      payload: { deptId, moduleKey: 'fin.expenses', editLevel: 'member' },
    })
    expect(grant.statusCode).toBe(200)

    const up = await app.inject({
      method: 'PUT', url: '/access/grants', headers: { authorization: `Bearer ${adminToken}` },
      payload: { deptId, moduleKey: 'fin.expenses', editLevel: 'head' },
    })
    expect(up.json().editLevel).toBe('head')

    const list = await app.inject({ method: 'GET', url: '/access/grants', headers: { authorization: `Bearer ${adminToken}` } })
    const dept = list.json().find((d: { id: string }) => d.id === deptId)
    expect(dept.grants).toEqual([{ moduleKey: 'fin.expenses', editLevel: 'head' }])

    const revoke = await app.inject({
      method: 'PUT', url: '/access/grants', headers: { authorization: `Bearer ${adminToken}` },
      payload: { deptId, moduleKey: 'fin.expenses', editLevel: null },
    })
    expect(revoke.statusCode).toBe(204)
  })

  it('неизвестный модуль → 400', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/access/grants', headers: { authorization: `Bearer ${adminToken}` },
      payload: { deptId, moduleKey: 'nope.module', editLevel: 'member' },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('/day-entries/formats (админ-версионирование)', () => {
  it('правка создаёт версию с 1-го числа текущего месяца; не-админу — 403', async () => {
    const forbidden = await app.inject({
      method: 'POST', url: '/day-entries/formats', headers: { authorization: `Bearer ${userToken}` },
      payload: { key: 'test_fmt', label: 'Тест', isWork: true, score: 1 },
    })
    expect(forbidden.statusCode).toBe(403)

    const res = await app.inject({
      method: 'POST', url: '/day-entries/formats', headers: { authorization: `Bearer ${adminToken}` },
      payload: { key: 'test_fmt', label: 'Тест', isWork: true, score: 1 },
    })
    expect(res.statusCode).toBe(201)
    const v = res.json()
    const now = new Date()
    expect(v.effectiveFrom.slice(0, 7)).toBe(`${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`)

    // повторная правка в том же месяце обновляет ту же версию (не плодит)
    const again = await app.inject({
      method: 'POST', url: '/day-entries/formats', headers: { authorization: `Bearer ${adminToken}` },
      payload: { key: 'test_fmt', label: 'Тест 2', isWork: true, score: 1.5 },
    })
    expect(again.statusCode).toBe(201)
    const versions = await prisma.dayFormatVersion.findMany({ where: { key: 'test_fmt' } })
    expect(versions.length).toBe(1)
    expect(versions[0].label).toBe('Тест 2')
  })
})
