import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@nexus/db'
import { authenticate, requireRole } from '../plugins/auth'
import { MODULE_REGISTRY } from '../services/access'

// Админ-экран «Роли и доступы» (RBAC-MODEL §5.3): выдача модулей департаментам.
// Реестр модулей — в коде; БД хранит только гранты (deptId × moduleKey × editLevel).

const grantSchema = z.object({
  deptId: z.string().min(1),
  moduleKey: z.string().min(1),
  // null → отозвать грант
  editLevel: z.enum(['member', 'head', 'director']).nullable(),
})

export async function accessRoutes(app: FastifyInstance) {
  const adminOnly = [authenticate, requireRole('admin')]

  // ── GET /access/registry — реестр модулей (из кода) ─────────────────────────
  app.get('/registry', { preHandler: adminOnly }, async () => {
    return Object.entries(MODULE_REGISTRY).map(([key, m]) => ({
      key, name: m.name, group: m.group, readonly: m.readonly ?? false,
    }))
  })

  // ── GET /access/grants — департаменты с их грантами ─────────────────────────
  app.get('/grants', { preHandler: adminOnly }, async () => {
    const departments = await prisma.department.findMany({
      select: {
        id: true, name: true,
        modules: { select: { moduleKey: true, editLevel: true } },
        divisions: { select: { memberships: { select: { userId: true } } } },
      },
      orderBy: { name: 'asc' },
    })
    return departments.map(d => ({
      id: d.id,
      name: d.name,
      employeeCount: new Set(d.divisions.flatMap(v => v.memberships.map(m => m.userId))).size,
      grants: d.modules,
    }))
  })

  // ── PUT /access/grants — выдать/изменить/отозвать модуль департаменту ────────
  app.put('/grants', { preHandler: adminOnly }, async (req, reply) => {
    const parsed = grantSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'validation', details: parsed.error.flatten() })
    const { deptId, moduleKey, editLevel } = parsed.data

    if (!MODULE_REGISTRY[moduleKey]) return reply.code(400).send({ error: `Неизвестный модуль: ${moduleKey}` })
    const dept = await prisma.department.findUnique({ where: { id: deptId }, select: { id: true } })
    if (!dept) return reply.code(404).send({ error: 'Department not found' })

    if (editLevel === null) {
      await prisma.departmentModule.deleteMany({ where: { deptId, moduleKey } })
      return reply.code(204).send()
    }
    return prisma.departmentModule.upsert({
      where: { deptId_moduleKey: { deptId, moduleKey } },
      update: { editLevel: editLevel as never },
      create: { deptId, moduleKey, editLevel: editLevel as never },
      select: { deptId: true, moduleKey: true, editLevel: true },
    })
  })
}
