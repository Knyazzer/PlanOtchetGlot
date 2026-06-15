import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@nexus/db'
import { getUserAccess, hasModule } from './access'

// КИТ 1+2: модуль выдан департаменту; уровень в иерархии даёт view или edit.

const P = 'test-access'
let deptId: string
let divId: string
let memberId: string
let headId: string
let outsiderId: string

beforeAll(async () => {
  const mk = (n: string) => prisma.user.create({ data: { name: `${P}-${n}`, authId: `${P}-${n}` } }).then(u => u.id)
  memberId = await mk('member')
  headId = await mk('head')
  outsiderId = await mk('outsider')

  const dept = await prisma.department.create({ data: { name: `${P}-dept` } })
  deptId = dept.id
  const div = await prisma.division.create({ data: { deptId, name: `${P}-div`, headId } })
  divId = div.id
  await prisma.userDivision.createMany({
    data: [
      { userId: memberId, divId, position: 'спец' },
      { userId: headId, divId, position: 'рук' },
    ],
  })
  // грант: модуль с editLevel=head — member получает view, head — edit
  await prisma.departmentModule.create({
    data: { deptId, moduleKey: 'fin.budgets', editLevel: 'head' },
  })
  // грант: модуль с editLevel=member — все edit
  await prisma.departmentModule.create({
    data: { deptId, moduleKey: 'hr.absences', editLevel: 'member' },
  })
})

afterAll(async () => {
  await prisma.departmentModule.deleteMany({ where: { deptId } })
  await prisma.userDivision.deleteMany({ where: { divId } })
  await prisma.division.delete({ where: { id: divId } })
  await prisma.department.delete({ where: { id: deptId } })
  await prisma.user.deleteMany({ where: { authId: { startsWith: P } } })
})

describe('getUserAccess', () => {
  it('member: editLevel=head даёт view, editLevel=member даёт edit', async () => {
    const a = await getUserAccess(memberId, false)
    expect(a.modules.find(m => m.key === 'fin.budgets')?.mode).toBe('view')
    expect(a.modules.find(m => m.key === 'hr.absences')?.mode).toBe('edit')
  })

  it('head отдела получает edit на editLevel=head', async () => {
    const a = await getUserAccess(headId, false)
    expect(a.modules.find(m => m.key === 'fin.budgets')?.mode).toBe('edit')
    expect(a.departments.find(d => d.id === deptId)?.level).toBe('head')
  })

  it('пользователь вне департамента модулей не имеет', async () => {
    const a = await getUserAccess(outsiderId, false)
    expect(a.modules.length).toBe(0)
  })
})

describe('hasModule', () => {
  it('edit-требование отсекает view-доступ; view-требование пропускает', async () => {
    expect(await hasModule(memberId, false, 'fin.budgets', 'edit')).toBe(false)
    expect(await hasModule(memberId, false, 'fin.budgets', 'view')).toBe(true)
    expect(await hasModule(headId, false, 'fin.budgets', 'edit')).toBe(true)
    expect(await hasModule(outsiderId, false, 'hr.absences', 'view')).toBe(false)
  })

  it('admin — всегда', async () => {
    expect(await hasModule(outsiderId, true, 'fin.budgets', 'edit')).toBe(true)
  })
})
