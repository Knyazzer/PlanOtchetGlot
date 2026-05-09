import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tv-shifts/db'
import { authenticate } from '../plugins/auth'
import { notify } from '../services/notificationService'

const hrInclude = {
  user:     { select: { id: true, fullName: true } },
  approver: { select: { id: true, fullName: true } },
} as const

const createSchema = z.object({
  type:     z.enum(['vacation', 'sick', 'remote', 'business_trip', 'day_off']),
  dateFrom: z.string().min(1),
  dateTo:   z.string().min(1),
  notes:    z.string().optional(),
})

const approveSchema = z.object({
  approved: z.boolean(),
})

function isAdmin(user: { roles?: string[]; permissions?: string[] }) {
  return user.roles?.includes('admin') || user.permissions?.includes('users:manage')
}

export async function hrStatusesRoutes(app: FastifyInstance) {
  // GET /hr-statuses?userId=&from=&to=&status=
  app.get('/', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as { id: string; roles?: string[]; permissions?: string[] }
    const q    = request.query as Record<string, string>

    const where: Record<string, any> = {}
    if (!isAdmin(user)) where.userId = user.id
    if (q.userId && isAdmin(user)) where.userId = q.userId
    const validStatuses = ['pending', 'approved', 'rejected']
    if (q.status) {
      if (!validStatuses.includes(q.status)) {
        return reply.code(400).send({ error: 'Invalid status value' })
      }
      where.status = q.status
    }
    if (q.from || q.to) {
      // records that overlap with [from, to]: dateFrom <= to AND dateTo >= from
      const conditions: any[] = []
      if (q.to)   conditions.push({ dateFrom: { lte: new Date(q.to) } })
      if (q.from) conditions.push({ dateTo:   { gte: new Date(q.from) } })
      if (conditions.length === 1) {
        Object.assign(where, conditions[0])
      } else if (conditions.length === 2) {
        where.AND = conditions
      }
    }

    return prisma.hRStatus.findMany({
      where,
      include: hrInclude,
      orderBy: { createdAt: 'desc' },
    })
  })

  // POST /hr-statuses
  app.post('/', { preHandler: authenticate }, async (request, reply) => {
    const user  = request.user as { id: string }
    const body  = createSchema.parse(request.body)

    const record = await prisma.hRStatus.create({
      data: {
        userId:   user.id,
        type:     body.type as any,
        dateFrom: new Date(body.dateFrom),
        dateTo:   new Date(body.dateTo),
        notes:    body.notes,
      },
      include: hrInclude,
    })

    const admins = await prisma.userAppRole.findMany({
      where: { role: { name: 'admin' } },
      select: { userId: true },
    })
    await notify(
      'hr_request_created',
      `Новая HR-заявка от ${record.user.fullName}`,
      admins.map((a) => a.userId),
      'HRStatus',
      record.id,
    )

    return reply.code(201).send(record)
  })

  // PATCH /hr-statuses/:id/approve
  app.patch('/:id/approve', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as { id: string; roles?: string[]; permissions?: string[] }
    if (!isAdmin(user)) return reply.code(403).send({ error: 'Forbidden' })

    const { id } = request.params as { id: string }
    const body   = approveSchema.parse(request.body)

    const existing = await prisma.hRStatus.findUnique({ where: { id } })
    if (!existing) return reply.code(404).send({ error: 'Not found' })

    const updated = await prisma.hRStatus.update({
      where: { id },
      data: {
        status:     (body.approved ? 'approved' : 'rejected') as any,
        approverId: user.id,
        approvedAt: new Date(),
      },
      include: hrInclude,
    })

    await notify(
      'hr_request_resolved',
      `Ваша HR-заявка ${body.approved ? 'одобрена' : 'отклонена'}`,
      [existing.userId],
      'HRStatus',
      id,
    )

    return updated
  })

  // DELETE /hr-statuses/:id
  app.delete('/:id', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as { id: string; roles?: string[]; permissions?: string[] }
    const { id } = request.params as { id: string }

    const existing = await prisma.hRStatus.findUnique({ where: { id } })
    if (!existing) return reply.code(404).send({ error: 'Not found' })
    if (existing.userId !== user.id && !isAdmin(user))
      return reply.code(403).send({ error: 'Forbidden' })
    if (existing.status !== 'pending' && !isAdmin(user))
      return reply.code(400).send({ error: 'Can only cancel pending requests' })

    await prisma.hRStatus.delete({ where: { id } })
    return reply.code(204).send()
  })
}
