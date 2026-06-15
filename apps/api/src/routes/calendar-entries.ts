import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@nexus/db'
import { authenticate } from '../plugins/auth'
import { hasModule } from '../services/access'

// Запись календаря требует модуль по типу: hr_* — отсутствия (HR), прочие — общий календарь.
// КИТ 1: «HR заносит больничный другому» — сценарий С-3 спеки docs/RBAC-MODEL.md.
function requiredModule(type: string): string {
  return type.startsWith('hr_') ? 'hr.absences' : 'adm.calendar-global'
}

const VALID_TYPES = [
  'global',
  'znamenka_kaminoka',
  'znamenka_chernaya',
  'znamenka_kupol',
  'hr_sick',
  'hr_vacation',
  'hr_unpaid',
  'hr_dayoff',
] as const

const ENTRY_SELECT = {
  id: true,
  type: true,
  title: true,
  description: true,
  date: true,
  startTime: true,
  endTime: true,
  isAllDay: true,
  targetUserId: true,
  targetUser: { select: { id: true, name: true } },
  createdById: true,
  createdBy: { select: { id: true, name: true } },
  createdAt: true,
} as const

export async function calendarEntriesRoutes(app: FastifyInstance) {

  // GET /calendar-entries?from=YYYY-MM-DD&to=YYYY-MM-DD
  app.get('/', { preHandler: authenticate }, async (request) => {
    const { from, to } = request.query as { from?: string; to?: string }

    const dateFilter = from && to
      ? { date: { gte: new Date(from), lte: new Date(to) } }
      : {}

    return prisma.calendarEntry.findMany({
      where: dateFilter,
      select: ENTRY_SELECT,
      orderBy: [{ date: 'asc' }],
    })
  })

  // POST /calendar-entries — модуль по типу (hr.absences / adm.calendar-global) или admin
  app.post('/', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string; isAdmin: boolean }

    const schema = z.object({
      type:         z.enum(VALID_TYPES),
      title:        z.string().min(1).max(200),
      description:  z.string().default(''),
      date:         z.string(),
      startTime:    z.string().regex(/^\d{2}:\d{2}$/).optional(),
      endTime:      z.string().regex(/^\d{2}:\d{2}$/).optional(),
      isAllDay:     z.boolean().default(false),
      targetUserId: z.string().uuid().optional(),
    })
    const body = schema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })

    if (!(await hasModule(user.id, user.isAdmin, requiredModule(body.data.type)))) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const entry = await prisma.calendarEntry.create({
      data: {
        ...body.data,
        date: new Date(body.data.date),
        createdById: user.id,
      },
      select: ENTRY_SELECT,
    })

    return reply.code(201).send(entry)
  })

  // PATCH /calendar-entries/:id — модуль по типу записи или admin
  app.patch('/:id', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string; isAdmin: boolean }

    const { id } = request.params as { id: string }
    const schema = z.object({
      type:         z.enum(VALID_TYPES).optional(),
      title:        z.string().min(1).max(200).optional(),
      description:  z.string().optional(),
      date:         z.string().optional(),
      startTime:    z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
      endTime:      z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
      isAllDay:     z.boolean().optional(),
      targetUserId: z.string().uuid().nullable().optional(),
    })
    const body = schema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })

    const entry = await prisma.calendarEntry.findUnique({ where: { id }, select: { id: true, type: true } })
    if (!entry) return reply.code(404).send({ error: 'Not found' })

    if (!(await hasModule(user.id, user.isAdmin, requiredModule(body.data.type ?? entry.type)))) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const { date, ...rest } = body.data
    const updated = await prisma.calendarEntry.update({
      where: { id },
      data: { ...rest, ...(date && { date: new Date(date) }) },
      select: ENTRY_SELECT,
    })

    return updated
  })

  // DELETE /calendar-entries/:id — модуль по типу записи или admin
  app.delete('/:id', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string; isAdmin: boolean }

    const { id } = request.params as { id: string }
    const entry = await prisma.calendarEntry.findUnique({ where: { id }, select: { id: true, type: true } })
    if (!entry) return reply.code(404).send({ error: 'Not found' })

    if (!(await hasModule(user.id, user.isAdmin, requiredModule(entry.type)))) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    await prisma.calendarEntry.delete({ where: { id } })
    return reply.code(204).send()
  })
}
