import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@nexus/db'
import { authenticate } from '../plugins/auth'

// Шаблоны задач (пресеты) — «штампы» для быстрого создания обычной Task. Каждый видит/правит ТОЛЬКО свои.
// Инстанцирование (клик по шаблону → реальная задача) идёт через обычный POST /tasks с предзаполнением из
// шаблона — ЗДЕСЬ этого нет намеренно: шаблон = не задача, отдельная сущность-хранилище пресета.
// Дедлайна на MVP нет (задаётся уже в созданной задаче). См. docs/AUDIT-CABINET-TASKS-2026-08-30.md.

const sel = { id: true, title: true, client: true, plannedMinutes: true, description: true, sortOrder: true } as const

const bodySchema = z.object({
  title:          z.string().trim().min(1).max(300),
  client:         z.string().trim().max(200).nullable().optional(),
  plannedMinutes: z.number().int().min(0).max(24 * 60).nullable().optional(),
  description:    z.string().max(2000).optional(),
})

export async function taskTemplatesRoutes(app: FastifyInstance) {
  // список своих шаблонов
  app.get('/', { preHandler: authenticate }, async (request) => {
    const user = (request as any).user as { id: string }
    return prisma.taskTemplate.findMany({
      where: { ownerId: user.id },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: sel,
    })
  })

  // создать шаблон
  app.post('/', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string }
    const b = bodySchema.safeParse(request.body)
    if (!b.success) return reply.code(400).send({ error: 'Некорректные данные', details: b.error.flatten() })
    const max = await prisma.taskTemplate.aggregate({ where: { ownerId: user.id }, _max: { sortOrder: true } })
    const tpl = await prisma.taskTemplate.create({
      data: {
        ownerId: user.id,
        title: b.data.title,
        client: b.data.client ?? null,
        plannedMinutes: b.data.plannedMinutes ?? null,
        description: b.data.description ?? '',
        sortOrder: (max._max.sortOrder ?? -1) + 1,
      },
      select: sel,
    })
    return reply.code(201).send(tpl)
  })

  // правка шаблона — только владелец
  app.patch('/:id', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string }
    const { id } = request.params as { id: string }
    const b = bodySchema.partial().safeParse(request.body)
    if (!b.success) return reply.code(400).send({ error: 'Некорректные данные', details: b.error.flatten() })
    const existing = await prisma.taskTemplate.findUnique({ where: { id }, select: { ownerId: true } })
    if (!existing) return reply.code(404).send({ error: 'Template not found' })
    if (existing.ownerId !== user.id) return reply.code(403).send({ error: 'Not your template' })
    const tpl = await prisma.taskTemplate.update({
      where: { id },
      data: {
        ...(b.data.title !== undefined ? { title: b.data.title } : {}),
        ...(b.data.client !== undefined ? { client: b.data.client } : {}),
        ...(b.data.plannedMinutes !== undefined ? { plannedMinutes: b.data.plannedMinutes } : {}),
        ...(b.data.description !== undefined ? { description: b.data.description } : {}),
      },
      select: sel,
    })
    return tpl
  })

  // удалить шаблон — только владелец
  app.delete('/:id', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string }
    const { id } = request.params as { id: string }
    const existing = await prisma.taskTemplate.findUnique({ where: { id }, select: { ownerId: true } })
    if (!existing) return reply.code(404).send({ error: 'Template not found' })
    if (existing.ownerId !== user.id) return reply.code(403).send({ error: 'Not your template' })
    await prisma.taskTemplate.delete({ where: { id } })
    return reply.code(204).send()
  })
}
