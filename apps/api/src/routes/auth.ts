import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { randomBytes } from 'node:crypto'
import { prisma } from '@nexus/db'
import { authenticate, requireRole } from '../plugins/auth'
import { getUserAccess } from '../services/access'

// Временный пароль: 10 читаемых символов (без двусмысленных 0/O/o/l/1/I)
const PW_CHARS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function genTempPassword(): string {
  const b = randomBytes(10)
  let s = ''
  for (let i = 0; i < b.length; i++) s += PW_CHARS[b[i] % PW_CHARS.length]
  return s
}

export async function authRoutes(app: FastifyInstance) {
  // POST /auth/logout — clear any legacy cookies
  app.post('/logout', async (request, reply) => {
    reply.clearCookie('access_token', { path: '/' })
    return { ok: true }
  })

  // POST /auth/dev-login — ЛОКАЛЬНАЯ РАЗРАБОТКА: вход по email без Supabase.
  // Отключён в production (NODE_ENV). Подписывает Supabase-подобный токен { sub }
  // секретом JWT_SECRET — плагин authenticate резолвит юзера по authId (raw.sub),
  // что (в отличие от impersonate) не блокирует админов.
  if (process.env.NODE_ENV !== 'production') {
    app.post('/dev-login', async (request, reply) => {
      const body = z.object({ email: z.string().email() }).safeParse(request.body)
      if (!body.success) return reply.code(400).send({ error: 'Invalid input' })

      const user = await prisma.user.findUnique({ where: { email: body.data.email } })
      if (!user || !user.isActive) return reply.code(401).send({ error: 'Неверный email или пароль' })

      // Сид-юзеры без authId — проставляем его, чтобы сработал поиск по sub.
      const authId = user.authId ?? user.id
      if (!user.authId) {
        await prisma.user.update({ where: { id: user.id }, data: { authId } })
      }

      const token = app.jwt.sign({ sub: authId }, { expiresIn: '7d' })
      reply.setCookie('access_token', token, {
        httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 7, sameSite: 'lax',
      })
      return { ok: true }
    })
  }

  // GET /auth/me — full profile for the authenticated user
  app.get('/me', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.user as { id: string }
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, name: true, isAdmin: true, isSystemAccount: true, isActive: true,
        canAccessInventory: true, canAccessPlatform: true, mustChangePassword: true, theme: true, status: true, tabNumber: true,
        divMemberships: {
          select: {
            position: true,
            division: { select: { name: true, department: { select: { name: true } } } },
          },
        },
      },
    })
    if (!user || !user.isActive) return reply.code(404).send({ error: 'User not found' })
    // КИТ 1+2: департаменты с уровнем + модули с режимом view/edit (спека docs/RBAC-MODEL.md §4.5)
    const access = await getUserAccess(user.id, user.isAdmin)
    return { ...user, access }
  })

  // PATCH /auth/me/profile
  app.patch('/me/profile', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.user as { id: string }
    const body = z.object({ status: z.string().max(200).nullable() }).safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input' })
    await prisma.user.update({ where: { id }, data: { status: body.data.status } })
    return { ok: true }
  })

  // PATCH /auth/me/theme
  app.patch('/me/theme', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.user as { id: string }
    const body = z.object({ theme: z.enum(['dark', 'light']) }).safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid theme value' })
    await prisma.user.update({ where: { id }, data: { theme: body.data.theme } })
    return { ok: true }
  })

  // POST /auth/change-password — вызывается ПОСЛЕ смены пароля юзером через supabase.auth.updateUser.
  // Чистит временный пароль и снимает флаг форс-смены.
  app.post('/change-password', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.user as { id: string }
    await prisma.user.update({ where: { id }, data: { mustChangePassword: false, tempPassword: null } })
    return { ok: true }
  })

  // POST /auth/impersonate/consume — exchange impersonation JWT for a session
  // The frontend stores the returned token and sends it as Authorization: Bearer
  app.post('/impersonate/consume', async (request, reply) => {
    const { token } = request.body as { token?: string }
    if (!token) return reply.code(400).send({ error: 'Token required' })
    try {
      const decoded = app.jwt.verify<{
        nexus_user_id?: string
        id?: string
        isAdmin?: boolean
      }>(token)

      // Support both new (nexus_user_id) and legacy (id) token formats
      const userId = decoded.nexus_user_id ?? decoded.id
      if (!userId) return reply.code(400).send({ error: 'Invalid token' })

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true, isAdmin: true, isActive: true },
      })
      if (!user || !user.isActive) return reply.code(404).send({ error: 'User not found' })
      if (user.isAdmin) return reply.code(403).send({ error: 'Cannot impersonate admin' })

      // Issue a fresh impersonation cookie (10 min) — consumed by useAuthInit on reload
      const freshToken = app.jwt.sign(
        { nexus_user_id: user.id, email: user.email, name: user.name },
        { expiresIn: '10m' },
      )
      reply.setCookie('access_token', freshToken, { httpOnly: true, path: '/', maxAge: 60 * 10, sameSite: 'lax' })
      return { ok: true }
    } catch {
      return reply.code(401).send({ error: 'Invalid or expired token' })
    }
  })

  // POST /auth/onboard/:userId — admin: create Supabase account for an existing nexus user
  // Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars
  app.post('/onboard/:userId', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { userId } = request.params as { userId: string }
    const body = z.object({ email: z.string().email() }).safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })

    const nexusUser = await prisma.user.findUnique({ where: { id: userId } })
    if (!nexusUser) return reply.code(404).send({ error: 'User not found' })
    if (nexusUser.authId) return reply.code(409).send({ error: 'User already has an account' })

    const supabaseUrl = process.env.SUPABASE_URL
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) {
      return reply.code(503).send({ error: 'Supabase not configured' })
    }

    // Временный пароль — админ передаёт его сотруднику лично (не зависит от SMTP)
    const tempPassword = genTempPassword()

    // Create Supabase auth account via admin REST API
    const createRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      body: JSON.stringify({
        email: body.data.email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { name: nexusUser.name },
      }),
    })

    let authId: string
    let linkedExisting = false
    if (createRes.ok) {
      authId = (await createRes.json() as { id: string }).id
    } else {
      // Email уже есть в auth.users (напр. сотрудник зарегистрирован в другом приложении) —
      // привязываем существующий аккаунт, пароль НЕ трогаем (входит своим текущим).
      let existing: { id: string }[] = []
      try {
        existing = await prisma.$queryRaw<{ id: string }[]>`SELECT id::text AS id FROM auth.users WHERE email = ${body.data.email} LIMIT 1`
      } catch { /* нет доступа к auth.users — упадём в ошибку ниже */ }
      if (!existing.length) {
        const err = await createRes.json().catch(() => ({}))
        return reply.code(502).send({ error: 'Failed to create Supabase account', details: err })
      }
      authId = existing[0].id
      linkedExisting = true
    }

    // Insert into public.users (shared identity table)
    await prisma.$executeRaw`
      INSERT INTO public.users (id, email, name, position, department, is_active, created_at)
      VALUES (${authId}::uuid, ${body.data.email}, ${nexusUser.name},
              ${nexusUser.position ?? null}, ${nexusUser.department ?? null},
              true, NOW())
      ON CONFLICT (id) DO NOTHING
    `

    // Link nexus user to Supabase account. Для нового — temp-пароль + форс-смена;
    // для существующего — пароль не трогаем (входит своим).
    await prisma.user.update({
      where: { id: userId },
      data: linkedExisting
        ? { authId, email: body.data.email }
        : { authId, email: body.data.email, tempPassword, mustChangePassword: true },
    })

    return reply.code(201).send({
      ok: true,
      authId,
      linkedExisting,
      tempPassword: linkedExisting ? null : tempPassword,
    })
  })
}
