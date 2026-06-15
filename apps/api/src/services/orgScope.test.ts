import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@nexus/db'
import { getOrgScope } from './orgScope'

// Орг-уровень и охват видимости — производные от структуры (research/20 §1-2).

const P = 'test-orgscope' // префикс изоляции
let deptId: string
let divAId: string
let divBId: string
let director: string
let headA: string
let memberA1: string
let memberA2: string
let memberB1: string
let loner: string

beforeAll(async () => {
  const mk = (n: string) =>
    prisma.user.create({ data: { name: `${P}-${n}`, authId: `${P}-${n}` } }).then(u => u.id)
  director = await mk('director')
  headA = await mk('headA')
  memberA1 = await mk('memberA1')
  memberA2 = await mk('memberA2')
  memberB1 = await mk('memberB1')
  loner = await mk('loner')

  const dept = await prisma.department.create({ data: { name: `${P}-dept`, directorId: director } })
  deptId = dept.id
  const divA = await prisma.division.create({ data: { deptId, name: `${P}-divA`, headId: headA } })
  divAId = divA.id
  const divB = await prisma.division.create({ data: { deptId, name: `${P}-divB` } })
  divBId = divB.id

  await prisma.userDivision.createMany({
    data: [
      { userId: headA, divId: divAId, position: 'руководитель' },
      { userId: memberA1, divId: divAId, position: 'спец' },
      { userId: memberA2, divId: divAId, position: 'спец' },
      { userId: memberB1, divId: divBId, position: 'спец' },
    ],
  })
})

afterAll(async () => {
  await prisma.userDivision.deleteMany({ where: { divId: { in: [divAId, divBId] } } })
  await prisma.division.deleteMany({ where: { deptId } })
  await prisma.department.delete({ where: { id: deptId } })
  await prisma.user.deleteMany({ where: { authId: { startsWith: P } } })
})

describe('getOrgScope', () => {
  it('member видит только себя', async () => {
    const s = await getOrgScope(memberA1)
    expect(s.level).toBe('member')
    expect(s.visibleUserIds).toEqual([memberA1])
  })

  it('пользователь вне структуры — member с охватом self', async () => {
    const s = await getOrgScope(loner)
    expect(s.level).toBe('member')
    expect(s.visibleUserIds).toEqual([loner])
  })

  it('head видит свой отдел, но не соседний', async () => {
    const s = await getOrgScope(headA)
    expect(s.level).toBe('head')
    expect(new Set(s.visibleUserIds)).toEqual(new Set([headA, memberA1, memberA2]))
    expect(s.visibleUserIds).not.toContain(memberB1)
  })

  it('director видит весь департамент (оба отдела + руководителей)', async () => {
    const s = await getOrgScope(director)
    expect(s.level).toBe('director')
    expect(new Set(s.visibleUserIds)).toEqual(
      new Set([director, headA, memberA1, memberA2, memberB1]),
    )
  })
})
