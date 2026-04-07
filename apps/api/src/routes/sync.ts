import { FastifyInstance } from 'fastify'
import { requireRole } from '../plugins/auth'

// Заглушка — реализуется в Этапе 3
export async function syncRoutes(app: FastifyInstance) {
  // POST /sync/trigger — ручной запуск синхронизации
  app.post('/trigger', { preHandler: requireRole('admin', 'producer') }, async (_request, reply) => {
    // TODO: Этап 3 — запустить полный цикл синхронизации
    return reply.code(202).send({ message: 'Sync scheduled (not implemented yet)' })
  })

  // GET /sync/logs — история синхронизаций
  app.get('/logs', { preHandler: requireRole('admin') }, async () => {
    // TODO: Этап 3
    return []
  })
}
