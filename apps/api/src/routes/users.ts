import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '@tv-shifts/db'
import { requireRole, authenticate } from '../plugins/auth'

const createUserSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['employee', 'admin', 'producer']).default('employee'),
  tabNumber: z.string().optional(),
  isStaff: z.boolean().default(true),
})

const updateUserSchema = z.object({
  fullName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  role: z.enum(['employee', 'admin', 'producer']).optional(),
  tabNumber: z.string().optional(),
  isStaff: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

export async function usersRoutes(app: FastifyInstance) {
  // GET /users — список (admin only)
  app.get('/', { preHandler: requireRole('admin') }, async (request) => {
    const query = request.query as { search?: string; role?: string }

    return prisma.user.findMany({
      where: {
        isActive: true,
        ...(query.search && {
          OR: [
            { fullName: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search, mode: 'insensitive' } },
          ],
        }),
        ...(query.role && { role: query.role as any }),
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        tabNumber: true,
        isStaff: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { fullName: 'asc' },
    })
  })

  // GET /users/:id
  app.get('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const me = request.user as { id: string; role: string }

    // Сотрудник может смотреть только себя
    if (me.role === 'employee' && me.id !== id) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        tabNumber: true,
        isStaff: true,
        isActive: true,
        createdAt: true,
      },
    })

    if (!user) return reply.code(404).send({ error: 'User not found' })
    return user
  })

  // POST /users — создание (admin only)
  app.post('/', { preHandler: requireRole('admin') }, async (request, reply) => {
    const body = createUserSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })
    }

    const existing = await prisma.user.findUnique({ where: { email: body.data.email } })
    if (existing) {
      return reply.code(409).send({ error: 'Email already in use' })
    }

    const passwordHash = await bcrypt.hash(body.data.password, 10)

    const user = await prisma.user.create({
      data: {
        fullName: body.data.fullName,
        email: body.data.email,
        passwordHash,
        role: body.data.role as any,
        tabNumber: body.data.tabNumber,
        isStaff: body.data.isStaff,
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        tabNumber: true,
        isStaff: true,
        createdAt: true,
      },
    })

    return reply.code(201).send(user)
  })

  // PATCH /users/:id — обновление (admin или сам пользователь)
  app.patch('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const me = request.user as { id: string; role: string }

    if (me.role === 'employee' && me.id !== id) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const body = updateUserSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })
    }

    const data: any = { ...body.data }
    if (data.password) {
      data.passwordHash = await bcrypt.hash(data.password, 10)
      delete data.password
    }

    // Только admin может менять роль и isActive
    if (me.role !== 'admin') {
      delete data.role
      delete data.isActive
      delete data.isStaff
    }

    const user = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        tabNumber: true,
        isStaff: true,
        isActive: true,
      },
    })

    return user
  })

  // DELETE /users/:id — деактивация (admin only)
  app.delete('/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const me = request.user as { id: string }

    if (me.id === id) {
      return reply.code(400).send({ error: 'Cannot deactivate yourself' })
    }

    await prisma.user.update({ where: { id }, data: { isActive: false } })
    return { ok: true }
  })
}
