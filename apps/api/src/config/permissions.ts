import { FastifyRequest, FastifyReply } from 'fastify'
import { Role, prisma } from '@tv-shifts/db'

export type Permission =
  | 'analytics:read'
  | 'sync:trigger'
  | 'sync:logs'
  | 'sync:admin'
  | 'projects:write'
  | 'projects:config'
  | 'deals:write'
  | 'shifts:write'
  | 'tasks:write'
  | 'matrix:write'
  | 'matrix-templates:manage'
  | 'internal-matrix:manage'
  | 'members:read'
  | 'members:write'
  | 'members:bulk'
  | 'users:manage'
  | 'database:manage'
  | 'kanban:delete'

const ALL_PERMISSIONS: Permission[] = [
  'analytics:read',
  'sync:trigger',
  'sync:logs',
  'sync:admin',
  'projects:write',
  'projects:config',
  'deals:write',
  'shifts:write',
  'tasks:write',
  'matrix:write',
  'matrix-templates:manage',
  'internal-matrix:manage',
  'members:read',
  'members:write',
  'members:bulk',
  'users:manage',
  'database:manage',
  'kanban:delete',
]

// Legacy fallback: permissions by enum role (used when JWT lacks permissions[])
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: ALL_PERMISSIONS,
  producer: [
    'analytics:read',
    'sync:trigger',
    'sync:logs',
    'matrix:write',
    'members:read',
    'members:bulk',
    'kanban:delete',
  ],
  employee: [],
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission)
}

export async function getUserPermissions(userId: string): Promise<string[]> {
  const userRoles = await prisma.userAppRole.findMany({
    where: { userId },
    include: {
      role: { include: { rolePermissions: true } },
    },
  })
  const permissions = new Set<string>()
  for (const ur of userRoles) {
    for (const rp of ur.role.rolePermissions) {
      permissions.add(rp.permission)
    }
  }
  return [...permissions]
}

export function requirePermission(permission: Permission) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
      const user = request.user as { id: string; role?: string; roles?: string[]; permissions?: string[] }
      request.log.setBindings?.({ userId: user.id, role: user.role })

      // Use RBAC permissions when the user has been assigned roles in the new system.
      // Fall back to legacy enum-based check when roles[] is empty (no RBAC data yet).
      const hasRbacRoles = user.roles && user.roles.length > 0
      const allowed = hasRbacRoles
        ? (user.permissions ?? []).includes(permission)
        : hasPermission((user.role ?? 'employee') as Role, permission)

      if (!allowed) {
        reply.code(403).send({ error: 'Forbidden' })
      }
    } catch {
      reply.code(401).send({ error: 'Unauthorized' })
    }
  }
}
