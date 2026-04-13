import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tv-shifts/db'
import { requireRole } from '../plugins/auth'

const memberSchema = z.object({
  projectId: z.string().uuid(),
  name:      z.string().min(1),
  position:  z.string().nullable().optional(),
  shifts:    z.record(z.string()).optional(), // { "2024-03-15": "1", "2024-03-16": "8-18" }
})

interface MemberRow {
  id: string
  project_id: string
  name: string
  position: string | null
  shifts: Record<string, string>
  created_at: Date
  updated_at: Date
}

export async function projectMembersRoutes(app: FastifyInstance) {

  // GET /project-members?projectId=...
  app.get('/', { preHandler: requireRole('admin') }, async (request) => {
    const { projectId } = request.query as { projectId?: string }
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

    const { projectId, name, position, shifts } = body.data
    const rows = await prisma.$queryRawUnsafe<MemberRow[]>(
      `INSERT INTO project_members (id, project_id, name, position, shifts, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4::jsonb, NOW())
       RETURNING *`,
      projectId,
      name,
      position ?? null,
      JSON.stringify(shifts ?? {}),
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
    if (body.data.name     !== undefined) { sets.push(`name = $${i++}`);              vals.push(body.data.name) }
    if (body.data.position !== undefined) { sets.push(`position = $${i++}`);          vals.push(body.data.position ?? null) }
    if (body.data.shifts   !== undefined) { sets.push(`shifts = $${i++}::jsonb`);     vals.push(JSON.stringify(body.data.shifts)) }
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

  // DELETE /project-members/:id
  app.delete('/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `DELETE FROM project_members WHERE id = $1 RETURNING id`, id
    )
    if (!rows[0]) return reply.code(404).send({ error: 'Участник не найден' })
    return { ok: true }
  })
}
