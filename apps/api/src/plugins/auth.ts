import { FastifyRequest, FastifyReply } from 'fastify'
import { Role } from '@tv-shifts/db'

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
    const { id, role } = request.user as { id: string; role: Role }
    request.log.setBindings?.({ userId: id, role })
  } catch {
    reply.code(401).send({ error: 'Unauthorized' })
  }
}

export function requireRole(...roles: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
      const { id, role } = request.user as { id: string; role: Role }
      request.log.setBindings?.({ userId: id, role })
      if (!roles.includes(role)) {
        reply.code(403).send({ error: 'Forbidden' })
      }
    } catch {
      reply.code(401).send({ error: 'Unauthorized' })
    }
  }
}
