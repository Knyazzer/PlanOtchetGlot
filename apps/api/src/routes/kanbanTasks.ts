import { FastifyInstance } from 'fastify'
import { prisma } from '@tv-shifts/db'
import { authenticate } from '../plugins/auth'
import { requirePermission } from '../config/permissions'

interface KanbanTask {
  id: string
  project_id: string
  title: string
  status: string
  created_by: string | null
  assignee_id: string | null
  date_start: string | null
  date_end: string | null
  created_at: Date
  updated_at: Date
  creator_name: string | null
  assignee_name: string | null
}

export async function kanbanTasksRoutes(app: FastifyInstance) {

  // GET /kanban-tasks?projectId=...
  app.get('/', { preHandler: authenticate }, async (request, reply) => {
    const { projectId } = request.query as { projectId?: string }
    if (!projectId) return reply.code(400).send({ error: 'projectId обязателен' })

    return prisma.$queryRawUnsafe<KanbanTask[]>(
      `SELECT kt.*,
              u.full_name  AS creator_name,
              pm.name      AS assignee_name
       FROM kanban_tasks kt
       LEFT JOIN users          u  ON u.id  = kt.created_by
       LEFT JOIN project_members pm ON pm.id = kt.assignee_id
       WHERE kt.project_id = $1
       ORDER BY kt.created_at ASC`,
      projectId
    )
  })

  // POST /kanban-tasks
  app.post('/', { preHandler: authenticate }, async (request, reply) => {
    const { projectId, title, assigneeId, dateStart, dateEnd } = request.body as {
      projectId: string
      title?: string
      assigneeId?: string | null
      dateStart?: string | null
      dateEnd?: string | null
    }
    if (!projectId) return reply.code(400).send({ error: 'projectId обязателен' })

    const user = (request as any).user as { id: string }

    const rows = await prisma.$queryRawUnsafe<KanbanTask[]>(
      `INSERT INTO kanban_tasks (project_id, title, status, created_by, assignee_id, date_start, date_end)
       VALUES ($1, $2, 'request', $3, $4, $5::date, $6::date)
       RETURNING *`,
      projectId,
      title?.trim() || 'Новая задача',
      user.id,
      assigneeId ?? null,
      dateStart ?? null,
      dateEnd ?? null,
    )
    return reply.code(201).send(rows[0])
  })

  // PATCH /kanban-tasks/:id
  app.patch('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as {
      title?: string
      status?: string
      assigneeId?: string | null
      dateStart?: string | null
      dateEnd?: string | null
    }

    const sets: string[] = []
    const vals: unknown[] = []
    let i = 1
    if (body.title      !== undefined) { sets.push(`title = $${i++}`);            vals.push(body.title.trim() || 'Новая задача') }
    if (body.status     !== undefined) { sets.push(`status = $${i++}`);           vals.push(body.status) }
    if (body.assigneeId !== undefined) { sets.push(`assignee_id = $${i++}`);      vals.push(body.assigneeId ?? null) }
    if (body.dateStart  !== undefined) { sets.push(`date_start = $${i++}::date`); vals.push(body.dateStart ?? null) }
    if (body.dateEnd    !== undefined) { sets.push(`date_end = $${i++}::date`);   vals.push(body.dateEnd ?? null) }
    if (sets.length === 0) return reply.code(400).send({ error: 'Нечего обновлять' })
    sets.push(`updated_at = NOW()`)
    vals.push(id)

    const rows = await prisma.$queryRawUnsafe<KanbanTask[]>(
      `UPDATE kanban_tasks SET ${sets.join(', ')} WHERE id = $${i}::uuid
       RETURNING kanban_tasks.*,
         (SELECT name FROM project_members WHERE id = kanban_tasks.assignee_id) AS assignee_name`,
      ...vals
    )
    if (!rows[0]) return reply.code(404).send({ error: 'Задача не найдена' })
    return rows[0]
  })

  // DELETE /kanban-tasks/:id
  app.delete('/:id', { preHandler: requirePermission('kanban:delete') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.$executeRawUnsafe(`DELETE FROM kanban_tasks WHERE id = $1::uuid`, id)
    return { ok: true }
  })
}
