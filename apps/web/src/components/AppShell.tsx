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
import { DatabasePage } from '../pages/DatabasePage'

type Page = 'calendar' | 'analytics' | 'users' | 'tasks' | 'profile' | 'syncdata' | 'deals' | 'database'

export function AppShell() {
  const user = useCurrentUser()
  const isAdmin = useIsAdmin()
  const isProducer = useIsProducer()
  const setUser = useAuthStore((s) => s.setUser)
  const [page, setPage] = useState<Page>(() => {
    const saved = localStorage.getItem('app-page') as Page | null
    const valid: Page[] = ['calendar', 'analytics', 'users', 'tasks', 'profile', 'syncdata', 'deals', 'database']
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
    { id: 'database', label: 'БД', adminOnly: true },
    { id: 'deals', label: 'Клиенты' },
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
        position: 'sticky',
        top: 0,
        zIndex: 100,
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
        {page === 'database' && isAdmin && <DatabasePage />}
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

function SyncLogRow({ log, label }: { log: SyncLog; label: string }) {
  return (
    <div style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{
            fontSize: 12, padding: '2px 8px', borderRadius: 8, fontWeight: 600,
            background: log.status === 'success' ? '#dcfce7' : log.status === 'error' ? '#fee2e2' : '#fef3c7',
            color: log.status === 'success' ? '#16a34a' : log.status === 'error' ? '#dc2626' : '#b45309',
          }}>
            {log.status === 'success' ? '✓ OK' : log.status === 'error' ? '✗ Ошибка' : '⟳ ...'}
          </span>
          <span style={{ fontSize: 14, color: '#374151' }}>{label}</span>
          {log.changesCount > 0 && <span style={{ fontSize: 11, color: '#64748b' }}>{log.changesCount}</span>}
        </div>
        <span style={{ fontSize: 13, color: '#94a3b8' }}>
          {format(new Date(log.startedAt), 'd MMM HH:mm', { locale: ru })}
        </span>
      </div>
      {log.errors?.length > 0 && (
        <div style={{ fontSize: 12, color: '#dc2626', marginTop: 3 }}>
          {log.errors.slice(0, 2).join(' · ')}
          {log.errors.length > 2 && ` +${log.errors.length - 2}`}
        </div>
      )}
    </div>
  )
}

function SyncButton() {
  const qc = useQueryClient()
  const [showLogs, setShowLogs] = useState(false)
  const [showMatrixErrors, setShowMatrixErrors] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // sessionStartMs ставится ДО запроса — чтобы сразу скрыть старые логи
  const [sessionStartMs, setSessionStartMs] = useState<number>(() =>
    parseInt(sessionStorage.getItem('sync-session-start') ?? '0', 10)
  )
  const [totalMatrices, setTotalMatrices] = useState<number>(() =>
    parseInt(sessionStorage.getItem('sync-total-matrices') ?? '0', 10)
  )

  // Опрос логов
  const { data: logs = [] } = useQuery<SyncLog[]>({
    queryKey: ['sync-logs'],
    queryFn: () => api.get('/sync/logs', { params: { limit: 500 } }).then((r) => r.data),
    refetchInterval: (query) => {
      const data = query.state.data as SyncLog[] ?? []
      const running = data.some((l) => l.status === 'running')
      const total = parseInt(sessionStorage.getItem('sync-total-matrices') ?? '0', 10)
      const start = parseInt(sessionStorage.getItem('sync-session-start') ?? '0', 10)
      const sessionData = start > 0 ? data.filter((l) => new Date(l.startedAt).getTime() >= start - 10_000) : data
      const done = sessionData.filter((l) => l.type === 'matrix' && l.status !== 'running').length
      return (running || (total > 0 && done < total)) ? 2000 : 30_000
    },
  })

  const trigger = useMutation({
    // onMutate: ставим sessionStart ДО отправки запроса — сразу прячем старые логи
    onMutate: () => {
      const now = Date.now()
      setSessionStartMs(now)
      sessionStorage.setItem('sync-session-start', String(now))
      setShowLogs(true)
    },
    mutationFn: () => api.post('/sync/trigger'),
    onSuccess: (res) => {
      const total = res.data?.totalMatrices ?? 0
      setTotalMatrices(total)
      sessionStorage.setItem('sync-total-matrices', String(total))
      qc.invalidateQueries({ queryKey: ['sync-logs'] })
    },
  })

  const stop = useMutation({
    mutationFn: () => api.post('/sync/stop'),
    onSuccess: () => {
      sessionStorage.removeItem('sync-total-matrices')
      sessionStorage.removeItem('sync-session-start')
      setTotalMatrices(0)
      setSessionStartMs(0)
      qc.invalidateQueries({ queryKey: ['sync-logs'] })
    },
  })

  // Логи текущей сессии — только после sessionStartMs (буфер 10с на серверное время)
  const sessionLogs  = sessionStartMs > 0
    ? logs.filter((l) => new Date(l.startedAt).getTime() >= sessionStartMs - 10_000)
    : logs
  const projectsLog  = sessionLogs.find((l) => l.type === 'projects') ?? null
  const registryLog  = sessionLogs.find((l) => l.type === 'registry') ?? null
  const anchorTime   = projectsLog ? new Date(projectsLog.startedAt).getTime() : 0
  const matrixLogs   = anchorTime > 0
    ? sessionLogs.filter((l) => l.type === 'matrix' && new Date(l.startedAt).getTime() >= anchorTime)
    : []

  const matrixDone    = matrixLogs.filter((l) => l.status !== 'running').length
  const matrixRunning = matrixLogs.filter((l) => l.status === 'running').length
  const matrixErrors  = matrixLogs.filter((l) => l.status === 'error').length
  const matrixShifts  = matrixLogs.reduce((s, l) => s + (l.changesCount ?? 0), 0)
  const matrixTotal   = totalMatrices > 0 ? totalMatrices : null

  const anyLogRunning   = logs.some((l) => l.status === 'running')
  const matricesPending = totalMatrices > 0 && matrixDone < totalMatrices
  const isRunning       = trigger.isPending || anyLogRunning || matricesPending

  // Таблицы завершены когда оба лога есть и не running
  // (registry может появиться с задержкой — не блокируем матрицы на это)
  const projectsDone    = !!projectsLog && projectsLog.status !== 'running'
  const registryDone    = !!registryLog && registryLog.status !== 'running'
  const tablesDone      = projectsDone && registryDone
  const showMatricesRow = matrixLogs.length > 0 || (projectsDone && matricesPending && matrixTotal !== null)
  const canStop         = projectsDone && (anyLogRunning || matricesPending)

  // Завершение — инвалидируем кеши страниц
  const prevRunning = useRef(false)
  useEffect(() => {
    if (prevRunning.current && !isRunning && sessionLogs.length > 0) {
      qc.invalidateQueries({ queryKey: ['status-rows'] })
      qc.invalidateQueries({ queryKey: ['status-rows-sync'] })
      qc.invalidateQueries({ queryKey: ['sync-registry'] })
      sessionStorage.removeItem('sync-total-matrices')
      sessionStorage.removeItem('sync-session-start')
      setTotalMatrices(0)
      setSessionStartMs(0)
    }
    prevRunning.current = isRunning
  }, [isRunning, sessionLogs.length, qc])

  const lastDone = !isRunning && projectsLog?.status !== 'running' ? projectsLog : null

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

      {showMatrixErrors && (() => {
        const allMatrixErrors = matrixLogs.flatMap((l) => l.errors ?? [])
        return (
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
            onMouseDown={() => setShowMatrixErrors(false)}
          >
            <div
              style={{ background: '#fff', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', width: 560, maxHeight: '70vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Ошибки матриц ({allMatrixErrors.length})</div>
                <button onClick={() => setShowMatrixErrors(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '2px 4px' }}>×</button>
              </div>
              <div style={{ overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {allMatrixErrors.map((err, i) => (
                  <div key={i} style={{ fontSize: 12, color: '#dc2626', background: '#fef2f2', borderRadius: 6, padding: '7px 10px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    {err}
                  </div>
                ))}
                {allMatrixErrors.length === 0 && (
                  <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: 16 }}>Ошибок нет</div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

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
          {/* Header */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 16 }}>Синхронизация</span>
              {isRunning && (
                <span style={{ fontSize: 13, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span>
                  Выполняется...
                </span>
              )}
            </div>
            {canStop ? (
              <button
                onClick={() => stop.mutate()}
                disabled={stop.isPending}
                style={{ background: stop.isPending ? '#fca5a5' : '#ef4444', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 14, cursor: stop.isPending ? 'default' : 'pointer', fontWeight: 500 }}
              >
                {stop.isPending ? 'Остановка...' : 'Остановить'}
              </button>
            ) : (
              <button
                onClick={() => { if (!isRunning) trigger.mutate() }}
                disabled={isRunning || trigger.isPending}
                style={{ background: isRunning || trigger.isPending ? '#e2e8f0' : '#2563eb', color: isRunning || trigger.isPending ? '#94a3b8' : '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 14, cursor: isRunning || trigger.isPending ? 'default' : 'pointer', fontWeight: 500 }}
              >
                Запустить
              </button>
            )}
          </div>

          {/* Rows */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {!projectsLog && !isRunning && (
              <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 15 }}>История пуста</div>
            )}

            {/* Projects row */}
            {projectsLog && <SyncLogRow log={projectsLog} label="Таблица проектов" />}

            {/* Registry row */}
            {registryLog && <SyncLogRow log={registryLog} label="Реестр матриц" />}

            {/* Matrices row — только после завершения обеих таблиц */}
            {showMatricesRow && (
              <div
                style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9', cursor: matrixErrors > 0 && matrixRunning === 0 ? 'pointer' : 'default' }}
                onClick={() => { if (matrixErrors > 0 && matrixRunning === 0) setShowMatrixErrors(true) }}
                title={matrixErrors > 0 && matrixRunning === 0 ? 'Нажмите чтобы увидеть ошибки' : undefined}
              >
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
                      <span style={{ fontSize: 11, color: '#ef4444', textDecoration: 'underline' }}>подробнее →</span>
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
