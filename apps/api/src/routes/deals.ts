import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tv-shifts/db'
import { authenticate, requireRole } from '../plugins/auth'

const createDealSchema = z.object({
  name: z.string().nullable().optional(),
  client: z.string().nullable().optional(),
  status: z.enum(['preliminary', 'in_progress', 'completed']).optional(),
  statusRowIds: z.array(z.string().uuid()).optional(),
  matrixIds: z.array(z.string()).optional(),
})

const updateDealSchema = createDealSchema.partial()

const dealInclude = {
  statusRows: {
    include: {
      statusRow: {
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

  // GET /deals/potential — StatusRow с sheetMatrixId совпадающим в MatrixRegistry, без привязки к Deal
  app.get('/potential', { preHandler: requireRole('admin') }, async () => {
    // Все StatusRow с sheetMatrixId
    const rowsWithMatrix = await prisma.statusRow.findMany({
      where: {
        sheetMatrixId: { not: null },
        source: 'projects_table',
      },
    })

    // Все matrixId из реестра
    const registryIds = await prisma.matrixRegistry.findMany({
      select: { id: true, matrixId: true, name: true, client: true, status: true, unit: true, format: true },
    })
    const registryMap = new Map(registryIds.map((r) => [r.matrixId, r]))

    // Все StatusRow уже привязанные к Deal
    const linked = await prisma.dealStatusRow.findMany({ select: { statusRowId: true } })
    const linkedIds = new Set(linked.map((l) => l.statusRowId))

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
  app.post('/', { preHandler: requireRole('admin') }, async (request, reply) => {
    const body = createDealSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })

    const { statusRowIds = [], matrixIds = [], ...dealData } = body.data

    const deal = await prisma.deal.create({
      data: {
        ...dealData,
        statusRows: statusRowIds.length
          ? { create: statusRowIds.map((id) => ({ statusRowId: id })) }
          : undefined,
        matrices: matrixIds.length
          ? { create: matrixIds.map((id) => ({ matrixId: id })) }
          : undefined,
      },
      include: dealInclude,
    })

    return reply.code(201).send(formatDeal(deal))
  })

  // PATCH /deals/:id
  app.patch('/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = updateDealSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })

    const { statusRowIds, matrixIds, ...dealData } = body.data

    const existing = await prisma.deal.findUnique({ where: { id } })
    if (!existing) return reply.code(404).send({ error: 'Deal not found' })

    // Обновляем данные
    if (Object.keys(dealData).length > 0) {
      await prisma.deal.update({ where: { id }, data: dealData })
    }

    // Заменяем statusRows если переданы
    if (statusRowIds !== undefined) {
      await prisma.dealStatusRow.deleteMany({ where: { dealId: id } })
      if (statusRowIds.length > 0) {
        await prisma.dealStatusRow.createMany({
          data: statusRowIds.map((statusRowId) => ({ dealId: id, statusRowId })),
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
  app.delete('/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.deal.delete({ where: { id } })
    return { ok: true }
  })
}

function formatDeal(deal: any) {
  return {
    ...deal,
    statusRows: deal.statusRows.map((r: any) => r.statusRow),
    matrices: deal.matrices.map((m: any) => m.matrix),
  }
}
