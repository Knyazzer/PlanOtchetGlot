import { FastifyInstance } from 'fastify'
import { prisma } from '@nexus/db'
import { authenticate } from '../plugins/auth'

// Уведомления (Этап 3, golden 11 §3): derived-агрегатор, БЕЗ собственной таблицы.
// Лента = действия ДРУГИХ людей над моими задачами (TaskLog) + события на сегодня/завтра.
// «Прочитанность» ленты — на клиенте (localStorage-метка), mark-all-read = сдвиг метки.
// Чаты в панель добирает фронт из существующего /chats/unread.

const ACTION_TEXT: Record<string, (meta: Record<string, unknown>, taskTitle: string) => string> = {
  created:          (_m, t) => `назначил(а) вам задачу «${t}»`,
  status_changed:   (m, t) => `перевёл(а) «${t}» в «${m.to ?? '?'}»`,
  assignee_changed: (m, t) => `переназначил(а) «${t}» на ${m.to ?? '?'}`,
  deadline_changed: (m, t) => `изменил(а) дедлайн «${t}» на ${m.to ?? 'без срока'}`,
  start_changed:    (m, t) => `перенёс(ла) «${t}» на ${m.to ?? '?'}`,
  title_changed:    (_m, t) => `переименовал(а) задачу в «${t}»`,
  description_changed: (_m, t) => `обновил(а) описание «${t}»`,
  minutes_changed:  (_m, t) => `обновил(а) время по «${t}»`,
  series_created:   (_m, t) => `создал(а) серию задач «${t}»`,
}

export async function notificationsRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: authenticate }, async (req) => {
    const user = (req as any).user as { id: string }
    const since = new Date(Date.now() - 7 * 86_400_000) // лента за 7 дней

    const [logs, events, reqInbox, reqAnswers] = await Promise.all([
      // действия других людей над задачами, где я исполнитель или автор
      prisma.taskLog.findMany({
        where: {
          createdAt: { gte: since },
          userId: { not: user.id },
          task: { OR: [{ assigneeId: user.id }, { assignedById: user.id }] },
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: {
          id: true, action: true, meta: true, createdAt: true,
          user: { select: { id: true, name: true } },
          task: { select: { id: true, title: true } },
        },
      }),
      // мои события: сегодня и завтра
      prisma.event.findMany({
        where: {
          date: { gte: startOfDay(new Date()), lte: endOfDay(addDays(new Date(), 1)) },
          OR: [{ authorId: user.id }, { participants: { some: { userId: user.id } } }],
        },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        take: 10,
        select: { id: true, title: true, type: true, date: true, startTime: true, endTime: true },
      }),
      // заявки на моё согласование (pending) — для руководителя
      prisma.request.findMany({
        where: { approverId: user.id, status: 'pending' },
        orderBy: { createdAt: 'desc' }, take: 20,
        select: { id: true, type: true, createdAt: true, user: { select: { name: true } } },
      }),
      // ответы по моим заявкам за 7 дней
      prisma.request.findMany({
        where: { userId: user.id, status: { in: ['approved', 'rejected', 'revoked'] }, decidedAt: { gte: since } },
        orderBy: { decidedAt: 'desc' }, take: 20,
        select: { id: true, type: true, status: true, decidedAt: true },
      }),
    ])

    const taskItems = logs.map(l => {
      const fmt = ACTION_TEXT[l.action]
      const meta = (l.meta ?? {}) as Record<string, unknown>
      return {
        id: `log:${l.id}`,
        kind: 'task' as const,
        text: `${l.user.name} ${fmt ? fmt(meta, l.task.title) : `обновил(а) «${l.task.title}»`}`,
        at: l.createdAt,
        taskId: l.task.id,
      }
    })

    const today = startOfDay(new Date()).getTime()
    const eventItems = events.map(e => ({
      id: `event:${e.id}`,
      kind: 'calendar' as const,
      text: `${startOfDay(e.date).getTime() === today ? 'Сегодня' : 'Завтра'} в ${e.startTime}: ${e.title}`,
      at: e.date,
      eventId: e.id,
    }))

    const REQ_LABEL: Record<string, string> = { vacation: 'отпуск', sick: 'больничный', dayoff: 'отгул' }
    const requestItems = [
      ...reqInbox.map(r => ({
        id: `req-in:${r.id}`, kind: 'request' as const,
        text: `${r.user.name}: заявка на ${REQ_LABEL[r.type] ?? r.type} — нужно согласовать`,
        at: r.createdAt, requestId: r.id,
      })),
      ...reqAnswers.map(r => ({
        id: `req-ans:${r.id}`, kind: 'request' as const,
        text: `Ваша заявка (${REQ_LABEL[r.type] ?? r.type}) ${r.status === 'approved' ? 'одобрена' : r.status === 'revoked' ? 'отозвана' : 'отклонена'}`,
        at: r.decidedAt!, requestId: r.id,
      })),
    ].sort((a, b) => (a.at < b.at ? 1 : -1))

    return { tasks: taskItems, events: eventItems, requests: requestItems }
  })
}

function startOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}
function endOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(23, 59, 59, 999)
  return r
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}
