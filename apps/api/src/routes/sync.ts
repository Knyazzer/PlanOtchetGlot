import { FastifyInstance } from 'fastify'
import { prisma } from '@tv-shifts/db'
import { requireRole } from '../plugins/auth'
import { runFullSync, fetchMatrixPreview, fetchMatrixShifts } from '../services/syncService'

export async function syncRoutes(app: FastifyInstance) {
  // POST /sync/trigger — ручной запуск (admin или producer)
  app.post('/trigger', { preHandler: requireRole('admin', 'producer') }, async (_request, reply) => {
    // Запускаем асинхронно, не ждём завершения
    runFullSync()
      .then((result) => {
        app.log.info({ result }, '[sync] Full sync completed')
      })
      .catch((err) => {
        app.log.error({ err }, '[sync] Full sync failed')
      })

    return reply.code(202).send({ message: 'Sync started' })
  })

  // GET /sync/sheet-urls — публичные URL исходных Google Sheets
  app.get('/sheet-urls', { preHandler: requireRole('admin') }, async () => {
    const base = 'https://docs.google.com/spreadsheets/d'
    return {
      projectsSheetUrl: process.env.GOOGLE_PROJECTS_SHEET_ID
        ? `${base}/${process.env.GOOGLE_PROJECTS_SHEET_ID}`
        : null,
      registrySheetUrl: process.env.GOOGLE_REGISTRY_SHEET_ID
        ? `${base}/${process.env.GOOGLE_REGISTRY_SHEET_ID}`
        : null,
    }
  })

  // GET /sync/registry — все записи реестра матриц (в порядке как в таблице)
  app.get('/registry', { preHandler: requireRole('admin') }, async () => {
    return prisma.matrixRegistry.findMany({ orderBy: { createdAt: 'asc' } })
  })

  // POST /sync/reset — удалить все импортированные данные
  app.post('/reset', { preHandler: requireRole('admin') }, async (_request, reply) => {
    // Удаляем в нужном порядке из-за foreign keys
    // source: 'separator' не знает устаревший Prisma-клиент — используем raw SQL
    const shifts   = await prisma.shiftEntry.deleteMany({ where: { source: 'matrix' } })
    const registry = await prisma.matrixRegistry.deleteMany({})
    const result   = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `DELETE FROM status_rows WHERE source IN ('projects_table'::"StatusRowSource", 'separator'::"StatusRowSource") RETURNING id`
    )
    const projectsCount = result.length
    return reply.send({
      deleted: {
        shiftEntries: shifts.count,
        registryEntries: registry.count,
        projects: projectsCount,
      },
    })
  })

  // GET /sync/matrix-preview/:matrixId — просмотр содержимого матрицы
  app.get('/matrix-preview/:matrixId', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { matrixId } = request.params as { matrixId: string }
    const { sheet } = request.query as { sheet?: string }

    const entry = await prisma.matrixRegistry.findFirst({ where: { matrixId } })
    if (!entry) return reply.code(404).send({ error: 'Matrix not found' })
    if (!entry.sheetUrl) return reply.code(400).send({ error: 'No URL for this matrix' })

    try {
      const preview = await fetchMatrixPreview(entry.sheetUrl, sheet)
      return preview
    } catch (e: any) {
      return reply.code(500).send({ error: e.message })
    }
  })

  // GET /sync/matrix-shifts/:matrixId — смены из матрицы
  app.get('/matrix-shifts/:matrixId', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { matrixId } = request.params as { matrixId: string }

    const entry = await prisma.matrixRegistry.findFirst({ where: { matrixId } })
    if (!entry) return reply.code(404).send({ error: 'Matrix not found' })
    if (!entry.sheetUrl) return reply.code(400).send({ error: 'No URL for this matrix' })

    try {
      const data = await fetchMatrixShifts(entry.sheetUrl)
      if (!data) return reply.code(404).send({ error: 'Shifts sheet not found in this spreadsheet' })
      return data
    } catch (e: any) {
      return reply.code(500).send({ error: e.message })
    }
  })

  // GET /sync/logs — история синхронизаций
  app.get('/logs', { preHandler: requireRole('admin') }, async (request) => {
    const query = request.query as { limit?: string; type?: string }
    const limit = Math.min(Number(query.limit ?? 50), 200)

    return prisma.syncLog.findMany({
      where: query.type ? { type: query.type as any } : undefined,
      orderBy: { startedAt: 'desc' },
      take: limit,
    })
  })
}
