import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireRole } from '../plugins/auth'
import { prisma } from '@nexus/db'

const USER_SELECT = { select: { id: true, name: true } }

const DIVISION_SELECT = {
  select: {
    id: true, name: true,
    department: { select: { id: true, name: true, color: true } },
  },
}

const PROJECT_SELECT = {
  id: true, title: true, status: true, brief: true, kpLink: true,
  createdAt: true, updatedAt: true,
  client:   { select: { id: true, name: true } },
  producer: USER_SELECT,
  _count:   { select: { workItems: true } },
}

const WORK_ITEM_SELECT = {
  id: true, title: true, description: true, status: true,
  date: true, format: true, location: true, budget: true,
  createdAt: true, updatedAt: true,
  execProducer:   USER_SELECT,
  lineProducer:   USER_SELECT,
  accountManager: USER_SELECT,
  departments: { select: { division: DIVISION_SELECT } },
  _count: { select: { tracks: true, expenses: true } },
}

const EXPENSE_SELECT = {
  id: true, amount: true, category: true, description: true, date: true,
  createdAt: true, updatedAt: true,
  createdBy: USER_SELECT,
}

const createProjectSchema = z.object({
  title:      z.string().min(1),
  clientId:   z.string().optional(),
  producerId: z.string().optional(),
  brief:      z.string().optional(),
  kpLink:     z.string().optional(),
  status:     z.enum(['draft', 'active', 'done', 'cancelled']).optional(),
})

const updateProjectSchema = createProjectSchema.partial()

const createWorkItemSchema = z.object({
  title:           z.string().min(1),
  description:     z.string().optional(),
  date:            z.string().optional(),
  format:          z.string().optional(),
  location:        z.string().optional(),
  budget:          z.number().optional(),
  status:          z.enum(['request', 'active', 'done', 'rejected', 'cancelled']).optional(),
  execProducerId:  z.string().optional(),
  lineProducerId:  z.string().optional(),
  accountManagerId: z.string().optional(),
})

const updateWorkItemSchema = createWorkItemSchema.partial()

export async function projectsRoutes(app: FastifyInstance) {

  // ── Projects ──────────────────────────────────────────────────────────────

  // GET /projects
  app.get('/', { preHandler: authenticate }, async (req) => {
    const { status, clientId, search } = req.query as Record<string, string>
    return prisma.project.findMany({
      where: {
        ...(status   ? { status: status as any } : {}),
        ...(clientId ? { clientId } : {}),
        ...(search   ? { title: { contains: search, mode: 'insensitive' } } : {}),
      },
      select: PROJECT_SELECT,
      orderBy: { updatedAt: 'desc' },
    })
  })

  // GET /projects/:id
  app.get('/:id', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const project = await prisma.project.findUnique({
      where: { id },
      select: { ...PROJECT_SELECT, workItems: { select: WORK_ITEM_SELECT, orderBy: { createdAt: 'asc' } } },
    })
    if (!project) return reply.code(404).send({ error: 'Проект не найден' })
    return project
  })

  // POST /projects
  app.post('/', { preHandler: authenticate }, async (req, reply) => {
    const parsed = createProjectSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'validation', details: parsed.error.flatten() })
    return prisma.project.create({ data: parsed.data, select: PROJECT_SELECT })
  })

  // PATCH /projects/:id
  app.patch('/:id', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const parsed = updateProjectSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'validation', details: parsed.error.flatten() })
    const project = await prisma.project.findUnique({ where: { id } })
    if (!project) return reply.code(404).send({ error: 'Проект не найден' })
    return prisma.project.update({ where: { id }, data: parsed.data, select: PROJECT_SELECT })
  })

  // DELETE /projects/:id
  app.delete('/:id', { preHandler: requireRole('admin') }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const project = await prisma.project.findUnique({ where: { id } })
    if (!project) return reply.code(404).send({ error: 'Проект не найден' })
    await prisma.project.delete({ where: { id } })
    return { ok: true }
  })

  // ── Work Items (nested) ───────────────────────────────────────────────────

  // GET /projects/:id/work-items
  app.get('/:id/work-items', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const project = await prisma.project.findUnique({ where: { id } })
    if (!project) return reply.code(404).send({ error: 'Проект не найден' })
    return prisma.workItem.findMany({
      where: { projectId: id },
      select: WORK_ITEM_SELECT,
      orderBy: { createdAt: 'asc' },
    })
  })

  // POST /projects/:id/work-items
  app.post('/:id/work-items', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const project = await prisma.project.findUnique({ where: { id } })
    if (!project) return reply.code(404).send({ error: 'Проект не найден' })
    const parsed = createWorkItemSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'validation', details: parsed.error.flatten() })
    return prisma.workItem.create({
      data: { ...parsed.data, projectId: id },
      select: WORK_ITEM_SELECT,
    })
  })
}

