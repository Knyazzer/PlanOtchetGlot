import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tv-shifts/db'
import { requirePermission } from '../config/permissions'

// Auto-trigger: if all DeptWILinks for a WI are done → set WI.status = done → cascade to Project
async function syncWIStatusFromDepts(wiId: string) {
  const links = await prisma.deptWILink.findMany({
    where: { wiId },
    select: { substatus: true },
  })
  if (links.length === 0) return

  const allDone = links.every((l) => l.substatus === 'done')
  if (!allDone) return

  const wi = await prisma.workItem.findUnique({
    where: { id: wiId },
    select: { status: true, projectId: true },
  })
  if (!wi || (wi.status as string) === 'done') return

  await prisma.workItem.update({ where: { id: wiId }, data: { status: 'done' as any } })

  if (!wi.projectId) return

  const siblings = await prisma.workItem.findMany({
    where: { projectId: wi.projectId, NOT: { source: 'separator' as any } },
    select: { status: true },
  })
  if (siblings.every((w) => (w.status as string) === 'done')) {
    await prisma.project.update({ where: { id: wi.projectId }, data: { status: 'done' as any } })
  }
}

export async function deptWiLinksRoutes(app: FastifyInstance) {

  // PATCH /dept-wi-links/:id/substatus
  app.patch('/:id/substatus', { preHandler: requirePermission('projects:write') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      substatus: z.enum(['not_started', 'in_progress', 'done']),
    }).safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })

    const link = await prisma.deptWILink.findUnique({ where: { id }, select: { id: true, wiId: true } })
    if (!link) return reply.code(404).send({ error: 'DeptWILink not found' })

    const updated = await prisma.deptWILink.update({
      where: { id },
      data: { substatus: body.data.substatus as any },
    })

    if (body.data.substatus === 'done') {
      await syncWIStatusFromDepts(link.wiId)
    }

    return updated
  })

  // DELETE /dept-wi-links/:id
  app.delete('/:id', { preHandler: requirePermission('projects:write') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const link = await prisma.deptWILink.findUnique({ where: { id }, select: { id: true } })
    if (!link) return reply.code(404).send({ error: 'DeptWILink not found' })
    await prisma.deptWILink.delete({ where: { id } })
    return reply.code(204).send()
  })
}
