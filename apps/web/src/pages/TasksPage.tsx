import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../stores/auth'
import { api } from '../lib/api'
import { TracksPage, TrackFormModal } from './TracksPage'
import type { Task, View, TaskView, BoardGroupBy } from './tasks/types'
import { SegmentedControl, Toast } from './tasks/ui'
import { TaskModal } from './tasks/TaskModal'
import { KanbanBoard } from './tasks/KanbanBoard'
import { GanttChart } from './tasks/GanttChart'
import { CalendarEventModal } from './tasks/CalendarEventModal'
import { TaskTable } from './tasks/TaskTable'
import { HeaderPortal } from '../components/HeaderPortal'

// ── Re-exports (сохраняют прежние импорты из './TasksPage' у других файлов) ────
export type { Task, BoardGroupBy } from './tasks/types'
export { TaskModal } from './tasks/TaskModal'
export { CalendarEventModal } from './tasks/CalendarEventModal'

// ── Main page ──────────────────────────────────────────────────────────────────
interface TasksPageProps {
  onOpenChatWith?: (userId: string, task: { id: string; title: string; assigneeId: string; assignedById: string }, isSelf: boolean) => void
  /** внешнее управление вкладкой (из контейнера «Мой кабинет»): при заданном значении
   *  свой переключатель Задачи/Треки не рисуется — вкладками рулит кабинет. */
  externalTab?: 'tasks' | 'tracks'
}

