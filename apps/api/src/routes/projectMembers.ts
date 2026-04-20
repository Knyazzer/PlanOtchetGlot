import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tv-shifts/db'
import { requireRole } from '../plugins/auth'
// syncProjectBlock removed — sync is now manual via POST /internal-matrix/sync-to-drive

// shifts value: строка (legacy) или объект { type, confirmed, timeStart, timeEnd }
const shiftValueSchema = z.union([
  z.string(),
  z.object({
    type:      z.string().optional(),
    confirmed: z.enum(['yes', 'pending']).nullable().optional(),
    timeStart: z.string().nullable().optional(),
    timeEnd:   z.string().nullable().optional(),
  }),
])

const PAYMENT_TYPES = ['cash', 'card', 'sbp', 'invoice'] as const
const PAYMENT_STATUSES = ['unpaid', 'pending', 'paid'] as const

const memberSchema = z.object({
  projectId:        z.string().uuid(),
  name:             z.string().min(1),
  position:         z.string().nullable().optional(),
  shifts:           z.record(shiftValueSchema).optional(),
  employmentType:   z.string().nullable().optional(),
  ratePlan:         z.number().nullable().optional(),
  rateFact:         z.number().nullable().optional(),
  isApproved:       z.boolean().optional(),
  fieldApprovals:   z.record(z.boolean()).optional(),
  groupName:        z.string().nullable().optional(),
  telegramUsername: z.string().nullable().optional(),
  isFreelancer:     z.boolean().optional(),
  paymentType:      z.enum(PAYMENT_TYPES).nullable().optional(),
  paymentStatus:    z.enum(PAYMENT_STATUSES).optional(),
  paymentAmount:    z.number().nullable().optional(),
})

export type ShiftValue = z.infer<typeof shiftValueSchema>

interface MemberRow {
  id: string
  project_id: string
  name: string
  position: string | null
  employment_type: string | null
  rate_plan: string | null
  rate_fact: string | null
  shifts: Record<string, ShiftValue>
  telegram_username: string | null
  is_freelancer: boolean
  payment_type: string | null
  payment_status: string
  payment_amount: string | null
  created_at: Date
  updated_at: Date
}

