import { Role } from '@tv-shifts/db'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    // sign() calls may include email/fullName (access token) or type:'refresh' (refresh token)
    payload: { id: string; role?: Role; email?: string; fullName?: string; type?: string }
    user:    { id: string; role: Role }
  }
}

declare module 'fastify' {
  interface FastifyBaseLogger {
    // Pino's setBindings() is available at runtime but not in Fastify's TS abstraction
    setBindings(bindings: Record<string, unknown>): void
  }
}
