import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '@tv-shifts/db'
import { logEvent } from '../services/changeLog'
import { getUserPermissions, ROLE_PERMISSIONS } from '../config/permissions'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

async function buildJwtPayload(userId: string, user: { id: string; email: string; fullName: string }) {
  const [rbacPermissions, roleRows] = await Promise.all([
    getUserPermissions(userId),
    prisma.userAppRole.findMany({ where: { userId }, include: { role: true } }),
  ])
  const roleNames = roleRows.map((r) => r.role.name)
  // Fall back to per-role-name permissions when no RBAC entries seeded yet
  const permissions = roleRows.length > 0
    ? rbacPermissions
    : roleNames.flatMap((r) => ROLE_PERMISSIONS[r] ?? [])
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    roles: roleNames,
    permissions,
  }
}

export async function authRoutes(app: FastifyInstance) {
  // POST /auth/login — max 10 попыток/мин с одного IP (защита от брутфорса)
  app.post('/login', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
        errorResponseBuilder: () => ({
          error: 'Слишком много попыток входа. Подождите минуту и попробуйте снова.',
        }),
      },
    },
  }, async (request, reply) => {
    const body = loginSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })
    }

    const user = await prisma.user.findUnique({ where: { email: body.data.email } })

    if (!user || !user.isActive) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    const valid = await bcrypt.compare(body.data.password, user.passwordHash)
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    const payload = await buildJwtPayload(user.id, user)
    const token = app.jwt.sign(payload, { expiresIn: '15m' })
    const refreshToken = app.jwt.sign({ id: user.id, type: 'refresh' }, { expiresIn: '7d' })

    reply
      .setCookie('access_token', token, { httpOnly: true, path: '/', maxAge: 60 * 15, sameSite: 'lax' })
      .setCookie('refresh_token', refreshToken, {
        httpOnly: true,
        path: '/auth/refresh',
        maxAge: 60 * 60 * 24 * 7,
        sameSite: 'lax',
      })

    logEvent('login', user.id, user.id, { email: user.email, ip: request.ip }).catch(() => {})

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        roles: payload.roles,
        permissions: payload.permissions,
      },
    }
  })

  // POST /auth/refresh
  app.post('/refresh', async (request, reply) => {
    const refreshToken = request.cookies?.refresh_token
    if (!refreshToken) {
      return reply.code(401).send({ error: 'No refresh token' })
    }

    try {
      const decoded = app.jwt.verify<{ id: string; type: string }>(refreshToken)
      if (decoded.type !== 'refresh') throw new Error('Invalid token type')

      const user = await prisma.user.findUnique({ where: { id: decoded.id } })
      if (!user || !user.isActive) {
        return reply.code(401).send({ error: 'User not found' })
      }

      const payload = await buildJwtPayload(user.id, user)
      const token = app.jwt.sign(payload, { expiresIn: '15m' })

      reply.setCookie('access_token', token, { httpOnly: true, path: '/', maxAge: 60 * 15, sameSite: 'lax' })

      return { ok: true }
    } catch {
      return reply.code(401).send({ error: 'Invalid refresh token' })
    }
  })

  // POST /auth/logout
  app.post('/logout', async (request, reply) => {
    try {
      await request.jwtVerify()
      const payload = request.user as { id: string }
      logEvent('logout', payload.id, payload.id).catch(() => {})
    } catch {
      // expired or missing token — logout proceeds without logging
    }
    reply
      .clearCookie('access_token', { path: '/' })
      .clearCookie('refresh_token', { path: '/auth/refresh' })
    return { ok: true }
  })

  // GET /auth/me
  app.get('/me', async (request, reply) => {
    try {
      await request.jwtVerify()
      const payload = request.user as { id: string }
      const user = await prisma.user.findUnique({
        where: { id: payload.id },
        select: { id: true, email: true, fullName: true, tabNumber: true, isStaff: true },
      })
      if (!user) return reply.code(404).send({ error: 'User not found' })

      const [permissions, roleRows, deptRows] = await Promise.all([
        getUserPermissions(user.id),
        prisma.userAppRole.findMany({ where: { userId: user.id }, include: { role: true } }),
        prisma.deptMember.findMany({
          where: { userId: user.id },
          include: { dept: { select: { id: true, name: true, type: true } } },
        }),
      ])

      return {
        ...user,
        roles: roleRows.map((r) => r.role.name),
        permissions,
        depts: deptRows.map((m) => ({ id: m.dept.id, name: m.dept.name, type: m.dept.type, isHead: m.isHead })),
      }
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' })
    }
  })

  // POST /auth/impersonate/:userId — admin generates a one-time login token for another user
  app.post('/impersonate/:userId', async (request, reply) => {
    try {
      await request.jwtVerify()
      const me = request.user as { id: string; roles?: string[] }
      if (!(me.roles ?? []).includes('admin')) return reply.code(403).send({ error: 'Admin only' })

      const { userId } = request.params as { userId: string }
      const target = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, fullName: true },
      })
      if (!target) return reply.code(404).send({ error: 'User not found' })

      const payload = await buildJwtPayload(target.id, target)
      // Short-lived token (5 minutes) — enough time to open new tab
      const token = (app as any).jwt.sign({ ...payload, _impersonate: true }, { expiresIn: '5m' })
      const url = `${process.env.WEB_URL ?? 'http://localhost:5173'}?impersonate=${token}`
      return { token, url, targetName: target.fullName }
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' })
    }
  })

  // POST /auth/impersonate/consume — consume impersonation token, set cookies
  app.post('/impersonate/consume', async (request, reply) => {
    const { token } = request.body as { token: string }
    if (!token) return reply.code(400).send({ error: 'Token required' })
    try {
      const payload = (app as any).jwt.verify(token) as { id: string; email: string; fullName: string; _impersonate?: boolean }
      if (!payload._impersonate) return reply.code(400).send({ error: 'Invalid token type' })

      const user = await prisma.user.findUnique({ where: { id: payload.id }, select: { id: true, email: true, fullName: true } })
      if (!user) return reply.code(404).send({ error: 'User not found' })

      const freshPayload = await buildJwtPayload(user.id, user)
      const accessToken  = (app as any).jwt.sign(freshPayload, { expiresIn: '15m' })
      const refreshToken = (app as any).jwt.sign({ id: user.id }, { expiresIn: '7d' })

      reply
        .setCookie('access_token', accessToken, { httpOnly: true, path: '/', maxAge: 60 * 15, sameSite: 'lax' })
        .setCookie('refresh_token', refreshToken, { httpOnly: true, path: '/auth/refresh', maxAge: 60 * 60 * 24 * 7, sameSite: 'lax' })
      return { ok: true }
    } catch {
      return reply.code(401).send({ error: 'Invalid or expired token' })
    }
  })
}
