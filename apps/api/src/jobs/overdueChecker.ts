import cron from 'node-cron'
import { prisma } from '@tv-shifts/db'
import { notify } from '../services/notificationService'

export function startOverdueChecker() {
  // Runs at minute 0 of every hour
  cron.schedule('0 * * * *', async () => {
    try {
      const now = new Date()
      const overdueTasks = await prisma.task.findMany({
        where: {
          deadline: { lt: now },
          isOverdue: false,
          status: { not: 'done' as any },
        },
        include: {
          assignments: { select: { userId: true } },
        },
      })

      for (const task of overdueTasks) {
        await prisma.task.update({
          where: { id: task.id },
          data: { isOverdue: true },
        })

        const userIds = [
          ...new Set([
            task.createdBy,
            ...task.assignments.map((a) => a.userId),
          ]),
        ]

        await notify(
          'task_overdue',
          `Задача просрочена: «${task.title}»`,
          userIds,
          'task',
          task.id,
        )
      }

      if (overdueTasks.length > 0) {
        console.log(`[overdueChecker] Marked ${overdueTasks.length} task(s) as overdue`)
      }
    } catch (err) {
      console.error('[overdueChecker] Error:', err)
    }
  })
}
