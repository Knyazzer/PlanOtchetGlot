import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import { prisma } from '@nexus/db'
import { dayEntriesRoutes, workMinutes } from './day-entries'
import { svodRoutes } from './svod'

// День/Свод: upsert своего дня, период, формула workMinutes, агрегаты свода, RBAC.

const P = 'test-dayentry'
let app: FastifyInstance
let deptId: string
let divId: string
let headId: string
let empId: string
let outsiderId: string
let headToken: string
let empToken: string
let outsiderToken: string
let adminToken: string

beforeAll(async () => {
  app = Fastify()
  await app.register(cookie)
  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
    cookie: { cookieName: 'access_token', signed: false },
  })
  await app.register(dayEntriesRoutes, { prefix: '/day-entries' })
  await app.register(svodRoutes, { prefix: '/svod' })
  await app.ready()

  const mk = (n: string) =>
    prisma.user.create({ data: { name: `${P}-${n}`, authId: `${P}-${n}` } })
  const head = await mk('head')
  const emp = await mk('emp')
  const outsider = await mk('outsider')
  headId = head.id
  empId = emp.id
  outsiderId = outsider.id

  const dept = await prisma.department.create({ data: { name: `${P}-dept` } })
  deptId = dept.id
  const div = await prisma.division.create({ data: { deptId, name: `${P}-div`, headId } })
  divId = div.id
  await prisma.userDivision.createMany({
    data: [
      { userId: empId, divId, position: 'спец' },
      { userId: headId, divId, position: 'рук' },
    ],
  })

  // формат на случай пустой тест-БД (сид мог не запускаться)
  await prisma.dayFormatVersion.upsert({
    where: { key_effectiveFrom: { key: 'office', effectiveFrom: new Date('2026-01-01') } },
    update: {},
    create: { key: 'office', label: 'Офис', isWork: true, score: 0, effectiveFrom: new Date('2026-01-01') },
  })
  await prisma.dayFormatVersion.upsert({
    where: { key_effectiveFrom: { key: 'vacation', effectiveFrom: new Date('2026-01-01') } },
    update: {},
    create: { key: 'vacation', label: 'Отпуск', isWork: false, score: 0.55, effectiveFrom: new Date('2026-01-01') },
  })

  const admin = await prisma.user.create({ data: { name: `${P}-admin`, authId: `${P}-admin`, isAdmin: true } })

  headToken = app.jwt.sign({ sub: head.authId })
  empToken = app.jwt.sign({ sub: emp.authId })
  outsiderToken = app.jwt.sign({ sub: outsider.authId })
  adminToken = app.jwt.sign({ sub: admin.authId })
})

afterAll(async () => {
  await prisma.dayEntry.deleteMany({ where: { userId: { in: [empId, headId, outsiderId] } } })
  await prisma.dayFormatVersion.deleteMany({ where: { key: { in: ['test_unused', 'test_used'] } } })
  await prisma.task.deleteMany({ where: { assigneeId: { in: [empId, headId] } } })
  await prisma.userDivision.deleteMany({ where: { divId } })
  await prisma.division.delete({ where: { id: divId } })
  await prisma.department.delete({ where: { id: deptId } })
  await prisma.user.deleteMany({ where: { authId: { startsWith: P } } })
  await app.close()
})

describe('workMinutes (формула донора)', () => {
  it('end − start − break, не меньше нуля', () => {
    expect(workMinutes({ startTime: '09:00', endTime: '18:00', breakMin: 60 })).toBe(480)
    expect(workMinutes({ startTime: '10:00', endTime: '10:00', breakMin: 0 })).toBe(0)
    // ночная смена (переход через полночь): конец на след. сутки
    expect(workMinutes({ startTime: '20:00', endTime: '04:00', breakMin: 0 })).toBe(480)   // 8ч
    expect(workMinutes({ startTime: '22:00', endTime: '06:00', breakMin: 30 })).toBe(450)  // 7ч30м
    expect(workMinutes({ startTime: null, endTime: '18:00' })).toBe(0)
  })
})

describe('PUT /day-entries', () => {
  it('создаёт и обновляет свой день; divisionId снапшотится', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/day-entries',
      headers: { authorization: `Bearer ${empToken}` },
      payload: { date: '2026-06-10', dayFormat: 'office', startTime: '09:00', endTime: '18:00', breakMin: 60 },
    })
    expect(res.statusCode).toBe(200)
    const entry = res.json()
    expect(entry.divisionId).toBe(divId)

    const upd = await app.inject({
      method: 'PUT', url: '/day-entries',
      headers: { authorization: `Bearer ${empToken}` },
      payload: { date: '2026-06-10', dayFormat: 'office', startTime: '10:00', endTime: '19:00', breakMin: 30 },
    })
    expect(upd.statusCode).toBe(200)
    expect(upd.json().startTime).toBe('10:00')
  })

  it('400 на неизвестный формат', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/day-entries',
      headers: { authorization: `Bearer ${empToken}` },
      payload: { date: '2026-06-10', dayFormat: 'gigashift' },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('POST /day-entries/apply-period', () => {
  it('применяет формат на диапазон, keepFilled не трогает заполненные', async () => {
    const res = await app.inject({
      method: 'POST', url: '/day-entries/apply-period',
      headers: { authorization: `Bearer ${empToken}` },
      payload: { from: '2026-06-09', to: '2026-06-11', dayFormat: 'vacation', keepFilled: true },
    })
    expect(res.statusCode).toBe(200)
    // 10-е уже заполнено office → skipped
    expect(res.json()).toEqual({ applied: 2, skipped: 1 })
  })
})

describe('GET /day-entries — охват', () => {
  it('чужие дни не видны постороннему (403), видны руководителю отдела', async () => {
    const forbidden = await app.inject({
      method: 'GET', url: `/day-entries?from=2026-06-01&to=2026-06-30&userId=${empId}`,
      headers: { authorization: `Bearer ${outsiderToken}` },
    })
    expect(forbidden.statusCode).toBe(403)

    const ok = await app.inject({
      method: 'GET', url: `/day-entries?from=2026-06-01&to=2026-06-30&userId=${empId}`,
      headers: { authorization: `Bearer ${headToken}` },
    })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().length).toBeGreaterThanOrEqual(3)
  })
})

