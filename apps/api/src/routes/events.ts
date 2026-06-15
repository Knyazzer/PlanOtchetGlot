import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@nexus/db'
import { authenticate } from '../plugins/auth'
import { randomUUID } from 'crypto'

const EVENT_SELECT = {
  id: true,
  type: true,
  title: true,
  description: true,
  date: true,
  startTime: true,
  endTime: true,
  location: true,
  status: true,
  authorId: true,
  author: { select: { id: true, name: true } },
  participants: { select: { userId: true, user: { select: { id: true, name: true } } } },
  createdAt: true,
  updatedAt: true,
} as const

const bodySchema = z.object({
  type:           z.enum(['meeting', 'task', 'personal']),
  title:          z.string().min(1).max(200),
  description:    z.string().default(''),
  date:           z.string(),
  startTime:      z.string().regex(/^\d{2}:\d{2}$/),
  endTime:        z.string().regex(/^\d{2}:\d{2}$/),
  location:       z.array(z.string()).default([]),
  participantIds: z.array(z.string().uuid()).default([]),
})

export async function eventsRoutes(app: FastifyInstance) {

  // GET /events?from=YYYY-MM-DD&to=YYYY-MM-DD
  app.get('/', { preHandler: authenticate }, async (request) => {
    const user = (request as any).user as { id: string }
    const { from, to } = request.query as { from?: string; to?: string }

    const dateFilter = from && to
      ? { date: { gte: new Date(from), lte: new Date(to) } }
      : {}

    return prisma.event.findMany({
      where: {
        OR: [
          { authorId: user.id },
          { participants: { some: { userId: user.id } } },
        ],
        ...dateFilter,
      },
      select: EVENT_SELECT,
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    })
  })

  // GET /events/:id
  app.get('/:id', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string }
    const { id } = request.params as { id: string }
    const ev = await prisma.event.findUnique({ where: { id }, select: EVENT_SELECT })
    if (!ev) return reply.code(404).send({ error: 'Not found' })

    const isInvolved = ev.authorId === user.id
      || ev.participants.some(p => p.userId === user.id)
      || await prisma.task.count({ where: { calendarEventId: id, assigneeId: user.id } }).then(n => n > 0)
    if (!isInvolved) return reply.code(403).send({ error: 'Forbidden' })

    return ev
  })

  // POST /events
  app.post('/', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string }
    const body = bodySchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })

    const { type, title, description, date, startTime, endTime, location, participantIds } = body.data

    const ev = await prisma.event.create({
      data: {
        type, title, description,
        date: new Date(date),
        startTime, endTime, location,
        authorId: user.id,
        participants: {
          create: participantIds
            .filter(uid => uid !== user.id)
            .map(uid => ({ userId: uid })),
        },
      },
      select: EVENT_SELECT,
    })

    // Auto-create a task for each person involved (author + participants)
    const allAssignees = [user.id, ...participantIds.filter(uid => uid !== user.id)]
    const eventDate = new Date(date)
    const [startH, startM] = startTime.split(':').map(Number)
    const [endH,   endM]   = endTime.split(':').map(Number)
    const calendarEventStart = new Date(eventDate)
    calendarEventStart.setHours(startH, startM, 0, 0)
    const calendarEventEnd = new Date(eventDate)
    calendarEventEnd.setHours(endH, endM, 0, 0)

    await Promise.all(allAssignees.map(assigneeId =>
      prisma.task.create({
        data: {
          id: randomUUID(),
          title,
          description,
          assignedById: user.id,
          assigneeId,
          startDate: calendarEventStart,
          deadline: eventDate,
          calendarEventId: ev.id,
          calendarEventEnd,
          seenAt: assigneeId === user.id ? new Date() : null,
        },
      })
    ))

    return reply.code(201).send(ev)
  })

  // PATCH /events/:id
  app.patch('/:id', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string }
    const { id } = request.params as { id: string }

    const schema = z.object({
      type:           z.enum(['meeting', 'task', 'personal']).optional(),
      title:          z.string().min(1).max(200).optional(),
      description:    z.string().optional(),
      date:           z.string().optional(),
      startTime:      z.string().regex(/^\d{2}:\d{2}$/).optional(),
      endTime:        z.string().regex(/^\d{2}:\d{2}$/).optional(),
      location:       z.array(z.string()).optional(),
      status:         z.enum(['pending', 'done']).optional(),
      participantIds: z.array(z.string().uuid()).optional(),
    })
    const body = schema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })

    const ev = await prisma.event.findUnique({
      where: { id },
      select: { authorId: true, date: true, startTime: true, endTime: true },
    })
    if (!ev) return reply.code(404).send({ error: 'Not found' })
    if (ev.authorId !== user.id) return reply.code(403).send({ error: 'Forbidden' })

    const { participantIds, date, location, ...rest } = body.data

    const updated = await prisma.event.update({
      where: { id },
      data: {
        ...rest,
        ...(date && { date: new Date(date) }),
        ...(location !== undefined && { location }),
        ...(participantIds !== undefined && {
          participants: {
            deleteMany: {},
            create: participantIds
              .filter(uid => uid !== ev.authorId)
              .map(uid => ({ userId: uid })),
          },
        }),
      },
      select: EVENT_SELECT,
    })

    // Sync linked tasks when event timing or title changes
    const newDate      = date      ? new Date(date)       : ev.date
    const newStartTime = body.data.startTime ?? ev.startTime
    const newEndTime   = body.data.endTime   ?? ev.endTime
    const [sH, sM]     = newStartTime.split(':').map(Number)
    const [eH, eM]     = newEndTime.split(':').map(Number)
    const newStart = new Date(newDate); newStart.setHours(sH, sM, 0, 0)
    const newEnd   = new Date(newDate); newEnd.setHours(eH, eM, 0, 0)

    const taskPatch: Record<string, unknown> = {
      startDate:        newStart,
      calendarEventEnd: newEnd,
      deadline:         newDate,
    }
    if (body.data.title !== undefined) taskPatch.title = body.data.title

    await prisma.task.updateMany({
      where: { calendarEventId: id },
      data: taskPatch,
    })

    return updated
  })

  // DELETE /events/:id
  app.delete('/:id', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string; isAdmin: boolean }
    const { id } = request.params as { id: string }

    const ev = await prisma.event.findUnique({ where: { id }, select: { authorId: true } })
    if (!ev) return reply.code(404).send({ error: 'Not found' })
    if (ev.authorId !== user.id && !user.isAdmin) return reply.code(403).send({ error: 'Forbidden' })

    await prisma.task.deleteMany({ where: { calendarEventId: id } })
    await prisma.event.delete({ where: { id } })
    return reply.code(204).send()
  })
}
