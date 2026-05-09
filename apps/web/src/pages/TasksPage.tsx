// apps/web/src/pages/TasksPage.tsx
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useCurrentUser, usePrimaryDept, useIsAdmin, useIsDeptDirector, useUserDepts } from '../hooks/useAuth'
import { DeptGantt } from './DeptGantt'

type TaskView = 'kanban' | 'gantt'

type TaskStatus = 'open' | 'in_progress' | 'done'

type Assignment = {
  id: string
  userId: string
  completedAt: string | null
  user: { id: string; fullName: string }
}

type Task = {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  deadline: string | null
  isOverdue: boolean
  deptId: string | null
  wiId: string | null
  createdBy: string
  createdAt: string
  creator: { id: string; fullName: string }
  assignments: Assignment[]
  dept: { id: string; name: string } | null
  workItem: { id: string; name: string } | null
}

type Department = {
  id: string
  name: string
  type: string
}

const COL_STATUSES: Record<string, TaskStatus[]> = {
  Входящие: ['open'],
  'В работе': ['in_progress'],
  Готово: ['done'],
}

const COLUMNS = ['Входящие', 'В работе', 'Готово'] as const

function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

function formatDeadline(d: string | null) {
  if (!d) return null
  return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
}

function TaskCard({
  task,
  currentUserId,
  onTake,
  onComplete,
  isTaking,
  isCompleting,
}: {
  task: Task
  currentUserId: string
  onTake: (id: string) => void
  onComplete: (id: string) => void
  isTaking: boolean
  isCompleting: boolean
}) {
  const isAssignee = task.assignments.some((a) => a.userId === currentUserId)
  const dl = formatDeadline(task.deadline)

  return (
    <div
      style={{
        background: '#1e293b',
        borderRadius: 8,
        padding: '10px 12px',
        marginBottom: 8,
        borderLeft: task.isOverdue ? '3px solid #dc2626' : '3px solid transparent',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        {task.isOverdue && (
          <span
            style={{
              background: '#dc2626',
              color: '#fff',
              padding: '1px 6px',
              borderRadius: 3,
              fontSize: 10,
              fontWeight: 600,
            }}
          >
            Просрочена
          </span>
        )}
        {task.dept && (
          <span style={{ color: '#64748b', fontSize: 10 }}>{task.dept.name}</span>
        )}
        {task.workItem && (
          <span style={{ color: '#475569', fontSize: 10 }}>· {task.workItem.name}</span>
        )}
      </div>

      <div
        style={{
          color: '#e2e8f0',
          fontSize: 13,
          fontWeight: 600,
          marginBottom: 8,
          lineHeight: 1.4,
        }}
      >
        {task.title}
      </div>

      {task.assignments.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          {task.assignments.slice(0, 3).map((a) => (
            <div
              key={a.userId}
              title={a.user.fullName}
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: '#334155',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#94a3b8',
                fontSize: 9,
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              {initials(a.user.fullName)}
            </div>
          ))}
          <span style={{ color: '#64748b', fontSize: 11 }}>
            {task.assignments[0].user.fullName}
            {task.assignments.length > 1 && ` +${task.assignments.length - 1}`}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {dl ? (
          <span style={{ color: task.isOverdue ? '#f87171' : '#94a3b8', fontSize: 11 }}>
            до {dl}
          </span>
        ) : (
          <span />
        )}
        <span style={{ color: '#475569', fontSize: 10 }}>
          от {task.creator.fullName.split(' ')[0]}
        </span>
      </div>

      {task.status === 'open' && (
        <button
          onClick={() => onTake(task.id)}
          disabled={isTaking}
          style={{
            marginTop: 8,
            width: '100%',
            background: isTaking ? '#1e40af' : '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 5,
            padding: '5px 0',
            fontSize: 12,
            cursor: isTaking ? 'not-allowed' : 'pointer',
            opacity: isTaking ? 0.7 : 1,
          }}
        >
          {isTaking ? 'Берём...' : 'Взять'}
        </button>
      )}
      {task.status === 'in_progress' && isAssignee && (
        <button
          onClick={() => onComplete(task.id)}
          disabled={isCompleting}
          style={{
            marginTop: 8,
            width: '100%',
            background: isCompleting ? '#166534' : '#16a34a',
            color: '#fff',
            border: 'none',
            borderRadius: 5,
            padding: '5px 0',
            fontSize: 12,
            cursor: isCompleting ? 'not-allowed' : 'pointer',
            opacity: isCompleting ? 0.7 : 1,
          }}
        >
          {isCompleting ? 'Завершаем...' : 'Завершить'}
        </button>
      )}
    </div>
  )
}

export function TasksPage() {
  const qc = useQueryClient()
  const me = useCurrentUser()
  const primaryDept = usePrimaryDept()
  const isAdmin = useIsAdmin()
  const isDeptDirector = useIsDeptDirector()
  const isAdminOrDirector = isAdmin || isDeptDirector
  const userDepts = useUserDepts()
  const [view, setView] = useState<TaskView>('kanban')
  const [scope, setScope] = useState<'my' | 'all'>('my')
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null)
  const [takingId, setTakingId] = useState<string | null>(null)
  const [completingId, setCompletingId] = useState<string | null>(null)

  // Auto-select primary dept for non-admin users once auth loads
  useEffect(() => {
    if (!isAdminOrDirector && primaryDept && selectedDeptId === null) {
      setSelectedDeptId(primaryDept.id)
    }
  }, [isAdminOrDirector, primaryDept?.id])

  const tasksParams = new URLSearchParams()
  if (scope === 'my') tasksParams.set('assignedToMe', 'true')
  if (selectedDeptId) tasksParams.set('deptId', selectedDeptId)

  const { data: tasks = [], isLoading, isError } = useQuery<Task[]>({
    queryKey: ['tasks', scope, selectedDeptId],
    queryFn: () => api.get(`/tasks?${tasksParams.toString()}`).then((r) => r.data),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })

  // Admin/director see all departments; regular users see only their own
  const { data: allDepts = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then((r) => r.data),
    enabled: isAdminOrDirector,
  })
  const departments: Department[] = isAdminOrDirector ? allDepts : userDepts

  const take = useMutation({
    mutationFn: ({ id }: { id: string; wiId: string | null }) =>
      api.post(`/tasks/${id}/assign`),
    onSuccess: (_, { wiId }) => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      if (wiId) qc.invalidateQueries({ queryKey: ['work-item', wiId] })
    },
    onError: (err: any) =>
      alert(err?.response?.data?.error ?? 'Не удалось взять задачу'),
  })

  const complete = useMutation({
    mutationFn: ({ id }: { id: string; wiId: string | null }) =>
      api.patch(`/tasks/${id}/complete`),
    onSuccess: (_, { wiId }) => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      if (wiId) qc.invalidateQueries({ queryKey: ['work-item', wiId] })
    },
    onError: (err: any) =>
      alert(err?.response?.data?.error ?? 'Не удалось завершить задачу'),
  })

  const overdueCount = tasks.filter((t) => t.isOverdue && t.status !== 'done').length
  const tasksByColumn = (col: typeof COLUMNS[number]) =>
    tasks.filter((t) => COL_STATUSES[col].includes(t.status))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Переключатель Канбан / Гантт */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid #1e293b', display: 'flex', gap: 4, flexShrink: 0 }}>
        {(['kanban', 'gantt'] as const).map((v) => (
          <button key={v} onClick={() => setView(v)} style={{
            padding: '5px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13,
            background: view === v ? '#2563eb' : 'transparent',
            color: view === v ? '#fff' : '#64748b',
            fontWeight: view === v ? 600 : 400,
          }}>
            {v === 'kanban' ? 'Канбан' : 'Гантт'}
          </button>
        ))}
      </div>

      {view === 'gantt' && (
        primaryDept
          ? <DeptGantt deptId={primaryDept.id} />
          : <div style={{ padding: 40, color: '#94a3b8', textAlign: 'center' }}>Вы не состоите ни в одном отделе</div>
      )}

      {view === 'kanban' && <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      {/* Sidebar */}
      <div
        style={{
          width: 200,
          flexShrink: 0,
          background: '#0f172a',
          borderRight: '1px solid #1e293b',
          padding: '16px 0',
          overflowY: 'auto',
        }}
      >
        {overdueCount > 0 && (
          <button
            onClick={() => { setScope('all'); setSelectedDeptId(null) }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '8px 16px',
              background: '#450a0a',
              border: 'none',
              borderLeft: '3px solid #dc2626',
              color: '#f87171',
              fontSize: 13,
              cursor: 'pointer',
              marginBottom: 8,
              textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 14 }}>⚠</span>
            Просроч. {overdueCount}
          </button>
        )}

        <div style={{ padding: '0 16px 8px', color: '#475569', fontSize: 11 }}>ОБЛАСТЬ</div>

        {(['my', 'all'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setScope(s)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '7px 16px',
              background: scope === s ? '#1e293b' : 'transparent',
              border: 'none',
              color: scope === s ? '#93c5fd' : '#94a3b8',
              fontSize: 13,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 10 }}>{scope === s ? '◉' : '○'}</span>
            {s === 'my' ? 'Мои' : 'Все'}
          </button>
        ))}

        {departments.length > 0 && (
          <>
            <div style={{ padding: '12px 16px 6px', color: '#475569', fontSize: 11, marginTop: 8 }}>
              ОТДЕЛ
            </div>
            <button
              onClick={() => setSelectedDeptId(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '6px 16px',
                background: selectedDeptId === null ? '#1e293b' : 'transparent',
                border: 'none',
                color: selectedDeptId === null ? '#93c5fd' : '#64748b',
                fontSize: 12,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              Все отделы
            </button>
            {departments.map((d) => (
              <button
                key={d.id}
                onClick={() => setSelectedDeptId(d.id === selectedDeptId ? null : d.id)}
                title={d.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '6px 16px',
                  background: selectedDeptId === d.id ? '#1e293b' : 'transparent',
                  border: 'none',
                  color: selectedDeptId === d.id ? '#93c5fd' : '#64748b',
                  fontSize: 12,
                  cursor: 'pointer',
                  textAlign: 'left',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {d.name}
              </button>
            ))}
          </>
        )}
      </div>

      {/* Main kanban area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Header */}
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 16 }}>Задачи</span>
          {isLoading && <span style={{ color: '#64748b', fontSize: 13 }}>Загрузка...</span>}
          {isError && <span style={{ color: '#f87171', fontSize: 13 }}>Ошибка загрузки</span>}
        </div>

        {/* Columns */}
        <div style={{ flex: 1, display: 'flex', gap: 0, overflow: 'hidden' }}>
          {COLUMNS.map((col) => {
            const colTasks = tasksByColumn(col)
            return (
              <div
                key={col}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  borderRight: '1px solid #1e293b',
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    padding: '10px 14px',
                    borderBottom: '1px solid #1e293b',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span style={{ color: '#64748b', fontSize: 11, fontWeight: 600 }}>
                    {col.toUpperCase()}
                  </span>
                  <span
                    style={{
                      background: '#0f172a',
                      color: '#94a3b8',
                      borderRadius: 10,
                      padding: '1px 7px',
                      fontSize: 11,
                    }}
                  >
                    {colTasks.length}
                  </span>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
                  {colTasks.length === 0 && !isLoading && (
                    <div style={{ color: '#334155', fontSize: 12, textAlign: 'center', paddingTop: 20 }}>
                      Нет задач
                    </div>
                  )}
                  {colTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      currentUserId={me?.id ?? ''}
                      onTake={(id) => {
                        setTakingId(id)
                        take.mutate(
                          { id, wiId: task.wiId },
                          { onSettled: () => setTakingId(null) },
                        )
                      }}
                      onComplete={(id) => {
                        setCompletingId(id)
                        complete.mutate(
                          { id, wiId: task.wiId },
                          { onSettled: () => setCompletingId(null) },
                        )
                      }}
                      isTaking={takingId === task.id}
                      isCompleting={completingId === task.id}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      </div>}
    </div>
  )
}
