import { FastifyInstance } from 'fastify'
import { prisma } from '@tv-shifts/db'
import { authenticate } from '../plugins/auth'

export async function changeLogsRoutes(app: FastifyInstance) {
  // GET /change-logs?entityType=project&entityId=xxx&limit=50
  app.get('/', { preHandler: authenticate }, async (request) => {
    const query = request.query as {
      entityType?: string
      entityId?: string
      limit?: string
    }
    const limit = Math.min(Number(query.limit ?? 50), 200)

    return prisma.changeLog.findMany({
      where: {
        ...(query.entityType && { entityType: query.entityType }),
        ...(query.entityId && { entityId: query.entityId }),
      },
      include: {
        user: { select: { id: true, fullName: true } },
      },
      orderBy: { changedAt: 'desc' },
      take: limit,
    })
  })
}
