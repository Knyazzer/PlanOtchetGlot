import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@nexus/db'
import { authenticate, requireRole } from '../plugins/auth'

const deptCreateSchema = z.object({
  name: z.string().min(1),
  color: z.string().optional(),
  directorId: z.string().nullish(),
})
const deptPatchSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional(),
  directorId: z.string().nullish(),
})
const divCreateSchema = z.object({
  deptId: z.string().min(1),
  name: z.string().min(1),
  headId: z.string().nullish(),
})
const divPatchSchema = z.object({
  name: z.string().min(1).optional(),
  headId: z.string().nullish(),
})
const membershipCreateSchema = z.object({
  userId: z.string().min(1),
  divId: z.string().min(1),
  position: z.string(),
})
const membershipPatchSchema = z.object({
  userId: z.string().min(1),
  divId: z.string().min(1),
  position: z.string().optional(),
  newDivId: z.string().optional(),
})
const membershipDeleteSchema = z.object({
  userId: z.string().min(1),
  divId: z.string().min(1),
})

export async function structureRoutes(app: FastifyInstance) {
  // Чтение — всем аутентифицированным (нужно для «Команды»); мутации — только admin.
  const adminOnly = [authenticate, requireRole('admin')]
  // ── GET /structure — full tree ──────────────────────────────────────────────
  app.get('/', { preHandler: [authenticate] }, async () => {
    const departments = await prisma.department.findMany({
      include: {
        director: { select: { id: true, name: true, tabNumber: true, isActive: true, position: true } },
        divisions: {
          include: {
            head: { select: { id: true, name: true, tabNumber: true, isActive: true, position: true } },
            memberships: {
              where: { user: { isActive: true } },
              include: {
                user: { select: { id: true, name: true, tabNumber: true, position: true } },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    })
    // Null out directors/heads who are no longer active
    return departments.map(d => ({
      ...d,
      director: d.director?.isActive ? d.director : null,
      divisions: d.divisions.map(div => ({
        ...div,
        head: div.head?.isActive ? div.head : null,
      })),
    }))
  })

  // ── POST /structure/departments ─────────────────────────────────────────────
  app.post('/departments', { preHandler: adminOnly }, async (req, reply) => {
    const parsed = deptCreateSchema.safeParse(req.body)
    if (!parsed.success) return reply.status(400).send({ error: 'validation', details: parsed.error.flatten() })
    const { name, color, directorId } = parsed.data
    const dept = await prisma.department.create({
      data: { name, color: color ?? '#1e40af', directorId: directorId ?? null },
    })
    return dept
  })

  // ── PATCH /structure/departments/:id ────────────────────────────────────────
  app.patch<{ Params: { id: string } }>(
    '/departments/:id',
    { preHandler: adminOnly },
    async (req, reply) => {
      const parsed = deptPatchSchema.safeParse(req.body)
      if (!parsed.success) return reply.status(400).send({ error: 'validation', details: parsed.error.flatten() })
      const { name, color, directorId } = parsed.data
      const dept = await prisma.department.update({
        where: { id: req.params.id },
        data: {
          ...(name !== undefined && { name }),
          ...(color !== undefined && { color }),
          ...(directorId !== undefined && { directorId: directorId ?? null }),
        },
      })
      return dept
    },
  )

  // ── DELETE /structure/departments/:id ───────────────────────────────────────
  app.delete<{ Params: { id: string } }>(
    '/departments/:id',
    { preHandler: adminOnly },
    async (req) => {
      await prisma.department.delete({ where: { id: req.params.id } })
      return { ok: true }
    },
  )

  // ── POST /structure/divisions ───────────────────────────────────────────────
  app.post('/divisions', { preHandler: adminOnly }, async (req, reply) => {
    const parsed = divCreateSchema.safeParse(req.body)
    if (!parsed.success) return reply.status(400).send({ error: 'validation', details: parsed.error.flatten() })
    const { deptId, name, headId } = parsed.data
    const div = await prisma.division.create({
      data: { deptId, name, headId: headId ?? null },
    })
    return div
  })

  // ── PATCH /structure/divisions/:id ──────────────────────────────────────────
  app.patch<{ Params: { id: string } }>(
    '/divisions/:id',
    { preHandler: adminOnly },
    async (req, reply) => {
      const parsed = divPatchSchema.safeParse(req.body)
      if (!parsed.success) return reply.status(400).send({ error: 'validation', details: parsed.error.flatten() })
      const { name, headId } = parsed.data
      const div = await prisma.division.update({
        where: { id: req.params.id },
        data: {
          ...(name !== undefined && { name }),
          ...(headId !== undefined && { headId: headId ?? null }),
        },
      })
      return div
    },
  )

  // ── DELETE /structure/divisions/:id ─────────────────────────────────────────
  app.delete<{ Params: { id: string } }>(
    '/divisions/:id',
    { preHandler: adminOnly },
    async (req) => {
      await prisma.division.delete({ where: { id: req.params.id } })
      return { ok: true }
    },
  )

  // ── POST /structure/memberships — add user to division ──────────────────────
  app.post('/memberships', { preHandler: adminOnly }, async (req, reply) => {
    const parsed = membershipCreateSchema.safeParse(req.body)
    if (!parsed.success) return reply.status(400).send({ error: 'validation', details: parsed.error.flatten() })
    const { userId, divId, position } = parsed.data
    const m = await prisma.userDivision.create({ data: { userId, divId, position } })
    return m
  })

  // ── PATCH /structure/memberships — update position or move division ─────────
  app.patch('/memberships', { preHandler: adminOnly }, async (req, reply) => {
    const parsed = membershipPatchSchema.safeParse(req.body)
    if (!parsed.success) return reply.status(400).send({ error: 'validation', details: parsed.error.flatten() })
    const { userId, divId, position, newDivId } = parsed.data

    if (newDivId && newDivId !== divId) {
      // Move to another division: delete old, create new
      await prisma.userDivision.delete({ where: { userId_divId: { userId, divId } } })
      const m = await prisma.userDivision.create({
        data: { userId, divId: newDivId, position: position ?? '' },
      })
      return m
    }

    const m = await prisma.userDivision.update({
      where: { userId_divId: { userId, divId } },
      data: { ...(position !== undefined && { position }) },
    })
    return m
  })

  // ── DELETE /structure/memberships ───────────────────────────────────────────
  app.delete('/memberships', { preHandler: adminOnly }, async (req, reply) => {
    const parsed = membershipDeleteSchema.safeParse(req.body)
    if (!parsed.success) return reply.status(400).send({ error: 'validation', details: parsed.error.flatten() })
    const { userId, divId } = parsed.data
    await prisma.userDivision.delete({ where: { userId_divId: { userId, divId } } })
    return { ok: true }
  })

  // ── POST /structure/migrate-from-sheets ─────────────────────────────────────
  // One-time: reads dept/subDept/position from users, builds departments/divisions/memberships.
  // Idempotent — skips existing names.
  app.post('/migrate-from-sheets', { preHandler: adminOnly }, async () => {
    const users = await prisma.user.findMany({
      where: { userType: 'staff', isActive: true, tabNumber: { not: null }, isSystemAccount: false },
      select: { id: true, department: true, subDept: true, position: true },
    })

    const deptMap = new Map<string, string>() // name → id
    const divMap  = new Map<string, string>() // `${deptId}::${divName}` → id

    for (const u of users) {
      const deptName = u.department?.trim()
      if (!deptName) continue

      // Get or create department
      if (!deptMap.has(deptName)) {
        const existing = await prisma.department.findFirst({ where: { name: deptName } })
        if (existing) {
          deptMap.set(deptName, existing.id)
        } else {
          const COLORS = ['#1e40af','#065f46','#7c3aed','#9a3412','#0f766e','#be185d','#b45309','#374151']
          const created = await prisma.department.create({
            data: { name: deptName, color: COLORS[deptMap.size % COLORS.length] },
          })
          deptMap.set(deptName, created.id)
        }
      }
      const deptId = deptMap.get(deptName)!

      const divName = u.subDept?.trim() || 'Общий'
      const divKey  = `${deptId}::${divName}`

      // Get or create division
      if (!divMap.has(divKey)) {
        const existing = await prisma.division.findFirst({ where: { deptId, name: divName } })
        if (existing) {
          divMap.set(divKey, existing.id)
        } else {
          const created = await prisma.division.create({ data: { deptId, name: divName } })
          divMap.set(divKey, created.id)
        }
      }
      const divId = divMap.get(divKey)!

      // Add membership if not exists
      const existing = await prisma.userDivision.findUnique({
        where: { userId_divId: { userId: u.id, divId } },
      })
      if (!existing) {
        await prisma.userDivision.create({
          data: { userId: u.id, divId, position: u.position ?? '' },
        })
      }
    }

    return { ok: true, depts: deptMap.size, divs: divMap.size }
  })
}
