import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tv-shifts/db'
import { authenticate, requireRole } from '../plugins/auth'
import { logChanges } from '../services/changeLog'

const daySchema = z.object({
  id: z.string().optional(),
  date: z.string(),
  type: z.enum(['zastroyka', 'efir']),
  startTime: z.string().nullable().optional(),
})

const createStatusRowSchema = z.object({
  name: z.string().min(1),
  client: z.string().nullable().optional(),
  execProducer: z.string().nullable().optional(),
  lineProducer: z.string().nullable().optional(),
  accountManager: z.string().nullable().optional(),
  efirDate: z.string().nullable().optional(),
  zastroykDate: z.string().nullable().optional(),
  date: z.string().datetime().nullable().optional(),
  dateApproximate: z.string().nullable().optional(),
  time: z.string().nullable().optional(),
  format: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  days: z.array(daySchema).optional(),
})

const updateStatusRowSchema = createStatusRowSchema.partial().extend({
  status: z.enum(['request','negotiation','preproduction','production','postproduction','delivered','rejected','cancelled','manual']).optional(),
  dateConfirmed: z.boolean().optional(),
})

export async function statusRowsRoutes(app: FastifyInstance) {
  // GET /status-rows
  app.get('/', { preHandler: authenticate }, async (request) => {
    const query = request.query as {
      dateFrom?: string
      dateTo?: string
      status?: string
      search?: string
      withSeparators?: string
      slim?: string
    }

    const where = {
      ...(query.withSeparators !== 'true' && { NOT: { source: 'separator' as any } }),
      ...(query.dateFrom && { date: { gte: new Date(query.dateFrom) } }),
      ...(query.dateTo && { date: { lte: new Date(query.dateTo) } }),
      ...(query.status && { status: query.status as any }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { client: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    }

    // slim=true — без join'ов (для страниц которым не нужны вложенные данные)
    if (query.slim === 'true') {
      return prisma.statusRow.findMany({ where, orderBy: { googleRowIndex: 'asc' } })
    }

    return prisma.statusRow.findMany({
      where,
      include: {
        matrixRegistry: true,
        assignments: {
          include: { user: { select: { id: true, fullName: true, role: true } } },
        },
        days: { orderBy: { date: 'asc' } },
      },
      orderBy: { date: 'asc' },
    })
  })

  // GET /status-rows/:id
  app.get('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const row = await prisma.statusRow.findUnique({
      where: { id },
      include: {
        matrixRegistry: true,
        assignments: {
          include: {
            user: { select: { id: true, fullName: true, role: true } },
            shiftEntries: true,
          },
        },
        days: { orderBy: { date: 'asc' } },
      },
    })
    if (!row) return reply.code(404).send({ error: 'StatusRow not found' })
    return row
  })

  // POST /status-rows — ручное создание (admin only)
  app.post('/', { preHandler: requireRole('admin') }, async (request, reply) => {
    const body = createStatusRowSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })
    }

    const { days, efirDate, zastroykDate, ...rowData } = body.data

    const autoDays: { date: Date; type: 'efir' | 'zastroyka' }[] = []
    if (zastroykDate) autoDays.push({ date: new Date(zastroykDate), type: 'zastroyka' })
    if (efirDate)     autoDays.push({ date: new Date(efirDate), type: 'efir' })
    const allDays = autoDays.length > 0 ? autoDays : (days ?? []).map((d) => ({ date: new Date(d.date), type: d.type as 'efir' | 'zastroyka' }))

    const earliestDate = allDays.length > 0
      ? allDays.reduce((min, d) => d.date < min ? d.date : min, allDays[0].date)
      : rowData.date ? new Date(rowData.date) : undefined

    const row = await prisma.statusRow.create({
      data: {
        ...rowData,
        date: earliestDate ?? undefined,
        status: 'manual',
        source: 'manual',
        days: allDays.length > 0
          ? { create: allDays.map((d) => ({ date: d.date, type: d.type, startTime: null })) }
          : undefined,
      },
      include: { days: { orderBy: { date: 'asc' } } },
    })

    return reply.code(201).send(row)
  })

  // PATCH /status-rows/:id
  app.patch('/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const me = request.user as { id: string }
    const body = updateStatusRowSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })
    }

    const before = await prisma.statusRow.findUnique({ where: { id } })
    if (!before) return reply.code(404).send({ error: 'StatusRow not found' })

    const { days, ...rowFields } = body.data
    const data: any = { ...rowFields }
    if (data.date) data.date = new Date(data.date)

    if (days !== undefined) {
      await prisma.projectDay.deleteMany({ where: { projectId: id } })
      if (days.length > 0) {
        await prisma.projectDay.createMany({
          data: days.map((d) => ({
            projectId: id,
            date: new Date(d.date),
            type: d.type,
            startTime: d.startTime ?? null,
          })),
        })
      }
    }

    const row = await prisma.statusRow.update({
      where: { id },
      data,
      include: { days: { orderBy: { date: 'asc' } } },
    })

    await logChanges('status_row', id, before as any, rowFields as any, me.id)

    return row
  })

  // DELETE /status-rows/:id
  app.delete('/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.statusRow.delete({ where: { id } })
    return { ok: true }
  })

  // GET /status-rows/conflicts
  app.get('/conflicts', { preHandler: authenticate }, async (request) => {
    const query = request.query as { dateFrom?: string; dateTo?: string }

    const shifts = await prisma.shiftEntry.findMany({
      where: {
        ...(query.dateFrom && { date: { gte: new Date(query.dateFrom) } }),
        ...(query.dateTo && { date: { lte: new Date(query.dateTo) } }),
      },
      include: {
        user: { select: { id: true, fullName: true } },
        statusRow: { select: { id: true, name: true, client: true } },
      },
      orderBy: [{ userId: 'asc' }, { date: 'asc' }],
    })

    const map = new Map<string, typeof shifts>()
    for (const shift of shifts) {
      const key = `${shift.userId}_${shift.date.toISOString().split('T')[0]}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(shift)
    }

    const conflicts = []
    for (const [, entries] of map) {
      if (entries.length > 1) {
        conflicts.push({
          user: entries[0].user,
          date: entries[0].date,
          shifts: entries.map((e) => ({ shiftId: e.id, statusRow: e.statusRow, shiftType: e.shiftType })),
        })
      }
    }

    return conflicts
  })
}
