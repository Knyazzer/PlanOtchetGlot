import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import { prisma } from '@nexus/db'
import { tasksRoutes } from './tasks'
import { boardRoutes } from './board'

// Планирование задач (1.2): новые поля, автокопия план→факт, повторы-экземпляры, личные колонки.

const P = 'test-taskplan'
let app: FastifyInstance
let userId: string
let userToken: string
let divId: string
let deptId: string

beforeAll(async () => {
  app = Fastify()
  await app.register(cookie)
  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
    cookie: { cookieName: 'access_token', signed: false },
  })
  await app.register(tasksRoutes, { prefix: '/tasks' })
  await app.register(boardRoutes, { prefix: '/board' })
  await app.ready()

  const u = await prisma.user.create({ data: { name: `${P}-user`, authId: `${P}-user` } })
  userId = u.id
  const dept = await prisma.department.create({ data: { name: `${P}-dept` } })
  deptId = dept.id
  const div = await prisma.division.create({ data: { deptId, name: `${P}-div` } })
  divId = div.id
  await prisma.userDivision.create({ data: { userId, divId, position: 'спец' } })
  userToken = app.jwt.sign({ sub: u.authId })
})

afterAll(async () => {
  await prisma.task.deleteMany({ where: { assigneeId: userId } })
  await prisma.boardColumn.deleteMany({ where: { userId } })
  await prisma.userDivision.deleteMany({ where: { userId } })
  await prisma.division.delete({ where: { id: divId } })
  await prisma.department.delete({ where: { id: deptId } })
  await prisma.user.delete({ where: { id: userId } })
  await app.close()
})

const auth = () => ({ authorization: `Bearer ${userToken}` })

describe('POST /tasks — новые поля', () => {
  it('создаёт задачу с планированием; divisionId денормализуется из исполнителя', async () => {
    const res = await app.inject({
      method: 'POST', url: '/tasks', headers: auth(),
      payload: {
        title: `${P}-t1`, assigneeId: userId, startDate: '2026-06-15',
        type: 'air', client: 'ПЕРЕКРЕСТОК', plannedMinutes: 45,
      },
    })
    expect(res.statusCode).toBe(201)
    const t = res.json()
    expect(t.type).toBe('air')
    expect(t.client).toBe('ПЕРЕКРЕСТОК')
    expect(t.plannedMinutes).toBe(45)
    expect(t.divisionId).toBe(divId)
  })

  it('400 на неизвестный тип', async () => {
    const res = await app.inject({
      method: 'POST', url: '/tasks', headers: auth(),
      payload: { title: 'x', assigneeId: userId, type: 'unknown' },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('автокопия план→факт при done', () => {
  it('done без факта копирует план в факт и ставит doneAt', async () => {
    const created = await app.inject({
      method: 'POST', url: '/tasks', headers: auth(),
      payload: { title: `${P}-t2`, assigneeId: userId, plannedMinutes: 60 },
    })
    const id = created.json().id
    const res = await app.inject({
      method: 'PATCH', url: `/tasks/${id}`, headers: auth(),
      payload: { status: 'done' },
    })
    expect(res.statusCode).toBe(200)
    const t = res.json()
    expect(t.actualMinutes).toBe(60)
    expect(t.doneAt).toBeTruthy()
  })

  it('явный факт не перезатирается автокопией', async () => {
    const created = await app.inject({
      method: 'POST', url: '/tasks', headers: auth(),
      payload: { title: `${P}-t3`, assigneeId: userId, plannedMinutes: 60 },
    })
    const id = created.json().id
    const res = await app.inject({
      method: 'PATCH', url: `/tasks/${id}`, headers: auth(),
      payload: { status: 'done', actualMinutes: 90 },
    })
    expect(res.json().actualMinutes).toBe(90)
  })
})

describe('повторы-экземпляры (В-2)', () => {
  it('weekdays-серия материализует экземпляры без выходных', async () => {
    // 2026-06-15 — понедельник; до 2026-06-21 (вс) → экземпляры вт-пт = 4
    const res = await app.inject({
      method: 'POST', url: '/tasks', headers: auth(),
      payload: {
        title: `${P}-серия`, assigneeId: userId, startDate: '2026-06-15',
        repeatRule: 'weekdays', repeatUntil: '2026-06-21', plannedMinutes: 30,
      },
    })
    expect(res.statusCode).toBe(201)
    const parent = res.json()
    const instances = await prisma.task.findMany({
      where: { recurringParentId: parent.id },
      orderBy: { startDate: 'asc' },
    })
    expect(instances.length).toBe(4) // вт 16, ср 17, чт 18, пт 19
    expect(instances.every(i => i.plannedMinutes === 30)).toBe(true)
    const days = instances.map(i => i.startDate.getDay())
    expect(days.every(d => d !== 0 && d !== 6)).toBe(true)
  })

  it('repeatRule без repeatUntil → 400', async () => {
    const res = await app.inject({
      method: 'POST', url: '/tasks', headers: auth(),
      payload: { title: 'x', assigneeId: userId, repeatRule: 'daily' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('DELETE ?series=future удаляет будущие незакрытые экземпляры', async () => {
    const created = await app.inject({
      method: 'POST', url: '/tasks', headers: auth(),
      payload: {
        title: `${P}-серия2`, assigneeId: userId, startDate: '2026-07-01',
        repeatRule: 'daily', repeatUntil: '2026-07-05',
      },
    })
    const parent = created.json()
    const before = await prisma.task.count({
      where: { OR: [{ id: parent.id }, { recurringParentId: parent.id }] },
    })
    expect(before).toBe(5) // 1 родитель + 4 экземпляра

    const del = await app.inject({
      method: 'DELETE', url: `/tasks/${parent.id}?series=future`, headers: auth(),
    })
    expect(del.statusCode).toBe(204)
    const after = await prisma.task.count({
      where: { OR: [{ id: parent.id }, { recurringParentId: parent.id }] },
    })
    expect(after).toBe(0)
  })
})

describe('личные колонки /board', () => {
  it('CRUD колонок + размещение задачи', async () => {
    const colRes = await app.inject({
      method: 'POST', url: '/board/columns', headers: auth(),
      payload: { name: 'Пятёрочка' },
    })
    expect(colRes.statusCode).toBe(201)
    const col = colRes.json()

    const task = await app.inject({
      method: 'POST', url: '/tasks', headers: auth(),
      payload: { title: `${P}-place`, assigneeId: userId },
    })
    const taskId = task.json().id

    const place = await app.inject({
      method: 'PUT', url: '/board/placements', headers: auth(),
      payload: { taskId, columnId: col.id, sort: 1 },
    })
    expect(place.statusCode).toBe(200)

    const board = await app.inject({ method: 'GET', url: '/board', headers: auth() })
    const b = board.json()
    expect(b.columns.some((c: any) => c.name === 'Пятёрочка')).toBe(true)
    expect(b.placements.some((p: any) => p.taskId === taskId && p.columnId === col.id)).toBe(true)

    // удаление колонки не удаляет задачу
    const delCol = await app.inject({ method: 'DELETE', url: `/board/columns/${col.id}`, headers: auth() })
    expect(delCol.statusCode).toBe(204)
    const stillThere = await prisma.task.findUnique({ where: { id: taskId } })
    expect(stillThere).toBeTruthy()
  })
})
