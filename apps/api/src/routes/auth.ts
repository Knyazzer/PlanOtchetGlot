import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '@tv-shifts/db'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

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

    const user = await prisma.user.findUnique({
      where: { email: body.data.email },
    })

    if (!user || !user.isActive) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    const valid = await bcrypt.compare(body.data.password, user.passwordHash)
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    const token = app.jwt.sign(
      { id: user.id, email: user.email, role: user.role, fullName: user.fullName },
      { expiresIn: '15m' }
    )

    const refreshToken = app.jwt.sign(
      { id: user.id, type: 'refresh' },
      { expiresIn: '7d' }
    )

    reply
      .setCookie('access_token', token, {
        httpOnly: true,
        path: '/',
        maxAge: 60 * 15,
        sameSite: 'lax',
      })
      .setCookie('refresh_token', refreshToken, {
        httpOnly: true,
        path: '/auth/refresh',
        maxAge: 60 * 60 * 24 * 7,
        sameSite: 'lax',
      })

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
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
      const payload = app.jwt.verify<{ id: string; type: string }>(refreshToken)
      if (payload.type !== 'refresh') throw new Error('Invalid token type')

      const user = await prisma.user.findUnique({ where: { id: payload.id } })
      if (!user || !user.isActive) {
        return reply.code(401).send({ error: 'User not found' })
      }

      const token = app.jwt.sign(
        { id: user.id, email: user.email, role: user.role, fullName: user.fullName },
        { expiresIn: '15m' }
      )

      reply.setCookie('access_token', token, {
        httpOnly: true,
        path: '/',
        maxAge: 60 * 15,
        sameSite: 'lax',
      })

      return { ok: true }
    } catch {
      return reply.code(401).send({ error: 'Invalid refresh token' })
    }
  })

  // POST /auth/logout
  app.post('/logout', async (_request, reply) => {
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
        select: { id: true, email: true, fullName: true, role: true, tabNumber: true, isStaff: true },
      })
      if (!user) return reply.code(404).send({ error: 'User not found' })
      return user
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' })
    }
  })
}
