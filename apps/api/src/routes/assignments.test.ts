import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import { prisma } from '@nexus/db'
import { usersRoutes } from './users'

// PUT /users/:id/assignments — назначение роли/места в оргструктуре (каскад «Персонала»).
// Спека: docs/superpowers/specs/2026-07-11-personnel-role-form-design.md

const P = 'test-assign'
let app: FastifyInstance
let adminToken: string
let plainToken: string
let deptId: string, v1: string, v2: string
let targetId: string, otherHeadId: string

const auth = (t: string) => ({ authorization: `Bearer ${t}` })
type InjectResp = { statusCode: number; json: () => any }
const put = (uid: string, payload: any, token = adminToken) =>
  app.inject({ method: 'PUT', url: `/users/${uid}/assignments`, headers: auth(token), payload }) as unknown as Promise<InjectResp>

beforeAll(async () => {
  app = Fastify()
  await app.register(cookie)
  await app.register(jwt, { secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production', cookie: { cookieName: 'access_token', signed: false } })
  await app.register(usersRoutes, { prefix: '/users' })
  await app.ready()

  const admin = await prisma.user.create({ data: { name: `${P}-admin`, authId: `${P}-admin`, isAdmin: true } })
  const plain = await prisma.user.create({ data: { name: `${P}-plain`, authId: `${P}-plain` } })
  const target = await prisma.user.create({ data: { name: `${P}-target`, authId: `${P}-target` } })
  const otherHead = await prisma.user.create({ data: { name: `${P}-otherhead`, authId: `${P}-otherhead` } })
  adminToken = app.jwt.sign({ sub: admin.authId })
  plainToken = app.jwt.sign({ sub: plain.authId })
  targetId = target.id
  otherHeadId = otherHead.id

  const dept = await prisma.department.create({ data: { name: `${P}-dept` } })
  deptId = dept.id
  v1 = (await prisma.division.create({ data: { name: `${P}-v1`, deptId } })).id
  v2 = (await prisma.division.create({ data: { name: `${P}-v2`, deptId, headId: otherHeadId } })).id  // v2 занят otherHead
})

afterAll(async () => {
  await prisma.division.updateMany({ where: { id: { in: [v1, v2] } }, data: { headId: null } })
  await prisma.department.updateMany({ where: { id: deptId }, data: { directorId: null } })
  await prisma.userDivision.deleteMany({ where: { divId: { in: [v1, v2] } } })
  await prisma.division.deleteMany({ where: { deptId } })
  await prisma.department.deleteMany({ where: { id: deptId } })
  await prisma.user.deleteMany({ where: { authId: { startsWith: P } } })
  await app.close()
})

describe('PUT /users/:id/assignments', () => {
  it('403 для не-admin без hr.orgstructure', async () => {
    const res = await put(targetId, { assignments: [{ type: 'member', deptId, divId: v1 }] }, plainToken)
    expect(res.statusCode).toBe(403)
    expect(res.json().module).toBe('hr.orgstructure')
  })

  it('member: создаёт UserDivision + синкает плоские поля', async () => {
    const res = await put(targetId, { assignments: [{ type: 'member', deptId, divId: v1, specialization: 'Монтажёр' }] })
    expect(res.statusCode).toBe(200)
    const ud = await prisma.userDivision.findUnique({ where: { userId_divId: { userId: targetId, divId: v1 } } })
    expect(ud?.position).toBe('Монтажёр')
    const u = await prisma.user.findUnique({ where: { id: targetId }, select: { department: true, subDept: true, position: true } })
    expect(u).toMatchObject({ department: `${P}-dept`, subDept: `${P}-v1`, position: 'Монтажёр' })
  })

  it('head: ставит Division.headId + создаёт членство (решение C)', async () => {
    const res = await put(targetId, { assignments: [{ type: 'head', deptId, divId: v1 }] })
    expect(res.statusCode).toBe(200)
    const div = await prisma.division.findUnique({ where: { id: v1 }, select: { headId: true } })
    expect(div?.headId).toBe(targetId)
    const ud = await prisma.userDivision.findUnique({ where: { userId_divId: { userId: targetId, divId: v1 } } })
    expect(ud?.position).toBe('Руководитель отдела')
  })

  it('director: ставит directorId, UserDivision не создаёт', async () => {
    const res = await put(targetId, { assignments: [{ type: 'director', deptId }] })
    expect(res.statusCode).toBe(200)
    const dept = await prisma.department.findUnique({ where: { id: deptId }, select: { directorId: true } })
    expect(dept?.directorId).toBe(targetId)
    const uds = await prisma.userDivision.count({ where: { userId: targetId } })
    expect(uds).toBe(0)  // head-членство v1 снято реконсиляцией
  })

  it('director + divId → 400', async () => {
    const res = await put(targetId, { assignments: [{ type: 'director', deptId, divId: v1 }] })
    expect(res.statusCode).toBe(400)
  })

  it('занятый head-слот без replace → 409, с replace → старый head теряет headId', async () => {
    const conflict = await put(targetId, { assignments: [{ type: 'head', deptId, divId: v2 }] })
    expect(conflict.statusCode).toBe(409)
    expect(conflict.json()).toMatchObject({ error: 'slot_taken', slot: 'head', currentUserId: otherHeadId })

    const ok = await put(targetId, { assignments: [{ type: 'head', deptId, divId: v2 }], replace: true })
    expect(ok.statusCode).toBe(200)
    const div = await prisma.division.findUnique({ where: { id: v2 }, select: { headId: true } })
    expect(div?.headId).toBe(targetId)
  })

  it('совмещение: 2 назначения → обе связи; удаление одного снимает связь', async () => {
    const both = await put(targetId, { assignments: [
      { type: 'member', deptId, divId: v1, specialization: 'X' },
      { type: 'member', deptId, divId: v2 },
    ] })
    expect(both.statusCode).toBe(200)
    expect(await prisma.userDivision.count({ where: { userId: targetId } })).toBe(2)
    // v2 больше не под head'ом target (тип member, не head)
    expect((await prisma.division.findUnique({ where: { id: v2 }, select: { headId: true } }))?.headId).toBeNull()

    const one = await put(targetId, { assignments: [{ type: 'member', deptId, divId: v1 }] })
    expect(one.statusCode).toBe(200)
    expect(await prisma.userDivision.count({ where: { userId: targetId } })).toBe(1)
    expect(await prisma.userDivision.findUnique({ where: { userId_divId: { userId: targetId, divId: v2 } } })).toBeNull()
  })
})
