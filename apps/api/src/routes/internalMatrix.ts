import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tv-shifts/db'
import { requireRole } from '../plugins/auth'

const createMatrixSchema = z.object({
  name:       z.string().min(1),
  client:     z.string().nullable().optional(),
  unit:       z.string().nullable().optional(),
  format:     z.string().nullable().optional(),
  date:       z.string().nullable().optional(),
  producer:   z.string().nullable().optional(),
  manager:    z.string().nullable().optional(),
  curator:    z.string().nullable().optional(),
  templateId: z.string().uuid().nullable().optional(),
})

interface MatrixRow {
  id: string
  matrix_id: string
  sheet_url: string | null
  status: string | null
  unit: string | null
  client: string | null
  name: string | null
  format: string | null
  date: Date | null
  producer: string | null
  manager: string | null
  curator: string | null
  source: string
  template_id: string | null
  created_at: Date
  updated_at: Date
}

export async function internalMatrixRoutes(app: FastifyInstance) {

  // POST /internal-matrix — create internal matrix record
  app.post('/', { preHandler: requireRole('admin') }, async (request, reply) => {
    const body = createMatrixSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Неверные данные', details: body.error.flatten() })

    const { name, client, unit, format, date, producer, manager, curator, templateId } = body.data

    // Generate a unique matrix ID
    const matrixId = `INT-${Date.now()}`

    const rows = await prisma.$queryRawUnsafe<MatrixRow[]>(
      `INSERT INTO matrix_registry
         (id, matrix_id, name, client, unit, format, date, producer, manager, curator,
          source, template_id, sheet_url, updated_at)
       VALUES
         (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9,
          'internal', $10, NULL, NOW())
       RETURNING *`,
      matrixId,
      name,
      client ?? null,
      unit ?? null,
      format ?? null,
      date ? new Date(date) : null,
      producer ?? null,
      manager ?? null,
      curator ?? null,
      templateId ?? null,
    )

    return reply.code(201).send(rows[0])
  })

  // PATCH /internal-matrix/:id — update internal matrix
  app.patch('/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = createMatrixSchema.partial().safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Неверные данные' })

    const sets: string[] = []
    const vals: unknown[] = []
    let i = 1
    const map: Record<string, string> = {
      name: 'name', client: 'client', unit: 'unit', format: 'format',
      date: 'date', producer: 'producer', manager: 'manager', curator: 'curator',
      templateId: 'template_id',
    }
    for (const [key, col] of Object.entries(map)) {
      if ((body.data as any)[key] !== undefined) {
        const val = key === 'date' && (body.data as any)[key]
          ? new Date((body.data as any)[key])
          : (body.data as any)[key] ?? null
        sets.push(`${col} = $${i++}`)
        vals.push(val)
      }
    }
    if (sets.length === 0) return reply.code(400).send({ error: 'Нечего обновлять' })
    sets.push(`updated_at = NOW()`)
    vals.push(id)

    const rows = await prisma.$queryRawUnsafe<MatrixRow[]>(
      `UPDATE matrix_registry SET ${sets.join(', ')} WHERE id = $${i} AND source = 'internal' RETURNING *`,
      ...vals
    )
    if (!rows[0]) return reply.code(404).send({ error: 'Матрица не найдена' })
    return rows[0]
  })

  // DELETE /internal-matrix/:id
  app.delete('/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const result = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `DELETE FROM matrix_registry WHERE id = $1 AND source = 'internal' RETURNING id`, id
    )
    if (!result[0]) return reply.code(404).send({ error: 'Матрица не найдена или не внутренняя' })
    return { ok: true }
  })

  // GET /internal-matrix/by-client/:client — list internal matrices for a client (for project linking)
  app.get('/by-client/:client', { preHandler: requireRole('admin') }, async (request) => {
    const { client } = request.params as { client: string }
    return prisma.$queryRawUnsafe<MatrixRow[]>(
      `SELECT * FROM matrix_registry WHERE source = 'internal' AND client ILIKE $1 ORDER BY created_at DESC`,
      client
    )
  })

  // GET /internal-matrix — list all internal matrices
  app.get('/', { preHandler: requireRole('admin') }, async () => {
    return prisma.$queryRawUnsafe<MatrixRow[]>(
      `SELECT * FROM matrix_registry WHERE source = 'internal' ORDER BY created_at DESC`
    )
  })
}
