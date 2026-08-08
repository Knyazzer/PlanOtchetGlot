import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@nexus/db'
import { authenticate } from '../plugins/auth'
import { getOrgScope } from '../services/orgScope'

// Может ли пользователь ПРИВЯЗЫВАТЬ треки/задачи к цели (вклад, не редактирование):
// admin | директор департамента цели | руководитель ИЛИ сотрудник отдела цели.
// К цели департамента (divisionId=null) вклад — только директор/админ (у отдела — сотрудники своего отдела).
export async function canContributeToGoal(userId: string, isAdmin: boolean, goal: { deptId: string; divisionId: string | null }): Promise<boolean> {
  if (isAdmin) return true
  const scope = await getOrgScope(userId)
  if (scope.directorDeptIds.includes(goal.deptId)) return true
  if (goal.divisionId) return scope.divisionIds.includes(goal.divisionId)
  return false
}

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

const sel = { id: true, title: true, description: true, deptId: true, divisionId: true, parentGoalId: true, kind: true, horizon: true, periodKey: true, status: true, outcome: true, sortOrder: true, createdById: true, closedAt: true } as const

export const GOAL_STATUS_RU: Record<string, string> = { active: 'В работе', done: 'Реализовано', partial: 'Частично', dropped: 'Снято' }

// Запись в неизменяемую историю цели (снапшот имени актора). Экспортируется — треки тоже пишут сюда при привязке.
export async function logGoal(goalId: string, userId: string, action: string, details: string, meta?: Record<string, unknown>): Promise<void> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
  await prisma.strategicGoalLog.create({ data: { goalId, userId, userName: u?.name ?? '—', action, details, meta: (meta ?? undefined) as any } })
}

const createSchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().max(3000).optional(),
  deptId: z.string(),
  divisionId: z.string().nullish(),
  parentGoalId: z.string().nullish(),
  kind: z.enum(['goal', 'growth']).default('goal'),
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
    // Директор любого департамента видит ВСЕ департаменты (ведёт стратегию); остальные — свой охват.
    if (!user.isAdmin) {
      const isDirector = (await prisma.department.count({ where: { directorId: user.id } })) > 0
      if (!isDirector) { const depts = await myDeptIds(user.id); where.deptId = { in: depts.length ? depts : ['__none__'] } }
    }
    const goals = await prisma.strategicGoal.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: sel })
    if (!goals.length) return goals
    // Прогресс: задачи треков цели + прямые задачи цели; для цели департамента (divisionId=null) — roll-up дочерних.
    const children = new Map<string, string[]>()
    for (const g of goals) if (g.parentGoalId) { const a = children.get(g.parentGoalId) ?? []; a.push(g.id); children.set(g.parentGoalId, a) }
    const ownedIds = (g: { id: string; divisionId: string | null }) => g.divisionId === null ? [g.id, ...(children.get(g.id) ?? [])] : [g.id]
    const allOwned = [...new Set(goals.flatMap(ownedIds))]
    const [tracks, looseTasks] = await Promise.all([
      prisma.track.findMany({ where: { goalId: { in: allOwned } }, select: { goalId: true, tasks: { select: { status: true } } } }),
      prisma.task.findMany({ where: { goalId: { in: allOwned }, trackId: null }, select: { goalId: true, status: true } }),
    ])
    const per = new Map<string, { total: number; done: number; tracks: number }>()
    for (const id of allOwned) per.set(id, { total: 0, done: 0, tracks: 0 })
    for (const t of tracks) { const p = per.get(t.goalId!); if (!p) continue; p.tracks++; for (const tk of t.tasks) { p.total++; if (tk.status === 'done') p.done++ } }
    for (const t of looseTasks) { const p = per.get(t.goalId!); if (!p) continue; p.total++; if (t.status === 'done') p.done++ }
    return goals.map(g => {
      const acc = { total: 0, done: 0, tracks: 0 }
      for (const oid of ownedIds(g)) { const p = per.get(oid); if (!p) continue; acc.total += p.total; acc.done += p.done; acc.tracks += p.tracks }
      return { ...g, tasksTotal: acc.total, tasksDone: acc.done, trackCount: acc.tracks }
    })
  })

  // GET /strategic-goals/:id — детали цели: привязанные треки (с прогрессом) + прямые задачи + roll-up дочерних (для департамента)
  app.get('/:id', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string; isAdmin: boolean }
    const { id } = request.params as { id: string }
    const goal = await prisma.strategicGoal.findUnique({ where: { id }, select: sel })
    if (!goal) return reply.code(404).send({ error: 'Goal not found' })
    if (!user.isAdmin) {
      const isDirector = (await prisma.department.count({ where: { directorId: user.id } })) > 0
      if (!isDirector && !(await myDeptIds(user.id)).includes(goal.deptId)) return reply.code(403).send({ error: 'Нет доступа' })
    }
    const childIds = goal.divisionId === null
      ? (await prisma.strategicGoal.findMany({ where: { parentGoalId: id }, select: { id: true } })).map(c => c.id)
      : []
    const ownedIds = [id, ...childIds]
    const [tracks, looseTasks] = await Promise.all([
      prisma.track.findMany({ where: { goalId: { in: ownedIds } }, select: { id: true, title: true, status: true, goalId: true, tasks: { select: { status: true } } }, orderBy: { createdAt: 'asc' } }),
      prisma.task.findMany({ where: { goalId: { in: ownedIds }, trackId: null }, select: { id: true, title: true, status: true, goalId: true } }),
    ])
    const trackView = tracks.map(t => ({ id: t.id, title: t.title, status: t.status, goalId: t.goalId, total: t.tasks.length, done: t.tasks.filter(x => x.status === 'done').length }))
    const total = trackView.reduce((s, t) => s + t.total, 0) + looseTasks.length
    const done = trackView.reduce((s, t) => s + t.done, 0) + looseTasks.filter(x => x.status === 'done').length
    return { ...goal, tracks: trackView, looseTasks, progress: { total, done, trackCount: tracks.length } }
  })

  // GET /strategic-goals/:id/log — история изменений цели (неизменяемая лента)
  app.get('/:id/log', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string; isAdmin: boolean }
    const { id } = request.params as { id: string }
    const goal = await prisma.strategicGoal.findUnique({ where: { id }, select: { deptId: true } })
    if (!goal) return reply.code(404).send({ error: 'Goal not found' })
    if (!user.isAdmin) {
      const isDirector = (await prisma.department.count({ where: { directorId: user.id } })) > 0
      if (!isDirector && !(await myDeptIds(user.id)).includes(goal.deptId)) return reply.code(403).send({ error: 'Нет доступа' })
    }
    return prisma.strategicGoalLog.findMany({ where: { goalId: id }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, action: true, details: true, meta: true, userName: true, createdAt: true } })
  })

  // POST /strategic-goals — создать цель (director/head своего охвата или admin)
  app.post('/', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string; isAdmin: boolean }
    const p = createSchema.safeParse(request.body)
    if (!p.success) return reply.code(400).send({ error: 'validation', details: p.error.flatten() })
    if (!(await canManage(user.id, user.isAdmin, p.data.deptId, p.data.divisionId ?? null))) return reply.code(403).send({ error: 'Нет прав на этот департамент/отдел' })
    const periodKey = p.data.periodKey ?? currentPeriodKey(p.data.horizon)
    const created = await prisma.strategicGoal.create({
      data: { title: p.data.title, description: p.data.description ?? null, deptId: p.data.deptId, divisionId: p.data.divisionId ?? null, parentGoalId: p.data.parentGoalId ?? null, kind: p.data.kind, horizon: p.data.horizon, periodKey, createdById: user.id },
      select: sel,
    })
    await logGoal(created.id, user.id, 'created', `создал(а) ${p.data.kind === 'growth' ? 'зону роста' : 'цель'} «${p.data.title}»`)
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
    const updated = await prisma.strategicGoal.update({ where: { id }, data: p.data, select: sel })
    // Диф правки: сохраняем старое/новое значение по каждому изменённому полю (для «Было → Стало» в истории)
    const changes: Array<{ field: string; label: string; from: string | null; to: string | null }> = []
    if (p.data.title !== undefined && p.data.title !== g.title) changes.push({ field: 'title', label: 'Заголовок', from: g.title, to: p.data.title })
    if (p.data.description !== undefined && (p.data.description ?? null) !== (g.description ?? null)) changes.push({ field: 'description', label: 'Описание', from: g.description ?? null, to: p.data.description ?? null })
    if (changes.length) {
      const details = changes.length === 1 ? `изменил(а) ${changes[0].label.toLowerCase()}` : `изменил(а): ${changes.map(c => c.label.toLowerCase()).join(', ')}`
      await logGoal(id, user.id, 'edited', details, { changes })
    }
    return updated
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
    const updated = await prisma.strategicGoal.update({ where: { id }, data: { status: p.data.status, outcome: p.data.outcome ?? null, closedAt: closing ? new Date() : null, closedById: closing ? user.id : null }, select: sel })
    if (p.data.status !== g.status) {
      const details = closing
        ? `статус → «${GOAL_STATUS_RU[p.data.status] ?? p.data.status}»${p.data.outcome?.trim() ? ` · итог: ${p.data.outcome.trim()}` : ''}`
        : 'вернул(а) цель в работу'
      await logGoal(id, user.id, closing ? 'status' : 'reopened', details, { from: g.status, to: p.data.status })
    }
    return updated
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
