import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tv-shifts/db'
import { authenticate } from '../plugins/auth'
import { requirePermission } from '../config/permissions'

// ─── Shift Expenses (/shift-expenses) ────────────────────────────────────────

const shiftExpenseSchema = z.object({
  projectId:   z.string().uuid(),
  expenseType: z.string().optional(),
  orderedBy:   z.string().nullable().optional(),
  amount:      z.number().nullable().optional(),
  notes:       z.string().nullable().optional(),
})

// ─── Gantt Tasks (/matrix-gantt) ──────────────────────────────────────────────

const ganttTaskSchema = z.object({
  matrixId:  z.string().uuid(),
  name:      z.string().min(1),
  startDate: z.string().datetime().nullable().optional(),
  deadline:  z.string().datetime().nullable().optional(),
  done:      z.boolean().optional(),
  order:     z.number().int().optional(),
})

// ─── Matrix Notes (/matrix-notes) ─────────────────────────────────────────────

const matrixNoteSchema = z.object({
  matrixId: z.string().uuid(),
  text:     z.string().min(1),
})

// ─── Matrix Documents (/matrix-documents) ─────────────────────────────────────

const matrixDocSchema = z.object({
  matrixId: z.string().uuid(),
  name:     z.string().min(1),
  url:      z.string().url(),
})

