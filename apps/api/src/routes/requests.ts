import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@nexus/db'
import { authenticate } from '../plugins/auth'

// Заявки сотрудника (отпуск/больничный/отгул) → согласование руководителем. См. docs/REQUESTS-MODULE.md
export const REQUEST_TYPES = [
  { key: 'vacation', label: 'Отпуск',     needsRange: true, hasDoc: true },
  { key: 'sick',     label: 'Больничный', needsRange: true, hasDoc: false },
  { key: 'dayoff',   label: 'Отгул',      needsRange: true, hasDoc: false },
] as const

const userSel = { select: { id: true, name: true, position: true, department: true } }
const approverSel = { select: { id: true, name: true } }
const include = { user: userSel, approver: approverSel }

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Дата в формате ГГГГ-ММ-ДД')
const createSchema = z.object({
  type: z.enum(['vacation', 'sick', 'dayoff']),
  dateFrom: ymd,
  dateTo: ymd,
  comment: z.string().max(2000).optional(),
}).refine(d => d.dateTo >= d.dateFrom, { message: 'Конец не раньше начала', path: ['dateTo'] })

const decisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  note: z.string().max(2000).optional(),
})

// Согласующий: руководитель отдела сотрудника (Division.head) → директор департамента → любой админ.
// approverId снапшотится в заявку при создании.
async function resolveApprover(userId: string): Promise<string | null> {
  const memberships = await prisma.userDivision.findMany({
    where: { userId },
    include: { division: { include: { head: { select: { id: true } }, department: { include: { director: { select: { id: true } } } } } } },
  })
  for (const m of memberships) {
    const head = m.division.head?.id
    if (head && head !== userId) return head
  }
  for (const m of memberships) {
    const dir = m.division.department.director?.id
    if (dir && dir !== userId) return dir
  }
  const admin = await prisma.user.findFirst({ where: { isAdmin: true, isActive: true, isSystemAccount: false }, select: { id: true } })
  return admin?.id ?? null
}

export async function requestsRoutes(app: FastifyInstance) {
  // GET /requests/types — реестр типов заявок
  app.get('/types', { preHandler: authenticate }, async () => REQUEST_TYPES)

  // GET /requests?scope=mine|inbox — мои заявки / заявки на моё согласование
  app.get('/', { preHandler: authenticate }, async (request) => {
    const user = (request as any).user as { id: string; isAdmin: boolean }
    const { scope } = request.query as { scope?: string }
    const where = scope === 'inbox' ? { approverId: user.id } : { userId: user.id }
    return prisma.request.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200, include })
  })

  // POST /requests — создать заявку (статус pending, резолв согласующего)
  app.post('/', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string }
    const p = createSchema.safeParse(request.body)
    if (!p.success) return reply.code(400).send({ error: 'Некорректные данные', details: p.error.flatten() })
    const approverId = await resolveApprover(user.id)
    const created = await prisma.request.create({
      data: { userId: user.id, type: p.data.type, dateFrom: p.data.dateFrom, dateTo: p.data.dateTo, comment: p.data.comment ?? null, approverId, status: 'pending' },
      include,
    })
    return reply.code(201).send(created)
  })

  // PATCH /requests/:id/decision — одобрить/отклонить (согласующий или админ)
  app.patch('/:id/decision', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string; isAdmin: boolean }
    const { id } = request.params as { id: string }
    const p = decisionSchema.safeParse(request.body)
    if (!p.success) return reply.code(400).send({ error: 'Некорректные данные', details: p.error.flatten() })
    const existing = await prisma.request.findUnique({ where: { id } })
    if (!existing) return reply.code(404).send({ error: 'Request not found' })
    if (existing.approverId !== user.id && !user.isAdmin) return reply.code(403).send({ error: 'Только согласующий или админ' })
    if (existing.status !== 'pending') return reply.code(400).send({ error: 'Заявка уже обработана' })
    return prisma.request.update({ where: { id }, data: { status: p.data.decision, decisionNote: p.data.note ?? null, decidedAt: new Date() }, include })
  })

  // PATCH /requests/:id/cancel — отменить свою pending-заявку (автор)
  app.patch('/:id/cancel', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string }
    const { id } = request.params as { id: string }
    const existing = await prisma.request.findUnique({ where: { id } })
    if (!existing) return reply.code(404).send({ error: 'Request not found' })
    if (existing.userId !== user.id) return reply.code(403).send({ error: 'Только автор' })
    if (existing.status !== 'pending') return reply.code(400).send({ error: 'Можно отменить только заявку на согласовании' })
    return prisma.request.update({ where: { id }, data: { status: 'canceled' }, include })
  })
}
