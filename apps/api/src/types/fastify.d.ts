import { Role } from '@tv-shifts/db'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { id: string; role: Role }
    user: { id: string; role: Role }
  }
}
