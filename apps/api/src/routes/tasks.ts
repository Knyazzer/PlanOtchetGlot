import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@nexus/db'
import { authenticate } from '../plugins/auth'
import { getOrgScope } from '../services/orgScope'
import { isLocked } from '../services/periodLock'
import { LEAVE_FORMATS } from './requests'
import { randomUUID } from 'crypto'

const isoDay = (d: Date) => d.toISOString().slice(0, 10)
const localToday = (): string => { const n = new Date(); const p = (x: number) => String(x).padStart(2, '0'); return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}` }

// Инвариант «активный день»: брать задачу в работу (inprogress), выполнять (done) и создавать СВОЮ
// задачу можно только когда АКТИВЕН тот день, к которому задача относится (startTime есть, endTime нет).
// «Активным» может быть и прошлый день, который сотрудник дозаполняет задним числом (ретроактив):
// открыл забытый день → начал → проставил задачи → закрыл. Порядок дней держит дневная цепочка.
// ДЕНЬ ОТСУТСТВИЯ (отпуск/больничный/отгул, дата ≤ сегодня) — тоже «рабочий по задачам» БЕЗ «начала дня»
// (время не логируется): в такие дни можно вести/переносить задачи. Будущее — нельзя.
async function isDayActive(userId: string, dayStr: string): Promise<boolean> {
  const de = await prisma.dayEntry.findUnique({
    where: { userId_date: { userId, date: new Date(dayStr) } },
    select: { startTime: true, endTime: true, dayFormat: true },
  })
  if (!de) return false
  if (de.startTime && !de.endTime) return true                        // активный рабочий день
  if (LEAVE_FORMATS.has(de.dayFormat)) return dayStr.slice(0, 10) <= localToday() // отсутствие (не будущее)
  return false
}

const TASK_SELECT = {
  id: true,
  title: true,
  description: true,
  status: true,
  startDate: true,
  deadline: true,
  type: true,
  client: true,
  projectId: true,
  project:          { select: { id: true, title: true } },
  divisionId: true,
  plannedMinutes: true,
  actualMinutes: true,
  doneAt: true,
  archived: true,
  repeatRule: true,
  repeatUntil: true,
  recurringParentId: true,
  seenAt: true,
  calendarEventId: true,
  calendarEventEnd: true,
  trackId: true,
  track:            { select: { id: true, title: true, type: true } },
  stageId: true,
  stage:            { select: { id: true, title: true } },
  goalId: true,     // привязка к стратегической цели (скаляр — Prisma-связи нет; заголовок берём из /strategic-goals)
  createdAt: true,
  updatedAt: true,
  assignedBy: { select: { id: true, name: true } },
  assignee:   { select: { id: true, name: true } },
} as const

const TASK_TYPES = ['task', 'zoom', 'meeting_offline', 'air', 'build', 'event'] as const
const REPEAT_RULES = ['daily', 'weekdays'] as const
const REPEAT_CAP_DAYS = 90 // максимум материализации серии вперёд

/** Снапшот отдела исполнителя — для свода/аналитики (первое членство). */
async function resolveDivisionId(userId: string): Promise<string | null> {
  const m = await prisma.userDivision.findFirst({ where: { userId }, select: { divId: true } })
  return m?.divId ?? null
}

/** Дни серии: от даты после start до repeatUntil включительно (weekdays — без сб/вс), cap 90. */
function recurrenceDates(start: Date, until: Date, rule: string): Date[] {
  const dates: Date[] = []
  const d = new Date(start)
  d.setDate(d.getDate() + 1)
  while (d <= until && dates.length < REPEAT_CAP_DAYS) {
    const wd = d.getDay()
    if (rule !== 'weekdays' || (wd !== 0 && wd !== 6)) dates.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }
  return dates
}

function applyAutoStatus<T extends { status: string; calendarEventId?: string | null; startDate?: Date | null; calendarEventEnd?: Date | null }>(task: T): T {
  if (!task.calendarEventId) return task
  const now = new Date()
  if (task.calendarEventEnd && now > task.calendarEventEnd) return { ...task, status: 'done' }
  if (task.startDate && now >= task.startDate) return { ...task, status: 'inprogress' }
  return { ...task, status: 'backlog' }
}

async function log(taskId: string, userId: string, action: string, meta?: object) {
  await prisma.taskLog.create({
    data: { id: randomUUID(), taskId, userId, action, meta: meta ?? undefined },
  })
}

const STATUS_LABELS: Record<string, string> = {
  backlog:    'Бэклог',
  inprogress: 'В работе',
  done:       'Готово',
}

export async function tasksRoutes(app: FastifyInstance) {

  // GET /tasks — tasks assigned to or by the current user
  app.get('/', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string; isAdmin: boolean }
    const { scope, userId, date } = request.query as { scope?: string; userId?: string; date?: string }

    if (scope === 'team' || user.isAdmin) {
      // RBAC: охват team-скоупа по орг-уровню — member видит себя, head — отдел,
      // director — департамент, admin — всю компанию (спека research/20 §2).
      const visible = user.isAdmin ? null : (await getOrgScope(user.id)).visibleUserIds
      let assigneeFilter: Record<string, unknown> = visible ? { assigneeId: { in: visible } } : {}
      if (userId) {
        // точечный запрос (карточка дня в Своде) — userId должен входить в охват
        if (visible && !visible.includes(userId)) return reply.code(403).send({ error: 'Forbidden' })
        assigneeFilter = { assigneeId: userId }
      }
      // опц. фильтр по дате — задачи сотрудника на конкретный день
      const dayFilter =
        date && /^\d{4}-\d{2}-\d{2}$/.test(date)
          ? { startDate: { gte: new Date(date), lt: new Date(new Date(date).getTime() + 86_400_000) } }
          : {}
      const tasks = await prisma.task.findMany({
        where: { ...assigneeFilter, ...dayFilter },
        select: TASK_SELECT,
        orderBy: [{ status: 'asc' }, { deadline: 'asc' }, { createdAt: 'desc' }],
      })
      return tasks.map(applyAutoStatus)
    }

    // Рядовой пользователь: ВСЕ свои задачи (назначенные мне ИЛИ мной), БЕЗ фильтра по дню — так и надо.
    // Клиент (кабинет) фильтрует по дню сам (inTaskWindow), а «Дедлайны»/MonthStrip/просрочка требуют все
    // задачи разом. Параметры `date`/`userId` применяются ТОЛЬКО в team/admin-ветке (карточки Свода);
    // здесь они намеренно игнорируются — не полагаться на серверную фильтрацию по дню для этой роли.
    const tasks = await prisma.task.findMany({
      where: { OR: [{ assigneeId: user.id }, { assignedById: user.id }] },
      select: TASK_SELECT,
      orderBy: [{ status: 'asc' }, { deadline: 'asc' }, { createdAt: 'desc' }],
    })
    return tasks.map(applyAutoStatus)
  })

  // PATCH /tasks/reorder — ручной порядок задач ВНУТРИ ОДНОГО ДНЯ (drag за grip).
  // Модель «окно» [startDate, deadline]: задача видна в нескольких днях, порядок в каждом свой
  // (TaskDayOrder(taskId, day) вместо прежнего глобального Task.manualOrder) — реордер в дне 5
  // не трогает день 6. Обновляем только СВОИ задачи (или любые — админ), атомарно в транзакции.
  app.patch('/reorder', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string; isAdmin: boolean }
    const schema = z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), ids: z.array(z.string()).max(500) })
    const body = schema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })
    const { day, ids } = body.data
    if (!user.isAdmin) {
      const owned = await prisma.task.count({ where: { id: { in: ids }, assigneeId: user.id } })
      if (owned !== ids.length) return reply.code(403).send({ error: 'Forbidden' })
    }
    await prisma.$transaction(
      ids.map((id, i) => prisma.taskDayOrder.upsert({
        where: { taskId_day: { taskId: id, day } },
        create: { taskId: id, day, order: i },
        update: { order: i },
      })),
    )
    return reply.code(204).send()
  })

  // GET /tasks/day-order?day= — порядок МОИХ задач в конкретном дне (для сортировки списка дня).
  app.get('/day-order', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string }
    const { day } = request.query as { day?: string }
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return reply.code(400).send({ error: 'day required' })
    const rows = await prisma.taskDayOrder.findMany({
      where: { day, task: { assigneeId: user.id } },
      select: { taskId: true, order: true },
    })
    return Object.fromEntries(rows.map(r => [r.taskId, r.order]))
  })

  // GET /tasks/unseen-count — tasks assigned to me that I haven't opened yet
  app.get('/unseen-count', { preHandler: authenticate }, async (request) => {
    const user = (request as any).user as { id: string }
    const count = await prisma.task.count({
      where: { assigneeId: user.id, seenAt: null },
    })
    return { count }
  })

  // POST /tasks/:id/seen — mark a task as seen by the assignee
  app.post('/:id/seen', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string }
    const { id } = request.params as { id: string }
    const task = await prisma.task.findUnique({ where: { id }, select: { assigneeId: true, seenAt: true } })
    if (!task) return reply.code(404).send({ error: 'Not found' })
    if (task.assigneeId !== user.id) return reply.code(403).send({ error: 'Forbidden' })
    if (!task.seenAt) {
      await prisma.task.update({ where: { id }, data: { seenAt: new Date() } })
    }
    return reply.code(204).send()
  })

  // POST /tasks/seen-all — пометить ВСЕ назначенные мне непросмотренные задачи прочитанными.
  // Используется колокольчиком «Прочитать всё» (уведомления о назначении = задачи с seenAt=null).
  app.post('/seen-all', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string }
    await prisma.task.updateMany({ where: { assigneeId: user.id, seenAt: null }, data: { seenAt: new Date() } })
    return reply.code(204).send()
  })

  // GET /tasks/:id — single task (accessible to any authenticated user for task cards in chats)
  app.get('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const task = await prisma.task.findUnique({ where: { id }, select: TASK_SELECT })
    if (!task) return reply.code(404).send({ error: 'Task not found' })
    return applyAutoStatus(task)
  })

  // GET /tasks/:id/log — history entries for a task
  app.get('/:id/log', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string; isAdmin: boolean }
    const { id } = request.params as { id: string }

    const task = await prisma.task.findUnique({ where: { id }, select: { assignedById: true, assigneeId: true } })
    if (!task) return reply.code(404).send({ error: 'Task not found' })

    const canView = user.isAdmin || task.assignedById === user.id || task.assigneeId === user.id
    if (!canView) return reply.code(403).send({ error: 'Forbidden' })

    return prisma.taskLog.findMany({
      where: { taskId: id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        action: true,
        meta: true,
        createdAt: true,
        user: { select: { id: true, name: true } },
      },
    })
  })

  // POST /tasks — create a task (опц. серия повторов: repeatRule+repeatUntil → экземпляры, В-2)
  app.post('/', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string }
    const schema = z.object({
      title:       z.string().min(1),
      description: z.string().default(''),
      assigneeId:  z.string().uuid(),
      deadline:    z.string().optional(),
      startDate:   z.string().optional(),
      status:      z.enum(['backlog', 'inprogress', 'done']).default('backlog'),
      trackId:     z.string().nullable().optional(),
      stageId:     z.string().nullable().optional(),
      goalId:      z.string().nullable().optional(),  // привязка задачи к стратегической цели
      type:           z.enum(TASK_TYPES).optional(),
      client:         z.string().max(200).nullable().optional(),
      projectId:      z.string().nullable().optional(),
      plannedMinutes: z.number().int().min(0).max(24 * 60).nullable().optional(),
      actualMinutes:  z.number().int().min(0).max(24 * 60).nullable().optional(),
      repeatRule:     z.enum(REPEAT_RULES).nullable().optional(),
      repeatUntil:    z.string().nullable().optional(),
    })
    const body = schema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })

    const { title, description, assigneeId, deadline, startDate, status, trackId, stageId, goalId,
            type, client, projectId, plannedMinutes, actualMinutes, repeatRule, repeatUntil } = body.data

    const assigneeExists = await prisma.user.findUnique({ where: { id: assigneeId }, select: { id: true, name: true } })
    if (!assigneeExists) return reply.code(404).send({ error: 'Assignee not found' })

    const now = new Date()
    const effectiveStart = startDate ? new Date(startDate) : now
    // Валидация «дедлайн ≥ начала» УБРАНА: под моделью задача может быть просрочена — её переносят
    // на день ПОЗЖЕ дедлайна (deadline < startDate = «просрочено», это валидное состояние).
    if (repeatRule && !repeatUntil) {
      return reply.code(400).send({ error: 'Для повтора нужна дата окончания серии (repeatUntil)' })
    }

    // ── Server-side guard (не доверяем клиенту): модель НЕДЕЛЬНАЯ. Задачу нельзя создать в
    //    зафиксированной неделе (не-админ) или в уже ЗАВЕРШЁННОМ дне (endTime). Подневного запрета
    //    «прошлый день» НЕТ — ранние дни открытой недели заполняемы. Проверка по дню ИСПОЛНИТЕЛЯ.
    //    Спека — docs/PERIOD-LOCK-2026-08-29.md, override зафиксации — только мастер-админ.
    if (startDate) {
      const isAdmin = !!(request as any).user?.isAdmin
      // Period-Lock: зафиксированная неделя (2 недели назад+ / прошлый месяц) — не-админ не создаёт задачу.
      if (!isAdmin && isLocked(startDate)) {
        return reply.code(400).send({ error: 'Неделя зафиксирована — задачу нельзя создать в закрытой неделе/месяце' })
      }
      // Открытую (inprogress) задачу нельзя завести в уже завершённом (endTime) дне — вне зависимости от недели.
      if (status === 'inprogress') {
        const de = await prisma.dayEntry.findUnique({
          where: { userId_date: { userId: assigneeId, date: new Date(startDate) } },
          select: { endTime: true },
        })
        if (de?.endTime) {
          return reply.code(400).send({ error: 'Рабочий день завершён — создайте задачу на другой день' })
        }
      }
    }

    // ── Гейт «активный день» (не доверяем клиенту): создать СВОЮ задачу сразу «в работе»/«выполненной»
    //    можно только в АКТИВНЫЙ день задачи (её startDate начат и не завершён) — сегодня ИЛИ прошлый день,
    //    который дозаполняешь. Назначение другому и планирование в backlog — без ограничения. Override — админ.
    if (assigneeId === user.id && (status === 'inprogress' || status === 'done')) {
      const creatorIsAdmin = !!(request as any).user?.isAdmin
      if (!creatorIsAdmin) {
        const p2 = (n: number) => String(n).padStart(2, '0')
        const todayStr = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`
        if (!(await isDayActive(user.id, startDate ?? todayStr))) {
          return reply.code(400).send({ error: 'Начните рабочий день, чтобы брать и выполнять задачи' })
        }
      }
    }

    const divisionId = await resolveDivisionId(assigneeId)
    const commonData = {
      title,
      description,
      status: status as any, // строковый литерал → TaskStatus enum
      assignedById: user.id,
      assigneeId,
      deadline: deadline ? new Date(deadline) : null,
      trackId: trackId ?? null,
      stageId: stageId ?? null,
      goalId: goalId ?? null,
      type: type ?? 'task',
      client: client ?? null,
      projectId: projectId ?? null,
      divisionId,
      plannedMinutes: plannedMinutes ?? null,
      actualMinutes: actualMinutes ?? null,
    }

    const task = await prisma.task.create({
      data: {
        ...commonData,
        startDate: effectiveStart,
        repeatRule: repeatRule ?? null,
        repeatUntil: repeatUntil ? new Date(repeatUntil) : null,
        // self-assigned tasks are immediately seen; otherwise notify the assignee
        seenAt: assigneeId === user.id ? new Date() : null,
      },
      select: TASK_SELECT,
    })

    // серия: материализуем экземпляр на каждый день до repeatUntil (cap 90 дней)
    if (repeatRule && repeatUntil) {
      const dates = recurrenceDates(effectiveStart, new Date(repeatUntil), repeatRule)
      if (dates.length) {
        await prisma.task.createMany({
          data: dates.map(d => ({
            ...commonData,
            startDate: d,
            recurringParentId: task.id,
            seenAt: assigneeId === user.id ? new Date() : null,
          })),
        })
        await log(task.id, user.id, 'series_created', { rule: repeatRule, instances: dates.length })
      }
    }

    // auto-add assignee to track if not already a member
    if (trackId && assigneeId !== user.id) {
      const isMember = await prisma.trackMember.findUnique({
        where: { trackId_userId: { trackId, userId: assigneeId } },
      })
      if (!isMember) {
        const isLeader = await prisma.track.findUnique({ where: { id: trackId }, select: { leaderId: true } })
        if (isLeader && isLeader.leaderId !== assigneeId) {
          await prisma.trackMember.create({ data: { trackId, userId: assigneeId, joinedAt: new Date() } })
        }
      }
    }

    await log(task.id, user.id, 'created', {
      assigneeName: assigneeExists.name,
      deadline: deadline ?? null,
    })

    return reply.code(201).send(task)
  })

  // PATCH /tasks/:id — update status, deadline, assignee, title, description
  app.patch('/:id', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string; isAdmin: boolean }
    const { id } = request.params as { id: string }

    const schema = z.object({
      title:       z.string().min(1).optional(),
      description: z.string().optional(),
      status:      z.enum(['backlog', 'inprogress', 'done']).optional(),
      assigneeId:  z.string().uuid().optional(),
      startDate:   z.string().optional(),
      deadline:    z.string().nullable().optional(),
      trackId:     z.string().nullable().optional(),
      stageId:     z.string().nullable().optional(),
      goalId:      z.string().nullable().optional(),  // привязка задачи к стратегической цели
      type:           z.enum(TASK_TYPES).optional(),
      client:         z.string().max(200).nullable().optional(),
      projectId:      z.string().nullable().optional(),
      plannedMinutes: z.number().int().min(0).max(24 * 60).nullable().optional(),
      actualMinutes:  z.number().int().min(0).max(24 * 60).nullable().optional(),
      archived:       z.boolean().optional(),
    })
    const body = schema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })

    const task = await prisma.task.findUnique({
      where: { id },
      select: { assignedById: true, assigneeId: true, status: true, startDate: true, deadline: true, title: true, calendarEventId: true, plannedMinutes: true, actualMinutes: true, assignee: { select: { name: true } } },
    })
    if (!task) return reply.code(404).send({ error: 'Task not found' })

    const isAssignedBy = task.assignedById === user.id
    const isAssignee   = task.assigneeId === user.id
    const canEdit = user.isAdmin || isAssignedBy || isAssignee
    if (!canEdit) return reply.code(403).send({ error: 'Forbidden' })

    if (task.calendarEventId) {
      return reply.code(403).send({ error: 'Задача создана из события — статус определяется автоматически' })
    }

    if (body.data.assigneeId !== undefined && !isAssignedBy && !user.isAdmin) {
      return reply.code(403).send({ error: 'Только автор задачи может менять исполнителя' })
    }

    if (body.data.status !== undefined && !isAssignee && !user.isAdmin) {
      return reply.code(403).send({ error: 'Только исполнитель может менять статус задачи' })
    }

    if (body.data.startDate !== undefined && !isAssignedBy && !user.isAdmin) {
      return reply.code(403).send({ error: 'Только автор задачи может менять дату начала' })
    }

    if (body.data.deadline !== undefined && !isAssignedBy && !user.isAdmin) {
      return reply.code(403).send({ error: 'Только автор задачи может менять дедлайн' })
    }

    const effectiveStart = body.data.startDate ? new Date(body.data.startDate) : task.startDate
    // Валидация «начало ≤ дедлайна» УБРАНА: просроченную задачу переносят на день ПОЗЖЕ дедлайна
    // (startDate > deadline = «просрочено» — валидное состояние). Раньше это блокировало любую правку
    // просроченной задачи (даже смену названия) с ошибкой «дата начала не может быть позже дедлайна».

    const d = body.data

    // ── Server-side guard (не доверяем клиенту): открытую (inprogress) задачу нельзя перенести
    //    startDate в уже ЗАВЕРШЁННЫЙ (endTime) день — иначе в закрытом дне повиснет открытая задача.
    //    Подневного «прошлый день» нет: перенос внутри открытой недели допустим. Зафиксированную
    //    неделю режет отдельный Period-Lock-гейт ниже (isLocked).
    if (d.startDate !== undefined && (d.status ?? task.status) === 'inprogress') {
      const de = await prisma.dayEntry.findUnique({
        where: { userId_date: { userId: task.assigneeId, date: new Date(d.startDate) } },
        select: { endTime: true },
      })
      if (de?.endTime) {
        return reply.code(400).send({ error: 'Рабочий день завершён — перенесите задачу на другой день' })
      }
    }

    // ── Period-Lock (server-side, override только у мастер-админа). Спека — docs/PERIOD-LOCK-2026-08-29.md
    //    Задачи НЕ «замораживаются»: перенести startDate ВПЕРЁД (в open/grace) можно всегда, но:
    if (!user.isAdmin) {
      // 1) нельзя ставить дату начала В зафиксированный день (переносить задачу в прошлое-под-замком);
      if (d.startDate !== undefined && isLocked(d.startDate)) {
        return reply.code(400).send({ error: 'Период зафиксирован — задачу нельзя перенести в закрытую неделю/месяц' })
      }
      // 2) нельзя менять СТАТУС задачи, которая остаётся в зафиксированной неделе (правка истории).
      //    effectiveStart уже учитывает перенос вперёд: если задачу выводят из-под замка — статус менять можно.
      if (d.status !== undefined && isLocked(effectiveStart)) {
        return reply.code(400).send({ error: 'Период зафиксирован — статус задачи в закрытой неделе изменить нельзя (перенесите её на актуальную дату)' })
      }
    }

    // ── Гейт «активный день» (не доверяем клиенту): взять в работу (inprogress) или выполнить (done)
    //    СВОЮ задачу можно только когда АКТИВЕН день, куда она ложится (сегодня при живом взятии, либо
    //    прошлый день, который дозаполняешь). Возврат в backlog / правка прочих полей — без ограничения.
    if (!user.isAdmin && isAssignee && (d.status === 'inprogress' || d.status === 'done')) {
      const p2 = (n: number) => String(n).padStart(2, '0')
      const now2 = new Date()
      const todayStr = `${now2.getFullYear()}-${p2(now2.getMonth() + 1)}-${p2(now2.getDate())}`
      // ТОЛЬКО взятие из пула (backlog→inprogress) без явной даты уводит задачу на СЕГОДНЯ (autoStartToday) —
      // и гейт проверяет сегодня. Снятие галочки (done→inprogress) НЕ переносит: задача остаётся на своём
      // дне → гейт проверяет ЕЁ день (иначе на активном прошлом дне снять галочку не давало).
      const takingToToday = d.status === 'inprogress' && task.status === 'backlog' && d.startDate === undefined
      const gateDay = d.startDate ?? (takingToToday ? todayStr : isoDay(task.startDate))
      if (!(await isDayActive(user.id, gateDay))) {
        return reply.code(400).send({ error: 'Начните рабочий день, чтобы брать и выполнять задачи' })
      }
    }

    // автокопия «план → факт» при завершении (паттерн донора: один ввод закрывает оба в 80% случаев)
    const becomesDone = d.status === 'done' && task.status !== 'done'
    const leavesDone = d.status !== undefined && d.status !== 'done' && task.status === 'done'
    // «взял задачу в работу» → она падает в сегодняшний рабочий набор (если день не задан явно).
    // Централизует связь Обзор⇄канбан⇄Свод: единый источник дня — startDate.
    const becomesInProgress = d.status === 'inprogress' && task.status !== 'inprogress'
    // На СЕГОДНЯ уводим только при ВЗЯТИИ из пула (backlog→inprogress). Снятие галочки (done→inprogress)
    // оставляет задачу на её дне — иначе снятие галочки перекидывало бы задачу на сегодня.
    const autoStartToday = becomesInProgress && task.status === 'backlog' && d.startDate === undefined
    // Переназначил задачу на ДРУГОГО человека → она уходит в его Бэклог (пул), а не в «В работе».
    // Модель: назначенное падает в пул, человек берёт его в работу сам.
    const reassignedToOther = d.assigneeId !== undefined && d.assigneeId !== task.assigneeId
    const autoActual =
      becomesDone && d.actualMinutes === undefined && task.actualMinutes == null && task.plannedMinutes != null
        ? task.plannedMinutes
        : undefined
    const updated = await prisma.task.update({
      where: { id },
      data: {
        ...(d.title       !== undefined && { title: d.title }),
        ...(d.description !== undefined && { description: d.description }),
        ...(d.status      !== undefined && { status: d.status as any }),
        ...(becomesDone && { doneAt: new Date() }),
        ...(leavesDone && { doneAt: null }),
        ...(autoStartToday && { startDate: new Date() }),
        ...(autoActual !== undefined && { actualMinutes: autoActual }),
        ...(d.assigneeId  !== undefined && {
          assigneeId: d.assigneeId,
          divisionId: await resolveDivisionId(d.assigneeId), // отдел следует за исполнителем
          seenAt: null, // new assignee must open the task to clear the notification
        }),
        // сброс в Бэклог перекрывает status/doneAt/startDate выше — получатель берёт задачу в работу сам
        ...(reassignedToOther && { status: 'backlog' as any, doneAt: null }),
        ...(d.startDate   !== undefined && { startDate: new Date(d.startDate) }),
        ...(d.deadline    !== undefined && { deadline: d.deadline ? new Date(d.deadline) : null }),
        ...(d.trackId     !== undefined && { trackId: d.trackId }),
        ...(d.stageId     !== undefined && { stageId: d.stageId }),
        ...(d.goalId      !== undefined && { goalId: d.goalId }),
        ...(d.type        !== undefined && { type: d.type }),
        ...(d.client      !== undefined && { client: d.client }),
        ...(d.projectId   !== undefined && { projectId: d.projectId }),
        ...(d.plannedMinutes !== undefined && { plannedMinutes: d.plannedMinutes }),
        ...(d.actualMinutes  !== undefined && { actualMinutes: d.actualMinutes }),
        ...(d.archived    !== undefined && { archived: d.archived }),
      },
      select: TASK_SELECT,
    })

    // log individual field changes
    if (d.status !== undefined && d.status !== task.status) {
      await log(id, user.id, 'status_changed', {
        from: STATUS_LABELS[task.status] ?? task.status,
        to:   STATUS_LABELS[d.status]    ?? d.status,
      })
    }
    if (d.assigneeId !== undefined && d.assigneeId !== task.assigneeId) {
      const newAssignee = await prisma.user.findUnique({ where: { id: d.assigneeId }, select: { name: true } })
      await log(id, user.id, 'assignee_changed', {
        from: task.assignee.name,
        to:   newAssignee?.name ?? d.assigneeId,
      })
    }
    if (d.deadline !== undefined) {
      const oldD = task.deadline ? task.deadline.toISOString().slice(0, 10) : null
      const newD = d.deadline ? new Date(d.deadline).toISOString().slice(0, 10) : null
      if (oldD !== newD) {
        await log(id, user.id, 'deadline_changed', { from: oldD, to: newD })
      }
    }
    if (d.startDate !== undefined) {
      const oldS = task.startDate.toISOString().slice(0, 10)
      const newS = new Date(d.startDate).toISOString().slice(0, 10)
      if (oldS !== newS) await log(id, user.id, 'start_changed', { from: oldS, to: newS })
    }
    if (d.title !== undefined && d.title !== task.title) {
      await log(id, user.id, 'title_changed', { title: d.title })
    }
    if ((d.plannedMinutes !== undefined && d.plannedMinutes !== task.plannedMinutes) ||
        (d.actualMinutes !== undefined && d.actualMinutes !== task.actualMinutes)) {
      await log(id, user.id, 'minutes_changed', {
        planned: d.plannedMinutes ?? task.plannedMinutes ?? null,
        actual: d.actualMinutes ?? autoActual ?? task.actualMinutes ?? null,
      })
    }
    if (d.description !== undefined) {
      await log(id, user.id, 'description_changed', {})
    }

    // auto-add assignee to track if needed (handles both assignee change and track change)
    const effectiveTrackId = d.trackId !== undefined ? d.trackId : (updated.trackId ?? null)
    const effectiveAssigneeId = d.assigneeId ?? task.assigneeId
    if (effectiveTrackId && effectiveAssigneeId !== user.id) {
      const isMember = await prisma.trackMember.findUnique({
        where: { trackId_userId: { trackId: effectiveTrackId, userId: effectiveAssigneeId } },
      })
      if (!isMember) {
        const tr = await prisma.track.findUnique({ where: { id: effectiveTrackId }, select: { leaderId: true } })
        if (tr && tr.leaderId !== effectiveAssigneeId) {
          await prisma.trackMember.create({ data: { trackId: effectiveTrackId, userId: effectiveAssigneeId, joinedAt: new Date() } }).catch(() => {})
        }
      }
    }

    return applyAutoStatus(updated)
  })

  // DELETE /tasks/:id[?series=future] — series=future дополнительно удаляет будущие экземпляры серии
  app.delete('/:id', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string; isAdmin: boolean }
    const { id } = request.params as { id: string }
    const { series } = request.query as { series?: string }

    const task = await prisma.task.findUnique({
      where: { id },
      select: { assignedById: true, startDate: true, repeatRule: true, recurringParentId: true },
    })
    if (!task) return reply.code(404).send({ error: 'Task not found' })

    if (!user.isAdmin && task.assignedById !== user.id) return reply.code(403).send({ error: 'Forbidden' })

    if (series === 'future') {
      // серия = родитель (repeatRule) или экземпляр (recurringParentId); удаляем незакрытые будущие
      const parentId = task.recurringParentId ?? id
      await prisma.task.deleteMany({
        where: {
          OR: [{ id: parentId }, { recurringParentId: parentId }],
          startDate: { gte: task.startDate },
          status: { not: 'done' },
        },
      })
      return reply.code(204).send()
    }

    await prisma.task.delete({ where: { id } })
    return reply.code(204).send()
  })
}
