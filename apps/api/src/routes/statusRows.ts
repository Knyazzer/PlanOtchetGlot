import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { Prisma, prisma } from '@tv-shifts/db'
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
  date: z.string().nullable().optional(),
  dateApproximate: z.string().nullable().optional(),
  time: z.string().nullable().optional(),
  format: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  postProduction: z.string().nullable().optional(),
  matrixRegistryId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.enum(['request','negotiation','preproduction','production','postproduction','delivered','rejected','cancelled','manual']).optional(),
  days: z.array(daySchema).optional(),
})

const updateStatusRowSchema = createStatusRowSchema.partial().extend({
  status:          z.enum(['request','negotiation','preproduction','production','postproduction','delivered','rejected','cancelled','manual']).optional(),
  dateConfirmed:   z.boolean().optional(),
  matrixRegistryId: z.string().uuid().nullable().optional(),
  blockSlot:       z.number().int().nullable().optional(),
})

export async function statusRowsRoutes(app: FastifyInstance) {
  // GET /status-rows/unique-values — distinct format & location values for dropdowns
  app.get('/unique-values', { preHandler: requireRole('admin') }, async () => {
    const [formats, locations] = await Promise.all([
      prisma.$queryRawUnsafe<{ format: string }[]>(
        `SELECT DISTINCT format FROM status_rows WHERE format IS NOT NULL AND format <> '' AND source <> 'separator' ORDER BY format`,
      ),
      prisma.$queryRawUnsafe<{ location: string }[]>(
        `SELECT DISTINCT location FROM status_rows WHERE location IS NOT NULL AND location <> '' AND source <> 'separator' ORDER BY location`,
      ),
    ])
    return {
      formats: formats.map((r) => r.format),
      locations: locations.map((r) => r.location),
    }
  })

  // GET /status-rows
  app.get('/', { preHandler: authenticate }, async (request) => {
    const query = request.query as {
      dateFrom?: string
      dateTo?: string
      dateNull?: string
      status?: string
      search?: string
      withSeparators?: string
      slim?: string
    }

    const where = {
      ...(query.withSeparators !== 'true' && { NOT: { source: 'separator' as any } }),
      ...(query.dateNull === 'true' && { date: null }),
      ...(query.dateFrom && { date: { gte: new Date(query.dateFrom) } }),
      ...(query.dateTo && { date: { lte: new Date(query.dateTo) } }),
      ...(query.status && { status: query.status as any }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
          { client: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
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
        linkedMatrix: { select: { matrixId: true } },
        assignments: {
          include: { user: { select: { id: true, fullName: true, role: true } } },
        },
        days: { orderBy: { date: 'asc' } },
      },
      orderBy: [{ googleRowIndex: 'asc' }, { date: 'asc' }],
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

  // GET /status-rows/:id/link-info — matrixRegistryId, blockSlot, linked matrix details
  app.get('/:id/link-info', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT sr.matrix_registry_id AS "matrixRegistryId", sr.block_slot AS "blockSlot",
              mr.id AS "mId", mr.name AS "mName", mr.client AS "mClient",
              mr.matrix_id AS "mMatrixId", mr.sheet_url AS "mSheetUrl", mr.source AS "mSource"
       FROM status_rows sr
       LEFT JOIN matrix_registry mr ON mr.id = sr.matrix_registry_id
       WHERE sr.id = $1`,
      id
    )
    if (!rows[0]) return reply.code(404).send({ error: 'Not found' })
    const r = rows[0]
    return {
      matrixRegistryId: r.matrixRegistryId,
      blockSlot: r.blockSlot,
      linkedMatrix: r.mId ? {
        id: r.mId, name: r.mName, client: r.mClient,
        matrixId: r.mMatrixId, sheetUrl: r.mSheetUrl, source: r.mSource,
      } : null,
    }
  })

  // POST /status-rows — ручное создание (admin only)
  app.post('/', { preHandler: requireRole('admin') }, async (request, reply) => {
    const body = createStatusRowSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })
    }

    const { days, efirDate, zastroykDate, status: bodyStatus, ...rowData } = body.data

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
        status: (bodyStatus ?? 'request') as any,
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

    const { days, matrixRegistryId, blockSlot, ...rowFields } = body.data
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

    // matrixRegistryId / blockSlot — new fields unknown to the Prisma client, use raw SQL
    if (matrixRegistryId !== undefined || blockSlot !== undefined) {
      const sets: string[] = []
      const vals: unknown[] = []
      let i = 1
      if (matrixRegistryId !== undefined) { sets.push(`matrix_registry_id = $${i++}`); vals.push(matrixRegistryId) }
      if (blockSlot !== undefined)         { sets.push(`block_slot = $${i++}`);         vals.push(blockSlot) }
      sets.push(`updated_at = NOW()`)
      vals.push(id)
      await prisma.$executeRawUnsafe(
        `UPDATE status_rows SET ${sets.join(', ')} WHERE id = $${i}`,
        ...vals
      )
      delete data.matrixRegistryId
      delete data.blockSlot
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
