import { useState, useRef, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCurrentUser } from '../hooks/useAuth'
import { api } from '../lib/api'
import { formatName } from '../lib/utils'
import { Hint } from '../components/Hint'

// ── Types ──────────────────────────────────────────────────────────────────
type CalView = 'month' | 'week' | 'day'
type EventType = 'meeting' | 'task' | 'personal'
type EntryType = 'global' | 'znamenka_kaminoka' | 'znamenka_chernaya' | 'znamenka_kupol' | 'hr_sick' | 'hr_vacation' | 'hr_unpaid' | 'hr_dayoff'

interface ApiEvent {
  id: string; type: string; title: string; description: string
  date: string; startTime: string; endTime: string; location: string[]; status: string
  authorId: string; author: { id: string; name: string }
  participants: Array<{ userId: string; user: { id: string; name: string } }>
}

interface ApiCalEntry {
  id: string; type: string; title: string; description: string
  date: string; startTime: string | null; endTime: string | null
  isAllDay: boolean; targetUserId: string | null
  targetUser: { id: string; name: string } | null
  createdById: string; createdBy: { id: string; name: string }
}

interface ApiMember {
  id: string; name: string; position?: string
}

interface CalEvent {
  id: string; title: string; date: string; start: string; end: string
  color: string; type: string; isAllDay: boolean; source: 'event' | 'entry'
  location?: string[]
}

// ── Category config ────────────────────────────────────────────────────────
const TYPE_COLOR: Record<string, string> = {
  meeting:             '#8B5CF6',
  task:                '#FF6B35',
  personal:            '#29BF12',
  global:              '#0EA5E9',
  znamenka_kaminoka:   '#F59E0B',
  znamenka_chernaya:   '#6B7280',
  znamenka_kupol:      '#A855F7',
  hr_sick:             '#E8194B',
  hr_vacation:         '#0EA5E9',
  hr_unpaid:           '#F59E0B',
  hr_dayoff:           '#29BF12',
}

interface CatDef { id: string; label: string; color: string }
// Toggleable categories (global always visible, not in this list for non-admins)
const MY_CATS: CatDef[]  = [{ id: 'my_events', label: 'Мои события', color: '#8B5CF6' }]
const HR_CATS: CatDef[]  = [
  { id: 'hr_sick',    label: 'Больничный',           color: '#E8194B' },
  { id: 'hr_vacation',label: 'Отпуск',               color: '#0EA5E9' },
  { id: 'hr_unpaid',  label: 'Отпуск за свой счёт',  color: '#F59E0B' },
  { id: 'hr_dayoff',  label: 'Отгул',                color: '#29BF12' },
]

const LOCATIONS = [
  { id: 'kaminoka', label: 'Знаменка Каминка' },
  { id: 'chernaya', label: 'Знаменка Чёрная'  },
  { id: 'kupol',    label: 'Знаменка Купол'   },
  { id: 'zoom',     label: 'Zoom'              },
  { id: 'office',   label: 'Офис'             },
  { id: 'vyezd',    label: 'Выезд'            },
]
const LOCATION_IDS = new Set(LOCATIONS.map(l => l.id))

const MY_EVENT_TYPES = [
  { value: 'meeting' as EventType, label: 'Встреча' },
  { value: 'task'    as EventType, label: 'Задача'  },
  { value: 'personal'as EventType, label: 'Личное'  },
]

const SHARED_ENTRY_TYPES: { value: EntryType; label: string }[] = [
  { value: 'global',            label: 'Общий'              },
  { value: 'znamenka_kaminoka', label: 'Знаменка Каминка'   },
  { value: 'znamenka_chernaya', label: 'Знаменка Чёрная'    },
  { value: 'znamenka_kupol',    label: 'Знаменка Купол'     },
]

const HR_ENTRY_TYPES: { value: EntryType; label: string }[] = [
  { value: 'hr_sick',     label: 'Больничный'          },
  { value: 'hr_vacation', label: 'Отпуск'              },
  { value: 'hr_unpaid',   label: 'Отпуск за свой счёт' },
  { value: 'hr_dayoff',   label: 'Отгул'               },
]

// ── Locale helpers ─────────────────────────────────────────────────────────
const MONTHS_RU     = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
const MONTHS_RU_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря']
const WEEKDAYS_S    = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']
const WEEKDAYS_F    = ['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье']

function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function parseYMD(s: string) {
  const [y,m,d] = s.split('-').map(Number)
  return new Date(y, m-1, d)
}
function timeToMin(t: string) { const [h,m] = t.split(':').map(Number); return h*60+m }
function minToTime(min: number) {
  min = Math.max(0, Math.min(1439, min))
  return `${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}`
}
function snapTo15(min: number) { return Math.round(min / 15) * 15 }

function getWeekStart(d: Date) {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const s = new Date(d)
  s.setDate(d.getDate() + diff)
  s.setHours(0,0,0,0)
  return s
}

function computeRange(view: CalView, cursor: Date): [string, string] {
  if (view === 'month') {
    const year = cursor.getFullYear(), month = cursor.getMonth()
    const start = getWeekStart(new Date(year, month, 1))
    const lastDay = new Date(year, month+1, 0)
    const end = getWeekStart(lastDay)
    end.setDate(end.getDate() + 6)
    return [toYMD(start), toYMD(end)]
  }
  if (view === 'week') {
    const ws = getWeekStart(cursor)
    const we = new Date(ws); we.setDate(we.getDate() + 6)
    return [toYMD(ws), toYMD(we)]
  }
  return [toYMD(cursor), toYMD(cursor)]
}

// Overlap layout — updated to use string keys
function layoutEvents(events: CalEvent[]): Map<string, { col: number; total: number }> {
  if (!events.length) return new Map()
  const sorted = [...events].sort((a,b) => timeToMin(a.start) - timeToMin(b.start))
  const result = new Map<string, { col: number; total: number }>()
  const overlaps = (a: CalEvent, b: CalEvent) =>
    timeToMin(a.start) < timeToMin(b.end) && timeToMin(b.start) < timeToMin(a.end)
  const clusters: CalEvent[][] = []
  sorted.forEach(evt => {
    let added = false
    for (const cluster of clusters) {
      if (cluster.some(e => overlaps(e, evt))) { cluster.push(evt); added = true; break }
    }
    if (!added) clusters.push([evt])
  })
  clusters.forEach(cluster => {
    const cols: number[] = []
    cluster.forEach(evt => {
      const startMin = timeToMin(evt.start), endMin = timeToMin(evt.end)
      let placed = false
      for (let i = 0; i < cols.length; i++) {
        if (cols[i] <= startMin) { cols[i] = endMin; result.set(evt.id, { col: i, total: 0 }); placed = true; break }
      }
      if (!placed) { result.set(evt.id, { col: cols.length, total: 0 }); cols.push(endMin) }
    })
    cluster.forEach(evt => { result.get(evt.id)!.total = cols.length })
  })
  return result
}

