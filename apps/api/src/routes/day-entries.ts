import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { prisma } from '@nexus/db'
import { authenticate } from '../plugins/auth'
import { getOrgScope } from '../services/orgScope'
import { hasModule } from '../services/access'
import { monthProduction, businessDays } from '../services/calendarRf'
import { reconcileLeaveDay, LEAVE_FORMATS } from './requests'

// Управление справочником форматов дня — admin ИЛИ HR (модуль hr.orgstructure/hr.absences).
async function assertFormatManager(req: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const user = (req as any).user as { id: string; isAdmin: boolean }
  if (user.isAdmin) return true
  if (await hasModule(user.id, user.isAdmin, 'hr.orgstructure', 'edit')) return true
  if (await hasModule(user.id, user.isAdmin, 'hr.absences', 'edit')) return true
  reply.code(403).send({ error: 'Forbidden' })
  return false
}

// День сотрудника: формат + время. Задачи дня живут в Task (startDate = дата).
// Право правки: только сам сотрудник свой день (Q-DAY-2); admin — manage по запросу.
// Отсутствия другим заносит HR через CalendarEntry (hr_*) — отдельный механизм.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

const upsertSchema = z.object({
  date: z.string().regex(DATE_RE),
  dayFormat: z.string().min(1),                                  // СТАТУС дня: working|weekend|vacation|sick|dayoff
  place: z.enum(['office', 'remote', 'project', 'trip']).nullish(), // где работал (null — не работал)
  startTime: z.string().regex(TIME_RE).nullish(),
  endTime: z.string().regex(TIME_RE).nullish(),
  breakMin: z.number().int().min(0).max(24 * 60).optional(),
})

const periodSchema = z.object({
  from: z.string().regex(DATE_RE),
  to: z.string().regex(DATE_RE),
  dayFormat: z.string().min(1),
  keepFilled: z.boolean().optional(), // «не трогать уже заполненные»
})

const listQuerySchema = z.object({
  from: z.string().regex(DATE_RE),
  to: z.string().regex(DATE_RE),
  userId: z.string().optional(),
})

