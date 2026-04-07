import { FastifyInstance } from 'fastify'
import { prisma } from '@tv-shifts/db'
import { authenticate } from '../plugins/auth'

export async function notificationsRoutes(app: FastifyInstance) {
  // GET /notifications
  app.get('/', { preHandler: authenticate }, async (request) => {
    const me = request.user as { id: string; role: string }

    return prisma.notification.findMany({
      where: {
        OR: [
          { userId: me.id },
          { userId: null }, // глобальные
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
  })

  // PATCH /notifications/:id/read
  app.patch('/:id/read', { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string }
    return prisma.notification.update({ where: { id }, data: { isRead: true } })
  })

  // PATCH /notifications/read-all
  app.patch('/read-all', { preHandler: authenticate }, async (request) => {
    const me = request.user as { id: string }
    await prisma.notification.updateMany({
      where: { OR: [{ userId: me.id }, { userId: null }], isRead: false },
      data: { isRead: true },
    })
    return { ok: true }
  })

  // GET /notifications/count — количество непрочитанных (для колокольчика)
  app.get('/count', { preHandler: authenticate }, async (request) => {
    const me = request.user as { id: string }
    const count = await prisma.notification.count({
      where: {
        OR: [{ userId: me.id }, { userId: null }],
        isRead: false,
      },
    })
    return { count }
  })
}
