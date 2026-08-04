import { useState, useMemo, useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCurrentUser } from '../hooks/useAuth'
import { api } from '../lib/api'
import type { CalView, EventType, EntryType, ApiEvent, ApiCalEntry, CalEvent, ModalState, EntryModalState } from './calendar/types'
import { TYPE_COLOR, MY_CATS, HR_CATS, LOCATION_IDS, MONTHS_RU, MONTHS_RU_GEN, navBtnStyle, BLANK_MODAL, BLANK_ENTRY } from './calendar/constants'
import { toYMD, getWeekStart, computeRange } from './calendar/utils'
import { MonthView, WeekView, DayView } from './calendar/views'
import { SidebarSection, GlobalCalRow, SidePanel } from './calendar/sidebar'
import { EventModal, EntryModal } from './calendar/modals'
import { HeaderPortal } from '../components/HeaderPortal'

// Слепок значимых полей карточки — для детекта несохранённых изменений (§6: сброс с подтверждением)
function modalKey(m: ModalState) {
  return JSON.stringify({ type: m.type, title: m.title, date: m.date, start: m.start, end: m.end, location: [...m.location].sort(), vyezd: m.vyezdAddress, parts: [...m.participantIds].sort() })
}

// ── Main component ─────────────────────────────────────────────────────────
export function CalendarPage() {
  const currentUser = useCurrentUser()
  const qc          = useQueryClient()
  const isAdmin     = !!currentUser?.isAdmin
  const today       = new Date()
  const todayS      = toYMD(today)

  const [view,        setView]        = useState<CalView>('week')
  const [cursor,      setCursor]      = useState(new Date())
  const [calsOpen,    setCalsOpen]    = useState(false)   // поповер списка календарей (замена левого сайдбара)
  const [calSearch,   setCalSearch]   = useState('')      // поиск по названию календаря в поповере
  const calsDownRef = useRef(false)                       // железное правило попапов: mousedown+mouseup на оверлее
  const [visible,     setVisible]     = useState<Set<string>>(() => new Set([...MY_CATS, ...HR_CATS].map(c => c.id)))
  const [selected,    setSelected]    = useState<string | null>(null)
  const [panelOpen,   setPanelOpen]   = useState(false)
  const [modal,       setModal]       = useState<ModalState>(BLANK_MODAL())
  const [entryModal,  setEntryModal]  = useState<EntryModalState>(BLANK_ENTRY())
  const [confirmClose, setConfirmClose] = useState(false)   // §6: подтверждение сброса несохранённых изменений
  const snapshotRef = useRef('')                             // слепок карточки на момент открытия
  const modalRef = useRef(modal); modalRef.current = modal   // актуальный modal для document-листенера

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
    const next: ModalState = { open: true, editId: null, source: 'event', type: 'meeting', date: date ?? todayS, start: start ?? '09:00', end: end ?? '10:00', title: '', location: [], vyezdAddress: '', participantIds: [], canEdit: true }
    setModal(next); snapshotRef.current = modalKey(next); setConfirmClose(false)
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
      const next: ModalState = {
        open: true, editId: ev.id, source: 'event', type: ev.type as EventType,
        date: ev.date.slice(0,10), start: ev.startTime, end: ev.endTime, title: ev.title,
        location: locIds, vyezdAddress: address,
        participantIds: ev.participants.map(p => p.userId), canEdit,
      }
      setModal(next); snapshotRef.current = modalKey(next); setConfirmClose(false)
    }
  }

  // §6: закрыть карточку по запросу — без изменений сразу, с изменениями через подтверждение
  function requestCloseCard() {
    if (modalKey(modalRef.current) !== snapshotRef.current) setConfirmClose(true)
    else { setModal(BLANK_MODAL()); setConfirmClose(false) }
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

  // §6: живой черновик события для сетки (двусторонне связан с боковой карточкой через modal.start/end)
  const draft = modal.open && modal.source === 'event'
    ? { date: modal.date, start: modal.start, end: modal.end, editId: modal.editId, color: TYPE_COLOR[modal.type] ?? '#8B5CF6' }
    : null
  const onDraftResize = (start: string, end: string) => setModal(m => ({ ...m, start, end }))

  // §6: карточка не затемняет — закрываем её кликом в пустоте (не по карточке/событию/обводке).
  // Мини-пикеры даты/времени/участников гасят mousedown (stopPropagation) — сюда не долетают.
  useEffect(() => {
    if (!modal.open) return
    function onDocDown(e: MouseEvent) {
      const t = e.target as HTMLElement
      if (t.closest('[data-card]') || t.closest('[data-evt]') || t.closest('[data-draft]')) return
      if (modalKey(modalRef.current) !== snapshotRef.current) setConfirmClose(true)
      else setModal(BLANK_MODAL())
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [modal.open])

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>

      {/* Контролы Календаря — в китовую шапку (заголовок «Календарь» даёт AppShell) */}
      <HeaderPortal>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <button onClick={() => navigate(-1)} style={navBtnStyle}>‹</button>
            <div style={{ fontSize:14, fontWeight:600, color:'var(--text-1)', minWidth:150, textAlign:'center' }}>{periodLabel}</div>
            <button onClick={() => navigate(1)}  style={navBtnStyle}>›</button>
          </div>
          <button onClick={() => { setCursor(new Date(today)); closePanel() }}
            style={{ padding:'5px 14px', borderRadius:8, border:'1px solid var(--border)', background:'none', color:'var(--text-3)', fontSize:13, fontFamily:'Inter,sans-serif', cursor:'pointer' }}>
            Сегодня
          </button>

          <div style={{ display:'flex', background:'var(--surface-2)', borderRadius:10, padding:3, gap:2, border:'1px solid var(--border)' }}>
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

          <button onClick={() => setCalsOpen(o => !o)}
            style={{ padding:'5px 14px', borderRadius:8, border:'1px solid var(--border)', background: calsOpen ? 'var(--surface-2)' : 'none', color:'var(--text-2)', fontSize:13, fontFamily:'Inter,sans-serif', cursor:'pointer' }}>
            Календари ▾
          </button>
        </div>
      </HeaderPortal>

      {/* Поповер «Календари» — список вкл/выкл (замена левого сайдбара). Закрытие: mousedown+mouseup на оверлее + ✕. */}
      {calsOpen && (
        <div
          onMouseDown={(e) => { calsDownRef.current = e.target === e.currentTarget }}
          onMouseUp={(e) => { if (calsDownRef.current && e.target === e.currentTarget) setCalsOpen(false); calsDownRef.current = false }}
          style={{ position:'fixed', inset:0, zIndex:60 }}
        >
          {(() => {
            const q = calSearch.trim().toLowerCase()
            const myF = MY_CATS.filter(c => c.label.toLowerCase().includes(q))
            const hrF = HR_CATS.filter(c => c.label.toLowerCase().includes(q))
            const showGlobal = !q || 'общий'.includes(q)
            const allIds = [...MY_CATS, ...HR_CATS].map(c => c.id)
            return (
          <div style={{ position:'absolute', top:56, right:16, width:236, maxHeight:'72vh', overflowY:'auto', background:'var(--surface-1)', border:'1px solid var(--border)', borderRadius:12, boxShadow:'0 12px 38px -8px rgba(0,0,0,0.55)', padding:12 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
              <span style={{ fontSize:11, fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--text-muted)' }}>Календари</span>
              <button onClick={() => setCalsOpen(false)} aria-label="Закрыть" style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', display:'flex' }}><X size={14} /></button>
            </div>
            <input value={calSearch} onChange={e => setCalSearch(e.target.value)} placeholder="Поиск календаря…"
              style={{ width:'100%', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:8, padding:'6px 9px', color:'var(--text-1)', fontFamily:'Inter,sans-serif', fontSize:12, outline:'none', boxSizing:'border-box', marginBottom:6 }} />
            <div style={{ display:'flex', gap:12, padding:'0 2px 6px', fontSize:11 }}>
              <button onClick={() => setVisible(new Set(allIds))} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--accent-s)', padding:0 }}>Выбрать все</button>
              <button onClick={() => setVisible(new Set())} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:0 }}>Снять все</button>
            </div>
            {(myF.length > 0 || (!q && showGlobal)) && (
              <SidebarSection label="МОИ КАЛЕНДАРИ" cats={myF} visible={visible} onToggle={toggleCat}
                onAdd={!q ? () => openCreate() : undefined}>
                {/* Общий — всегда виден, не скрывается не-админами */}
                {showGlobal && <GlobalCalRow isAdmin={isAdmin} onAdd={() => setEntryModal({ ...BLANK_ENTRY(), open: true, type: 'global', date: todayS })} />}
              </SidebarSection>
            )}
            {hrF.length > 0 && <>
              <div style={{ margin:'10px 0 4px', borderTop:'1px solid var(--border)' }} />
              <SidebarSection label="HR СТАТУСЫ" cats={hrF} visible={visible} onToggle={toggleCat}
                onAdd={!q && isAdmin ? () => setEntryModal({ ...BLANK_ENTRY(), open: true, type: 'hr_sick', date: todayS, isAllDay: true }) : undefined} />
            </>}
            {q && myF.length === 0 && hrF.length === 0 && !showGlobal && (
              <div style={{ padding:'10px 4px', fontSize:12, color:'var(--text-muted)', textAlign:'center' }}>Ничего не найдено</div>
            )}
          </div>
            )
          })()}
        </div>
      )}

      {/* Body */}
      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>

        {/* Calendar area (сайдбар категорий перенесён в поповер «Календари» в шапке) */}
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
              onDragCreate={(ymd, start, end) => openCreate(ymd, start, end)}
              draft={draft} onDraftResize={onDraftResize} />
          )}
          {view === 'day' && (
            <DayView cursor={cursor} today={todayS}
              eventsFor={eventsFor} allDayFor={allDayFor}
              onEventClick={openEdit}
              onDragCreate={(ymd, start, end) => openCreate(ymd, start, end)}
              draft={draft} onDraftResize={onDraftResize} />
          )}
        </div>

        {/* Right day panel */}
        {panelOpen && selected && (
          <SidePanel ymd={selected} eventsFor={eventsFor} allDayFor={allDayFor}
            onClose={closePanel} onEventClick={openEdit}
            onCreateClick={() => openCreate(selected)} />
        )}
      </div>

      {/* Event modal (§6: боковая карточка) */}
      {modal.open && (
        <EventModal modal={modal} onChange={p => setModal(m => ({ ...m, ...p }))}
          onSubmit={submitModal} onDelete={deleteModal} onClose={requestCloseCard} canEdit={modal.canEdit} />
      )}

      {/* §6: подтверждение сброса несохранённых изменений карточки */}
      {confirmClose && (
        <div style={{ position:'fixed', inset:0, zIndex:1200, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div data-card="1" style={{ background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:14, padding:22, width:320, maxWidth:'90vw', fontFamily:'Inter,sans-serif', boxShadow:'0 24px 64px rgba(0,0,0,0.5)' }}>
            <div style={{ fontSize:15, fontWeight:700, color:'var(--text-1)', marginBottom:8 }}>Сбросить изменения?</div>
            <div style={{ fontSize:13, color:'var(--text-3)', marginBottom:18, lineHeight:1.5 }}>Изменения в событии не сохранены. Закрыть без сохранения?</div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setConfirmClose(false)} style={{ flex:1, fontFamily:'Inter,sans-serif', fontSize:13, fontWeight:600, background:'rgba(255,255,255,0.06)', border:'1px solid var(--border)', color:'var(--text-2)', borderRadius:8, padding:'9px 0', cursor:'pointer' }}>Продолжить правку</button>
              <button onClick={() => { setConfirmClose(false); setModal(BLANK_MODAL()) }} style={{ flex:1, fontFamily:'Inter,sans-serif', fontSize:13, fontWeight:700, background:'rgba(232,25,75,0.14)', border:'1px solid rgba(232,25,75,0.35)', color:'#E8194B', borderRadius:8, padding:'9px 0', cursor:'pointer' }}>Сбросить</button>
            </div>
          </div>
        </div>
      )}

      {/* Entry modal (admin) */}
      {entryModal.open && (
        <EntryModal modal={entryModal} onChange={p => setEntryModal(m => ({ ...m, ...p }))}
          onSubmit={submitEntryModal} onDelete={deleteEntryModal} onClose={() => setEntryModal(BLANK_ENTRY())} />
      )}
    </div>
  )
}
