import { Role } from '@tv-shifts/db'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      id: string
      role?: Role
      email?: string
      fullName?: string
      type?: string
      roles?: string[]
      permissions?: string[]
    }
    user: {
      id: string
      role: Role
      roles?: string[]
      permissions?: string[]
    }
  }
}

declare module 'fastify' {
  interface FastifyBaseLogger {
    setBindings(bindings: Record<string, unknown>): void
  }
}
