/**
 * ETL фаза 2: загрузка JSON (scripts/etl/out) в БД Nexus через Prisma.
 * Идемпотентность: перед загрузкой удаляются ранее импортированные записи
 * (Task.legacyId ≠ null; DayEntry/BoardColumn пользователей с legacyEmpId;
 * проекты с алиасом `legacy-id:*`), затем заливка заново.
 * Merge с существующими: User по tabNumber===empId, Department/Division по имени.
 *
 * Запуск (из packages/db): pnpm --filter @nexus/db exec dotenv -e ../../.env -- ts-node ../../scripts/etl/load.ts
 */
import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../../.env') })

import { readFileSync } from 'fs'
import { PrismaClient, Prisma } from '@prisma/client'

const prisma = new PrismaClient()
const OUT = resolve(__dirname, 'out')
const read = <T>(name: string): T => JSON.parse(readFileSync(resolve(OUT, `${name}.json`), 'utf-8'))

type DonorDept = { id: string; name: string }
type DonorDiv = { id: string; name: string; departmentId: string; departmentName?: string }
type DonorEmp = { id: string; name: string; divisionId?: string; departmentId?: string }
type DonorProject = {
  id: string; name: string; client?: string; legacyNames?: string[]
  archived?: boolean; taskCount: number
}
type DonorTask = {
  legacyId: string; title: string; type: string; client: string | null
  donorProjectId: string | null; assigneeEmpId: string; donorDivisionId: string | null
  date: string; deadline: string | null; plannedMinutes: number | null; actualMinutes: number | null
  done: boolean; doneAt: number | string | null; description: string
}
type DonorDay = {
  empId: string; donorDivisionSlug: string; date: string; dayFormat: string
  startTime: string | null; endTime: string | null; breakMin: number
}
type DonorCol = { empId: string; name: string; order: number }

const norm = (s: string) => s.trim().replace(/\s+/g, ' ')

