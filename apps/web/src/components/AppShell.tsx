import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { useCurrentUser, useIsAdmin, useIsProducer } from '../hooks/useAuth'
import { useAuthStore } from '../stores/auth'
import { api } from '../lib/api'
import { CalendarPage } from '../pages/CalendarPage'
import { UsersPage } from '../pages/UsersPage'
import { TasksPage } from '../pages/TasksPage'
import { ProfilePage } from '../pages/ProfilePage'
import { AnalyticsPage } from '../pages/AnalyticsPage'

type Page = 'calendar' | 'analytics' | 'users' | 'tasks' | 'profile'

export function AppShell() {
  const user = useCurrentUser()
  const isAdmin = useIsAdmin()
  const isProducer = useIsProducer()
  const setUser = useAuthStore((s) => s.setUser)
  const [page, setPage] = useState<Page>('calendar')

  async function handleLogout() {
    await api.post('/auth/logout')
    setUser(null)
  }

  const navItems: { id: Page; label: string; adminOnly?: boolean }[] = [
    { id: 'calendar', label: 'Календарь' },
    { id: 'tasks', label: 'Задачи' },
    { id: 'analytics', label: 'Аналитика', adminOnly: true },
    { id: 'users', label: 'Сотрудники', adminOnly: true },
    { id: 'profile', label: 'Профиль' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#f8fafc' }}>
      {/* Header */}
      <header style={{
        background: '#1e293b',
        color: '#fff',
        padding: '0 24px',
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: '-0.3px' }}>TV Shifts</span>
          <nav style={{ display: 'flex', gap: 4 }}>
            {navItems.map((item) => {
              if (item.adminOnly && !isAdmin) return null
              return (
                <button
                  key={item.id}
                  onClick={() => setPage(item.id)}
                  style={{
                    background: page === item.id ? 'rgba(255,255,255,0.15)' : 'transparent',
                    border: 'none',
                    color: '#fff',
                    padding: '8px 16px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 15,
                    fontWeight: page === item.id ? 600 : 400,
                  }}
                >
                  {item.label}
                </button>
              )
            })}
          </nav>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {(isAdmin || isProducer) && <SyncButton />}
          <NotificationBell />
          <span style={{ fontSize: 14, color: '#94a3b8' }}>{user?.fullName}</span>
          <span style={{
            fontSize: 12,
            padding: '3px 10px',
            borderRadius: 10,
            background: roleColor(user?.role),
            color: '#fff',
            fontWeight: 500,
          }}>
            {roleLabel(user?.role)}
          </span>
          <button
            onClick={handleLogout}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.2)',
              color: '#fff',
              padding: '5px 12px',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Выйти
          </button>
        </div>
      </header>

      {/* Main */}
      <main style={{ flex: 1, padding: 28 }}>
        {page === 'calendar' && <CalendarPage />}
        {page === 'tasks' && <TasksPage />}
        {page === 'analytics' && (isAdmin || isProducer) && <AnalyticsPage />}
        {page === 'users' && isAdmin && <UsersPage />}
        {page === 'profile' && <ProfilePage />}
      </main>
    </div>
  )
}

// ─── NotificationBell ─────────────────────────────────────────────────────────

interface Notification {
  id: string
  type: string
  message: string
  isRead: boolean
  createdAt: string
  entityType: string | null
}

const NOTIF_TYPE_LABELS: Record<string, string> = {
  no_matrix: 'Нет матрицы',
  unmatched_name: 'Неизвестный сотрудник',
  data_conflict: 'Конфликт данных',
  schedule_change: 'Изменение расписания',
}

