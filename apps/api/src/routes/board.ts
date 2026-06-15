import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@nexus/db'
import { authenticate } from '../plugins/auth'

// Личная доска: кастомные колонки (Q-TASK-1a — кастомизируются только личные доски).
// Колонки — группировка по контексту работы (данные донора: «Пятёрочка», «КОРП РАДИО»),
// не статусный workflow. Размещение задачи — одно на доске пользователя.

const columnCreateSchema = z.object({
  name: z.string().min(1).max(100),
  order: z.number().optional(),
})
const columnPatchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  order: z.number().optional(),
})
const placementSchema = z.object({
  taskId: z.string().min(1),
  columnId: z.string().min(1).nullable(), // null → убрать из кастомных колонок
  sort: z.number().optional(),
})

export async function boardRoutes(app: FastifyInstance) {
  // ── GET /board — мои колонки + размещения ────────────────────────────────────
  app.get('/', { preHandler: authenticate }, async (req) => {
    const user = (req as any).user as { id: string }
    const [columns, placements] = await Promise.all([
      prisma.boardColumn.findMany({
        where: { userId: user.id },
        orderBy: { order: 'asc' },
        select: { id: true, name: true, order: true },
      }),
      prisma.taskPlacement.findMany({
        where: { userId: user.id },
        select: { taskId: true, columnId: true, sort: true },
      }),
    ])
    return { columns, placements }
  })

  // ── POST /board/columns ──────────────────────────────────────────────────────
  app.post('/columns', { preHandler: authenticate }, async (req, reply) => {
    const user = (req as any).user as { id: string }
    const parsed = columnCreateSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'validation', details: parsed.error.flatten() })
    const { name, order } = parsed.data

    let effectiveOrder = order
    if (effectiveOrder === undefined) {
      const last = await prisma.boardColumn.findFirst({
        where: { userId: user.id },
        orderBy: { order: 'desc' },
        select: { order: true },
      })
      effectiveOrder = (last?.order ?? 0) + 1
    }
    const col = await prisma.boardColumn.create({
      data: { userId: user.id, name, order: effectiveOrder },
      select: { id: true, name: true, order: true },
    })
    return reply.code(201).send(col)
  })

  // ── PATCH /board/columns/:id ─────────────────────────────────────────────────
  app.patch<{ Params: { id: string } }>('/columns/:id', { preHandler: authenticate }, async (req, reply) => {
    const user = (req as any).user as { id: string }
    const parsed = columnPatchSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'validation', details: parsed.error.flatten() })

    const col = await prisma.boardColumn.findUnique({ where: { id: req.params.id } })
    if (!col) return reply.code(404).send({ error: 'Column not found' })
    if (col.userId !== user.id) return reply.code(403).send({ error: 'Forbidden' })

    const { name, order } = parsed.data
    return prisma.boardColumn.update({
      where: { id: col.id },
      data: {
        ...(name !== undefined && { name }),
        ...(order !== undefined && { order }),
      },
      select: { id: true, name: true, order: true },
    })
  })

  // ── DELETE /board/columns/:id — задачи остаются (только размещения каскадом) ──
  app.delete<{ Params: { id: string } }>('/columns/:id', { preHandler: authenticate }, async (req, reply) => {
    const user = (req as any).user as { id: string }
    const col = await prisma.boardColumn.findUnique({ where: { id: req.params.id } })
    if (!col) return reply.code(404).send({ error: 'Column not found' })
    if (col.userId !== user.id) return reply.code(403).send({ error: 'Forbidden' })
    await prisma.boardColumn.delete({ where: { id: col.id } })
    return reply.code(204).send()
  })

  // ── PUT /board/placements — позиция задачи в моей колонке (null → убрать) ────
  app.put('/placements', { preHandler: authenticate }, async (req, reply) => {
    const user = (req as any).user as { id: string }
    const parsed = placementSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'validation', details: parsed.error.flatten() })
    const { taskId, columnId, sort } = parsed.data

    const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true } })
    if (!task) return reply.code(404).send({ error: 'Task not found' })

    if (columnId === null) {
      await prisma.taskPlacement.deleteMany({ where: { taskId, userId: user.id } })
      return reply.code(204).send()
    }

    const col = await prisma.boardColumn.findUnique({ where: { id: columnId } })
    if (!col || col.userId !== user.id) return reply.code(404).send({ error: 'Column not found' })

    return prisma.taskPlacement.upsert({
      where: { taskId_userId: { taskId, userId: user.id } },
      update: { columnId, sort: sort ?? 0 },
      create: { taskId, userId: user.id, columnId, sort: sort ?? 0 },
      select: { taskId: true, columnId: true, sort: true },
    })
  })
}
