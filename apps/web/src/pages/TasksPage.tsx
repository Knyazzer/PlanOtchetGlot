import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { api } from '../lib/api'
import { useCurrentUser, useIsAdmin } from '../hooks/useAuth'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TaskAssignment {
  id: string
  assignedAt: string
  completedAt: string | null
  user: { id: string; fullName: string }
}

interface Task {
  id: string
  title: string
  description: string | null
  status: 'open' | 'in_progress' | 'done'
  createdAt: string
  creator: { id: string; fullName: string }
  taskAssignments: TaskAssignment[]
}

const STATUS_LABELS: Record<string, string> = {
  open: 'Открыта',
  in_progress: 'В работе',
  done: 'Готово',
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  open: { bg: '#dbeafe', text: '#1d4ed8' },
  in_progress: { bg: '#fef3c7', text: '#b45309' },
  done: { bg: '#dcfce7', text: '#16a34a' },
}

type FilterStatus = 'all' | 'open' | 'in_progress' | 'done'

// ─── TasksPage ─────────────────────────────────────────────────────────────────

export function TasksPage() {
  const qc = useQueryClient()
  const isAdmin = useIsAdmin()
  const currentUser = useCurrentUser()
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [showCreateForm, setShowCreateForm] = useState(false)

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ['tasks', filter],
    queryFn: () =>
      api
        .get('/tasks', { params: { status: filter === 'all' ? undefined : filter } })
        .then((r) => r.data),
  })

  const assign = useMutation({
    mutationFn: (id: string) => api.post(`/tasks/${id}/assign`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })

  const complete = useMutation({
    mutationFn: (id: string) => api.patch(`/tasks/${id}/complete`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/tasks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Бэклог задач</h2>
        {isAdmin && (
          <button
            onClick={() => setShowCreateForm(true)}
            style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontWeight: 500, fontSize: 14 }}
          >
            + Задача
          </button>
        )}
      </div>

      {/* Фильтр по статусу */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['all', 'open', 'in_progress', 'done'] as FilterStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            style={{
              padding: '6px 14px',
              borderRadius: 20,
              border: '1px solid',
              borderColor: filter === s ? '#2563eb' : '#e2e8f0',
              background: filter === s ? '#2563eb' : '#fff',
              color: filter === s ? '#fff' : '#374151',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: filter === s ? 500 : 400,
            }}
          >
            {s === 'all' ? 'Все' : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Загрузка...</div>
      ) : tasks.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
          Задач нет
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tasks.map((task) => {
            const myAssignment = task.taskAssignments.find((a) => a.user.id === currentUser?.id)
            const isAssignedToMe = !!myAssignment
            const isAssignedToSomeone = task.taskAssignments.length > 0

            return (
              <div
                key={task.id}
                style={{
                  background: '#fff',
                  borderRadius: 10,
                  border: '1px solid #e2e8f0',
                  padding: '14px 18px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 16,
                  opacity: task.status === 'done' ? 0.7 : 1,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 15, fontWeight: 500, color: '#1e293b' }}>{task.title}</span>
                    <StatusBadge status={task.status} />
                  </div>

                  {task.description && (
                    <div style={{ fontSize: 13, color: '#64748b', marginBottom: 6 }}>{task.description}</div>
                  )}

                  <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#94a3b8', flexWrap: 'wrap' }}>
                    <span>Создал: {task.creator.fullName}</span>
                    <span>{format(new Date(task.createdAt), 'd MMM yyyy', { locale: ru })}</span>
                    {isAssignedToSomeone && (
                      <span>
                        Исполнитель:{' '}
                        {task.taskAssignments.map((a) => (
                          <span key={a.id} style={{ color: '#374151' }}>
                            {a.user.fullName}
                            {a.completedAt && ' ✓'}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                </div>

                {/* Действия */}
                <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
                  {task.status === 'open' && (
                    <button
                      onClick={() => assign.mutate(task.id)}
                      disabled={assign.isPending}
                      style={btnStyle('#16a34a')}
                    >
                      Взять
                    </button>
                  )}

                  {task.status === 'in_progress' && (isAssignedToMe || isAdmin) && (
                    <button
                      onClick={() => complete.mutate(task.id)}
                      disabled={complete.isPending}
                      style={btnStyle('#2563eb')}
                    >
                      Завершить
                    </button>
                  )}

                  {isAdmin && task.status !== 'done' && (
                    <button
                      onClick={() => {
                        if (confirm(`Удалить задачу «${task.title}»?`)) remove.mutate(task.id)
                      }}
                      disabled={remove.isPending}
                      style={btnStyle('#dc2626', true)}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showCreateForm && (
        <CreateTaskModal
          onClose={() => setShowCreateForm(false)}
          onCreated={() => {
            setShowCreateForm(false)
            qc.invalidateQueries({ queryKey: ['tasks'] })
          }}
        />
      )}
    </div>
  )
}

// ─── CreateTaskModal ───────────────────────────────────────────────────────────

function CreateTaskModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ title: '', description: '' })
  const [error, setError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () =>
      api.post('/tasks', {
        title: form.title,
        description: form.description || undefined,
      }),
    onSuccess: onCreated,
    onError: (e: any) => setError(e.response?.data?.error ?? 'Ошибка'),
  })

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
        <h3 style={{ margin: '0 0 18px', fontSize: 17, fontWeight: 600 }}>Новая задача</h3>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4, color: '#374151' }}>Название *</label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4, color: '#374151' }}>Описание</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={3}
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box', resize: 'vertical' }}
          />
        </div>

        {error && <div style={{ marginBottom: 12, color: '#dc2626', fontSize: 13 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 13 }}>
            Отмена
          </button>
          <button
            onClick={() => create.mutate()}
            disabled={create.isPending || !form.title}
            style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontWeight: 500, fontSize: 13, opacity: !form.title ? 0.5 : 1 }}
          >
            {create.isPending ? 'Создание...' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLORS[status] ?? { bg: '#f1f5f9', text: '#64748b' }
  return (
    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: c.bg, color: c.text, fontWeight: 500, whiteSpace: 'nowrap' }}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

function btnStyle(color: string, outline = false): React.CSSProperties {
  return {
    padding: '5px 12px',
    borderRadius: 6,
    border: `1px solid ${color}`,
    background: outline ? 'transparent' : color,
    color: outline ? color : '#fff',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
  }
}
