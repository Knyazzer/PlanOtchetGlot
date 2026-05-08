import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { Prisma, prisma } from '@tv-shifts/db'
import { authenticate } from '../plugins/auth'
import { requirePermission } from '../config/permissions'
import { logChanges } from '../services/changeLog'
import { syncProjectBlock, nextBlockSlot, unlinkAndShiftBlocks } from '../services/matrixBlockSync'

// Auto-update project status when a work-item's status changes
async function syncProjectStatus(projectId: string | null) {
  if (!projectId) return
  const wis = await prisma.workItem.findMany({
    where: { projectId, parentWiId: null, NOT: { source: 'separator' as any } },
    select: { status: true },
  })
  if (wis.length === 0) return
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { status: true } })
  if (!project) return

  const allDone    = wis.every((w) => w.status === 'done')
  const anyActive  = wis.some((w) => (w.status as string) === 'active' || (w.status as string) === 'done')

  if (allDone && (project.status as string) !== 'done') {
    await prisma.project.update({ where: { id: projectId }, data: { status: 'done' as any } })
  } else if (anyActive && (project.status as string) === 'draft') {
    await prisma.project.update({ where: { id: projectId }, data: { status: 'active' as any } })
  }
}

const patchSchema = z.object({
  name:             z.string().min(1).optional(),
  client:           z.string().nullable().optional(),
  execProducer:     z.string().nullable().optional(),
  lineProducer:     z.string().nullable().optional(),
  accountManager:   z.string().nullable().optional(),
  format:           z.string().nullable().optional(),
  location:         z.string().nullable().optional(),
  date:             z.string().nullable().optional(),
  dateApproximate:  z.string().nullable().optional(),
  dateConfirmed:    z.boolean().optional(),
  notes:            z.string().nullable().optional(),
  status:           z.enum(['draft', 'active', 'done', 'cancelled', 'rejected']).optional(),
  matrixRegistryId: z.string().uuid().nullable().optional(),
  blockSlot:        z.number().int().nullable().optional(),
  projectId:        z.string().nullable().optional(),
})

