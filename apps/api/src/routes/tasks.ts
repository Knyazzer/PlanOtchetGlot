// apps/api/src/routes/tasks.ts
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tv-shifts/db'
import { authenticate } from '../plugins/auth'
import { requirePermission } from '../config/permissions'
import { notify } from '../services/notificationService'

const taskInclude = {
  creator: { select: { id: true, fullName: true } },
  assignments: {
    include: { user: { select: { id: true, fullName: true } } },
  },
  dept: { select: { id: true, name: true } },
  workItem: { select: { id: true, name: true } },
} as const

const createTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  deadline: z.string().datetime({ offset: true }).optional().nullable(),
  deptId: z.string().optional().nullable(),
  wiId: z.string().optional().nullable(),
})

const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  deadline: z.string().datetime({ offset: true }).optional().nullable(),
  deptId: z.string().optional().nullable(),
  wiId: z.string().optional().nullable(),
})

const assignSchema = z.object({
  userId: z.string().min(1),
})

function isAdminOrTasksWrite(user: { roles?: string[]; permissions?: string[] }) {
  return (
    user.roles?.includes('admin') ||
    (user.permissions ?? []).includes('tasks:write')
  )
}

export async function tasksRoutes(app: FastifyInstance) {
  // GET /tasks
  app.get('/', { preHandler: authenticate }, async (request, reply) => {
    const rawQuery = request.query as Record<string, string>
    const querySchema = z.object({
      status: z.enum(['open', 'in_progress', 'done']).optional(),
      deptId: z.string().optional(),
      wiId: z.string().optional(),
      overdue: z.enum(['true', 'false']).optional(),
      assignedToMe: z.enum(['true', 'false']).optional(),
    })
    const parsed = querySchema.safeParse(rawQuery)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid query', details: parsed.error.flatten() })
    }
    const query = parsed.data
    const me = request.user as { id: string }

    return prisma.task.findMany({
      where: {
        ...(query.status && { status: query.status as any }),
        ...(query.deptId && { deptId: query.deptId }),
        ...(query.wiId && { wiId: query.wiId }),
        ...(query.overdue === 'true' && { isOverdue: true }),
        ...(query.assignedToMe === 'true' && {
          assignments: { some: { userId: me.id } },
        }),
      },
      include: taskInclude,
      orderBy: [
        { isOverdue: 'desc' },
        { deadline: 'asc' },
        { createdAt: 'desc' },
      ],
    })
  })

  // POST /tasks — create (any authenticated user can create tasks for their dept)
  app.post('/', { preHandler: authenticate }, async (request, reply) => {
    const body = createTaskSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })
    }
    const me = request.user as { id: string }
    if (body.data.deptId) {
      const dept = await prisma.department.findUnique({ where: { id: body.data.deptId }, select: { id: true } })
      if (!dept) return reply.code(404).send({ error: 'Department not found' })
    }
    if (body.data.wiId) {
      const wi = await prisma.workItem.findUnique({ where: { id: body.data.wiId }, select: { id: true } })
      if (!wi) return reply.code(404).send({ error: 'WorkItem not found' })
    }
    const task = await prisma.task.create({
      data: {
        title: body.data.title,
        description: body.data.description ?? null,
        deadline: body.data.deadline ? new Date(body.data.deadline) : null,
        deptId: body.data.deptId ?? null,
        wiId: body.data.wiId ?? null,
        createdBy: me.id,
      },
      include: taskInclude,
    })
    return reply.code(201).send(task)
  })

  // PATCH /tasks/:id — update fields (creator or admin)
  app.patch('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = updateTaskSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })
    }

    const task = await prisma.task.findUnique({ where: { id } })
    if (!task) return reply.code(404).send({ error: 'Task not found' })

    const me = request.user as { id: string; roles?: string[]; permissions?: string[] }
    if (!isAdminOrTasksWrite(me) && task.createdBy !== me.id) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    if (body.data.deptId) {
      const dept = await prisma.department.findUnique({ where: { id: body.data.deptId }, select: { id: true } })
      if (!dept) return reply.code(404).send({ error: 'Department not found' })
    }
    if (body.data.wiId) {
      const wi = await prisma.workItem.findUnique({ where: { id: body.data.wiId }, select: { id: true } })
      if (!wi) return reply.code(404).send({ error: 'WorkItem not found' })
    }

    const updated = await prisma.task.update({
      where: { id },
      data: {
        ...(body.data.title !== undefined && { title: body.data.title }),
        ...(body.data.description !== undefined && { description: body.data.description }),
        ...(body.data.deadline !== undefined && {
          deadline: body.data.deadline ? new Date(body.data.deadline) : null,
        }),
        ...(body.data.deptId !== undefined && { deptId: body.data.deptId }),
        ...(body.data.wiId !== undefined && { wiId: body.data.wiId }),
      },
      include: taskInclude,
    })

    return reply.code(200).send(updated)
  })

  // POST /tasks/:id/assign — self-assign, moves task to in_progress
  app.post('/:id/assign', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const me = request.user as { id: string }

    const task = await prisma.task.findUnique({ where: { id } })
    if (!task) return reply.code(404).send({ error: 'Task not found' })
    if (task.status !== 'open') return reply.code(400).send({ error: 'Task is not open' })

    const existing = await prisma.taskAssignment.findFirst({
      where: { taskId: id, userId: me.id },
    })
    if (existing) return reply.code(400).send({ error: 'Already assigned' })

    await prisma.$transaction([
      prisma.task.update({ where: { id }, data: { status: 'in_progress' } }),
      prisma.taskAssignment.create({ data: { taskId: id, userId: me.id } }),
    ])

    return { ok: true }
  })

  // POST /tasks/:id/assignments — assign another user (creator or admin)
  app.post('/:id/assignments', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = assignSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })
    }

    const task = await prisma.task.findUnique({ where: { id } })
    if (!task) return reply.code(404).send({ error: 'Task not found' })

    const me = request.user as { id: string; roles?: string[]; permissions?: string[] }
    if (!isAdminOrTasksWrite(me) && task.createdBy !== me.id) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const target = await prisma.user.findUnique({ where: { id: body.data.userId } })
    if (!target) return reply.code(404).send({ error: 'User not found' })

    const existing = await prisma.taskAssignment.findFirst({
      where: { taskId: id, userId: body.data.userId },
    })
    if (existing) return reply.code(400).send({ error: 'User already assigned' })

    const assignment = await prisma.taskAssignment.create({
      data: { taskId: id, userId: body.data.userId },
    })

    if (task.status === 'open') {
      await prisma.task.update({ where: { id }, data: { status: 'in_progress' } })
    }

    await notify(
      'task_assigned',
      `Вам назначена задача: «${task.title}»`,
      [body.data.userId],
      'task',
      id,
    )

    return reply.code(201).send(assignment)
  })

  // DELETE /tasks/:id/assignments/:userId — unassign (creator, admin, or self)
  app.delete('/:id/assignments/:userId', { preHandler: authenticate }, async (request, reply) => {
    const { id, userId } = request.params as { id: string; userId: string }

    const task = await prisma.task.findUnique({ where: { id } })
    if (!task) return reply.code(404).send({ error: 'Task not found' })

    const me = request.user as { id: string; roles?: string[]; permissions?: string[] }
    if (!isAdminOrTasksWrite(me) && task.createdBy !== me.id && me.id !== userId) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    await prisma.taskAssignment.deleteMany({ where: { taskId: id, userId } })

    const remaining = await prisma.taskAssignment.count({ where: { taskId: id } })
    if (remaining === 0 && task.status === 'in_progress') {
      await prisma.task.update({ where: { id }, data: { status: 'open' } })
    }

    return reply.code(204).send()
  })

  // PATCH /tasks/:id/complete — mark done (assignee or admin)
  app.patch('/:id/complete', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const me = request.user as { id: string; roles?: string[]; permissions?: string[] }

    const task = await prisma.task.findUnique({ where: { id } })
    if (!task) return reply.code(404).send({ error: 'Task not found' })

    const assignment = await prisma.taskAssignment.findFirst({
      where: { taskId: id, userId: me.id },
    })

    if (!assignment && !isAdminOrTasksWrite(me)) {
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

    await notify(
      'task_closed',
      `Задача завершена: «${task.title}»`,
      [task.createdBy],
      'task',
      id,
    )

    return { ok: true }
  })

  // DELETE /tasks/:id — hard delete (tasks:write permission)
  app.delete('/:id', { preHandler: requirePermission('tasks:write') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const task = await prisma.task.findUnique({ where: { id } })
    if (!task) return reply.code(404).send({ error: 'Task not found' })
    await prisma.task.delete({ where: { id } })
    return reply.code(204).send()
  })
}
