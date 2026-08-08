import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@nexus/db'
import { authenticate } from '../plugins/auth'
import { getOrgScope } from '../services/orgScope'
import { hasModule } from '../services/access'
import { dayFormatsAt } from './day-entries'

const pad2 = (n: number) => String(n).padStart(2, '0')
const WD_FIELD = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

// График работы сотрудника (HR): недельный паттерн типов дня + часы. Прогнозная
// конфигурация — даёт «тип дня по умолчанию» (подсказка в кабинете/сводке).
// Факты — в DayEntry; Свод/аналитика считают только их. Спека: docs/superpowers/specs/2026-08-04-hr-schedule-and-status.md

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const FMT_RE = /^[a-z_]+$/  // ключ формата дня или 'dayoff'

const scheduleSchema = z.object({
  mon: z.string().regex(FMT_RE), tue: z.string().regex(FMT_RE), wed: z.string().regex(FMT_RE),
  thu: z.string().regex(FMT_RE), fri: z.string().regex(FMT_RE),
  sat: z.string().regex(FMT_RE), sun: z.string().regex(FMT_RE),
  workStart: z.string().regex(TIME_RE),
  workEnd: z.string().regex(TIME_RE),
  breakMin: z.number().int().min(0).max(24 * 60).optional(),
})

const SEL = {
  userId: true, mon: true, tue: true, wed: true, thu: true, fri: true, sat: true, sun: true,
  workStart: true, workEnd: true, breakMin: true, updatedAt: true,
} as const

export async function workScheduleRoutes(app: FastifyInstance) {
  // ── GET /work-schedule/me — свой график (null → клиент берёт дефолт 5/2) ──────
  app.get('/me', { preHandler: authenticate }, async (req) => {
    const user = (req as any).user as { id: string }
    return prisma.workSchedule.findUnique({ where: { userId: user.id }, select: SEL })
  })

  // ── GET /work-schedule/presence — присутствие штата на сегодня (Пульс «кто работает») ──
  // Из сегодняшнего DayEntry (факт) + графика: работает / закончил / отсутствует / по графику / выходной.
  app.get('/presence', { preHandler: authenticate }, async () => {
    const now = new Date()
    const todayYMD = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
    const wkField = WD_FIELD[new Date(todayYMD + 'T00:00:00').getDay()]

    const members = await prisma.user.findMany({
      where: { isActive: true, isSystemAccount: false, userType: 'staff' },
      select: { id: true, name: true, position: true, department: true },
      orderBy: { name: 'asc' },
    })
    const ids = members.map(m => m.id)
    const [entries, schedules, formats] = await Promise.all([
      prisma.dayEntry.findMany({ where: { userId: { in: ids }, date: new Date(todayYMD) }, select: { userId: true, dayFormat: true, place: true, startTime: true, endTime: true } }),
      prisma.workSchedule.findMany({ where: { userId: { in: ids } } }),
      dayFormatsAt(new Date(todayYMD)),
    ])
    const entryBy = new Map(entries.map(e => [e.userId, e]))
    const schedBy = new Map(schedules.map(s => [s.userId, s]))

    return members.map(m => {
      const e = entryBy.get(m.id)
      const sched = schedBy.get(m.id) as any
      const PLACE_KEYS = ['office', 'remote', 'project', 'trip']
      let state: 'working' | 'finished' | 'absent' | 'expected' | 'off' = 'off'
      let label = '—'
      let dayType: string | null = null
      let place: string | null = null
      if (e) {
        const fmt = formats.get(e.dayFormat)
        dayType = e.dayFormat
        place = e.place ?? null
        if (e.startTime && !e.endTime) { state = 'working'; label = 'В работе' }
        else if (e.startTime && e.endTime) { state = 'finished'; label = 'Закончил день' }
        else if (fmt && !fmt.isWork) { state = 'absent'; label = fmt.label }
        else { state = 'expected'; label = fmt?.label ?? 'Рабочий день' }
      } else if (sched) {
        const key = sched[wkField] as string          // план: место (office/remote) или 'weekend'
        const fmt = formats.get(key)
        if (PLACE_KEYS.includes(key)) { dayType = 'working'; place = key; state = 'expected'; label = 'По графику' }
        else if (fmt && !fmt.isWork) { dayType = key; state = 'off'; label = fmt.label }
        else { dayType = 'working'; state = 'expected'; label = 'По графику' }
      }
      return { userId: m.id, name: m.name, position: m.position, department: m.department, state, label, dayType, place }
    })
  })

  // ── GET /work-schedule/:userId — чужой график по орг-охвату (HR/руковод/директор/админ) ─
  app.get<{ Params: { userId: string } }>('/:userId', { preHandler: authenticate }, async (req, reply) => {
    const user = (req as any).user as { id: string; isAdmin: boolean }
    const { userId } = req.params
    if (userId !== user.id && !user.isAdmin) {
      const scope = await getOrgScope(user.id)
      if (!scope.visibleUserIds.includes(userId)) return reply.code(403).send({ error: 'Forbidden' })
    }
    return prisma.workSchedule.findUnique({ where: { userId }, select: SEL })
  })

  // ── PUT /work-schedule/:userId — задать/править график (admin или HR-модуль) ──
  app.put<{ Params: { userId: string } }>('/:userId', { preHandler: authenticate }, async (req, reply) => {
    const user = (req as any).user as { id: string; isAdmin: boolean }
    const { userId } = req.params
    const canManage = user.isAdmin
      || await hasModule(user.id, user.isAdmin, 'hr.orgstructure', 'edit')
      || await hasModule(user.id, user.isAdmin, 'hr.absences', 'edit')
    if (!canManage) return reply.code(403).send({ error: 'Forbidden' })

    const parsed = scheduleSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'validation', details: parsed.error.flatten() })

    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!target) return reply.code(404).send({ error: 'User not found' })

    const d = parsed.data
    return prisma.workSchedule.upsert({
      where: { userId },
      update: { ...d, breakMin: d.breakMin ?? 0 },
      create: { userId, ...d, breakMin: d.breakMin ?? 0 },
      select: SEL,
    })
  })
}
