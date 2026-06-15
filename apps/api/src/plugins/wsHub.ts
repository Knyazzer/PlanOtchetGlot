import type { SocketStream } from '@fastify/websocket'

type Conn = SocketStream

const connections = new Map<string, Set<Conn>>()

export function registerWs(userId: string, conn: Conn) {
  if (!connections.has(userId)) connections.set(userId, new Set())
  connections.get(userId)!.add(conn)

  conn.socket.on('close', () => {
    const conns = connections.get(userId)
    if (conns) {
      conns.delete(conn)
      if (conns.size === 0) connections.delete(userId)
    }
  })
}

export function sendToUser(userId: string, payload: object) {
  const conns = connections.get(userId)
  if (!conns) return
  const data = JSON.stringify(payload)
  for (const conn of conns) {
    if (conn.socket.readyState === conn.socket.OPEN) conn.socket.send(data)
  }
}

export function isOnline(userId: string) {
  return (connections.get(userId)?.size ?? 0) > 0
}
