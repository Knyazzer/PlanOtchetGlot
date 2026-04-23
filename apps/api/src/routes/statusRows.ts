import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { Prisma, prisma } from '@tv-shifts/db'
import { authenticate } from '../plugins/auth'
import { requirePermission } from '../config/permissions'
import { logChanges } from '../services/changeLog'
import { syncProjectBlock, nextBlockSlot, unlinkAndShiftBlocks } from '../services/matrixBlockSync'

const daySchema = z.object({
  id: z.string().optional(),
  date: z.string(),
  type: z.enum(['zastroyka', 'efir', 'deadline', 'semka']),
  startTime: z.string().nullable().optional(),
  timeFrom: z.string().nullable().optional(),
  timeTo: z.string().nullable().optional(),
  allDay: z.boolean().optional(),
  firstMotor: z.string().nullable().optional(),
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
  status: z.enum(['request','negotiation','connecting','preproduction','production','postproduction','delivered','rejected','cancelled','manual']).optional(),
  days: z.array(daySchema).optional(),
})

const updateStatusRowSchema = createStatusRowSchema.partial().extend({
  status:          z.enum(['request','negotiation','connecting','preproduction','production','postproduction','delivered','rejected','cancelled','manual']).optional(),
  dateConfirmed:   z.boolean().optional(),
  matrixRegistryId: z.string().uuid().nullable().optional(),
  blockSlot:       z.number().int().nullable().optional(),
})

