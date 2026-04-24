import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tv-shifts/db'
import { requirePermission } from '../config/permissions'
import { findSheetConfig } from '../services/databaseService'
import { copyTemplateToFolder, setupMatrixPermissions, appendToInternalRegistry, checkSpreadsheetExists, writeSvodData, clearMatrixShiftsSheet } from '../services/driveService'
import { syncProjectBlockNow } from '../services/matrixBlockSync'

const createMatrixSchema = z.object({
  projectName:  z.string().nullable().optional(),
  client:       z.string().nullable().optional(),
  unit:         z.array(z.string()).optional().default([]),
  format:       z.string().nullable().optional(),
  date:         z.string().nullable().optional(),
  producer:     z.string().nullable().optional(),
  manager:      z.string().nullable().optional(),
  curator:      z.string().nullable().optional(),
  kpLink:       z.string().nullable().optional(),
  brief:        z.string().nullable().optional(),
  revenuePlan:  z.number().nullable().optional(),
  status:       z.string().nullable().optional(),
  templateId:   z.string().uuid().nullable().optional(),
})

interface MatrixRow {
  id: string
  matrix_id: string
  sheet_url: string | null
  status: string | null
  unit: string[]
  client: string | null
  name: string | null
  format: string | null
  date: Date | null
  producer: string | null
  manager: string | null
  curator: string | null
  project_name: string | null
  kp_link: string | null
  brief: string | null
  source: string
  template_id: string | null
  created_at: Date
  updated_at: Date
}

