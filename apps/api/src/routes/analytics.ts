import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@nexus/db'
import { authenticate } from '../plugins/auth'
import { getOrgScope } from '../services/orgScope'
import { hasModule } from '../services/access'
import { businessDays } from '../services/calendarRf'
import { workMinutes, dayFormatsAt } from './day-entries'

// Аналитика (Этап 2, формулы аудита §6 / golden 12):
// нагрузка = taskMins/planMins; заполненность = workDays/(сотрудники×businessDays РФ);
// баллы = Σ score формата дня; просрочка = !done && deadline < сегодня.
// Охват: self — сам; team — орг-охват (head=отдел, director=департамент);
// company — admin или модуль adm.analytics-company (view).

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scope: z.enum(['self', 'team', 'company']).default('team'),
})

export async function analyticsRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: authenticate }, async (req, reply) => {
    const user = (req as any).user as { id: string; isAdmin: boolean }
    const parsed = querySchema.safeParse(req.query)
    if (!parsed.success) return reply.code(400).send({ error: 'validation', details: parsed.error.flatten() })
    const { from, to, scope } = parsed.data

    const fromD = new Date(from)
    const toD = new Date(to)
    if (fromD > toD) return reply.code(400).send({ error: 'from > to' })

    // охват пользователей: null = вся компания
    let userIds: string[] | null = null
    if (scope === 'self') {
      userIds = [user.id]
    } else if (scope === 'company') {
      const allowed = user.isAdmin || (await hasModule(user.id, false, 'adm.analytics-company', 'view'))
      if (!allowed) return reply.code(403).send({ error: 'Forbidden' })
    } else {
      userIds = user.isAdmin ? null : (await getOrgScope(user.id)).visibleUserIds
    }

    const [users, entries, tasks, formats] = await Promise.all([
      prisma.user.findMany({
        where: { ...(userIds ? { id: { in: userIds } } : {}), isActive: true, userType: 'staff', isSystemAccount: false },
        select: {
          id: true, name: true,
          divMemberships: {
            select: { division: { select: { name: true, department: { select: { name: true } } } } },
            take: 1,
          },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.dayEntry.findMany({
        where: { ...(userIds ? { userId: { in: userIds } } : {}), date: { gte: fromD, lte: toD } },
        select: { userId: true, dayFormat: true, startTime: true, endTime: true, breakMin: true },
      }),
      prisma.task.findMany({
        where: {
          ...(userIds ? { assigneeId: { in: userIds } } : {}),
          startDate: { gte: fromD, lte: new Date(toD.getTime() + 86_399_000) },
          archived: false,
        },
        select: {
          assigneeId: true, status: true, deadline: true,
          plannedMinutes: true, actualMinutes: true,
          calendarEventId: true, // разделяем: задачи (null) vs события календаря (not null)
          client: true, project: { select: { title: true } },
        },
      }),
      dayFormatsAt(toD),
    ])

    const today = new Date()
    type Row = {
      userId: string; name: string; divName: string; deptName: string
      workDays: number; filledDays: number; planMins: number; taskMins: number
      totalTasks: number; doneTasks: number; overdue: number; events: number; score: number
    }
    const rows = new Map<string, Row>()
    for (const u of users) {
      const div = u.divMemberships[0]?.division
      rows.set(u.id, {
        userId: u.id, name: u.name,
        divName: div?.name ?? '—', deptName: div?.department?.name ?? '—',
        workDays: 0, filledDays: 0, planMins: 0, taskMins: 0,
        totalTasks: 0, doneTasks: 0, overdue: 0, events: 0, score: 0,
      })
    }
    for (const e of entries) {
      const r = rows.get(e.userId)
      if (!r) continue
      const fmt = formats.get(e.dayFormat)
      r.filledDays++
      if (fmt?.isWork) {
        r.workDays++
        r.planMins += workMinutes(e)
      }
      if (fmt && typeof fmt.score === 'number') r.score += fmt.score
    }
    for (const t of tasks) {
      const r = rows.get(t.assigneeId)
      if (!r) continue
      if (t.calendarEventId) { r.events++; continue } // календарное событие — отдельный счётчик, не задача
      r.totalTasks++
      r.taskMins += t.actualMinutes ?? t.plannedMinutes ?? 0
      if (t.status === 'done') r.doneTasks++
      else if (t.deadline && t.deadline < today) r.overdue++
    }

    // проекты периода (ключ: проект, иначе клиент — паттерн донора); события в проекты не считаем
    const projAgg = new Map<string, { name: string; count: number; done: number; mins: number; employees: Set<string> }>()
    for (const t of tasks) {
      if (t.calendarEventId) continue
      const key = t.project?.title ?? t.client ?? '—'
      let p = projAgg.get(key)
      if (!p) { p = { name: key, count: 0, done: 0, mins: 0, employees: new Set() }; projAgg.set(key, p) }
      p.count++
      if (t.status === 'done') p.done++
      p.mins += t.actualMinutes ?? t.plannedMinutes ?? 0
      p.employees.add(t.assigneeId)
    }
    const totalProjMins = [...projAgg.values()].reduce((s, p) => s + p.mins, 0)

    const expected = businessDays(fromD, toD) // производственный календарь РФ (В-3)
    const employeeRows = [...rows.values()].map(r => ({
      ...r,
      score: Math.round(r.score * 100) / 100,
      hours: Math.round((r.planMins / 60) * 10) / 10,
      taskHours: Math.round((r.taskMins / 60) * 10) / 10,
      loadPct: r.planMins ? Math.round((r.taskMins / r.planMins) * 100) : null,
    }))

    const totals = employeeRows.reduce(
      (a, r) => ({
        planMins: a.planMins + r.planMins,
        taskMins: a.taskMins + r.taskMins,
        workDays: a.workDays + r.workDays,
        totalTasks: a.totalTasks + r.totalTasks,
        doneTasks: a.doneTasks + r.doneTasks,
        overdue: a.overdue + r.overdue,
        events: a.events + r.events,
        score: a.score + r.score,
      }),
      { planMins: 0, taskMins: 0, workDays: 0, totalTasks: 0, doneTasks: 0, overdue: 0, events: 0, score: 0 },
    )
    const expectedTotal = users.length * expected

    return {
      period: { from, to, businessDays: expected },
      kpi: {
        employees: users.length,
        hours: Math.round((totals.planMins / 60) * 10) / 10,
        taskHours: Math.round((totals.taskMins / 60) * 10) / 10,
        fillPct: expectedTotal ? Math.round((totals.workDays / expectedTotal) * 100) : 0,
        score: Math.round(totals.score * 100) / 100,
        tasksDone: totals.doneTasks,
        tasksTotal: totals.totalTasks,
        overdue: totals.overdue,
        events: totals.events,
      },
      employees: employeeRows,
      projects: [...projAgg.values()]
        .map(p => ({
          name: p.name, count: p.count, done: p.done,
          hours: Math.round((p.mins / 60) * 10) / 10,
          employeeCount: p.employees.size,
          progressPct: p.count ? Math.round((p.done / p.count) * 100) : 0,
          sharePct: totalProjMins ? Math.round((p.mins / totalProjMins) * 100) : 0,
        }))
        .sort((a, b) => b.hours - a.hours),
    }
  })
}
