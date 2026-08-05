import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@nexus/db'
import { authenticate } from '../plugins/auth'
import { randomUUID } from 'crypto'

const MEMBER_SELECT = { id: true, name: true } as const

const STAGE_TASK_SELECT = {
  id: true, title: true, status: true, deadline: true,
  assignee:   { select: MEMBER_SELECT },
  assignedBy: { select: MEMBER_SELECT },
} as const

const STAGE_SELECT = {
  id: true, title: true, order: true,
  tasks: { select: STAGE_TASK_SELECT, orderBy: [{ status: 'asc' as const }, { createdAt: 'desc' as const }] },
}

// For list view: only status needed to compute progress
const STAGE_SUMMARY_SELECT = {
  id: true, order: true,
  tasks: { select: { status: true } },
} as const

const TRACK_SELECT = {
  id: true,
  title: true,
  description: true,
  type: true,
  status: true,
  clientName: true,
  projectName: true,
  deadline: true,
  leaderId: true,
  workItemId: true,
  createdAt: true,
  updatedAt: true,
  leader:   { select: MEMBER_SELECT },
  members:  { select: { user: { select: MEMBER_SELECT }, joinedAt: true } },
  tasks:    { select: { status: true } },
  stages:   { select: STAGE_SUMMARY_SELECT, orderBy: { order: 'asc' as const } },
  chat:     { select: { id: true } },   // §9: чат трека
} as const

