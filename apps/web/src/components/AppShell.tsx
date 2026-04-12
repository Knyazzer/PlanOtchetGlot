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
import { SyncDataPage } from '../pages/SyncDataPage'
import { DealsPage } from '../pages/DealsPage'

type Page = 'calendar' | 'analytics' | 'users' | 'tasks' | 'profile' | 'syncdata' | 'deals'

export function AppShell() {
  const user = useCurrentUser()
  const isAdmin = useIsAdmin()
  const isProducer = useIsProducer()
  const setUser = useAuthStore((s) => s.setUser)
  const [page, setPage] = useState<Page>(() => {
    const saved = localStorage.getItem('app-page') as Page | null
    const valid: Page[] = ['calendar', 'analytics', 'users', 'tasks', 'profile', 'syncdata', 'deals']
    return saved && valid.includes(saved) ? saved : 'calendar'
  })

  async function handleLogout() {
    await api.post('/auth/logout')
    setUser(null)
  }

  const navItems: { id: Page; label: string; adminOnly?: boolean }[] = [
    { id: 'calendar', label: 'Календарь' },
    { id: 'tasks', label: 'Задачи' },
    { id: 'analytics', label: 'Аналитика', adminOnly: true },
    { id: 'users', label: 'Сотрудники', adminOnly: true },
    { id: 'syncdata', label: 'Таблицы', adminOnly: true },
    { id: 'deals', label: 'Проекты' },
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
                  onClick={() => { setPage(item.id); localStorage.setItem('app-page', item.id) }}
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
      <main style={{ flex: 1, padding: '20px 16px' }}>
        {page === 'calendar' && <CalendarPage />}
        {page === 'tasks' && <TasksPage />}
        {page === 'analytics' && (isAdmin || isProducer) && <AnalyticsPage />}
        {page === 'users' && isAdmin && <UsersPage />}
        {page === 'syncdata' && isAdmin && <SyncDataPage />}
        {page === 'deals' && <DealsPage />}
        {page === 'profile' && <ProfilePage />}
      </main>
    </div>
  )
}

// ─── NotificationBell ─────────────────────────────────────────────────────────

function NotificationBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

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
          fontSize: 18,
          lineHeight: 1,
        }}
        title="Уведомления"
      >
        🔔
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          right: 0,
          top: 'calc(100% + 8px)',
          width: 320,
          background: '#fff',
          borderRadius: 10,
          boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
          border: '1px solid #e2e8f0',
          zIndex: 200,
          padding: 24,
          textAlign: 'center',
          color: '#94a3b8',
        }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🚧</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Уведомления</div>
          <div style={{ fontSize: 13 }}>В разработке</div>
        </div>
      )}
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
  const ref = useRef<HTMLDivElement>(null)

  // Всегда опрашиваем логи — состояние синка сохраняется после обновления страницы
  const { data: logs = [] } = useQuery<SyncLog[]>({
    queryKey: ['sync-logs'],
    queryFn: () => api.get('/sync/logs', { params: { limit: 500 } }).then((r) => r.data),
    refetchInterval: (query) => {
      const data = (query.state.data as SyncLog[] ?? [])
      const running = data.some((l) => l.status === 'running')
      // Держим быстрый опрос пока ожидаем матрицы (даже в паузах между ними)
      const total = parseInt(sessionStorage.getItem('sync-total-matrices') ?? '0', 10)
      const done = data.filter((l) => l.type === 'matrix' && l.status !== 'running').length
      return (running || (total > 0 && done < total)) ? 2000 : 30_000
    },
  })

  // totalMatrices от бэкенда при триггере, сохраняем в sessionStorage чтобы не терять при refresh
  const [totalMatrices, setTotalMatrices] = useState<number>(() =>
    parseInt(sessionStorage.getItem('sync-total-matrices') ?? '0', 10)
  )

  const trigger = useMutation({
    mutationFn: () => api.post('/sync/trigger'),
    onSuccess: (res) => {
      const total = res.data?.totalMatrices ?? 0
      setTotalMatrices(total)
      sessionStorage.setItem('sync-total-matrices', String(total))
      setShowLogs(true)
      qc.invalidateQueries({ queryKey: ['sync-logs'] })
    },
  })

  const stop = useMutation({
    mutationFn: () => api.post('/sync/stop'),
    onSuccess: () => {
      sessionStorage.removeItem('sync-total-matrices')
      setTotalMatrices(0)
      qc.invalidateQueries({ queryKey: ['sync-logs'] })
    },
  })

  // Берём только логи последней сессии — нужно до matrixDone/matrixTotal для isRunning
  const lastProjectLogEarly = logs.find((l) => l.type === 'projects')
  const sessionStartEarly = lastProjectLogEarly?.startedAt ?? null
  const sessionLogsEarly = sessionStartEarly
    ? logs.filter((l) => new Date(l.startedAt) >= new Date(sessionStartEarly))
    : logs
  const matrixLogsEarly = sessionLogsEarly.filter((l) => l.type === 'matrix')
  const matrixDoneEarly = matrixLogsEarly.filter((l) => l.status !== 'running').length

  // isRunning остаётся true пока не все матрицы обработаны (не сбрасываем в паузах между ними)
  const logsRunning = logs.some((l) => l.status === 'running') || trigger.isPending
  const matricesStillExpected = totalMatrices > 0 && matrixDoneEarly < totalMatrices
  const isRunning = logsRunning || matricesStillExpected

  // Когда синк завершился — инвалидируем данные страниц
  const prevRunning = useRef(false)
  useEffect(() => {
    if (prevRunning.current && !isRunning && logs.length > 0) {
      qc.invalidateQueries({ queryKey: ['status-rows'] })
      qc.invalidateQueries({ queryKey: ['status-rows-sync'] })
      qc.invalidateQueries({ queryKey: ['sync-registry'] })
      sessionStorage.removeItem('sync-total-matrices')
      setTotalMatrices(0)
    }
    prevRunning.current = isRunning
  }, [isRunning, logs.length, qc])

  const displayLogs   = sessionLogsEarly.filter((l) => l.type === 'projects' || l.type === 'registry')
  const canStop       = isRunning && displayLogs.length > 0 && displayLogs.every((l) => l.status !== 'running')
  const matrixLogs    = matrixLogsEarly
  const matrixRunning = matrixLogs.filter((l) => l.status === 'running').length
  const matrixDone    = matrixDoneEarly
  const matrixErrors  = matrixLogs.filter((l) => l.status === 'error').length
  const matrixShifts  = matrixLogs.reduce((s, l) => s + (l.changesCount ?? 0), 0)
  const matrixTotal   = totalMatrices > 0 ? totalMatrices : null

  const lastDone = displayLogs.find((l) => l.status !== 'running' && l.type === 'projects')

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
            {canStop ? (
              <button
                onClick={() => stop.mutate()}
                disabled={stop.isPending}
                style={{
                  background: stop.isPending ? '#fca5a5' : '#ef4444',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '7px 16px',
                  fontSize: 14,
                  cursor: stop.isPending ? 'default' : 'pointer',
                  fontWeight: 500,
                }}
              >
                {stop.isPending ? 'Остановка...' : 'Остановить'}
              </button>
            ) : (
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
            )}
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {isRunning && (
              <div style={{ padding: '14px 16px', fontSize: 14, color: '#f59e0b', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 8, alignItems: 'center' }}>
                <span>⟳</span> Синхронизация выполняется...
              </div>
            )}
            {displayLogs.length === 0 && !isRunning && (
              <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 15 }}>
                История пуста
              </div>
            )}
            {displayLogs.map((log) => (
              <div key={log.id} style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{
                      fontSize: 12, padding: '2px 8px', borderRadius: 8, fontWeight: 600,
                      background: log.status === 'success' ? '#dcfce7' : log.status === 'error' ? '#fee2e2' : '#fef3c7',
                      color: log.status === 'success' ? '#16a34a' : log.status === 'error' ? '#dc2626' : '#b45309',
                    }}>
                      {log.status === 'success' ? '✓ OK' : log.status === 'error' ? '✗ Ошибка' : '⟳ ...'}
                    </span>
                    <span style={{ fontSize: 14, color: '#374151' }}>
                      {log.type === 'projects' ? 'Таблица проектов' : 'Реестр матриц'}
                    </span>
                    {log.changesCount > 0 && (
                      <span style={{ fontSize: 11, color: '#64748b' }}>{log.changesCount}</span>
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
            {(matrixLogs.length > 0 || (isRunning && matrixTotal !== null)) && (
              <div style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{
                      fontSize: 12, padding: '2px 8px', borderRadius: 8, fontWeight: 600,
                      background: matrixRunning > 0 ? '#fef3c7' : matrixErrors > 0 ? '#fee2e2' : '#dcfce7',
                      color: matrixRunning > 0 ? '#b45309' : matrixErrors > 0 ? '#dc2626' : '#16a34a',
                    }}>
                      {matrixRunning > 0
                        ? `⟳ ${matrixDone}/${matrixTotal ?? '?'}`
                        : matrixErrors > 0
                          ? `✗ ${matrixErrors} ошибок`
                          : `✓ ${matrixDone}${matrixTotal ? `/${matrixTotal}` : ''}`}
                    </span>
                    <span style={{ fontSize: 14, color: '#374151' }}>Матрицы</span>
                    {matrixShifts > 0 && <span style={{ fontSize: 11, color: '#64748b' }}>+{matrixShifts} смен</span>}
                    {matrixErrors > 0 && matrixRunning === 0 && (
                      <span style={{ fontSize: 11, color: '#ef4444' }}>{matrixErrors} ошибок</span>
                    )}
                  </div>
                  {matrixLogs[matrixLogs.length - 1] && (
                    <span style={{ fontSize: 13, color: '#94a3b8' }}>
                      {format(new Date(matrixLogs[matrixLogs.length - 1].startedAt), 'd MMM HH:mm', { locale: ru })}
                    </span>
                  )}
                </div>
              </div>
            )}
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
