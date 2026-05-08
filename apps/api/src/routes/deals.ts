import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { Prisma } from '@tv-shifts/db'
import { prisma } from '@tv-shifts/db'
import { authenticate } from '../plugins/auth'
import { requirePermission } from '../config/permissions'

const createDealSchema = z.object({
  name: z.string().nullable().optional(),
  client: z.string().nullable().optional(),
  status: z.enum(['preliminary', 'in_progress', 'completed']).optional(),
  wiIds: z.array(z.string().uuid()).optional(),
  matrixIds: z.array(z.string()).optional(),
})

const updateDealSchema = createDealSchema.partial()

const dealInclude = {
  workItems: {
    include: {
      workItem: {
        include: { days: { orderBy: { date: 'asc' as const } } },
      },
    },
  },
  matrices: {
    include: { matrix: true },
  },
}

export async function dealsRoutes(app: FastifyInstance) {
  // GET /deals
  app.get('/', { preHandler: authenticate }, async () => {
    const deals = await prisma.deal.findMany({
      include: dealInclude,
      orderBy: { client: 'asc' },
    })
    return deals.map(formatDeal)
  })

  // GET /deals/potential — WorkItem с sheetMatrixId совпадающим в MatrixRegistry, без привязки к Deal
  app.get('/potential', { preHandler: requirePermission('deals:write') }, async () => {
    const rowsWithMatrix = await prisma.workItem.findMany({
      where: {
        sheetMatrixId: { not: null },
        source: 'sync',
      },
    })

    const registryIds = await prisma.matrixRegistry.findMany({
      select: { id: true, matrixId: true, name: true, client: true, status: true, unit: true, format: true },
    })
    const registryMap = new Map(registryIds.map((r) => [r.matrixId, r]))

    const linked = await prisma.dealWorkItem.findMany({ select: { wiId: true } })
    const linkedIds = new Set(linked.map((l) => l.wiId))

    // Группируем по matrixId: матрица → строки
    const groups = new Map<string, { matrix: typeof registryIds[0]; rows: typeof rowsWithMatrix }>()

    for (const row of rowsWithMatrix) {
      if (linkedIds.has(row.id)) continue
      const matrixId = row.sheetMatrixId!
      const matrix = registryMap.get(matrixId)
      if (!matrix) continue

      if (!groups.has(matrixId)) {
        groups.set(matrixId, { matrix, rows: [] })
      }
      groups.get(matrixId)!.rows.push(row)
    }

    return Array.from(groups.values()).sort((a, b) =>
      (a.matrix.client ?? '').localeCompare(b.matrix.client ?? '')
    )
  })

  // GET /deals/:id
  app.get('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const deal = await prisma.deal.findUnique({ where: { id }, include: dealInclude })
    if (!deal) return reply.code(404).send({ error: 'Deal not found' })
    return formatDeal(deal)
  })

  // POST /deals
  app.post('/', { preHandler: requirePermission('deals:write') }, async (request, reply) => {
    const body = createDealSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })

    const { wiIds = [], matrixIds = [], ...dealData } = body.data

    const deal = await prisma.deal.create({
      data: {
        ...dealData,
        workItems: wiIds.length
          ? { create: wiIds.map((wiId) => ({ wiId })) }
          : undefined,
        matrices: matrixIds.length
          ? { create: matrixIds.map((matrixId) => ({ matrixId })) }
          : undefined,
      },
      include: dealInclude,
    })

    return reply.code(201).send(formatDeal(deal))
  })

  // PATCH /deals/:id
  app.patch('/:id', { preHandler: requirePermission('deals:write') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = updateDealSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })

    const { wiIds, matrixIds, ...dealData } = body.data

    const existing = await prisma.deal.findUnique({ where: { id } })
    if (!existing) return reply.code(404).send({ error: 'Deal not found' })

    if (Object.keys(dealData).length > 0) {
      await prisma.deal.update({ where: { id }, data: dealData })
    }

    if (wiIds !== undefined) {
      await prisma.dealWorkItem.deleteMany({ where: { dealId: id } })
      if (wiIds.length > 0) {
        await prisma.dealWorkItem.createMany({
          data: wiIds.map((wiId) => ({ dealId: id, wiId })),
        })
      }
    }

    // Заменяем matrices если переданы
    if (matrixIds !== undefined) {
      await prisma.dealMatrix.deleteMany({ where: { dealId: id } })
      if (matrixIds.length > 0) {
        await prisma.dealMatrix.createMany({
          data: matrixIds.map((matrixId) => ({ dealId: id, matrixId })),
        })
      }
    }

    const deal = await prisma.deal.findUnique({ where: { id }, include: dealInclude })
    return formatDeal(deal!)
  })

  // DELETE /deals/:id
  app.delete('/:id', { preHandler: requirePermission('deals:write') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.deal.delete({ where: { id } })
    return { ok: true }
  })
}

type DealWithIncludes = Prisma.DealGetPayload<{ include: typeof dealInclude }>

function formatDeal(deal: DealWithIncludes) {
  return {
    ...deal,
    workItems: deal.workItems.map((r) => r.workItem),
    matrices: deal.matrices.map((m) => m.matrix),
  }
}
