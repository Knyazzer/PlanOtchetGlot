import { FastifyInstance } from 'fastify'
import { prisma } from '@tv-shifts/db'
import { authenticate } from '../plugins/auth'
import { randomUUID } from 'crypto'

export async function notificationsRoutes(app: FastifyInstance) {
  // GET /notifications — список с isReadByMe для каждого
  app.get('/', { preHandler: authenticate }, async (request) => {
    const me = request.user as { id: string }

    // Получаем уведомления (личные + глобальные)
    const rows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT
        n.id, n.type, n.entity_type AS "entityType", n.entity_id AS "entityId",
        n.message, n.user_id AS "userId", n.is_read AS "isRead",
        n.created_at AS "createdAt", n.updated_at AS "updatedAt",
        CASE
          WHEN n.user_id IS NOT NULL THEN n.is_read
          ELSE EXISTS (
            SELECT 1 FROM user_notification_reads unr
            WHERE unr.user_id = $1 AND unr.notification_id = n.id
          )
        END AS "isReadByMe"
      FROM notifications n
      WHERE n.user_id = $1 OR n.user_id IS NULL
      ORDER BY n.created_at DESC
      LIMIT 50
    `, me.id)

    return rows
  })

  // GET /notifications/count — количество непрочитанных для текущего пользователя
  app.get('/count', { preHandler: authenticate }, async (request) => {
    const me = request.user as { id: string }

    const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`
      SELECT COUNT(*) AS count
      FROM notifications n
      WHERE (
        (n.user_id = $1 AND n.is_read = false)
        OR (
          n.user_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM user_notification_reads unr
            WHERE unr.user_id = $1 AND unr.notification_id = n.id
          )
        )
      )
    `, me.id)

    return { count: Number(rows[0]?.count ?? 0) }
  })

  // PATCH /notifications/:id/read — отметить одно как прочитанное
  app.patch('/:id/read', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const me = request.user as { id: string }

    const rows = await prisma.$queryRawUnsafe<{ user_id: string | null }[]>(
      `SELECT user_id FROM notifications WHERE id = $1 LIMIT 1`, id
    )
    const notif = rows[0]
    if (!notif) return reply.code(404).send({ error: 'Not found' })

    if (notif.user_id !== null) {
      // Личное уведомление — обновляем is_read
      await prisma.$executeRawUnsafe(
        `UPDATE notifications SET is_read = true, updated_at = NOW() WHERE id = $1`, id
      )
    } else {
      // Глобальное — вставляем запись в user_notification_reads (игнорируем дубли)
      await prisma.$executeRawUnsafe(
        `INSERT INTO user_notification_reads (id, user_id, notification_id, read_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id, notification_id) DO NOTHING`,
        randomUUID(), me.id, id
      )
    }

    return { ok: true }
  })

  // PATCH /notifications/read-all — отметить все как прочитанные
  app.patch('/read-all', { preHandler: authenticate }, async (request) => {
    const me = request.user as { id: string }

    // 1. Личные уведомления
    await prisma.$executeRawUnsafe(
      `UPDATE notifications SET is_read = true, updated_at = NOW()
       WHERE user_id = $1 AND is_read = false`,
      me.id
    )

    // 2. Глобальные — вставляем записи для всех ещё не прочитанных
    await prisma.$executeRawUnsafe(
      `INSERT INTO user_notification_reads (id, user_id, notification_id, read_at)
       SELECT gen_random_uuid(), $1, n.id, NOW()
       FROM notifications n
       WHERE n.user_id IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM user_notification_reads unr
           WHERE unr.user_id = $1 AND unr.notification_id = n.id
         )
       ON CONFLICT (user_id, notification_id) DO NOTHING`,
      me.id
    )

    return { ok: true }
  })
}
