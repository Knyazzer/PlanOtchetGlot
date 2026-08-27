import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@nexus/db'
import { authenticate } from '../plugins/auth'
import { buildVacationDoc } from '../services/requestDocx'

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

// Отражение одобренной заявки в дне: статус дня = тип заявки (vacation/sick/dayoff) на весь диапазон.
// Единый источник (DayEntry.status) → виден в кабинете/присутствии/своде/календаре. См. docs/DAY-STATUS-MODEL.md.
function eachDay(from: string, to: string): string[] {
  const days: string[] = []
  let d = new Date(from + 'T00:00:00'); const end = new Date(to + 'T00:00:00')
  while (d <= end) { days.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + 86_400_000) }
  return days
}
// Клиент интерактивной транзакции Prisma (без служебных $-методов) — чтобы helper'ы работали внутри $transaction.
type TxClient = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>
// «Проводки» заявки — многошаговые записи по дням диапазона, ОБЯЗАТЕЛЬНО в транзакции (либо всё, либо ничего):
// частичное проставление статусов дней при сбое = рассинхрон отсутствий (docs/DECISION-2026-08-09, ACID).
async function reflectLeave(tx: TxClient, r: { userId: string; type: string; dateFrom: string; dateTo: string }) {
  const ud = await tx.userDivision.findFirst({ where: { userId: r.userId }, select: { divId: true } })
  for (const day of eachDay(r.dateFrom, r.dateTo)) {
    await tx.dayEntry.upsert({
      where: { userId_date: { userId: r.userId, date: new Date(day) } },
      update: { dayFormat: r.type, place: null, startTime: null, endTime: null, breakMin: 0 },
      create: { userId: r.userId, divisionId: ud?.divId ?? null, date: new Date(day), dayFormat: r.type, breakMin: 0 },
    })
  }
}
async function unreflectLeave(tx: TxClient, r: { userId: string; type: string; dateFrom: string; dateTo: string }) {
  for (const day of eachDay(r.dateFrom, r.dateTo)) {
    await tx.dayEntry.deleteMany({ where: { userId: r.userId, date: new Date(day), dayFormat: r.type } })
  }
}

export async function requestsRoutes(app: FastifyInstance) {
  // GET /requests/types — реестр типов заявок
  app.get('/types', { preHandler: authenticate }, async () => REQUEST_TYPES)

  // GET /requests/unseen-count — для badge меню: inbox (на моё согласование, pending) +
  // answers (decidedAt моих решённых заявок; «новизну» ответа определяет клиент по last-seen).
  app.get('/unseen-count', { preHandler: authenticate }, async (request) => {
    const user = (request as any).user as { id: string }
    const [inbox, decided] = await Promise.all([
      prisma.request.count({ where: { approverId: user.id, status: 'pending' } }),
      prisma.request.findMany({ where: { userId: user.id, status: { in: ['approved', 'rejected', 'revoked'] }, decidedAt: { not: null } }, select: { decidedAt: true }, orderBy: { decidedAt: 'desc' }, take: 50 }),
    ])
    return { inbox, answers: decided.map(d => d.decidedAt!.toISOString()) }
  })

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
    // Решение + отражение в днях — АТОМАРНО (иначе заявка одобрена, а дни проставлены частично)
    const updated = await prisma.$transaction(async (tx) => {
      const upd = await tx.request.update({ where: { id }, data: { status: p.data.decision, decisionNote: p.data.note ?? null, decidedAt: new Date() }, include })
      if (p.data.decision === 'approved') await reflectLeave(tx, existing)
      return upd
    })
    return updated
  })

  // PATCH /requests/:id/revoke — отозвать одобренную заявку (согласующий/админ): откат статуса дней
  app.patch('/:id/revoke', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string; isAdmin: boolean }
    const { id } = request.params as { id: string }
    const existing = await prisma.request.findUnique({ where: { id } })
    if (!existing) return reply.code(404).send({ error: 'Request not found' })
    if (existing.approverId !== user.id && !user.isAdmin) return reply.code(403).send({ error: 'Только согласующий или админ' })
    if (existing.status !== 'approved') return reply.code(400).send({ error: 'Отозвать можно только одобренную заявку' })
    // Откат дней + смена статуса — АТОМАРНО
    return prisma.$transaction(async (tx) => {
      await unreflectLeave(tx, existing)
      return tx.request.update({ where: { id }, data: { status: 'revoked', decisionNote: 'Отозвано', decidedAt: new Date() }, include })
    })
  })

  // GET /requests/:id/document — заявление docx (для одобренного отпуска; автор или админ)
  app.get('/:id/document', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string; isAdmin: boolean }
    const { id } = request.params as { id: string }
    const req = await prisma.request.findUnique({ where: { id }, include: { user: { select: { name: true, position: true } } } })
    if (!req) return reply.code(404).send({ error: 'Request not found' })
    if (req.userId !== user.id && !user.isAdmin) return reply.code(403).send({ error: 'Только автор или админ' })
    if (req.type !== 'vacation') return reply.code(400).send({ error: 'Заявление доступно только для отпуска' })
    if (req.status !== 'approved') return reply.code(400).send({ error: 'Заявление доступно после одобрения' })
    const buffer = await buildVacationDoc({ name: req.user.name, position: req.user.position, dateFrom: req.dateFrom, dateTo: req.dateTo, submittedAt: req.createdAt.toISOString().slice(0, 10) })
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    reply.header('Content-Disposition', `attachment; filename="zayavlenie-otpusk-${id}.docx"`)
    return reply.send(buffer)
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
