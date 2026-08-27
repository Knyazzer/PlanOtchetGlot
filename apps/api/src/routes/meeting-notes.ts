import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@nexus/db'
import { authenticate } from '../plugins/auth'

// «Доработки к собранию» — заметки уровня департамента на период. Читают в охвате; правит director/admin.
const putSchema = z.object({ deptId: z.string(), periodKey: z.string().regex(/^\d{4}(-Q[1-4])?$/), text: z.string().max(5000) })

async function canManageDept(userId: string, isAdmin: boolean, deptId: string): Promise<boolean> {
  if (isAdmin) return true
  const dept = await prisma.department.findUnique({ where: { id: deptId }, select: { directorId: true } })
  return dept?.directorId === userId
}

export async function meetingNotesRoutes(app: FastifyInstance) {
  // GET /meeting-notes?deptId&periodKey
  app.get('/', { preHandler: authenticate }, async (request) => {
    const { deptId, periodKey } = request.query as { deptId?: string; periodKey?: string }
    if (!deptId || !periodKey) return { text: '' }
    const n = await prisma.meetingNote.findUnique({ where: { deptId_periodKey: { deptId, periodKey } }, select: { text: true } })
    return { text: n?.text ?? '' }
  })

  // PUT /meeting-notes — upsert заметки (director/admin)
  app.put('/', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string; isAdmin: boolean }
    const p = putSchema.safeParse(request.body)
    if (!p.success) return reply.code(400).send({ error: 'validation', details: p.error.flatten() })
    if (!(await canManageDept(user.id, user.isAdmin, p.data.deptId))) return reply.code(403).send({ error: 'Только директор департамента или админ' })
    return prisma.meetingNote.upsert({
      where: { deptId_periodKey: { deptId: p.data.deptId, periodKey: p.data.periodKey } },
      update: { text: p.data.text },
      create: { deptId: p.data.deptId, periodKey: p.data.periodKey, text: p.data.text },
      select: { text: true },
    })
  })
}
