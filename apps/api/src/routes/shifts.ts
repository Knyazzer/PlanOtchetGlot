import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tv-shifts/db'
import { authenticate, requireRole } from '../plugins/auth'
import { logChanges } from '../services/changeLog'

const createShiftSchema = z.object({
  userId: z.string().uuid(),
  projectId: z.string().uuid(),
  assignmentId: z.string().uuid(),
  date: z.string().datetime(),
  shiftType: z.enum(['zastroyka', 'efir', 'demontazh']),
})

export async function shiftsRoutes(app: FastifyInstance) {
  // GET /shifts
  app.get('/', { preHandler: authenticate }, async (request) => {
    const me = request.user as { id: string; role: string }
    const query = request.query as {
      userId?: string
      projectId?: string
      dateFrom?: string
      dateTo?: string
      confirmed?: string
    }

    // Сотрудник видит только свои смены
    const userId = me.role === 'employee' ? me.id : query.userId

    return prisma.shiftEntry.findMany({
      where: {
        ...(userId && { userId }),
        ...(query.projectId && { projectId: query.projectId }),
        ...(query.dateFrom && { date: { gte: new Date(query.dateFrom) } }),
        ...(query.dateTo && { date: { lte: new Date(query.dateTo) } }),
        ...(query.confirmed !== undefined && { confirmed: query.confirmed === 'true' }),
      },
      include: {
        user: { select: { id: true, fullName: true } },
        statusRow: { select: { id: true, name: true, client: true } },
      },
      orderBy: { date: 'asc' },
    })
  })

  // POST /shifts — ручное создание (admin only)
  app.post('/', { preHandler: requireRole('admin') }, async (request, reply) => {
    const body = createShiftSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })
    }

    const shift = await prisma.shiftEntry.create({
      data: {
        ...body.data,
        date: new Date(body.data.date),
        source: 'manual',
      },
    })

    return reply.code(201).send(shift)
  })

  // PATCH /shifts/:id/confirm — подтвердить смену (admin only)
  app.patch('/:id/confirm', { preHandler: requireRole('admin') }, async (request) => {
    const { id } = request.params as { id: string }
    const me = request.user as { id: string }

    const shift = await prisma.shiftEntry.update({
      where: { id },
      data: { confirmed: true, confirmedBy: me.id, confirmedAt: new Date() },
    })

    await logChanges('shift', id, { confirmed: false }, { confirmed: true }, me.id)

    return shift
  })

  // PATCH /shifts/:id — редактирование (admin only)
  app.patch('/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = createShiftSchema.partial().safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })
    }

    const { date, ...rest } = body.data
    const data = { ...rest, ...(date ? { date: new Date(date) } : {}) }

    return prisma.shiftEntry.update({ where: { id }, data })
  })

  // GET /shifts/monthly-summary/:userId/:year/:month
  app.get('/monthly-summary/:userId/:year/:month', { preHandler: authenticate }, async (request, reply) => {
    const { userId, year, month } = request.params as {
      userId: string
      year: string
      month: string
    }
    const me = request.user as { id: string; role: string }

    if (me.role === 'employee' && me.id !== userId) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const y = Number(year)
    const m = Number(month)

    const summary = await prisma.monthlySummary.findUnique({
      where: { userId_year_month: { userId, year: y, month: m } },
    })

    // Если записи нет — считаем на лету
    if (!summary) {
      const start = new Date(y, m - 1, 1)
      const end = new Date(y, m, 0, 23, 59, 59)
      const totalShifts = await prisma.shiftEntry.count({
        where: { userId, date: { gte: start, lte: end }, confirmed: true },
      })
      return { userId, year: y, month: m, totalShifts, threshold: null, overtimeShifts: 0, vacationDays: 0 }
    }

    return summary
  })

  // PATCH /shifts/monthly-summary/:userId/:year/:month/vacation — добавить отпуск (admin)
  app.patch(
    '/monthly-summary/:userId/:year/:month/vacation',
    { preHandler: requireRole('admin') },
    async (request) => {
      const { userId, year, month } = request.params as {
        userId: string; year: string; month: string
      }
      const { vacationDays, workingDays } = request.body as {
        vacationDays: number; workingDays: number
      }
      const me = request.user as { id: string }

      const y = Number(year)
      const m = Number(month)
      const threshold = Math.ceil(workingDays * 16 / 22)

      const totalShifts = await prisma.shiftEntry.count({
        where: {
          userId,
          date: { gte: new Date(y, m - 1, 1), lte: new Date(y, m, 0, 23, 59, 59) },
          confirmed: true,
        },
      })

      return prisma.monthlySummary.upsert({
        where: { userId_year_month: { userId, year: y, month: m } },
        create: {
          userId, year: y, month: m,
          workingDays, threshold, totalShifts,
          overtimeShifts: Math.max(0, totalShifts - threshold),
          vacationDays,
          updatedBy: me.id,
        },
        update: {
          vacationDays,
          workingDays,
          threshold,
          totalShifts,
          overtimeShifts: Math.max(0, totalShifts - threshold),
          updatedBy: me.id,
        },
      })
    }
  )
}
