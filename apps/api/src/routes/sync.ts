import { FastifyInstance } from 'fastify'
import { prisma } from '@tv-shifts/db'
import { requireRole } from '../plugins/auth'
import { runFullSync } from '../services/syncService'

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
