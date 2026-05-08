import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '@tv-shifts/db'
import { authenticate } from '../plugins/auth'
import { requirePermission } from '../config/permissions'
import { findSheetConfig, refreshSheetData } from '../services/databaseService'
import { logEvent } from '../services/changeLog'

const createUserSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  tabNumber: z.string().optional(),
  isStaff: z.boolean().default(true),
})

const updateUserSchema = z.object({
  fullName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  tabNumber: z.string().optional(),
  isStaff: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

export async function usersRoutes(app: FastifyInstance) {
  // GET /users — список (admin only)
  app.get('/', { preHandler: requirePermission('users:manage') }, async (request) => {
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
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        tabNumber: true,
        isStaff: true,
        isActive: true,
        createdAt: true,
        userRoles: { include: { role: { select: { name: true } } } },
      },
      orderBy: { fullName: 'asc' },
    })
  })

  // GET /users/:id
  app.get('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const me = request.user as { id: string; roles?: string[] }

    // Without admin role, users can only view themselves
    const isAdmin = (me.roles ?? []).includes('admin')
    if (!isAdmin && me.id !== id) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        fullName: true,
        email: true,
        tabNumber: true,
        isStaff: true,
        isActive: true,
        createdAt: true,
        userRoles: { include: { role: { select: { name: true } } } },
      },
    })

    if (!user) return reply.code(404).send({ error: 'User not found' })
    return user
  })

  // POST /users — создание (admin only)
  app.post('/', { preHandler: requirePermission('users:manage') }, async (request, reply) => {
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
        tabNumber: body.data.tabNumber,
        isStaff: body.data.isStaff,
      },
      select: {
        id: true,
        fullName: true,
        email: true,
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
    const me = request.user as { id: string; roles?: string[] }
    const isAdmin = (me.roles ?? []).includes('admin')

    if (!isAdmin && me.id !== id) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const body = updateUserSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })
    }

    const { password, ...rest } = body.data
    const data: Record<string, unknown> = { ...rest }
    if (password) {
      data.passwordHash = await bcrypt.hash(password, 10)
    }

    // Only admin can change isActive / isStaff
    if (!isAdmin) {
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
        tabNumber: true,
        isStaff: true,
        isActive: true,
      },
    })

    return user
  })

  // DELETE /users/:id — деактивация (admin only)
  app.delete('/:id', { preHandler: requirePermission('users:manage') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const me = request.user as { id: string }

    if (me.id === id) {
      return reply.code(400).send({ error: 'Cannot deactivate yourself' })
    }

    const target = await prisma.user.findUnique({ where: { id }, select: { email: true, fullName: true } })
    await prisma.user.update({ where: { id }, data: { isActive: false } })
    logEvent('delete', id, me.id, { email: target?.email, fullName: target?.fullName }).catch(() => {})
    return { ok: true }
  })

  // GET /users/staff-import — кэшированный список сотрудников из MAIN 2
  app.get('/staff-import', { preHandler: requirePermission('users:manage') }, async (_request, reply) => {
    const cfg = await findSheetConfig('employees_buffer')
    if (!cfg?.cached_data) return { rows: [], lastSyncedAt: null }
    const data = cfg.cached_data as {
      rows: { tabNumber: string; name: string; position: string; dept: string; subDept: string }[]
    }
    return { rows: data.rows ?? [], lastSyncedAt: cfg.last_synced_at }
  })

  // GET /users/freelancers-import — кэшированный реестр фрилансеров
  app.get('/freelancers-import', { preHandler: requirePermission('users:manage') }, async (_request, reply) => {
    const cfg = await findSheetConfig('freelancers')
    if (!cfg?.cached_data) return { rows: [], lastSyncedAt: null }
    const data = cfg.cached_data as { rows: { number: string; name: string; position: string }[] }
    return { rows: data.rows ?? [], lastSyncedAt: cfg.last_synced_at }
  })

  // POST /users/freelancers-import/refresh
  app.post('/freelancers-import/refresh', { preHandler: requirePermission('users:manage') }, async (_request, reply) => {
    try {
      await refreshSheetData('freelancers')
      const cfg = await findSheetConfig('freelancers')
      const data = cfg?.cached_data as { rows: { number: string; name: string; position: string }[] } | null
      return { rows: data?.rows ?? [], lastSyncedAt: cfg?.last_synced_at ?? null }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка загрузки'
      return reply.code(500).send({ error: msg })
    }
  })

  // GET /users/roles — список всех доступных ролей (admin only)
  app.get('/roles', { preHandler: requirePermission('users:manage') }, async () => {
    return prisma.appRole.findMany({ orderBy: { name: 'asc' } })
  })

  // GET /users/:id/roles — роли конкретного пользователя
  app.get('/:id/roles', { preHandler: requirePermission('users:manage') }, async (request) => {
    const { id } = request.params as { id: string }
    const rows = await prisma.userAppRole.findMany({
      where: { userId: id },
      include: { role: true },
    })
    return rows.map((r) => ({ id: r.roleId, name: r.role.name, description: r.role.description }))
  })

  // POST /users/:id/roles — назначить роль пользователю
  app.post('/:id/roles', { preHandler: requirePermission('users:manage') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { roleId } = request.body as { roleId: string }
    if (!roleId) return reply.code(400).send({ error: 'roleId required' })

    await prisma.userAppRole.upsert({
      where: { userId_roleId: { userId: id, roleId } },
      update: {},
      create: { userId: id, roleId },
    })
    return { ok: true }
  })

  // DELETE /users/:id/roles/:roleId — снять роль
  app.delete('/:id/roles/:roleId', { preHandler: requirePermission('users:manage') }, async (request) => {
    const { id, roleId } = request.params as { id: string; roleId: string }
    await prisma.userAppRole.deleteMany({ where: { userId: id, roleId } })
    return { ok: true }
  })

  // POST /users/staff-import/refresh — обновить кэш из Google Sheets
  app.post('/staff-import/refresh', { preHandler: requirePermission('users:manage') }, async (_request, reply) => {
    try {
      await refreshSheetData('employees_buffer')
      const cfg = await findSheetConfig('employees_buffer')
      const data = cfg?.cached_data as {
        rows: { tabNumber: string; name: string; position: string; dept: string; subDept: string }[]
      } | null
      return { rows: data?.rows ?? [], lastSyncedAt: cfg?.last_synced_at ?? null }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка загрузки'
      return reply.code(500).send({ error: msg })
    }
  })
}
