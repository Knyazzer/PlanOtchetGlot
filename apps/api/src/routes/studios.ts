import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tv-shifts/db'
import { authenticate } from '../plugins/auth'
import { notify } from '../services/notificationService'

const VALID_STUDIOS = ['znamyanka_kamin', 'znamyanka_black', 'znamyanka_kupol', 'romanov'] as const

const bookingInclude = {
  creator:      { select: { id: true, fullName: true } },
  participants: { include: { user: { select: { id: true, fullName: true } } } },
  workItem:     { select: { id: true, name: true } },
} as const

const bookSchema = z.object({
  studio:         z.enum(VALID_STUDIOS),
  title:          z.string().min(1),
  date:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeFrom:       z.string().optional(),
  timeTo:         z.string().optional(),
  participantIds: z.array(z.string()).optional(),
  wiId:           z.string().optional(),
})

const blockSchema = z.object({
  reason: z.string().optional(),
})

function isAdmin(user: { roles?: string[]; permissions?: string[] }) {
  return user.roles?.includes('admin') || user.permissions?.includes('departments:manage')
}

function timesOverlap(
  aFrom: string | null, aTo: string | null,
  bFrom: string | null, bTo: string | null,
): boolean {
  // If either side has no time specified → treat as full-day conflict
  if (!aFrom || !aTo || !bFrom || !bTo) return true
  return aFrom < bTo && aTo > bFrom
}

export async function studiosRoutes(app: FastifyInstance) {
  // GET /studios/slots?studio=&from=&to=
  app.get('/slots', { preHandler: authenticate }, async (request) => {
    const q = request.query as Record<string, string>
    const where: Record<string, any> = {}
    if (q.studio) where.studio = q.studio
    if (q.from || q.to) {
      where.date = {}
      if (q.from) where.date.gte = new Date(q.from)
      if (q.to)   where.date.lte = new Date(q.to)
    }
    return prisma.studioBooking.findMany({
      where,
      include: bookingInclude,
      orderBy: [{ date: 'asc' }, { timeFrom: 'asc' }],
    })
  })

  // POST /studios/book
  app.post('/book', { preHandler: authenticate }, async (request, reply) => {
    const user     = request.user as { id: string }
    const body     = bookSchema.parse(request.body)
    const bookDate = new Date(body.date)

    const existing = await prisma.studioBooking.findMany({
      where: { studio: body.studio, date: bookDate, status: { not: 'blocked' as any } },
      select: { id: true, timeFrom: true, timeTo: true, createdBy: true },
    })

    const conflict = existing.find((b) =>
      timesOverlap(
        body.timeFrom ?? null, body.timeTo ?? null,
        b.timeFrom ?? null,   b.timeTo   ?? null,
      )
    )

    const status = conflict ? 'preliminary' : 'confirmed'

    const booking = await prisma.studioBooking.create({
      data: {
        studio:    body.studio,
        title:     body.title,
        date:      bookDate,
        timeFrom:  body.timeFrom,
        timeTo:    body.timeTo,
        status:    status as any,
        createdBy: user.id,
        wiId:      body.wiId,
        participants: body.participantIds?.length
          ? { create: body.participantIds.map((uid) => ({ userId: uid })) }
          : undefined,
      },
      include: bookingInclude,
    })

    if (conflict) {
      await notify(
        'studio_conflict',
        `Конфликт бронирования студии ${body.studio} на ${body.date}`,
        [user.id, conflict.createdBy],
        'StudioBooking',
        booking.id,
      )
    }

    return reply.code(201).send(booking)
  })

  // PATCH /studios/bookings/:id/block
  app.patch('/bookings/:id/block', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as { roles?: string[]; permissions?: string[] }
    if (!isAdmin(user)) return reply.code(403).send({ error: 'Forbidden' })

    const { id } = request.params as { id: string }
    const body   = blockSchema.parse(request.body)

    const existing = await prisma.studioBooking.findUnique({ where: { id } })
    if (!existing) return reply.code(404).send({ error: 'Not found' })

    return prisma.studioBooking.update({
      where: { id },
      data:  { status: 'blocked' as any, reason: body.reason },
      include: bookingInclude,
    })
  })

  // DELETE /studios/bookings/:id
  app.delete('/bookings/:id', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as { id: string; roles?: string[]; permissions?: string[] }
    const { id } = request.params as { id: string }

    const existing = await prisma.studioBooking.findUnique({ where: { id } })
    if (!existing) return reply.code(404).send({ error: 'Not found' })
    if (existing.createdBy !== user.id && !isAdmin(user))
      return reply.code(403).send({ error: 'Forbidden' })

    await prisma.studioBookingParticipant.deleteMany({ where: { bookingId: id } })
    await prisma.studioBooking.delete({ where: { id } })
    return reply.code(204).send()
  })
}
