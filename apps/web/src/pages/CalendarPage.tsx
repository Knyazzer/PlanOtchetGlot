import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCurrentUser } from '../hooks/useAuth'
import { api } from '../lib/api'
import type { CalView, EventType, EntryType, ApiEvent, ApiCalEntry, CalEvent, ModalState, EntryModalState } from './calendar/types'
import { TYPE_COLOR, MY_CATS, HR_CATS, LOCATION_IDS, MONTHS_RU, MONTHS_RU_GEN, navBtnStyle, BLANK_MODAL, BLANK_ENTRY } from './calendar/constants'
import { toYMD, getWeekStart, computeRange } from './calendar/utils'
import { MonthView, WeekView, DayView } from './calendar/views'
import { SidebarSection, GlobalCalRow, SidePanel } from './calendar/sidebar'
import { EventModal, EntryModal } from './calendar/modals'

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