export async function projectMembersRoutes(app: FastifyInstance) {

  // GET /project-members?projectId=...  OR  ?freelancers=true[&status=...][&month=YYYY-MM]
  app.get('/', { preHandler: requireRole('admin', 'producer') }, async (request) => {
    const { projectId, freelancers, status, month } = request.query as {
      projectId?: string; freelancers?: string; status?: string; month?: string
    }

    if (freelancers === 'true') {
      const conditions: string[] = ['pm.is_freelancer = true']
      const vals: unknown[] = []
      let i = 1
      if (status) { conditions.push(`pm.payment_status = $${i++}`); vals.push(status) }
      if (month) {
        conditions.push(`to_char(sr.date, 'YYYY-MM') = $${i++}`)
        vals.push(month)
      }
      const where = conditions.join(' AND ')
      return prisma.$queryRawUnsafe<(MemberRow & { project_name: string; project_date: string | null; matrix_id: string | null })[]>(
        `SELECT pm.*, sr.name AS project_name, sr.date::text AS project_date, sr.matrix_registry_id AS matrix_id
         FROM project_members pm
         LEFT JOIN status_rows sr ON sr.id = pm.project_id
         WHERE ${where}
         ORDER BY sr.date DESC NULLS LAST, pm.name ASC`,
        ...vals
      )
    }

    if (!projectId) return []
    return prisma.$queryRawUnsafe<MemberRow[]>(
      `SELECT * FROM project_members WHERE project_id = $1 ORDER BY created_at ASC`,
      projectId
    )
  })

  // POST /project-members
  app.post('/', { preHandler: requireRole('admin') }, async (request, reply) => {
    const body = memberSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Неверные данные', details: body.error.flatten() })

    const { projectId, name, position, shifts, employmentType, ratePlan, rateFact, groupName, telegramUsername, isFreelancer, paymentType, paymentStatus, paymentAmount } = body.data
    const rows = await prisma.$queryRawUnsafe<MemberRow[]>(
      `INSERT INTO project_members (id, project_id, name, position, employment_type, rate_plan, rate_fact, shifts, group_name, telegram_username, is_freelancer, payment_type, payment_status, payment_amount, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, NOW())
       RETURNING *`,
      projectId,
      name,
      position ?? null,
      employmentType ?? null,
      ratePlan ?? null,
      rateFact ?? null,
      JSON.stringify(shifts ?? {}),
      groupName ?? null,
      telegramUsername ?? null,
      isFreelancer ?? false,
      paymentType ?? null,
      paymentStatus ?? 'unpaid',
      paymentAmount ?? null,
    )
    return reply.code(201).send(rows[0])
  })

  // PATCH /project-members/:id
  app.patch('/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = memberSchema.omit({ projectId: true }).partial().safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Неверные данные' })

    const sets: string[] = []
    const vals: unknown[] = []
    let i = 1
    if (body.data.name           !== undefined) { sets.push(`name = $${i++}`);                vals.push(body.data.name) }
    if (body.data.position       !== undefined) { sets.push(`position = $${i++}`);            vals.push(body.data.position ?? null) }
    if (body.data.employmentType !== undefined) { sets.push(`employment_type = $${i++}`);     vals.push(body.data.employmentType ?? null) }
    if (body.data.ratePlan       !== undefined) { sets.push(`rate_plan = $${i++}`);           vals.push(body.data.ratePlan ?? null) }
    if (body.data.rateFact       !== undefined) { sets.push(`rate_fact = $${i++}`);           vals.push(body.data.rateFact ?? null) }
    if (body.data.shifts         !== undefined) { sets.push(`shifts = $${i++}::jsonb`);       vals.push(JSON.stringify(body.data.shifts)) }
    if (body.data.isApproved     !== undefined) { sets.push(`is_approved = $${i++}`);                      vals.push(body.data.isApproved) }
    if (body.data.fieldApprovals !== undefined) { sets.push(`field_approvals = field_approvals || $${i++}::jsonb`); vals.push(JSON.stringify(body.data.fieldApprovals)) }
    if (body.data.groupName        !== undefined) { sets.push(`group_name = $${i++}`);          vals.push(body.data.groupName ?? null) }
    if (body.data.telegramUsername !== undefined) { sets.push(`telegram_username = $${i++}`);   vals.push(body.data.telegramUsername ?? null) }
    if (body.data.isFreelancer     !== undefined) { sets.push(`is_freelancer = $${i++}`);       vals.push(body.data.isFreelancer) }
    if (body.data.paymentType      !== undefined) { sets.push(`payment_type = $${i++}`);        vals.push(body.data.paymentType ?? null) }
    if (body.data.paymentStatus    !== undefined) { sets.push(`payment_status = $${i++}`);      vals.push(body.data.paymentStatus) }
    if (body.data.paymentAmount    !== undefined) { sets.push(`payment_amount = $${i++}`);      vals.push(body.data.paymentAmount ?? null) }
    if (sets.length === 0) return reply.code(400).send({ error: 'Нечего обновлять' })
    sets.push(`updated_at = NOW()`)
    vals.push(id)

    const rows = await prisma.$queryRawUnsafe<MemberRow[]>(
      `UPDATE project_members SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      ...vals
    )
    if (!rows[0]) return reply.code(404).send({ error: 'Участник не найден' })
    return rows[0]
  })

  // POST /project-members/bulk-status — массовое обновление payment_status
  app.post('/bulk-status', { preHandler: requireRole('admin', 'producer') }, async (request, reply) => {
    const { ids, paymentStatus } = request.body as { ids: string[]; paymentStatus: string }
    if (!Array.isArray(ids) || !ids.length || !paymentStatus) return reply.code(400).send({ error: 'Неверные данные' })
    await prisma.$executeRawUnsafe(
      `UPDATE project_members SET payment_status = $1, updated_at = NOW() WHERE id = ANY($2::uuid[])`,
      paymentStatus, ids,
    )
    return { updated: ids.length }
  })

  // DELETE /project-members/:id
  app.delete('/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const rows = await prisma.$queryRawUnsafe<{ id: string; project_id: string }[]>(
      `DELETE FROM project_members WHERE id = $1 RETURNING id, project_id`, id
    )
    if (!rows[0]) return reply.code(404).send({ error: 'Участник не найден' })
    return { ok: true }
  })
}
