import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import { prisma } from '@nexus/db'
import { requestsRoutes } from './requests'

// Заявки: автор создаёт → согласующий (руководитель отдела) одобряет/отклоняет; чужой — 403; автор отменяет.

const AUTHOR_AUTH = 'test-req-author-auth'
const APPROVER_AUTH = 'test-req-approver-auth'
const OTHER_AUTH = 'test-req-other-auth'
const DEPT = 'test-req-dept'
const DIV = 'test-req-div'

let app: FastifyInstance
let authorId = '', approverId = '', otherId = ''
let authorToken = '', approverToken = '', otherToken = ''

beforeAll(async () => {
  app = Fastify()
  await app.register(cookie)
  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
    cookie: { cookieName: 'access_token', signed: false },
  })
  await app.register(requestsRoutes, { prefix: '/requests' })
  await app.ready()

  const approver = await prisma.user.upsert({ where: { authId: APPROVER_AUTH }, update: { isActive: true }, create: { name: 'Test Req Approver', authId: APPROVER_AUTH } })
  const author = await prisma.user.upsert({ where: { authId: AUTHOR_AUTH }, update: { isActive: true }, create: { name: 'Test Req Author', authId: AUTHOR_AUTH } })
  const other = await prisma.user.upsert({ where: { authId: OTHER_AUTH }, update: { isActive: true }, create: { name: 'Test Req Other', authId: OTHER_AUTH } })
  approverId = approver.id; authorId = author.id; otherId = other.id

  // Отдел, где руководитель = approver, а author — участник → согласующий резолвится в approver.
  const dept = await prisma.department.create({ data: { name: DEPT } })
  const div = await prisma.division.create({ data: { name: DIV, deptId: dept.id, headId: approver.id } })
  await prisma.userDivision.create({ data: { userId: author.id, divId: div.id, position: 'member' } })

  authorToken = app.jwt.sign({ sub: AUTHOR_AUTH })
  approverToken = app.jwt.sign({ sub: APPROVER_AUTH })
  otherToken = app.jwt.sign({ sub: OTHER_AUTH })
})

afterAll(async () => {
  await prisma.request.deleteMany({ where: { userId: { in: [authorId, approverId, otherId] } } })
  await prisma.userDivision.deleteMany({ where: { userId: authorId } })
  await prisma.division.deleteMany({ where: { name: DIV } })
  await prisma.department.deleteMany({ where: { name: DEPT } })
  await prisma.user.deleteMany({ where: { authId: { in: [AUTHOR_AUTH, APPROVER_AUTH, OTHER_AUTH] } } })
  await app.close()
})

const hdr = (t: string) => ({ authorization: `Bearer ${t}` })

describe('/requests — гарды и флоу', () => {
  it('401 без токена', async () => {
    const res = await app.inject({ method: 'GET', url: '/requests' })
    expect(res.statusCode).toBe(401)
  })

  it('POST создаёт заявку; согласующий = руководитель отдела', async () => {
    const res = await app.inject({ method: 'POST', url: '/requests', headers: hdr(authorToken),
      payload: { type: 'vacation', dateFrom: '2026-09-01', dateTo: '2026-09-05', comment: 'тест' } })
    expect(res.statusCode).toBe(201)
    const r = res.json()
    expect(r.status).toBe('pending')
    expect(r.approverId ?? r.approver?.id ?? r.approverId).toBe(approverId)
  })

  it('400 на некорректный период (конец раньше начала)', async () => {
    const res = await app.inject({ method: 'POST', url: '/requests', headers: hdr(authorToken),
      payload: { type: 'sick', dateFrom: '2026-09-10', dateTo: '2026-09-01' } })
    expect(res.statusCode).toBe(400)
  })

  it('согласующий видит заявку в inbox', async () => {
    const res = await app.inject({ method: 'GET', url: '/requests?scope=inbox', headers: hdr(approverToken) })
    expect(res.statusCode).toBe(200)
    const list = res.json()
    expect(Array.isArray(list)).toBe(true)
    expect(list.some((r: { userId: string }) => r.userId === authorId)).toBe(true)
  })

  it('чужой не может решить заявку (403), согласующий одобряет (200)', async () => {
    const mine = await app.inject({ method: 'GET', url: '/requests?scope=mine', headers: hdr(authorToken) })
    const id = mine.json().find((r: { status: string }) => r.status === 'pending').id

    const forbidden = await app.inject({ method: 'PATCH', url: `/requests/${id}/decision`, headers: hdr(otherToken), payload: { decision: 'approved' } })
    expect(forbidden.statusCode).toBe(403)

    const ok = await app.inject({ method: 'PATCH', url: `/requests/${id}/decision`, headers: hdr(approverToken), payload: { decision: 'approved' } })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().status).toBe('approved')

    const again = await app.inject({ method: 'PATCH', url: `/requests/${id}/decision`, headers: hdr(approverToken), payload: { decision: 'rejected' } })
    expect(again.statusCode).toBe(400) // уже обработана
  })

  it('автор отменяет свою pending-заявку; чужой не может (403)', async () => {
    const created = await app.inject({ method: 'POST', url: '/requests', headers: hdr(authorToken),
      payload: { type: 'dayoff', dateFrom: '2026-10-01', dateTo: '2026-10-01' } })
    const id = created.json().id

    const byOther = await app.inject({ method: 'PATCH', url: `/requests/${id}/cancel`, headers: hdr(otherToken) })
    expect(byOther.statusCode).toBe(403)

    const byAuthor = await app.inject({ method: 'PATCH', url: `/requests/${id}/cancel`, headers: hdr(authorToken) })
    expect(byAuthor.statusCode).toBe(200)
    expect(byAuthor.json().status).toBe('canceled')
  })
})
