import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tv-shifts/db'
import { authenticate } from '../plugins/auth'
import { requirePermission } from '../config/permissions'
import { logChanges } from '../services/changeLog'

const createSchema = z.object({
  name:             z.string().min(1),
  client:           z.string().nullable().optional(),
  accountManagerId: z.string().nullable().optional(),
  status:           z.enum(['draft', 'active', 'done', 'cancelled', 'rejected']).optional(),
})

const updateSchema = createSchema.partial().extend({
  financialFlag: z.enum(['pending', 'paid']).optional(),
})

const createWiSchema = z.object({
  name:     z.string().min(1),
  format:   z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  date:     z.string().nullable().optional(),
  notes:    z.string().nullable().optional(),
  status:   z.enum(['draft', 'active', 'done', 'cancelled', 'rejected']).optional(),
})

export async function projectsRoutes(app: FastifyInstance) {

  // GET /projects
  app.get('/', { preHandler: authenticate }, async (request) => {
    const { status, client, search, withWorkItems } = request.query as Record<string, string>
    const where: any = {
      ...(status && { status: status as any }),
      ...(client && { client: { contains: client, mode: 'insensitive' } }),
      ...(search && {
        OR: [
          { name:   { contains: search, mode: 'insensitive' } },
          { client: { contains: search, mode: 'insensitive' } },
        ],
      }),
    }
    const include: any = {
      accountManager: { select: { id: true, fullName: true } },
      ...(withWorkItems === 'true' && {
        workItems: {
          where: { parentWiId: null, NOT: { source: 'separator' as any } },
          orderBy: { createdAt: 'asc' as const },
        },
      }),
    }
    return prisma.project.findMany({ where, include, orderBy: { createdAt: 'desc' } })
  })

  // POST /projects
  app.post('/', { preHandler: requirePermission('projects:write') }, async (request, reply) => {
    const body = createSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })

    const project = await prisma.project.create({
      data: {
        name:             body.data.name,
        client:           body.data.client ?? null,
        accountManagerId: body.data.accountManagerId ?? null,
        status:           (body.data.status ?? 'draft') as any,
      },
    })
    return reply.code(201).send(project)
  })

  // GET /projects/:id
  app.get('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        accountManager: { select: { id: true, fullName: true } },
        workItems: {
          where: { parentWiId: null, NOT: { source: 'separator' as any } },
          include: { days: { orderBy: { date: 'asc' } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    })
    if (!project) return reply.code(404).send({ error: 'Project not found' })
    return project
  })

  // PATCH /projects/:id
  app.patch('/:id', { preHandler: requirePermission('projects:write') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const me = request.user as { id: string }
    const body = updateSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })

    const before = await prisma.project.findUnique({ where: { id } })
    if (!before) return reply.code(404).send({ error: 'Project not found' })

    const project = await prisma.project.update({
      where: { id },
      data: body.data as any,
      include: { accountManager: { select: { id: true, fullName: true } } },
    })
    await logChanges('project', id, before as any, body.data as any, me.id)
    return project
  })

  // DELETE /projects/:id
  app.delete('/:id', { preHandler: requirePermission('projects:write') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const exists = await prisma.project.findUnique({ where: { id }, select: { id: true } })
    if (!exists) return reply.code(404).send({ error: 'Project not found' })
    await prisma.project.delete({ where: { id } })
    return reply.code(204).send()
  })

  // GET /projects/:id/work-items
  app.get('/:id/work-items', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const project = await prisma.project.findUnique({ where: { id }, select: { id: true } })
    if (!project) return reply.code(404).send({ error: 'Project not found' })
    return prisma.workItem.findMany({
      where: { projectId: id, parentWiId: null, NOT: { source: 'separator' as any } },
      include: { days: { orderBy: { date: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    })
  })

  // POST /projects/:id/work-items
  app.post('/:id/work-items', { preHandler: requirePermission('projects:write') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = createWiSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })

    const project = await prisma.project.findUnique({ where: { id }, select: { id: true } })
    if (!project) return reply.code(404).send({ error: 'Project not found' })

    const wi = await prisma.workItem.create({
      data: {
        projectId: id,
        name:      body.data.name,
        format:    body.data.format ?? null,
        location:  body.data.location ?? null,
        date:      body.data.date ? new Date(body.data.date) : null,
        notes:     body.data.notes ?? null,
        status:    (body.data.status ?? 'draft') as any,
        source:    'manual' as any,
      },
    })
    return reply.code(201).send(wi)
  })
}
