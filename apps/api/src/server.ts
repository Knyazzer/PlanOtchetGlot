import { config } from 'dotenv'
import { resolve } from 'path'
// Загружаем .env из корня монорепо
config({ path: resolve(__dirname, '../../../.env') })
import Fastify from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'

import { authRoutes } from './routes/auth'
import { usersRoutes } from './routes/users'
import { statusRowsRoutes } from './routes/statusRows'
import { dealsRoutes } from './routes/deals'
import { shiftsRoutes } from './routes/shifts'
import { notificationsRoutes } from './routes/notifications'
import { tasksRoutes } from './routes/tasks'
import { syncRoutes } from './routes/sync'
import { changeLogsRoutes } from './routes/changeLogs'
import { analyticsRoutes } from './routes/analytics'
import { databaseRoutes } from './routes/database'
import { matrixTemplatesRoutes } from './routes/matrixTemplates'
import { internalMatrixRoutes } from './routes/internalMatrix'
import { projectMembersRoutes } from './routes/projectMembers'
import { matrixExtrasRoutes } from './routes/matrixExtras'
import { kanbanTasksRoutes } from './routes/kanbanTasks'
import { projectsRoutes } from './routes/projects'
import { workItemsRoutes } from './routes/workItems'
import { departmentsRoutes } from './routes/departments'
import { deptWiLinksRoutes } from './routes/deptWiLinks'
import { calendarEventsRoutes } from './routes/calendarEvents'
import { hrStatusesRoutes } from './routes/hrStatuses'
import { studiosRoutes } from './routes/studios'
import { metricsPlugin } from './plugins/metrics'
import { runFullSync } from './services/syncService'
import { startOverdueChecker } from './jobs/overdueChecker'
import { prisma } from '@tv-shifts/db'

const app = Fastify({ logger: true })

// Ждём готовности PostgreSQL (на случай если Docker ещё поднимается)
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

  // Rate limiting — применяется только к роутам с явным config.rateLimit
  await app.register(rateLimit, { global: false })

  await app.register(metricsPlugin)

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
  await app.register(statusRowsRoutes, { prefix: '/status-rows' })
  await app.register(dealsRoutes, { prefix: '/deals' })
  await app.register(shiftsRoutes, { prefix: '/shifts' })
  await app.register(notificationsRoutes, { prefix: '/notifications' })
  await app.register(tasksRoutes, { prefix: '/tasks' })
  await app.register(syncRoutes, { prefix: '/sync' })
  await app.register(changeLogsRoutes, { prefix: '/change-logs' })
  await app.register(analyticsRoutes, { prefix: '/analytics' })
  await app.register(databaseRoutes, { prefix: '/database' })
  await app.register(matrixTemplatesRoutes, { prefix: '/matrix-templates' })
  await app.register(internalMatrixRoutes, { prefix: '/internal-matrix' })
  await app.register(projectMembersRoutes, { prefix: '/project-members' })
  await app.register(matrixExtrasRoutes, { prefix: '/' })
  await app.register(kanbanTasksRoutes, { prefix: '/kanban-tasks' })
  await app.register(projectsRoutes,    { prefix: '/projects' })
  await app.register(workItemsRoutes,   { prefix: '/work-items' })
  await app.register(departmentsRoutes, { prefix: '/departments' })
  await app.register(deptWiLinksRoutes,    { prefix: '/dept-wi-links' })
  await app.register(calendarEventsRoutes, { prefix: '/calendar/events' })
  await app.register(hrStatusesRoutes,     { prefix: '/hr-statuses' })
  await app.register(studiosRoutes,        { prefix: '/studios' })

  // Удалить все логи синхронизации при старте (старые данные неактуальны)
  await prisma.syncLog.deleteMany({})

  const port = Number(process.env.PORT ?? 4000)
  await app.listen({ port, host: '0.0.0.0' })
  console.log(`API running on http://0.0.0.0:${port}`)

  startOverdueChecker()
  console.log('[cron] Overdue checker started (runs every hour)')

}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