export async function tracksRoutes(app: FastifyInstance) {

  // GET /tracks — tracks where user is leader or member
  app.get('/', { preHandler: authenticate }, async (request) => {
    const user = (request as any).user as { id: string; isAdmin: boolean }

    const where = user.isAdmin ? {} : {
      OR: [
        { leaderId: user.id },
        { members: { some: { userId: user.id } } },
      ],
    }

    return prisma.track.findMany({
      where,
      select: TRACK_SELECT,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    })
  })

  // GET /tracks/:id
  app.get('/:id', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string; isAdmin: boolean }
    const { id } = request.params as { id: string }

    const access = await prisma.track.findUnique({
      where: { id },
      select: { leaderId: true, members: { select: { userId: true } } },
    })
    if (!access) return reply.code(404).send({ error: 'Трек не найден' })

    const isInvolved = user.isAdmin
      || access.leaderId === user.id
      || access.members.some(m => m.userId === user.id)
    if (!isInvolved) return reply.code(403).send({ error: 'Нет доступа' })

    const track = await prisma.track.findUnique({
      where: { id },
      select: {
        id: true, title: true, description: true, type: true, status: true,
        clientName: true, projectName: true, deadline: true, leaderId: true,
        createdAt: true, updatedAt: true,
        leader:  { select: MEMBER_SELECT },
        members: { select: { user: { select: MEMBER_SELECT }, joinedAt: true } },
        chat:    { select: { id: true } },
        tasks: {
          select: {
            id: true, title: true, description: true, status: true,
            startDate: true, deadline: true, seenAt: true,
            calendarEventId: true, calendarEventEnd: true, createdAt: true, updatedAt: true,
            stageId: true,
            assignedBy: { select: MEMBER_SELECT },
            assignee:   { select: MEMBER_SELECT },
          },
          orderBy: [{ status: 'asc' as const }, { deadline: 'asc' as const }, { createdAt: 'desc' as const }],
        },
        stages: {
          select: STAGE_SELECT,
          orderBy: { order: 'asc' as const },
        },
      },
    })

    return track
  })

  // POST /tracks
  app.post('/', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string }

    const schema = z.object({
      title:       z.string().min(1),
      description: z.string().default(''),
      type:        z.enum(['internal', 'external']).default('internal'),
      clientName:  z.string().nullable().optional(),
      projectName: z.string().nullable().optional(),
      deadline:    z.string().datetime({ offset: true }).nullable().optional(),
      memberIds:   z.array(z.string()).default([]),
      workItemId:  z.string().nullable().optional(),
    })

    const body = schema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message })

    const { title, description, type, clientName, projectName, deadline, memberIds, workItemId } = body.data

    const memberOthers = [...new Set(memberIds.filter(mid => mid !== user.id))]
    const track = await prisma.track.create({
      data: {
        id: randomUUID(),
        title,
        description,
        type,
        clientName:  type === 'external' ? (clientName  ?? null) : null,
        projectName: type === 'external' ? (projectName ?? null) : null,
        deadline: deadline ? new Date(deadline) : null,
        leaderId: user.id,
        workItemId: workItemId ?? null,
        members: { create: memberOthers.map(mid => ({ userId: mid, joinedAt: new Date() })) },
      },
      select: { id: true },
    })

    // §9 «трек = чат»: авто-создаём групповой чат трека, участники автоподключаются
    await prisma.chat.create({
      data: {
        id: randomUUID(), type: 'group', name: title, color: '#7B61FF', trackId: track.id,
        members: { create: [{ userId: user.id, isGroupAdmin: true }, ...memberOthers.map(mid => ({ userId: mid }))] },
      },
    })

    const full = await prisma.track.findUnique({ where: { id: track.id }, select: TRACK_SELECT })
    return reply.code(201).send(full)
  })

  // PATCH /tracks/:id
  app.patch('/:id', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string; isAdmin: boolean }
    const { id } = request.params as { id: string }

    const track = await prisma.track.findUnique({ where: { id }, select: { leaderId: true } })
    if (!track) return reply.code(404).send({ error: 'Трек не найден' })
    if (!user.isAdmin && track.leaderId !== user.id) return reply.code(403).send({ error: 'Только лидер может редактировать трек' })

    const schema = z.object({
      title:       z.string().min(1).optional(),
      description: z.string().optional(),
      type:        z.enum(['internal', 'external']).optional(),
      status:      z.enum(['active', 'done', 'archived']).optional(),
      clientName:  z.string().nullable().optional(),
      projectName: z.string().nullable().optional(),
      deadline:    z.string().datetime({ offset: true }).nullable().optional(),
      leaderId:    z.string().optional(),
      workItemId:  z.string().nullable().optional(),
    })

    const body = schema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message })

    const { deadline, type, clientName, projectName, workItemId, ...rest } = body.data

    const updated = await prisma.track.update({
      where: { id },
      data: {
        ...rest,
        ...(type !== undefined && { type }),
        ...(type === 'internal' && { clientName: null, projectName: null }),
        ...(type === 'external' || type === undefined ? {
          ...(clientName  !== undefined && { clientName }),
          ...(projectName !== undefined && { projectName }),
        } : {}),
        ...(deadline    !== undefined ? { deadline:    deadline    ? new Date(deadline) : null } : {}),
        ...(workItemId  !== undefined ? { workItemId:  workItemId  ?? null               } : {}),
      },
      select: TRACK_SELECT,
    })

    return updated
  })

  // DELETE /tracks/:id
  app.delete('/:id', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string; isAdmin: boolean }
    const { id } = request.params as { id: string }

    const track = await prisma.track.findUnique({ where: { id }, select: { leaderId: true } })
    if (!track) return reply.code(404).send({ error: 'Трек не найден' })
    if (!user.isAdmin && track.leaderId !== user.id) return reply.code(403).send({ error: 'Только лидер может удалить трек' })

    // detach tasks, then delete
    await prisma.task.updateMany({ where: { trackId: id }, data: { trackId: null } })
    await prisma.track.delete({ where: { id } })

    return reply.code(204).send()
  })

  // PUT /tracks/:id/members — set full member list (replaces)
  app.put('/:id/members', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string; isAdmin: boolean }
    const { id } = request.params as { id: string }

    const track = await prisma.track.findUnique({ where: { id }, select: { leaderId: true } })
    if (!track) return reply.code(404).send({ error: 'Трек не найден' })
    if (!user.isAdmin && track.leaderId !== user.id) return reply.code(403).send({ error: 'Только лидер может управлять участниками' })

    const schema = z.object({ memberIds: z.array(z.string()) })
    const body = schema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message })

    const ids = body.data.memberIds.filter(mid => mid !== track.leaderId)

    // block removal of members who have tasks in this track
    const currentMembers = await prisma.trackMember.findMany({ where: { trackId: id }, select: { userId: true } })
    const removedIds = currentMembers.map(m => m.userId).filter(uid => !ids.includes(uid) && uid !== track.leaderId)

    if (removedIds.length > 0) {
      const withTasks = await prisma.task.findMany({
        where: { trackId: id, assigneeId: { in: removedIds } },
        select: { assignee: { select: { name: true } } },
      })
      if (withTasks.length > 0) {
        const names = [...new Set(withTasks.map(t => t.assignee.name))].join(', ')
        return reply.code(409).send({ error: `Нельзя удалить участников с задачами в треке: ${names}` })
      }
    }

    await prisma.$transaction([
      prisma.trackMember.deleteMany({ where: { trackId: id } }),
      prisma.trackMember.createMany({
        data: ids.map(userId => ({ trackId: id, userId, joinedAt: new Date() })),
        skipDuplicates: true,
      }),
    ])

    // §9: синхронизируем участников чата трека с новым составом (лидер остаётся всегда)
    const chat = await prisma.chat.findFirst({ where: { trackId: id }, select: { id: true } })
    if (chat) {
      const desired = new Set([track.leaderId, ...ids])
      const chatMembers = await prisma.chatMember.findMany({ where: { chatId: chat.id }, select: { userId: true } })
      const have = new Set(chatMembers.map(m => m.userId))
      const toAdd = [...desired].filter(uid => !have.has(uid))
      const toRemove = [...have].filter(uid => !desired.has(uid) && uid !== track.leaderId)
      if (toAdd.length) await prisma.chatMember.createMany({ data: toAdd.map(userId => ({ chatId: chat.id, userId })), skipDuplicates: true })
      if (toRemove.length) await prisma.chatMember.deleteMany({ where: { chatId: chat.id, userId: { in: toRemove } } })
    }

    const updated = await prisma.track.findUnique({ where: { id }, select: TRACK_SELECT })
    return updated
  })

  // POST /tracks/:id/stages — create a stage (any track member or leader)
  app.post('/:id/stages', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string; isAdmin: boolean }
    const { id } = request.params as { id: string }

    const track = await prisma.track.findUnique({
      where: { id },
      select: { leaderId: true, members: { select: { userId: true } } },
    })
    if (!track) return reply.code(404).send({ error: 'Трек не найден' })

    const isInvolved = user.isAdmin
      || track.leaderId === user.id
      || track.members.some(m => m.userId === user.id)
    if (!isInvolved) return reply.code(403).send({ error: 'Нет доступа' })

    const schema = z.object({ title: z.string().min(1) })
    const body = schema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message })

    const maxOrder = await prisma.stage.aggregate({ where: { trackId: id }, _max: { order: true } })
    const newOrder = (maxOrder._max.order ?? 0) + 1

    const stage = await prisma.stage.create({
      data: { id: randomUUID(), trackId: id, title: body.data.title, order: newOrder },
      select: STAGE_SELECT,
    })

    return reply.code(201).send(stage)
  })

  // PATCH /tracks/:id/stages/:stageId — rename a stage
  app.patch('/:id/stages/:stageId', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string; isAdmin: boolean }
    const { id, stageId } = request.params as { id: string; stageId: string }

    const track = await prisma.track.findUnique({
      where: { id },
      select: { leaderId: true, members: { select: { userId: true } } },
    })
    if (!track) return reply.code(404).send({ error: 'Трек не найден' })

    const isInvolved = user.isAdmin
      || track.leaderId === user.id
      || track.members.some(m => m.userId === user.id)
    if (!isInvolved) return reply.code(403).send({ error: 'Нет доступа' })

    const schema = z.object({ title: z.string().min(1).optional(), order: z.number().int().optional() })
    const body = schema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message })

    const stage = await prisma.stage.update({
      where: { id: stageId },
      data: { ...(body.data.title !== undefined && { title: body.data.title }), ...(body.data.order !== undefined && { order: body.data.order }) },
      select: STAGE_SELECT,
    })

    return stage
  })

  // DELETE /tracks/:id/stages/:stageId — delete a stage (detach tasks)
  app.delete('/:id/stages/:stageId', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string; isAdmin: boolean }
    const { id, stageId } = request.params as { id: string; stageId: string }

    const track = await prisma.track.findUnique({ where: { id }, select: { leaderId: true } })
    if (!track) return reply.code(404).send({ error: 'Трек не найден' })
    if (!user.isAdmin && track.leaderId !== user.id) return reply.code(403).send({ error: 'Только лидер может удалять этапы' })

    await prisma.task.updateMany({ where: { stageId }, data: { stageId: null } })
    await prisma.stage.delete({ where: { id: stageId } })

    return reply.code(204).send()
  })

  // PATCH /tasks/:taskId/track — assign/unassign a task to a track
  app.patch('/tasks/:taskId/track', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string; isAdmin: boolean }
    const { taskId } = request.params as { taskId: string }

    const schema = z.object({ trackId: z.string().nullable() })
    const body = schema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message })

    const task = await prisma.task.findUnique({ where: { id: taskId }, select: { assignedById: true, assigneeId: true } })
    if (!task) return reply.code(404).send({ error: 'Задача не найдена' })

    if (!user.isAdmin && task.assignedById !== user.id && task.assigneeId !== user.id) {
      return reply.code(403).send({ error: 'Нет доступа' })
    }

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: { trackId: body.data.trackId },
      select: { id: true, trackId: true },
    })

    return updated
  })
}
