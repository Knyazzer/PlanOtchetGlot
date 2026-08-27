import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireRole } from '../plugins/auth'
import { prisma } from '@nexus/db'

// Общие справочники («Списки»): единые для всех. Чтение — всем аутентифицированным
// (формы тянут значения для выпадашек), правка значений — только админ.
// Набор списков фиксирован (сидируется миграцией); через UI меняются только значения.
export async function refsRoutes(app: FastifyInstance) {
  // GET /refs — все списки со значениями
  app.get('/', { preHandler: authenticate }, async () => {
    return prisma.refList.findMany({
      orderBy: { sortOrder: 'asc' },
      select: {
        key: true, label: true, sortOrder: true,
        items: { orderBy: [{ sortOrder: 'asc' }, { value: 'asc' }], select: { id: true, value: true } },
      },
    })
  })

  // POST /refs/:key/items — добавить значение в список (admin)
  app.post('/:key/items', { preHandler: requireRole('admin') }, async (req, reply) => {
    const { key } = req.params as { key: string }
    const parsed = z.object({ value: z.string().min(1).max(200) }).safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'validation', details: parsed.error.flatten() })

    const list = await prisma.refList.findUnique({ where: { key } })
    if (!list) return reply.code(404).send({ error: 'Список не найден' })

    const value = parsed.data.value.trim()
    const exists = await prisma.refItem.findUnique({ where: { listId_value: { listId: list.id, value } } })
    if (exists) return reply.code(409).send({ error: 'Такое значение уже есть в списке' })

    const item = await prisma.refItem.create({ data: { listId: list.id, value } })
    return reply.code(201).send({ id: item.id, value: item.value })
  })

  // DELETE /refs/items/:id — удалить значение (admin)
  app.delete('/items/:id', { preHandler: requireRole('admin') }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const item = await prisma.refItem.findUnique({ where: { id } })
    if (!item) return reply.code(404).send({ error: 'Значение не найдено' })
    await prisma.refItem.delete({ where: { id } })
    return reply.code(204).send()
  })
}
