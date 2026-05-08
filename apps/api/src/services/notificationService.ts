import { prisma } from '@tv-shifts/db'

type NotifType = 'task_assigned' | 'task_overdue' | 'task_closed'

export async function notify(
  type: NotifType,
  message: string,
  userIds: string[],
  entityType: string,
  entityId: string,
) {
  const ids = [...new Set(userIds.filter(Boolean))]
  if (ids.length === 0) return
  await prisma.notification.createMany({
    data: ids.map((userId) => ({
      type: type as any, // NotificationType enum literal
      message,
      userId,
      entityType,
      entityId,
    })),
  })
}
