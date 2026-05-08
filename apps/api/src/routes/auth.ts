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

      const [permissions, roleRows] = await Promise.all([
        getUserPermissions(user.id),
        prisma.userAppRole.findMany({ where: { userId: user.id }, include: { role: true } }),
      ])

      return {
        ...user,
        roles: roleRows.map((r) => r.role.name),
        permissions,
      }
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' })
    }
  })
}
