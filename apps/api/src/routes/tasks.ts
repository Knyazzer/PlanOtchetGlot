import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tv-shifts/db'
import { authenticate, requireRole } from '../plugins/auth'

const createTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
})

export async function tasksRoutes(app: FastifyInstance) {
  // GET /tasks
  app.get('/', { preHandler: authenticate }, async (request) => {
    const query = request.query as { status?: string }
    return prisma.task.findMany({
      where: {
        ...(query.status && { status: query.status as 'open' | 'in_progress' | 'done' }),
      },
      include: {
        creator: { select: { id: true, fullName: true } },
        taskAssignments: {
          include: { user: { select: { id: true, fullName: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  })

  // POST /tasks — создание (admin only)
  app.post('/', { preHandler: requireRole('admin') }, async (request, reply) => {
    const body = createTaskSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })
    }
    const me = request.user as { id: string }
    const task = await prisma.task.create({
      data: { ...body.data, createdBy: me.id },
    })
    return reply.code(201).send(task)
  })

  // POST /tasks/:id/assign — взять задачу (employee/admin)
  app.post('/:id/assign', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const me = request.user as { id: string }

    const task = await prisma.task.findUnique({ where: { id } })
    if (!task) return reply.code(404).send({ error: 'Task not found' })
    if (task.status !== 'open') return reply.code(400).send({ error: 'Task is not open' })

    await prisma.$transaction([
      prisma.task.update({ where: { id }, data: { status: 'in_progress' } }),
      prisma.taskAssignment.create({ data: { taskId: id, userId: me.id } }),
    ])

    return { ok: true }
  })

  // PATCH /tasks/:id/complete
  app.patch('/:id/complete', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const me = request.user as { id: string; role: string }

    const assignment = await prisma.taskAssignment.findFirst({
      where: { taskId: id, userId: me.id },
    })

    if (!assignment && me.role !== 'admin') {
      return reply.code(403).send({ error: 'Not your task' })
    }

    await prisma.$transaction([
      prisma.task.update({ where: { id }, data: { status: 'done' } }),
      ...(assignment
        ? [prisma.taskAssignment.update({
            where: { id: assignment.id },
            data: { completedAt: new Date() },
          })]
        : []),
    ])

    return { ok: true }
  })

  // DELETE /tasks/:id (admin only)
  app.delete('/:id', { preHandler: requireRole('admin') }, async (request) => {
    const { id } = request.params as { id: string }
    await prisma.task.delete({ where: { id } })
    return { ok: true }
  })
}
