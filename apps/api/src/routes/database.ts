import { FastifyInstance } from 'fastify'
import { requireRole } from '../plugins/auth'
import {
  TABLE_KEYS,
  TABLE_META,
  getAllSheetConfigs,
  getSheetConfig,
} from '../services/databaseService'

const PREVIEW_LIMIT = 200

export async function databaseRoutes(app: FastifyInstance) {

  // GET /database/config — состояние всех трёх таблиц
  app.get('/config', { preHandler: requireRole('admin') }, async () => {
    const configs = await getAllSheetConfigs()
    const configMap = new Map(configs.map((c) => [c.tableKey, c]))

    const tables = TABLE_KEYS.map((key) => {
      const cfg  = configMap.get(key)
      const data = cfg?.cachedData as { rows?: unknown[] } | { columns?: unknown[]; rows?: unknown[] } | null
      const rowCount = Array.isArray((data as any)?.rows) ? (data as any).rows.length : 0
      return {
        key,
        ...TABLE_META[key],
        rowCount,
        lastSyncedAt: cfg?.lastSyncedAt ?? null,
      }
    })

    return { tables }
  })

  // GET /database/preview/:key — просмотр закэшированных данных
  app.get('/preview/:key', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { key } = request.params as { key: string }
    if (!(TABLE_KEYS as readonly string[]).includes(key)) {
      return reply.code(404).send({ error: 'Неизвестный ключ' })
    }

    const cfg = await getSheetConfig(key)
    if (!cfg?.cachedData) return { columns: [], rows: [] }

    const data = cfg.cachedData as any

    if (key === 'employees_buffer') {
      const rows = (data.rows ?? []).slice(0, PREVIEW_LIMIT) as {
        tabNumber: string; name: string; position: string; dept: string; subDept: string; email?: string
      }[]
      return {
        columns: ['Таб. №', 'ФИО', 'Должность', 'Департамент', 'Отдел', 'Email'],
        rows: rows.map((r) => [r.tabNumber, r.name, r.position, r.dept, r.subDept, r.email ?? '']),
      }
    }

    if (key === 'freelancers') {
      const rows = (data.rows ?? []).slice(0, PREVIEW_LIMIT) as {
        number: string; name: string; position: string
      }[]
      return {
        columns: ['№', 'ФИО', 'Должность'],
        rows: rows.map((r) => [r.number, r.name, r.position]),
      }
    }

    // kfpd
    return {
      columns: (data.columns ?? []) as string[],
      rows:    ((data.rows ?? []) as string[][]).slice(0, PREVIEW_LIMIT),
    }
  })
}
