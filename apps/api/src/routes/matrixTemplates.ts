import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tv-shifts/db'
import { requireRole } from '../plugins/auth'

const templateSchema = z.object({
  name:     z.string().min(1),
  sheetUrl: z.string().url(),
})

interface TemplateRow {
  id: string
  name: string
  sheet_url: string
  is_active: boolean
  created_at: Date
  updated_at: Date
}

export async function matrixTemplatesRoutes(app: FastifyInstance) {

  // GET /matrix-templates
  app.get('/', { preHandler: requireRole('admin') }, async () => {
    return prisma.$queryRawUnsafe<TemplateRow[]>(
      `SELECT * FROM matrix_templates ORDER BY created_at ASC`
    )
  })

  // POST /matrix-templates
  app.post('/', { preHandler: requireRole('admin') }, async (request, reply) => {
    const body = templateSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Неверные данные' })

    const rows = await prisma.$queryRawUnsafe<TemplateRow[]>(
      `INSERT INTO matrix_templates (id, name, sheet_url, updated_at)
       VALUES (gen_random_uuid(), $1, $2, NOW())
       RETURNING *`,
      body.data.name,
      body.data.sheetUrl,
    )
    return reply.code(201).send(rows[0])
  })

  // PATCH /matrix-templates/:id
  app.patch('/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = templateSchema.partial().safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Неверные данные' })

    const sets: string[] = []
    const vals: unknown[] = []
    let i = 1
    if (body.data.name     !== undefined) { sets.push(`name = $${i++}`);      vals.push(body.data.name) }
    if (body.data.sheetUrl !== undefined) { sets.push(`sheet_url = $${i++}`); vals.push(body.data.sheetUrl) }
    if (sets.length === 0) return reply.code(400).send({ error: 'Нечего обновлять' })
    sets.push(`updated_at = NOW()`)
    vals.push(id)

    const rows = await prisma.$queryRawUnsafe<TemplateRow[]>(
      `UPDATE matrix_templates SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      ...vals
    )
    if (!rows[0]) return reply.code(404).send({ error: 'Шаблон не найден' })
    return rows[0]
  })

  // POST /matrix-templates/:id/activate — set as the active template
  app.post('/:id/activate', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.$executeRawUnsafe(`UPDATE matrix_templates SET is_active = false, updated_at = NOW()`)
    const rows = await prisma.$queryRawUnsafe<TemplateRow[]>(
      `UPDATE matrix_templates SET is_active = true, updated_at = NOW() WHERE id = $1 RETURNING *`, id
    )
    if (!rows[0]) return reply.code(404).send({ error: 'Шаблон не найден' })
    return rows[0]
  })

  // DELETE /matrix-templates/:id
  app.delete('/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.$executeRawUnsafe(`DELETE FROM matrix_templates WHERE id = $1`, id)
    return { ok: true }
  })
}
