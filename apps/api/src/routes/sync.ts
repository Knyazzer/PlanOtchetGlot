import { FastifyInstance } from 'fastify'
import { prisma } from '@tv-shifts/db'
import { requireRole } from '../plugins/auth'
import { runFullSync, fetchMatrixPreview, fetchMatrixShifts, requestSyncAbort, isSyncActive } from '../services/syncService'

export async function syncRoutes(app: FastifyInstance) {
  // POST /sync/trigger — ручной запуск (admin или producer)
  app.post('/trigger', { preHandler: requireRole('admin', 'producer') }, async (_request, reply) => {
    // Считаем матрицы заранее чтобы вернуть total фронтенду
    const totalMatrices = await prisma.matrixRegistry.count({ where: { sheetUrl: { not: null } } })

    if (isSyncActive()) {
      // Синхронизация уже выполняется — возвращаем это фронтенду
      return reply.code(202).send({ message: 'Sync already running', totalMatrices, alreadyRunning: true })
    }

    // Запускаем асинхронно, не ждём завершения
    runFullSync()
      .then((result) => {
        app.log.info({ result }, '[sync] Full sync completed')
      })
      .catch((err) => {
        app.log.error({ err }, '[sync] Full sync failed')
      })

    return reply.code(202).send({ message: 'Sync started', totalMatrices, alreadyRunning: false })
  })

  // POST /sync/stop — остановить синхронизацию матриц
  app.post('/stop', { preHandler: requireRole('admin', 'producer') }, async (_request, reply) => {
    requestSyncAbort()
    return reply.send({ message: 'Abort requested' })
  })

  // GET /sync/sheet-urls — публичные URL исходных Google Sheets
  app.get('/sheet-urls', { preHandler: requireRole('admin') }, async () => {
    const base = 'https://docs.google.com/spreadsheets/d'
    return {
      projectsSheetUrl: process.env.GOOGLE_PROJECTS_SHEET_ID
        ? `${base}/${process.env.GOOGLE_PROJECTS_SHEET_ID}`
        : null,
      registrySheetUrl: process.env.GOOGLE_REGISTRY_SHEET_ID
        ? `${base}/${process.env.GOOGLE_REGISTRY_SHEET_ID}`
        : null,
    }
  })

  // GET /sync/registry — все записи реестра матриц (в порядке как в таблице)
  app.get('/registry', { preHandler: requireRole('admin') }, async () => {
    const rows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT mr.*,
             mr.has_shifts_data AS "hasShiftsData"
      FROM matrix_registry mr
      ORDER BY mr.date ASC NULLS LAST, mr.created_at ASC
    `)
    return rows.map((r: any) => ({
      id:             r.id,
      matrixId:       r.matrix_id,
      sheetUrl:       r.sheet_url,
      status:         r.status,
      unit:           r.unit ?? [],
      client:         r.client,
      name:           r.name,
      projectName:    r.project_name,
      format:         r.format,
      date:           r.date,
      producer:       r.producer,
      manager:        r.manager,
      curator:        r.curator,
      kpLink:         r.kp_link,
      brief:          r.brief,
      revenuePlan:    r.revenue_plan ?? null,
      projectId:      r.project_id,
      googleRowIndex: r.google_row_index,
      hasShiftsData:  r.has_shifts_data,
      lastSyncedAt:   r.last_synced_at,
      source:         r.source ?? 'google',
      templateId:     r.template_id ?? null,
    }))
  })

  // POST /sync/reset — удалить все импортированные данные
  app.post('/reset', { preHandler: requireRole('admin') }, async (_request, reply) => {
    // Удаляем в нужном порядке из-за foreign keys
    // source: 'separator' не знает устаревший Prisma-клиент — используем raw SQL
    const shifts   = await prisma.shiftEntry.deleteMany({ where: { source: 'matrix' } })
    const registry = await prisma.matrixRegistry.deleteMany({ where: { source: 'google' as any } })
    const result   = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `DELETE FROM status_rows WHERE source IN ('projects_table'::"StatusRowSource", 'separator'::"StatusRowSource") RETURNING id`
    )
    const projectsCount = result.length
    return reply.send({
      deleted: {
        shiftEntries: shifts.count,
        registryEntries: registry.count,
        projects: projectsCount,
      },
    })
  })

  // GET /sync/matrix-preview/:matrixId — просмотр содержимого матрицы
  app.get('/matrix-preview/:matrixId', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { matrixId } = request.params as { matrixId: string }
    const { sheet } = request.query as { sheet?: string }

    const entry = await prisma.matrixRegistry.findFirst({ where: { matrixId } })
    if (!entry) return reply.code(404).send({ error: 'Матрица не найдена' })
    if (!entry.sheetUrl) return reply.code(400).send({ error: 'URL таблицы не указан' })

    try {
      const preview = await fetchMatrixPreview(entry.sheetUrl, sheet)
      return preview
    } catch (e: any) {
      return reply.code(500).send({ error: e.message })
    }
  })

  // GET /sync/matrix-shifts/:matrixId — смены из матрицы (из кэша БД или Google Sheets)
  app.get('/matrix-shifts/:matrixId', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { matrixId } = request.params as { matrixId: string }
    const { refresh } = request.query as { refresh?: string }

    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT shifts_cache, sheet_url FROM matrix_registry WHERE matrix_id = $1 LIMIT 1`,
      matrixId,
    )
    const entry = rows[0]
    if (!entry) return reply.code(404).send({ error: 'Matrix not found' })

    // Return cached data if available and no forced refresh
    if (entry.shifts_cache && refresh !== 'true') {
      return entry.shifts_cache
    }

    if (!entry.sheet_url) return reply.code(400).send({ error: 'No URL for this matrix' })

    try {
      const data = await fetchMatrixShifts(entry.sheet_url)
      if (!data) return reply.code(404).send({ error: 'Shifts sheet not found in this spreadsheet' })
      // Update cache
      await prisma.$executeRawUnsafe(
        `UPDATE matrix_registry SET shifts_cache = $1::jsonb, has_shifts_data = $2, last_synced_at = NOW() WHERE matrix_id = $3`,
        JSON.stringify(data),
        data.activeCols.length > 0,
        matrixId,
      )
      return data
    } catch (e: any) {
      return reply.code(500).send({ error: e.message })
    }
  })

  // GET /sync/logs — история синхронизаций
  app.get('/logs', { preHandler: requireRole('admin', 'producer') }, async (request) => {
    const query = request.query as { limit?: string; type?: string }
    const limit = Math.min(Number(query.limit ?? 50), 200)

    return prisma.syncLog.findMany({
      where: query.type ? { type: query.type as any } : undefined,
      orderBy: { startedAt: 'desc' },
      take: limit,
    })
  })
}
