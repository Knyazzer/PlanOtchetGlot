import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import { prisma } from '@nexus/db'
import { projectsRoutes, workItemsRoutes } from './projects'

// BAC-гарды (docs/RBAC-MODEL.md §4.6): финансовые мутации/поля закрыты для юзера без fin.*,
// открыты admin. Раньше (кейс ФИФА) любой аутентифицированный мог править бюджеты/расходы.

const ADMIN_AUTH = 'test-proj-admin-auth'
const PLAIN_AUTH = 'test-proj-plain-auth'

let app: FastifyInstance
let adminToken: string
let plainToken: string
let projectId: string
let wiId: string

const auth = (t: string) => ({ authorization: `Bearer ${t}` })

beforeAll(async () => {
  app = Fastify()
  await app.register(cookie)
  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
    cookie: { cookieName: 'access_token', signed: false },
  })
  await app.register(projectsRoutes, { prefix: '/projects' })
  await app.register(workItemsRoutes, { prefix: '/work-items' })
  await app.ready()

  const admin = await prisma.user.upsert({
    where: { authId: ADMIN_AUTH },
    update: { isAdmin: true, isActive: true },
    create: { name: 'Test Proj Admin', authId: ADMIN_AUTH, isAdmin: true },
  })
  // Обычный юзер: без департаментов/грантов и не продюсер WI → доступа к fin.* нет.
  const plain = await prisma.user.upsert({
    where: { authId: PLAIN_AUTH },
    update: { isAdmin: false, isActive: true },
    create: { name: 'Test Proj Plain', authId: PLAIN_AUTH },
  })
  adminToken = app.jwt.sign({ sub: admin.authId })
  plainToken = app.jwt.sign({ sub: plain.authId })

  const project = await prisma.project.create({ data: { title: 'test-bac-project' } })
  projectId = project.id
  const wi = await prisma.workItem.create({ data: { title: 'test-bac-wi', projectId, budget: 1000 } })
  wiId = wi.id
  await prisma.expense.create({ data: { workItemId: wiId, amount: 500, category: 'other', description: '', createdById: admin.id } })
})

afterAll(async () => {
  await prisma.expense.deleteMany({ where: { workItemId: wiId } })
  await prisma.workItem.deleteMany({ where: { projectId } })
  await prisma.project.deleteMany({ where: { id: projectId } })
  await prisma.user.deleteMany({ where: { authId: { in: [ADMIN_AUTH, PLAIN_AUTH] } } })
  await app.close()
})

describe('projects BAC-гарды', () => {
  it('обычный юзер БЕЗ fin.* не может создать расход → 403', async () => {
    const res = await app.inject({
      method: 'POST', url: `/work-items/${wiId}/expenses`, headers: auth(plainToken),
      payload: { amount: 100, category: 'other', description: 'x' },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().module).toBe('fin.expenses')
  })

  it('admin может создать расход → 201', async () => {
    const res = await app.inject({
      method: 'POST', url: `/work-items/${wiId}/expenses`, headers: auth(adminToken),
      payload: { amount: 100, category: 'other', description: 'x' },
    })
    expect(res.statusCode).toBe(201)
    await prisma.expense.deleteMany({ where: { workItemId: wiId, amount: 100 } })
  })

  it('обычный юзер не может править бюджет WI → 403', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/work-items/${wiId}`, headers: auth(plainToken),
      payload: { budget: 9999 },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().module).toBe('prod.workitems')
  })

  it('field-level: у юзера без fin.* в выдаче WI нет budget/expenses', async () => {
    const res = await app.inject({ method: 'GET', url: `/work-items/${wiId}`, headers: auth(plainToken) })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.budget).toBeUndefined()
    expect(body.expenses).toBeUndefined()
  })

  it('field-level: admin видит budget/expenses', async () => {
    const res = await app.inject({ method: 'GET', url: `/work-items/${wiId}`, headers: auth(adminToken) })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Number(body.budget)).toBe(1000)   // Prisma Decimal → строка в JSON
    expect(Array.isArray(body.expenses)).toBe(true)
  })
})
