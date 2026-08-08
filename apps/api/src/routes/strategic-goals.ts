import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@nexus/db'
import { authenticate } from '../plugins/auth'

// Стратегические цели (квартал/год), каскад департамент→отдел. Видимость — свой департамент. См. docs/STRATEGIC-GOALS.md.
function currentPeriodKey(horizon: 'quarter' | 'year' = 'quarter', d = new Date()): string {
  const y = d.getFullYear()
  return horizon === 'year' ? `${y}` : `${y}-Q${Math.floor(d.getMonth() / 3) + 1}`
}

// Департаменты в охвате пользователя: членство + директорство + руководство отделом.
async function myDeptIds(userId: string): Promise<string[]> {
  const [memberships, directed, headed] = await Promise.all([
    prisma.userDivision.findMany({ where: { userId }, select: { division: { select: { deptId: true } } } }),
    prisma.department.findMany({ where: { directorId: userId }, select: { id: true } }),
    prisma.division.findMany({ where: { headId: userId }, select: { deptId: true } }),
  ])
  return [...new Set([...memberships.map(m => m.division.deptId), ...directed.map(d => d.id), ...headed.map(h => h.deptId)])]
}
// Может ли управлять целью данного деп/отдела (создать/править/закрыть): admin | директор департамента | руковод отдела.
async function canManage(userId: string, isAdmin: boolean, deptId: string, divisionId: string | null): Promise<boolean> {
  if (isAdmin) return true
  const dept = await prisma.department.findUnique({ where: { id: deptId }, select: { directorId: true } })
  if (dept?.directorId === userId) return true
  if (divisionId) {
    const div = await prisma.division.findUnique({ where: { id: divisionId }, select: { headId: true } })
    if (div?.headId === userId) return true
  }
  return false
}

const sel = { id: true, title: true, description: true, deptId: true, divisionId: true, parentGoalId: true, horizon: true, periodKey: true, status: true, outcome: true, sortOrder: true, createdById: true, closedAt: true } as const

const createSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(3000).optional(),
  deptId: z.string(),
  divisionId: z.string().nullish(),
  parentGoalId: z.string().nullish(),
  horizon: z.enum(['quarter', 'year']).default('quarter'),
  periodKey: z.string().regex(/^\d{4}(-Q[1-4])?$/).optional(),
})
const patchSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().max(3000).nullish(),
  parentGoalId: z.string().nullish(),
  sortOrder: z.number().int().optional(),
})
const closeSchema = z.object({ status: z.enum(['active', 'done', 'partial', 'dropped']), outcome: z.string().max(3000).optional() })

export async function strategicGoalsRoutes(app: FastifyInstance) {
  // GET /strategic-goals?periodKey= — цели периода (+ годовые того же года) в охвате пользователя
  app.get('/', { preHandler: authenticate }, async (request) => {
    const user = (request as any).user as { id: string; isAdmin: boolean }
    const { periodKey } = request.query as { periodKey?: string }
    const pk = periodKey ?? currentPeriodKey()
    const where: Record<string, unknown> = { periodKey: { in: [pk, pk.slice(0, 4)] } }
    if (!user.isAdmin) { const depts = await myDeptIds(user.id); where.deptId = { in: depts.length ? depts : ['__none__'] } }
    return prisma.strategicGoal.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: sel })
  })

  // POST /strategic-goals — создать цель (director/head своего охвата или admin)
  app.post('/', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string; isAdmin: boolean }
    const p = createSchema.safeParse(request.body)
    if (!p.success) return reply.code(400).send({ error: 'validation', details: p.error.flatten() })
    if (!(await canManage(user.id, user.isAdmin, p.data.deptId, p.data.divisionId ?? null))) return reply.code(403).send({ error: 'Нет прав на этот департамент/отдел' })
    const periodKey = p.data.periodKey ?? currentPeriodKey(p.data.horizon)
    const created = await prisma.strategicGoal.create({
      data: { title: p.data.title, description: p.data.description ?? null, deptId: p.data.deptId, divisionId: p.data.divisionId ?? null, parentGoalId: p.data.parentGoalId ?? null, horizon: p.data.horizon, periodKey, createdById: user.id },
      select: sel,
    })
    return reply.code(201).send(created)
  })

  // PATCH /strategic-goals/:id — правка (открытый период, управляющий)
  app.patch('/:id', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string; isAdmin: boolean }
    const { id } = request.params as { id: string }
    const p = patchSchema.safeParse(request.body)
    if (!p.success) return reply.code(400).send({ error: 'validation', details: p.error.flatten() })
    const g = await prisma.strategicGoal.findUnique({ where: { id } })
    if (!g) return reply.code(404).send({ error: 'Goal not found' })
    if (g.closedAt) return reply.code(400).send({ error: 'Цель закрыта — правка недоступна' })
    if (!(await canManage(user.id, user.isAdmin, g.deptId, g.divisionId))) return reply.code(403).send({ error: 'Нет прав' })
    return prisma.strategicGoal.update({ where: { id }, data: p.data, select: sel })
  })

  // PATCH /strategic-goals/:id/close — закрыть/переоткрыть (статус + обязательный итог для не-done)
  app.patch('/:id/close', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string; isAdmin: boolean }
    const { id } = request.params as { id: string }
    const p = closeSchema.safeParse(request.body)
    if (!p.success) return reply.code(400).send({ error: 'validation', details: p.error.flatten() })
    const g = await prisma.strategicGoal.findUnique({ where: { id } })
    if (!g) return reply.code(404).send({ error: 'Goal not found' })
    if (!((await canManage(user.id, user.isAdmin, g.deptId, g.divisionId)) || g.createdById === user.id)) return reply.code(403).send({ error: 'Нет прав' })
    if ((p.data.status === 'partial' || p.data.status === 'dropped') && !p.data.outcome?.trim()) return reply.code(400).send({ error: 'Укажите итог/почему' })
    const closing = p.data.status !== 'active'
    return prisma.strategicGoal.update({ where: { id }, data: { status: p.data.status, outcome: p.data.outcome ?? null, closedAt: closing ? new Date() : null, closedById: closing ? user.id : null }, select: sel })
  })

  // DELETE /strategic-goals/:id — удалить (открытая, управляющий)
  app.delete('/:id', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string; isAdmin: boolean }
    const { id } = request.params as { id: string }
    const g = await prisma.strategicGoal.findUnique({ where: { id } })
    if (!g) return reply.code(404).send({ error: 'Goal not found' })
    if (g.closedAt) return reply.code(400).send({ error: 'Цель закрыта — удаление недоступно' })
    if (!(await canManage(user.id, user.isAdmin, g.deptId, g.divisionId))) return reply.code(403).send({ error: 'Нет прав' })
    await prisma.strategicGoal.delete({ where: { id } })
    return reply.code(204).send()
  })
}
