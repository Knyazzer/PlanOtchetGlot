import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireRole } from '../plugins/auth'
import { prisma } from '@nexus/db'
import { getSheetConfig } from '../services/databaseService'

export async function clientsRoutes(app: FastifyInstance) {

  // GET /clients — список всех клиентов
  app.get('/', { preHandler: authenticate }, async () => {
    return prisma.client.findMany({ orderBy: { name: 'asc' } })
  })

  // POST /clients — создать клиента
  app.post('/', { preHandler: requireRole('admin') }, async (req, reply) => {
    const parsed = z.object({ name: z.string().min(1) }).safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'validation', details: parsed.error.flatten() })
    const { name } = parsed.data
    const existing = await prisma.client.findUnique({ where: { name } })
    if (existing) return reply.code(409).send({ error: 'Клиент с таким именем уже существует' })
    return prisma.client.create({ data: { name } })
  })

  // PATCH /clients/:id — переименовать клиента
  app.patch('/:id', { preHandler: requireRole('admin') }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const parsed = z.object({ name: z.string().min(1) }).safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'validation', details: parsed.error.flatten() })
    const { name } = parsed.data
    const client = await prisma.client.findUnique({ where: { id } })
    if (!client) return reply.code(404).send({ error: 'Клиент не найден' })
    return prisma.client.update({ where: { id }, data: { name } })
  })

  // DELETE /clients/:id — удалить клиента (только если нет проектов)
  app.delete('/:id', { preHandler: requireRole('admin') }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const count = await prisma.project.count({ where: { clientId: id } })
    if (count > 0) return reply.code(400).send({ error: `Клиент используется в ${count} проектах` })
    await prisma.client.delete({ where: { id } })
    return { ok: true }
  })

  // POST /clients/bulk-import — импорт из кеша КФПД (колонка A)
  app.post('/bulk-import', { preHandler: requireRole('admin') }, async (_req, reply) => {
    const cfg = await getSheetConfig('kfpd')
    if (!cfg?.cachedData) {
      return reply.code(400).send({ error: 'Нет данных КФПД. Сначала обновите таблицу в разделе Данные.' })
    }

    const data = cfg.cachedData as { columns?: string[]; rows?: string[][] }
    const rows = data.rows ?? []

    // колонка A (индекс 0) — клиенты
    const names = [...new Set(
      rows.map(r => (r[0] ?? '').trim()).filter(Boolean)
    )]

    let created = 0
    let skipped = 0

    for (const name of names) {
      const existing = await prisma.client.findUnique({ where: { name } })
      if (existing) { skipped++; continue }
      await prisma.client.create({ data: { name } })
      created++
    }

    return { created, skipped, total: names.length }
  })
}