export function TasksPage({ onOpenChatWith, externalTab }: TasksPageProps = {}) {
  const currentUser = useAuthStore(s => s.user)
  const [internalTab, setTab] = useState<'tasks' | 'tracks'>('tasks')
  const tab = externalTab ?? internalTab
  const [view,     setView]     = useState<View>('kanban')
  const [taskView, setTaskView] = useState<TaskView>('mine')
  // группировка доски персистится per-user (паттерн донора)
  const [groupBy,  setGroupByState] = useState<BoardGroupBy>(
    () => (localStorage.getItem('nexus:board-group') as BoardGroupBy) || 'status',
  )
  const setGroupBy = (g: BoardGroupBy) => { setGroupByState(g); localStorage.setItem('nexus:board-group', g) }
  const [showCreate, setShowCreate] = useState(false)
  const [createDeadline,   setCreateDeadline]   = useState<string | undefined>()
  const [createStartDate,  setCreateStartDate]  = useState<string | undefined>()
  const [editTask,    setEditTask]    = useState<Task | null>(null)
  const [editCalData, setEditCalData] = useState<{ eventId: string; task: Task } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const qc = useQueryClient()

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ['tasks'],
    queryFn: () => api.get('/tasks').then(r => r.data),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: 30_000,
  })

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['tasks'] })
  }

  function openEdit(task: Task) {
    if (task.assignee.id === currentUser?.id && !task.seenAt) {
      api.post(`/tasks/${task.id}/seen`).then(() => {
        qc.invalidateQueries({ queryKey: ['tasks:unseen'] })
        qc.setQueryData<Task[]>(['tasks'], old =>
          old?.map(t => t.id === task.id ? { ...t, seenAt: new Date().toISOString() } : t) ?? []
        )
      }).catch(() => {})
    }
    if (task.calendarEventId) {
      setEditCalData({ eventId: task.calendarEventId, task })
      return
    }
    setEditTask(task)
  }

  function openCreate(opts: { deadline?: string; startDate?: string } = {}) {
    setCreateDeadline(opts.deadline)
    setCreateStartDate(opts.startDate)
    setShowCreate(true)
  }

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      api.patch(`/tasks/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: ['tasks'] })
      const prev = qc.getQueryData<Task[]>(['tasks'])
      qc.setQueryData<Task[]>(['tasks'], old =>
        old?.map(t => t.id === id ? { ...t, ...patch } : t) ?? []
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['tasks'], ctx.prev)
    },
    onSettled: invalidate,
  })

  function updateTask(id: string, patch: Record<string, unknown>) {
    updateMutation.mutate({ id, patch })
  }

  const uid          = currentUser?.id ?? ''
  const hasSent      = tasks.some(t => t.assignedBy.id === uid && t.assignee.id !== uid)
  const filteredTasks = taskView === 'mine'
    ? tasks.filter(t => t.assignee.id === uid)
    : tasks.filter(t => t.assignedBy.id === uid && t.assignee.id !== uid)

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      {/* Вкладки Задачи/Треки — в китовую шапку. Скрыты, если вкладками рулит «Мой кабинет» (externalTab). */}
      {!externalTab && (
        <HeaderPortal>
          <div style={{ display:'flex', alignItems:'center', gap:2, background:'var(--surface-2)', borderRadius:8, padding:3 }}>
            {(['tasks','tracks'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{ padding:'5px 14px', borderRadius:6, border:'none', background: tab === t ? 'var(--surface)' : 'none', color: tab === t ? 'var(--accent-s)' : 'var(--text-3)', fontFamily:'Inter,sans-serif', fontSize:14, fontWeight: tab === t ? 700 : 500, cursor:'pointer' }}
              >
                {t === 'tasks' ? 'Задачи' : 'Треки'}
              </button>
            ))}
          </div>
        </HeaderPortal>
      )}

      {tab === 'tracks' && <TracksPage onOpenChatWith={onOpenChatWith} />}

      {tab === 'tasks' && <>
      <div style={{ padding:'16px 24px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12, flexShrink:0, flexWrap:'wrap' }}>
        <SegmentedControl value={view} options={[['kanban','Доска'],['table','Таблица'],['gantt','Гант']] as const} onChange={v => setView(v as View)} />
        {view === 'kanban' && (
          <SegmentedControl value={groupBy} options={[['status','По статусу'],['client','По клиенту'],['custom','Мои колонки']] as const} onChange={v => setGroupBy(v as BoardGroupBy)} />
        )}
        {hasSent && (
          <SegmentedControl value={taskView} options={[['mine','Мои'],['sent','Отправленные']] as const} onChange={v => setTaskView(v as TaskView)} />
        )}
        {isLoading && <span style={{ fontSize:12, color:'var(--text-muted)' }}>Загрузка...</span>}
        <div style={{ flex:1 }} />
        <button onClick={() => openCreate()} style={{ padding:'7px 16px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#FF6B35,#E8194B)', color:'#fff', fontFamily:'Inter,sans-serif', fontSize:14, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ fontSize:16, lineHeight:1 }}>+</span> Задача
        </button>
      </div>

      {view === 'kanban' && <KanbanBoard tasks={filteredTasks.filter(t => !t.calendarEventId)} groupBy={groupBy} onUpdate={updateTask} onOpenCreate={openCreate} onEdit={openEdit} currentUserId={currentUser?.id ?? ''} onToast={setToast} />}
      {view === 'table'  && <TaskTable tasks={filteredTasks.filter(t => !t.calendarEventId)} onEdit={openEdit} />}
      {view === 'gantt'  && <GanttChart  tasks={filteredTasks.filter(t => !t.calendarEventId)} onUpdate={updateTask} onOpenCreate={openCreate} onEdit={openEdit} currentUserId={currentUser?.id ?? ''} onToast={setToast} />}

      {showCreate && (
        <TaskModal
          defaultDeadline={createDeadline}
          defaultStartDate={createStartDate}
          onClose={() => setShowCreate(false)}
          onDone={invalidate}
        />
      )}

      {editTask && (
        <TaskModal
          editTask={editTask}
          onClose={() => setEditTask(null)}
          onDone={invalidate}
          onOpenChatWith={onOpenChatWith}
        />
      )}

      {editCalData && (
        <CalendarEventModal
          eventId={editCalData.eventId}
          task={editCalData.task}
          onClose={() => setEditCalData(null)}
          onSaved={() => { invalidate(); qc.invalidateQueries({ queryKey: ['events'] }) }}
          onOpenChatWith={onOpenChatWith}
        />
      )}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
      </>}
    </div>
  )
}