export async function matrixExtrasRoutes(app: FastifyInstance) {

  // ── Shift Expenses ─────────────────────────────────────────────────────────

  // GET /shift-expenses?projectId=...
  app.get('/shift-expenses', { preHandler: authenticate }, async (request) => {
    const { projectId } = request.query as { projectId?: string }
    if (!projectId) return []
    return prisma.$queryRawUnsafe<object[]>(
      `SELECT * FROM shift_expenses WHERE project_id = $1 ORDER BY created_at ASC`,
      projectId,
    )
  })

  // POST /shift-expenses
  app.post('/shift-expenses', { preHandler: requirePermission('matrix:write') }, async (request, reply) => {
    const body = shiftExpenseSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Неверные данные' })
    const { projectId, expenseType, orderedBy, amount, notes } = body.data
    const rows = await prisma.$queryRawUnsafe<object[]>(
      `INSERT INTO shift_expenses (id, project_id, expense_type, ordered_by, amount, notes, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      projectId, expenseType ?? '', orderedBy ?? null, amount ?? null, notes ?? null,
    )
    return reply.code(201).send((rows as any[])[0])
  })

  // PATCH /shift-expenses/:id
  app.patch('/shift-expenses/:id', { preHandler: requirePermission('matrix:write') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = shiftExpenseSchema.omit({ projectId: true }).partial().safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Неверные данные' })
    const sets: string[] = []
    const vals: unknown[] = []
    let i = 1
    if (body.data.expenseType !== undefined) { sets.push(`expense_type = $${i++}`); vals.push(body.data.expenseType) }
    if (body.data.orderedBy   !== undefined) { sets.push(`ordered_by = $${i++}`);   vals.push(body.data.orderedBy ?? null) }
    if (body.data.amount      !== undefined) { sets.push(`amount = $${i++}`);        vals.push(body.data.amount ?? null) }
    if (body.data.notes       !== undefined) { sets.push(`notes = $${i++}`);         vals.push(body.data.notes ?? null) }
    if (sets.length === 0) return reply.code(400).send({ error: 'Нечего обновлять' })
    sets.push(`updated_at = NOW()`)
    vals.push(id)
    const rows = await prisma.$queryRawUnsafe<object[]>(
      `UPDATE shift_expenses SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, ...vals,
    )
    if (!(rows as any[])[0]) return reply.code(404).send({ error: 'Расход не найден' })
    return (rows as any[])[0]
  })

  // DELETE /shift-expenses/:id
  app.delete('/shift-expenses/:id', { preHandler: requirePermission('matrix:write') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `DELETE FROM shift_expenses WHERE id = $1 RETURNING id`, id,
    )
    if (!(rows as any[])[0]) return reply.code(404).send({ error: 'Расход не найден' })
    return { ok: true }
  })

  // ── Gantt ──────────────────────────────────────────────────────────────────

  // GET /matrix-gantt?matrixId=...
  app.get('/matrix-gantt', { preHandler: authenticate }, async (request) => {
    const { matrixId } = request.query as { matrixId?: string }
    if (!matrixId) return []
    return prisma.$queryRawUnsafe<object[]>(
      `SELECT * FROM gantt_tasks WHERE matrix_id = $1 ORDER BY "order" ASC, created_at ASC`,
      matrixId,
    )
  })

  // POST /matrix-gantt
  app.post('/matrix-gantt', { preHandler: requirePermission('matrix:write') }, async (request, reply) => {
    const body = ganttTaskSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Неверные данные' })
    const { matrixId, name, startDate, deadline, done, order } = body.data
    const rows = await prisma.$queryRawUnsafe<object[]>(
      `INSERT INTO gantt_tasks (id, matrix_id, name, start_date, deadline, done, "order", updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`,
      matrixId, name,
      startDate ? new Date(startDate) : null,
      deadline  ? new Date(deadline)  : null,
      done ?? false,
      order ?? 0,
    )
    return reply.code(201).send((rows as any[])[0])
  })

  // PATCH /matrix-gantt/:id
  app.patch('/matrix-gantt/:id', { preHandler: requirePermission('matrix:write') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = ganttTaskSchema.omit({ matrixId: true }).partial().safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Неверные данные' })

    const sets: string[] = []
    const vals: unknown[] = []
    let i = 1
    if (body.data.name      !== undefined) { sets.push(`name = $${i++}`);       vals.push(body.data.name) }
    if (body.data.startDate !== undefined) { sets.push(`start_date = $${i++}`); vals.push(body.data.startDate ? new Date(body.data.startDate) : null) }
    if (body.data.deadline  !== undefined) { sets.push(`deadline = $${i++}`);   vals.push(body.data.deadline  ? new Date(body.data.deadline)  : null) }
    if (body.data.done      !== undefined) { sets.push(`done = $${i++}`);        vals.push(body.data.done) }
    if (body.data.order     !== undefined) { sets.push(`"order" = $${i++}`);     vals.push(body.data.order) }
    if (sets.length === 0) return reply.code(400).send({ error: 'Нечего обновлять' })
    sets.push(`updated_at = NOW()`)
    vals.push(id)

    const rows = await prisma.$queryRawUnsafe<object[]>(
      `UPDATE gantt_tasks SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      ...vals,
    )
    if (!(rows as any[])[0]) return reply.code(404).send({ error: 'Задача не найдена' })
    return (rows as any[])[0]
  })

  // DELETE /matrix-gantt/:id
  app.delete('/matrix-gantt/:id', { preHandler: requirePermission('matrix:write') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `DELETE FROM gantt_tasks WHERE id = $1 RETURNING id`, id,
    )
    if (!(rows as any[])[0]) return reply.code(404).send({ error: 'Задача не найдена' })
    return { ok: true }
  })

  // ── Notes ──────────────────────────────────────────────────────────────────

  // GET /matrix-notes?matrixId=...
  app.get('/matrix-notes', { preHandler: authenticate }, async (request) => {
    const { matrixId } = request.query as { matrixId?: string }
    if (!matrixId) return []
    return prisma.$queryRawUnsafe<object[]>(
      `SELECT n.*, u.full_name AS author_name
       FROM matrix_notes n
       JOIN users u ON u.id = n.user_id
       WHERE n.matrix_id = $1
       ORDER BY n.created_at ASC`,
      matrixId,
    )
  })

  // POST /matrix-notes
  app.post('/matrix-notes', { preHandler: authenticate }, async (request, reply) => {
    const body = matrixNoteSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Неверные данные' })
    const me = request.user as { id: string }
    const rows = await prisma.$queryRawUnsafe<object[]>(
      `INSERT INTO matrix_notes (id, matrix_id, user_id, text)
       VALUES (gen_random_uuid(), $1, $2, $3)
       RETURNING *`,
      body.data.matrixId, me.id, body.data.text,
    )
    const note = (rows as any[])[0]
    // Fetch with author name
    const full = await prisma.$queryRawUnsafe<object[]>(
      `SELECT n.*, u.full_name AS author_name FROM matrix_notes n JOIN users u ON u.id = n.user_id WHERE n.id = $1`,
      note.id,
    )
    return reply.code(201).send((full as any[])[0])
  })

  // DELETE /matrix-notes/:id
  app.delete('/matrix-notes/:id', { preHandler: requirePermission('matrix:write') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `DELETE FROM matrix_notes WHERE id = $1 RETURNING id`, id,
    )
    if (!(rows as any[])[0]) return reply.code(404).send({ error: 'Заметка не найдена' })
    return { ok: true }
  })

  // ── Documents ──────────────────────────────────────────────────────────────

  // GET /matrix-documents?matrixId=...
  app.get('/matrix-documents', { preHandler: authenticate }, async (request) => {
    const { matrixId } = request.query as { matrixId?: string }
    if (!matrixId) return []
    return prisma.$queryRawUnsafe<object[]>(
      `SELECT * FROM matrix_documents WHERE matrix_id = $1 ORDER BY created_at ASC`,
      matrixId,
    )
  })

  // POST /matrix-documents
  app.post('/matrix-documents', { preHandler: requirePermission('matrix:write') }, async (request, reply) => {
    const body = matrixDocSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Неверные данные' })
    const rows = await prisma.$queryRawUnsafe<object[]>(
      `INSERT INTO matrix_documents (id, matrix_id, name, url)
       VALUES (gen_random_uuid(), $1, $2, $3)
       RETURNING *`,
      body.data.matrixId, body.data.name, body.data.url,
    )
    return reply.code(201).send((rows as any[])[0])
  })

  // DELETE /matrix-documents/:id
  app.delete('/matrix-documents/:id', { preHandler: requirePermission('matrix:write') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `DELETE FROM matrix_documents WHERE id = $1 RETURNING id`, id,
    )
    if (!(rows as any[])[0]) return reply.code(404).send({ error: 'Документ не найден' })
    return { ok: true }
  })
}
