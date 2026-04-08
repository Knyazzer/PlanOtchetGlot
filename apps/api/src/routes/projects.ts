import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tv-shifts/db'
import { authenticate, requireRole } from '../plugins/auth'
import { logChanges } from '../services/changeLog'

const daySchema = z.object({
  id: z.string().optional(),
  date: z.string(),
  type: z.enum(['zastroyka', 'efir']),
  startTime: z.string().nullable().optional(),
})

const createProjectSchema = z.object({
  name: z.string().min(1),
  client: z.string().nullable().optional(),
  execProducer: z.string().nullable().optional(),
  lineProducer: z.string().nullable().optional(),
  accountManager: z.string().nullable().optional(),
  efirDate: z.string().nullable().optional(),
  zastroykDate: z.string().nullable().optional(),
  date: z.string().datetime().nullable().optional(),
  dateApproximate: z.string().nullable().optional(),
  time: z.string().nullable().optional(),
  format: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  days: z.array(daySchema).optional(),
})

const updateProjectSchema = createProjectSchema.partial().extend({
  status: z.enum(['request','negotiation','preproduction','production','postproduction','delivered','rejected','cancelled','manual']).optional(),
  dateConfirmed: z.boolean().optional(),
})

export async function projectsRoutes(app: FastifyInstance) {
  // GET /projects
  app.get('/', { preHandler: authenticate }, async (request) => {
    const query = request.query as {
      dateFrom?: string
      dateTo?: string
      status?: string
      search?: string
    }

    return prisma.project.findMany({
      where: {
        NOT: { source: 'separator' as any },
        ...(query.dateFrom && { date: { gte: new Date(query.dateFrom) } }),
        ...(query.dateTo && { date: { lte: new Date(query.dateTo) } }),
        ...(query.status && { status: query.status as any }),
        ...(query.search && {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { client: { contains: query.search, mode: 'insensitive' } },
          ],
        }),
      },
      include: {
        matrixRegistry: true,
        assignments: {
          include: { user: { select: { id: true, fullName: true, role: true } } },
        },
        days: { orderBy: { date: 'asc' } },
      },
      orderBy: { date: 'asc' },
    })
  })

  // GET /projects/:id
  app.get('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        matrixRegistry: true,
        assignments: {
          include: {
            user: { select: { id: true, fullName: true, role: true } },
            shiftEntries: true,
          },
        },
        days: { orderBy: { date: 'asc' } },
      },
    })
    if (!project) return reply.code(404).send({ error: 'Project not found' })
    return project
  })

  // POST /projects — ручное создание (admin only)
  app.post('/', { preHandler: requireRole('admin') }, async (request, reply) => {
    const body = createProjectSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })
    }

    const { days, efirDate, zastroykDate, ...projectData } = body.data

    // Собираем дни: из efirDate/zastroykDate или из явного массива days
    const autoDays: { date: Date; type: 'efir' | 'zastroyka' }[] = []
    if (zastroykDate) autoDays.push({ date: new Date(zastroykDate), type: 'zastroyka' })
    if (efirDate)     autoDays.push({ date: new Date(efirDate), type: 'efir' })
    const allDays = autoDays.length > 0 ? autoDays : (days ?? []).map((d) => ({ date: new Date(d.date), type: d.type as 'efir' | 'zastroyka' }))

    // project.date = наименьшая из дат (для сортировки и календаря)
    const earliestDate = allDays.length > 0
      ? allDays.reduce((min, d) => d.date < min ? d.date : min, allDays[0].date)
      : projectData.date ? new Date(projectData.date) : undefined

    const project = await prisma.project.create({
      data: {
        ...projectData,
        date: earliestDate ?? undefined,
        status: 'manual',
        source: 'manual',
        days: allDays.length > 0
          ? { create: allDays.map((d) => ({ date: d.date, type: d.type, startTime: null })) }
          : undefined,
      },
      include: { days: { orderBy: { date: 'asc' } } },
    })

    return reply.code(201).send(project)
  })

  // PATCH /projects/:id
  app.patch('/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const me = request.user as { id: string }
    const body = updateProjectSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })
    }

    const before = await prisma.project.findUnique({ where: { id } })
    if (!before) return reply.code(404).send({ error: 'Project not found' })

    const { days, ...projectFields } = body.data
    const data: any = { ...projectFields }
    if (data.date) data.date = new Date(data.date)

    // Если переданы дни — полностью заменяем (delete all + create new)
    if (days !== undefined) {
      await prisma.projectDay.deleteMany({ where: { projectId: id } })
      if (days.length > 0) {
        await prisma.projectDay.createMany({
          data: days.map((d) => ({
            projectId: id,
            date: new Date(d.date),
            type: d.type,
            startTime: d.startTime ?? null,
          })),
        })
      }
    }

    const project = await prisma.project.update({
      where: { id },
      data,
      include: { days: { orderBy: { date: 'asc' } } },
    })

    await logChanges('project', id, before as any, projectFields as any, me.id)

    return project
  })

  // DELETE /projects/:id
  app.delete('/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.project.delete({ where: { id } })
    return { ok: true }
  })

  // GET /projects/conflicts — найти конфликты (один сотрудник, два проекта в один день)
  app.get('/conflicts', { preHandler: authenticate }, async (request) => {
    const query = request.query as { dateFrom?: string; dateTo?: string }

    const shifts = await prisma.shiftEntry.findMany({
      where: {
        ...(query.dateFrom && { date: { gte: new Date(query.dateFrom) } }),
        ...(query.dateTo && { date: { lte: new Date(query.dateTo) } }),
      },
      include: {
        user: { select: { id: true, fullName: true } },
        project: { select: { id: true, name: true, client: true } },
      },
      orderBy: [{ userId: 'asc' }, { date: 'asc' }],
    })

    // Группируем по userId + date, ищем дубли
    const map = new Map<string, typeof shifts>()
    for (const shift of shifts) {
      const key = `${shift.userId}_${shift.date.toISOString().split('T')[0]}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(shift)
    }

    const conflicts = []
    for (const [, entries] of map) {
      if (entries.length > 1) {
        conflicts.push({
          user: entries[0].user,
          date: entries[0].date,
          shifts: entries.map((e) => ({ shiftId: e.id, project: e.project, shiftType: e.shiftType })),
        })
      }
    }

    return conflicts
  })
}
