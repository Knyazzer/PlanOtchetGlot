import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@nexus/db'
import { authenticate } from '../plugins/auth'
import { getOrgScope } from '../services/orgScope'
import { workMinutes, dayFormatsAt } from './day-entries'

// Свод (План/Отчёт): месячная сетка день × сотрудник по подразделению.
// Видимость (Q-SVOD-2): head — свой отдел, director — отделы департамента, admin — все.
// Ячейка: формат дня + workMinutes + задачи (кол-во/минуты). Подвал: часы/баллы/задачи.
// Модель «окно» [startDate, deadline] (решения по «окну», 2026-08): задача — только визуал в
// нескольких днях; в «факт» Свода попадает РОВНО ОДИН РАЗ — в день закрытия (Task.doneAt), а не
// startDate, иначе двойной счёт при переносе дедлайна. Незакрытая задача в факт не попадает.

const querySchema = z.object({
  divisionId: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/), // YYYY-MM
})

export async function svodRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: authenticate }, async (req, reply) => {
    const user = (req as any).user as { id: string; isAdmin: boolean }
    const parsed = querySchema.safeParse(req.query)
    if (!parsed.success) return reply.code(400).send({ error: 'validation', details: parsed.error.flatten() })
    const { divisionId, month } = parsed.data

    const division = await prisma.division.findUnique({
      where: { id: divisionId },
      select: { id: true, name: true, deptId: true, headId: true },
    })
    if (!division) return reply.code(404).send({ error: 'Division not found' })

    // RBAC: admin — всё; head — свои отделы; director — отделы своего департамента.
    // Member видит свод своего отдела read-only (Q-SVOD-2: «сотрудник видит свой отдел»).
    if (!user.isAdmin) {
      const scope = await getOrgScope(user.id)
      const isMyDivision = scope.divisionIds.includes(divisionId)
      const isMyDeptAsDirector = scope.directorDeptIds.includes(division.deptId)
      if (!isMyDivision && !isMyDeptAsDirector) return reply.code(403).send({ error: 'Forbidden' })
    }

    const monthStart = new Date(`${month}-01`)
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0) // последний день
    const daysInMonth = monthEnd.getDate()

    const members = await prisma.userDivision.findMany({
      where: { divId: divisionId },
      select: { user: { select: { id: true, name: true, isActive: true } }, position: true },
      orderBy: { user: { name: 'asc' } },
    })
    const userIds = members.filter(m => m.user.isActive).map(m => m.user.id)

    const [entries, tasks, formats] = await Promise.all([
      prisma.dayEntry.findMany({
        where: { userId: { in: userIds }, date: { gte: monthStart, lte: monthEnd } },
        select: { userId: true, date: true, dayFormat: true, startTime: true, endTime: true, breakMin: true },
      }),
      prisma.task.findMany({
        where: {
          assigneeId: { in: userIds },
          status: 'done',
          doneAt: { gte: monthStart, lte: new Date(monthEnd.getTime() + 86_399_000) },
          archived: false,
        },
        select: { assigneeId: true, doneAt: true, plannedMinutes: true, actualMinutes: true },
      }),
      dayFormatsAt(monthEnd),
    ])

    const dateKey = (d: Date) => d.toISOString().slice(0, 10)

    type Cell = {
      dayFormat: string | null
      workMinutes: number
      taskCount: number
      taskMinutes: number
      tasksDone: number
    }
    const rows = members
      .filter(m => m.user.isActive)
      .map(m => {
        const cells: Record<string, Cell> = {}
        for (let d = 1; d <= daysInMonth; d++) {
          const key = `${month}-${String(d).padStart(2, '0')}`
          cells[key] = { dayFormat: null, workMinutes: 0, taskCount: 0, taskMinutes: 0, tasksDone: 0 }
        }
        for (const e of entries.filter(e => e.userId === m.user.id)) {
          const key = dateKey(e.date)
          if (!cells[key]) continue
          cells[key].dayFormat = e.dayFormat
          cells[key].workMinutes = workMinutes(e)
        }
        for (const t of tasks.filter(t => t.assigneeId === m.user.id)) {
          const key = dateKey(t.doneAt!)
          if (!cells[key]) continue
          cells[key].taskCount++
          // минуты дня: факт, иначе план (автокопия план→факт при done — на стороне tasks)
          cells[key].taskMinutes += t.actualMinutes ?? t.plannedMinutes ?? 0
          cells[key].tasksDone++
        }

        // Подвал по сотруднику: часы / баллы / задачи (Q-SVOD-1)
        let totalWorkMinutes = 0
        let score = 0
        let taskTotal = 0
        let taskDone = 0
        let filledDays = 0
        for (const c of Object.values(cells)) {
          totalWorkMinutes += c.workMinutes
          taskTotal += c.taskCount
          taskDone += c.tasksDone
          if (c.dayFormat) {
            filledDays++
            const f = formats.get(c.dayFormat)
            if (f && typeof f.score === 'number') score += f.score
          }
        }
        return {
          user: { id: m.user.id, name: m.user.name, position: m.position },
          cells,
          totals: {
            workMinutes: totalWorkMinutes,
            hours: Math.round((totalWorkMinutes / 60) * 10) / 10,
            score: Math.round(score * 100) / 100,
            tasksDone: taskDone,
            tasksTotal: taskTotal,
            filledDays,
          },
        }
      })

    return {
      division: { id: division.id, name: division.name },
      month,
      daysInMonth,
      formats: [...formats.values()].map(f => ({ key: f.key, label: f.label, isWork: f.isWork, score: f.score })),
      rows,
    }
  })
}
