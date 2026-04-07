import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { ru } from 'date-fns/locale'
import { api } from '../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShiftStat {
  user: { id: string; fullName: string; tabNumber: string | null }
  total: number
  confirmed: number
  byType: { zastroyka: number; efir: number; demontazh: number }
  projects: number
}

interface ProjectStat {
  id: string
  name: string
  client: string | null
  date: string | null
  status: string
  assignments: { id: string; roleOnSite: string | null; user: { id: string; fullName: string } | null }[]
  _count: { shiftEntries: number }
}

interface TasksData {
  summary: { open: number; inProgress: number; done: number; total: number }
  tasks: {
    id: string; title: string; status: string; createdAt: string
    creator: { fullName: string }
    taskAssignments: { completedAt: string | null; user: { fullName: string } }[]
  }[]
}

interface ChangeLogEntry {
  id: string; entityType: string; entityId: string; field: string | null
  oldValue: string | null; newValue: string | null; changedAt: string; source: string
  user: { fullName: string } | null
}

type Tab = 'shifts' | 'projects' | 'tasks' | 'log'

// ─── AnalyticsPage ────────────────────────────────────────────────────────────

export function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>('shifts')
  const [month, setMonth] = useState(new Date())

  const dateFrom = format(startOfMonth(month), 'yyyy-MM-dd')
  const dateTo = format(endOfMonth(month), 'yyyy-MM-dd')

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Аналитика</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setMonth((d) => subMonths(d, 1))} style={navBtn}>‹</button>
          <span style={{ fontSize: 15, fontWeight: 600, minWidth: 140, textAlign: 'center' }}>
            {format(month, 'LLLL yyyy', { locale: ru })}
          </span>
          <button onClick={() => setMonth((d) => subMonths(d, -1))} style={navBtn}>›</button>
        </div>
      </div>

      {/* Вкладки */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: '1px solid #e2e8f0' }}>
        {([
          { id: 'shifts', label: 'Смены' },
          { id: 'projects', label: 'Проекты' },
          { id: 'tasks', label: 'Задачи' },
          { id: 'log', label: 'Лог изменений' },
        ] as { id: Tab; label: string }[]).map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            background: 'none', border: 'none', padding: '8px 18px', cursor: 'pointer',
            fontSize: 14, fontWeight: tab === t.id ? 600 : 400,
            color: tab === t.id ? '#2563eb' : '#64748b',
            borderBottom: tab === t.id ? '2px solid #2563eb' : '2px solid transparent',
            marginBottom: -1,
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'shifts' && <ShiftsTab dateFrom={dateFrom} dateTo={dateTo} />}
      {tab === 'projects' && <ProjectsTab dateFrom={dateFrom} dateTo={dateTo} />}
      {tab === 'tasks' && <TasksTab />}
      {tab === 'log' && <LogTab />}
    </div>
  )
}

// ─── ShiftsTab ────────────────────────────────────────────────────────────────

function ShiftsTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const { data: stats = [], isLoading } = useQuery<ShiftStat[]>({
    queryKey: ['analytics-shifts', dateFrom, dateTo],
    queryFn: () => api.get('/analytics/shifts', { params: { dateFrom, dateTo } }).then((r) => r.data),
  })

  if (isLoading) return <Loader />

  if (stats.length === 0) {
    return <Empty text="Смен за этот период нет" />
  }

  const totalShifts = stats.reduce((s, r) => s + r.total, 0)
  const totalConfirmed = stats.reduce((s, r) => s + r.confirmed, 0)

  return (
    <div>
      {/* Итоги */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
        <SummaryCard label="Всего смен" value={totalShifts} color="#2563eb" />
        <SummaryCard label="Подтверждено" value={totalConfirmed} color="#16a34a" />
        <SummaryCard label="Сотрудников" value={stats.length} color="#7c3aed" />
      </div>

      {/* Таблица */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {['Сотрудник', 'Таб. №', 'Застройка', 'Эфир', 'Демонтаж', 'Итого', 'Подтв.', 'Проектов'].map((h) => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stats.sort((a, b) => b.total - a.total).map((row) => (
              <tr key={row.user.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={td}>{row.user.fullName}</td>
                <td style={{ ...td, color: '#64748b' }}>{row.user.tabNumber ?? '—'}</td>
                <td style={{ ...td, color: '#b45309' }}>{row.byType.zastroyka || '—'}</td>
                <td style={{ ...td, color: '#16a34a' }}>{row.byType.efir || '—'}</td>
                <td style={{ ...td, color: '#0369a1' }}>{row.byType.demontazh || '—'}</td>
                <td style={{ ...td, fontWeight: 600 }}>{row.total}</td>
                <td style={{ ...td, color: row.confirmed === row.total ? '#16a34a' : '#64748b' }}>{row.confirmed}</td>
                <td style={td}>{row.projects}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── ProjectsTab ──────────────────────────────────────────────────────────────

function ProjectsTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const { data: projects = [], isLoading } = useQuery<ProjectStat[]>({
    queryKey: ['analytics-projects', dateFrom, dateTo],
    queryFn: () => api.get('/analytics/projects', { params: { dateFrom, dateTo } }).then((r) => r.data),
  })

  if (isLoading) return <Loader />
  if (projects.length === 0) return <Empty text="Проектов за этот период нет" />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {projects.map((p) => (
        <div key={p.id} style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#1e293b' }}>
                {p.client ? `${p.client} — ` : ''}{p.name}
              </span>
              {p.date && (
                <span style={{ marginLeft: 10, fontSize: 13, color: '#64748b' }}>
                  {format(new Date(p.date), 'd MMMM', { locale: ru })}
                </span>
              )}
            </div>
            <span style={{ fontSize: 12, color: '#64748b' }}>{p._count.shiftEntries} смен</span>
          </div>
          {p.assignments.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {p.assignments.map((a) => (
                <span key={a.id} style={{ fontSize: 12, padding: '2px 10px', borderRadius: 12, background: '#f1f5f9', color: '#374151' }}>
                  {a.user?.fullName ?? '—'}
                  {a.roleOnSite && <span style={{ color: '#94a3b8' }}> · {a.roleOnSite}</span>}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── TasksTab ─────────────────────────────────────────────────────────────────

function TasksTab() {
  const { data, isLoading } = useQuery<TasksData>({
    queryKey: ['analytics-tasks'],
    queryFn: () => api.get('/analytics/tasks').then((r) => r.data),
  })

  if (isLoading) return <Loader />

  const { summary, tasks } = data ?? { summary: { open: 0, inProgress: 0, done: 0, total: 0 }, tasks: [] }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        <SummaryCard label="Всего" value={summary.total} color="#374151" />
        <SummaryCard label="Открыто" value={summary.open} color="#2563eb" />
        <SummaryCard label="В работе" value={summary.inProgress} color="#b45309" />
        <SummaryCard label="Завершено" value={summary.done} color="#16a34a" />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {['Задача', 'Статус', 'Создал', 'Исполнитель', 'Дата создания'].map((h) => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#374151' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => {
              const assignment = task.taskAssignments[0]
              return (
                <tr key={task.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={td}>{task.title}</td>
                  <td style={td}>
                    <span style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 500,
                      background: task.status === 'done' ? '#dcfce7' : task.status === 'in_progress' ? '#fef3c7' : '#dbeafe',
                      color: task.status === 'done' ? '#16a34a' : task.status === 'in_progress' ? '#b45309' : '#1d4ed8',
                    }}>
                      {task.status === 'done' ? 'Готово' : task.status === 'in_progress' ? 'В работе' : 'Открыта'}
                    </span>
                  </td>
                  <td style={{ ...td, color: '#64748b' }}>{task.creator.fullName}</td>
                  <td style={{ ...td, color: '#64748b' }}>
                    {assignment ? (
                      <>
                        {assignment.user.fullName}
                        {assignment.completedAt && (
                          <span style={{ marginLeft: 6, fontSize: 11, color: '#16a34a' }}>
                            ✓ {format(new Date(assignment.completedAt), 'd MMM', { locale: ru })}
                          </span>
                        )}
                      </>
                    ) : '—'}
                  </td>
                  <td style={{ ...td, color: '#64748b' }}>{format(new Date(task.createdAt), 'd MMM yyyy', { locale: ru })}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── LogTab ───────────────────────────────────────────────────────────────────

function LogTab() {
  const [entityType, setEntityType] = useState('')

  const { data: logs = [], isLoading } = useQuery<ChangeLogEntry[]>({
    queryKey: ['change-logs-all', entityType],
    queryFn: () =>
      api.get('/change-logs', { params: { entityType: entityType || undefined, limit: 100 } }).then((r) => r.data),
  })

  const ENTITY_LABELS: Record<string, string> = {
    project: 'Проект',
    shift: 'Смена',
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <select
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
        >
          <option value="">Все сущности</option>
          <option value="project">Проекты</option>
          <option value="shift">Смены</option>
        </select>
      </div>

      {isLoading ? <Loader /> : logs.length === 0 ? <Empty text="Изменений нет" /> : (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Тип', 'Поле', 'Было', 'Стало', 'Кто', 'Когда'].map((h) => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#374151' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ ...td, color: '#64748b' }}>{ENTITY_LABELS[log.entityType] ?? log.entityType}</td>
                  <td style={td}>{log.field ?? '—'}</td>
                  <td style={{ ...td, color: '#dc2626', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.oldValue ?? '—'}</td>
                  <td style={{ ...td, color: '#16a34a', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.newValue ?? '—'}</td>
                  <td style={{ ...td, color: '#64748b' }}>{log.user?.fullName ?? '—'}</td>
                  <td style={{ ...td, color: '#64748b', whiteSpace: 'nowrap' }}>{format(new Date(log.changedAt), 'd MMM HH:mm', { locale: ru })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', padding: '16px 20px' }}>
      <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, color }}>{value}</div>
    </div>
  )
}

function Loader() {
  return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Загрузка...</div>
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
      {text}
    </div>
  )
}

const td: React.CSSProperties = { padding: '10px 16px', fontSize: 14 }
const navBtn: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 16 }
