import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, ClipboardList, MessageSquare, Calendar as CalendarIcon, CheckCheck } from 'lucide-react'
import { api } from '../lib/api'
import { NOTIF_SEEN_LS_KEY } from '../hooks/useNotificationsBadge'

// Панель уведомлений (эталон v2 Notifications.tsx): derived-агрегатор.
// «Прочитанность» ленты — клиентская метка в localStorage (mark-all-read сдвигает её).

type NotifItem = { id: string; kind: 'task' | 'calendar'; text: string; at: string; taskId?: string; eventId?: string }
type NotifData = { tasks: NotifItem[]; events: NotifItem[] }

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.round(diff / 60_000)
  if (min < 1) return 'только что'
  if (min < 60) return `${min} мин назад`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} ч назад`
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

export function NotificationsPanel({ unreadChats, onClose, onOpenPage, onOpenChats, fullWidth = false }: {
  unreadChats: number
  fullWidth?: boolean
  onClose: () => void
  onOpenPage: (page: string) => void
  onOpenChats: () => void
}) {
  const { data, isLoading } = useQuery<NotifData>({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications').then(r => r.data),
    refetchOnMount: 'always',
  })
  const [seenAt, setSeenAt] = useState(() => localStorage.getItem(NOTIF_SEEN_LS_KEY) ?? '')

  // esc — закрыть
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const markAllRead = () => {
    const now = new Date().toISOString()
    localStorage.setItem(NOTIF_SEEN_LS_KEY, now)
    setSeenAt(now)
  }

  const groups = useMemo(() => ([
    { key: 'task', label: 'Задачи', icon: ClipboardList, items: data?.tasks ?? [] },
    { key: 'calendar', label: 'Календарь', icon: CalendarIcon, items: data?.events ?? [] },
  ]), [data])

  return (
    <div onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 250, background: 'rgba(0,0,0,0.25)' }}>
      <div style={{
        position: 'absolute', top: 0, bottom: 0, left: fullWidth ? 0 : 220, width: fullWidth ? '100%' : 380, maxWidth: fullWidth ? '100%' : '90vw',
        background: 'var(--surface-1)', borderRight: '1px solid var(--border)',
        boxShadow: '8px 0 28px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', flex: 1 }}>Уведомления</span>
          <button onClick={markAllRead} title="Отметить всё прочитанным"
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'none', color: 'var(--text-3)', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer' }}>
            <CheckCheck size={13} /> Прочитано
          </button>
          <button onClick={onClose} style={{ border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}><X size={16} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Чаты — счётчик-ссылка */}
          {unreadChats > 0 && (
            <button onClick={() => { onClose(); onOpenChats() }} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10,
              border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
            }}>
              <MessageSquare size={15} style={{ color: '#0EA5E9', flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 14, color: 'var(--text-1)' }}>Непрочитанные сообщения</span>
              <span style={{ background: '#7B61FF', color: '#fff', fontSize: 12, fontWeight: 700, borderRadius: 10, padding: '1px 7px' }}>{unreadChats}</span>
            </button>
          )}

          {isLoading && <div style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', padding: 20 }}>Загрузка…</div>}

          {groups.map(g => {
            const Icon = g.icon
            if (!g.items.length) return null
            return (
              <div key={g.key}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, padding: '0 2px' }}>
                  <Icon size={12} style={{ color: 'var(--text-muted)' }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{g.label}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {g.items.map(item => {
                    const fresh = g.key === 'task' ? item.at > seenAt : false
                    return (
                      <button key={item.id}
                        onClick={() => { onClose(); onOpenPage(item.kind === 'task' ? 'tasks' : 'calendar') }}
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 11px', borderRadius: 9,
                          border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                          background: fresh ? 'rgba(99,102,241,0.08)' : 'var(--surface-2)',
                        }}>
                        {fresh && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary, #4f46e5)', marginTop: 5, flexShrink: 0 }} />}
                        <span style={{ flex: 1, fontSize: 12, color: 'var(--text-1)', lineHeight: 1.45 }}>
                          {item.text}
                          <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{relTime(item.at)}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {!isLoading && unreadChats === 0 && groups.every(g => g.items.length === 0) && (
            <div style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', padding: 30 }}>Тишина — уведомлений нет</div>
          )}
        </div>
      </div>
    </div>
  )
}