import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tv-shifts/db'
import { authenticate, requireRole } from '../plugins/auth'

const createProjectSchema = z.object({
  client: z.string().optional(),
  name: z.string().min(1),
  execProducer: z.string().optional(),
  lineProducer: z.string().optional(),
  accountManager: z.string().optional(),
  date: z.string().datetime().optional(),
  dateApproximate: z.string().optional(),
  time: z.string().optional(),
  format: z.string().optional(),
  location: z.string().optional(),
})

const updateProjectSchema = createProjectSchema.partial().extend({
  status: z.enum(['preliminary', 'ready', 'completed', 'manual']).optional(),
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

    const project = await prisma.project.create({
      data: {
        ...body.data,
        date: body.data.date ? new Date(body.data.date) : undefined,
        status: 'manual',
        source: 'manual',
      },
    })

    return reply.code(201).send(project)
  })

  // PATCH /projects/:id
  app.patch('/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = updateProjectSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })
    }

    const data: any = { ...body.data }
    if (data.date) data.date = new Date(data.date)

    const project = await prisma.project.update({ where: { id }, data })
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