export async function statusRowsRoutes(app: FastifyInstance) {
  // GET /status-rows/unique-values — distinct format & location values for dropdowns
  app.get('/unique-values', { preHandler: requirePermission('projects:write') }, async () => {
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
      source?: string
      search?: string
      withSeparators?: string
      slim?: string
      matrixRegistryId?: string
      parentTaskId?: string
      topLevelOnly?: string
    }

    const where: Record<string, any> = {
      ...(query.withSeparators !== 'true' && { NOT: { source: 'separator' as any } }),
      ...(query.source && { source: query.source as any }),
      ...(query.dateNull === 'true' && { date: null }),
      ...(query.dateFrom && { date: { gte: new Date(query.dateFrom) } }),
      ...(query.dateTo && { date: { lte: new Date(query.dateTo) } }),
      ...(query.status && { status: query.status as any }),
      ...(query.matrixRegistryId && { matrixRegistryId: query.matrixRegistryId }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
          { client: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
        ],
      }),
    }

    // parent_task_id is not in Prisma schema — filter via raw SQL then pass IDs to Prisma
    if (query.parentTaskId) {
      const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM status_rows WHERE parent_task_id = $1`, query.parentTaskId
      )
      where.id = { in: rows.map((r) => r.id) }
    } else if (query.topLevelOnly === 'true' && query.matrixRegistryId) {
      const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM status_rows WHERE matrix_registry_id = $1 AND parent_task_id IS NULL`,
        query.matrixRegistryId
      )
      where.id = { in: rows.map((r) => r.id) }
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
  app.post('/', { preHandler: requirePermission('projects:write') }, async (request, reply) => {
    const rawBody = request.body as Record<string, unknown>
    const parentTaskId = typeof rawBody?.parentTaskId === 'string' ? rawBody.parentTaskId : null

    const body = createStatusRowSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })
    }

    const { days, efirDate, zastroykDate, status: bodyStatus, matrixRegistryId, ...rowData } = body.data

    const autoDays: { date: Date; type: 'efir' | 'zastroyka' }[] = []
    if (zastroykDate) autoDays.push({ date: new Date(zastroykDate), type: 'zastroyka' })
    if (efirDate)     autoDays.push({ date: new Date(efirDate), type: 'efir' })
    const allDays = autoDays.length > 0 ? autoDays : (days ?? []).map((d) => ({ date: new Date(d.date), type: d.type as 'efir' | 'zastroyka' }))

    const earliestDate = allDays.length > 0
      ? allDays.reduce((min, d) => d.date < min ? d.date : min, allDays[0].date)
      : rowData.date ? new Date(rowData.date) : undefined

    // Auto-assign block slot if matrix is provided (departments linked via parentTaskId skip this)
    let blockSlotForCreate: number | null = null
    if (matrixRegistryId && !parentTaskId) {
      blockSlotForCreate = Number(await nextBlockSlot(matrixRegistryId))
    }

    const row = await prisma.statusRow.create({
      data: {
        ...rowData,
        date: earliestDate ?? undefined,
        status: (bodyStatus ?? 'request') as any,
        source: 'manual',
        matrixRegistryId: matrixRegistryId ?? undefined,
        blockSlot: blockSlotForCreate ?? undefined,
        days: allDays.length > 0
          ? { create: allDays.map((d) => ({ date: d.date, type: d.type, startTime: null })) }
          : undefined,
      },
      include: { days: { orderBy: { date: 'asc' } } },
    })

    if (parentTaskId) {
      await prisma.$executeRawUnsafe(
        `UPDATE status_rows SET parent_task_id = $1 WHERE id = $2`,
        parentTaskId, row.id
      )
    }

    return reply.code(201).send(row)
  })

  // PATCH /status-rows/:id
  app.patch('/:id', { preHandler: requirePermission('projects:write') }, async (request, reply) => {
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
      for (const d of days) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO "project_days" (id, project_id, date, type, start_time, time_from, time_to, all_day, first_motor, created_at)
           VALUES (gen_random_uuid(), $1, $2, $3::"DayType", $4, $5, $6, $7, $8, NOW())`,
          id,
          new Date(d.date),
          d.type,
          d.startTime ?? null,
          (d as any).timeFrom ?? null,
          (d as any).timeTo ?? null,
          (d as any).allDay ?? false,
          (d as any).firstMotor ?? null,
        )
      }
    }

    // matrixRegistryId change — auto block-slot management
    if (matrixRegistryId !== undefined) {
      // Read current state
      const cur = await prisma.$queryRawUnsafe<{ matrixRegistryId: string | null; blockSlot: number | null }[]>(
        `SELECT matrix_registry_id AS "matrixRegistryId", block_slot AS "blockSlot" FROM status_rows WHERE id = $1`,
        id,
      )
      const oldMatrixId  = cur[0]?.matrixRegistryId ?? null
      const oldBlockSlot = cur[0]?.blockSlot ?? null

      const isChangingMatrix = matrixRegistryId !== oldMatrixId
      const isUnlinking      = isChangingMatrix && (matrixRegistryId === null || oldMatrixId !== null)

      // Unlink from old matrix: delete its block + shift remaining projects
      if (isUnlinking && oldMatrixId && oldBlockSlot != null) {
        await unlinkAndShiftBlocks(id, oldMatrixId, oldBlockSlot)
      }

      // Assign block slot for new matrix
      let resolvedSlot: number | null = null
      if (matrixRegistryId !== null) {
        // Auto-assign next slot (ignore any manually provided blockSlot since we auto-manage)
        const raw = await nextBlockSlot(matrixRegistryId, id)
        resolvedSlot = Number(raw)
      }

      const affected = await prisma.$executeRawUnsafe(
        `UPDATE status_rows SET matrix_registry_id = $1, block_slot = $2, updated_at = NOW() WHERE id = $3`,
        matrixRegistryId, resolvedSlot, id,
      )

      delete data.matrixRegistryId
      delete data.blockSlot

    } else if (blockSlot !== undefined) {
      // blockSlot-only update (no matrix change)
      await prisma.$executeRawUnsafe(
        `UPDATE status_rows SET block_slot = $1, updated_at = NOW() WHERE id = $2`,
        blockSlot, id,
      )
      delete data.blockSlot
    }

    const include = { days: { orderBy: { date: 'asc' as const } } }
    const row = Object.keys(data).length > 0
      ? await prisma.statusRow.update({ where: { id }, data, include })
      : await prisma.statusRow.findUnique({ where: { id }, include })

    await logChanges('status_row', id, before as any, rowFields as any, me.id)

    if (!row) return reply.code(404).send({ error: 'StatusRow not found' })
    return row
  })

  // GET /status-rows/:id/approvals
  app.get('/:id/approvals', { preHandler: requirePermission('projects:write') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const rows = await prisma.$queryRawUnsafe<{ field_approvals: Record<string, boolean> }[]>(
      `SELECT field_approvals FROM status_rows WHERE id = $1`, id
    )
    if (!rows[0]) return reply.code(404).send({ error: 'Not found' })
    return rows[0].field_approvals ?? {}
  })

  // PATCH /status-rows/:id/approvals — merge field approvals
  app.patch('/:id/approvals', { preHandler: requirePermission('projects:write') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const patch = request.body as Record<string, boolean>
    if (!patch || typeof patch !== 'object') return reply.code(400).send({ error: 'Invalid body' })
    const rows = await prisma.$queryRawUnsafe<{ field_approvals: Record<string, boolean> }[]>(
      `UPDATE status_rows SET field_approvals = field_approvals || $1::jsonb, updated_at = NOW() WHERE id = $2 RETURNING field_approvals`,
      JSON.stringify(patch), id
    )
    if (!rows[0]) return reply.code(404).send({ error: 'Not found' })
    return rows[0].field_approvals ?? {}
  })

  // GET /status-rows/children-summary?parentIds=id1,id2,...
  // Returns { [parentTaskId]: string[] } — dept names (format|name) per parent task
  app.get('/children-summary', { preHandler: authenticate }, async (request) => {
    const { parentIds } = request.query as { parentIds?: string }
    const idList = (parentIds ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    if (idList.length === 0) return {}
    const rows = await prisma.$queryRawUnsafe<{ parent_task_id: string; format: string | null; name: string }[]>(
      `SELECT parent_task_id, format, name FROM status_rows WHERE parent_task_id = ANY($1::text[])`,
      idList,
    )
    const result: Record<string, string[]> = {}
    for (const row of rows) {
      const pid = row.parent_task_id
      if (!result[pid]) result[pid] = []
      result[pid].push(row.format || row.name || '—')
    }
    return result
  })

  // GET /status-rows/group-schedule-batch?ids=id1,id2,...
  // Returns { [rowId]: string[] } — active dept keys per row
  app.get('/group-schedule-batch', { preHandler: authenticate }, async (request) => {
    const { ids } = request.query as { ids?: string }
    const idList = (ids ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    if (idList.length === 0) return {}
    const rows = await prisma.$queryRawUnsafe<{ id: string; group_schedule: Record<string, unknown> | null }[]>(
      `SELECT id, group_schedule FROM status_rows WHERE id = ANY($1::uuid[])`,
      idList,
    )
    const result: Record<string, string[]> = {}
    for (const row of rows) {
      const gs = row.group_schedule ?? {}
      result[row.id] = Object.entries(gs).filter(([, v]) => v !== null).map(([k]) => k)
    }
    return result
  })

  // GET /status-rows/:id/group-schedule
  app.get('/:id/group-schedule', { preHandler: requirePermission('projects:write') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const rows = await prisma.$queryRawUnsafe<{ group_schedule: Record<string, unknown> }[]>(
      `SELECT group_schedule FROM status_rows WHERE id = $1`, id
    )
    if (!rows[0]) return reply.code(404).send({ error: 'Not found' })
    return rows[0].group_schedule ?? {}
  })

  // PATCH /status-rows/:id/group-schedule — merge group schedule
  app.patch('/:id/group-schedule', { preHandler: requirePermission('projects:write') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const patch = request.body as Record<string, unknown>
    if (!patch || typeof patch !== 'object') return reply.code(400).send({ error: 'Invalid body' })
    const rows = await prisma.$queryRawUnsafe<{ group_schedule: Record<string, unknown> }[]>(
      `UPDATE status_rows SET group_schedule = group_schedule || $1::jsonb, updated_at = NOW() WHERE id = $2 RETURNING group_schedule`,
      JSON.stringify(patch), id
    )
    if (!rows[0]) return reply.code(404).send({ error: 'Not found' })
    return rows[0].group_schedule ?? {}
  })

  // POST /status-rows/:id/sync-block — manual trigger of matrix block sync
  app.post('/:id/sync-block', { preHandler: requirePermission('projects:write') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      await syncProjectBlock(id)
      return { ok: true }
    } catch (e: any) {
      return reply.code(500).send({ error: e?.message ?? 'Sync failed' })
    }
  })

  // DELETE /status-rows/:id
  app.delete('/:id', { preHandler: requirePermission('projects:write') }, async (request) => {
    const { id } = request.params as { id: string }

    // If project had a linked matrix block — delete it and shift remaining projects
    const cur = await prisma.$queryRawUnsafe<{ matrixRegistryId: string | null; blockSlot: number | null }[]>(
      `SELECT matrix_registry_id AS "matrixRegistryId", block_slot AS "blockSlot" FROM status_rows WHERE id = $1`,
      id,
    )
    const { matrixRegistryId: mId, blockSlot: bSlot } = cur[0] ?? {}
    if (mId && bSlot != null) {
      await unlinkAndShiftBlocks(id, mId, bSlot)
    }

    try {
      await prisma.statusRow.delete({ where: { id } })
    } catch (e: any) {
      if (e?.code === 'P2025') return { ok: true } // already deleted — treat as success
      throw e
    }
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