export async function workItemsRoutes(app: FastifyInstance) {

  // GET /work-items — all work items across all projects (workflow view)
  app.get('/', { preHandler: authenticate }, async (req) => {
    const { status, projectId, producerId, search } = req.query as Record<string, string>
    return prisma.workItem.findMany({
      where: {
        ...(status    ? { status: status as any } : {}),
        ...(projectId ? { projectId } : {}),
        ...(producerId ? {
          OR: [
            { execProducerId: producerId },
            { lineProducerId: producerId },
            { accountManagerId: producerId },
          ],
        } : {}),
        ...(search ? { title: { contains: search, mode: 'insensitive' } } : {}),
      },
      select: {
        ...WORK_ITEM_SELECT,
        project: { select: { id: true, title: true, client: { select: { id: true, name: true } } } },
      },
      orderBy: [{ status: 'asc' }, { date: 'asc' }, { createdAt: 'desc' }],
    })
  })

  // GET /work-items/:id
  app.get('/:id', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const item = await prisma.workItem.findUnique({
      where: { id },
      select: {
        ...WORK_ITEM_SELECT,
        project: { select: { id: true, title: true } },
        tracks: {
          select: {
            id: true, title: true, status: true, workItemId: true,
            leader: USER_SELECT,
            tasks: { select: { status: true } },
            stages: { select: { tasks: { select: { status: true } } } },
          },
        },
        expenses: {
          select: EXPENSE_SELECT,
          orderBy: { createdAt: 'desc' },
        },
      },
    })
    if (!item) return reply.code(404).send({ error: 'Work Item не найден' })
    return item
  })

  // PATCH /work-items/:id
  app.patch('/:id', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const parsed = updateWorkItemSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'validation', details: parsed.error.flatten() })
    const item = await prisma.workItem.findUnique({ where: { id } })
    if (!item) return reply.code(404).send({ error: 'Work Item не найден' })
    return prisma.workItem.update({ where: { id }, data: parsed.data, select: WORK_ITEM_SELECT })
  })

  // DELETE /work-items/:id
  app.delete('/:id', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const item = await prisma.workItem.findUnique({ where: { id } })
    if (!item) return reply.code(404).send({ error: 'Work Item не найден' })
    await prisma.workItem.delete({ where: { id } })
    return { ok: true }
  })

  // PUT /work-items/:id/departments — replace full department list
  app.put('/:id/departments', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const schema = z.object({ divisionIds: z.array(z.string()) })
    const body = schema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message })

    const item = await prisma.workItem.findUnique({ where: { id } })
    if (!item) return reply.code(404).send({ error: 'Work Item не найден' })

    await prisma.$transaction([
      prisma.workItemDivision.deleteMany({ where: { workItemId: id } }),
      prisma.workItemDivision.createMany({
        data: body.data.divisionIds.map(divisionId => ({ workItemId: id, divisionId })),
        skipDuplicates: true,
      }),
    ])

    return prisma.workItem.findUnique({ where: { id }, select: WORK_ITEM_SELECT })
  })

  // GET /work-items/:id/expenses
  app.get('/:id/expenses', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const item = await prisma.workItem.findUnique({ where: { id } })
    if (!item) return reply.code(404).send({ error: 'Work Item не найден' })
    return prisma.expense.findMany({
      where: { workItemId: id },
      select: EXPENSE_SELECT,
      orderBy: { createdAt: 'desc' },
    })
  })

  // POST /work-items/:id/expenses
  app.post('/:id/expenses', { preHandler: authenticate }, async (req, reply) => {
    const user = (req as any).user as { id: string }
    const { id } = req.params as { id: string }

    const schema = z.object({
      amount:      z.number().positive(),
      category:    z.enum(['equipment', 'transport', 'fees', 'postproduction', 'other']).default('other'),
      description: z.string().default(''),
      date:        z.string().optional(),
    })
    const body = schema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message })

    const item = await prisma.workItem.findUnique({ where: { id } })
    if (!item) return reply.code(404).send({ error: 'Work Item не найден' })

    return reply.code(201).send(
      await prisma.expense.create({
        data: { ...body.data, workItemId: id, createdById: user.id },
        select: EXPENSE_SELECT,
      })
    )
  })

  // PATCH /work-items/:id/expenses/:expId
  app.patch('/:id/expenses/:expId', { preHandler: authenticate }, async (req, reply) => {
    const { expId } = req.params as { id: string; expId: string }

    const schema = z.object({
      amount:      z.number().positive().optional(),
      category:    z.enum(['equipment', 'transport', 'fees', 'postproduction', 'other']).optional(),
      description: z.string().optional(),
      date:        z.string().nullable().optional(),
    })
    const body = schema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message })

    const exp = await prisma.expense.findUnique({ where: { id: expId } })
    if (!exp) return reply.code(404).send({ error: 'Расход не найден' })

    return prisma.expense.update({
      where: { id: expId },
      data: body.data,
      select: EXPENSE_SELECT,
    })
  })

  // DELETE /work-items/:id/expenses/:expId
  app.delete('/:id/expenses/:expId', { preHandler: authenticate }, async (req, reply) => {
    const { expId } = req.params as { id: string; expId: string }
    const exp = await prisma.expense.findUnique({ where: { id: expId } })
    if (!exp) return reply.code(404).send({ error: 'Расход не найден' })
    await prisma.expense.delete({ where: { id: expId } })
    return reply.code(204).send()
  })
}