export function parseTimeMinutes(t?: string | null): number | null {
  if (!t || !TIME_RE.test(t)) return null
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

// Формула донора: MAX(0, end − start − break) (аудит §6, dayEntryDomain.js:109).
// Ночная смена: если конец ≤ начала — смена перешла через полночь, конец на след. сутки (+24ч).
export function workMinutes(e: { startTime?: string | null; endTime?: string | null; breakMin?: number | null }): number {
  const s = parseTimeMinutes(e.startTime)
  let en = parseTimeMinutes(e.endTime)
  if (s == null || en == null) return 0
  if (en < s) en += 24 * 60
  return Math.max(0, en - s - (e.breakMin ?? 0))
}

/** Актуальная версия каждого формата на дату (версионирование: прошлое по старым правилам). */
export async function dayFormatsAt(date: Date) {
  const versions = await prisma.dayFormatVersion.findMany({
    where: { effectiveFrom: { lte: date } },
    orderBy: [{ key: 'asc' }, { effectiveFrom: 'desc' }],
  })
  const map = new Map<string, (typeof versions)[number]>()
  for (const v of versions) if (!map.has(v.key)) map.set(v.key, v)
  return map
}

async function resolveDivisionId(userId: string): Promise<string | null> {
  const m = await prisma.userDivision.findFirst({ where: { userId }, select: { divId: true } })
  return m?.divId ?? null
}

const DAY_SELECT = {
  id: true, userId: true, divisionId: true, date: true, dayFormat: true, place: true,
  startTime: true, endTime: true, breakMin: true, updatedAt: true,
} as const

export async function dayEntriesRoutes(app: FastifyInstance) {
  // ── GET /day-entries/formats — справочник форматов (актуальные версии на сегодня) ──
  app.get('/formats', { preHandler: authenticate }, async () => {
    const map = await dayFormatsAt(new Date())
    return [...map.values()].filter(v => v.active).map(v => ({ key: v.key, label: v.label, isWork: v.isWork, score: v.score }))
  })

  // ── GET /day-entries/formats/versions — вся история версий (admin/HR) ─
  app.get('/formats/versions', { preHandler: authenticate }, async (req, reply) => {
    if (!(await assertFormatManager(req, reply))) return
    return prisma.dayFormatVersion.findMany({
      orderBy: [{ key: 'asc' }, { effectiveFrom: 'desc' }],
      select: { id: true, key: true, label: true, isWork: true, score: true, active: true, effectiveFrom: true },
    })
  })

  // ── POST /day-entries/formats — правка формата: новая версия с текущего периода ─
  // Q-DAY-5: прошлые периоды считаются по старым правилам; изменения действуют
  // с 1-го числа текущего месяца (версия на эту дату обновляется, не плодится).
  app.post('/formats', { preHandler: authenticate }, async (req, reply) => {
    if (!(await assertFormatManager(req, reply))) return
    const schema = z.object({
      key: z.string().min(1).max(50).regex(/^[a-z_]+$/),
      label: z.string().min(1).max(100),
      isWork: z.boolean(),
      score: z.number().min(0).max(10).nullable(),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'validation', details: parsed.error.flatten() })
    const { key, label, isWork, score } = parsed.data

    const now = new Date()
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    // active:true — правка/добавление возвращает формат в использование (если был снят)
    const version = await prisma.dayFormatVersion.upsert({
      where: { key_effectiveFrom: { key, effectiveFrom: periodStart } },
      update: { label, isWork, score, active: true },
      create: { key, label, isWork, score, active: true, effectiveFrom: periodStart },
      select: { id: true, key: true, label: true, isWork: true, score: true, active: true, effectiveFrom: true },
    })
    return reply.code(201).send(version)
  })

  // ── DELETE /day-entries/formats/:key — умное удаление формата ─────────────────
  // Не используется в днях → удаляем все версии. Используется → «снимаем с
  // использования» (версия текущего месяца active=false; прошлые записи считаются
  // по активным версиям прошлых периодов — Q-DAY-5, история цела).
  app.delete('/formats/:key', { preHandler: authenticate }, async (req, reply) => {
    if (!(await assertFormatManager(req, reply))) return
    const { key } = req.params as { key: string }
    const used = await prisma.dayEntry.count({ where: { dayFormat: key } })

    if (used === 0) {
      const del = await prisma.dayFormatVersion.deleteMany({ where: { key } })
      if (del.count === 0) return reply.code(404).send({ error: 'Формат не найден' })
      return { deleted: true, key }
    }

    // используется → retire: версия текущего месяца active=false, веса берём из последней
    const latest = (await dayFormatsAt(new Date())).get(key)
    if (!latest) return reply.code(404).send({ error: 'Формат не найден' })
    const now = new Date()
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    await prisma.dayFormatVersion.upsert({
      where: { key_effectiveFrom: { key, effectiveFrom: periodStart } },
      update: { active: false },
      create: { key, label: latest.label, isWork: latest.isWork, score: latest.score, active: false, effectiveFrom: periodStart },
    })
    return { retired: true, key, usedBy: used }
  })

  // ── GET /day-entries/production?month=YYYY-MM — производственная сводка месяца (РФ) + квартал ──
  app.get('/production', { preHandler: authenticate }, async (req, reply) => {
    const month = (req.query as { month?: string }).month
    const m = month && /^\d{4}-\d{2}$/.test(month) ? month : new Date().toISOString().slice(0, 7)
    const [y, mo] = m.split('-').map(Number)
    if (mo < 1 || mo > 12) return reply.code(400).send({ error: 'bad month' })

    // квартал месяца + обратный отсчёт до его конца (от сегодня)
    const quarter = Math.floor((mo - 1) / 3) + 1
    const qEnd = new Date(Date.UTC(y, quarter * 3, 0)) // последний день последнего месяца квартала
    const now = new Date()
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    const quarterDaysLeft = Math.max(0, Math.round((qEnd.getTime() - todayUTC.getTime()) / 86_400_000))
    const quarterWorkDaysLeft = todayUTC <= qEnd ? businessDays(todayUTC, qEnd) : 0
    const qEndStr = qEnd.toISOString().slice(0, 10)

    return { ...monthProduction(y, mo - 1), quarter, quarterEnd: qEndStr, quarterDaysLeft, quarterWorkDaysLeft }
  })

  // ── GET /day-entries?from&to[&userId] — свои дни; чужие — по орг-охвату ──────
  app.get('/', { preHandler: authenticate }, async (req, reply) => {
    const user = (req as any).user as { id: string; isAdmin: boolean }
    const parsed = listQuerySchema.safeParse(req.query)
    if (!parsed.success) return reply.code(400).send({ error: 'validation', details: parsed.error.flatten() })
    const { from, to, userId } = parsed.data

    const targetId = userId ?? user.id
    if (targetId !== user.id && !user.isAdmin) {
      const scope = await getOrgScope(user.id)
      if (!scope.visibleUserIds.includes(targetId)) return reply.code(403).send({ error: 'Forbidden' })
    }

    const query = {
      where: { userId: targetId, date: { gte: new Date(from), lte: new Date(to) } },
      select: DAY_SELECT,
      orderBy: { date: 'asc' as const },
    }
    const rows = await prisma.dayEntry.findMany(query)

    // Самолечение «отпуска-сироты»: leave-дни без активной одобренной заявки сбрасываем
    // к рабочему статусу (идемпотентно). Дёшево: реконсиляция только для дней-отсутствий.
    const leaveDays = rows.filter(r => LEAVE_FORMATS.has(r.dayFormat))
    if (leaveDays.length) {
      let fixed = false
      for (const r of leaveDays) {
        if (await reconcileLeaveDay(targetId, r.date.toISOString().slice(0, 10))) fixed = true
      }
      if (fixed) return prisma.dayEntry.findMany(query)
    }
    return rows
  })

  // ── PUT /day-entries — upsert СВОЕГО дня ─────────────────────────────────────
  app.put('/', { preHandler: authenticate }, async (req, reply) => {
    const user = (req as any).user as { id: string }
    const parsed = upsertSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'validation', details: parsed.error.flatten() })
    const { date, dayFormat, place, startTime, endTime, breakMin } = parsed.data

    // Модель «место+статус» (DAY-STATUS-MODEL): dayFormat = статус дня. Канонические
    // статусы (после миграции dayentry_place_split) принимаем всегда; прочие значения
    // валидируем против настраиваемых форматов дня.
    const DAY_STATUSES = new Set(['working', 'weekend', 'vacation', 'sick', 'dayoff'])
    const formats = await dayFormatsAt(new Date(date))
    const fmt = formats.get(dayFormat)
    if (!DAY_STATUSES.has(dayFormat) && (!fmt || !fmt.active))
      return reply.code(400).send({ error: `Неизвестный статус дня: ${dayFormat}` })

    const divisionId = await resolveDivisionId(user.id) // снапшот отдела на момент записи
    const dateObj = new Date(date)
    // Upsert дня + аудит смены СТАТУСА — АТОМАРНО: читаем прежний dayFormat ДО upsert и,
    // если статус реально изменился, пишем DayEntryLog в той же транзакции (либо всё, либо ничего).
    const entry = await prisma.$transaction(async (tx) => {
      const prev = await tx.dayEntry.findUnique({
        where: { userId_date: { userId: user.id, date: dateObj } },
        select: { dayFormat: true },
      })
      const saved = await tx.dayEntry.upsert({
        where: { userId_date: { userId: user.id, date: dateObj } },
        update: { dayFormat, place: place ?? null, startTime: startTime ?? null, endTime: endTime ?? null, breakMin: breakMin ?? 0 },
        create: {
          userId: user.id, divisionId, date: dateObj, dayFormat, place: place ?? null,
          startTime: startTime ?? null, endTime: endTime ?? null, breakMin: breakMin ?? 0,
        },
        select: DAY_SELECT,
      })
      // фиксируем только реальную смену статуса (первое заполнение дня — тоже смена: null → newFormat)
      const oldFormat = prev?.dayFormat ?? null
      if (oldFormat !== dayFormat) {
        await tx.dayEntryLog.create({
          data: { userId: user.id, date: dateObj, changedBy: user.id, oldFormat, newFormat: dayFormat },
        })
      }
      return saved
    })
    return entry
  })

  // ── POST /day-entries/apply-period — формат на диапазон (отпуск/командировка) ─
  app.post('/apply-period', { preHandler: authenticate }, async (req, reply) => {
    const user = (req as any).user as { id: string }
    const parsed = periodSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'validation', details: parsed.error.flatten() })
    const { from, to, dayFormat, keepFilled } = parsed.data

    const start = new Date(from)
    const end = new Date(to)
    if (start > end) return reply.code(400).send({ error: 'from > to' })
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
    if (days > 370) return reply.code(400).send({ error: 'Период больше 370 дней' }) // guard донора

    const formats = await dayFormatsAt(start)
    const fmt = formats.get(dayFormat)
    if (!fmt || !fmt.active) return reply.code(400).send({ error: `Неизвестный формат дня: ${dayFormat}` })

    const divisionId = await resolveDivisionId(user.id)
    let applied = 0
    let skipped = 0
    for (let i = 0; i < days; i++) {
      const date = new Date(start.getTime() + i * 86_400_000)
      const existing = await prisma.dayEntry.findUnique({
        where: { userId_date: { userId: user.id, date } },
        select: { id: true, dayFormat: true },
      })
      if (existing && keepFilled) { skipped++; continue }
      await prisma.dayEntry.upsert({
        where: { userId_date: { userId: user.id, date } },
        update: { dayFormat, startTime: null, endTime: null, breakMin: 0 },
        create: { userId: user.id, divisionId, date, dayFormat },
      })
      applied++
    }
    return { applied, skipped }
  })

  // ── DELETE /day-entries/:date — очистить СВОЙ день ───────────────────────────
  app.delete<{ Params: { date: string } }>('/:date', { preHandler: authenticate }, async (req, reply) => {
    const user = (req as any).user as { id: string }
    if (!DATE_RE.test(req.params.date)) return reply.code(400).send({ error: 'bad date' })
    await prisma.dayEntry.deleteMany({ where: { userId: user.id, date: new Date(req.params.date) } })
    return reply.code(204).send()
  })
}
