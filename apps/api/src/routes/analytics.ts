import { FastifyInstance } from 'fastify'
import { prisma } from '@tv-shifts/db'
import { requirePermission } from '../config/permissions'

export async function analyticsRoutes(app: FastifyInstance) {
  // GET /analytics/shifts — смены по сотрудникам за период
  app.get('/shifts', { preHandler: requirePermission('analytics:read') }, async (request) => {
    const query = request.query as { dateFrom?: string; dateTo?: string; userId?: string }

    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    const dateTo = query.dateTo ? new Date(query.dateTo) : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59)

    const shifts = await prisma.shiftEntry.findMany({
      where: {
        date: { gte: dateFrom, lte: dateTo },
        ...(query.userId && { userId: query.userId }),
      },
      include: {
        user: { select: { id: true, fullName: true, tabNumber: true } },
        statusRow: { select: { id: true, name: true, client: true } },
      },
      orderBy: [{ userId: 'asc' }, { date: 'asc' }],
    })

    // Группируем по пользователю
    const byUser = new Map<string, {
      user: { id: string; fullName: string; tabNumber: string | null }
      total: number
      confirmed: number
      byType: Record<string, number>
      projects: Set<string>
    }>()

    for (const shift of shifts) {
      const uid = shift.userId
      if (!byUser.has(uid)) {
        byUser.set(uid, {
          user: shift.user,
          total: 0,
          confirmed: 0,
          byType: { zastroyka: 0, efir: 0, demontazh: 0 },
          projects: new Set(),
        })
      }
      const entry = byUser.get(uid)!
      entry.total++
      if (shift.confirmed) entry.confirmed++
      entry.byType[shift.shiftType] = (entry.byType[shift.shiftType] ?? 0) + 1
      entry.projects.add(shift.statusRow.id)
    }

    return [...byUser.values()].map((e) => ({
      ...e,
      projects: e.projects.size,
    }))
  })

  // GET /analytics/projects — проекты с составом команды за период
  app.get('/projects', { preHandler: requirePermission('analytics:read') }, async (request) => {
    const query = request.query as { dateFrom?: string; dateTo?: string }

    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    const dateTo = query.dateTo ? new Date(query.dateTo) : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59)

    return prisma.statusRow.findMany({
      where: {
        date: { gte: dateFrom, lte: dateTo },
      },
      include: {
        assignments: {
          include: { user: { select: { id: true, fullName: true } } },
        },
        _count: { select: { shiftEntries: true } },
      },
      orderBy: { date: 'asc' },
    })
  })

  // GET /analytics/tasks — задачи с исполнителями
  app.get('/tasks', { preHandler: requirePermission('analytics:read') }, async () => {
    const tasks = await prisma.task.findMany({
      include: {
        creator: { select: { id: true, fullName: true } },
        taskAssignments: {
          include: { user: { select: { id: true, fullName: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const open = tasks.filter((t) => t.status === 'open').length
    const inProgress = tasks.filter((t) => t.status === 'in_progress').length
    const done = tasks.filter((t) => t.status === 'done').length

    return { tasks, summary: { open, inProgress, done, total: tasks.length } }
  })
}
