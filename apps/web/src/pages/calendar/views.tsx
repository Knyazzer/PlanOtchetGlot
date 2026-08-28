import { useRef, useEffect, useState } from 'react'
import type { CalEvent } from './types'
import { WEEKDAYS_S, WEEKDAYS_F, MONTHS_RU_GEN, LOCATIONS } from './constants'
import { toYMD, getWeekStart, layoutEvents, timeToMin, minToTime, snapTo15 } from './utils'

// Раскладка параллельных (§5): события лежат равными колонками, а справа колонки
// всегда остаётся свободный ЗАЗОР — там можно зажать-протянуть, чтобы создать
// параллельное событие рядом с существующим.
const RIGHT_GUTTER = 20 // px свободной правой зоны для создания параллельного
const COL_GAP = 4       // px между колонками

// ── Month view ─────────────────────────────────────────────────────────────
export function MonthView({ cursor, today, selected, eventsFor, allDayFor, onDayClick, onEventClick }: {
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
          <div key={d} style={{ padding:'10px 12px', fontSize:12, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.8px', textAlign:'center' }}>{d}</div>
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
              style={{ borderRight:'1px solid var(--border)', borderBottom:'1px solid var(--border)', padding:6, cursor:'pointer', opacity: isThisMonth ? 1 : 0.35, overflow:'hidden' }}>
              <div style={{ width:24, height:24, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:500, marginBottom:4,
                background: isToday ? '#F97316' : isSel ? 'rgba(123,97,255,0.15)' : 'transparent',
                color: isToday ? '#fff' : isSel ? 'var(--accent-s)' : 'var(--text-3)',
                outline: isSel && !isToday ? '1px solid rgba(123,97,255,0.4)' : 'none',
              }}>{d.getDate()}</div>
              {shown.map(evt => (
                <div key={evt.id} onClick={e => { e.stopPropagation(); onEventClick(evt) }}
                  style={{ padding:'1px 6px', borderRadius:3, fontSize:12, fontWeight:500, marginBottom:2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', background:evt.color+'22', color:evt.color, borderLeft:`2px solid ${evt.color}`, cursor:'pointer' }}>
                  {evt.isAllDay ? '⬤ ' : ''}{evt.title}
                </div>
              ))}
              {extra > 0 && <div style={{ fontSize:12, color:'var(--text-muted)', padding:'1px 4px' }}>+{extra} ещё</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Week view ──────────────────────────────────────────────────────────────
export function WeekView({ cursor, today, eventsFor, allDayFor, onEventClick, onDragCreate, draft, onDraftResize, onEventMove, onMovingChange }: {
  cursor: Date; today: string
  eventsFor: (ymd: string) => CalEvent[]
  allDayFor:  (ymd: string) => CalEvent[]
  onEventClick: (evt: CalEvent) => void
  onDragCreate: (ymd: string, start: string, end: string) => void
  draft?: CalDraft | null
  onDraftResize?: (start: string, end: string) => void
  onEventMove?: (id: string, date: string, start: string, end: string) => void  // §6: перенос силуэтом
  onMovingChange?: (moving: boolean) => void                                     // §6: гасим карточку на время переноса
}) {
  const ws = getWeekStart(cursor)
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(ws); d.setDate(ws.getDate()+i); return d })
  const bodyRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const [move, setMove] = useState<{ evt: CalEvent; dur: number; dayIndex: number; startMin: number; mx: number; my: number } | null>(null)

  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = 6*60 - 30 }, [cursor])

  // §6: перенос события целиком (клик-удержание → силуэт к курсору, подсветка целевого слота, дроп меняет день/время)
  function bodyMinutes(clientY: number) {
    const el = bodyRef.current
    return el ? clientY - el.getBoundingClientRect().top + el.scrollTop : 0
  }
  function beginMove(evt: CalEvent, e: React.MouseEvent) {
    if (evt.source !== 'event' || e.button !== 0) { if (e.button === 0) onEventClick(evt); return }
    e.preventDefault(); e.stopPropagation()
    const sx = e.clientX, sy = e.clientY
    const dur = timeToMin(evt.end) - timeToMin(evt.start)
    let activated = false
    const calc = (cx: number, cy: number) => {
      const g = gridRef.current!.getBoundingClientRect()
      let di = Math.floor((cx - g.left) / (g.width / 7)); di = Math.max(0, Math.min(6, di))
      let s = snapTo15(bodyMinutes(cy)); s = Math.max(0, Math.min(1440 - dur, s))
      return { di, s }
    }
    function onMove(mv: MouseEvent) {
      if (!activated && Math.abs(mv.clientX - sx) + Math.abs(mv.clientY - sy) < 5) return
      if (!activated) { activated = true; onMovingChange?.(true) }
      const { di, s } = calc(mv.clientX, mv.clientY)
      setMove({ evt, dur, dayIndex: di, startMin: s, mx: mv.clientX, my: mv.clientY })
    }
    function onUp(mu: MouseEvent) {
      document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp)
      if (!activated) { onEventClick(evt); return }
      onMovingChange?.(false)
      const { di, s } = calc(mu.clientX, mu.clientY)
      setMove(null)
      onEventMove?.(evt.id, toYMD(days[di]), minToTime(s), minToTime(s + dur))
    }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
  }

  const hasAllDay = days.some(d => allDayFor(toYMD(d)).length > 0)

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
      {/* Day header */}
      <div style={{ display:'grid', gridTemplateColumns:'52px repeat(7,1fr)', background:'var(--surface-1)', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
        <div style={{ borderRight:'1px solid var(--border)' }} />
        {days.map((d,i) => {
          const isToday = toYMD(d) === today
          return (
            <div key={i} style={{ padding:'8px 8px', textAlign:'center', borderRight: i<6 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ fontSize:12, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.8px' }}>{WEEKDAYS_S[i]}</div>
              <div style={{ fontSize:18, fontWeight:700, width:34, height:34, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', margin:'2px auto 0', background: isToday ? '#F97316' : 'transparent', color: isToday ? '#fff' : 'var(--text-3)' }}>{d.getDate()}</div>
            </div>
          )
        })}
      </div>

      {/* All-day row */}
      {hasAllDay && (
        <div style={{ display:'grid', gridTemplateColumns:'52px repeat(7,1fr)', borderBottom:'1px solid var(--border)', flexShrink:0, background:'var(--surface-1)' }}>
          <div style={{ borderRight:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <span style={{ fontSize:12, color:'var(--text-muted)', writingMode:'vertical-rl', transform:'rotate(180deg)', letterSpacing:'0.5px' }}>Весь день</span>
          </div>
          {days.map((d,i) => {
            const entries = allDayFor(toYMD(d))
            return (
              <div key={i} style={{ padding:'3px 4px', borderRight: i<6 ? '1px solid var(--border)' : 'none', minHeight:24 }}>
                {entries.map(e => (
                  <div key={e.id} onClick={() => onEventClick(e)}
                    style={{ padding:'1px 6px', borderRadius:3, fontSize:12, fontWeight:500, marginBottom:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', background:e.color+'22', color:e.color, cursor:'pointer' }}>
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
            <div key={h} style={{ position:'absolute', right:8, top: h*60, fontSize:12, fontWeight:500, color:'var(--text-muted)', transform:'translateY(-50%)', whiteSpace:'nowrap', userSelect:'none' }}>
              {h === 0 ? '' : `${String(h).padStart(2,'0')}:00`}
            </div>
          ))}
        </div>
        <div ref={gridRef} style={{ flex:1, display:'grid', gridTemplateColumns:'repeat(7,1fr)', position:'relative', minHeight:1440 }}>
          {days.map((d, i) => {
            const ymd = toYMD(d)
            const dayEvts = eventsFor(ymd)
            const layout  = layoutEvents(dayEvts)
            return (
              <DayColumn key={i} ymd={ymd} isToday={ymd === today} events={dayEvts} layout={layout}
                bodyRef={bodyRef} onEventClick={onEventClick} onDragCreate={onDragCreate}
                draft={draft} onDraftResize={onDraftResize} onEventDown={beginMove}
                style={{ borderRight: i<6 ? '1px solid var(--border)' : 'none' }} />
            )
          })}
          {/* §6: подсветка целевого слота при переносе */}
          {move && (
            <div style={{ position:'absolute', top:move.startMin, height:Math.max(move.dur,22),
              left:`calc(${move.dayIndex} * 100% / 7)`, width:'calc(100% / 7)', zIndex:45, pointerEvents:'none',
              boxSizing:'border-box', borderRadius:7, border:`2px dashed ${move.evt.color}`, background:move.evt.color+'22',
              boxShadow:`0 0 0 3px ${move.evt.color}22` }} />
          )}
        </div>
      </div>
      {/* §6: силуэт события у курсора */}
      {move && (
        <div style={{ position:'fixed', left:move.mx+14, top:move.my+14, zIndex:1500, pointerEvents:'none',
          background:move.evt.color, color:'#fff', borderRadius:8, padding:'6px 11px', fontSize:12, fontWeight:700,
          boxShadow:'0 10px 28px rgba(0,0,0,0.45)', maxWidth:220, fontFamily:'Inter,sans-serif' }}>
          <div style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{move.evt.title || 'Событие'}</div>
          <div style={{ fontSize:12, fontWeight:500, opacity:0.9 }}>{WEEKDAYS_S[move.dayIndex]} · {minToTime(move.startMin)}–{minToTime(move.startMin + move.dur)}</div>
        </div>
      )}
    </div>
  )
}

// ── Day column ─────────────────────────────────────────────────────────────
// Живой черновик события (§6): обводка в сетке, двусторонне связанная с боковой карточкой.
export type CalDraft = { date: string; start: string; end: string; editId: string | null; color: string }

export function DayColumn({ ymd, isToday, events, layout, bodyRef, onEventClick, onDragCreate, style, wide, draft, onDraftResize, onEventDown }: {
  ymd: string; isToday: boolean; events: CalEvent[]
  layout: Map<string, { col: number; total: number }>
  bodyRef: React.RefObject<HTMLDivElement | null>
  onEventClick: (evt: CalEvent) => void
  onDragCreate: (ymd: string, start: string, end: string) => void
  style?: React.CSSProperties
  wide?: boolean  // одиночный день — колонки шире, подписи скрываем позже
  draft?: CalDraft | null                                   // §6: живой черновик (создание/правка)
  onDraftResize?: (start: string, end: string) => void      // §6: тянем края/двигаем обводку → время в карточке
  onEventDown?: (evt: CalEvent, e: React.MouseEvent) => void // §6: клик-удержание по событию → перенос силуэтом
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
    if (draft) return  // §6: карточка открыта — клик по пустоте её закрывает/сбрасывает, а не создаёт новое
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

  // §6: тянем верхний/нижний край обводки-черновика → меняем start/end (обратная связь в карточку)
  function startResize(edge: 'top' | 'bottom', e: React.MouseEvent) {
    if (!draft || !onDraftResize) return
    e.stopPropagation(); e.preventDefault()
    const s0 = timeToMin(draft.start), e0 = timeToMin(draft.end)
    function onMove(mv: MouseEvent) {
      const cur = snapTo15(getMinutes(mv.clientY))
      if (edge === 'top') onDraftResize!(minToTime(Math.min(cur, e0 - 15)), minToTime(e0))
      else                onDraftResize!(minToTime(s0), minToTime(Math.max(cur, s0 + 15)))
    }
    function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
  }
  // §6: тянем тело обводки → двигаем событие по времени в пределах дня (длительность сохраняется)
  function startMove(e: React.MouseEvent) {
    if (!draft || !onDraftResize) return
    e.stopPropagation(); e.preventDefault()
    const s0 = timeToMin(draft.start), dur = timeToMin(draft.end) - s0
    const offset = snapTo15(getMinutes(e.clientY)) - s0
    function onMove(mv: MouseEvent) {
      let ns = snapTo15(getMinutes(mv.clientY)) - offset
      ns = Math.max(0, Math.min(1440 - dur, ns))
      onDraftResize!(minToTime(ns), minToTime(ns + dur))
    }
    function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
  }

  return (
    <div ref={colRef} onMouseDown={onMouseDown}
      style={{ position:'relative', minHeight:1440, background: isToday ? 'color-mix(in srgb, var(--accent) 9%, transparent)' : 'transparent', ...style }}>
      <div style={{ position:'absolute', left:0, right:0, top:600, height:510, background:'color-mix(in srgb, var(--text-1) 5%, transparent)', pointerEvents:'none', zIndex:0 }} />
      {Array.from({length:24},(_,h) => (
        <div key={h}>
          <div style={{ position:'absolute', left:0, right:0, top:h*60, borderTop:`1px solid var(--border)`, pointerEvents:'none' }} />
          <div style={{ position:'absolute', left:0, right:0, top:h*60+30, borderTop:'1px dashed rgba(255,255,255,0.03)', pointerEvents:'none' }} />
        </div>
      ))}
      {events.map(evt => {
        if (draft?.editId === evt.id) return null  // §6: редактируемое событие показываем обводкой-черновиком
        const sMin = timeToMin(evt.start), eMin = timeToMin(evt.end)
        const { col: subCol, total } = layout.get(evt.id) ?? { col:0, total:1 }
        const frac = 1/total
        // ширина колонки = (доступная ширина без правого зазора) / кол-во колонок − гэп
        const left  = `calc((100% - ${RIGHT_GUTTER}px) * ${subCol * frac} + 2px)`
        const width = `calc((100% - ${RIGHT_GUTTER}px) * ${frac} - ${COL_GAP}px)`
        const height = Math.max(eMin - sMin, 20)
        const dense     = total >= (wide ? 8 : 4)   // колонки узкие — убираем подпись времени
        const veryDense = total >= (wide ? 14 : 7)  // совсем узкие — только цветная полоса, текст в tooltip
        const loc = evt.location?.length ? ' · ' + evt.location.map(l => LOCATIONS.find(x => x.id === l)?.label ?? l).join(', ') : ''
        return (
          <div key={evt.id} data-evt="1" title={`${evt.title} · ${evt.start}–${evt.end}`}
            onMouseDown={onEventDown ? e => onEventDown(evt, e) : undefined}
            onClick={onEventDown ? undefined : () => onEventClick(evt)}
            style={{ position:'absolute', top:sMin, height, left, width, background:evt.color+'22', borderLeft:`3px solid ${evt.color}`, borderRadius:6, padding: veryDense ? '2px 3px' : dense ? '3px 5px' : '4px 7px', fontSize:12, fontWeight:600, color:evt.color, overflow:'hidden', cursor:'pointer', zIndex:2 }}>
            {!veryDense && (
              <div style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{evt.title}</div>
            )}
            {!dense && height >= 32 && (
              <div style={{ fontSize:12, fontWeight:400, opacity:0.8, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{evt.start} – {evt.end}{loc}</div>
            )}
          </div>
        )
      })}
      {/* §6: живой черновик — пунктир (создание) / заливка (правка), двусторонне связан с карточкой */}
      {draft && draft.date === ymd && onDraftResize && (() => {
        const s = timeToMin(draft.start), e = timeToMin(draft.end)
        const isCreate = !draft.editId
        const c = draft.color
        return (
          <div data-draft="1" data-evt="1" onMouseDown={startMove}
            style={{ position:'absolute', top:s, height:Math.max(e-s,22), left:2, right:RIGHT_GUTTER+2, zIndex:40, borderRadius:7, cursor:'move',
              background: isCreate ? c+'1f' : c+'33',
              border: isCreate ? `2px dashed ${c}` : `2px solid ${c}`,
              boxShadow:`0 0 0 3px ${c}22`, padding:'3px 8px', fontSize:12, fontWeight:700, color:c, overflow:'hidden' }}>
            <div style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{isCreate ? 'Новое событие' : 'Редактирование'}</div>
            <div style={{ fontSize:12, fontWeight:500, opacity:0.85 }}>{draft.start} – {draft.end}</div>
            <div onMouseDown={ev => startResize('top', ev)}    style={{ position:'absolute', top:-5, left:0, right:0, height:11, cursor:'ns-resize' }} />
            <div onMouseDown={ev => startResize('bottom', ev)} style={{ position:'absolute', bottom:-5, left:0, right:0, height:11, cursor:'ns-resize' }} />
          </div>
        )
      })()}
      {isToday && (() => {
        const now = new Date(); const nowMin = now.getHours()*60+now.getMinutes()
        return <div style={{ position:'absolute', left:0, right:0, top:nowMin, height:2, background:'#F97316', zIndex:5, pointerEvents:'none' }}><div style={{ position:'absolute', left:-4, top:-4, width:10, height:10, borderRadius:'50%', background:'#FF6B35' }} /></div>
      })()}
      <div ref={ghostRef} style={{ position:'absolute', left:4, right:4, borderRadius:6, zIndex:50, pointerEvents:'none', background:'rgba(123,97,255,0.2)', border:'2px dashed #FF6B35', padding:'4px 8px', fontSize:12, fontWeight:600, color:'#FF6B35', display:'none' }} />
    </div>
  )
}

// ── Day view ───────────────────────────────────────────────────────────────
export function DayView({ cursor, today, eventsFor, allDayFor, onEventClick, onDragCreate, draft, onDraftResize, onEventMove, onMovingChange }: {
  cursor: Date; today: string
  eventsFor: (ymd: string) => CalEvent[]
  allDayFor:  (ymd: string) => CalEvent[]
  onEventClick: (evt: CalEvent) => void
  onDragCreate: (ymd: string, start: string, end: string) => void
  draft?: CalDraft | null
  onDraftResize?: (start: string, end: string) => void
  onEventMove?: (id: string, date: string, start: string, end: string) => void
  onMovingChange?: (moving: boolean) => void
}) {
  const ymd = toYMD(cursor); const isToday = ymd === today
  const dowIdx = (cursor.getDay() + 6) % 7
  const dayEvts = eventsFor(ymd); const allDay = allDayFor(ymd)
  const layout = layoutEvents(dayEvts)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [move, setMove] = useState<{ evt: CalEvent; dur: number; startMin: number; mx: number; my: number } | null>(null)

  useEffect(() => {
    if (bodyRef.current) {
      const firstEvt = [...dayEvts].sort((a,b) => a.start.localeCompare(b.start))[0]
      bodyRef.current.scrollTop = firstEvt ? Math.max(0, timeToMin(firstEvt.start) - 60) : 6*60-30
    }
  }, [cursor])

  // §6: перенос по времени в пределах дня (день фиксирован)
  function beginMove(evt: CalEvent, e: React.MouseEvent) {
    if (evt.source !== 'event' || e.button !== 0) { if (e.button === 0) onEventClick(evt); return }
    e.preventDefault(); e.stopPropagation()
    const sx = e.clientX, sy = e.clientY
    const dur = timeToMin(evt.end) - timeToMin(evt.start)
    let activated = false
    const calcMin = (cy: number) => {
      const el = bodyRef.current!; const raw = cy - el.getBoundingClientRect().top + el.scrollTop
      return Math.max(0, Math.min(1440 - dur, snapTo15(raw)))
    }
    function onMove(mv: MouseEvent) {
      if (!activated && Math.abs(mv.clientX - sx) + Math.abs(mv.clientY - sy) < 5) return
      if (!activated) { activated = true; onMovingChange?.(true) }
      setMove({ evt, dur, startMin: calcMin(mv.clientY), mx: mv.clientX, my: mv.clientY })
    }
    function onUp(mu: MouseEvent) {
      document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp)
      if (!activated) { onEventClick(evt); return }
      onMovingChange?.(false)
      const s = calcMin(mu.clientY); setMove(null)
      onEventMove?.(evt.id, ymd, minToTime(s), minToTime(s + dur))
    }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
      <div style={{ background:'var(--surface-1)', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
        <div style={{ padding:'12px 24px', display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ fontSize:22, fontWeight:700, color: isToday ? '#FF6B35' : 'var(--text-1)' }}>{cursor.getDate()} {MONTHS_RU_GEN[cursor.getMonth()]}</div>
          <div style={{ fontSize:14, color:'var(--text-3)', fontWeight:400 }}>{WEEKDAYS_F[dowIdx]}{isToday ? ' · Сегодня' : ''}</div>
        </div>
        {allDay.length > 0 && (
          <div style={{ padding:'4px 24px 8px', display:'flex', flexWrap:'wrap', gap:4 }}>
            {allDay.map(e => (
              <div key={e.id} onClick={() => onEventClick(e)}
                style={{ padding:'2px 10px', borderRadius:4, fontSize:12, fontWeight:500, background:e.color+'22', color:e.color, cursor:'pointer' }}>
                {e.title}
              </div>
            ))}
          </div>
        )}
      </div>
      <div ref={bodyRef} style={{ display:'flex', flex:1, overflowY:'auto' }}>
        <div style={{ width:52, flexShrink:0, borderRight:'1px solid var(--border)', position:'relative', minHeight:1440 }}>
          {Array.from({length:25},(_,h) => (
            <div key={h} style={{ position:'absolute', right:8, top:h*60, fontSize:12, fontWeight:500, color:'var(--text-muted)', transform:'translateY(-50%)', userSelect:'none', whiteSpace:'nowrap' }}>
              {h === 0 ? '' : `${String(h).padStart(2,'0')}:00`}
            </div>
          ))}
        </div>
        <div style={{ flex:1, position:'relative', minHeight:1440 }}>
          <DayColumn ymd={ymd} isToday={isToday} events={dayEvts} layout={layout} wide
            bodyRef={bodyRef} onEventClick={onEventClick} onDragCreate={onDragCreate}
            draft={draft} onDraftResize={onDraftResize} onEventDown={beginMove} />
          {/* §6: подсветка целевого слота */}
          {move && (
            <div style={{ position:'absolute', top:move.startMin, height:Math.max(move.dur,22), left:2, right:RIGHT_GUTTER+2,
              zIndex:45, pointerEvents:'none', boxSizing:'border-box', borderRadius:7,
              border:`2px dashed ${move.evt.color}`, background:move.evt.color+'22', boxShadow:`0 0 0 3px ${move.evt.color}22` }} />
          )}
        </div>
      </div>
      {/* §6: силуэт события у курсора */}
      {move && (
        <div style={{ position:'fixed', left:move.mx+14, top:move.my+14, zIndex:1500, pointerEvents:'none',
          background:move.evt.color, color:'#fff', borderRadius:8, padding:'6px 11px', fontSize:12, fontWeight:700,
          boxShadow:'0 10px 28px rgba(0,0,0,0.45)', maxWidth:220, fontFamily:'Inter,sans-serif' }}>
          <div style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{move.evt.title || 'Событие'}</div>
          <div style={{ fontSize:12, fontWeight:500, opacity:0.9 }}>{minToTime(move.startMin)}–{minToTime(move.startMin + move.dur)}</div>
        </div>
      )}
    </div>
  )
}