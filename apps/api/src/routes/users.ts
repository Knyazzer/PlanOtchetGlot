import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '@tv-shifts/db'
import { authenticate } from '../plugins/auth'
import { requirePermission } from '../config/permissions'
import { findSheetConfig, refreshSheetData } from '../services/databaseService'
import { logEvent } from '../services/changeLog'

const TRANSLIT: Record<string, string> = {
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',
  м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',
  щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',
}
function generateEmail(fullName: string): string {
  const parts = fullName.trim().toLowerCase().split(/\s+/)
  const translit = (s: string) => s.split('').map(c => TRANSLIT[c] ?? c).join('')
  const last  = translit(parts[0] ?? 'user')
  const first = translit(parts[1] ?? '')
  const base  = first ? `${last}.${first}` : last
  return `${base}@tvshifts.ru`
}

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

  // DELETE /users/:id — деактивация (admin only), admin account protected
  app.delete('/:id', { preHandler: requirePermission('users:manage') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const me = request.user as { id: string }

    if (me.id === id) return reply.code(400).send({ error: 'Cannot deactivate yourself' })

    // Protect admin accounts from deletion
    const targetRoles = await prisma.userAppRole.findMany({ where: { userId: id }, include: { role: true } })
    if (targetRoles.some((r) => r.role.name === 'admin')) {
      return reply.code(400).send({ error: 'Cannot deactivate admin account' })
    }

    const target = await prisma.user.findUnique({ where: { id }, select: { email: true, fullName: true } })
    await prisma.user.update({ where: { id }, data: { isActive: false } })
    logEvent('delete', id, me.id, { email: target?.email, fullName: target?.fullName }).catch(() => {})
    return { ok: true }
  })

  // DELETE /users/bulk-deactivate — deactivate all non-admin users (dev tool)
  app.delete('/bulk-deactivate', { preHandler: requirePermission('users:manage') }, async (request, reply) => {
    const me = request.user as { id: string }
    // Find all admin user IDs to protect them
    const adminRoleUsers = await prisma.userAppRole.findMany({
      where: { role: { name: 'admin' } },
      select: { userId: true },
    })
    const protectedIds = new Set([me.id, ...adminRoleUsers.map((r) => r.userId)])
    const toDeactivate = await prisma.user.findMany({
      where: { isActive: true, id: { notIn: [...protectedIds] } },
      select: { id: true },
    })
    await prisma.user.updateMany({
      where: { id: { in: toDeactivate.map((u) => u.id) } },
      data: { isActive: false },
    })
    return { deactivated: toDeactivate.length }
  })

  // POST /users/bulk-register — register all staff-import rows without accounts (dev tool)
  app.post('/bulk-register', { preHandler: requirePermission('users:manage') }, async (request, reply) => {
    const body = request.body as { role?: string }
    const role = body?.role ?? 'employee'
    const defaultPassword = 'Tvshifts2026'

    const cfg = await findSheetConfig('employees_buffer')
    if (!cfg?.cached_data) return reply.code(400).send({ error: 'No staff import data. Refresh first.' })

    const importData = cfg.cached_data as { rows: { name: string; tabNumber: string; dept: string; subDept: string; position: string }[] }
    const rows = importData.rows ?? []

    const [activeUsers, inactiveUsers, allDepts] = await Promise.all([
      prisma.user.findMany({ where: { isActive: true  }, select: { id: true, fullName: true, tabNumber: true } }),
      prisma.user.findMany({ where: { isActive: false }, select: { id: true, fullName: true, tabNumber: true } }),
      prisma.department.findMany({ select: { id: true, name: true } }),
    ])

    const activeNames  = new Set(activeUsers.map((u) => u.fullName.toLowerCase().trim()))
    const activeTabs   = new Set(activeUsers.map((u) => u.tabNumber).filter(Boolean))
    const inactiveByName = new Map(inactiveUsers.map((u) => [u.fullName.toLowerCase().trim(), u]))
    const inactiveByTab  = new Map(inactiveUsers.filter((u) => u.tabNumber).map((u) => [u.tabNumber!, u]))
    const deptByName     = new Map(allDepts.map((d) => [d.name.toLowerCase().trim(), d.id]))

    const hash = await bcrypt.hash(defaultPassword, 10)
    const [roleRecord, deptDirectorRole] = await Promise.all([
      prisma.appRole.findFirst({ where: { name: role } }),
      prisma.appRole.findFirst({ where: { name: 'dept_director' } }),
    ])

    const HEAD_KEYWORDS = ['руководитель', 'директор', 'начальник', 'заведующий']
    function isHeadPosition(position: string): boolean {
      const p = position.toLowerCase()
      return HEAD_KEYWORDS.some((k) => p.includes(k))
    }

    async function assignToDept(userId: string, row: { dept: string; subDept: string; position: string }) {
      const deptId =
        deptByName.get(row.subDept?.toLowerCase().trim()) ??
        deptByName.get(row.dept?.toLowerCase().trim())
      if (!deptId) return
      const isHead = isHeadPosition(row.position ?? '')
      await prisma.deptMember.upsert({
        where:  { userId_deptId: { userId, deptId } },
        update: { isHead },
        create: { userId, deptId, isHead },
      })
      if (isHead && deptDirectorRole) {
        await prisma.userAppRole.upsert({
          where:  { userId_roleId: { userId, roleId: deptDirectorRole.id } },
          update: {},
          create: { userId, roleId: deptDirectorRole.id },
        })
      }
    }

    let created = 0
    let skipped = 0
    const created_accounts: { fullName: string; email: string; password: string }[] = []

    for (const row of rows) {
      const name: string = row.name?.trim() ?? ''
      const tabNumber: string = row.tabNumber?.trim() ?? ''
      if (!name || !tabNumber) { skipped++; continue }

      // Already active → skip
      if (activeNames.has(name.toLowerCase()) || activeTabs.has(tabNumber)) { skipped++; continue }

      const email = generateEmail(name)

      // Inactive user exists → reactivate + reset password
      const inactive = inactiveByName.get(name.toLowerCase()) ?? inactiveByTab.get(tabNumber)
      if (inactive) {
        await prisma.user.update({ where: { id: inactive.id }, data: { isActive: true, passwordHash: hash } })
        if (roleRecord) {
          await prisma.userAppRole.upsert({
            where:  { userId_roleId: { userId: inactive.id, roleId: roleRecord.id } },
            update: {},
            create: { userId: inactive.id, roleId: roleRecord.id },
          })
        }
        await assignToDept(inactive.id, row)
        activeNames.add(name.toLowerCase())
        if (tabNumber) activeTabs.add(tabNumber)
        created_accounts.push({ fullName: name, email, password: defaultPassword })
        created++
        continue
      }

      // New user → create
      try {
        const user = await prisma.user.create({
          data: { fullName: name, email, passwordHash: hash, tabNumber: tabNumber || null, isStaff: true, isActive: true },
        })
        if (roleRecord) {
          await prisma.userAppRole.create({ data: { userId: user.id, roleId: roleRecord.id } })
        }
        await assignToDept(user.id, row)
        activeNames.add(name.toLowerCase())
        if (tabNumber) activeTabs.add(tabNumber)
        created_accounts.push({ fullName: name, email, password: defaultPassword })
        created++
      } catch {
        skipped++
      }
    }

    return { created, skipped, password: defaultPassword, accounts: created_accounts }
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