export async function internalMatrixRoutes(app: FastifyInstance) {

  // POST /internal-matrix — create internal matrix record (SQL only, no Drive)
  app.post('/', { preHandler: requirePermission('internal-matrix:manage') }, async (request, reply) => {
    const body = createMatrixSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Неверные данные', details: body.error.flatten() })

    const { projectName, client, unit, format, date, producer, manager, curator,
            kpLink, brief, status, templateId } = body.data

    const matrixId = `INT-${Date.now()}`
    const name = [client, projectName].filter(Boolean).join(' — ') || projectName || matrixId

    const templateRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM matrix_templates WHERE is_active = true LIMIT 1`
    )
    const resolvedTemplateId = templateId ?? templateRows[0]?.id ?? null

    const rows = await prisma.$queryRawUnsafe<MatrixRow[]>(
      `INSERT INTO matrix_registry
         (id, matrix_id, name, client, unit, format, date, producer, manager, curator,
          project_name, kp_link, brief, status, source, template_id, sheet_url, updated_at)
       VALUES
         (gen_random_uuid(), $1, $2, $3, $4::TEXT[], $5, $6, $7, $8, $9,
          $10, $11, $12, 'request', 'internal', $13, NULL, NOW())
       RETURNING *`,
      matrixId, name,
      client ?? null, unit ?? [],
      format ?? null,
      date ? new Date(date) : null,
      producer ?? null, manager ?? null, curator ?? null,
      projectName ?? null, kpLink ?? null, brief ?? null,
      resolvedTemplateId,
    )

    return reply.code(201).send(rows[0])
  })

  // PATCH /internal-matrix/:id — update internal matrix
  app.patch('/:id', { preHandler: requirePermission('internal-matrix:manage') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = createMatrixSchema.partial().safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Неверные данные' })

    const sets: string[] = []
    const vals: unknown[] = []
    let i = 1
    const map: Record<string, string> = {
      client: 'client', unit: 'unit', format: 'format', date: 'date',
      producer: 'producer', manager: 'manager', curator: 'curator',
      projectName: 'project_name', kpLink: 'kp_link', brief: 'brief',
      revenuePlan: 'revenue_plan', status: 'status', templateId: 'template_id',
    }
    for (const [key, col] of Object.entries(map)) {
      if ((body.data as any)[key] !== undefined) {
        if (key === 'unit') {
          sets.push(`unit = $${i++}::TEXT[]`)
          vals.push((body.data as any).unit ?? [])
        } else {
          const val = key === 'date' && (body.data as any)[key]
            ? new Date((body.data as any)[key])
            : (body.data as any)[key] ?? null
          sets.push(`${col} = $${i++}`)
          vals.push(val)
        }
      }
    }
    if (sets.length === 0) return reply.code(400).send({ error: 'Нечего обновлять' })
    sets.push(`updated_at = NOW()`)
    vals.push(id)

    const rows = await prisma.$queryRawUnsafe<MatrixRow[]>(
      `UPDATE matrix_registry SET ${sets.join(', ')} WHERE id = $${i} AND source = 'internal' RETURNING *`,
      ...vals
    )
    if (!rows[0]) return reply.code(404).send({ error: 'Матрица не найдена' })
    return rows[0]
  })

  // DELETE /internal-matrix/:id
  app.delete('/:id', { preHandler: requirePermission('internal-matrix:manage') }, async (request, reply) => {
    const { id } = request.params as { id: string }

    // Capture linked workflow tasks before FK cascade nullifies their matrix_registry_id
    const linkedTasks = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM status_rows WHERE matrix_registry_id = $1 AND parent_task_id IS NULL AND source = 'manual'`, id
    )

    const result = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `DELETE FROM matrix_registry WHERE id = $1 AND source = 'internal' RETURNING id`, id
    )
    if (!result[0]) return reply.code(404).send({ error: 'Матрица не найдена или не внутренняя' })

    // Move orphaned tasks back to "connecting" stage so they appear in Workflow
    if (linkedTasks.length > 0) {
      await prisma.$executeRawUnsafe(
        `UPDATE status_rows SET status = 'connecting', updated_at = NOW() WHERE id = ANY($1::text[])`,
        linkedTasks.map((r) => r.id),
      )
    }

    return { ok: true }
  })

  // GET /internal-matrix/by-client/:client — all matrices for a client (for project linking)
  app.get('/by-client/:client', { preHandler: requirePermission('internal-matrix:manage') }, async (request) => {
    const { client } = request.params as { client: string }
    return prisma.$queryRawUnsafe<Pick<MatrixRow, 'id' | 'matrix_id' | 'name' | 'date' | 'source'>[]>(
      `SELECT id, matrix_id, name, date, source
       FROM matrix_registry
       WHERE client ILIKE $1
       ORDER BY date DESC NULLS LAST, created_at DESC`,
      client
    )
  })

  // POST /internal-matrix/:id/check — проверить существование таблицы, удалить если не найдена
  app.post('/:id/check', { preHandler: requirePermission('internal-matrix:manage') }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const rows = await prisma.$queryRawUnsafe<MatrixRow[]>(
      `SELECT * FROM matrix_registry WHERE id = $1 LIMIT 1`, id
    )
    const entry = rows[0]
    if (!entry) return reply.code(404).send({ error: 'Матрица не найдена' })

    if (!entry.sheet_url) return { exists: false, reason: 'no_url' }

    const spreadsheetId = entry.sheet_url.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1]
    if (!spreadsheetId) return { exists: false, reason: 'invalid_url' }

    try {
      const exists = await checkSpreadsheetExists(spreadsheetId)
      if (!exists && entry.source === 'internal') {
        await prisma.$executeRawUnsafe(`DELETE FROM matrix_registry WHERE id = $1`, id)
        return { exists: false, deleted: true }
      }
      return { exists }
    } catch (e: any) {
      return reply.code(500).send({ error: e.message })
    }
  })

  // GET /internal-matrix — list all internal matrices
  app.get('/', { preHandler: requirePermission('internal-matrix:manage') }, async () => {
    return prisma.$queryRawUnsafe<MatrixRow[]>(
      `SELECT * FROM matrix_registry WHERE source = 'internal' ORDER BY created_at DESC`
    )
  })

  // POST /internal-matrix/sync-to-drive — полная ручная синхронизация всех внутренних матриц в Drive
  app.post('/sync-to-drive', { preHandler: requirePermission('internal-matrix:manage') }, async (_request, reply) => {
    const errors: { matrixId: string; error: string }[] = []
    let matricesSynced = 0
    let blocksSynced = 0

    const [matrices, templateRows, driveCfg, internalRegistryCfg] = await Promise.all([
      prisma.$queryRawUnsafe<MatrixRow[]>(
        `SELECT * FROM matrix_registry WHERE source = 'internal' ORDER BY created_at ASC`
      ),
      prisma.$queryRawUnsafe<{ id: string; sheet_url: string }[]>(
        `SELECT id, sheet_url FROM matrix_templates WHERE is_active = true LIMIT 1`
      ),
      findSheetConfig('drive_folder'),
      findSheetConfig('internal_registry'),
    ])

    const activeTemplate = templateRows[0]
    const folderId = driveCfg?.sheet_url ?? null

    for (const matrix of matrices) {
      try {
        let sheetUrl = matrix.sheet_url

        // ── Шаг 1: нет Drive-файла — создаём ──────────────────────────────
        if (!sheetUrl) {
          if (!activeTemplate?.sheet_url || !folderId) {
            errors.push({ matrixId: matrix.matrix_id, error: 'Не настроен шаблон или папка Drive' })
            continue
          }
          sheetUrl = await copyTemplateToFolder(activeTemplate.sheet_url, matrix.name ?? matrix.matrix_id, folderId)

          const newId = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1]
          if (newId) {
            await setupMatrixPermissions(newId).catch((e: unknown) =>
              app.log.warn({ err: e }, '[sync-to-drive] Permission setup failed (non-fatal)'))
          }

          await clearMatrixShiftsSheet(sheetUrl).catch((e: unknown) =>
            app.log.warn({ err: e }, '[sync-to-drive] Shifts sheet clear failed (non-fatal)'))

          await prisma.$executeRawUnsafe(
            `UPDATE matrix_registry SET sheet_url = $1, updated_at = NOW() WHERE id = $2`,
            sheetUrl, matrix.id
          )

          if (internalRegistryCfg?.sheet_url) {
            appendToInternalRegistry(internalRegistryCfg.sheet_url, {
              matrixId: matrix.matrix_id,
              status: matrix.status ?? null,
              sheetUrl,
            }).catch((e: unknown) => app.log.warn({ err: e }, '[sync-to-drive] Registry append failed (non-fatal)'))
          }
        }

        // ── Шаг 2: записываем СВОД ─────────────────────────────────────────
        const dateStr = matrix.date
          ? new Date(matrix.date).toISOString().slice(0, 10).replace(/-/g, ' ')
          : ''
        await writeSvodData(sheetUrl, {
          client:        matrix.client ?? null,
          projectName:   matrix.project_name ?? null,
          format:        matrix.format ?? null,
          date:          dateStr,
          producerMM:    matrix.producer ?? null,
          salesManager:  matrix.manager ?? null,
          kpLink:        matrix.kp_link ?? null,
          curator:       matrix.curator ?? null,
          businessUnit:  matrix.unit?.length ? matrix.unit.join(', ') : null,
          brief:         matrix.brief ?? null,
        }).catch((e: unknown) => app.log.warn({ err: e }, '[sync-to-drive] СВОД write failed (non-fatal)'))

        matricesSynced++

        // ── Шаг 3: синхронизируем блоки всех привязанных проектов ──────────
        const projects = await prisma.$queryRawUnsafe<{ id: string }[]>(
          `SELECT id FROM status_rows
           WHERE matrix_registry_id = $1 AND block_slot IS NOT NULL`,
          matrix.id
        )

        for (const project of projects) {
          try {
            await syncProjectBlockNow(project.id)
            blocksSynced++
          } catch (e: any) {
            errors.push({ matrixId: matrix.matrix_id, error: `block ${project.id}: ${e?.message ?? e}` })
          }
        }
      } catch (e: any) {
        errors.push({ matrixId: matrix.matrix_id, error: e?.message ?? String(e) })
      }
    }

    return reply.send({ ok: true, matricesSynced, blocksSynced, errors })
  })
}
