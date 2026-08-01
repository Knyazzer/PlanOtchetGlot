import { useRef, useEffect } from 'react'
import { api } from '../../lib/api'

// ── WebSocket singleton (один на всё приложение, не пересоздаётся StrictMode) ──
let _wsInstance: WebSocket | null = null
let _wsListeners = new Set<(e: object) => void>()
let _wsDead = false

export function getWS() {
  // Dev: WS на своём origin через Vite-прокси (/api → API, ws:true). Прод: как раньше.
  const WS_BASE = import.meta.env.DEV
    ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/chats/ws`
    : ((import.meta.env.VITE_API_URL ?? 'http://localhost:4000') as string).replace(/^http/, 'ws') + '/chats/ws'

  if (_wsInstance && (_wsInstance.readyState === WebSocket.OPEN || _wsInstance.readyState === WebSocket.CONNECTING)) {
    return
  }

  async function connect() {
    if (_wsDead) return
    let token: string
    try {
      // api (axios) добавляет Supabase Bearer + куку (withCredentials) — работает в проде,
      // где cookie-only fetch отдавал 401 (нет access_token cookie при Supabase-входе).
      const r = await api.get('/chats/ws-token')
      token = r.data.token
    } catch {
      setTimeout(connect, 5000)
      return
    }
    const ws = new WebSocket(`${WS_BASE}?token=${encodeURIComponent(token)}`)
    _wsInstance = ws

    let ping: ReturnType<typeof setInterval>
    ws.onopen  = () => { ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: 'ping' })), 25_000) }
    ws.onmessage = (e) => { try { const d = JSON.parse(e.data); _wsListeners.forEach(fn => fn(d)) } catch { /* ignore */ } }
    ws.onclose = () => { clearInterval(ping); _wsInstance = null; if (!_wsDead) setTimeout(connect, 3000) }
    ws.onerror = () => ws.close()
  }
  connect()
}

export function disconnectWS() {
  _wsDead = true
  _wsInstance?.close()
  _wsInstance = null
  _wsListeners.clear()
}

export function useChatWS(onEvent: (e: object) => void) {
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  useEffect(() => {
    _wsDead = false
    const handler = (e: object) => onEventRef.current(e)
    _wsListeners.add(handler)
    getWS()
    return () => { _wsListeners.delete(handler) }
  }, [])
}
