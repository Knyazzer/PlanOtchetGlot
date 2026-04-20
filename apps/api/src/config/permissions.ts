import { FastifyRequest, FastifyReply } from 'fastify'
import { Role } from '@tv-shifts/db'

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

export function requirePermission(permission: Permission) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
      const user = request.user as { id: string; role: Role }
      if (!hasPermission(user.role, permission)) {
        reply.code(403).send({ error: 'Forbidden' })
      }
    } catch {
      reply.code(401).send({ error: 'Unauthorized' })
    }
  }
}
