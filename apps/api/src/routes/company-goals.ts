import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@nexus/db'
import { authenticate } from '../plugins/auth'

// Цели компании — тезисы для микро-блока на Пульсе. Читают все; правит (замена всего списка) — админ.
const putSchema = z.object({ goals: z.array(z.string().trim().min(1).max(500)).max(30) })
const sel = { id: true, text: true, order: true } as const

export async function companyGoalsRoutes(app: FastifyInstance) {
  // GET /company-goals — список тезисов (по порядку)
  app.get('/', { preHandler: authenticate }, async () =>
    prisma.companyGoal.findMany({ orderBy: { order: 'asc' }, select: sel }))

  // PUT /company-goals — заменить весь список (admin)
  app.put('/', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { isAdmin: boolean }
    if (!user.isAdmin) return reply.code(403).send({ error: 'Только админ' })
    const p = putSchema.safeParse(request.body)
    if (!p.success) return reply.code(400).send({ error: 'Некорректные данные', details: p.error.flatten() })
    await prisma.$transaction([
      prisma.companyGoal.deleteMany({}),
      prisma.companyGoal.createMany({ data: p.data.goals.map((text, i) => ({ text, order: i })) }),
    ])
    return prisma.companyGoal.findMany({ orderBy: { order: 'asc' }, select: sel })
  })
}
