import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@nexus/db'
import { authenticate } from '../plugins/auth'

// Личные цели сотрудника (Обзор кабинета). Каждый видит/правит только свои. PUT — замена всего списка.
const putSchema = z.object({ goals: z.array(z.object({ text: z.string().trim().min(1).max(500), done: z.boolean().optional() })).max(50) })
const sel = { id: true, text: true, order: true, done: true } as const

export async function personalGoalsRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: authenticate }, async (request) => {
    const user = (request as any).user as { id: string }
    return prisma.personalGoal.findMany({ where: { userId: user.id }, orderBy: { order: 'asc' }, select: sel })
  })

  app.put('/', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string }
    const p = putSchema.safeParse(request.body)
    if (!p.success) return reply.code(400).send({ error: 'Некорректные данные', details: p.error.flatten() })
    await prisma.$transaction([
      prisma.personalGoal.deleteMany({ where: { userId: user.id } }),
      prisma.personalGoal.createMany({ data: p.data.goals.map((g, i) => ({ userId: user.id, text: g.text, done: g.done ?? false, order: i })) }),
    ])
    return prisma.personalGoal.findMany({ where: { userId: user.id }, orderBy: { order: 'asc' }, select: sel })
  })
}
