import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns'
import { ru } from 'date-fns/locale'
import { api } from '../lib/api'

type TaskStatus = 'open' | 'in_progress' | 'done'

type GanttTask = {
  id: string
  title: string
  status: TaskStatus
  deadline: string | null
  isOverdue: boolean
  createdAt: string
  creator: { id: string; fullName: string }
  assignments: { userId: string; user: { id: string; fullName: string } }[]
}

type GanttData = {
  members: { id: string; fullName: string }[]
  tasks: GanttTask[]
}

const STATUS_COLOR: Record<TaskStatus, string> = {
  open:        '#3b82f6',
  in_progress: '#f59e0b',
  done:        '#16a34a',
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  open:        'Открыта',
  in_progress: 'В работе',
  done:        'Готово',
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}

export function DeptGantt({ deptId }: { deptId: string }) {
  const [from, setFrom] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [to,   setTo  ] = useState(() => format(endOfMonth(new Date()),   'yyyy-MM-dd'))
  const [filterUserId, setFilterUserId] = useState<string>('')

  const url = `/departments/${deptId}/gantt?from=${from}&to=${to}${filterUserId ? `&userId=${filterUserId}` : ''}`

  const { data, isLoading } = useQuery<GanttData>({
    queryKey: ['dept-gantt', deptId, from, to, filterUserId],
    queryFn: () => api.get(url).then((r) => r.data),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })

  const fromDate = new Date(from)
  const toDate   = new Date(to)
  const rangeMs  = toDate.getTime() - fromDate.getTime() || 1

  const days = eachDayOfInterval({ start: fromDate, end: toDate })

  function barStyle(task: GanttTask) {
    const start  = new Date(task.createdAt)
    const end    = task.deadline ? new Date(task.deadline) : toDate
    const left   = Math.max(0, (start.getTime() - fromDate.getTime()) / rangeMs) * 100
    const right  = Math.min(rangeMs, end.getTime() - fromDate.getTime()) / rangeMs * 100
    const width  = Math.max(1, right - left)
    const color  = task.isOverdue ? '#dc2626' : STATUS_COLOR[task.status]
    return { left: `${left}%`, width: `${width}%`, background: color }
  }

  return (
    <div style={{ padding: 24, height: '100%', boxSizing: 'border-box', overflow: 'auto' }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: '#64748b' }}>С:</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} />
          <span style={{ fontSize: 13, color: '#64748b' }}>По:</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} />
        </div>
        <select
          value={filterUserId}
          onChange={(e) => setFilterUserId(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: '#fff' }}
        >
          <option value="">Все сотрудники</option>
          {data?.members.map((m) => (
            <option key={m.id} value={m.id}>{m.fullName}</option>
          ))}
        </select>
        <div style={{ fontSize: 13, color: '#94a3b8', marginLeft: 'auto' }}>
          {data?.tasks.length ?? 0} задач
        </div>
      </div>

      {isLoading && <div style={{ color: '#64748b', fontSize: 14 }}>Загрузка...</div>}

      {data && data.tasks.length === 0 && (
        <div style={{ color: '#94a3b8', fontSize: 14, textAlign: 'center', paddingTop: 40 }}>
          Нет задач в выбранном периоде
        </div>
      )}

      {data && data.tasks.length > 0 && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
            <div style={{ width: 320, flexShrink: 0, padding: '8px 16px', fontWeight: 600, fontSize: 12, color: '#64748b', borderRight: '1px solid #e2e8f0' }}>
              Задача
            </div>
            <div style={{ flex: 1, position: 'relative', padding: '4px 0', display: 'flex' }}>
              {days.filter((_, i) => i % 7 === 0 || i === 0).map((day) => {
                const pct = (day.getTime() - fromDate.getTime()) / rangeMs * 100
                return (
                  <div key={day.toISOString()} style={{ position: 'absolute', left: `${pct}%`, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', paddingLeft: 4 }}>
                    <span style={{ fontSize: 10, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                      {format(day, 'd MMM', { locale: ru })}
                    </span>
                    <span style={{ width: 1, flex: 1, background: '#e2e8f0' }} />
                  </div>
                )
              })}
            </div>
          </div>

          {data.tasks.map((task, idx) => (
            <div
              key={task.id}
              style={{
                display: 'flex', alignItems: 'center',
                borderBottom: idx < data.tasks.length - 1 ? '1px solid #f1f5f9' : 'none',
                minHeight: 48,
              }}
            >
              <div style={{ width: 320, flexShrink: 0, padding: '8px 16px', borderRight: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: task.isOverdue ? '#dc2626' : STATUS_COLOR[task.status],
                  }} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {task.title}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, paddingLeft: 16 }}>
                  {task.assignments.slice(0, 3).map((a) => (
                    <div key={a.userId} title={a.user.fullName} style={{
                      width: 22, height: 22, borderRadius: '50%', background: '#e0e7ff',
                      color: '#4338ca', fontSize: 9, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      {initials(a.user.fullName)}
                    </div>
                  ))}
                  {task.deadline && (
                    <span style={{ fontSize: 11, color: task.isOverdue ? '#dc2626' : '#94a3b8', marginLeft: 4 }}>
                      до {new Date(task.deadline).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}
                    </span>
                  )}
                </div>
              </div>

              <div style={{ flex: 1, position: 'relative', height: 48, overflow: 'hidden' }}>
                <div
                  style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(90deg, transparent 0, transparent calc(100% / 7 * 5), #f8fafc calc(100% / 7 * 5), #f8fafc calc(100% / 7))' }}
                />
                <div style={{
                  position: 'absolute',
                  top: 14, height: 20, borderRadius: 4,
                  ...barStyle(task),
                  opacity: task.status === 'done' ? 0.6 : 1,
                  minWidth: 4,
                }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
        {(Object.entries(STATUS_LABEL) as [TaskStatus, string][]).map(([s, label]) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b' }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: STATUS_COLOR[s] }} />
            {label}
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b' }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: '#dc2626' }} />
          Просрочена
        </div>
      </div>
    </div>
  )
}
