import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { X, ClipboardList, MessageSquare, Calendar as CalendarIcon, CheckCheck, Inbox, GitBranch } from 'lucide-react'
import { api } from '../lib/api'
import { NOTIF_SEEN_LS_KEY, getReadNotifIds, markNotifRead } from '../hooks/useNotificationsBadge'

// Панель уведомлений (эталон v2 Notifications.tsx): derived-агрегатор.
// «Прочитанность» ленты — клиентская метка в localStorage (mark-all-read сдвигает её).

type NotifItem = { id: string; kind: 'task' | 'calendar' | 'request' | 'track'; text: string; at: string; taskId?: string; eventId?: string; requestId?: string; trackId?: string; unseen?: boolean }
type NotifData = { tasks: NotifItem[]; events: NotifItem[]; requests?: NotifItem[]; tracks?: NotifItem[] }

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.round(diff / 60_000)
  if (min < 1) return 'только что'
  if (min < 60) return `${min} мин назад`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} ч назад`
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

export function NotificationsPanel({ unreadChats, onClose, onOpenPage, onOpenTaskCard, onOpenChats, onOpenRequests, onOpenTracks, anchor = null, fullWidth = false }: {
  unreadChats: number
  fullWidth?: boolean
  anchor?: { top: number; right: number } | null // позиция под колокольчиком (десктоп); привязка к иконке
  onClose: () => void
  onOpenPage: (page: string) => void
  onOpenTaskCard: (taskId: string) => void
  onOpenChats: () => void
  onOpenRequests: () => void
  onOpenTracks: () => void
}) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery<NotifData>({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications').then(r => r.data),
    refetchOnMount: 'always',
  })
  const [seenAt, setSeenAt] = useState(() => localStorage.getItem(NOTIF_SEEN_LS_KEY) ?? '')
  const [readIds, setReadIds] = useState(() => getReadNotifIds()) // прочитанные по одному (клик = прочитано)
  const mdRef = useRef(false) // клик-вне закрывает только если mousedown И mouseup на подложке (правило попапов)

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
    // Уведомления о назначении держатся на Task.seenAt — помечаем все назначенные мне задачи прочитанными.
    api.post('/tasks/seen-all').then(() => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['tasks:unseen'] })
    }).catch(() => {})
  }

  const groups = useMemo(() => ([
    { key: 'task', label: 'Задачи', icon: ClipboardList, items: data?.tasks ?? [] },
    { key: 'track', label: 'Треки', icon: GitBranch, items: data?.tracks ?? [] },
    { key: 'request', label: 'Заявки', icon: Inbox, items: data?.requests ?? [] },
    { key: 'calendar', label: 'Календарь', icon: CalendarIcon, items: data?.events ?? [] },
  ]), [data])

  // В пуле показываем ТОЛЬКО непрочитанные (прочитанные — по readIds/seenAt/метке — исчезают).
  // Календарь-события «прочтения» не имеют — показываем всегда.
  const isReadable = (k: string) => k === 'task' || k === 'request' || k === 'track'
  const visibleOf = (g: { key: string; items: NotifItem[] }) =>
    g.items.filter(item => !isReadable(g.key) || (!readIds.has(item.id) && (item.unseen || item.at > seenAt)))
  const anyUnread = groups.some(g => visibleOf(g).length > 0)

  return (
    <div
      onMouseDown={e => { mdRef.current = e.target === e.currentTarget }}
      onMouseUp={e => { if (mdRef.current && e.target === e.currentTarget) onClose(); mdRef.current = false }}
      style={{ position: 'fixed', inset: 0, zIndex: 250, background: 'transparent' }}>
      {/* Плавающая карточка у колокольчика (справа-сверху): не во весь экран, без затемнения фона,
          с зум-анимацией из угла. Клик по свободному месту закрывает (mousedown+mouseup на подложке). */}
      <style>{`@keyframes notifPop{from{opacity:0;transform:scale(0.92)}to{opacity:1;transform:scale(1)}}`}</style>
      <div style={{
        position: 'absolute',
        ...(fullWidth
          ? { top: 56, left: 8, right: 8, maxHeight: 'calc(100vh - 72px)' }
          : { top: anchor?.top ?? 58, right: anchor?.right ?? 14, width: 380, maxWidth: '92vw', maxHeight: `min(72vh, calc(100vh - ${(anchor?.top ?? 58) + 16}px))` }),
        background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 14,
        boxShadow: '0 18px 50px -12px rgba(0,0,0,0.45)', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        transformOrigin: 'top right', animation: 'notifPop 0.14s ease-out',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', flex: 1 }}>Уведомления</span>
          <button onClick={markAllRead} title="Отметить все уведомления прочитанными"
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'none', color: 'var(--text-3)', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer' }}>
            <CheckCheck size={13} /> Прочитать всё
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
            const visible = visibleOf(g)
            if (!visible.length) return null
            return (
              <div key={g.key}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, padding: '0 2px' }}>
                  <Icon size={12} style={{ color: 'var(--text-muted)' }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{g.label}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {visible.map(item => {
                    const fresh = isReadable(g.key) // все видимые readable — непрочитанные (точка); календарь — без точки
                    return (
                      <button key={item.id}
                        onClick={() => {
                          markNotifRead(item.id); setReadIds(getReadNotifIds()) // клик по уведомлению = прочитано (в т.ч. логовые)
                          if (item.kind === 'task' && item.taskId) { onOpenTaskCard(item.taskId); return } // открыть карточку + обводка на доске
                          onClose()
                          if (item.kind === 'request') onOpenRequests(); else if (item.kind === 'track') onOpenTracks(); else onOpenPage('calendar')
                        }}
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

          {!isLoading && unreadChats === 0 && !anyUnread && (
            <div style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', padding: 30 }}>Тишина — уведомлений нет</div>
          )}
        </div>
      </div>
    </div>
  )
}