import { useState, useRef, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../stores/auth'
import { api } from '../lib/api'
import { TaskModal, CalendarEventModal } from './TasksPage'
import type { Task } from './TasksPage'
import { DayFillCard } from '../components/DayFillCard'
import { MonthStrip } from '../components/MonthStrip'
import { TaskTemplatesPanel } from '../components/TaskTemplatesPanel'
import { ROLE, chip } from '../lib/roleColors'
import { Combobox } from '../ui-kit/components/Combobox'
import { TimePicker } from '../ui-kit/components/TimePicker'
import { DataTable, EditableCell } from '../ui-kit/components/DataTable'
import { Tooltip } from '../components/Tooltip'
import { cn } from '../ui-kit/lib/cn'
import { Maximize2, GripVertical, Lock, LayoutTemplate } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { DndContext, DragOverlay, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, defaultDropAnimationSideEffects, type DragEndEvent, type DragStartEvent, type DragOverEvent, type DropAnimation } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { toast } from '../lib/toast'
import { LINK_META, linkIcon } from '../lib/linkMeta'
import { taskWindow, inTaskWindow } from '../lib/taskWindow'

// ── Types ──────────────────────────────────────────────────────────────────────
interface ApiEvent {
  id: string; type: string; title: string; description: string
  date: string; startTime: string; endTime: string; location: string[]; status: string
  authorId: string; author: { id: string; name: string }
  participants: Array<{ userId: string; user: { id: string; name: string } }>
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function toDay(d: string | Date) {
  const s = typeof d === 'string' ? d : d.toISOString()
  return s.slice(0, 10)
}
function daysDiff(deadline: string) {
  const today = new Date(); today.setHours(0,0,0,0)
  const dl    = new Date(deadline); dl.setHours(0,0,0,0)
  return Math.round((dl.getTime() - today.getTime()) / 86_400_000)
}
function fmtTime(t: string) { return t.slice(0,5) }

const TYPE_COLOR: Record<string, string> = {
  meeting: '#8B5CF6', task: '#FF6B35', personal: '#22C55E',
}
const TYPE_LABEL: Record<string, string> = {
  meeting: 'Встреча', task: 'Задача', personal: 'Личное',
}

// ── Quick event modal ──────────────────────────────────────────────────────────
function QuickEventModal({ date, onClose, onCreated }: { date: string; onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState('')
  const [start, setStart] = useState('09:00')
  const [end,   setEnd]   = useState('10:00')
  const [type,  setType]  = useState('meeting')
  const mdRef = useRef(false)
  const qc    = useQueryClient()

  const createMut = useMutation({
    mutationFn: () => api.post('/events', { type, title: title.trim(), description: '', date, startTime: start, endTime: end, location: [], participantIds: [] }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events'] })
      qc.invalidateQueries({ queryKey: ['dashboard:events'] })
      onCreated(); onClose()
    },
  })

  const inp: React.CSSProperties = { width:'100%', background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 11px', color:'var(--text-1)', fontFamily:'Inter,sans-serif', fontSize:14, outline:'none', boxSizing:'border-box' as const }
  const lbl: React.CSSProperties = { fontSize:12, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase' as const, letterSpacing:'1px', marginBottom:6, display:'block' }

  return (
    <div
      onMouseDown={e => { mdRef.current = e.target === e.currentTarget }}
      onMouseUp={e => { if (mdRef.current && e.target === e.currentTarget) onClose() }}
      style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
    >
      <div onMouseDown={e => e.stopPropagation()} style={{ background:'var(--surface-2)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:16, padding:24, width:380, maxWidth:'100%', fontFamily:'Inter,sans-serif', boxShadow:'0 24px 64px rgba(0,0,0,0.5)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <div style={{ fontSize:15, fontWeight:700, color:'var(--text-1)' }}>Новое событие</div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.06)', border:'1px solid var(--border)', color:'var(--text-3)', borderRadius:6, width:28, height:28, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>

        <div style={{ marginBottom:14 }}>
          <span style={lbl}>Тип</span>
          <div style={{ display:'flex', gap:8 }}>
            {[['meeting','Встреча'],['task','Задача'],['personal','Личное']].map(([v,l]) => {
              const sel = type === v; const c = TYPE_COLOR[v]
              return <button key={v} onClick={() => setType(v)} style={{ flex:1, padding:'7px 0', borderRadius:8, border:`1px solid ${sel ? c : 'var(--border)'}`, background: sel ? c+'22' : 'none', color: sel ? c : 'var(--text-3)', fontFamily:'Inter,sans-serif', fontSize:12, fontWeight: sel ? 700 : 400, cursor:'pointer' }}>{l}</button>
            })}
          </div>
        </div>

        <div style={{ marginBottom:14 }}>
          <span style={lbl}>Название</span>
          <input autoFocus value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && title.trim()) createMut.mutate() }} placeholder="Название события" style={inp} />
        </div>

        <div style={{ display:'flex', gap:10, marginBottom:20 }}>
          <div style={{ flex:1 }}>
            <span style={lbl}>Начало</span>
            <input type="time" value={start} onChange={e => setStart(e.target.value)} style={{ ...inp, colorScheme:'dark' }} />
          </div>
          <div style={{ flex:1 }}>
            <span style={lbl}>Конец</span>
            <input type="time" value={end} onChange={e => setEnd(e.target.value)} style={{ ...inp, colorScheme:'dark' }} />
          </div>
        </div>

        <div style={{ display:'flex', gap:8 }}>
          <button onClick={onClose} style={{ flex:1, fontFamily:'Inter,sans-serif', fontSize:14, fontWeight:600, background:'rgba(255,255,255,0.06)', border:'1px solid var(--border)', color:'var(--text-3)', borderRadius:8, padding:'9px 0', cursor:'pointer' }}>Отмена</button>
          <button onClick={() => { if (title.trim()) createMut.mutate() }} disabled={!title.trim() || createMut.isPending} style={{ flex:2, fontFamily:'Inter,sans-serif', fontSize:14, fontWeight:700, background:'#7B61FF', border:'none', color:'#fff', borderRadius:8, padding:'9px 0', cursor:'pointer', opacity: title.trim() ? 1 : 0.5 }}>
            {createMut.isPending ? '...' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Deadline badge ─────────────────────────────────────────────────────────────
function DeadlineBadge({ days }: { days: number }) {
  const color = days < 0 ? '#F43F5E' : days === 0 ? '#FF6B35' : days <= 2 ? '#F59E0B' : 'var(--text-muted)'
  const label = days < 0 ? `просрочено ${Math.abs(days)} д.` : days === 0 ? 'сегодня' : `${days} дн.`
  return (
    <span style={{ fontSize:12, fontWeight:700, padding:'2px 8px', borderRadius:20, background: color+'22', color, whiteSpace:'nowrap' }}>
      {label}
    </span>
  )
}

// «Мой статус»-заглушка убрана: дублировала «Тип дня» из DayFillCard. Единый статус
// (присутствие + формат дня + связь со Сводом) собираем на этапе HR-графика (план A).

// ── Инфопанель дедлайнов — сводка «N с дедлайнами / M просрочено» по МОИМ незакрытым задачам.
// Клик по «N с дедлайнами» — переход в Гант; клик по «M просрочено» — переход в Гант с открытой
// самой просроченной задачей (наименьший дедлайн). Красный — тот же hex, что и у остальных мест
// просрочки в приложении (TaskTable/Gantt), НЕ роль Danger (та — только для деструктива, DESIGN.md).
const OVERDUE_COLOR = '#F43F5E'
function DeadlinesInfoCard({ tasks, meId, onOpenGantt }: { tasks: Task[]; meId?: string; onOpenGantt?: (taskId?: string) => void }) {
  const withDeadline = tasks.filter(t => t.assignee.id === meId && t.status !== 'done' && !!t.deadline)
  const overdue = [...withDeadline].filter(t => daysDiff(t.deadline!) < 0).sort((a, b) => a.deadline!.localeCompare(b.deadline!))
  const card: React.CSSProperties = { background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 22px' }
  if (withDeadline.length === 0) return null
  return (
    <div style={card}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>Дедлайны</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => onOpenGantt?.()} title="Открыть в Ганте" style={{ ...chip('warning'), border: 'none', cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
          {withDeadline.length} с дедлайнами
        </button>
        {overdue.length > 0 && (
          <button onClick={() => onOpenGantt?.(overdue[0].id)} title="Открыть самую просроченную задачу в Ганте"
            style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: OVERDUE_COLOR + '22', color: OVERDUE_COLOR, border: 'none', cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
            {overdue.length} просрочено
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────
export function DashboardPage({ onOpenGanttTask }: { onOpenGanttTask?: (taskId?: string) => void } = {}) {
  const currentUser = useAuthStore(s => s.user)
  const qc          = useQueryClient()
  const now         = new Date()
  const todayStr    = toDay(now)

  const [selDate,         setSelDate]         = useState(todayStr)
  const [showCreateTask,  setShowCreateTask]  = useState(false)
  const [showCreateEvent, setShowCreateEvent] = useState(false)
  const [editTask,        setEditTask]        = useState<Task | null>(null)
  const [viewEventId,     setViewEventId]     = useState<string | null>(null)
  const [templatesOpen,   setTemplatesOpen]   = useState(false)
  useEffect(() => { setTemplatesOpen(false) }, [selDate]) // смена дня — закрыть панель шаблонов

  const isToday   = selDate === todayStr
  const dayShort  = new Date(selDate + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })

  const { data: allTasks = [] } = useQuery<Task[]>({
    queryKey: ['tasks', 'mine'],
    queryFn:  () => api.get('/tasks', { params: { scope: 'mine' } }).then(r => r.data),
    staleTime: 0, refetchOnMount: 'always',
  })

  const { data: dayEvents = [] } = useQuery<ApiEvent[]>({
    queryKey: ['dashboard:events', selDate],
    queryFn:  () => api.get(`/events?from=${selDate}&to=${selDate}`).then(r => r.data),
    staleTime: 0, refetchOnMount: 'always',
  })


  const doneMut = useMutation({
    mutationFn: (t: Task) => api.patch(`/tasks/${t.id}`, { status: t.status === 'done' ? 'inprogress' : 'done' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
    // раньше молча падало (день не активен → 400 без отклика). Теперь тост «Начните рабочий день…».
    onError: (e: any) => toast(e?.response?.data?.error ?? 'Не удалось изменить статус задачи', 'info'),
  })

  // Задача переезжает на другой день / у неё двигается дедлайн (drag на MonthStrip) — единая мутация.
  const moveMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => api.patch(`/tasks/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
    onError: (e: any) => toast(e?.response?.data?.error ?? 'Не удалось передвинуть задачу', 'info'),
  })

  // Порядок задач ВНУТРИ выбранного дня (модель «окно»: задача живёт в нескольких днях — TaskDayOrder).
  const { data: dayOrder = {} } = useQuery<Record<string, number>>({
    queryKey: ['tasks', 'day-order', selDate],
    queryFn:  () => api.get('/tasks/day-order', { params: { day: selDate } }).then(r => r.data),
    staleTime: 0,
  })
  const reorderMut = useMutation({ mutationFn: (ids: string[]) => api.patch('/tasks/reorder', { day: selDate, ids }) })

  // Признак «сегодня рабочий день завершён» (endTime) — guard: в закрытый день незакрытую задачу не переносим.
  const { data: todayEntries = [] } = useQuery<Array<{ date: string; endTime: string | null }>>({
    queryKey: ['day-entries', todayStr, todayStr],
    queryFn: () => api.get(`/day-entries?from=${todayStr}&to=${todayStr}`).then(r => r.data),
  })
  const todayFinished = !!todayEntries[0]?.endTime

  // Only regular (non-calendar) tasks
  const regularTasks = allTasks.filter(t => !t.calendarEventId)

  const [dragId, setDragId] = useState<string | null>(null)
  // Пока висит подтверждение переноса дедлайна — задача НЕ в списке дня, а «зависает» ярко под попапом.
  const [confirmMove, setConfirmMove] = useState<{ task: Task; day: string } | null>(null)

  // Рабочий набор дня — модель «окно» [startDate, deadline]: задача видна КАЖДЫЙ день внутри окна;
  // закрытая — зачёркнута до дня закрытия (doneAt), дальше не показывается (просрочку без переноса
  // подсвечивает инфопанель дедлайнов, не список дня). Порядок — свой в каждом дне (dayOrder).
  const dayTasks = regularTasks
    .filter(t => t.assignee.id === currentUser?.id && (t.status === 'inprogress' || t.status === 'done') && inTaskWindow(t, selDate) && t.id !== confirmMove?.task.id)
    .sort((a, b) => (dayOrder[a.id] ?? 1e9) - (dayOrder[b.id] ?? 1e9) || String(a.createdAt).localeCompare(String(b.createdAt)))

  const sortedEvents = [...dayEvents].sort((a, b) => a.startTime.localeCompare(b.startTime))

  // ── DnD: общий контекст на список задач дня (реордер внутри дня) + MonthStrip (перенос на другой день) ──
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  // Над днём ли бросили (MonthStrip) — и на сколько сдвинуть overlay, чтобы он ушёл в ЦЕНТР ячейки дня,
  // а не в центр самой строки. Refs, а не state — читаются в момент drop-анимации, ре-рендер не нужен.
  const overDayRef = useRef(false)
  const flyDeltaRef = useRef({ x: 0, y: 0 }) // экранная дельта (центр дня − центр строки) на момент отпускания
  // Drop-анимация overlay: при переносе НА ДЕНЬ строка не «улетает» обратно к таблице (дефолт dnd-kit
  // возвращает overlay к исходной позиции). Вместо этого overlay ЛЕТИТ к центру ячейки дня (сдвиг flyDelta)
  // и там уменьшается+гаснет — задача «попадает» именно в день. Реордер ВНУТРИ таблицы — стандартно.
  const dropAnimation: DropAnimation = {
    duration: 260,
    easing: 'cubic-bezier(0.2, 0, 0, 1)',
    sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.4' } } }),
    keyframes({ transform }) {
      const ix = transform.initial.x, iy = transform.initial.y
      if (overDayRef.current) {
        const d = flyDeltaRef.current
        return [
          { opacity: 1, transform: `translate3d(${ix}px, ${iy}px, 0) scale(1)` },
          { opacity: 0, transform: `translate3d(${ix + d.x}px, ${iy + d.y}px, 0) scale(0.12)` },
        ]
      }
      return [{ transform: CSS.Transform.toString(transform.initial) }, { transform: CSS.Transform.toString(transform.final) }]
    },
  }

  const onRowReorder = (fromId: string, toId: string) => {
    const ids = dayTasks.map(t => t.id)
    const from = ids.indexOf(fromId), to = ids.indexOf(toId)
    if (from < 0 || to < 0 || from === to) return
    const next = [...ids]; next.splice(from, 1); next.splice(to, 0, fromId)
    const prev = qc.getQueryData<Record<string, number>>(['tasks', 'day-order', selDate])
    qc.setQueryData(['tasks', 'day-order', selDate], Object.fromEntries(next.map((id, i) => [id, i])))
    reorderMut.mutate(next, { onError: () => qc.setQueryData(['tasks', 'day-order', selDate], prev) })
  }

  // Правила drag-на-день (решения по «окну»): день внутри окна → нельзя (уже видна); за дедлайн вперёд →
  // попап «передвинуть дедлайн?» (только автор задачи); на более раннее число → окно расширяется назад.
  const onDropOnDay = (taskId: string, targetDay: string) => {
    const t = dayTasks.find(x => x.id === taskId)
    if (!t) return
    const fmtD = (ds: string) => new Date(ds + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
    const moveMsg = `Задача перенесена: ${fmtD(toDay(t.startDate))} → ${fmtD(targetDay)}` // с какого → на какое (5 сек)
    if (t.status === 'done') { toast('Закрытую задачу нельзя перенести', 'info'); return }
    if (toDay(t.startDate) === targetDay) return // тот же день — ничего
    // Guard симметрии «закрытого дня»: незакрытую задачу нельзя перенести в прошедший или уже
    // завершённый день — иначе в закрытом дне повиснет inprogress-задача (баг последовательности).
    if (targetDay < todayStr) { toast('Незакрытую задачу нельзя перенести в прошедший день', 'info'); return }
    if (targetDay === todayStr && todayFinished) { toast('Рабочий день уже завершён — перенесите задачу на другой день', 'info'); return }
    // Без дедлайна (дефолтное окно в 1 день) → перенос = просто смена дня: задача уходит с текущего.
    if (!t.deadline) {
      moveMut.mutate({ id: taskId, data: { startDate: targetDay } }, { onSuccess: () => toast(moveMsg, 'success', 5000) })
      return
    }
    const { start, end } = taskWindow(t)
    if (targetDay >= start && targetDay <= end) { toast('Нельзя, уже в пределах дедлайна', 'info'); return }
    if (targetDay > end) { // за дедлайн вперёд → подтвердить продление (только автор)
      if (t.assignedBy.id !== currentUser?.id) { toast('Дедлайн меняет только создатель', 'info'); return }
      setConfirmMove({ task: t, day: targetDay })
      return
    }
    moveMut.mutate({ id: taskId, data: { startDate: targetDay } }, { onSuccess: () => toast(moveMsg, 'success', 5000) }) // раньше начала
  }

  const handleDragEnd = (e: DragEndEvent) => {
    const overId = e.over ? String(e.over.id) : ''
    const isDay = overId.startsWith('day:')
    // Дельта до центра дня для drop-анимации — считаем ДО setDragId(null) (иначе overlay уже анимируется).
    overDayRef.current = isDay
    const ar = e.active.rect.current.translated
    if (isDay && e.over?.rect && ar) {
      const or = e.over.rect
      flyDeltaRef.current = {
        x: (or.left + or.width / 2) - (ar.left + ar.width / 2),
        y: (or.top + or.height / 2) - (ar.top + ar.height / 2),
      }
    } else {
      flyDeltaRef.current = { x: 0, y: 0 }
    }
    setDragId(null)
    if (!e.over) return
    const activeId = String(e.active.id)
    if (activeId === DRAFT_ID) return
    if (isDay) onDropOnDay(activeId, overId.slice(4))
    else if (activeId !== overId) onRowReorder(activeId, overId)
  }

  return (
    <DndContext sensors={dndSensors} collisionDetection={closestCenter}
      onDragStart={(e: DragStartEvent) => { overDayRef.current = false; setDragId(String(e.active.id)) }}
      onDragOver={(e: DragOverEvent) => { overDayRef.current = String(e.over?.id ?? '').startsWith('day:') }}
      onDragCancel={() => { overDayRef.current = false; setDragId(null) }}
      onDragEnd={handleDragEnd}>
    <div style={{ display: 'flex', height: '100%', boxSizing: 'border-box' }}>
    <div style={{ flex: 1, minWidth: 0, padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto', boxSizing: 'border-box' }}>
      {/* Две колонки: слева «Мой рабочий день» + «Задачи на сегодня» (одна ширина);
          справа «Стратегические цели отдела» + «События» таблицей (одна ширина). */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: 2, minWidth: 360, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <DayFillCard date={selDate} openTasksCount={dayTasks.filter(t => t.status === 'inprogress').length} />
          <TodayTasksTable
            title={`Задачи на ${isToday ? 'сегодня' : dayShort}`}
            tasks={dayTasks}
            meId={currentUser?.id}
            day={selDate}
            dragId={dragId}
            onOpen={t => setEditTask(t)}
            onToggle={t => doneMut.mutate(t)}
            onChanged={() => qc.invalidateQueries({ queryKey: ['tasks'] })}
            onAdd={() => setShowCreateTask(true)}
            onOpenTemplates={() => setTemplatesOpen(true)}
            dropAnimation={dropAnimation}
          />
        </div>
        <div style={{ flex: 1, minWidth: 300, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <DeadlinesInfoCard tasks={regularTasks} meId={currentUser?.id} onOpenGantt={onOpenGanttTask} />
          <DeptGoalsCard />
          <EventsTable
            title={`События ${isToday ? 'сегодня' : dayShort}`}
            events={sortedEvents}
            onOpen={ev => setViewEventId(ev.id)}
            onAdd={() => setShowCreateEvent(true)}
          />
        </div>
      </div>

      {/* Modals */}
      {showCreateTask && (
        <TaskModal
          defaultStartDate={selDate}
          onClose={() => setShowCreateTask(false)}
          onDone={() => { qc.invalidateQueries({ queryKey: ['tasks'] }); setShowCreateTask(false) }}
        />
      )}
      {editTask && (
        <TaskModal
          editTask={editTask}
          onClose={() => setEditTask(null)}
          onDone={() => { qc.invalidateQueries({ queryKey: ['tasks'] }) }}
        />
      )}
      {showCreateEvent && (
        <QuickEventModal
          date={selDate}
          onClose={() => setShowCreateEvent(false)}
          onCreated={() => {}}
        />
      )}
      {viewEventId && (
        <CalendarEventModal
          eventId={viewEventId}
          onClose={() => setViewEventId(null)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['dashboard:events'] }) }}
        />
      )}
      {confirmMove && (
        <MoveDeadlineConfirm
          task={confirmMove.task}
          day={confirmMove.day}
          pending={moveMut.isPending}
          onCancel={() => setConfirmMove(null)}
          onConfirm={() => moveMut.mutate({ id: confirmMove.task.id, data: { deadline: confirmMove.day } }, { onSuccess: () => setConfirmMove(null) })}
        />
      )}
      <TaskTemplatesPanel
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        day={selDate}
        isToday={isToday}
        meId={currentUser?.id}
        onInstantiated={() => { qc.invalidateQueries({ queryKey: ['tasks'] }); qc.invalidateQueries({ queryKey: ['tasks', 'day-order', selDate] }) }}
      />
    </div>
      <MonthStrip selected={selDate} today={todayStr} onSelect={setSelDate} tasks={regularTasks} meId={currentUser?.id} />
    </div>
    </DndContext>
  )
}

// ── Попап подтверждения переноса дедлайна (drag задачи за окно вперёд) — канон mousedown/mouseup + Esc + ✕.
// Пока попап открыт, переносимая задача НЕ в списке дня, а «зависает» ЯРКОЙ карточкой прямо под попапом,
// чтобы видеть одновременно и задачу, и вопрос. ──
function MoveDeadlineConfirm({ task, day, onCancel, onConfirm, pending }: {
  task: Task; day: string; onCancel: () => void; onConfirm: () => void; pending: boolean
}) {
  const mdRef = useRef(false)
  const fmtDay = new Date(day + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
  const curDeadline = task.deadline ? new Date(toDay(task.deadline) + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : '—'
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])
  return (
    <div
      onMouseDown={e => { mdRef.current = e.target === e.currentTarget }}
      onMouseUp={e => { if (mdRef.current && e.target === e.currentTarget) onCancel() }}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 }}
    >
      <div onMouseDown={e => e.stopPropagation()} style={{ position: 'relative', background: 'var(--surface-2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 24, width: 380, maxWidth: '100%', fontFamily: 'Inter,sans-serif', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        <button onClick={onCancel} title="Закрыть (Esc)" style={{ position: 'absolute', top: 12, right: 12, width: 26, height: 26, borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 10 }}>Передвинуть дедлайн?</div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20, lineHeight: 1.5 }}>
          Перенести дедлайн на <b style={{ color: 'var(--text-1)' }}>{fmtDay}</b>?
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={{ flex: 1, fontFamily: 'Inter,sans-serif', fontSize: 14, fontWeight: 600, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'var(--text-3)', borderRadius: 8, padding: '9px 0', cursor: 'pointer' }}>Отмена</button>
          <button onClick={onConfirm} disabled={pending} style={{ flex: 1, fontFamily: 'Inter,sans-serif', fontSize: 14, fontWeight: 700, background: '#7B61FF', border: 'none', color: '#fff', borderRadius: 8, padding: '9px 0', cursor: 'pointer', opacity: pending ? 0.6 : 1 }}>
            {pending ? '...' : 'Передвинуть'}
          </button>
        </div>
      </div>
      {/* Яркая карточка переносимой задачи — прямо под попапом (её нет в списке дня, пока идёт подтверждение) */}
      <div onMouseDown={e => e.stopPropagation()} style={{ background: 'var(--surface-1)', border: '2px solid var(--accent)', borderRadius: 12, padding: '14px 18px', width: 380, maxWidth: '100%', boxShadow: '0 16px 44px -8px rgba(0,0,0,0.45)' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title || 'Без названия'}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>Дедлайн {curDeadline} → <b style={{ color: 'var(--accent)' }}>{fmtDay}</b></div>
      </div>
    </div>
  )
}

// ── Мои цели — личные стратегические цели сотрудника (к ним подвяжутся задачи, отдельным заходом) ──
interface PGoal { id: string; text: string; done: boolean }
function PersonalGoalsCard() {
  const qc = useQueryClient()
  const { data: goals = [] } = useQuery<PGoal[]>({ queryKey: ['personal-goals'], queryFn: () => api.get('/personal-goals').then(r => r.data), staleTime: 60_000 })
  const [edit, setEdit] = useState(false)
  const put = useMutation({ mutationFn: (list: Array<{ text: string; done: boolean }>) => api.put('/personal-goals', { goals: list }), onSuccess: () => qc.invalidateQueries({ queryKey: ['personal-goals'] }) })
  const toggle = (id: string) => put.mutate(goals.map(g => ({ text: g.text, done: g.id === id ? !g.done : g.done })))

  const card: React.CSSProperties = { background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 22px' }
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', flex: 1 }}>Мои цели</span>
        <button onClick={() => setEdit(true)} style={{ background: 'none', border: 'none', color: 'var(--accent-s)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>{goals.length ? 'Изменить' : '+ Добавить'}</button>
      </div>
      {goals.length === 0 ? (
        <div style={{ fontSize: 14, color: 'var(--text-muted)', fontStyle: 'italic' }}>Задайте личные цели — к ним будете подвязывать задачи.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {goals.map(g => (
            <div key={g.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <button onClick={() => toggle(g.id)} title={g.done ? 'Снять отметку' : 'Отметить достигнутой'}
                style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${g.done ? ROLE.success : 'var(--border)'}`, background: g.done ? ROLE.success : 'none', cursor: 'pointer', flexShrink: 0, marginTop: 1, color: '#fff', fontSize: 12, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{g.done ? '✓' : ''}</button>
              <span style={{ fontSize: 14, color: g.done ? 'var(--text-muted)' : 'var(--text-1)', textDecoration: g.done ? 'line-through' : 'none', lineHeight: 1.4 }}>{g.text}</span>
            </div>
          ))}
        </div>
      )}
      {edit && <EditPersonalGoalsModal goals={goals} onClose={() => setEdit(false)} onSaved={() => qc.invalidateQueries({ queryKey: ['personal-goals'] })} />}
    </div>
  )
}

function EditPersonalGoalsModal({ goals, onClose, onSaved }: { goals: PGoal[]; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState(goals.map(g => g.text).join('\n'))
  const down = useRef(false)
  const put = useMutation({
    mutationFn: () => {
      const doneByText = new Map(goals.map(g => [g.text, g.done]))
      const list = text.split('\n').map(s => s.trim()).filter(Boolean).map(t => ({ text: t, done: doneByText.get(t) ?? false }))
      return api.put('/personal-goals', { goals: list })
    },
    onSuccess: () => { onSaved(); onClose() },
    onError: (e: unknown) => { const err = e as { response?: { data?: { error?: string } } }; toast(err?.response?.data?.error ?? 'Не удалось сохранить', 'info') },
  })
  return (
    <div onMouseDown={e => { down.current = e.target === e.currentTarget }} onMouseUp={e => { if (down.current && e.target === e.currentTarget) onClose(); down.current = false }}
      style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onMouseDown={e => e.stopPropagation()} style={{ width: 460, maxWidth: '100%', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 16, padding: 22, boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', marginBottom: 6 }}>Мои цели</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>Одна цель — одна строка. Отметки «достигнуто» сохранятся.</div>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={8}
          placeholder={'Пройти курс по монтажу\nВзять на себя новый проект\n…'}
          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', color: 'var(--text-1)', fontFamily: 'Inter,sans-serif', fontSize: 14, outline: 'none', resize: 'vertical', lineHeight: 1.5 }} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text-2)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>Отмена</button>
          <button onClick={() => put.mutate()} disabled={put.isPending} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: ROLE.primary, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>{put.isPending ? '…' : 'Сохранить'}</button>
        </div>
      </div>
    </div>
  )
}

// ── События дня — таблица (Время / Название / Тип); клик по строке → карточка; снизу «Добавить событие» ──
function EventsTable({ title, events, onOpen, onAdd }: {
  title: string; events: ApiEvent[]; onOpen: (ev: ApiEvent) => void; onAdd: () => void
}) {
  const columns = useMemo<ColumnDef<ApiEvent, unknown>[]>(() => [
    { id: 'time', header: 'Время', enableSorting: false, meta: { width: '116px' },
      cell: ({ row }) => { const ev = row.original; const c = TYPE_COLOR[ev.type] ?? '#8B5CF6'
        return <span style={{ fontSize: 13, fontWeight: 700, color: c, whiteSpace: 'nowrap' }}>{fmtTime(ev.startTime)}–{fmtTime(ev.endTime)}</span> } },
    { id: 'title', header: 'Название', accessorKey: 'title', enableSorting: false,
      cell: ({ row }) => <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.original.title}</span> },
    { id: 'type', header: 'Тип', enableSorting: false, meta: { width: '104px' },
      cell: ({ row }) => { const ev = row.original; const c = TYPE_COLOR[ev.type] ?? '#8B5CF6'
        return <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 20, background: c + '18', color: c, fontWeight: 600, whiteSpace: 'nowrap' }}>{TYPE_LABEL[ev.type] ?? ev.type}</span> } },
  ], [])
  return (
    <div style={{ width: '100%' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>{title}</div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <DataTable columns={columns} data={events} hideToolbar getRowId={ev => ev.id}
          onRowClick={onOpen} addRowLabel="Добавить событие" onAddRow={onAdd} />
      </div>
    </div>
  )
}

// ── Задачи на сегодня: div-grid sortable (паттерн support/ServersView — гладкий drag, не <table>) ──
// Колонки строки: grip · открыть · Клиент · Связь · Задача · Время · готово
const TASK_COLS = '22px 26px 150px 160px minmax(0,1fr) 116px 40px'

// Хендл drag-строки — ровно то, что отдаёт useSortable (DraggableAttributes + listeners),
// а не «ручной» Record: у DraggableAttributes нет индексной сигнатуры, tsc -b это ловит.
type DragHandle = Pick<ReturnType<typeof useSortable>, 'attributes' | 'listeners'>

// Sortable-строка задачи: div-подсетка (subgrid) выровнена по шапке; grip-хендл через render-prop.
function SortableTaskRow({ id, children }: { id: string; children: (h: DragHandle) => React.ReactNode }) {
  // 1:1 с support/ServersView SortableParam: дефолтный useSortable, стиль только transform/transition/opacity.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style: React.CSSProperties = {
    gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'subgrid', alignItems: 'center',
    borderTop: '1px solid var(--border)', background: 'var(--surface)',
    transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0 : 1,
  }
  return <div ref={setNodeRef} style={style} className="group">{children({ attributes, listeners })}</div>
}

type Draft = { client: string; link: string; title: string; time: string }
const DRAFT_ID = '__draft__'
// У стратегической цели нет клиента → подставляем компанию (совпадает с карточкой задачи)
const COMPANY_NAME = 'Мегаполис Медиа'
// Чипы (выпадашки/время) в таблице задач — на фоне таблицы, без обводки в покое;
// при ОТКРЫТИИ (data-state=open у Radix-триггера) — устойчивая скруглённая обводка + ring, как у «Время».
const chipWhite = 'w-full !bg-[var(--surface)] !border-transparent data-[state=open]:!border-[var(--accent)] data-[state=open]:ring-2 data-[state=open]:ring-[var(--accent-soft)]'

function TodayTasksTable({ title, tasks, meId, day, dragId, onOpen, onToggle, onChanged, onAdd: _onAdd, onOpenTemplates, dropAnimation }: {
  title: string; tasks: Task[]; meId?: string; day: string; dragId: string | null
  onOpen: (t: Task) => void; onToggle: (t: Task) => void; onChanged: () => void; onAdd: () => void; onOpenTemplates: () => void
  dropAnimation: DropAnimation
}) {
  const { data: projects = [] } = useQuery<Array<{ id: string; title: string; client?: { id: string; name: string } | null }>>({ queryKey: ['projects'], queryFn: () => api.get('/projects').then(r => r.data), staleTime: 300_000 })
  const { data: clients = [] } = useQuery<Array<{ id: string; name: string }>>({ queryKey: ['clients'], queryFn: () => api.get('/clients').then(r => r.data), staleTime: 300_000 })
  const { data: goals = [] } = useQuery<Array<{ id: string; title: string }>>({ queryKey: ['strategic-goals'], queryFn: () => api.get('/strategic-goals').then(r => r.data), staleTime: 120_000 })
  const { data: tracks = [] } = useQuery<Array<{ id: string; title: string }>>({ queryKey: ['tracks'], queryFn: () => api.get('/tracks').then(r => r.data), staleTime: 120_000 })
  // Серверный вердикт «можно ли добавлять задачу в этот день» — кнопку «Добавить задачу» показываем
  // только когда сервер разрешил (аффорданс = серверная правда, а не клиентская копия правила замка).
  const { data: dayPolicy } = useQuery<{ canAddTask: boolean; reason: string | null }>({
    queryKey: ['day-policy', day], queryFn: () => api.get('/day-entries/policy', { params: { date: day } }).then(r => r.data), staleTime: 20_000,
  })
  const canAdd = dayPolicy?.canAddTask ?? true // до ответа не блокируем — сервер всё равно жёсткий бэкстоп
  const patch = useMutation({ mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => api.patch(`/tasks/${id}`, data), onSuccess: onChanged, onError: (e: any) => toast(e?.response?.data?.error ?? 'Не удалось сохранить', 'info') })
  const [draft, setDraft] = useState<Draft | null>(null)
  useEffect(() => { setDraft(null) }, [day]) // смена дня — сбросить черновик (не тащить его в другой/закрытый день)
  const clientOpts = clients.map(c => ({ value: c.name, label: c.name }))
  const toMinutes = (hhmm: string) => { if (!hhmm) return null; const [h, m] = hhmm.split(':').map(Number); return (h || 0) * 60 + (m || 0) }
  const toHHMM = (min?: number | null) => min ? `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}` : ''

  // Сгруппированные опции «Связь» (Треки / Стратегические задачи / Проекты); проекты фильтруются по клиенту
  const linkOptionsFor = (clientVal?: string | null) => {
    const cv = (clientVal || '').trim()
    const projs = cv ? projects.filter(p => (p.client?.name ?? '') === cv) : projects
    return [
      { value: 'none', label: '—' },
      ...tracks.map(t => ({ value: `track:${t.id}`, label: t.title, group: LINK_META.track.group, icon: linkIcon('track') })),
      ...goals.map(g => ({ value: `goal:${g.id}`, label: g.title, group: LINK_META.goal.group, icon: linkIcon('goal') })),
      ...projs.map(p => ({ value: `project:${p.id}`, label: p.title, group: LINK_META.project.group, icon: linkIcon('project') })),
    ]
  }
  const linkValueOf = (t: { projectId?: string | null; goalId?: string | null; trackId?: string | null }) =>
    t.projectId ? `project:${t.projectId}` : t.goalId ? `goal:${t.goalId}` : t.trackId ? `track:${t.trackId}` : 'none'
  // Применить выбор связи к существующей задаче (выбор цели авто-ставит клиента = компания)
  const applyLink = (taskId: string, v: string) => {
    const [type, id] = v.split(':')
    const data: Record<string, unknown> = { projectId: type === 'project' ? id : null, goalId: type === 'goal' ? id : null, trackId: type === 'track' ? id : null }
    if (type === 'goal') data.client = COMPANY_NAME
    patch.mutate({ id: taskId, data })
  }

  const create = useMutation({
    mutationFn: (d: Draft) => {
      const [type, id] = (d.link || 'none').split(':')
      return api.post('/tasks', { title: d.title.trim(), assigneeId: meId, status: 'inprogress', startDate: day, client: d.client || null,
        projectId: type === 'project' ? id : null, goalId: type === 'goal' ? id : null, trackId: type === 'track' ? id : null,
        actualMinutes: toMinutes(d.time) })
    },
    onSuccess: () => { setDraft(null); onChanged(); toast('Задача добавлена') },
    onError: (e: any) => toast(e?.response?.data?.error ?? 'Не удалось создать задачу', 'info'),
  })

  // Клик вне строки-черновика: заполнено название → создать; пусто → отменить (убрать строку).
  // Клики внутри самой строки (ячейки помечены data-draft-cell) и в открытых радикс-попапах — игнор.
  const draftRef = useRef(draft)
  draftRef.current = draft
  const draftActive = !!draft
  useEffect(() => {
    if (!draftActive) return
    const onDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('[data-draft-cell]') || el.closest('[data-radix-popper-content-wrapper]')) return
      const d = draftRef.current
      if (d?.title.trim() && meId) create.mutate(d)
      else setDraft(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [draftActive, meId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Черновик рисуется как обычная строка (Task-образный объект)
  const draftRow = draft ? ({ id: DRAFT_ID, title: draft.title, client: draft.client || null, actualMinutes: toMinutes(draft.time), status: 'backlog', assignee: { id: meId ?? '', name: '' } } as unknown as Task) : null

  const gridRef = useRef<HTMLDivElement>(null)
  const activeTask = dragId ? tasks.find(t => t.id === dragId) : undefined

  // Короткий разделитель между колонками: 1px-линия 60% высоты, по центру у правого края (не во всю строку)
  const sep: React.CSSProperties = { backgroundImage: 'linear-gradient(var(--border), var(--border))', backgroundRepeat: 'no-repeat', backgroundPosition: 'right center', backgroundSize: '1px 55%' }
  // Ячейки строки (7 колонок). handle — drag-хендл (только у sortable-строк); dr — черновик.
  const cell = (content: React.ReactNode, extra?: React.CSSProperties, dr?: boolean) =>
    <div data-draft-cell={dr || undefined} style={{ padding: '5px 8px', minWidth: 0, display: 'flex', alignItems: 'center', ...extra }}>{content}</div>
  const taskCells = (t: Task, handle?: DragHandle) => {
    const dr = t.id === DRAFT_ID, done = t.status === 'done', mine = t.assignee.id === meId
    return (<>
      {/* grip */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {!dr && (
          <span {...(handle?.attributes ?? {})} {...(handle?.listeners ?? {})}
            className={cn('flex touch-none items-center justify-center text-[var(--muted)]', handle ? 'cursor-grab opacity-0 transition-opacity group-hover:opacity-100 hover:text-[var(--accent)] active:cursor-grabbing' : '')}>
            <GripVertical className="h-4 w-4" />
          </span>
        )}
      </div>
      {/* открыть карточку */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {!dr && <Tooltip text="Открыть карточку"><button onClick={() => onOpen(t)} className="inline-flex text-[var(--muted)] hover:text-[var(--accent)]"><Maximize2 className="h-3.5 w-3.5" /></button></Tooltip>}
      </div>
      {/* Клиент */}
      {cell(<Combobox options={clientOpts} value={(dr ? draft?.client : t.client) || undefined} placeholder="—" className={chipWhite}
        onChange={v => dr ? setDraft(d => ({ ...d!, client: v })) : patch.mutate({ id: t.id, data: { client: v || null } })} />, sep, dr)}
      {/* Связь */}
      {cell(<Combobox options={linkOptionsFor(dr ? draft?.client : t.client)} value={dr ? (draft?.link || 'none') : linkValueOf(t)} placeholder="—" className={chipWhite}
        onChange={v => { if (dr) setDraft(d => ({ ...d!, link: v, ...(v.startsWith('goal:') ? { client: COMPANY_NAME } : {}) })); else applyLink(t.id, v) }} />, sep, dr)}
      {/* Задача */}
      {cell(dr
        ? <input data-draft-cell autoFocus value={draft?.title ?? ''} onChange={e => setDraft(d => ({ ...d!, title: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter' && draft?.title.trim() && meId) create.mutate(draft!); if (e.key === 'Escape') setDraft(null) }}
            placeholder="Название задачи" className="h-6 w-full rounded-[6px] border border-[var(--accent)] bg-[var(--surface)] px-1.5 text-[14px] leading-6 text-[var(--text)] outline-none" />
        : <span className={cn('block min-w-0 w-full', done && 'line-through opacity-60')}><EditableCell value={t.title} onChange={v => v.trim() && patch.mutate({ id: t.id, data: { title: v.trim() } })} /></span>,
        sep, dr)}
      {/* Время */}
      {cell(<TimePicker value={dr ? (draft?.time ?? '') : toHHMM(t.actualMinutes)} placeholder="00:00" className={chipWhite}
        onChange={v => dr ? setDraft(d => ({ ...d!, time: v })) : patch.mutate({ id: t.id, data: { actualMinutes: toMinutes(v) } })} />, { justifyContent: 'flex-end' }, dr)}
      {/* готово */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {!dr && <button disabled={!mine} onClick={() => mine && onToggle(t)} title={mine ? (done ? 'Снять отметку' : 'Отметить выполненной') : 'Только исполнитель'}
          className={cn('flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border-[1.5px] text-[11px] text-white', done ? 'border-[var(--accent)] bg-[var(--accent)]' : 'border-[var(--border)]', !mine && 'opacity-40')}>{done ? '✓' : ''}</button>}
      </div>
    </>)
  }

  const hCell: React.CSSProperties = { padding: '8px 10px', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center' }
  const subRow: React.CSSProperties = { gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'subgrid', alignItems: 'center' }

  return (
    <div style={{ width: '100%' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>{title}</div>
      <div ref={gridRef} style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--surface)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: TASK_COLS }}>
          {/* шапка */}
          <div style={{ ...subRow, background: 'var(--surface-2)' }}>
            <div /><div />
            <div style={{ ...hCell, ...sep }}>Клиент</div>
            <div style={{ ...hCell, ...sep }}>Связь</div>
            <div style={{ ...hCell, ...sep }}>Задача</div>
            <div style={{ ...hCell, justifyContent: 'flex-end' }}>Время</div>
            <div />
          </div>
          {/* строки задач (drag — контекст общий с DashboardPage: реордер внутри дня + перенос на MonthStrip) */}
          <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
            {tasks.map(t => <SortableTaskRow key={t.id} id={t.id}>{(h) => taskCells(t, h)}</SortableTaskRow>)}
          </SortableContext>
          <DragOverlay dropAnimation={dropAnimation}>
            {activeTask && (
              <div style={{ display: 'grid', gridTemplateColumns: TASK_COLS, alignItems: 'center', width: gridRef.current?.offsetWidth, background: 'var(--surface)', borderRadius: 10, boxShadow: '0 16px 44px -8px rgba(0,0,0,0.55)' }}>
                {taskCells(activeTask)}
              </div>
            )}
          </DragOverlay>
          {/* черновик (не sortable) */}
          {draftRow && <div style={{ ...subRow, borderTop: '1px solid var(--border)' }}>{taskCells(draftRow)}</div>}
          {/* добавить задачу — кнопка всегда на месте; если сервер запретил (canAddTask=false), вместо «+»
              замочек, а причину показываем ТОСТОМ только по клику (не подписью заранее) */}
          <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'stretch', borderTop: '1px solid var(--border)' }}>
            <button onClick={() => canAdd ? setDraft(draft ?? { client: '', link: 'none', title: '', time: '' }) : toast(dayPolicy?.reason ?? 'Добавление в этот день недоступно', 'info')}
              style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer', background: 'none' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
              {canAdd ? <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> : <Lock size={13} style={{ opacity: 0.75 }} />} Добавить задачу
            </button>
            {/* Шаблонная задача — открывает правую панель пресетов (создание идёт тем же путём, что и обычная задача) */}
            <button onClick={onOpenTemplates} title="Шаблонные задачи (пресеты)"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderLeft: '1px solid var(--border)', fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer', background: 'none' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
              <LayoutTemplate size={14} /> Шаблонная задача
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Цели отдела (read-only срез стратегии в обзоре; вместо прежнего «Мои цели») ──
function DeptGoalsCard() {
  // scope=cabinet — только своя область (даже у дир/рук); отдельный ключ, чтобы не смешивать с общим списком целей
  const { data: goals = [] } = useQuery<Array<{ id: string; title: string; status: string }>>({ queryKey: ['strategic-goals', 'cabinet'], queryFn: () => api.get('/strategic-goals?scope=cabinet').then(r => r.data), staleTime: 120_000 })
  const active = goals.filter(g => g.status === 'active')
  const card: React.CSSProperties = { background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 22px' }
  return (
    <div style={card}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>Стратегические цели отдела</div>
      {active.length === 0 ? (
        <div style={{ fontSize: 14, color: 'var(--text-muted)', fontStyle: 'italic' }}>На текущий период целей нет.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {active.map(g => (
            <div key={g.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
              <span style={{ color: ROLE.info, fontWeight: 800, marginTop: 1 }}>◆</span>
              <span style={{ fontSize: 14, color: 'var(--text-1)', lineHeight: 1.4 }}>{g.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}