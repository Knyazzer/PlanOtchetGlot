import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../../../.env'), override: true })

import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import websocket from '@fastify/websocket'
import { prisma } from '@nexus/db'

import { authRoutes } from './routes/auth'
import { databaseRoutes } from './routes/database'
import { usersRoutes } from './routes/users'
import { structureRoutes } from './routes/structure'
import { tasksRoutes } from './routes/tasks'
import { chatsRoutes } from './routes/chats'
import { eventsRoutes } from './routes/events'
import { calendarEntriesRoutes } from './routes/calendar-entries'
import { tracksRoutes } from './routes/tracks'
import { clientsRoutes } from './routes/clients'
import { projectsRoutes, workItemsRoutes } from './routes/projects'
import { dayEntriesRoutes } from './routes/day-entries'
import { workScheduleRoutes } from './routes/work-schedule'
import { svodRoutes } from './routes/svod'
import { boardRoutes } from './routes/board'
import { analyticsRoutes } from './routes/analytics'
import { accessRoutes } from './routes/access'
import { notificationsRoutes } from './routes/notifications'
import { refsRoutes } from './routes/refs'
import { postsRoutes } from './routes/posts'
import { requestsRoutes } from './routes/requests'
import { companyGoalsRoutes } from './routes/company-goals'

const app = Fastify({ logger: true })

async function waitForDB(retries = 30, delayMs = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      await prisma.$connect()
      console.log('[db] PostgreSQL ready')
      return
    } catch {
      console.log(`[db] Waiting for PostgreSQL... (${i + 1}/${retries})`)
      await new Promise(r => setTimeout(r, delayMs))
    }
  }
  throw new Error('[db] PostgreSQL did not become available in time')
}

async function main() {
  await waitForDB()

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true) // same-origin / curl
      const allowed = [
        process.env.WEB_URL ?? 'http://localhost:5173',
        'http://localhost:5173',
        'http://localhost:4173',
      ]
      // dev: любой localhost-порт (Vite дрейфует 5173→5174→… при занятом порте)
      const isDevLocalhost = process.env.NODE_ENV !== 'production'
        && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)
      // allow any LAN origin on port 5173 or 4173
      // LAN-доступ — только для локальной разработки (в проде не открываем сеть офиса)
      const isLAN = process.env.NODE_ENV !== 'production'
        && /^http:\/\/192\.168\.\d+\.\d+:(5173|4173)$/.test(origin)
      cb(null, allowed.includes(origin) || isDevLocalhost || isLAN)
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })

  // Security-заголовки. CSP выключен — API отдаёт JSON под CORS, не HTML;
  // CORP=cross-origin, чтобы не блокировать кросс-доменные fetch фронта (dev :5173 → api :4000).
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })

  // Rate-limit — глобально выключен, включается точечно на чувствительных
  // (неаутентифицированных) auth-эндпоинтах через config.rateLimit на роуте.
  await app.register(rateLimit, { global: false })

  await app.register(cookie)
  await app.register(websocket)

  // Fail-fast: в проде JWT_SECRET обязателен (иначе токены подписываются dev-заглушкой).
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET обязателен в production (общий с Supabase)')
  }
  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
    cookie: { cookieName: 'access_token', signed: false },
  })

  app.get('/health', async () => ({ status: 'ok' }))

  await app.register(authRoutes, { prefix: '/auth' })
  await app.register(databaseRoutes, { prefix: '/database' })
  await app.register(usersRoutes, { prefix: '/users' })
  await app.register(structureRoutes, { prefix: '/structure' })
  await app.register(tasksRoutes,          { prefix: '/tasks' })
  await app.register(chatsRoutes,          { prefix: '/chats' })
  await app.register(eventsRoutes,         { prefix: '/events' })
  await app.register(calendarEntriesRoutes, { prefix: '/calendar-entries' })
  await app.register(tracksRoutes,          { prefix: '/tracks' })
  await app.register(clientsRoutes,         { prefix: '/clients' })
  await app.register(projectsRoutes,        { prefix: '/projects' })
  await app.register(workItemsRoutes,       { prefix: '/work-items' })
  await app.register(dayEntriesRoutes,      { prefix: '/day-entries' })
  await app.register(workScheduleRoutes,    { prefix: '/work-schedule' })
  await app.register(svodRoutes,            { prefix: '/svod' })
  await app.register(boardRoutes,           { prefix: '/board' })
  await app.register(analyticsRoutes,       { prefix: '/analytics' })
  await app.register(accessRoutes,          { prefix: '/access' })
  await app.register(notificationsRoutes,   { prefix: '/notifications' })
  await app.register(refsRoutes,            { prefix: '/refs' })
  await app.register(postsRoutes,           { prefix: '/posts' })
  await app.register(requestsRoutes,        { prefix: '/requests' })
  await app.register(companyGoalsRoutes,    { prefix: '/company-goals' })

  const port = Number(process.env.PORT ?? 4000)
  await app.listen({ port, host: '0.0.0.0' })
  console.log(`API running on http://0.0.0.0:${port}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
