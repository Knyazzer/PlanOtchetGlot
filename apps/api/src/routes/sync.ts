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
