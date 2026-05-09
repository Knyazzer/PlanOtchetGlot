import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tv-shifts/db'
import { authenticate } from '../plugins/auth'

const eventInclude = {
  creator:      { select: { id: true, fullName: true } },
  participants: { include: { user: { select: { id: true, fullName: true } } } },
} as const

export async function calendarEventsRoutes(app: FastifyInstance) {

  // GET /calendar/events?deptId=&from=&to=
  // Returns: dept events + global events + events where a dept member is a participant
  app.get('/', { preHandler: authenticate }, async (request, reply) => {
    const q = z.object({
      deptId: z.string().optional(),
      from:   z.string().optional(),
      to:     z.string().optional(),
    }).safeParse(request.query)
    if (!q.success) return reply.code(400).send({ error: 'Invalid query' })

    const { deptId, from, to } = q.data
    const fromDate = from ? new Date(from) : undefined
    const toDate   = to   ? new Date(to)   : undefined

    let memberUserIds: string[] = []
    if (deptId) {
      const members = await prisma.deptMember.findMany({
        where: { deptId },
        select: { userId: true },
      })
      memberUserIds = members.map((m) => m.userId)
    }

    return prisma.calendarEvent.findMany({
      where: {
        ...(fromDate || toDate ? {
          date: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate   ? { lte: toDate   } : {}),
          },
        } : {}),
        OR: [
          ...(deptId ? [{ deptId }] : []),
          { isGlobal: true },
          ...(memberUserIds.length > 0
            ? [{ participants: { some: { userId: { in: memberUserIds } } } }]
            : []),
        ],
      },
      include:  eventInclude,
      orderBy:  { date: 'asc' },
    })
  })

  // POST /calendar/events
  // isGlobal requires admin/departments:manage permission
  app.post('/', { preHandler: authenticate }, async (request, reply) => {
    const body = z.object({
      title:          z.string().min(1),
      date:           z.string(),
      timeFrom:       z.string().optional(),
      timeTo:         z.string().optional(),
      deptId:         z.string().optional(),
      isGlobal:       z.boolean().optional(),
      participantIds: z.array(z.string()).optional(),
    }).safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })

    const user = request.user as any
    const { participantIds, ...rest } = body.data

    if (rest.isGlobal && !user.roles?.includes('admin') && !user.permissions?.includes('departments:manage')) {
      return reply.code(403).send({ error: 'Only admins can create global events' })
    }

    const event = await prisma.calendarEvent.create({
      data: {
        title:    rest.title,
        date:     new Date(rest.date),
        timeFrom: rest.timeFrom,
        timeTo:   rest.timeTo,
        deptId:   rest.deptId,
        isGlobal: rest.isGlobal ?? false,
        creatorId: user.id,
        ...(participantIds?.length ? {
          participants: {
            createMany: {
              data: participantIds.map((userId) => ({ userId })),
              skipDuplicates: true,
            },
          },
        } : {}),
      },
      include: eventInclude,
    })

    return reply.code(201).send(event)
  })

  // PATCH /calendar/events/:id — creator or admin only
  app.patch('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      title:    z.string().min(1).optional(),
      date:     z.string().optional(),
      timeFrom: z.string().nullable().optional(),
      timeTo:   z.string().nullable().optional(),
      deptId:   z.string().nullable().optional(),
      isGlobal: z.boolean().optional(),
    }).safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input' })

    const user = request.user as any
    const event = await prisma.calendarEvent.findUnique({ where: { id } })
    if (!event) return reply.code(404).send({ error: 'Event not found' })

    const isCreator = event.creatorId === user.id
    const isAdmin   = user.roles?.includes('admin') || user.permissions?.includes('departments:manage')
    if (!isCreator && !isAdmin) return reply.code(403).send({ error: 'Forbidden' })

    const data = body.data
    const updated = await prisma.calendarEvent.update({
      where: { id },
      data: {
        ...data,
        ...(data.date ? { date: new Date(data.date) } : {}),
      },
      include: eventInclude,
    })

    return reply.code(200).send(updated)
  })

  // DELETE /calendar/events/:id — creator or admin only
  app.delete('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const user = request.user as any
    const event = await prisma.calendarEvent.findUnique({ where: { id } })
    if (!event) return reply.code(404).send({ error: 'Event not found' })

    const isCreator = event.creatorId === user.id
    const isAdmin   = user.roles?.includes('admin') || user.permissions?.includes('departments:manage')
    if (!isCreator && !isAdmin) return reply.code(403).send({ error: 'Forbidden' })

    await prisma.calendarEvent.delete({ where: { id } })
    return reply.code(204).send()
  })
}
