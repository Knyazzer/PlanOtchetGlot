import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@nexus/db'
import { authenticate } from '../plugins/auth'
import { getOrgScope } from '../services/orgScope'
import { hasModule } from '../services/access'

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
