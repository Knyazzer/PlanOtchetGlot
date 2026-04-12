import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tv-shifts/db'
import { requireRole } from '../plugins/auth'
import {
  refreshSheetData,
  allSheetConfigs,
  findSheetConfig,
  upsertConfig,
  TABLE_KEYS,
  ALL_CONFIG_KEYS,
  TABLE_META,
  type TableKey,
  type SheetConfigRow,
} from '../services/databaseService'

export async function databaseRoutes(app: FastifyInstance) {

  // GET /database/config — состояние всех таблиц
  app.get('/config', { preHandler: requireRole('admin') }, async () => {
    const base = 'https://docs.google.com/spreadsheets/d'

    const [projectsCount, registryCount, configs] = await Promise.all([
      prisma.statusRow.count({ where: { NOT: { source: 'separator' as any } } }),
      prisma.matrixRegistry.count(),
      allSheetConfigs(),
    ])

    const configMap = new Map<string, SheetConfigRow>(configs.map((c) => [c.table_key, c]))

    const envProjectsUrl = process.env.GOOGLE_PROJECTS_SHEET_ID
      ? `${base}/${process.env.GOOGLE_PROJECTS_SHEET_ID}`
      : null
    const envRegistryUrl = process.env.GOOGLE_REGISTRY_SHEET_ID
      ? `${base}/${process.env.GOOGLE_REGISTRY_SHEET_ID}`
      : null

    const projectsCfg = configMap.get('projects')
    const registryCfg = configMap.get('registry')
    const internalRegistryCfg = configMap.get('internal_registry')
    const driveFolderCfg = configMap.get('drive_folder')

    const tables = [
      {
        key: 'projects',
        ...TABLE_META.projects,
        sheetUrl: projectsCfg?.sheet_url ?? envProjectsUrl,
        apiKey: projectsCfg?.api_key ?? null,
        rowCount: projectsCount,
        lastSyncedAt: null,
      },
      {
        key: 'registry',
        ...TABLE_META.registry,
        sheetUrl: registryCfg?.sheet_url ?? envRegistryUrl,
        apiKey: registryCfg?.api_key ?? null,
        rowCount: registryCount,
        lastSyncedAt: null,
      },
      ...TABLE_KEYS.map((key) => {
        const cfg = configMap.get(key)
        const data = cfg?.cached_data as { rows?: unknown[] } | null
        return {
          key,
          ...TABLE_META[key],
          sheetUrl: cfg?.sheet_url ?? null,
          apiKey: cfg?.api_key ?? null,
          rowCount: data?.rows?.length ?? 0,
          lastSyncedAt: cfg?.last_synced_at ?? null,
        }
      }),
    ]

    return {
      tables,
      internalRegistry: {
        sheetUrl: internalRegistryCfg?.sheet_url ?? null,
        apiKey: internalRegistryCfg?.api_key ?? null,
      },
      driveFolderId: driveFolderCfg?.sheet_url ?? null,
    }
  })

  // PATCH /database/config/:key — обновить URL и/или API-ключ таблицы
  app.patch('/config/:key', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { key } = request.params as { key: string }
    if (!ALL_CONFIG_KEYS.includes(key as any)) {
      return reply.code(400).send({ error: 'Неизвестный ключ таблицы' })
    }
    // drive_folder stores a plain folder ID, not a URL — skip URL validation for it
    const bodySchema = key === 'drive_folder'
      ? z.object({ sheetUrl: z.string().nullable().optional(), apiKey: z.string().nullable().optional() })
      : z.object({ sheetUrl: z.string().url().nullable().optional(), apiKey: z.string().nullable().optional() })
    const body = bodySchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Неверный формат данных' })

    const update: { sheetUrl?: string | null; apiKey?: string | null } = {}
    if ('sheetUrl' in body.data) update.sheetUrl = body.data.sheetUrl ?? null
    if ('apiKey' in body.data) update.apiKey = body.data.apiKey ?? null

    await upsertConfig(key, update)
    return { ok: true }
  })

  // POST /database/refresh/:key — загрузить данные из Google Sheets
  app.post('/refresh/:key', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { key } = request.params as { key: string }
    if (!TABLE_KEYS.includes(key as TableKey)) {
      return reply.code(400).send({ error: 'Неизвестный ключ таблицы' })
    }
    try {
      await refreshSheetData(key as TableKey)
      return { ok: true }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка загрузки'
      return reply.code(500).send({ error: msg })
    }
  })

  // GET /database/preview/:key — просмотр загруженных данных
  app.get('/preview/:key', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { key } = request.params as { key: string }
    const LIMIT = 200

    if (key === 'projects') {
      const rows = await prisma.statusRow.findMany({
        where: { NOT: { source: 'separator' as any } },
        select: { client: true, name: true, status: true, date: true, lineProducer: true },
        orderBy: { createdAt: 'asc' },
        take: LIMIT,
      })
      return {
        columns: ['Клиент', 'Название', 'Статус', 'Дата', 'Линейный продюсер'],
        rows: rows.map((r) => [
          r.client ?? '',
          r.name,
          r.status,
          r.date ? new Date(r.date).toLocaleDateString('ru-RU') : '',
          r.lineProducer ?? '',
        ]),
      }
    }

    if (key === 'registry') {
      const rows = await prisma.matrixRegistry.findMany({
        select: { matrixId: true, name: true, client: true, unit: true, date: true },
        orderBy: { createdAt: 'asc' },
        take: LIMIT,
      })
      return {
        columns: ['ID матрицы', 'Название', 'Клиент', 'Юнит', 'Дата'],
        rows: rows.map((r) => [
          r.matrixId,
          r.name ?? '',
          r.client ?? '',
          r.unit ?? '',
          r.date ? new Date(r.date).toLocaleDateString('ru-RU') : '',
        ]),
      }
    }

    if (TABLE_KEYS.includes(key as TableKey)) {
      const cfg = await findSheetConfig(key)
      if (!cfg?.cached_data) return { columns: [], rows: [] }

      const data = cfg.cached_data as {
        rows?: { name: string; position?: string | null }[]
        columns?: string[]
      }

      if (key === 'employees_buffer' || key === 'freelancers') {
        const rows = (data.rows ?? []).slice(0, LIMIT)
        return {
          columns: ['ФИО', 'Должность'],
          rows: rows.map((r) => [r.name, r.position ?? '']),
        }
      }

      // kfpd
      const kfpd = data as unknown as { columns: string[]; rows: string[][] }
      return {
        columns: kfpd.columns ?? [],
        rows: (kfpd.rows ?? []).slice(0, LIMIT),
      }
    }

    return reply.code(404).send({ error: 'Неизвестный ключ' })
  })
}