async function main() {
  const departments = read<DonorDept[]>('departments')
  const divisions = read<DonorDiv[]>('divisions')
  const employees = read<DonorEmp[]>('employees')
  const projects = read<DonorProject[]>('projects')
  const tasks = read<DonorTask[]>('tasks')
  const days = read<DonorDay[]>('day_entries')
  const cols = read<DonorCol[]>('board_columns')

  // ── 0. Очистка прежнего импорта (идемпотентность) ────────────────────────────
  console.log('— очистка прежнего импорта…')
  const delTasks = await prisma.task.deleteMany({ where: { legacyId: { not: null } } })
  const legacyUsers = await prisma.user.findMany({ where: { legacyEmpId: { not: null } }, select: { id: true } })
  const legacyUserIds = legacyUsers.map(u => u.id)
  const delDays = await prisma.dayEntry.deleteMany({ where: { userId: { in: legacyUserIds } } })
  const delCols = await prisma.boardColumn.deleteMany({ where: { userId: { in: legacyUserIds } } })
  const legacyAliases = await prisma.projectAlias.findMany({
    where: { name: { startsWith: 'legacy-id:' } }, select: { projectId: true },
  })
  const legacyProjectIds = [...new Set(legacyAliases.map(a => a.projectId))]
  await prisma.projectAlias.deleteMany({ where: { projectId: { in: legacyProjectIds } } })
  const delProjects = await prisma.project.deleteMany({ where: { id: { in: legacyProjectIds } } })
  console.log(`  задач: ${delTasks.count}, дней: ${delDays.count}, колонок: ${delCols.count}, проектов: ${delProjects.count}`)

  // ── 1. Структура: Department / Division (merge по имени) ─────────────────────
  console.log('— структура…')
  const deptMap = new Map<string, string>() // donor slug → nexus id
  for (const d of departments) {
    const name = norm(d.name)
    const existing = await prisma.department.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } })
    const dept = existing ?? (await prisma.department.create({ data: { name } }))
    deptMap.set(d.id, dept.id)
  }
  const divMap = new Map<string, string>() // donor slug → nexus id
  for (const v of divisions) {
    const deptId = deptMap.get(v.departmentId)
    if (!deptId) continue
    const name = norm(v.name)
    const existing = await prisma.division.findFirst({
      where: { deptId, name: { equals: name, mode: 'insensitive' } },
    })
    const div = existing ?? (await prisma.division.create({ data: { deptId, name } }))
    divMap.set(v.id, div.id)
  }
  console.log(`  департаментов: ${deptMap.size}, отделов: ${divMap.size}`)

  // ── 2. Сотрудники: merge по tabNumber === empId (S###) ───────────────────────
  console.log('— сотрудники…')
  const empMap = new Map<string, string>() // empId (S017) → User.id
  let created = 0
  let linked = 0
  for (const e of employees) {
    const name = norm(e.name)
    let user =
      (await prisma.user.findFirst({ where: { tabNumber: e.id } })) ??
      (await prisma.user.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } }))
    if (user) {
      if (user.legacyEmpId !== e.id) {
        await prisma.user.update({ where: { id: user.id }, data: { legacyEmpId: e.id } })
      }
      linked++
    } else {
      user = await prisma.user.create({
        data: { name, legacyEmpId: e.id, tabNumber: e.id, userType: 'staff', isActive: true },
      })
      created++
    }
    empMap.set(e.id, user.id)
    // членство в отделе
    const divId = e.divisionId ? divMap.get(e.divisionId) : undefined
    if (divId) {
      await prisma.userDivision.upsert({
        where: { userId_divId: { userId: user.id, divId } },
        update: {},
        create: { userId: user.id, divId, position: '' },
      })
    }
  }
  console.log(`  связано существующих: ${linked}, создано: ${created}`)

  // ── 3. Клиенты + проекты (+автоархив хвоста: ≤1 задачи → done) ───────────────
  console.log('— проекты…')
  const clientMap = new Map<string, string>()
  const projMap = new Map<string, string>() // donor project id → nexus id
  for (const p of projects) {
    const clientName = norm(p.client ?? '')
    let clientId: string | null = null
    if (clientName) {
      if (!clientMap.has(clientName)) {
        const c = await prisma.client.upsert({
          where: { name: clientName },
          update: {},
          create: { name: clientName },
        })
        clientMap.set(clientName, c.id)
      }
      clientId = clientMap.get(clientName)!
    }
    const status = p.archived || p.taskCount <= 1 ? 'done' : 'active'
    const proj = await prisma.project.create({
      data: { title: norm(p.name) || '(без названия)', clientId, status: status as never },
    })
    projMap.set(p.id, proj.id)
    const aliasNames = new Set<string>([`legacy-id:${p.id}`])
    for (const ln of p.legacyNames ?? []) if (norm(ln)) aliasNames.add(norm(ln))
    await prisma.projectAlias.createMany({
      data: [...aliasNames].map(name => ({ projectId: proj.id, name })),
      skipDuplicates: true,
    })
  }
  console.log(`  проектов: ${projMap.size}, клиентов: ${clientMap.size}`)

  // ── 4. Задачи ─────────────────────────────────────────────────────────────────
  console.log('— задачи…')
  let taskOk = 0
  let taskSkip = 0
  const taskRows: Prisma.TaskCreateManyInput[] = []
  for (const t of tasks) {
    const assigneeId = empMap.get(t.assigneeEmpId)
    if (!assigneeId) { taskSkip++; continue }
    const doneAt =
      t.done && t.doneAt && Number.isFinite(Number(t.doneAt)) ? new Date(Number(t.doneAt)) : null
    taskRows.push({
      title: t.title,
      description: t.description ?? '',
      status: (t.done ? 'done' : 'backlog') as never,
      startDate: new Date(t.date),
      deadline: t.deadline ? new Date(t.deadline) : null,
      assignedById: assigneeId, // донор не хранил автора — само-назначение
      assigneeId,
      type: t.type,
      client: t.client,
      projectId: t.donorProjectId ? projMap.get(t.donorProjectId) ?? null : null,
      divisionId: t.donorDivisionId ? divMap.get(t.donorDivisionId) ?? null : null,
      plannedMinutes: t.plannedMinutes,
      actualMinutes: t.actualMinutes,
      doneAt,
      legacyId: t.legacyId,
    })
    taskOk++
  }
  // createMany чанками — быстрее в ~50 раз, чем по одной
  for (let i = 0; i < taskRows.length; i += 500) {
    await prisma.task.createMany({ data: taskRows.slice(i, i + 500), skipDuplicates: true })
  }
  console.log(`  задач: ${taskOk} (пропущено без исполнителя: ${taskSkip})`)

  // ── 5. Дни ────────────────────────────────────────────────────────────────────
  console.log('— дни…')
  let dayOk = 0
  let daySkip = 0
  const dayRows: Prisma.DayEntryCreateManyInput[] = []
  const seenDay = new Set<string>()
  for (const d of days) {
    const userId = empMap.get(d.empId)
    if (!userId) { daySkip++; continue }
    const key = `${userId}:${d.date}`
    if (seenDay.has(key)) { daySkip++; continue } // дубль дня из двух отделов — берём первый
    seenDay.add(key)
    dayRows.push({
      userId,
      divisionId: divMap.get(d.donorDivisionSlug) ?? null,
      date: new Date(d.date),
      dayFormat: d.dayFormat,
      startTime: d.startTime,
      endTime: d.endTime,
      breakMin: d.breakMin,
    })
    dayOk++
  }
  for (let i = 0; i < dayRows.length; i += 500) {
    await prisma.dayEntry.createMany({ data: dayRows.slice(i, i + 500), skipDuplicates: true })
  }
  console.log(`  дней: ${dayOk} (пропущено: ${daySkip})`)

  // ── 6. Личные колонки ─────────────────────────────────────────────────────────
  console.log('— личные колонки…')
  let colOk = 0
  for (const c of cols) {
    const userId = empMap.get(c.empId)
    if (!userId) continue
    await prisma.boardColumn.create({ data: { userId, name: c.name, order: c.order } })
    colOk++
  }
  console.log(`  колонок: ${colOk}`)

  // ── 7. Валидация ─────────────────────────────────────────────────────────────
  const [nTasks, nDays, nUsers, nProjects] = await Promise.all([
    prisma.task.count({ where: { legacyId: { not: null } } }),
    prisma.dayEntry.count(),
    prisma.user.count({ where: { legacyEmpId: { not: null } } }),
    prisma.project.count(),
  ])
  const sumMinutes = await prisma.task.aggregate({
    where: { legacyId: { not: null } },
    _sum: { plannedMinutes: true, actualMinutes: true },
  })
  console.log('\n=== ВАЛИДАЦИЯ ===')
  console.log(`задач (legacy): ${nTasks} | дней: ${nDays} | пользователей с legacyEmpId: ${nUsers} | проектов: ${nProjects}`)
  console.log(`Σ plannedMinutes: ${sumMinutes._sum.plannedMinutes} | Σ actualMinutes: ${sumMinutes._sum.actualMinutes}`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
