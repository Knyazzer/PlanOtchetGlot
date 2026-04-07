import { config } from 'dotenv'
import { resolve } from 'path'
// Загружаем .env из корня монорепо
config({ path: resolve(__dirname, '../../../.env') })
import Fastify from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'

import { authRoutes } from './routes/auth'
import { usersRoutes } from './routes/users'
import { projectsRoutes } from './routes/projects'
import { shiftsRoutes } from './routes/shifts'
import { notificationsRoutes } from './routes/notifications'
import { tasksRoutes } from './routes/tasks'
import { syncRoutes } from './routes/sync'

const app = Fastify({ logger: true })

async function main() {
  await app.register(cors, {
    origin: [
      process.env.WEB_URL ?? 'http://localhost:5173',
      'http://localhost:5173',
      'http://localhost:4173',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })

  await app.register(cookie)

  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
    cookie: {
      cookieName: 'access_token',
      signed: false,
    },
  })

  // Health check
  app.get('/health', async () => ({ status: 'ok' }))

  // Routes
  await app.register(authRoutes, { prefix: '/auth' })
  await app.register(usersRoutes, { prefix: '/users' })
  await app.register(projectsRoutes, { prefix: '/projects' })
  await app.register(shiftsRoutes, { prefix: '/shifts' })
  await app.register(notificationsRoutes, { prefix: '/notifications' })
  await app.register(tasksRoutes, { prefix: '/tasks' })
  await app.register(syncRoutes, { prefix: '/sync' })

  const port = Number(process.env.PORT ?? 4000)
  await app.listen({ port, host: '0.0.0.0' })
  console.log(`API running on http://0.0.0.0:${port}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
