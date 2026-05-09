import { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '@tv-shifts/db'

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
  | 'departments:manage'

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
  'departments:manage',
]

// Fallback permissions by role name string (used when RBAC tables are empty)
export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  admin: ALL_PERMISSIONS,
  dept_director: [
    'analytics:read', 'sync:logs',
    'projects:write', 'tasks:write', 'shifts:write', 'kanban:delete',
    'members:read', 'members:write', 'members:bulk',
    'departments:manage', 'users:manage', 'database:manage',
  ],
  producer: [
    'analytics:read', 'sync:trigger', 'sync:logs',
    'projects:write', 'matrix:write',
    'members:read', 'members:bulk', 'kanban:delete',
  ],
  spec_projects: [
    'analytics:read', 'sync:trigger', 'sync:logs',
    'projects:write', 'matrix:write', 'internal-matrix:manage',
    'members:read', 'members:bulk',
    'shifts:write', 'tasks:write', 'kanban:delete',
  ],
  accountant: [
    'analytics:read', 'deals:write', 'members:read',
  ],
  hr_manager: [
    'analytics:read', 'users:manage', 'members:read', 'members:write', 'tasks:write',
  ],
  employee: [],
}

export function hasPermission(role: string, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[role] ?? []).includes(permission)
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
      const user = request.user as { id: string; roles?: string[]; permissions?: string[] }
      request.log.setBindings?.({ userId: user.id })

      // Use RBAC permissions[] from JWT; fall back to role-name lookup when empty.
      const hasRbacRoles = user.roles && user.roles.length > 0
      const allowed = hasRbacRoles
        ? (user.permissions ?? []).includes(permission)
        : (user.roles ?? []).some((r) => hasPermission(r, permission))

      if (!allowed) {
        reply.code(403).send({ error: 'Forbidden' })
      }
    } catch {
      reply.code(401).send({ error: 'Unauthorized' })
    }
  }
}
