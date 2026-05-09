import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tv-shifts/db'
import { authenticate } from '../plugins/auth'
import { requirePermission } from '../config/permissions'

export async function departmentsRoutes(app: FastifyInstance) {

  // GET /departments
  app.get('/', { preHandler: authenticate }, async () => {
    return prisma.department.findMany({
      include: {
        _count: { select: { members: true, wiLinks: true } },
        parent:   { select: { id: true, name: true } },
        children: { select: { id: true, name: true, type: true } },
        members: {
          include: {
            user: { select: { id: true, fullName: true, email: true, tabNumber: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    })
  })

  // GET /departments/:id
  app.get('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const dept = await prisma.department.findUnique({
      where: { id },
      include: {
        parent:   { select: { id: true, name: true } },
        children: { select: { id: true, name: true, type: true } },
        members: {
          include: {
            user: { select: { id: true, fullName: true, email: true, tabNumber: true } },
          },
        },
      },
    })
    if (!dept) return reply.code(404).send({ error: 'Department not found' })
    return dept
  })

  // GET /departments/:id/members
  app.get('/:id/members', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const dept = await prisma.department.findUnique({ where: { id }, select: { id: true } })
    if (!dept) return reply.code(404).send({ error: 'Department not found' })
    return prisma.deptMember.findMany({
      where: { deptId: id },
      include: { user: { select: { id: true, fullName: true, email: true, tabNumber: true } } },
    })
  })

  // GET /departments/:id/board
  // Returns DeptWILink[] grouped by substatus: { not_started, in_progress, done }
  app.get('/:id/board', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const dept = await prisma.department.findUnique({ where: { id }, select: { id: true, name: true } })
    if (!dept) return reply.code(404).send({ error: 'Department not found' })

    const links = await prisma.deptWILink.findMany({
      where: { deptId: id },
      include: {
        workItem: {
          select: {
            id: true, name: true, client: true, format: true, location: true,
            date: true, status: true, notes: true,
            project: { select: { id: true, name: true, status: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    const board: Record<string, typeof links> = {
      not_started: [],
      in_progress: [],
      done: [],
    }
    for (const link of links) {
      board[link.substatus].push(link)
    }
    return board
  })

  // GET /departments/:id/gantt?from=&to=&userId=
  // Returns Tasks assigned to dept members within the date range.
  app.get('/:id/gantt', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const q = z.object({
      from:   z.string().optional(),
      to:     z.string().optional(),
      userId: z.string().optional(),
    }).safeParse(request.query)
    if (!q.success) return reply.code(400).send({ error: 'Invalid query' })

    const dept = await prisma.department.findUnique({ where: { id }, select: { id: true } })
    if (!dept) return reply.code(404).send({ error: 'Department not found' })

    const members = await prisma.deptMember.findMany({
      where: { deptId: id },
      include: { user: { select: { id: true, fullName: true } } },
    })
    const memberUserIds = members.map((m) => m.userId)

    const { from, to, userId } = q.data
    const fromDate = from ? new Date(from) : undefined
    const toDate   = to   ? new Date(to)   : undefined
    const targetIds = userId ? [userId] : memberUserIds

    const [tasks, hrStatuses] = await Promise.all([
      prisma.task.findMany({
        where: {
          ...(targetIds.length > 0
            ? { assignments: { some: { userId: { in: targetIds } } } }
            : { id: 'no-match' }),
          ...(fromDate || toDate ? {
            AND: [
              ...(fromDate ? [{ OR: [{ deadline: { gte: fromDate } }, { deadline: null }] }] : []),
              ...(toDate   ? [{ createdAt: { lte: toDate } }] : []),
            ],
          } : {}),
        },
        include: {
          assignments: { include: { user: { select: { id: true, fullName: true } } } },
          creator:     { select: { id: true, fullName: true } },
        },
        orderBy: [{ deadline: 'asc' }, { createdAt: 'asc' }],
      }),
      targetIds.length > 0
        ? prisma.hRStatus.findMany({
            where: {
              userId: { in: targetIds },
              status: { in: ['approved', 'pending'] as any[] },
              dateFrom: { lte: toDate   ?? new Date('2099-12-31') },
              dateTo:   { gte: fromDate ?? new Date('2000-01-01') },
            },
            select: { id: true, userId: true, type: true, dateFrom: true, dateTo: true, status: true },
          })
        : Promise.resolve([]),
    ])

    return { members: members.map((m) => m.user), tasks, hrStatuses }
  })

  // POST /departments — admin only
  app.post('/', { preHandler: requirePermission('departments:manage') }, async (request, reply) => {
    const body = z.object({
      name:     z.string().min(1),
      type:     z.enum(['production', 'support', 'internal']),
      parentId: z.string().nullable().optional(),
    }).safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })

    const dept = await prisma.department.create({
      data: {
        name:     body.data.name,
        type:     body.data.type as any,
        parentId: body.data.parentId ?? null,
      },
    })
    return reply.code(201).send(dept)
  })

  // PATCH /departments/:id — admin only
  app.patch('/:id', { preHandler: requirePermission('departments:manage') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      name:     z.string().min(1).optional(),
      type:     z.enum(['production', 'support', 'internal']).optional(),
      parentId: z.string().nullable().optional(),
    }).safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })

    const exists = await prisma.department.findUnique({ where: { id }, select: { id: true } })
    if (!exists) return reply.code(404).send({ error: 'Department not found' })

    return prisma.department.update({ where: { id }, data: body.data as any })
  })

  // DELETE /departments/:id — admin only
  app.delete('/:id', { preHandler: requirePermission('departments:manage') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const exists = await prisma.department.findUnique({ where: { id }, select: { id: true } })
    if (!exists) return reply.code(404).send({ error: 'Department not found' })
    await prisma.department.delete({ where: { id } })
    return reply.code(204).send()
  })

  // POST /departments/:id/members — admin only
  app.post('/:id/members', { preHandler: requirePermission('departments:manage') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      userId: z.string().min(1),
      isHead: z.boolean().optional(),
    }).safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input', details: body.error.flatten() })

    const dept = await prisma.department.findUnique({ where: { id }, select: { id: true } })
    if (!dept) return reply.code(404).send({ error: 'Department not found' })

    const member = await prisma.deptMember.upsert({
      where:  { userId_deptId: { userId: body.data.userId, deptId: id } },
      update: { isHead: body.data.isHead ?? false },
      create: { userId: body.data.userId, deptId: id, isHead: body.data.isHead ?? false },
      include: { user: { select: { id: true, fullName: true, email: true } } },
    })
    return reply.code(201).send(member)
  })

  // PATCH /departments/:id/members/:userId — update isHead + sync AppRole
  app.patch('/:id/members/:userId', { preHandler: requirePermission('departments:manage') }, async (request, reply) => {
    const { id: deptId, userId } = request.params as { id: string; userId: string }
    const body = z.object({ isHead: z.boolean() }).safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input' })

    const { isHead } = body.data

    await prisma.deptMember.upsert({
      where:  { userId_deptId: { userId, deptId } },
      update: { isHead },
      create: { userId, deptId, isHead },
    })

    const deptDirectorRole = await prisma.appRole.findFirst({ where: { name: 'dept_director' } })
    if (deptDirectorRole) {
      if (isHead) {
        await prisma.userAppRole.upsert({
          where:  { userId_roleId: { userId, roleId: deptDirectorRole.id } },
          update: {},
          create: { userId, roleId: deptDirectorRole.id },
        })
      } else {
        const otherHeadships = await prisma.deptMember.count({ where: { userId, isHead: true } })
        if (otherHeadships === 0) {
          await prisma.userAppRole.deleteMany({ where: { userId, roleId: deptDirectorRole.id } })
        }
      }
    }

    return { ok: true }
  })

  // DELETE /departments/:id/members/:userId — admin only
  app.delete('/:id/members/:userId', { preHandler: requirePermission('departments:manage') }, async (request, reply) => {
    const { id: deptId, userId } = request.params as { id: string; userId: string }
    await prisma.deptMember.deleteMany({ where: { deptId, userId } })

    // If user is no longer head of any dept, remove dept_director role
    const deptDirectorRole = await prisma.appRole.findFirst({ where: { name: 'dept_director' } })
    if (deptDirectorRole) {
      const otherHeadships = await prisma.deptMember.count({ where: { userId, isHead: true } })
      if (otherHeadships === 0) {
        await prisma.userAppRole.deleteMany({ where: { userId, roleId: deptDirectorRole.id } })
      }
    }

    return reply.code(204).send()
  })
}