function NotificationBell() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const { data: countData } = useQuery<{ count: number }>({
    queryKey: ['notifications-count'],
    queryFn: () => api.get('/notifications/count').then((r) => r.data),
    refetchInterval: 60_000,
  })

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications').then((r) => r.data),
    enabled: open,
  })

  const readAll = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['notifications-count'] })
    },
  })

  const readOne = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['notifications-count'] })
    },
  })

  // Закрываем при клике вне
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const count = countData?.count ?? 0
  const unread = notifications.filter((n) => !n.isRead)
  const read = notifications.filter((n) => n.isRead)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          background: open ? 'rgba(255,255,255,0.15)' : 'transparent',
          border: 'none',
          color: '#fff',
          cursor: 'pointer',
          padding: '6px 8px',
          borderRadius: 6,
          position: 'relative',
          fontSize: 18,
          lineHeight: 1,
        }}
        title="Уведомления"
      >
        🔔
        {count > 0 && (
          <span style={{
            position: 'absolute',
            top: 2,
            right: 2,
            background: '#ef4444',
            color: '#fff',
            borderRadius: '50%',
            width: 16,
            height: 16,
            fontSize: 10,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
          }}>
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          right: 0,
          top: 'calc(100% + 8px)',
          width: 420,
          background: '#fff',
          borderRadius: 10,
          boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
          border: '1px solid #e2e8f0',
          zIndex: 200,
          maxHeight: 480,
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: 16 }}>Уведомления</span>
            {unread.length > 0 && (
              <button
                onClick={() => readAll.mutate()}
                style={{ background: 'none', border: 'none', fontSize: 14, color: '#2563eb', cursor: 'pointer' }}
              >
                Прочитать все
              </button>
            )}
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {notifications.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 15 }}>
                Нет уведомлений
              </div>
            ) : (
              <>
                {unread.map((n) => (
                  <NotifItem key={n.id} notif={n} onRead={() => readOne.mutate(n.id)} />
                ))}
                {read.length > 0 && unread.length > 0 && (
                  <div style={{ padding: '8px 16px', fontSize: 13, color: '#94a3b8', background: '#f8fafc', borderTop: '1px solid #f1f5f9' }}>
                    Прочитанные
                  </div>
                )}
                {read.map((n) => (
                  <NotifItem key={n.id} notif={n} />
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function NotifItem({ notif, onRead }: { notif: Notification; onRead?: () => void }) {
  return (
    <div
      onClick={onRead}
      style={{
        padding: '10px 16px',
        borderBottom: '1px solid #f1f5f9',
        background: notif.isRead ? '#fff' : '#eff6ff',
        cursor: onRead ? 'pointer' : 'default',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
      }}
    >
      {!notif.isRead && (
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#2563eb', marginTop: 5, flexShrink: 0 }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 2 }}>
          {NOTIF_TYPE_LABELS[notif.type] ?? notif.type}
        </div>
        <div style={{ fontSize: 14, color: '#1e293b', lineHeight: 1.5 }}>{notif.message}</div>
      </div>
    </div>
  )
}

// ─── SyncButton ───────────────────────────────────────────────────────────────

interface SyncLog {
  id: string
  type: string
  status: 'running' | 'success' | 'error'
  changesCount: number
  errors: string[]
  startedAt: string
  finishedAt: string | null
  targetId: string | null
}

function SyncButton() {
  const qc = useQueryClient()
  const [showLogs, setShowLogs] = useState(false)
  const [justTriggered, setJustTriggered] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const { data: logs = [] } = useQuery<SyncLog[]>({
    queryKey: ['sync-logs'],
    queryFn: () => api.get('/sync/logs', { params: { limit: 20 } }).then((r) => r.data),
    enabled: showLogs,
    refetchInterval: justTriggered ? 3000 : false,
  })

  const trigger = useMutation({
    mutationFn: () => api.post('/sync/trigger'),
    onSuccess: () => {
      setJustTriggered(true)
      setShowLogs(true)
      setTimeout(() => {
        setJustTriggered(false)
        qc.invalidateQueries({ queryKey: ['sync-logs'] })
        qc.invalidateQueries({ queryKey: ['projects'] })
        qc.invalidateQueries({ queryKey: ['projects-unconfirmed'] })
      }, 15000)
    },
  })

  // Последний завершённый лог
  const lastDone = logs.find((l) => l.status !== 'running' && l.type === 'projects')
  const isRunning = logs.some((l) => l.status === 'running') || trigger.isPending

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setShowLogs(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const statusColor = isRunning ? '#f59e0b' : lastDone?.status === 'error' ? '#ef4444' : '#10b981'

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => {
          if (!isRunning) trigger.mutate()
          setShowLogs((v) => !v)
        }}
        title={isRunning ? 'Синхронизация...' : 'Синхронизировать с Google Sheets'}
        style={{
          background: showLogs ? 'rgba(255,255,255,0.15)' : 'transparent',
          border: '1px solid rgba(255,255,255,0.2)',
          color: '#fff',
          padding: '5px 10px',
          borderRadius: 6,
          cursor: isRunning ? 'default' : 'pointer',
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span style={{ fontSize: 14, display: 'inline-block', animation: isRunning ? 'spin 1s linear infinite' : 'none' }}>
          {isRunning ? '⟳' : '↻'}
        </span>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
        {lastDone && !isRunning && (
          <span style={{ fontSize: 11, color: '#94a3b8' }}>
            {format(new Date(lastDone.startedAt), 'HH:mm', { locale: ru })}
          </span>
        )}
      </button>

      {showLogs && (
        <div style={{
          position: 'absolute',
          right: 0,
          top: 'calc(100% + 8px)',
          width: 440,
          background: '#fff',
          borderRadius: 10,
          boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
          border: '1px solid #e2e8f0',
          zIndex: 200,
          maxHeight: 400,
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: 16 }}>Синхронизация</span>
            <button
              onClick={() => { if (!isRunning) trigger.mutate() }}
              disabled={isRunning}
              style={{
                background: isRunning ? '#e2e8f0' : '#2563eb',
                color: isRunning ? '#94a3b8' : '#fff',
                border: 'none',
                borderRadius: 6,
                padding: '7px 16px',
                fontSize: 14,
                cursor: isRunning ? 'default' : 'pointer',
                fontWeight: 500,
              }}
            >
              {isRunning ? 'Выполняется...' : 'Запустить'}
            </button>
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {isRunning && (
              <div style={{ padding: '14px 16px', fontSize: 14, color: '#f59e0b', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 8, alignItems: 'center' }}>
                <span>⟳</span> Синхронизация выполняется...
              </div>
            )}
            {logs.length === 0 && !isRunning && (
              <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 15 }}>
                История пуста
              </div>
            )}
            {logs.map((log) => (
              <div key={log.id} style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{
                      fontSize: 12,
                      padding: '2px 8px',
                      borderRadius: 8,
                      fontWeight: 600,
                      background: log.status === 'success' ? '#dcfce7' : log.status === 'error' ? '#fee2e2' : '#fef3c7',
                      color: log.status === 'success' ? '#16a34a' : log.status === 'error' ? '#dc2626' : '#b45309',
                    }}>
                      {log.status === 'success' ? '✓ OK' : log.status === 'error' ? '✗ Ошибка' : '⟳ ...'}
                    </span>
                    <span style={{ fontSize: 14, color: '#374151' }}>
                      {log.type === 'projects' ? 'Проекты' : log.type === 'registry' ? 'Реестр' : `Матрица ${log.targetId ?? ''}`}
                    </span>
                    {log.changesCount > 0 && (
                      <span style={{ fontSize: 11, color: '#64748b' }}>+{log.changesCount}</span>
                    )}
                  </div>
                  <span style={{ fontSize: 13, color: '#94a3b8' }}>
                    {format(new Date(log.startedAt), 'd MMM HH:mm', { locale: ru })}
                  </span>
                </div>
                {log.errors?.length > 0 && (
                  <div style={{ fontSize: 13, color: '#dc2626', marginTop: 4 }}>
                    {log.errors.slice(0, 2).join(' · ')}
                    {log.errors.length > 2 && ` +${log.errors.length - 2}`}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function roleLabel(role?: string) {
  if (role === 'admin') return 'Администратор'
  if (role === 'producer') return 'Продюсер'
  return 'Сотрудник'
}

function roleColor(role?: string) {
  if (role === 'admin') return '#7c3aed'
  if (role === 'producer') return '#0891b2'
  return '#16a34a'
}
