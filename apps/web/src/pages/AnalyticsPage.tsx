import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

type AnalyticsTab = 'tasks' | 'shifts' | 'projects'

interface TaskSummary {
  open: number
  inProgress: number
  done: number
  total: number
}

interface TaskItem {
  id: string
  title: string
  status: 'open' | 'in_progress' | 'done'
  isOverdue: boolean
  deadline: string | null
  creator: { id: string; fullName: string }
  assignments: { userId: string; user: { id: string; fullName: string } }[]
}

interface ShiftUserStat {
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
  assignments: { userId: string; user: { id: string; fullName: string } }[]
  _count: { shiftEntries: number }
}

const STATUS_COLOR: Record<string, string> = {
  open:        '#3b82f6',
  in_progress: '#f59e0b',
  done:        '#16a34a',
  draft:       '#94a3b8',
  active:      '#3b82f6',
  cancelled:   '#dc2626',
  rejected:    '#dc2626',
}
const STATUS_LABEL: Record<string, string> = {
  open:        'Открыта',
  in_progress: 'В работе',
  done:        'Готово',
  draft:       'Черновик',
  active:      'Активен',
  cancelled:   'Отменён',
  rejected:    'Отклонён',
}

function isoDate(d: Date) { return d.toISOString().slice(0, 10) }

function monthRange() {
  const d = new Date()
  return {
    from: isoDate(new Date(d.getFullYear(), d.getMonth(), 1)),
    to:   isoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
  }
}

