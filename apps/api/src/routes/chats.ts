import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@nexus/db'
import { authenticate } from '../plugins/auth'
import { registerWs, sendToUser } from '../plugins/wsHub'
import { randomUUID } from 'crypto'

// Поля участника для отображения в списке чатов
const MEMBER_SELECT = {
  userId: true,
  isFavorite: true,
  isPinned: true,
  isArchived: true,
  lastReadAt: true,
  user: { select: { id: true, name: true, isActive: true } },
} as const

// Последнее сообщение для превью в списке
const LAST_MSG_SELECT = {
  id: true, text: true, senderId: true, createdAt: true, editedAt: true, deletedAt: true,
} as const

export async function chatsRoutes(app: FastifyInstance) {

  // ── GET /chats/ws-token — одноразовый токен для WS (обходит cross-origin cookie) ──
  app.get('/ws-token', { preHandler: authenticate }, async (request) => {
    const user = (request as any).user as { id: string }
    // Подписываем токен с коротким TTL (60s достаточно для handshake)
    const token = (app as any).jwt.sign({ id: user.id }, { expiresIn: '60s' })
    return { token }
  })

  // ── WebSocket ─────────────────────────────────────────────────────────────────
  app.get('/ws', { websocket: true }, async (conn, request) => {
    // Аутентификация через query-param token (cookie не проходит cross-origin для WS)
    const { token } = (request.query as any)
    if (!token) {
      conn.socket.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }))
      conn.socket.close()
      return
    }
    let userId: string
    try {
      const payload = (app as any).jwt.verify(token) as { id: string }
      userId = payload.id
    } catch {
      conn.socket.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }))
      conn.socket.close()
      return
    }
    registerWs(userId, conn)
    conn.socket.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (msg.type === 'ping') conn.socket.send(JSON.stringify({ type: 'pong' }))
      } catch { /* ignore malformed */ }
    })
  })

  // ── GET /chats — список чатов текущего пользователя ──────────────────────────
  app.get('/', { preHandler: authenticate }, async (request) => {
    const user = (request as any).user as { id: string }

    const members = await prisma.chatMember.findMany({
      where:   { userId: user.id, isArchived: false },
      include: {
        chat: {
          include: {
            members: { select: MEMBER_SELECT },
            messages: {
              where:   { deletedAt: null },
              orderBy: { createdAt: 'desc' },
              take:    1,
              select:  LAST_MSG_SELECT,
            },
          },
        },
      },
      orderBy: [
        { isPinned: 'desc' },
        { chat: { updatedAt: 'desc' } },
      ],
    })

    return members.map(m => {
      const lastMsg = m.chat.messages[0] ?? null
      const otherMembers = m.chat.members.filter(cm => cm.userId !== user.id)

      // Максимальный lastReadAt среди других участников — момент когда последний прочитал
      const otherLastReadAt = otherMembers.reduce<Date | null>((max, om) => {
        if (!om.lastReadAt) return max
        return !max || om.lastReadAt > max ? om.lastReadAt : max
      }, null)

      return {
        chatId:          m.chat.id,
        type:            m.chat.type,
        name:            m.chat.name ?? null,
        color:           m.chat.color ?? null,
        isFavorite:      m.isFavorite,
        isPinned:        m.isPinned,
        lastReadAt:      m.lastReadAt,
        otherLastReadAt: otherLastReadAt,
        otherMembers:    otherMembers.map(om => ({ id: om.userId, name: om.user.name })),
        lastMessage:     lastMsg,
        updatedAt:       m.chat.updatedAt,
      }
    })
  })

  // ── GET /chats/unread — кол-во непрочитанных по всем чатам ──────────────────
  app.get('/unread', { preHandler: authenticate }, async (request) => {
    const user = (request as any).user as { id: string }

    const members = await prisma.chatMember.findMany({
      where: { userId: user.id, isArchived: false },
      select: { chatId: true, lastReadAt: true },
    })

    if (members.length === 0) return {}

    // Параллельные counts (по одному на чат): единый groupBy невозможен —
    // у каждого чата свой порог lastReadAt, фильтр createdAt > lastReadAt индивидуален.
    // Promise.all даёт один round-trip по времени; при росте числа чатов на юзера
    // → переписать на raw-SQL с JOIN VALUES(chatId,lastReadAt).
    const counts = await Promise.all(
      members.map(m => prisma.message.count({
        where: {
          chatId:    m.chatId,
          senderId:  { not: user.id },
          deletedAt: null,
          ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
        },
      }).then(count => ({ chatId: m.chatId, count })))
    )

    return Object.fromEntries(counts.map(c => [c.chatId, c.count]))
  })

  // ── POST /chats/direct/:userId — открыть/найти личный чат ────────────────────
  app.post('/direct/:userId', { preHandler: authenticate }, async (request, reply) => {
    const me = (request as any).user as { id: string }
    const { userId: otherId } = request.params as { userId: string }

    if (otherId === me.id) return reply.code(400).send({ error: 'Используйте /chats/self для заметок' })

    const other = await prisma.user.findUnique({ where: { id: otherId }, select: { id: true } })
    if (!other) return reply.code(404).send({ error: 'Пользователь не найден' })

    // Advisory lock по отсортированной паре ID — предотвращает гонку и дублирование
    const lockKey = [me.id, otherId].sort().join(':')
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'direct:' + lockKey}))`

      const existing = await tx.chat.findFirst({
        where: {
          type: 'direct',
          AND: [
            { members: { some: { userId: me.id } } },
            { members: { some: { userId: otherId } } },
            { members: { every: { userId: { in: [me.id, otherId] } } } },
          ],
        },
        select: { id: true },
      })
      if (existing) return { chatId: existing.id, created: false }

      const chat = await tx.chat.create({
        data: {
          id:   randomUUID(),
          type: 'direct',
          members: { create: [{ userId: me.id }, { userId: otherId }] },
        },
        select: { id: true },
      })
      return { chatId: chat.id, created: true }
    })

    return result.created
      ? reply.code(201).send({ chatId: result.chatId })
      : { chatId: result.chatId }
  })

  // ── POST /chats/self — чат с самим собой (заметки) ───────────────────────────
  app.post('/self', { preHandler: authenticate }, async (request, reply) => {
    const me = (request as any).user as { id: string }

    // транзакция с advisory lock предотвращает гонку при параллельных запросах
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'self:' + me.id}))`
      const existing = await tx.chat.findFirst({
        where: { type: 'self', members: { some: { userId: me.id } } },
        select: { id: true },
      })
      if (existing) return { chatId: existing.id, created: false }
      const chat = await tx.chat.create({
        data: { id: randomUUID(), type: 'self', members: { create: [{ userId: me.id, isFavorite: true }] } },
        select: { id: true },
      })
      return { chatId: chat.id, created: true }
    })
    return result.created ? reply.code(201).send({ chatId: result.chatId }) : { chatId: result.chatId }
  })

  // ── POST /chats/support — чат с техподдержкой ────────────────────────────────
  app.post('/support', { preHandler: authenticate }, async (request, reply) => {
    const me = (request as any).user as { id: string }

    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'support:' + me.id}))`
      const existing = await tx.chat.findFirst({
        where: { type: 'support', members: { some: { userId: me.id } } },
        select: { id: true },
      })
      if (existing) return { chatId: existing.id, created: false }

      const admins = await tx.user.findMany({ where: { isAdmin: true, id: { not: me.id } }, select: { id: true } })
      const chat = await tx.chat.create({
        data: {
          id: randomUUID(), type: 'support',
          members: {
            create: [
              { userId: me.id, isFavorite: true },
              ...admins.map(a => ({ userId: a.id })),
            ],
          },
        },
        select: { id: true },
      })
      return { chatId: chat.id, created: true }
    })
    return result.created ? reply.code(201).send({ chatId: result.chatId }) : { chatId: result.chatId }
  })

  // ── POST /chats/group — создать групповой чат ────────────────────────────────
  app.post('/group', { preHandler: authenticate }, async (request, reply) => {
    const me = (request as any).user as { id: string }

    const schema = z.object({
      name:      z.string().min(1).max(100),
      color:     z.string().regex(/^#[0-9a-fA-F]{6}$/),
      memberIds: z.array(z.string()).min(1),
    })
    const body = schema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input' })

    const otherIds = [...new Set(body.data.memberIds.filter(id => id !== me.id))]
    if (otherIds.length === 0) return reply.code(400).send({ error: 'Выберите хотя бы одного участника' })

    const existing = await prisma.user.findMany({
      where: { id: { in: otherIds } },
      select: { id: true },
    })
    if (existing.length !== otherIds.length) {
      return reply.code(400).send({ error: 'Один или несколько пользователей не найдены' })
    }

    const chat = await prisma.chat.create({
      data: {
        id:    randomUUID(),
        type:  'group',
        name:  body.data.name,
        color: body.data.color,
        members: {
          create: [
            { userId: me.id, isGroupAdmin: true },
            ...otherIds.map(id => ({ userId: id })),
          ],
        },
      },
      select: { id: true },
    })

    return reply.code(201).send({ chatId: chat.id })
  })

  // ── PATCH /chats/:id — обновить название/цвет группы ────────────────────────
  app.patch('/:id', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string; isAdmin?: boolean }
    const { id: chatId } = request.params as { id: string }

    const schema = z.object({
      name:  z.string().min(1).max(100).optional(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    })
    const body = schema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input' })

    const chat = await prisma.chat.findUnique({ where: { id: chatId }, select: { id: true, type: true } })
    if (!chat || chat.type !== 'group') return reply.code(404).send({ error: 'Not found' })

    const myMembership = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: user.id } },
    })
    if (!myMembership) return reply.code(403).send({ error: 'Forbidden' })
    if (!myMembership.isGroupAdmin && !user.isAdmin) return reply.code(403).send({ error: 'Forbidden' })

    const updated = await prisma.chat.update({
      where: { id: chatId },
      data:  body.data,
      select: { id: true, name: true, color: true },
    })

    return updated
  })

  // ── GET /chats/:id/members — участники группового чата ───────────────────────
  app.get('/:id/members', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string; isAdmin?: boolean }
    const { id: chatId } = request.params as { id: string }

    const myMembership = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: user.id } },
    })
    if (!myMembership) return reply.code(403).send({ error: 'Forbidden' })

    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: {
        id: true, name: true, color: true, type: true,
        members: {
          select: {
            userId: true, isGroupAdmin: true, joinedAt: true,
            user: { select: { id: true, name: true } },
          },
          orderBy: [{ isGroupAdmin: 'desc' }, { joinedAt: 'asc' }],
        },
      },
    })
    if (!chat) return reply.code(404).send({ error: 'Not found' })

    // System admins always get group-admin privileges
    const myIsGroupAdmin = myMembership.isGroupAdmin || !!user.isAdmin

    return {
      chatId: chat.id,
      name:   chat.name,
      color:  chat.color,
      type:   chat.type,
      myIsGroupAdmin,
      members: chat.members.map(m => ({
        id:           m.user.id,
        name:     m.user.name,
        isGroupAdmin: m.isGroupAdmin,
        joinedAt:     m.joinedAt,
      })),
    }
  })

  // ── DELETE /chats/:id — удалить групповой чат (только группадмин) ────────────
  app.delete('/:id', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string; isAdmin?: boolean }
    const { id: chatId } = request.params as { id: string }

    const chat = await prisma.chat.findUnique({ where: { id: chatId }, select: { id: true, type: true } })
    if (!chat || chat.type !== 'group') return reply.code(404).send({ error: 'Not found' })

    const myMembership = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: user.id } },
    })
    if (!myMembership) return reply.code(403).send({ error: 'Forbidden' })
    if (!myMembership.isGroupAdmin && !user.isAdmin) return reply.code(403).send({ error: 'Forbidden' })

    await prisma.chat.delete({ where: { id: chatId } })

    return reply.code(204).send()
  })

  // ── POST /chats/:id/members — добавить участников (только админ) ──────────────
  app.post('/:id/members', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string; isAdmin?: boolean }
    const { id: chatId } = request.params as { id: string }

    const schema = z.object({ memberIds: z.array(z.string()).min(1) })
    const body = schema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input' })

    const myMembership = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: user.id } },
    })
    if (!myMembership || (!myMembership.isGroupAdmin && !user.isAdmin)) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const newIds = [...new Set(body.data.memberIds.filter(id => id !== user.id))]
    const existing = await prisma.chatMember.findMany({
      where: { chatId, userId: { in: newIds } },
      select: { userId: true },
    })
    const existingSet = new Set(existing.map(m => m.userId))
    const toAdd = newIds.filter(id => !existingSet.has(id))

    if (toAdd.length > 0) {
      await prisma.chatMember.createMany({
        data: toAdd.map(id => ({ chatId, userId: id })),
      })
    }

    return reply.code(204).send()
  })

  // ── DELETE /chats/:id/members/:userId — удалить участника (только админ) ──────
  app.delete('/:id/members/:userId', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string; isAdmin?: boolean }
    const { id: chatId, userId: targetId } = request.params as { id: string; userId: string }

    const myMembership = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: user.id } },
    })
    if (!myMembership || (!myMembership.isGroupAdmin && !user.isAdmin)) {
      return reply.code(403).send({ error: 'Forbidden' })
    }
    if (targetId === user.id) return reply.code(400).send({ error: 'Нельзя удалить себя' })

    const target = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: targetId } },
    })
    if (!target) return reply.code(404).send({ error: 'Участник не найден' })
    if (target.isGroupAdmin) return reply.code(400).send({ error: 'Нельзя удалить администратора' })

    await prisma.chatMember.delete({
      where: { chatId_userId: { chatId, userId: targetId } },
    })

    return reply.code(204).send()
  })

  // ── GET /chats/:id/messages — история сообщений (cursor pagination) ───────────
  app.get('/:id/messages', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string }
    const { id } = request.params as { id: string }
    const { before, limit = '50' } = request.query as { before?: string; limit?: string }

    if (before && isNaN(Date.parse(before))) {
      return reply.code(400).send({ error: 'Invalid cursor' })
    }

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId: id, userId: user.id } },
    })
    if (!member) return reply.code(403).send({ error: 'Forbidden' })

    const messages = await prisma.message.findMany({
      where: {
        chatId:    id,
        deletedAt: null,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take:    Math.min(Number(limit), 100),
      select: {
        id: true, text: true, senderId: true,
        createdAt: true, editedAt: true, replyToId: true, isPinned: true,
        taskTitle: true,
        sender: { select: { id: true, name: true } },
        task:   { select: { id: true, title: true } },
      },
    })

    return messages.reverse()  // возвращаем от старых к новым
  })

  // ── POST /chats/:id/messages — отправить сообщение ───────────────────────────
  app.post('/:id/messages', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string }
    const { id: chatId } = request.params as { id: string }

    const schema = z.object({
      text:      z.string().min(1).max(10000),
      taskId:    z.string().optional(),
      taskTitle: z.string().optional(),
    })
    const body = schema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input' })

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: user.id } },
    })
    if (!member) return reply.code(403).send({ error: 'Forbidden' })

    // Resolve task — use DB title if task exists, fall back to client-supplied title if deleted
    let resolvedTaskId: string | undefined
    let resolvedTaskTitle: string | undefined
    if (body.data.taskId) {
      const task = await prisma.task.findUnique({ where: { id: body.data.taskId }, select: { id: true, title: true } })
      if (task) {
        resolvedTaskId    = task.id
        resolvedTaskTitle = task.title
      } else {
        // Task was deleted — keep the title snapshot so the card can show "Удалено"
        resolvedTaskTitle = body.data.taskTitle
      }
    }

    const [message] = await prisma.$transaction([
      prisma.message.create({
        data: {
          id: randomUUID(), chatId, senderId: user.id, text: body.data.text,
          ...(resolvedTaskId    && { taskId:    resolvedTaskId }),
          ...(resolvedTaskTitle && { taskTitle: resolvedTaskTitle }),
        },
        select: {
          id: true, text: true, senderId: true, createdAt: true, editedAt: true,
          taskTitle: true,
          sender: { select: { id: true, name: true } },
          task:   { select: { id: true, title: true } },
        },
      }),
      // обновляем updatedAt чата для правильной сортировки в списке
      prisma.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } }),
    ])

    // пушим всем участникам через WebSocket
    const members = await prisma.chatMember.findMany({
      where: { chatId },
      select: { userId: true },
    })
    const payload = { type: 'message:new', chatId, message }
    for (const m of members) sendToUser(m.userId, payload)

    return reply.code(201).send(message)
  })

  // ── PATCH /chats/:id/messages/:msgId — редактировать сообщение ───────────────
  app.patch('/:id/messages/:msgId', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string }
    const { id: chatId, msgId } = request.params as { id: string; msgId: string }

    const schema = z.object({ text: z.string().min(1).max(10000) })
    const body = schema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input' })

    const msg = await prisma.message.findUnique({ where: { id: msgId }, select: { chatId: true, senderId: true, deletedAt: true } })
    if (!msg || msg.deletedAt) return reply.code(404).send({ error: 'Not found' })
    if (msg.chatId !== chatId) return reply.code(404).send({ error: 'Not found' })
    if (msg.senderId !== user.id) return reply.code(403).send({ error: 'Forbidden' })

    const updated = await prisma.message.update({
      where: { id: msgId },
      data:  { text: body.data.text, editedAt: new Date() },
      select: { id: true, text: true, senderId: true, createdAt: true, editedAt: true },
    })

    // уведомляем участников
    const members = await prisma.chatMember.findMany({ where: { chatId }, select: { userId: true } })
    for (const m of members) sendToUser(m.userId, { type: 'message:edited', chatId, message: updated })

    return updated
  })

  // ── DELETE /chats/:id/messages/:msgId — soft delete ──────────────────────────
  app.delete('/:id/messages/:msgId', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string; isAdmin: boolean }
    const { id: chatId, msgId } = request.params as { id: string; msgId: string }

    const msg = await prisma.message.findUnique({ where: { id: msgId }, select: { chatId: true, senderId: true, deletedAt: true } })
    if (!msg || msg.deletedAt) return reply.code(404).send({ error: 'Not found' })
    if (msg.chatId !== chatId) return reply.code(404).send({ error: 'Not found' })
    if (msg.senderId !== user.id && !user.isAdmin) return reply.code(403).send({ error: 'Forbidden' })

    await prisma.message.update({ where: { id: msgId }, data: { deletedAt: new Date() } })

    const members = await prisma.chatMember.findMany({ where: { chatId }, select: { userId: true } })
    for (const m of members) sendToUser(m.userId, { type: 'message:deleted', chatId, msgId })

    return reply.code(204).send()
  })

  // ── POST /chats/:id/read — пометить чат прочитанным ──────────────────────────
  app.post('/:id/read', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string }
    const { id: chatId } = request.params as { id: string }

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: user.id } },
    })
    if (!member) return reply.code(403).send({ error: 'Forbidden' })

    await prisma.chatMember.update({
      where: { chatId_userId: { chatId, userId: user.id } },
      data:  { lastReadAt: new Date() },
    })

    // уведомляем отправителей что прочитано
    const members = await prisma.chatMember.findMany({ where: { chatId }, select: { userId: true } })
    for (const m of members) {
      if (m.userId !== user.id) sendToUser(m.userId, { type: 'chat:read', chatId, byUserId: user.id })
    }

    return reply.code(204).send()
  })

  // ── PATCH /chats/:id/member — избранное / закреп ─────────────────────────────
  app.patch('/:id/member', { preHandler: authenticate }, async (request, reply) => {
    const user = (request as any).user as { id: string }
    const { id: chatId } = request.params as { id: string }

    const schema = z.object({
      isFavorite: z.boolean().optional(),
      isPinned:   z.boolean().optional(),
      isArchived: z.boolean().optional(),
    })
    const body = schema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid input' })

    try {
      const updated = await prisma.chatMember.update({
        where: { chatId_userId: { chatId, userId: user.id } },
        data:  body.data,
        select: { isFavorite: true, isPinned: true, isArchived: true },
      })
      return updated
    } catch (e: any) {
      if (e?.code === 'P2025') return reply.code(403).send({ error: 'Forbidden' })
      throw e
    }
  })
}
