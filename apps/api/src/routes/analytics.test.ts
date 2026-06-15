import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import { prisma } from '@nexus/db'
import { analyticsRoutes } from './analytics'
import { businessDays } from '../services/calendarRf'

// Аналитика: формулы донора (часы/баллы/нагрузка) + производственный календарь РФ + RBAC company.

const P = 'test-analytics'
let app: FastifyInstance
let deptId: string
let divId: string
let empId: string
let empToken: string
let outsiderToken: string

beforeAll(async () => {
  app = Fastify()
  await app.register(cookie)
  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
    cookie: { cookieName: 'access_token', signed: false },
  })
  await app.register(analyticsRoutes, { prefix: '/analytics' })
  await app.ready()

  const emp = await prisma.user.create({ data: { name: `${P}-emp`, authId: `${P}-emp`, userType: 'staff' } })
  empId = emp.id
  const outsider = await prisma.user.create({ data: { name: `${P}-out`, authId: `${P}-out`, userType: 'staff' } })
  const dept = await prisma.department.create({ data: { name: `${P}-dept` } })
  deptId = dept.id
  const div = await prisma.division.create({ data: { deptId, name: `${P}-div` } })
  divId = div.id
  await prisma.userDivision.create({ data: { userId: empId, divId, position: 'спец' } })

  await prisma.dayFormatVersion.upsert({
    where: { key_effectiveFrom: { key: 'office', effectiveFrom: new Date('2026-01-01') } },
    update: {},
    create: { key: 'office', label: 'Офис', isWork: true, score: 0, effectiveFrom: new Date('2026-01-01') },
  })
  // день: 09:00-18:00 -60 = 480 минут
  await prisma.dayEntry.create({
    data: { userId: empId, divisionId: divId, date: new Date('2026-06-10'), dayFormat: 'office', startTime: '09:00', endTime: '18:00', breakMin: 60 },
  })
  // задачи: done 120 факт + open 60 план
  await prisma.task.createMany({
    data: [
      { title: `${P}-t1`, assignedById: empId, assigneeId: empId, startDate: new Date('2026-06-10'), status: 'done', actualMinutes: 120 },
      { title: `${P}-t2`, assignedById: empId, assigneeId: empId, startDate: new Date('2026-06-10'), status: 'backlog', plannedMinutes: 60, deadline: new Date('2026-06-10') },
    ],
  })

  empToken = app.jwt.sign({ sub: emp.authId })
  outsiderToken = app.jwt.sign({ sub: outsider.authId })
})

afterAll(async () => {
  await prisma.task.deleteMany({ where: { assigneeId: empId } })
  await prisma.dayEntry.deleteMany({ where: { userId: empId } })
  await prisma.userDivision.deleteMany({ where: { divId } })
  await prisma.division.delete({ where: { id: divId } })
  await prisma.department.delete({ where: { id: deptId } })
  await prisma.user.deleteMany({ where: { authId: { startsWith: P } } })
  await app.close()
})

describe('businessDays (производственный календарь РФ)', () => {
  it('июнь 2026: будни минус День России (12.06 пт)', () => {
    // июнь 2026: 22 будних дня, 12 июня — праздник в пятницу → 21
    expect(businessDays(new Date('2026-06-01'), new Date('2026-06-30'))).toBe(21)
  })
  it('январь 2026: каникулы 1-8 + перенос 9-го', () => {
    // янв 2026: будни пн-пт = 22; минус праздники 1,2,5,6,7,8 (будни) и перенос 9-го = 15
    expect(businessDays(new Date('2026-01-01'), new Date('2026-01-31'))).toBe(15)
  })
})

describe('GET /analytics', () => {
  it('scope=self: часы/баллы/нагрузка по формулам донора', async () => {
    const res = await app.inject({
      method: 'GET', url: '/analytics?from=2026-06-01&to=2026-06-30&scope=self',
      headers: { authorization: `Bearer ${empToken}` },
    })
    expect(res.statusCode).toBe(200)
    const d = res.json()
    const me = d.employees.find((e: { userId: string }) => e.userId === empId)
    expect(me.hours).toBe(8)          // 480 минут плана дня
    expect(me.taskHours).toBe(3)      // 120 + 60 минут задач
    expect(me.loadPct).toBe(38)       // round(180/480×100)
    expect(me.doneTasks).toBe(1)
    expect(me.overdue).toBe(1)        // open с deadline 10.06 — в прошлом
    expect(d.kpi.tasksTotal).toBe(2)
  })

  it('scope=company без права → 403', async () => {
    const res = await app.inject({
      method: 'GET', url: '/analytics?from=2026-06-01&to=2026-06-30&scope=company',
      headers: { authorization: `Bearer ${outsiderToken}` },
    })
    expect(res.statusCode).toBe(403)
  })
})
