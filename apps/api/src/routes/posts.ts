import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@nexus/db'
import { authenticate } from '../plugins/auth'
import { hasModule } from '../services/access'

// Пульс — новостная лента компании. Читают все; публикуют по праву adm.news (или админ).
const authorSel = { author: { select: { id: true, name: true } } }

const createSchema = z.object({
  title:  z.string().max(200).optional().default(''),
  body:   z.string().min(1).max(10_000),
  pinned: z.boolean().optional().default(false),
})
const updateSchema = z.object({
  title:  z.string().max(200).optional(),
  body:   z.string().min(1).max(10_000).optional(),
  pinned: z.boolean().optional(),
})

const canPublish = (userId: string, isAdmin: boolean) =>
  isAdmin ? Promise.resolve(true) : hasModule(userId, isAdmin, 'adm.news', 'edit')

export async function postsRoutes(app: FastifyInstance) {
  // GET /posts — лента: закреплённые сверху, затем по дате. + флаг canPost для текущего юзера.
  app.get('/', { preHandler: authenticate }, async (request) => {
    const user = (request as any).user as { id: string; isAdmin: boolean }
    const posts = await prisma.post.findMany({
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      take: 100,
      include: authorSel,
    })
    return { posts, canPost: await canPublish(user.id, user.isAdmin) }
  })

  // POST /posts — опубликовать пост (право adm.news / админ).
  app.post('/', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string; isAdmin: boolean }
    if (!(await canPublish(user.id, user.isAdmin))) return reply.code(403).send({ error: 'Нет права публиковать' })
    const p = createSchema.safeParse(request.body)
    if (!p.success) return reply.code(400).send({ error: 'Некорректные данные', details: p.error.flatten() })
    const post = await prisma.post.create({ data: { ...p.data, authorId: user.id }, include: authorSel })
    return reply.code(201).send(post)
  })

  // PATCH /posts/:id — правка/закрепление (автор или админ).
  app.patch('/:id', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string; isAdmin: boolean }
    const { id } = request.params as { id: string }
    const p = updateSchema.safeParse(request.body)
    if (!p.success) return reply.code(400).send({ error: 'Некорректные данные', details: p.error.flatten() })
    const existing = await prisma.post.findUnique({ where: { id } })
    if (!existing) return reply.code(404).send({ error: 'Post not found' })
    if (existing.authorId !== user.id && !user.isAdmin) return reply.code(403).send({ error: 'Только автор или админ' })
    const post = await prisma.post.update({ where: { id }, data: p.data, include: authorSel })
    return post
  })

  // DELETE /posts/:id — удалить (автор или админ).
  app.delete('/:id', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string; isAdmin: boolean }
    const { id } = request.params as { id: string }
    const existing = await prisma.post.findUnique({ where: { id } })
    if (!existing) return reply.code(404).send({ error: 'Post not found' })
    if (existing.authorId !== user.id && !user.isAdmin) return reply.code(403).send({ error: 'Только автор или админ' })
    await prisma.post.delete({ where: { id } })
    return reply.code(204).send()
  })
}
