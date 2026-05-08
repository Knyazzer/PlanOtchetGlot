import { FastifyRequest, FastifyReply } from 'fastify'

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
    const { id } = request.user as { id: string }
    request.log.setBindings?.({ userId: id })
  } catch {
    reply.code(401).send({ error: 'Unauthorized' })
  }
}

// roles: logical role names (e.g. 'admin', 'producer') matched against JWT roles[]
export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
      const { id, roles: userRoles = [] } = request.user as { id: string; roles?: string[] }
      request.log.setBindings?.({ userId: id })
      if (!roles.some((r) => userRoles.includes(r))) {
        reply.code(403).send({ error: 'Forbidden' })
      }
    } catch {
      reply.code(401).send({ error: 'Unauthorized' })
    }
  }
}
