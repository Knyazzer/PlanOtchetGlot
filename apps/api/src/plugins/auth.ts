import { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '@nexus/db'

// After authenticate runs, request.user is replaced with enriched nexus user data.
// All route handlers that read (request as any).user.id get the nexus users.id.

async function loadUser(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  // Guard: already enriched this request cycle
  if ((request as any).__nexusUserLoaded) return true

  try {
    await request.jwtVerify()
    const raw = request.user as {
      sub?: string          // Supabase access token
      nexus_user_id?: string // admin-generated impersonation token (new format)
      id?: string            // legacy impersonation token (old format)
    }

    let where: { authId: string } | { id: string } | null = null
    if (raw.sub) {
      where = { authId: raw.sub }
    } else if (raw.nexus_user_id) {
      where = { id: raw.nexus_user_id }
    } else if (raw.id) {
      where = { id: raw.id }
    }

    if (!where) {
      reply.code(401).send({ error: 'Unauthorized' })
      return false
    }

    const user = await prisma.user.findUnique({
      where,
      select: { id: true, email: true, name: true, isAdmin: true, canAccessInventory: true, canAccessPlatform: true, isActive: true },
    })
    if (!user || !user.isActive) {
      reply.code(401).send({ error: 'Unauthorized' })
      return false
    }

    // Prevent impersonating an admin via a Nexus-generated token
    if (!raw.sub && user.isAdmin) {
      reply.code(403).send({ error: 'Forbidden' })
      return false
    }

    // Overwrite request.user so all existing route handlers get nexus user data
    ;(request as any).user = {
      id: user.id,
      email: user.email,
      name: user.name,
      isAdmin: user.isAdmin,
      canAccessInventory: user.canAccessInventory,
      canAccessPlatform: user.canAccessPlatform,
      roles: user.isAdmin ? ['admin'] : [],
    }
    ;(request as any).__nexusUserLoaded = true
    return true
  } catch {
    reply.code(401).send({ error: 'Unauthorized' })
    return false
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  await loadUser(request, reply)
}

export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const ok = await loadUser(request, reply)
    if (!ok || reply.sent) return
    const user = request.user as { isAdmin?: boolean; roles?: string[] }
    // admin проходит всё; иначе — только если реальные роли пользователя пересекаются с требуемыми.
    // Non-admin роли (producer/freelancer) ещё не реализованы → fail-closed: не-админ не пройдёт
    // молча (прежнее поведение пропускало любого при requireRole('producer')).
    const passes = user.isAdmin === true || roles.some(r => (user.roles ?? []).includes(r))
    if (!passes) reply.code(403).send({ error: 'Forbidden' })
  }
}