export function AnalyticsPage() {
  const [tab, setTab] = useState<AnalyticsTab>('tasks')
  const def = monthRange()
  const [dateFrom, setDateFrom] = useState(def.from)
  const [dateTo,   setDateTo  ] = useState(def.to)

  const tasksQ = useQuery<{ tasks: TaskItem[]; summary: TaskSummary }>({
    queryKey: ['analytics-tasks'],
    queryFn:  () => api.get('/analytics/tasks').then((r) => r.data),
    staleTime: 60_000,
    enabled: tab === 'tasks',
  })

  const shiftsQ = useQuery<ShiftUserStat[]>({
    queryKey: ['analytics-shifts', dateFrom, dateTo],
    queryFn:  () => api.get(`/analytics/shifts?dateFrom=${dateFrom}&dateTo=${dateTo}`).then((r) => r.data),
    staleTime: 60_000,
    enabled: tab === 'shifts',
  })

  const projectsQ = useQuery<ProjectStat[]>({
    queryKey: ['analytics-projects', dateFrom, dateTo],
    queryFn:  () => api.get(`/analytics/projects?dateFrom=${dateFrom}&dateTo=${dateTo}`).then((r) => r.data),
    staleTime: 60_000,
    enabled: tab === 'projects',
  })

  const TABS: { id: AnalyticsTab; label: string }[] = [
    { id: 'tasks',    label: 'Задачи'  },
    { id: 'shifts',   label: 'Смены'   },
    { id: 'projects', label: 'Проекты' },
  ]

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Аналитика</h2>

        {tab !== 'tasks' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
            <span style={{ fontSize: 13, color: '#64748b' }}>С:</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              style={{ padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} />
            <span style={{ fontSize: 13, color: '#64748b' }}>По:</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              style={{ padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '5px 16px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13,
            background: tab === t.id ? '#2563eb' : '#f1f5f9',
            color:      tab === t.id ? '#fff'    : '#374151',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tasks */}
      {tab === 'tasks' && (
        <div>
          {tasksQ.isLoading && <Spinner />}
          {tasksQ.data && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 24 }}>
                <StatCard label="Всего"      value={tasksQ.data.summary.total}      color="#1e293b" />
                <StatCard label="Открыто"    value={tasksQ.data.summary.open}       color="#3b82f6" />
                <StatCard label="В работе"   value={tasksQ.data.summary.inProgress} color="#f59e0b" />
                <StatCard label="Завершено"  value={tasksQ.data.summary.done}       color="#16a34a" />
                <StatCard label="Просрочено" value={tasksQ.data.tasks.filter((t) => t.isOverdue).length} color="#dc2626" />
              </div>

              <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                <div style={{ padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 12, fontWeight: 600, color: '#64748b' }}>
                  Все задачи ({tasksQ.data.tasks.length})
                </div>
                {tasksQ.data.tasks.map((task, idx) => (
                  <div key={task.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                    borderBottom: idx < tasksQ.data!.tasks.length - 1 ? '1px solid #f1f5f9' : 'none',
                  }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      background: task.isOverdue ? '#dc2626' : STATUS_COLOR[task.status],
                    }} />
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{task.title}</span>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>
                      {task.assignments.map((a) => a.user.fullName).join(', ') || '—'}
                    </span>
                    {task.deadline && (
                      <span style={{ fontSize: 11, color: task.isOverdue ? '#dc2626' : '#94a3b8', whiteSpace: 'nowrap' }}>
                        до {new Date(task.deadline).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}
                      </span>
                    )}
                    <span style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600, whiteSpace: 'nowrap',
                      background: (STATUS_COLOR[task.status] ?? '#94a3b8') + '20',
                      color: STATUS_COLOR[task.status] ?? '#94a3b8',
                    }}>
                      {STATUS_LABEL[task.status] ?? task.status}
                    </span>
                  </div>
                ))}
                {tasksQ.data.tasks.length === 0 && (
                  <div style={{ padding: '20px 16px', color: '#94a3b8', fontSize: 13 }}>Задач нет</div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Shifts */}
      {tab === 'shifts' && (
        <div>
          {shiftsQ.isLoading && <Spinner />}
          {shiftsQ.data && (
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['Сотрудник', 'Всего', 'Подтверждено', 'Застройка', 'Эфир', 'Демонтаж', 'Проектов'].map((h) => (
                      <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.03em', borderBottom: '1px solid #e2e8f0' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shiftsQ.data.length === 0 && (
                    <tr><td colSpan={7} style={{ padding: '20px 14px', color: '#94a3b8', textAlign: 'center' }}>Нет данных за период</td></tr>
                  )}
                  {shiftsQ.data.map((s, idx) => (
                    <tr key={s.user.id} style={{ borderBottom: idx < shiftsQ.data!.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                      <td style={{ padding: '9px 14px', fontWeight: 500, color: '#1e293b' }}>
                        {s.user.fullName}
                        {s.user.tabNumber && <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 6 }}>#{s.user.tabNumber}</span>}
                      </td>
                      <Num v={s.total} bold />
                      <Num v={s.confirmed} color={s.confirmed < s.total ? '#f59e0b' : '#16a34a'} />
                      <Num v={s.byType.zastroyka} />
                      <Num v={s.byType.efir} />
                      <Num v={s.byType.demontazh} />
                      <Num v={s.projects} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Projects */}
      {tab === 'projects' && (
        <div>
          {projectsQ.isLoading && <Spinner />}
          {projectsQ.data && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 20 }}>
                <StatCard label="Всего"    value={projectsQ.data.length} color="#1e293b" />
                <StatCard label="Активных" value={projectsQ.data.filter((p) => p.status === 'active').length}  color="#3b82f6" />
                <StatCard label="Сдано"    value={projectsQ.data.filter((p) => p.status === 'done').length}    color="#16a34a" />
                <StatCard label="Черновик" value={projectsQ.data.filter((p) => p.status === 'draft').length}   color="#94a3b8" />
              </div>

              <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      {['Проект', 'Клиент', 'Статус', 'Команда', 'Смен'].map((h) => (
                        <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.03em', borderBottom: '1px solid #e2e8f0' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {projectsQ.data.length === 0 && (
                      <tr><td colSpan={5} style={{ padding: '20px 14px', color: '#94a3b8', textAlign: 'center' }}>Нет проектов за период</td></tr>
                    )}
                    {projectsQ.data.map((p, idx) => (
                      <tr key={p.id} style={{ borderBottom: idx < projectsQ.data!.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                        <td style={{ padding: '9px 14px', fontWeight: 500, color: '#1e293b' }}>
                          {p.name}
                          {p.date && <div style={{ fontSize: 11, color: '#94a3b8' }}>{new Date(p.date).toLocaleDateString('ru-RU')}</div>}
                        </td>
                        <td style={{ padding: '9px 14px', color: '#475569' }}>{p.client ?? '—'}</td>
                        <td style={{ padding: '9px 14px' }}>
                          <span style={{
                            fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                            background: (STATUS_COLOR[p.status] ?? '#94a3b8') + '20',
                            color: STATUS_COLOR[p.status] ?? '#94a3b8',
                          }}>
                            {STATUS_LABEL[p.status] ?? p.status}
                          </span>
                        </td>
                        <td style={{ padding: '9px 14px', color: '#475569', fontSize: 12 }}>
                          {p.assignments.slice(0, 4).map((a) => a.user.fullName).join(', ')}
                          {p.assignments.length > 4 && ` +${p.assignments.length - 4}`}
                        </td>
                        <td style={{ padding: '9px 14px', color: '#475569', textAlign: 'right' }}>{p._count.shiftEntries}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color = '#1e293b' }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '14px 16px', textAlign: 'center' }}>
      <div style={{ fontSize: 24, fontWeight: 700, color, marginBottom: 2 }}>{value}</div>
      <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
    </div>
  )
}

function Num({ v, bold, color }: { v: number; bold?: boolean; color?: string }) {
  return (
    <td style={{ padding: '9px 14px', color: color ?? '#475569', fontWeight: bold ? 700 : 400, textAlign: 'right' }}>
      {v}
    </td>
  )
}

function Spinner() {
  return <div style={{ padding: '20px 0', color: '#94a3b8', fontSize: 14 }}>Загрузка...</div>
}
