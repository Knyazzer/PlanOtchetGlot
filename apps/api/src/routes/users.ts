import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { randomBytes } from 'node:crypto'
import { prisma } from '@nexus/db'
import { authenticate, requireRole } from '../plugins/auth'
import { hasModule } from '../services/access'
import { getSheetConfig } from '../services/databaseService'

// Временный пароль: 10 читаемых символов (без двусмысленных 0/O/o/l/1/I)
const PW_CHARS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function genTempPassword(): string {
  const b = randomBytes(10)
  let s = ''
  for (let i = 0; i < b.length; i++) s += PW_CHARS[b[i] % PW_CHARS.length]
  return s
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TRANSLIT: Record<string, string> = {
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',
  м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',
  щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',
}
function generateEmail(name: string, userType: 'staff' | 'freelancer' = 'staff'): string {
  const parts = name.trim().toLowerCase().split(/\s+/)
  const translit = (s: string) => s.split('').map(c => TRANSLIT[c] ?? c).join('')
  const last  = translit(parts[0] ?? 'user')
  const first = translit(parts[1] ?? '')
  const base  = first ? `${last}.${first}` : last
  const prefix = userType === 'freelancer' ? 'fl.' : ''
  return `${prefix}${base}@nexus.local`
}

// Следующий табельный: штат S### (S + 3 цифры), фрилансер FL# (FL + число без нулей)
async function nextTabNumber(userType: 'staff' | 'freelancer'): Promise<string> {
  const prefix = userType === 'freelancer' ? 'FL' : 'S'
  const re = new RegExp(`^${prefix}(\\d+)$`)
  const users = await prisma.user.findMany({
    where: { userType, tabNumber: { startsWith: prefix } },
    select: { tabNumber: true },
  })
  let max = 0
  for (const u of users) {
    const m = u.tabNumber?.match(re)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  const n = max + 1
  return userType === 'freelancer' ? `${prefix}${n}` : `${prefix}${String(n).padStart(3, '0')}`
}

type SheetStaffRow = { tabNumber: string; name: string; position: string; dept: string; subDept: string; email?: string }
type SheetFreelancerRow = { number: string; name: string; position: string }

const USER_SELECT = {
  id: true, name: true, email: true, tabNumber: true,
  position: true, department: true, subDept: true,
  userType: true, role: true, isAdmin: true, isActive: true,
  canAccessInventory: true, canAccessPlatform: true, authId: true, createdAt: true,
  mustChangePassword: true, tempPassword: true,
} as const

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function usersRoutes(app: FastifyInstance) {

  // GET /users/members — list of active staff names for any authenticated user
  app.get('/members', { preHandler: authenticate }, async () => {
    const users = await prisma.user.findMany({
      where: { isActive: true, userType: 'staff', isAdmin: false, isSystemAccount: false },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })
    return users
  })

  // GET /users/:id/profile — публичный профиль сотрудника (доступен всем аутентифицированным)
  app.get('/:id/profile', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, position: true, status: true, userType: true, tabNumber: true, isActive: true },
    })
    if (!user || !user.isActive) return reply.code(404).send({ error: 'User not found' })
    return user
  })

  // ── Staff (штатные сотрудники) ─────────────────────────────────────────────

  app.get('/staff', { preHandler: requireRole('admin') }, async (request) => {
    const { includeInactive } = request.query as { includeInactive?: string }
    return prisma.user.findMany({
      where: { ...(includeInactive ? {} : { isActive: true }), userType: 'staff', isSystemAccount: false },  // системные аккаунты скрыты
      select: USER_SELECT,
      orderBy: { name: 'asc' },
    })
  })

  app.post('/staff', { preHandler: requireRole('admin') }, async (request, reply) => {
    const schema = z.object({
      name:        z.string().min(1),
      tabNumber:   z.string().optional(),
      position:    z.string().optional(),
      department:  z.string().optional(),
      subDept:     z.string().optional(),
    })
    const body = schema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })

    const { name, position, department, subDept } = body.data
    const tabNumber = body.data.tabNumber?.trim() || await nextTabNumber('staff')  // автоген, если не задан
    const email = generateEmail(name)

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { tabNumber }] },
    })
    if (existing) return reply.code(409).send({ error: 'Сотрудник уже существует', userId: existing.id })

    const user = await prisma.user.create({
      data: {
        name, email, tabNumber,
        position: position ?? null,
        department: department ?? null,
        subDept: subDept ?? null,
        userType: 'staff',
        isActive: true,
      },
      select: USER_SELECT,
    })
    return reply.code(201).send({ user })
  })

  // ── GET /users/:id/assignments — текущие назначения (префилл формы) ──────────
  app.get('/:id/assignments', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        divMemberships: { select: { position: true, division: { select: { id: true, name: true, headId: true, department: { select: { id: true, name: true } } } } } },
        deptDirectorOf: { select: { id: true, name: true } },
      },
    })
    if (!user) return reply.code(404).send({ error: 'User not found' })
    const assignments: Array<Record<string, unknown>> = []
    for (const d of user.deptDirectorOf) {
      assignments.push({ type: 'director', deptId: d.id, deptName: d.name })
    }
    for (const m of user.divMemberships) {
      const div = m.division
      const isHead = div.headId === id
      assignments.push({
        type: isHead ? 'head' : 'member',
        deptId: div.department.id, deptName: div.department.name,
        divId: div.id, divName: div.name,
        ...(isHead ? {} : { specialization: m.position || '' }),
      })
    }
    return { assignments }
  })

  // ── PUT /users/:id/assignments — назначение роли/места в оргструктуре ─────────
  // Каскад из карточки «Персонала»: тип → департамент → отдел → уточнение.
  // Декларативно: фронт шлёт желаемый набор назначений, сервер реконсилит связи
  // (UserDivision / Division.headId / Department.directorId) в транзакции.
  // Спека: docs/superpowers/specs/2026-07-11-personnel-role-form-design.md
  app.put('/:id/assignments', { preHandler: authenticate }, async (request, reply) => {
    const actor = (request as any).user as { id: string; isAdmin: boolean }
    if (!(actor.isAdmin || await hasModule(actor.id, false, 'hr.orgstructure', 'edit'))) {
      return reply.code(403).send({ error: 'Forbidden', module: 'hr.orgstructure' })
    }
    const { id } = request.params as { id: string }

    const schema = z.object({
      assignments: z.array(z.object({
        type:           z.enum(['member', 'head', 'director']),
        deptId:         z.string().min(1),
        divId:          z.string().optional(),
        specialization: z.string().optional(),
      })).min(1).max(2),
      replace: z.boolean().optional(),
    })
    const body = schema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })

    const target = await prisma.user.findUnique({ where: { id }, select: { id: true } })
    if (!target) return reply.code(404).send({ error: 'User not found' })

    const { assignments, replace } = body.data

    // Структурная валидация: у директора нет отдела, у member/head — обязателен
    for (const a of assignments) {
      if (a.type === 'director' && a.divId) return reply.code(400).send({ error: 'У директора не может быть отдела' })
      if (a.type !== 'director' && !a.divId) return reply.code(400).send({ error: 'Для сотрудника/руководителя нужен отдел' })
    }

    // Существование + принадлежность отдела департаменту
    const divIds = assignments.filter(a => a.divId).map(a => a.divId!)
    const divisions = divIds.length
      ? await prisma.division.findMany({ where: { id: { in: divIds } }, select: { id: true, deptId: true, name: true, headId: true } })
      : []
    const divMap = new Map(divisions.map(d => [d.id, d]))
    const deptIds = [...new Set(assignments.map(a => a.deptId))]
    const depts = await prisma.department.findMany({ where: { id: { in: deptIds } }, select: { id: true, name: true, directorId: true } })
    const deptMap = new Map(depts.map(d => [d.id, d]))
    for (const a of assignments) {
      if (!deptMap.has(a.deptId)) return reply.code(400).send({ error: 'Департамент не найден' })
      if (a.divId) {
        const d = divMap.get(a.divId)
        if (!d) return reply.code(400).send({ error: 'Отдел не найден' })
        if (d.deptId !== a.deptId) return reply.code(400).send({ error: 'Отдел не принадлежит департаменту' })
      }
    }

    // Конфликт слота head/director (занят другим) — без replace → 409
    for (const a of assignments) {
      if (a.type === 'head') {
        const d = divMap.get(a.divId!)!
        if (d.headId && d.headId !== id && !replace) {
          const cur = await prisma.user.findUnique({ where: { id: d.headId }, select: { id: true, name: true } })
          return reply.code(409).send({ error: 'slot_taken', slot: 'head', currentUserId: cur?.id, currentUserName: cur?.name, name: d.name })
        }
      }
      if (a.type === 'director') {
        const d = deptMap.get(a.deptId)!
        if (d.directorId && d.directorId !== id && !replace) {
          const cur = await prisma.user.findUnique({ where: { id: d.directorId }, select: { id: true, name: true } })
          return reply.code(409).send({ error: 'slot_taken', slot: 'director', currentUserId: cur?.id, currentUserName: cur?.name, name: d.name })
        }
      }
    }

    await prisma.$transaction(async (tx) => {
      // 1. UserDivision: member + head → членство (head тоже член отдела, решение C)
      const desiredMemberships = assignments
        .filter(a => a.type === 'member' || a.type === 'head')
        .map(a => ({ divId: a.divId!, position: a.type === 'head' ? 'Руководитель отдела' : (a.specialization ?? '') }))
      const desiredDivIds = new Set(desiredMemberships.map(m => m.divId))
      const current = await tx.userDivision.findMany({ where: { userId: id }, select: { divId: true } })
      const toRemove = current.filter(m => !desiredDivIds.has(m.divId)).map(m => m.divId)
      if (toRemove.length) await tx.userDivision.deleteMany({ where: { userId: id, divId: { in: toRemove } } })
      for (const m of desiredMemberships) {
        await tx.userDivision.upsert({
          where: { userId_divId: { userId: id, divId: m.divId } },
          update: { position: m.position },
          create: { userId: id, divId: m.divId, position: m.position },
        })
      }

      // 2. Division.headId — выставить desired, снять устаревшие
      const desiredHeadDivIds = new Set(assignments.filter(a => a.type === 'head').map(a => a.divId!))
      const wasHeadOf = await tx.division.findMany({ where: { headId: id }, select: { id: true } })
      for (const d of wasHeadOf) if (!desiredHeadDivIds.has(d.id)) await tx.division.update({ where: { id: d.id }, data: { headId: null } })
      for (const divId of desiredHeadDivIds) await tx.division.update({ where: { id: divId }, data: { headId: id } })

      // 3. Department.directorId — аналогично
      const desiredDirDeptIds = new Set(assignments.filter(a => a.type === 'director').map(a => a.deptId))
      const wasDirOf = await tx.department.findMany({ where: { directorId: id }, select: { id: true } })
      for (const d of wasDirOf) if (!desiredDirDeptIds.has(d.id)) await tx.department.update({ where: { id: d.id }, data: { directorId: null } })
      for (const deptId of desiredDirDeptIds) await tx.department.update({ where: { id: deptId }, data: { directorId: id } })

      // 4. Денормализация плоских полей из основного (первого) назначения (решение A)
      const primary = assignments[0]
      const flatPosition = primary.type === 'director' ? 'Директор департамента'
        : primary.type === 'head' ? 'Руководитель отдела'
        : (primary.specialization?.trim() || 'Сотрудник')
      await tx.user.update({
        where: { id },
        data: {
          department: deptMap.get(primary.deptId)!.name,
          subDept: primary.divId ? (divMap.get(primary.divId)?.name ?? null) : null,
          position: flatPosition,
        },
      })
    })

    return prisma.user.findUnique({ where: { id }, select: USER_SELECT })
  })

  // ── Freelancers ────────────────────────────────────────────────────────────

  app.get('/freelancers', { preHandler: requireRole('admin') }, async (request) => {
    const { includeInactive } = request.query as { includeInactive?: string }
    return prisma.user.findMany({
      where: { ...(includeInactive ? {} : { isActive: true }), userType: 'freelancer', isSystemAccount: false },
      select: USER_SELECT,
      orderBy: { name: 'asc' },
    })
  })

  app.post('/freelancers', { preHandler: requireRole('admin') }, async (request, reply) => {
    const schema = z.object({
      name:        z.string().min(1),
      tabNumber:   z.string().optional(),
      position:    z.string().optional(),
    })
    const body = schema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })

    const { name, position } = body.data
    const tabNumber = body.data.tabNumber?.trim() || await nextTabNumber('freelancer')  // автоген FL#, если не задан
    const baseEmail = generateEmail(name, 'freelancer')
    const email     = baseEmail.replace('@nexus.local', `.${tabNumber.toLowerCase()}@nexus.local`)

    const existing = await prisma.user.findFirst({ where: { OR: [{ email }, { tabNumber }] } })
    if (existing) return reply.code(409).send({ error: 'Фрилансер уже существует', userId: existing.id })

    const user = await prisma.user.create({
      data: {
        name, email, tabNumber,
        position: position ?? null,
        userType: 'freelancer',
        isActive: true,
      },
      select: USER_SELECT,
    })
    return reply.code(201).send({ user })
  })

  // ── Account management ─────────────────────────────────────────────────────

  app.patch('/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const schema = z.object({
      name:                z.string().min(1).optional(),
      email:               z.string().email().optional(),
      tabNumber:           z.string().nullable().optional(),
      position:            z.string().nullable().optional(),
      department:          z.string().nullable().optional(),
      subDept:             z.string().nullable().optional(),
      role:                z.string().optional(),
      isActive:            z.boolean().optional(),
      canAccessInventory:  z.boolean().optional(),
      canAccessPlatform:   z.boolean().optional(),
    })
    const body = schema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })

    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) return reply.code(404).send({ error: 'User not found' })
    if (user.isAdmin) return reply.code(403).send({ error: 'Cannot edit admin account' })

    const d = body.data

    // Email уникален: если меняем и адрес уже занят другим — понятный 409 (а не 500)
    if (d.email && d.email !== user.email) {
      const taken = await prisma.user.findFirst({ where: { email: d.email, NOT: { id } }, select: { id: true } })
      if (taken) return reply.code(409).send({ error: 'Эта почта уже используется другим сотрудником' })
    }

    try {
      const updated = await prisma.user.update({
        where: { id },
        data: {
          ...(d.name               !== undefined && { name:               d.name }),
          ...(d.email              !== undefined && { email:              d.email }),
          ...(d.tabNumber          !== undefined && { tabNumber:          d.tabNumber }),
          ...(d.position           !== undefined && { position:           d.position }),
          ...(d.department         !== undefined && { department:         d.department }),
          ...(d.subDept            !== undefined && { subDept:            d.subDept }),
          ...(d.role               !== undefined && { role:               d.role }),
          ...(d.isActive           !== undefined && { isActive:           d.isActive }),
          ...(d.canAccessInventory !== undefined && { canAccessInventory: d.canAccessInventory }),
          ...(d.canAccessPlatform  !== undefined && { canAccessPlatform:  d.canAccessPlatform }),
        },
        select: USER_SELECT,
      })
      return updated
    } catch (e: any) {
      if (e?.code === 'P2002') return reply.code(409).send({ error: 'Конфликт уникального поля (почта/табельный уже заняты)' })
      throw e
    }
  })

  // POST /users/:id/deactivate — уволить: бан auth.users + неактив + снять табельный + public.is_active=false
  app.post('/:id/deactivate', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) return reply.code(404).send({ error: 'User not found' })
    if (user.isAdmin) return reply.code(403).send({ error: 'Cannot deactivate admin account' })

    if (user.authId) {
      const supabaseUrl = process.env.SUPABASE_URL
      const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (supabaseUrl && serviceKey) {
        // бан в Supabase Auth → вход заблокирован во всех приложениях
        await fetch(`${supabaseUrl}/auth/v1/admin/users/${user.authId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
          body: JSON.stringify({ ban_duration: '876000h' }),
        }).catch(() => {})
        await prisma.$executeRaw`UPDATE public.users SET is_active = false WHERE id = ${user.authId}::uuid`
      }
    }
    const updated = await prisma.user.update({
      where: { id },
      data: { isActive: false, status: 'archived', tabNumber: null },
      select: USER_SELECT,
    })
    return updated
  })

  // POST /users/:id/reactivate — восстановить: снять бан + активен + public.is_active=true
  app.post('/:id/reactivate', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) return reply.code(404).send({ error: 'User not found' })

    if (user.authId) {
      const supabaseUrl = process.env.SUPABASE_URL
      const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (supabaseUrl && serviceKey) {
        await fetch(`${supabaseUrl}/auth/v1/admin/users/${user.authId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
          body: JSON.stringify({ ban_duration: 'none' }),
        }).catch(() => {})
        await prisma.$executeRaw`UPDATE public.users SET is_active = true WHERE id = ${user.authId}::uuid`
      }
    }
    const updated = await prisma.user.update({
      where: { id },
      data: { isActive: true, status: 'active' },
      select: USER_SELECT,
    })
    return updated
  })

  // POST /users/impersonate/:id — generate a short-lived impersonation link (admin only)
  app.post('/impersonate/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, isAdmin: true, isActive: true },
    })
    if (!user || !user.isActive) return reply.code(404).send({ error: 'User not found' })
    if (user.isAdmin) return reply.code(403).send({ error: 'Cannot impersonate admin' })

    const token = app.jwt.sign(
      { nexus_user_id: user.id, email: user.email, name: user.name },
      { expiresIn: '10m' },
    )
    const webUrl = process.env.WEB_URL ?? 'http://localhost:5173'
    return { link: `${webUrl}?impersonate=${token}`, expiresIn: '10 минут' }
  })

  // ── Sheets import ──────────────────────────────────────────────────────────

  app.get('/staff-import', { preHandler: requireRole('admin') }, async () => {
    const cfg = await getSheetConfig('employees_buffer')
    if (!cfg?.cachedData) return { rows: [], lastSyncedAt: null }
    const data = cfg.cachedData as { rows: SheetStaffRow[] }
    return { rows: data.rows ?? [], lastSyncedAt: cfg.lastSyncedAt }
  })

  app.get('/freelancers-import', { preHandler: requireRole('admin') }, async () => {
    const cfg = await getSheetConfig('freelancers')
    if (!cfg?.cachedData) return { rows: [], lastSyncedAt: null }
    const data = cfg.cachedData as { rows: SheetFreelancerRow[] }
    return { rows: data.rows ?? [], lastSyncedAt: cfg.lastSyncedAt }
  })

  app.post('/bulk-import-staff', { preHandler: requireRole('admin') }, async (_req, reply) => {
    const cfg = await getSheetConfig('employees_buffer')
    if (!cfg?.cachedData) return reply.code(400).send({ error: 'Нет данных. Сначала обновите буфер.' })

    const data = cfg.cachedData as { rows: SheetStaffRow[] }
    const rows = (data.rows ?? []).filter(r => r.name?.trim())

    let created = 0, updated = 0, skipped = 0

    for (const row of rows) {
      const name       = row.name.trim()
      const tabNumber  = row.tabNumber?.trim() || null
      const sheetEmail = row.email?.trim() || null  // корп-email из столбца AA, если есть

      // Матчим по ФИО (табельный в листе часто пустой); имя — стабильный ключ
      const existing = await prisma.user.findFirst({
        where: { name, userType: 'staff' },
        select: { id: true, authId: true },
      })

      try {
        if (existing) {
          await prisma.user.update({
            where: { id: existing.id },
            data: {
              isActive: true, tabNumber,
              position: row.position || null, department: row.dept || null, subDept: row.subDept || null,
              // Корп-почту проставляем только если она есть в листе и юзер ещё не онборжен
              // (у онборженных email связан с auth.users — не трогаем).
              ...(sheetEmail && !existing.authId ? { email: sheetEmail } : {}),
            },
          })
          updated++
        } else {
          await prisma.user.create({
            data: {
              name, email: sheetEmail || generateEmail(name),
              tabNumber, position: row.position || null, department: row.dept || null, subDept: row.subDept || null,
              userType: 'staff', isActive: true,
            },
          })
          created++
        }
      } catch { skipped++ }
    }

    return { created, updated, skipped }
  })

  app.post('/bulk-import-freelancers', { preHandler: requireRole('admin') }, async (_req, reply) => {
    const cfg = await getSheetConfig('freelancers')
    if (!cfg?.cachedData) return reply.code(400).send({ error: 'Нет данных. Сначала обновите буфер.' })

    const data = cfg.cachedData as { rows: SheetFreelancerRow[] }
    const rows = (data.rows ?? []).filter(r => r.name?.trim())

    const existingByTab = new Set(
      (await prisma.user.findMany({ where: { userType: 'freelancer' }, select: { tabNumber: true } }))
        .filter(u => u.tabNumber).map(u => u.tabNumber!)
    )

    let created = 0, skipped = 0

    for (const row of rows) {
      const name      = row.name.trim()
      const tabNumber = row.number?.trim() || null

      if (tabNumber && existingByTab.has(tabNumber)) { skipped++; continue }

      const baseEmail = generateEmail(name, 'freelancer')
      const email     = tabNumber
        ? baseEmail.replace('@nexus.local', `.${tabNumber.toLowerCase()}@nexus.local`)
        : baseEmail

      try {
        await prisma.user.create({
          data: { name, email, tabNumber, position: row.position || null, userType: 'freelancer', isActive: true },
        })
        if (tabNumber) existingByTab.add(tabNumber)
        created++
      } catch { skipped++ }
    }

    return { created, skipped }
  })

  // POST /users/bulk-onboard — массовый онбординг всех с реальной корп-почтой без аккаунта.
  // Каждому создаётся auth.users (с уникальным временным паролем) + public.users + связка auth_id.
  // Возвращает список { email, name, tempPassword, status } для раздачи паролей.
  app.post('/bulk-onboard', { preHandler: requireRole('admin') }, async (_req, reply) => {
    const supabaseUrl = process.env.SUPABASE_URL
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) return reply.code(503).send({ error: 'Supabase not configured' })

    // Кандидаты: активные, без auth_id, с непустой почтой; @nexus.local отсеиваем (это плейсхолдер)
    const candidates = await prisma.user.findMany({
      where: { isActive: true, authId: null, NOT: { email: null } },
      select: { id: true, name: true, email: true, position: true, department: true },
      orderBy: { name: 'asc' },
    })
    const targets = candidates.filter(u => u.email && !u.email.endsWith('@nexus.local'))

    const results: { email: string; name: string; tempPassword?: string; status: string }[] = []
    for (const u of targets) {
      const email = u.email!
      const tempPassword = genTempPassword()
      try {
        const createRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
          body: JSON.stringify({ email, password: tempPassword, email_confirm: true, user_metadata: { name: u.name } }),
        })
        let authId: string
        let linkedExisting = false
        if (createRes.ok) {
          authId = (await createRes.json() as { id: string }).id
        } else {
          // email уже есть в auth.users — привязываем существующий (пароль не трогаем)
          let existing: { id: string }[] = []
          try { existing = await prisma.$queryRaw<{ id: string }[]>`SELECT id::text AS id FROM auth.users WHERE email = ${email} LIMIT 1` } catch { /* нет доступа к auth.users */ }
          if (!existing.length) {
            const err: any = await createRes.json().catch(() => ({}))
            results.push({ email, name: u.name, status: 'error: ' + (err?.msg ?? err?.error_description ?? createRes.status) })
            continue
          }
          authId = existing[0].id
          linkedExisting = true
        }
        await prisma.$executeRaw`
          INSERT INTO public.users (id, email, name, position, department, is_active, created_at)
          VALUES (${authId}::uuid, ${email}, ${u.name}, ${u.position ?? null}, ${u.department ?? null}, true, NOW())
          ON CONFLICT (id) DO NOTHING
        `
        await prisma.user.update({
          where: { id: u.id },
          data: linkedExisting ? { authId } : { authId, tempPassword, mustChangePassword: true },
        })
        results.push({ email, name: u.name, tempPassword: linkedExisting ? undefined : tempPassword, status: linkedExisting ? 'linked' : 'ok' })
      } catch (e: any) {
        results.push({ email, name: u.name, status: 'error: ' + (e?.message ?? 'failed') })
      }
    }

    const onboarded = results.filter(r => r.status === 'ok' || r.status === 'linked').length
    return { total: targets.length, onboarded, results }
  })

  // POST /users/:id/reset-password — админ сбрасывает пароль: новый временный + форс-смена
  app.post('/:id/reset-password', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const user = await prisma.user.findUnique({ where: { id }, select: { authId: true, isAdmin: true } })
    if (!user) return reply.code(404).send({ error: 'User not found' })
    if (user.isAdmin) return reply.code(403).send({ error: 'Cannot reset admin password' })
    if (!user.authId) return reply.code(400).send({ error: 'Нет аккаунта — сначала выдайте доступ' })

    const supabaseUrl = process.env.SUPABASE_URL
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) return reply.code(503).send({ error: 'Supabase not configured' })

    const tempPassword = genTempPassword()
    const res = await fetch(`${supabaseUrl}/auth/v1/admin/users/${user.authId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
      body: JSON.stringify({ password: tempPassword }),
    })
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({}))
      return reply.code(502).send({ error: 'Не удалось сбросить пароль', details: err })
    }
    await prisma.user.update({ where: { id }, data: { tempPassword, mustChangePassword: true } })
    return { ok: true, tempPassword }
  })
}
