import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import { prisma } from '@nexus/db'
import { tasksRoutes } from './tasks'

// Кусок №1: POST принимает status; PATCH при переходе в inprogress ставит startDate=сегодня.
const AUTH_ID = 'test-tasks-core-auth'
const RECIPIENT_AUTH_ID = 'test-tasks-core-recipient'

let app: FastifyInstance
let token: string
let userId: string
let recipientId: string

const isToday = (d: string | Date) => {
  const x = new Date(d); const n = new Date()
  return x.getFullYear() === n.getFullYear() && x.getMonth() === n.getMonth() && x.getDate() === n.getDate()
}

beforeAll(async () => {
  app = Fastify()
  await app.register(cookie)
  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
    cookie: { cookieName: 'access_token', signed: false },
  })
  await app.register(tasksRoutes, { prefix: '/tasks' })
  await app.ready()

  const user = await prisma.user.upsert({
    where: { authId: AUTH_ID },
    update: { isActive: true },
    create: { name: 'Test Tasks Core', authId: AUTH_ID },
  })
  userId = user.id
  token = app.jwt.sign({ sub: AUTH_ID })

  const recipient = await prisma.user.upsert({
    where: { authId: RECIPIENT_AUTH_ID },
    update: { isActive: true },
    create: { name: 'Test Tasks Recipient', authId: RECIPIENT_AUTH_ID },
  })
  recipientId = recipient.id
})

afterAll(async () => {
  await prisma.task.deleteMany({ where: { assigneeId: { in: [userId, recipientId] } } })
  await prisma.user.deleteMany({ where: { authId: { in: [AUTH_ID, RECIPIENT_AUTH_ID] } } })
  await app.close()
})

describe('POST /tasks — status', () => {
  it('создаёт задачу сразу в статусе inprogress', async () => {
    const res = await app.inject({
      method: 'POST', url: '/tasks',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'tc-post-status', assigneeId: userId, status: 'inprogress' },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().status).toBe('inprogress')
  })
})

describe('PATCH /tasks/:id — переход в inprogress ставит startDate=сегодня', () => {
  it('backlog со старой датой → inprogress → startDate сегодня', async () => {
    const t = await prisma.task.create({
      data: {
        title: 'tc-patch-inprogress', assignedById: userId, assigneeId: userId,
        status: 'backlog', startDate: new Date('2020-01-01T00:00:00Z'),
      },
      select: { id: true },
    })
    const res = await app.inject({
      method: 'PATCH', url: `/tasks/${t.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: 'inprogress' },
    })
    expect(res.statusCode).toBe(200)
    expect(isToday(res.json().startDate)).toBe(true)
  })

  it('reopen done→inprogress: startDate сегодня и doneAt очищен', async () => {
    const t = await prisma.task.create({
      data: {
        title: 'tc-reopen', assignedById: userId, assigneeId: userId,
        status: 'done', startDate: new Date('2020-01-01T00:00:00Z'), doneAt: new Date('2020-01-02T00:00:00Z'),
      },
      select: { id: true },
    })
    const res = await app.inject({
      method: 'PATCH', url: `/tasks/${t.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: 'inprogress' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().doneAt).toBeNull()
    expect(isToday(res.json().startDate)).toBe(true)
  })
})

describe('PATCH /tasks/reorder — ручной порядок', () => {
  it('ставит manualOrder = индексу в переданном массиве (только своих)', async () => {
    const a = await prisma.task.create({ data: { title: 'ord-a', assignedById: userId, assigneeId: userId, status: 'inprogress', startDate: new Date() }, select: { id: true } })
    const b = await prisma.task.create({ data: { title: 'ord-b', assignedById: userId, assigneeId: userId, status: 'inprogress', startDate: new Date() }, select: { id: true } })
    const res = await app.inject({
      method: 'PATCH', url: '/tasks/reorder',
      headers: { authorization: `Bearer ${token}` },
      payload: { ids: [b.id, a.id] },
    })
    expect(res.statusCode).toBe(204)
    const ra = await prisma.task.findUnique({ where: { id: a.id }, select: { manualOrder: true } })
    const rb = await prisma.task.findUnique({ where: { id: b.id }, select: { manualOrder: true } })
    expect(rb!.manualOrder).toBe(0)
    expect(ra!.manualOrder).toBe(1)
  })
})

describe('PATCH /tasks/:id — переназначение на другого сбрасывает в Бэклог', () => {
  it('inprogress-задача, переназначенная на другого, становится backlog (падает в его пул)', async () => {
    const t = await prisma.task.create({
      data: {
        title: 'tc-reassign', assignedById: userId, assigneeId: userId,
        status: 'inprogress', startDate: new Date(),
      },
      select: { id: true },
    })
    const res = await app.inject({
      method: 'PATCH', url: `/tasks/${t.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { assigneeId: recipientId },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('backlog')
    expect(res.json().assignee.id).toBe(recipientId)
  })
})