describe('GET /svod', () => {
  it('агрегирует часы/баллы/задачи; чужому отделу — 403', async () => {
    await prisma.task.create({
      data: {
        title: `${P}-task`, assignedById: headId, assigneeId: empId,
        startDate: new Date('2026-06-10'), status: 'done',
        plannedMinutes: 45, actualMinutes: 45, divisionId: divId,
      },
    })

    const res = await app.inject({
      method: 'GET', url: `/svod?divisionId=${divId}&month=2026-06`,
      headers: { authorization: `Bearer ${headToken}` },
    })
    expect(res.statusCode).toBe(200)
    const svod = res.json()
    expect(svod.daysInMonth).toBe(30)
    const empRow = svod.rows.find((r: any) => r.user.id === empId)
    expect(empRow).toBeTruthy()
    // 10-е: office 10:00-19:00 -30 = 510 минут работы; задача 45 минут done
    expect(empRow.cells['2026-06-10'].workMinutes).toBe(510)
    expect(empRow.cells['2026-06-10'].taskCount).toBe(1)
    expect(empRow.cells['2026-06-10'].tasksDone).toBe(1)
    expect(empRow.cells['2026-06-10'].taskMinutes).toBe(45)
    // подвал: 510 минут = 8.5ч; баллы: office 0 + vacation 0.55×2 = 1.1; задачи 1/1
    expect(empRow.totals.hours).toBe(8.5)
    expect(empRow.totals.score).toBe(1.1)
    expect(empRow.totals.tasksDone).toBe(1)
    expect(empRow.totals.filledDays).toBe(3)

    const forbidden = await app.inject({
      method: 'GET', url: `/svod?divisionId=${divId}&month=2026-06`,
      headers: { authorization: `Bearer ${outsiderToken}` },
    })
    expect(forbidden.statusCode).toBe(403)
  })
})

describe('DELETE /day-entries/formats/:key — умное удаление', () => {
  it('неиспользуемый формат удаляется полностью (admin)', async () => {
    const created = await app.inject({
      method: 'POST', url: '/day-entries/formats',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { key: 'test_unused', label: 'Тест неисп', isWork: true, score: 1 },
    })
    expect(created.statusCode).toBe(201)

    const del = await app.inject({
      method: 'DELETE', url: '/day-entries/formats/test_unused',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(del.statusCode).toBe(200)
    expect(del.json()).toEqual({ deleted: true, key: 'test_unused' })
    expect(await prisma.dayFormatVersion.count({ where: { key: 'test_unused' } })).toBe(0)
  })

  it('используемый формат снимается с использования (retire), история цела', async () => {
    const created = await app.inject({
      method: 'POST', url: '/day-entries/formats',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { key: 'test_used', label: 'Тест исп', isWork: true, score: 2 },
    })
    expect(created.statusCode).toBe(201)

    // проставляем формат в день сотрудника напрямую (минуя валидацию PUT)
    await prisma.dayEntry.create({
      data: { userId: empId, divisionId: divId, date: new Date('2026-06-12'), dayFormat: 'test_used' },
    })

    const del = await app.inject({
      method: 'DELETE', url: '/day-entries/formats/test_used',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(del.statusCode).toBe(200)
    const body = del.json()
    expect(body.retired).toBe(true)
    expect(body.usedBy).toBeGreaterThanOrEqual(1)

    // версия осталась, но active=false
    const versions = await prisma.dayFormatVersion.findMany({ where: { key: 'test_used' } })
    expect(versions.length).toBeGreaterThanOrEqual(1)
    expect(versions.every(v => v.active === false)).toBe(true)

    // в выборке (GET /formats) снятого формата нет
    const list = await app.inject({
      method: 'GET', url: '/day-entries/formats',
      headers: { authorization: `Bearer ${empToken}` },
    })
    expect(list.json().some((f: any) => f.key === 'test_used')).toBe(false)
  })

  it('не-админу удаление запрещено (403)', async () => {
    const res = await app.inject({
      method: 'DELETE', url: '/day-entries/formats/office',
      headers: { authorization: `Bearer ${empToken}` },
    })
    expect(res.statusCode).toBe(403)
  })
})