export async function workItemsRoutes(app: FastifyInstance) {

  // GET /work-items/children-summary?parentIds=id1,id2,...
  app.get('/children-summary', { preHandler: authenticate }, async (request) => {
    const { parentIds } = request.query as { parentIds?: string }
    const idList = (parentIds ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    if (idList.length === 0) return {}
    const rows = await prisma.$queryRawUnsafe<{ parent_wi_id: string; format: string | null; name: string }[]>(
      `SELECT parent_wi_id, format, name FROM work_items WHERE parent_wi_id = ANY($1::text[])`,
      idList,
    )
    const result: Record<string, string[]> = {}
    for (const row of rows) {
      const pid = row.parent_wi_id
      if (!result[pid]) result[pid] = []
      result[pid].push(row.format || row.name || '—')
    }
    return result
  })

  // GET /work-items
  app.get('/', { preHandler: authenticate }, async (request) => {
    const q = request.query as {
      status?: string; source?: string; projectId?: string; search?: string
      parentWiId?: string; topLevelOnly?: string; withSeparators?: string; slim?: string
      matrixRegistryId?: string
    }

    const where: any = {
      ...(q.withSeparators !== 'true' && { NOT: { source: 'separator' as any } }),
      ...(q.status         && { status:           q.status as any }),
      ...(q.source         && { source:           q.source as any }),
      ...(q.projectId      && { projectId:        q.projectId }),
      ...(q.matrixRegistryId && { matrixRegistryId: q.matrixRegistryId }),
      ...(q.parentWiId     && { parentWiId:       q.parentWiId }),
      ...(q.topLevelOnly === 'true' && { parentWiId: null }),
      ...(q.search && {
        OR: [
          { name:   { contains: q.search, mode: Prisma.QueryMode.insensitive } },
          { client: { contains: q.search, mode: Prisma.QueryMode.insensitive } },
        ],
      }),
    }

    if (q.slim === 'true') {
      return prisma.workItem.findMany({ where, orderBy: { googleRowIndex: 'asc' } })
    }

    return prisma.workItem.findMany({
      where,
      include: {
        matrixRegistry: true,
        project: { select: { id: true, name: true, status: true } },
        days: { orderBy: { date: 'asc' } },
      },
      orderBy: [{ googleRowIndex: 'asc' }, { date: 'asc' }],
    })
  })

  // POST /work-items
  app.post('/', { preHandler: requirePermission('projects:write') }, async (request, reply) => {
    const body = z.object({
      name:        z.string().min(1),
      projectId:   z.string().nullable().optional(),
      format:      z.string().nullable().optional(),
      location:    z.string().nullable().optional(),
      date:        z.string().nullable().optional(),
      notes:       z.string().nullable().optional(),
      status:      z.enum(['draft', 'active', 'done', 'cancelled', 'rejected']).optional(),
      parentWiId:  z.string().nullable().optional(),
      source:      z.string().optional(),
    }).safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })

    const wi = await prisma.workItem.create({
      data: {
        name:       body.data.name,
        projectId:  body.data.projectId ?? null,
        format:     body.data.format ?? null,
        location:   body.data.location ?? null,
        date:       body.data.date ? new Date(body.data.date) : null,
        notes:      body.data.notes ?? null,
        status:     (body.data.status ?? 'draft') as any,
        source:     (body.data.source ?? 'manual') as any,
        parentWiId: body.data.parentWiId ?? null,
      },
    })

    if (wi.projectId && (wi.status as string) === 'active') {
      await syncProjectStatus(wi.projectId)
    }

    return reply.code(201).send(wi)
  })

  // GET /work-items/:id
  app.get('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const wi = await prisma.workItem.findUnique({
      where: { id },
      include: {
        project:       { select: { id: true, name: true, client: true, status: true } },
        matrixRegistry: true,
        linkedMatrix:  { select: { matrixId: true, name: true, projectName: true } },
        assignments:   { include: { user: { select: { id: true, fullName: true } } } },
        days:          { orderBy: { date: 'asc' } },
      },
    })
    if (!wi) return reply.code(404).send({ error: 'WorkItem not found' })
    return wi
  })

  // PATCH /work-items/:id
  app.patch('/:id', { preHandler: requirePermission('projects:write') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const me = request.user as { id: string }
    const body = patchSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })

    const before = await prisma.workItem.findUnique({ where: { id } })
    if (!before) return reply.code(404).send({ error: 'WorkItem not found' })

    const { matrixRegistryId, blockSlot, ...fields } = body.data
    const data: any = { ...fields }
    if (data.date !== undefined) data.date = data.date ? new Date(data.date) : null

    // matrixRegistryId change — auto block-slot management
    if (matrixRegistryId !== undefined) {
      const cur = await prisma.$queryRawUnsafe<{ matrixRegistryId: string | null; blockSlot: number | null }[]>(
        `SELECT matrix_registry_id AS "matrixRegistryId", block_slot AS "blockSlot" FROM work_items WHERE id = $1`,
        id,
      )
      const oldMatrixId  = cur[0]?.matrixRegistryId ?? null
      const oldBlockSlot = cur[0]?.blockSlot ?? null
      const isChanging   = matrixRegistryId !== oldMatrixId
      const isUnlinking  = isChanging && (matrixRegistryId === null || oldMatrixId !== null)

      if (isUnlinking && oldMatrixId && oldBlockSlot != null) {
        await unlinkAndShiftBlocks(id, oldMatrixId, oldBlockSlot)
      }

      let resolvedSlot: number | null = null
      if (matrixRegistryId !== null) {
        resolvedSlot = Number(await nextBlockSlot(matrixRegistryId, id))
      }

      await prisma.$executeRawUnsafe(
        `UPDATE work_items SET matrix_registry_id = $1, block_slot = $2, updated_at = NOW() WHERE id = $3`,
        matrixRegistryId, resolvedSlot, id,
      )
      delete data.matrixRegistryId
      delete data.blockSlot

    } else if (blockSlot !== undefined) {
      await prisma.$executeRawUnsafe(
        `UPDATE work_items SET block_slot = $1, updated_at = NOW() WHERE id = $2`,
        blockSlot, id,
      )
      delete data.blockSlot
    }

    const include = { days: { orderBy: { date: 'asc' as const } } }
    const wi = Object.keys(data).length > 0
      ? await prisma.workItem.update({ where: { id }, data, include })
      : await prisma.workItem.findUnique({ where: { id }, include })

    if (!wi) return reply.code(404).send({ error: 'WorkItem not found' })

    // Auto-trigger project status when WI status changes
    if (fields.status && fields.status !== (before.status as string) && wi.projectId) {
      await syncProjectStatus(wi.projectId)
    }

    // Debounced matrix block sync
    if (matrixRegistryId !== undefined || blockSlot !== undefined || fields.name || fields.date) {
      syncProjectBlock(id)
    }

    await logChanges('work_item', id, before as any, fields as any, me.id)
    return wi
  })

  // DELETE /work-items/:id
  app.delete('/:id', { preHandler: requirePermission('projects:write') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const wi = await prisma.workItem.findUnique({ where: { id }, select: { id: true } })
    if (!wi) return reply.code(404).send({ error: 'WorkItem not found' })
    await prisma.workItem.delete({ where: { id } })
    return reply.code(204).send()
  })
}
