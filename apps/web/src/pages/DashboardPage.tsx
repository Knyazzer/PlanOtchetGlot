import { useState, useRef, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../stores/auth'
import { api } from '../lib/api'
import { TaskModal, CalendarEventModal } from './TasksPage'
import type { Task } from './TasksPage'
import { DayFillCard } from '../components/DayFillCard'
import { MonthStrip } from '../components/MonthStrip'
import { ROLE } from '../lib/roleColors'
import { Combobox } from '../ui-kit/components/Combobox'
import { TimePicker } from '../ui-kit/components/TimePicker'
import { DataTable, EditableCell } from '../ui-kit/components/DataTable'
import { Tooltip } from '../components/Tooltip'
import { cn } from '../ui-kit/lib/cn'
import { Maximize2, GripVertical } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { DndContext, DragOverlay, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers'
import { CSS } from '@dnd-kit/utilities'
import { toast } from '../lib/toast'
import { LINK_META, linkIcon } from '../lib/linkMeta'

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

// ── Main ───────────────────────────────────────────────────────────────────────
export function DashboardPage() {
  const currentUser = useAuthStore(s => s.user)
  const qc          = useQueryClient()
  const now         = new Date()
  const todayStr    = toDay(now)

  const [selDate,         setSelDate]         = useState(todayStr)
  const [showCreateTask,  setShowCreateTask]  = useState(false)
  const [showCreateEvent, setShowCreateEvent] = useState(false)
  const [editTask,        setEditTask]        = useState<Task | null>(null)
  const [viewEventId,     setViewEventId]     = useState<string | null>(null)

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
  })

  // Only regular (non-calendar) tasks
  const regularTasks = allTasks.filter(t => !t.calendarEventId)

  // Рабочий набор дня: мои задачи, взятые в работу на этот день (inprogress) + выполненные в этот день.
  // Единый источник дня — startDate; авто-переноса нет (переключил день → показываются только его задачи).
  const dayTasks = regularTasks
    .filter(t =>
      t.assignee.id === currentUser?.id &&
      (t.status === 'inprogress' || t.status === 'done') &&
      toDay(t.startDate) === selDate,
    )
    // Ручной порядок (drag за grip) → manualOrder; при равенстве/отсутствии — по дате создания
    .sort((a, b) => (a.manualOrder ?? 1e9) - (b.manualOrder ?? 1e9) || String(a.createdAt).localeCompare(String(b.createdAt)))

  const sortedEvents = [...dayEvents].sort((a, b) => a.startTime.localeCompare(b.startTime))

  return (
    <div style={{ display: 'flex', height: '100%', boxSizing: 'border-box' }}>
    <div style={{ flex: 1, minWidth: 0, padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto', boxSizing: 'border-box' }}>
      {/* Две колонки: слева «Мой рабочий день» + «Задачи на сегодня» (одна ширина);
          справа «Стратегические цели отдела» + «События» таблицей (одна ширина). */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: 2, minWidth: 360, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <DayFillCard date={selDate} />
          <TodayTasksTable
            title={`Задачи на ${isToday ? 'сегодня' : dayShort}`}
            tasks={dayTasks}
            meId={currentUser?.id}
            day={selDate}
            onOpen={t => setEditTask(t)}
            onToggle={t => doneMut.mutate(t)}
            onChanged={() => qc.invalidateQueries({ queryKey: ['tasks'] })}
            onAdd={() => setShowCreateTask(true)}
          />
        </div>
        <div style={{ flex: 1, minWidth: 300, display: 'flex', flexDirection: 'column', gap: 16 }}>
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
    </div>
      <MonthStrip selected={selDate} today={todayStr} onSelect={setSelDate} />
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
    onError: (e: unknown) => { const err = e as { response?: { data?: { error?: string } } }; alert(err?.response?.data?.error ?? 'Не удалось сохранить') },
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

// Sortable-строка задачи: div-подсетка (subgrid) выровнена по шапке; grip-хендл через render-prop.
function SortableTaskRow({ id, children }: { id: string; children: (h: { attributes: Record<string, unknown>; listeners: Record<string, unknown> | undefined }) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, animateLayoutChanges: () => false })
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
// В светлой теме чипы (выпадашка/время) — белые, как фон таблицы (не серые surface-2)
const chipWhite = 'w-full !bg-[var(--surface)]'

function TodayTasksTable({ title, tasks, meId, day, onOpen, onToggle, onChanged, onAdd: _onAdd }: {
  title: string; tasks: Task[]; meId?: string; day: string
  onOpen: (t: Task) => void; onToggle: (t: Task) => void; onChanged: () => void; onAdd: () => void
}) {
  const { data: projects = [] } = useQuery<Array<{ id: string; title: string; client?: { id: string; name: string } | null }>>({ queryKey: ['projects'], queryFn: () => api.get('/projects').then(r => r.data), staleTime: 300_000 })
  const { data: clients = [] } = useQuery<Array<{ id: string; name: string }>>({ queryKey: ['clients'], queryFn: () => api.get('/clients').then(r => r.data), staleTime: 300_000 })
  const { data: goals = [] } = useQuery<Array<{ id: string; title: string }>>({ queryKey: ['strategic-goals'], queryFn: () => api.get('/strategic-goals').then(r => r.data), staleTime: 120_000 })
  const { data: tracks = [] } = useQuery<Array<{ id: string; title: string }>>({ queryKey: ['tracks'], queryFn: () => api.get('/tracks').then(r => r.data), staleTime: 120_000 })
  const patch = useMutation({ mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => api.patch(`/tasks/${id}`, data), onSuccess: onChanged, onError: (e: any) => alert(e?.response?.data?.error ?? 'Не удалось сохранить') })
  const [draft, setDraft] = useState<Draft | null>(null)
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

  // Ручной порядок: дроп строки fromId на позицию toId. Оптимистично проставляем manualOrder
  // в кэше ['tasks','mine'] (список пересортируется мгновенно, без рефетча), затем персистим.
  const qc = useQueryClient()
  const reorderMut = useMutation({ mutationFn: (ids: string[]) => api.patch('/tasks/reorder', { ids }) })
  const onRowReorder = (fromId: string | number, toId: string | number) => {
    const f = String(fromId), t = String(toId)
    if (f === DRAFT_ID || t === DRAFT_ID) return
    const ids = tasks.map(x => x.id)
    const from = ids.indexOf(f), to = ids.indexOf(t)
    if (from < 0 || to < 0 || from === to) return
    const next = [...ids]; next.splice(from, 1); next.splice(to, 0, f)
    const prev = qc.getQueryData<Task[]>(['tasks', 'mine'])
    qc.setQueryData<Task[]>(['tasks', 'mine'], (old) => old?.map(x => { const i = next.indexOf(x.id); return i >= 0 ? { ...x, manualOrder: i } : x }))
    reorderMut.mutate(next, { onError: () => { if (prev) qc.setQueryData(['tasks', 'mine'], prev) } })
  }

  const create = useMutation({
    mutationFn: (d: Draft) => {
      const [type, id] = (d.link || 'none').split(':')
      return api.post('/tasks', { title: d.title.trim(), assigneeId: meId, status: 'inprogress', startDate: day, client: d.client || null,
        projectId: type === 'project' ? id : null, goalId: type === 'goal' ? id : null, trackId: type === 'track' ? id : null,
        actualMinutes: toMinutes(d.time) })
    },
    onSuccess: () => { setDraft(null); onChanged(); toast('Задача добавлена') },
    onError: (e: any) => alert(e?.response?.data?.error ?? 'Не удалось создать задачу'),
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

  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const [dragId, setDragId] = useState<string | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const activeTask = dragId ? tasks.find(t => t.id === dragId) : undefined

  // Ячейки строки (7 колонок). handle — drag-хендл (только у sortable-строк); dr — черновик.
  const cell = (content: React.ReactNode, extra?: React.CSSProperties, dr?: boolean) =>
    <div data-draft-cell={dr || undefined} style={{ padding: '5px 8px', minWidth: 0, display: 'flex', alignItems: 'center', ...extra }}>{content}</div>
  const taskCells = (t: Task, handle?: { attributes: Record<string, unknown>; listeners: Record<string, unknown> | undefined }) => {
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
        onChange={v => dr ? setDraft(d => ({ ...d!, client: v })) : patch.mutate({ id: t.id, data: { client: v || null } })} />, undefined, dr)}
      {/* Связь */}
      {cell(<Combobox options={linkOptionsFor(dr ? draft?.client : t.client)} value={dr ? (draft?.link || 'none') : linkValueOf(t)} placeholder="—" className={chipWhite}
        onChange={v => { if (dr) setDraft(d => ({ ...d!, link: v, ...(v.startsWith('goal:') ? { client: COMPANY_NAME } : {}) })); else applyLink(t.id, v) }} />, undefined, dr)}
      {/* Задача */}
      {cell(dr
        ? <input data-draft-cell autoFocus value={draft?.title ?? ''} onChange={e => setDraft(d => ({ ...d!, title: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter' && draft?.title.trim() && meId) create.mutate(draft!); if (e.key === 'Escape') setDraft(null) }}
            placeholder="Название задачи" className="h-6 w-full rounded-[6px] border border-[var(--accent)] bg-[var(--surface)] px-1.5 text-[14px] leading-6 text-[var(--text)] outline-none" />
        : <span className={cn('block min-w-0 w-full', done && 'line-through opacity-60')}><EditableCell value={t.title} onChange={v => v.trim() && patch.mutate({ id: t.id, data: { title: v.trim() } })} /></span>,
        undefined, dr)}
      {/* Время */}
      {cell(<TimePicker value={dr ? (draft?.time ?? '') : toHHMM(t.actualMinutes)} className={chipWhite}
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
            <div style={hCell}>Клиент</div>
            <div style={hCell}>Связь</div>
            <div style={hCell}>Задача</div>
            <div style={{ ...hCell, justifyContent: 'flex-end' }}>Время</div>
            <div />
          </div>
          {/* строки задач (drag) */}
          <DndContext sensors={dndSensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            onDragStart={(e: DragStartEvent) => setDragId(String(e.active.id))}
            onDragCancel={() => setDragId(null)}
            onDragEnd={(e: DragEndEvent) => { setDragId(null); if (e.over && e.active.id !== e.over.id) onRowReorder(e.active.id, e.over.id) }}>
            <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
              {tasks.map(t => <SortableTaskRow key={t.id} id={t.id}>{(h) => taskCells(t, h)}</SortableTaskRow>)}
            </SortableContext>
            <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2,0,0,1)' }}>
              {activeTask && (
                <div style={{ display: 'grid', gridTemplateColumns: TASK_COLS, alignItems: 'center', width: gridRef.current?.offsetWidth, background: 'var(--surface)', borderRadius: 10, boxShadow: '0 16px 44px -8px rgba(0,0,0,0.55)' }}>
                  {taskCells(activeTask)}
                </div>
              )}
            </DragOverlay>
          </DndContext>
          {/* черновик (не sortable) */}
          {draftRow && <div style={{ ...subRow, borderTop: '1px solid var(--border)' }}>{taskCells(draftRow)}</div>}
          {/* добавить задачу */}
          <button onClick={() => setDraft(draft ?? { client: '', link: 'none', title: '', time: '' })}
            style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderTop: '1px solid var(--border)', fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer', background: 'none' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Добавить задачу
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Цели отдела (read-only срез стратегии в обзоре; вместо прежнего «Мои цели») ──
function DeptGoalsCard() {
  const { data: goals = [] } = useQuery<Array<{ id: string; title: string; status: string }>>({ queryKey: ['strategic-goals'], queryFn: () => api.get('/strategic-goals').then(r => r.data), staleTime: 120_000 })
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