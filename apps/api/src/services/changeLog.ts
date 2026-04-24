import { prisma } from '@tv-shifts/db'

type ChangeSource = 'manual' | 'sync'

type AuditEvent = 'login' | 'logout' | 'role_change' | 'delete'

export async function logEvent(
  event: AuditEvent,
  entityId: string,
  changedBy: string | null,
  meta?: Record<string, unknown>
) {
  await prisma.changeLog.create({
    data: {
      entityType: 'user_event',
      entityId,
      field: event,
      oldValue: null,
      newValue: meta ? JSON.stringify(meta) : null,
      changedBy,
      source: 'manual',
    },
  })
}

/**
 * Записывает изменения поля в change_logs.
 * Сравнивает oldData и newData по ключам из newData, логирует отличия.
 */
export async function logChanges(
  entityType: string,
  entityId: string,
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>,
  changedBy: string | null,
  source: ChangeSource = 'manual'
) {
  const entries: Parameters<typeof prisma.changeLog.create>[0]['data'][] = []

  for (const [field, newValue] of Object.entries(newData)) {
    const oldValue = oldData[field]
    if (String(oldValue ?? '') !== String(newValue ?? '')) {
      entries.push({
        entityType,
        entityId,
        field,
        oldValue: oldValue != null ? String(oldValue) : null,
        newValue: newValue != null ? String(newValue) : null,
        changedBy,
        source,
      })
    }
  }

  if (entries.length > 0) {
    await prisma.changeLog.createMany({ data: entries })
  }
}
