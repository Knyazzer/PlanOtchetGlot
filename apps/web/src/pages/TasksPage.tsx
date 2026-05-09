// apps/web/src/pages/TasksPage.tsx
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useCurrentUser, usePrimaryDept, useIsAdmin, useIsDeptDirector } from '../hooks/useAuth'
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

// ─── Kanban config ────────────────────────────────────────────────────────────

const COLUMNS: { key: TaskStatus; label: string; color: string }[] = [
  { key: 'open',        label: 'Входящие',  color: '#64748b' },
  { key: 'in_progress', label: 'В работе',  color: '#2563eb' },
  { key: 'done',        label: 'Готово',    color: '#16a34a' },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}

function formatDeadline(d: string | null) {
  if (!d) return null
  return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
}

// ─── TaskCard ─────────────────────────────────────────────────────────────────

function TaskCard({
  task, currentUserId, onTake, onComplete, isTaking, isCompleting,
}: {
  task: Task; currentUserId: string
  onTake: (id: string) => void; onComplete: (id: string) => void
  isTaking: boolean; isCompleting: boolean
}) {
  const isAssignee = task.assignments.some((a) => a.userId === currentUserId)
  const dl = formatDeadline(task.deadline)

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderLeft: task.isOverdue ? '3px solid #dc2626' : '1px solid #e2e8f0',
      borderRadius: 8,
      padding: '10px 12px',
      marginBottom: 8,
    }}>
      {task.isOverdue && (
        <div style={{
          display: 'inline-block', marginBottom: 6,
          background: '#fee2e2', color: '#dc2626',
          padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600,
        }}>
          Просрочена
        </div>
      )}

      <div style={{ color: '#1e293b', fontSize: 13, fontWeight: 600, marginBottom: 8, lineHeight: 1.4 }}>
        {task.title}
      </div>

      {task.workItem && (
        <div style={{ color: '#94a3b8', fontSize: 10, marginBottom: 6 }}>
          {task.workItem.name}
        </div>
      )}

      {task.assignments.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          {task.assignments.slice(0, 3).map((a) => (
            <div
              key={a.userId}
              title={a.user.fullName}
              style={{
                width: 22, height: 22, borderRadius: '50%',
                background: '#e0e7ff', color: '#4f46e5',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 700, flexShrink: 0,
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
          <span style={{ color: task.isOverdue ? '#dc2626' : '#64748b', fontSize: 11 }}>
            до {dl}
          </span>
        ) : <span />}
        <span style={{ color: '#94a3b8', fontSize: 10 }}>
          {task.creator.fullName.split(' ')[0]}
        </span>
      </div>

      {task.status === 'open' && (
        <button
          onClick={() => onTake(task.id)}
          disabled={isTaking}
          style={{
            marginTop: 8, width: '100%',
            background: '#2563eb', color: '#fff',
            border: 'none', borderRadius: 5,
            padding: '5px 0', fontSize: 12,
            cursor: isTaking ? 'not-allowed' : 'pointer',
            opacity: isTaking ? 0.6 : 1,
          }}
        >
          {isTaking ? 'Берём...' : 'Взять в работу'}
        </button>
      )}
      {task.status === 'in_progress' && isAssignee && (
        <button
          onClick={() => onComplete(task.id)}
          disabled={isCompleting}
          style={{
            marginTop: 8, width: '100%',
            background: '#16a34a', color: '#fff',
            border: 'none', borderRadius: 5,
            padding: '5px 0', fontSize: 12,
            cursor: isCompleting ? 'not-allowed' : 'pointer',
            opacity: isCompleting ? 0.6 : 1,
          }}
        >
          {isCompleting ? 'Завершаем...' : 'Завершить'}
        </button>
      )}
    </div>
  )
}

// ─── CreateModal ──────────────────────────────────────────────────────────────

function CreateModal({
  deptId, onClose, onSuccess,
}: {
  deptId: string | null; onClose: () => void; onSuccess: () => void
}) {
  const [title, setTitle] = useState('')
  const [deadline, setDeadline] = useState('')
  const [desc, setDesc] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    try {
      await api.post('/tasks', {
        title: title.trim(),
        description: desc.trim() || null,
        deadline: deadline ? new Date(deadline).toISOString() : null,
        deptId: deptId ?? null,
      })
      onSuccess()
    } catch (err: any) {
      alert(err?.response?.data?.error ?? 'Ошибка')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: '#fff', borderRadius: 12, padding: '24px 28px',
        width: 400, maxWidth: '95vw', boxShadow: '0 8px 30px rgba(0,0,0,.15)',
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 18 }}>Новая задача</div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>
              Название *
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Что нужно сделать?"
              required
              style={{
                width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0',
                borderRadius: 6, fontSize: 13, color: '#1e293b', fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>
              Дедлайн
            </label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              style={{
                width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0',
                borderRadius: 6, fontSize: 13, color: '#1e293b', fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>
              Описание
            </label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={2}
              style={{
                width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0',
                borderRadius: 6, fontSize: 13, color: '#1e293b', fontFamily: 'inherit',
                resize: 'vertical', boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{
              padding: '7px 16px', borderRadius: 6, border: '1px solid #e2e8f0',
              background: '#f8fafc', color: '#64748b', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              Отмена
            </button>
            <button type="submit" disabled={saving || !title.trim()} style={{
              padding: '7px 20px', borderRadius: 6, border: 'none',
              background: saving ? '#93c5fd' : '#2563eb', color: '#fff',
              fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            }}>
              {saving ? 'Создаём...' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── TasksPage ────────────────────────────────────────────────────────────────

export function TasksPage() {
  const qc = useQueryClient()
  const me = useCurrentUser()
  const primaryDept = usePrimaryDept()
  const isAdmin = useIsAdmin()
  const isDeptDirector = useIsDeptDirector()
  const isAdminOrDirector = isAdmin || isDeptDirector

  const [view, setView] = useState<TaskView>('kanban')
  const [scope, setScope] = useState<'my' | 'all'>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [takingId, setTakingId] = useState<string | null>(null)
  const [completingId, setCompletingId] = useState<string | null>(null)
  const [deptId, setDeptId] = useState<string | null>(null)

  // Once auth loads, use primary dept for non-admin
  useEffect(() => {
    if (primaryDept && deptId === null) setDeptId(primaryDept.id)
  }, [primaryDept?.id])

  const tasksParams = new URLSearchParams()
  if (scope === 'my') tasksParams.set('assignedToMe', 'true')
  if (deptId) tasksParams.set('deptId', deptId)

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ['tasks', scope, deptId],
    queryFn: () => api.get(`/tasks?${tasksParams}`).then((r) => r.data),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })

  const take = useMutation({
    mutationFn: ({ id }: { id: string; wiId: string | null }) => api.post(`/tasks/${id}/assign`),
    onSuccess: (_, { wiId }) => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      if (wiId) qc.invalidateQueries({ queryKey: ['work-item', wiId] })
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Не удалось взять задачу'),
  })

  const complete = useMutation({
    mutationFn: ({ id }: { id: string; wiId: string | null }) => api.patch(`/tasks/${id}/complete`),
    onSuccess: (_, { wiId }) => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      if (wiId) qc.invalidateQueries({ queryKey: ['work-item', wiId] })
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Не удалось завершить задачу'),
  })

  const overdueCount = tasks.filter((t) => t.isOverdue && t.status !== 'done').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>

      {/* Toolbar */}
      <div style={{
        padding: '10px 20px', borderBottom: '1px solid #e2e8f0',
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, background: '#fff',
      }}>
        {/* View toggle */}
        <div style={{ display: 'flex', gap: 2, background: '#f1f5f9', borderRadius: 7, padding: 2 }}>
          {(['kanban', 'gantt'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '4px 14px', borderRadius: 5, border: 'none', cursor: 'pointer', fontSize: 12,
              background: view === v ? '#fff' : 'transparent',
              color: view === v ? '#1e293b' : '#64748b',
              fontWeight: view === v ? 600 : 400,
              boxShadow: view === v ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
            }}>
              {v === 'kanban' ? 'Канбан' : 'Гантт'}
            </button>
          ))}
        </div>

        {/* Scope toggle */}
        {view === 'kanban' && (
          <div style={{ display: 'flex', gap: 2, background: '#f1f5f9', borderRadius: 7, padding: 2 }}>
            {([['all', 'Все'], ['my', 'Мои']] as const).map(([s, label]) => (
              <button key={s} onClick={() => setScope(s)} style={{
                padding: '4px 14px', borderRadius: 5, border: 'none', cursor: 'pointer', fontSize: 12,
                background: scope === s ? '#fff' : 'transparent',
                color: scope === s ? '#1e293b' : '#64748b',
                fontWeight: scope === s ? 600 : 400,
                boxShadow: scope === s ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
              }}>
                {label}
              </button>
            ))}
          </div>
        )}

        {overdueCount > 0 && (
          <div style={{
            fontSize: 11, fontWeight: 600, color: '#dc2626',
            background: '#fee2e2', padding: '3px 8px', borderRadius: 10,
          }}>
            ⚠ Просрочено: {overdueCount}
          </div>
        )}

        {isLoading && <span style={{ color: '#94a3b8', fontSize: 12 }}>Загрузка...</span>}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {primaryDept && (
            <span style={{ fontSize: 12, color: '#64748b' }}>{primaryDept.name}</span>
          )}
          {view === 'kanban' && (
            <button
              onClick={() => setShowCreate(true)}
              style={{
                padding: '6px 14px', borderRadius: 6, border: 'none',
                background: '#2563eb', color: '#fff',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              + Задача
            </button>
          )}
        </div>
      </div>

      {/* Gantt view */}
      {view === 'gantt' && (
        primaryDept
          ? <DeptGantt deptId={primaryDept.id} />
          : <div style={{ padding: 40, color: '#94a3b8', textAlign: 'center', fontSize: 14 }}>
              Вы не состоите ни в одном отделе
            </div>
      )}

      {/* Kanban view */}
      {view === 'kanban' && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 16, padding: '16px 20px', overflow: 'auto', background: '#f8fafc' }}>
          {COLUMNS.map(({ key, label, color }) => {
            const colTasks = tasks.filter((t) => t.status === key)
            return (
              <div
                key={key}
                style={{
                  flex: 1, minWidth: 240,
                  background: '#f8fafc',
                  borderRadius: 10,
                  padding: '12px 12px 16px',
                  display: 'flex', flexDirection: 'column',
                }}
              >
                {/* Column header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>{label}</span>
                  <span style={{
                    marginLeft: 'auto', background: color, color: '#fff',
                    borderRadius: 10, padding: '1px 7px', fontSize: 12, fontWeight: 600,
                  }}>
                    {colTasks.length}
                  </span>
                </div>

                {/* Cards */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {colTasks.length === 0 && (
                    <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, paddingTop: 20 }}>
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
                        take.mutate({ id, wiId: task.wiId }, { onSettled: () => setTakingId(null) })
                      }}
                      onComplete={(id) => {
                        setCompletingId(id)
                        complete.mutate({ id, wiId: task.wiId }, { onSettled: () => setCompletingId(null) })
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
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateModal
          deptId={deptId}
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            setShowCreate(false)
            qc.invalidateQueries({ queryKey: ['tasks'] })
          }}
        />
      )}
    </div>
  )
}