// ── Modal state ────────────────────────────────────────────────────────────
interface ModalState {
  open: boolean; editId: string | null; source: 'event' | 'entry'
  type: EventType; date: string; start: string; end: string; title: string
  location: string[]; vyezdAddress: string; participantIds: string[]
  canEdit: boolean
}
interface EntryModalState {
  open: boolean; editId: string | null
  type: EntryType; date: string; start: string; end: string
  isAllDay: boolean; title: string; targetUserId: string
}

const BLANK_MODAL = (): ModalState => ({
  open: false, editId: null, source: 'event',
  type: 'meeting', date: '', start: '09:00', end: '10:00', title: '',
  location: [], vyezdAddress: '', participantIds: [], canEdit: true,
})
const BLANK_ENTRY = (): EntryModalState => ({
  open: false, editId: null,
  type: 'global', date: '', start: '09:00', end: '10:00',
  isAllDay: false, title: '', targetUserId: '',
})

// ── Main component ─────────────────────────────────────────────────────────
export function CalendarPage() {
  const currentUser = useCurrentUser()
  const qc          = useQueryClient()
  const isAdmin     = !!currentUser?.isAdmin
  const today       = new Date()
  const todayS      = toYMD(today)

  const [view,        setView]        = useState<CalView>('week')
  const [cursor,      setCursor]      = useState(new Date())
  const [visible,     setVisible]     = useState<Set<string>>(() => new Set([...MY_CATS, ...HR_CATS].map(c => c.id)))
  const [selected,    setSelected]    = useState<string | null>(null)
  const [panelOpen,   setPanelOpen]   = useState(false)
  const [modal,       setModal]       = useState<ModalState>(BLANK_MODAL())
  const [entryModal,  setEntryModal]  = useState<EntryModalState>(BLANK_ENTRY())

  const [from, to] = useMemo(() => computeRange(view, cursor), [view, cursor])

  const { data: apiEvents  = [] } = useQuery<ApiEvent[]>({
    queryKey: ['events', from, to],
    queryFn:  () => api.get(`/events?from=${from}&to=${to}`).then(r => r.data),
    staleTime: 0, refetchOnMount: 'always',
    refetchInterval: 30_000, refetchIntervalInBackground: false,
  })
  const { data: apiEntries = [] } = useQuery<ApiCalEntry[]>({
    queryKey: ['calendar-entries', from, to],
    queryFn:  () => api.get(`/calendar-entries?from=${from}&to=${to}`).then(r => r.data),
    staleTime: 0, refetchOnMount: 'always',
    refetchInterval: 30_000, refetchIntervalInBackground: false,
  })

  const allEvents = useMemo<CalEvent[]>(() => {
    const evts: CalEvent[] = apiEvents.map(e => ({
      id: e.id, title: e.title,
      date:  e.date.slice(0, 10),
      start: e.startTime, end: e.endTime,
      color: TYPE_COLOR[e.type] ?? '#8B5CF6',
      type: e.type, isAllDay: false, source: 'event', location: e.location,
    }))
    const entries: CalEvent[] = apiEntries.map(e => ({
      id: e.id, title: e.title + (e.targetUser ? ` (${e.targetUser.name})` : ''),
      date:  e.date.slice(0, 10),
      start: e.startTime ?? '00:00', end: e.endTime ?? '23:59',
      color: TYPE_COLOR[e.type] ?? '#0EA5E9',
      type: e.type, isAllDay: e.isAllDay, source: 'entry',
    }))
    return [...evts, ...entries]
  }, [apiEvents, apiEntries])

  function catKey(evt: CalEvent) { return evt.source === 'event' ? 'my_events' : evt.type }
  function eventsFor(ymd: string): CalEvent[] {
    return allEvents.filter(e => e.date === ymd && visible.has(catKey(e)) && !e.isAllDay)
  }
  function allDayFor(ymd: string): CalEvent[] {
    return allEvents.filter(e => e.date === ymd && visible.has(catKey(e)) && e.isAllDay)
  }

  const periodLabel = (() => {
    if (view === 'month') return `${MONTHS_RU[cursor.getMonth()]} ${cursor.getFullYear()}`
    if (view === 'week') {
      const ws = getWeekStart(cursor)
      const we = new Date(ws); we.setDate(we.getDate()+6)
      if (ws.getMonth() === we.getMonth())
        return `${ws.getDate()}–${we.getDate()} ${MONTHS_RU_GEN[ws.getMonth()]} ${ws.getFullYear()}`
      return `${ws.getDate()} ${MONTHS_RU_GEN[ws.getMonth()]} – ${we.getDate()} ${MONTHS_RU_GEN[we.getMonth()]} ${ws.getFullYear()}`
    }
    return `${cursor.getDate()} ${MONTHS_RU_GEN[cursor.getMonth()]} ${cursor.getFullYear()}`
  })()

  function navigate(dir: 1 | -1) {
    setCursor(prev => {
      const d = new Date(prev)
      if (view === 'month') return new Date(d.getFullYear(), d.getMonth() + dir, 1)
      if (view === 'week')  { d.setDate(d.getDate() + dir * 7); return d }
      d.setDate(d.getDate() + dir); return d
    })
  }

  function openPanel(ymd: string) { setSelected(ymd); setPanelOpen(true) }
  function closePanel()           { setSelected(null); setPanelOpen(false) }

  function openCreate(date?: string, start?: string, end?: string) {
    setModal({ open: true, editId: null, source: 'event', type: 'meeting', date: date ?? todayS, start: start ?? '09:00', end: end ?? '10:00', title: '', location: [], vyezdAddress: '', participantIds: [], canEdit: true })
  }
  function openEdit(evt: CalEvent) {
    if (evt.source === 'entry') {
      const entry = apiEntries.find(e => e.id === evt.id)
      if (!entry || !isAdmin) return
      setEntryModal({
        open: true, editId: entry.id, type: entry.type as EntryType,
        date: entry.date.slice(0,10), start: entry.startTime ?? '09:00', end: entry.endTime ?? '10:00',
        isAllDay: entry.isAllDay, title: entry.title, targetUserId: entry.targetUserId ?? '',
      })
    } else {
      const ev = apiEvents.find(e => e.id === evt.id)
      if (!ev) return
      const canEdit = ev.authorId === currentUser?.id || isAdmin
      const locIds = (ev.location ?? []).filter(l => LOCATION_IDS.has(l))
      const address = (ev.location ?? []).find(l => !LOCATION_IDS.has(l)) ?? ''
      setModal({
        open: true, editId: ev.id, source: 'event', type: ev.type as EventType,
        date: ev.date.slice(0,10), start: ev.startTime, end: ev.endTime, title: ev.title,
        location: locIds, vyezdAddress: address,
        participantIds: ev.participants.map(p => p.userId), canEdit,
      })
    }
  }

  const createEventMut = useMutation({
    mutationFn: (d: any) => api.post('/events', d).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
  const updateEventMut = useMutation({
    mutationFn: ({ id, ...d }: any) => api.patch(`/events/${id}`, d).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['events'] }) },
  })
  const deleteEventMut = useMutation({
    mutationFn: (id: string) => api.delete(`/events/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['events'] }) },
  })
  const createEntryMut = useMutation({
    mutationFn: (d: any) => api.post('/calendar-entries', d).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['calendar-entries'] }) },
  })
  const updateEntryMut = useMutation({
    mutationFn: ({ id, ...d }: any) => api.patch(`/calendar-entries/${id}`, d).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['calendar-entries'] }) },
  })
  const deleteEntryMut = useMutation({
    mutationFn: (id: string) => api.delete(`/calendar-entries/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['calendar-entries'] }) },
  })

  function submitModal() {
    if (!modal.title.trim() || modal.start >= modal.end) return
    const location = [
      ...modal.location,
      ...(modal.location.includes('vyezd') && modal.vyezdAddress.trim() ? [modal.vyezdAddress.trim()] : []),
    ]
    if (modal.editId) {
      updateEventMut.mutate({ id: modal.editId, type: modal.type, title: modal.title, date: modal.date, startTime: modal.start, endTime: modal.end, location, participantIds: modal.participantIds })
    } else {
      createEventMut.mutate({ type: modal.type, title: modal.title, date: modal.date, startTime: modal.start, endTime: modal.end, location, participantIds: modal.participantIds })
    }
    setModal(BLANK_MODAL())
  }
  function deleteModal() {
    if (!modal.editId) return
    deleteEventMut.mutate(modal.editId)
    setModal(BLANK_MODAL())
  }

  function submitEntryModal() {
    if (!entryModal.title.trim()) return
    const payload: any = {
      type: entryModal.type, title: entryModal.title, date: entryModal.date,
      isAllDay: entryModal.isAllDay,
      ...(entryModal.isAllDay ? {} : { startTime: entryModal.start, endTime: entryModal.end }),
      ...(entryModal.targetUserId ? { targetUserId: entryModal.targetUserId } : {}),
    }
    if (entryModal.editId) {
      updateEntryMut.mutate({ id: entryModal.editId, ...payload })
    } else {
      createEntryMut.mutate(payload)
    }
    setEntryModal(BLANK_ENTRY())
  }
  function deleteEntryModal() {
    if (!entryModal.editId) return
    deleteEntryMut.mutate(entryModal.editId)
    setEntryModal(BLANK_ENTRY())
  }

  function toggleCat(id: string) {
    setVisible(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>

      {/* Header */}
      <div style={{ height:64, flexShrink:0, background:'var(--surface-1)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', padding:'0 24px', gap:16, zIndex:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <button onClick={() => navigate(-1)} style={navBtnStyle}>‹</button>
          <div style={{ fontSize:15, fontWeight:600, color:'var(--text-1)', minWidth:180, textAlign:'center' }}>{periodLabel}</div>
          <button onClick={() => navigate(1)}  style={navBtnStyle}>›</button>
        </div>
        <button onClick={() => { setCursor(new Date(today)); closePanel() }}
          style={{ padding:'5px 14px', borderRadius:8, border:'1px solid var(--border)', background:'none', color:'var(--text-3)', fontSize:13, fontFamily:'Inter,sans-serif', cursor:'pointer' }}>
          Сегодня
        </button>

        <div style={{ marginLeft:'auto', display:'flex', background:'var(--surface-2)', borderRadius:10, padding:3, gap:2, border:'1px solid var(--border)' }}>
          {(['month','week','day'] as CalView[]).map(v => (
            <button key={v} onClick={() => { setView(v); closePanel() }} style={{
              padding:'5px 16px', borderRadius:7, border:'none', cursor:'pointer',
              background: view === v ? 'linear-gradient(135deg,#FF6B35,#E8194B)' : 'none',
              color: view === v ? '#fff' : 'var(--text-muted)', fontSize:13, fontWeight: view === v ? 600 : 400,
              fontFamily:'Inter,sans-serif',
            }}>
              {v === 'month' ? 'Месяц' : v === 'week' ? 'Неделя' : 'День'}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>

        {/* Left sidebar: category list */}
        <div style={{ width:200, flexShrink:0, background:'var(--surface-1)', borderRight:'1px solid var(--border)', padding:'16px 12px', display:'flex', flexDirection:'column', gap:2, overflowY:'auto' }}>
          <SidebarSection label="МОИ КАЛЕНДАРИ" cats={MY_CATS} visible={visible} onToggle={toggleCat}
            onAdd={() => openCreate()}>
            {/* Общий — всегда виден, не скрывается не-админами */}
            <GlobalCalRow isAdmin={isAdmin} onAdd={() => setEntryModal({ ...BLANK_ENTRY(), open: true, type: 'global', date: todayS })} />
          </SidebarSection>
          <div style={{ margin:'10px 0 4px', borderTop:'1px solid var(--border)' }} />
          <SidebarSection label="HR СТАТУСЫ" cats={HR_CATS} visible={visible} onToggle={toggleCat}
            onAdd={isAdmin ? () => setEntryModal({ ...BLANK_ENTRY(), open: true, type: 'hr_sick', date: todayS, isAllDay: true }) : undefined} />
        </div>

        {/* Calendar area */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          {view === 'month' && (
            <MonthView cursor={cursor} today={todayS} selected={selected}
              eventsFor={eventsFor} allDayFor={allDayFor}
              onDayClick={openPanel} onEventClick={openEdit} />
          )}
          {view === 'week' && (
            <WeekView cursor={cursor} today={todayS}
              eventsFor={eventsFor} allDayFor={allDayFor}
              onEventClick={openEdit}
              onDragCreate={(ymd, start, end) => openCreate(ymd, start, end)} />
          )}
          {view === 'day' && (
            <DayView cursor={cursor} today={todayS}
              eventsFor={eventsFor} allDayFor={allDayFor}
              onEventClick={openEdit}
              onDragCreate={(ymd, start, end) => openCreate(ymd, start, end)} />
          )}
        </div>

        {/* Right day panel */}
        {panelOpen && selected && (
          <SidePanel ymd={selected} eventsFor={eventsFor} allDayFor={allDayFor}
            onClose={closePanel} onEventClick={openEdit}
            onCreateClick={() => openCreate(selected)} />
        )}
      </div>

      {/* Event modal */}
      {modal.open && (
        <EventModal modal={modal} onChange={p => setModal(m => ({ ...m, ...p }))}
          onSubmit={submitModal} onDelete={deleteModal} onClose={() => setModal(BLANK_MODAL())} canEdit={modal.canEdit} />
      )}

      {/* Entry modal (admin) */}
      {entryModal.open && (
        <EntryModal modal={entryModal} onChange={p => setEntryModal(m => ({ ...m, ...p }))}
          onSubmit={submitEntryModal} onDelete={deleteEntryModal} onClose={() => setEntryModal(BLANK_ENTRY())} />
      )}
    </div>
  )
}

// ── Shared ─────────────────────────────────────────────────────────────────
const navBtnStyle: React.CSSProperties = {
  width:32, height:32, borderRadius:8, border:'1px solid var(--border)',
  background:'none', color:'var(--text-3)', fontSize:16, cursor:'pointer',
  display:'flex', alignItems:'center', justifyContent:'center',
}

function CalCheckbox({ color, checked, label, onClick }: { color: string; checked: boolean; label: string; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 6px', borderRadius:6, cursor:'pointer' }}>
      <div style={{ width:13, height:13, borderRadius:3, flexShrink:0, border:`2px solid ${color}`, background: checked ? color : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, fontWeight:800, color:'#fff' }}>
        {checked ? '✓' : ''}
      </div>
      <div style={{ fontSize:12, fontWeight:500, color:'var(--text-2)', flex:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{label}</div>
    </div>
  )
}

function SidebarSection({ label, cats, visible, onToggle, onAdd, children }: {
  label: string; cats: CatDef[]; visible: Set<string>; onToggle: (id: string) => void
  onAdd?: () => void; children?: React.ReactNode
}) {
  return (
    <>
      <div style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 6px 2px' }}>
        <div style={{ fontSize:9, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.8px', flex:1 }}>{label}</div>
        {onAdd && (
          <button onClick={onAdd} style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:14, lineHeight:1, padding:'0 2px', borderRadius:4 }} title="Создать">+</button>
        )}
      </div>
      {cats.map(c => (
        <CalCheckbox key={c.id} color={c.color} checked={visible.has(c.id)} label={c.label} onClick={() => onToggle(c.id)} />
      ))}
      {children}
    </>
  )
}

function GlobalCalRow({ isAdmin, onAdd }: { isAdmin: boolean; onAdd: () => void }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 6px', borderRadius:6 }}>
      <div style={{ width:13, height:13, borderRadius:3, flexShrink:0, background:'#0EA5E9', display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, fontWeight:800, color:'#fff' }}>✓</div>
      <div style={{ fontSize:12, fontWeight:500, color:'var(--text-2)', flex:1 }}>Общий</div>
      {isAdmin && (
        <button onClick={onAdd} style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:14, lineHeight:1, padding:'0 2px', borderRadius:4 }} title="Создать запись">+</button>
      )}
    </div>
  )
}

// ── Month view ─────────────────────────────────────────────────────────────
function MonthView({ cursor, today, selected, eventsFor, allDayFor, onDayClick, onEventClick }: {
  cursor: Date; today: string; selected: string | null
  eventsFor: (ymd: string) => CalEvent[]
  allDayFor: (ymd: string) => CalEvent[]
  onDayClick: (ymd: string) => void
  onEventClick: (evt: CalEvent) => void
}) {
  const year = cursor.getFullYear(), month = cursor.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay  = new Date(year, month+1, 0)
  const start = new Date(firstDay); const dow = firstDay.getDay()
  start.setDate(firstDay.getDate() - (dow === 0 ? 6 : dow - 1))
  const end = new Date(lastDay); const edow = lastDay.getDay()
  end.setDate(lastDay.getDate() + (edow === 0 ? 0 : 7 - edow))
  const cells: Date[] = []
  const cur = new Date(start)
  while (cur <= end) { cells.push(new Date(cur)); cur.setDate(cur.getDate()+1) }

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', background:'var(--surface-1)', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
        {WEEKDAYS_S.map(d => (
          <div key={d} style={{ padding:'10px 12px', fontSize:11, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.8px', textAlign:'center' }}>{d}</div>
        ))}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', flex:1, overflowY:'auto', gridAutoRows:'minmax(90px,1fr)' }}>
        {cells.map((d, i) => {
          const ymd = toYMD(d)
          const isThisMonth = d.getMonth() === month
          const isToday = ymd === today, isSel = ymd === selected
          const dayEvts = eventsFor(ymd)
          const allDay  = allDayFor(ymd)
          const shown = [...allDay, ...dayEvts].slice(0, 3)
          const extra = allDay.length + dayEvts.length - shown.length
          return (
            <div key={i} onClick={() => onDayClick(ymd)}
              style={{ borderRight:'1px solid rgba(255,255,255,0.04)', borderBottom:'1px solid rgba(255,255,255,0.04)', padding:6, cursor:'pointer', opacity: isThisMonth ? 1 : 0.35, overflow:'hidden' }}>
              <div style={{ width:24, height:24, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:500, marginBottom:4,
                background: isToday ? 'linear-gradient(135deg,#FF6B35,#E8194B)' : isSel ? 'rgba(255,107,53,0.15)' : 'transparent',
                color: isToday ? '#fff' : isSel ? '#FF6B35' : 'var(--text-3)',
                outline: isSel && !isToday ? '1px solid rgba(255,107,53,0.4)' : 'none',
              }}>{d.getDate()}</div>
              {shown.map(evt => (
                <div key={evt.id} onClick={e => { e.stopPropagation(); onEventClick(evt) }}
                  style={{ padding:'1px 6px', borderRadius:3, fontSize:10, fontWeight:500, marginBottom:2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', background:evt.color+'22', color:evt.color, borderLeft:`2px solid ${evt.color}`, cursor:'pointer' }}>
                  {evt.isAllDay ? '⬤ ' : ''}{evt.title}
                </div>
              ))}
              {extra > 0 && <div style={{ fontSize:10, color:'var(--text-muted)', padding:'1px 4px' }}>+{extra} ещё</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Week view ──────────────────────────────────────────────────────────────
function WeekView({ cursor, today, eventsFor, allDayFor, onEventClick, onDragCreate }: {
  cursor: Date; today: string
  eventsFor: (ymd: string) => CalEvent[]
  allDayFor:  (ymd: string) => CalEvent[]
  onEventClick: (evt: CalEvent) => void
  onDragCreate: (ymd: string, start: string, end: string) => void
}) {
  const ws = getWeekStart(cursor)
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(ws); d.setDate(ws.getDate()+i); return d })
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = 6*60 - 30 }, [cursor])

  const hasAllDay = days.some(d => allDayFor(toYMD(d)).length > 0)

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
      {/* Day header */}
      <div style={{ display:'grid', gridTemplateColumns:'52px repeat(7,1fr)', background:'var(--surface-1)', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
        <div style={{ borderRight:'1px solid var(--border)' }} />
        {days.map((d,i) => {
          const isToday = toYMD(d) === today
          return (
            <div key={i} style={{ padding:'8px 8px', textAlign:'center', borderRight: i<6 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
              <div style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.8px' }}>{WEEKDAYS_S[i]}</div>
              <div style={{ fontSize:18, fontWeight:700, width:34, height:34, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', margin:'2px auto 0', background: isToday ? 'linear-gradient(135deg,#FF6B35,#E8194B)' : 'transparent', color: isToday ? '#fff' : 'var(--text-3)' }}>{d.getDate()}</div>
            </div>
          )
        })}
      </div>

      {/* All-day row */}
      {hasAllDay && (
        <div style={{ display:'grid', gridTemplateColumns:'52px repeat(7,1fr)', borderBottom:'1px solid var(--border)', flexShrink:0, background:'var(--surface-1)' }}>
          <div style={{ borderRight:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <span style={{ fontSize:9, color:'var(--text-muted)', writingMode:'vertical-rl', transform:'rotate(180deg)', letterSpacing:'0.5px' }}>Весь день</span>
          </div>
          {days.map((d,i) => {
            const entries = allDayFor(toYMD(d))
            return (
              <div key={i} style={{ padding:'3px 4px', borderRight: i<6 ? '1px solid rgba(255,255,255,0.04)' : 'none', minHeight:24 }}>
                {entries.map(e => (
                  <div key={e.id} onClick={() => onEventClick(e)}
                    style={{ padding:'1px 6px', borderRadius:3, fontSize:10, fontWeight:500, marginBottom:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', background:e.color+'22', color:e.color, cursor:'pointer' }}>
                    {e.title}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {/* Timed body */}
      <div ref={bodyRef} style={{ display:'flex', flex:1, overflowY:'auto', position:'relative' }}>
        <div style={{ width:52, flexShrink:0, borderRight:'1px solid var(--border)', position:'relative', minHeight:1440 }}>
          {Array.from({length:25},(_,h) => (
            <div key={h} style={{ position:'absolute', right:8, top: h*60, fontSize:10, fontWeight:500, color:'var(--text-muted)', transform:'translateY(-50%)', whiteSpace:'nowrap', userSelect:'none' }}>
              {h === 0 ? '' : `${String(h).padStart(2,'0')}:00`}
            </div>
          ))}
        </div>
        <div style={{ flex:1, display:'grid', gridTemplateColumns:'repeat(7,1fr)', position:'relative', minHeight:1440 }}>
          {days.map((d, i) => {
            const ymd = toYMD(d)
            const dayEvts = eventsFor(ymd)
            const layout  = layoutEvents(dayEvts)
            return (
              <DayColumn key={i} ymd={ymd} isToday={ymd === today} events={dayEvts} layout={layout}
                bodyRef={bodyRef} onEventClick={onEventClick} onDragCreate={onDragCreate}
                style={{ borderRight: i<6 ? '1px solid rgba(255,255,255,0.04)' : 'none' }} />
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Day column ─────────────────────────────────────────────────────────────
function DayColumn({ ymd, isToday, events, layout, bodyRef, onEventClick, onDragCreate, style }: {
  ymd: string; isToday: boolean; events: CalEvent[]
  layout: Map<string, { col: number; total: number }>
  bodyRef: React.RefObject<HTMLDivElement | null>
  onEventClick: (evt: CalEvent) => void
  onDragCreate: (ymd: string, start: string, end: string) => void
  style?: React.CSSProperties
}) {
  const colRef    = useRef<HTMLDivElement>(null)
  const ghostRef  = useRef<HTMLDivElement>(null)
  const dragState = useRef<{ active: boolean; startMin: number } | null>(null)

  function getMinutes(clientY: number) {
    const bodyEl = bodyRef.current
    if (!bodyEl) return 0
    return clientY - bodyEl.getBoundingClientRect().top + bodyEl.scrollTop
  }

  function onMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('[data-evt]')) return
    if (e.button !== 0) return
    e.preventDefault()
    const startMin = snapTo15(getMinutes(e.clientY))
    dragState.current = { active: true, startMin }
    if (ghostRef.current) { ghostRef.current.style.top = startMin+'px'; ghostRef.current.style.height = '15px'; ghostRef.current.style.display = 'block'; ghostRef.current.textContent = '' }
    function onMove(mv: MouseEvent) {
      if (!dragState.current || !ghostRef.current) return
      const cur = snapTo15(getMinutes(mv.clientY))
      const sMin = Math.min(dragState.current.startMin, cur)
      const eMin = Math.max(dragState.current.startMin + 15, cur)
      ghostRef.current.style.top = sMin+'px'; ghostRef.current.style.height = Math.max(eMin-sMin,15)+'px'
      ghostRef.current.textContent = `${minToTime(sMin)} – ${minToTime(eMin)}`
    }
    function onUp(mu: MouseEvent) {
      if (!dragState.current || !ghostRef.current) return
      ghostRef.current.style.display = 'none'
      const cur = snapTo15(getMinutes(mu.clientY))
      const sMin = Math.min(dragState.current.startMin, cur)
      const eMin = Math.max(dragState.current.startMin + 15, cur)
      dragState.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      if (eMin - sMin >= 15) onDragCreate(ymd, minToTime(sMin), minToTime(eMin))
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return (
    <div ref={colRef} onMouseDown={onMouseDown}
      style={{ position:'relative', minHeight:1440, background: isToday ? 'rgba(255,107,53,0.015)' : 'transparent', ...style }}>
      <div style={{ position:'absolute', left:0, right:0, top:600, height:510, background:'rgba(255,255,255,0.025)', pointerEvents:'none', zIndex:0 }} />
      {Array.from({length:24},(_,h) => (
        <div key={h}>
          <div style={{ position:'absolute', left:0, right:0, top:h*60, borderTop:`1px solid ${h>=10&&h<=18 ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.04)'}`, pointerEvents:'none' }} />
          <div style={{ position:'absolute', left:0, right:0, top:h*60+30, borderTop:'1px dashed rgba(255,255,255,0.03)', pointerEvents:'none' }} />
        </div>
      ))}
      {events.map(evt => {
        const sMin = timeToMin(evt.start), eMin = timeToMin(evt.end)
        const { col: subCol, total } = layout.get(evt.id) ?? { col:0, total:1 }
        const pct = 100/total
        return (
          <div key={evt.id} data-evt="1" onClick={() => onEventClick(evt)}
            style={{ position:'absolute', top:sMin, height:Math.max(eMin-sMin,20), left:`calc(${subCol*pct}% + 2px)`, width:`calc(${pct}% - 4px)`, background:evt.color+'22', borderLeft:`3px solid ${evt.color}`, borderRadius:6, padding:'4px 7px', fontSize:11, fontWeight:600, color:evt.color, overflow:'hidden', cursor:'pointer', zIndex:2 }}>
            <div style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{evt.title}</div>
            <div style={{ fontSize:10, fontWeight:400, opacity:0.8 }}>{evt.start} – {evt.end}{evt.location?.length ? ' · ' + evt.location.map(l => LOCATIONS.find(x => x.id === l)?.label ?? l).join(', ') : ''}</div>
          </div>
        )
      })}
      {isToday && (() => {
        const now = new Date(); const nowMin = now.getHours()*60+now.getMinutes()
        return <div style={{ position:'absolute', left:0, right:0, top:nowMin, height:2, background:'linear-gradient(90deg,#FF6B35,#E8194B)', zIndex:5, pointerEvents:'none' }}><div style={{ position:'absolute', left:-4, top:-4, width:10, height:10, borderRadius:'50%', background:'#FF6B35' }} /></div>
      })()}
      <div ref={ghostRef} style={{ position:'absolute', left:4, right:4, borderRadius:6, zIndex:50, pointerEvents:'none', background:'rgba(255,107,53,0.2)', border:'2px dashed #FF6B35', padding:'4px 8px', fontSize:11, fontWeight:600, color:'#FF6B35', display:'none' }} />
    </div>
  )
}

// ── Day view ───────────────────────────────────────────────────────────────
function DayView({ cursor, today, eventsFor, allDayFor, onEventClick, onDragCreate }: {
  cursor: Date; today: string
  eventsFor: (ymd: string) => CalEvent[]
  allDayFor:  (ymd: string) => CalEvent[]
  onEventClick: (evt: CalEvent) => void
  onDragCreate: (ymd: string, start: string, end: string) => void
}) {
  const ymd = toYMD(cursor); const isToday = ymd === today
  const dowIdx = (cursor.getDay() + 6) % 7
  const dayEvts = eventsFor(ymd); const allDay = allDayFor(ymd)
  const layout = layoutEvents(dayEvts)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (bodyRef.current) {
      const firstEvt = [...dayEvts].sort((a,b) => a.start.localeCompare(b.start))[0]
      bodyRef.current.scrollTop = firstEvt ? Math.max(0, timeToMin(firstEvt.start) - 60) : 6*60-30
    }
  }, [cursor])

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
      <div style={{ background:'var(--surface-1)', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
        <div style={{ padding:'12px 24px', display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ fontSize:22, fontWeight:700, color: isToday ? '#FF6B35' : 'var(--text-1)' }}>{cursor.getDate()} {MONTHS_RU_GEN[cursor.getMonth()]}</div>
          <div style={{ fontSize:13, color:'var(--text-3)', fontWeight:400 }}>{WEEKDAYS_F[dowIdx]}{isToday ? ' · Сегодня' : ''}</div>
        </div>
        {allDay.length > 0 && (
          <div style={{ padding:'4px 24px 8px', display:'flex', flexWrap:'wrap', gap:4 }}>
            {allDay.map(e => (
              <div key={e.id} onClick={() => onEventClick(e)}
                style={{ padding:'2px 10px', borderRadius:4, fontSize:11, fontWeight:500, background:e.color+'22', color:e.color, cursor:'pointer' }}>
                {e.title}
              </div>
            ))}
          </div>
        )}
      </div>
      <div ref={bodyRef} style={{ display:'flex', flex:1, overflowY:'auto' }}>
        <div style={{ width:52, flexShrink:0, borderRight:'1px solid var(--border)', position:'relative', minHeight:1440 }}>
          {Array.from({length:25},(_,h) => (
            <div key={h} style={{ position:'absolute', right:8, top:h*60, fontSize:10, fontWeight:500, color:'var(--text-muted)', transform:'translateY(-50%)', userSelect:'none', whiteSpace:'nowrap' }}>
              {h === 0 ? '' : `${String(h).padStart(2,'0')}:00`}
            </div>
          ))}
        </div>
        <div style={{ flex:1, position:'relative', minHeight:1440 }}>
          <DayColumn ymd={ymd} isToday={isToday} events={dayEvts} layout={layout}
            bodyRef={bodyRef} onEventClick={onEventClick} onDragCreate={onDragCreate} />
        </div>
      </div>
    </div>
  )
}

// ── Side panel ─────────────────────────────────────────────────────────────
function SidePanel({ ymd, eventsFor, allDayFor, onClose, onEventClick, onCreateClick }: {
  ymd: string
  eventsFor: (ymd: string) => CalEvent[]
  allDayFor:  (ymd: string) => CalEvent[]
  onClose: () => void; onEventClick: (evt: CalEvent) => void; onCreateClick: () => void
}) {
  const date = parseYMD(ymd); const dowIdx = (date.getDay() + 6) % 7
  const dayEvts = eventsFor(ymd).sort((a,b) => a.start.localeCompare(b.start))
  const allDay  = allDayFor(ymd)
  const allItems = [...allDay, ...dayEvts]

  return (
    <div style={{ width:272, flexShrink:0, background:'var(--surface-1)', borderLeft:'1px solid var(--border)', display:'flex', flexDirection:'column' }}>
      <div style={{ padding:'16px 16px 12px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, flexShrink:0 }}>
        <div>
          <div style={{ fontSize:14, fontWeight:700, color:'var(--text-1)' }}>{date.getDate()} {MONTHS_RU_GEN[date.getMonth()]} {date.getFullYear()}</div>
          <div style={{ fontSize:12, color:'var(--text-3)', marginTop:2 }}>{WEEKDAYS_F[dowIdx]}</div>
        </div>
        <button onClick={onClose} style={{ background:'rgba(255,255,255,0.06)', border:'1px solid var(--border)', color:'var(--text-3)', width:28, height:28, borderRadius:7, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15 }}>✕</button>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:12, display:'flex', flexDirection:'column', gap:8 }}>
        {allItems.length === 0 ? (
          <div style={{ color:'var(--text-muted)', fontSize:13, textAlign:'center', marginTop:24, lineHeight:1.6 }}>Нет событий<br/>на этот день</div>
        ) : allItems.map(evt => (
          <div key={evt.id} onClick={() => onEventClick(evt)}
            style={{ background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 12px', display:'flex', gap:10, alignItems:'flex-start', cursor:'pointer' }}>
            <div style={{ width:3, borderRadius:2, flexShrink:0, alignSelf:'stretch', minHeight:32, background:evt.color }} />
            <div style={{ flex:1, overflow:'hidden' }}>
              <div style={{ fontSize:12, fontWeight:600, color:'var(--text-1)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', marginBottom:3 }}>{evt.title}</div>
              <div style={{ fontSize:11, color:'var(--text-3)', fontWeight:500 }}>
                {evt.isAllDay ? 'Весь день' : `${evt.start} — ${evt.end}`}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding:'12px 14px', borderTop:'1px solid var(--border)', flexShrink:0 }}>
        <button onClick={onCreateClick} style={{ width:'100%', fontFamily:'Inter,sans-serif', fontSize:13, fontWeight:700, background:'linear-gradient(135deg,#FF6B35,#E8194B)', border:'none', color:'#fff', borderRadius:8, padding:'9px 0', cursor:'pointer' }}>
          + Создать событие
        </button>
      </div>
    </div>
  )
}

// ── Event modal ────────────────────────────────────────────────────────────
function EventModal({ modal, onChange, onSubmit, onDelete, onClose, canEdit }: {
  modal: ModalState
  onChange: (p: Partial<ModalState>) => void
  onSubmit: () => void; onDelete: () => void; onClose: () => void; canEdit: boolean
}) {
  const isEdit = !!modal.editId
  const inp: React.CSSProperties = { width:'100%', background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 11px', color:'var(--text-1)', fontFamily:'Inter,sans-serif', fontSize:13, outline:'none' }
  const lbl: React.CSSProperties = { fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'1px', marginBottom:6, display:'block' }
  const hasVyezd = modal.location.includes('vyezd')

  const [memberSearch, setMemberSearch] = useState('')
  const [pickerOpen,   setPickerOpen]   = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const mdRef = useRef(false)

  const { data: members = [] } = useQuery<ApiMember[]>({
    queryKey: ['users:members'],
    queryFn:  () => api.get('/users/members').then(r => r.data),
  })

  useEffect(() => {
    if (!pickerOpen) return
    function h(e: MouseEvent) { if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [pickerOpen])

  const filteredMembers = members.filter(m => m.name.toLowerCase().includes(memberSearch.toLowerCase()))
  const selectedNames = members.filter(m => modal.participantIds.includes(m.id)).map(m => m.name)

  function toggleParticipant(id: string) {
    const ids = modal.participantIds.includes(id)
      ? modal.participantIds.filter(x => x !== id)
      : [...modal.participantIds, id]
    onChange({ participantIds: ids })
  }

  return (
    <div onMouseDown={e => { mdRef.current = e.target === e.currentTarget }} onMouseUp={e => { if (mdRef.current && e.target === e.currentTarget) onClose() }} style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div onMouseDown={e => e.stopPropagation()} style={{ background:'var(--surface-2)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:16, padding:24, width:420, maxWidth:'90vw', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 24px 64px rgba(0,0,0,0.5)', fontFamily:'Inter,sans-serif' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <div style={{ fontSize:15, fontWeight:700, color:'var(--text-1)' }}>{isEdit ? (canEdit ? 'Редактировать событие' : 'Просмотр события') : 'Новое событие'}</div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.06)', border:'1px solid var(--border)', color:'var(--text-3)', borderRadius:6, width:28, height:28, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>

        <div style={{ pointerEvents: canEdit ? 'auto' : 'none', opacity: canEdit ? 1 : 0.85 }}>
        {/* Type picker */}
        <div style={{ marginBottom:16 }}>
          <span style={{ ...lbl, display:'flex', alignItems:'center' }}>Тип <Hint text="Встреча — событие с участниками и временем; Задача — личный to-do в Календаре; Личное — для планирования личного времени." width={250} /></span>
          <div style={{ display:'flex', gap:8 }}>
            {MY_EVENT_TYPES.map(t => {
              const sel = modal.type === t.value
              const color = TYPE_COLOR[t.value]
              return (
                <button key={t.value} onClick={() => onChange({ type: t.value })}
                  style={{ flex:1, padding:'7px 0', borderRadius:8, border:`1px solid ${sel ? color : 'var(--border)'}`, background: sel ? color+'22' : 'none', color: sel ? color : 'var(--text-3)', fontFamily:'Inter,sans-serif', fontSize:12, fontWeight: sel ? 700 : 400, cursor:'pointer' }}>
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ marginBottom:14 }}>
          <span style={lbl}>Название</span>
          <input autoFocus value={modal.title} onChange={e => onChange({ title: e.target.value })} onKeyDown={e => { if (e.key==='Enter') onSubmit() }} placeholder="Название события" style={inp} />
        </div>

        <div style={{ marginBottom:14 }}>
          <span style={lbl}>Дата</span>
          <input type="date" value={modal.date} onChange={e => onChange({ date: e.target.value })} style={{ ...inp, colorScheme:'dark' }} />
        </div>

        <div style={{ display:'flex', gap:10, marginBottom:14 }}>
          <div style={{ flex:1 }}>
            <span style={lbl}>Начало</span>
            <input type="time" value={modal.start} onChange={e => onChange({ start: e.target.value })} style={{ ...inp, colorScheme:'dark' }} />
          </div>
          <div style={{ flex:1 }}>
            <span style={lbl}>Конец</span>
            <input type="time" value={modal.end} onChange={e => onChange({ end: e.target.value })} style={{ ...inp, colorScheme:'dark' }} />
          </div>
        </div>

        {/* Location picker */}
        <div style={{ marginBottom: hasVyezd ? 8 : 14 }}>
          <span style={{ ...lbl, display:'flex', alignItems:'center' }}>Место <Hint text="Площадка или онлайн-формат встречи. Можно выбрать несколько." /></span>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            {LOCATIONS.map(loc => {
              const sel = modal.location.includes(loc.id)
              return (
                <button key={loc.id} onClick={() => {
                  const newLoc = sel ? modal.location.filter(l => l !== loc.id) : [...modal.location, loc.id]
                  onChange({ location: newLoc, ...(loc.id === 'vyezd' && sel ? { vyezdAddress: '' } : {}) })
                }}
                  style={{ padding:'5px 12px', borderRadius:20, border:`1px solid ${sel ? '#FF6B35' : 'var(--border)'}`, background: sel ? 'rgba(255,107,53,0.15)' : 'none', color: sel ? '#FF6B35' : 'var(--text-3)', fontFamily:'Inter,sans-serif', fontSize:12, fontWeight: sel ? 600 : 400, cursor:'pointer' }}>
                  {loc.label}
                </button>
              )
            })}
          </div>
        </div>
        {hasVyezd && (
          <div style={{ marginBottom:14 }}>
            <input value={modal.vyezdAddress} onChange={e => onChange({ vyezdAddress: e.target.value })} placeholder="Адрес выезда..." style={{ ...inp, fontSize:12 }} />
          </div>
        )}

        {/* Participant picker */}
        <div style={{ marginBottom:22 }}>
          <span style={{ ...lbl, display:'flex', alignItems:'center' }}>Участники <Hint text="Коллеги, приглашённые на встречу. Событие появится в Календаре у каждого участника." /></span>
          <div ref={pickerRef} style={{ position:'relative' }}>
            <div
              onClick={() => { setMemberSearch(''); setPickerOpen(o => !o) }}
              style={{ ...inp, cursor:'pointer', minHeight:38, display:'flex', flexWrap:'wrap', gap:4, alignItems:'center', padding:'6px 10px' }}
            >
              {selectedNames.length === 0
                ? <span style={{ color:'var(--text-muted)', fontSize:12 }}>Добавить участников...</span>
                : selectedNames.map(n => (
                    <span key={n} style={{ fontSize:11, padding:'2px 8px', borderRadius:12, background:'rgba(139,92,246,0.2)', color:'#8B5CF6', fontWeight:600 }}>{n}</span>
                  ))
              }
            </div>
            {pickerOpen && (
              <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:300, background:'var(--surface-1)', border:'1px solid var(--border)', borderRadius:8, marginTop:4, boxShadow:'0 8px 24px rgba(0,0,0,0.4)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
                <div style={{ padding:'8px 10px', borderBottom:'1px solid var(--border)' }}>
                  <input autoFocus value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder="Поиск..." onMouseDown={e => e.stopPropagation()}
                    style={{ width:'100%', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:6, padding:'6px 8px', color:'var(--text-1)', fontFamily:'Inter,sans-serif', fontSize:12, outline:'none', boxSizing:'border-box' }} />
                </div>
                <div style={{ maxHeight:180, overflowY:'auto' }}>
                  {filteredMembers.map(m => {
                    const sel = modal.participantIds.includes(m.id)
                    return (
                      <div key={m.id} onMouseDown={e => { e.preventDefault(); toggleParticipant(m.id) }}
                        style={{ padding:'9px 12px', fontSize:13, color:'var(--text-1)', cursor:'pointer', display:'flex', alignItems:'center', gap:8, background: sel ? 'rgba(139,92,246,0.1)' : 'transparent' }}
                        onMouseEnter={e => { if (!sel) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = sel ? 'rgba(139,92,246,0.1)' : 'transparent' }}>
                        <div style={{ width:14, height:14, borderRadius:3, border:`1.5px solid ${sel ? '#8B5CF6' : 'var(--text-muted)'}`, background: sel ? '#8B5CF6' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, color:'#fff', flexShrink:0 }}>{sel ? '✓' : ''}</div>
                        {formatName(m.name)}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
        </div>{/* end canEdit wrapper */}

        <div style={{ display:'flex', gap:8 }}>
          {isEdit && canEdit && (
            <button onClick={onDelete} style={{ flex:1, fontFamily:'Inter,sans-serif', fontSize:13, fontWeight:600, background:'rgba(232,25,75,0.12)', border:'1px solid rgba(232,25,75,0.3)', color:'#E8194B', borderRadius:8, padding:'9px 0', cursor:'pointer' }}>Удалить</button>
          )}
          <button onClick={onClose} style={{ flex:1, fontFamily:'Inter,sans-serif', fontSize:13, fontWeight:600, background:'rgba(255,255,255,0.06)', border:'1px solid var(--border)', color:'var(--text-3)', borderRadius:8, padding:'9px 0', cursor:'pointer' }}>{canEdit ? 'Отмена' : 'Закрыть'}</button>
          {canEdit && (
            <button onClick={onSubmit} style={{ flex:2, fontFamily:'Inter,sans-serif', fontSize:13, fontWeight:700, background:'linear-gradient(135deg,#FF6B35,#E8194B)', border:'none', color:'#fff', borderRadius:8, padding:'9px 0', cursor:'pointer' }}>
              {isEdit ? 'Сохранить' : 'Создать'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Entry modal (admin) ────────────────────────────────────────────────────
function EntryModal({ modal, onChange, onSubmit, onDelete, onClose }: {
  modal: EntryModalState
  onChange: (p: Partial<EntryModalState>) => void
  onSubmit: () => void; onDelete: () => void; onClose: () => void
}) {
  const isEdit = !!modal.editId
  const isHR = modal.type.startsWith('hr_')
  const inp: React.CSSProperties = { width:'100%', background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 11px', color:'var(--text-1)', fontFamily:'Inter,sans-serif', fontSize:13, outline:'none' }
  const lbl: React.CSSProperties = { fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'1px', marginBottom:6, display:'block' }

  const { data: members = [] } = useQuery<ApiMember[]>({
    queryKey: ['users:members'],
    queryFn:  () => api.get('/users/members').then(r => r.data),
    enabled:  isHR,
  })
  const mdRef = useRef(false)

  return (
    <div onMouseDown={e => { mdRef.current = e.target === e.currentTarget }} onMouseUp={e => { if (mdRef.current && e.target === e.currentTarget) onClose() }} style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div onMouseDown={e => e.stopPropagation()} style={{ background:'var(--surface-2)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:16, padding:24, width:420, maxWidth:'90vw', boxShadow:'0 24px 64px rgba(0,0,0,0.5)', fontFamily:'Inter,sans-serif' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <div style={{ fontSize:15, fontWeight:700, color:'var(--text-1)' }}>{isEdit ? 'Редактировать запись' : 'Новая запись'}</div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.06)', border:'1px solid var(--border)', color:'var(--text-3)', borderRadius:6, width:28, height:28, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>

        <div style={{ marginBottom:14 }}>
          <span style={lbl}>Тип</span>
          <select value={modal.type} onChange={e => onChange({ type: e.target.value as EntryType, isAllDay: (e.target.value as string).startsWith('hr_') })}
            style={{ ...inp, appearance:'none', cursor:'pointer' }}>
            <optgroup label="Общие">
              {SHARED_ENTRY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </optgroup>
            <optgroup label="HR статусы">
              {HR_ENTRY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </optgroup>
          </select>
        </div>

        <div style={{ marginBottom:14 }}>
          <span style={lbl}>Название</span>
          <input autoFocus value={modal.title} onChange={e => onChange({ title: e.target.value })} onKeyDown={e => { if (e.key==='Enter') onSubmit() }} placeholder="Название" style={inp} />
        </div>

        <div style={{ marginBottom:14 }}>
          <span style={lbl}>Дата</span>
          <input type="date" value={modal.date} onChange={e => onChange({ date: e.target.value })} style={{ ...inp, colorScheme:'dark' }} />
        </div>

        {!isHR && (
          <div style={{ marginBottom:14 }}>
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', marginBottom:10 }}>
              <input type="checkbox" checked={modal.isAllDay} onChange={e => onChange({ isAllDay: e.target.checked })} />
              <span style={{ fontSize:13, color:'var(--text-2)' }}>Весь день</span>
            </label>
            {!modal.isAllDay && (
              <div style={{ display:'flex', gap:10 }}>
                <div style={{ flex:1 }}>
                  <span style={lbl}>Начало</span>
                  <input type="time" value={modal.start} onChange={e => onChange({ start: e.target.value })} style={{ ...inp, colorScheme:'dark' }} />
                </div>
                <div style={{ flex:1 }}>
                  <span style={lbl}>Конец</span>
                  <input type="time" value={modal.end} onChange={e => onChange({ end: e.target.value })} style={{ ...inp, colorScheme:'dark' }} />
                </div>
              </div>
            )}
          </div>
        )}

        {isHR && (
          <div style={{ marginBottom:14 }}>
            <span style={lbl}>Сотрудник</span>
            <select value={modal.targetUserId} onChange={e => onChange({ targetUserId: e.target.value })} style={{ ...inp, appearance:'none', cursor:'pointer' }}>
              <option value="">— не выбран —</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        )}

        <div style={{ display:'flex', gap:8, marginTop:22 }}>
          {isEdit && (
            <button onClick={onDelete} style={{ flex:1, fontFamily:'Inter,sans-serif', fontSize:13, fontWeight:600, background:'rgba(232,25,75,0.12)', border:'1px solid rgba(232,25,75,0.3)', color:'#E8194B', borderRadius:8, padding:'9px 0', cursor:'pointer' }}>Удалить</button>
          )}
          <button onClick={onClose} style={{ flex:1, fontFamily:'Inter,sans-serif', fontSize:13, fontWeight:600, background:'rgba(255,255,255,0.06)', border:'1px solid var(--border)', color:'var(--text-3)', borderRadius:8, padding:'9px 0', cursor:'pointer' }}>Отмена</button>
          <button onClick={onSubmit} style={{ flex:2, fontFamily:'Inter,sans-serif', fontSize:13, fontWeight:700, background:'linear-gradient(135deg,#FF6B35,#E8194B)', border:'none', color:'#fff', borderRadius:8, padding:'9px 0', cursor:'pointer' }}>
            {isEdit ? 'Сохранить' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  )
}
