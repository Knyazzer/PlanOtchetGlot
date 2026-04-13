/**
 * Test infrastructure: Fastify app factory + auth helpers.
 * Builds the full app (all plugins + routes) without starting a server,
 * suitable for app.inject() calls in integration tests.
 */
import Fastify, { FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'

import { authRoutes } from '../routes/auth'
import { usersRoutes } from '../routes/users'
import { statusRowsRoutes } from '../routes/statusRows'
import { dealsRoutes } from '../routes/deals'
import { shiftsRoutes } from '../routes/shifts'
import { notificationsRoutes } from '../routes/notifications'
import { tasksRoutes } from '../routes/tasks'
import { syncRoutes } from '../routes/sync'
import { changeLogsRoutes } from '../routes/changeLogs'
import { analyticsRoutes } from '../routes/analytics'
import { databaseRoutes } from '../routes/database'
import { matrixTemplatesRoutes } from '../routes/matrixTemplates'
import { internalMatrixRoutes } from '../routes/internalMatrix'
import { projectMembersRoutes } from '../routes/projectMembers'

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })

  await app.register(cors, { origin: '*', credentials: true })
  await app.register(cookie)
  await app.register(rateLimit, { global: false })
  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'test-secret',
    cookie: { cookieName: 'access_token', signed: false },
  })

  app.get('/health', async () => ({ status: 'ok' }))

  await app.register(authRoutes,          { prefix: '/auth' })
  await app.register(usersRoutes,         { prefix: '/users' })
  await app.register(statusRowsRoutes,    { prefix: '/status-rows' })
  await app.register(dealsRoutes,         { prefix: '/deals' })
  await app.register(shiftsRoutes,        { prefix: '/shifts' })
  await app.register(notificationsRoutes, { prefix: '/notifications' })
  await app.register(tasksRoutes,         { prefix: '/tasks' })
  await app.register(syncRoutes,          { prefix: '/sync' })
  await app.register(changeLogsRoutes,    { prefix: '/change-logs' })
  await app.register(analyticsRoutes,     { prefix: '/analytics' })
  await app.register(databaseRoutes,      { prefix: '/database' })
  await app.register(matrixTemplatesRoutes, { prefix: '/matrix-templates' })
  await app.register(internalMatrixRoutes,  { prefix: '/internal-matrix' })
  await app.register(projectMembersRoutes,  { prefix: '/project-members' })

  await app.ready()
  return app
}

/**
 * Performs a login request and returns the value of the access_token cookie.
 * Throws if login fails (non-200 status).
 */
export async function getAccessToken(
  app: FastifyInstance,
  email: string,
  password: string
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password },
  })
  if (res.statusCode !== 200) {
    throw new Error(`Login failed: ${res.statusCode} ${res.body}`)
  }
  const token = res.cookies.find((c) => c.name === 'access_token')?.value
  if (!token) throw new Error('No access_token cookie in login response')
  return token
}
