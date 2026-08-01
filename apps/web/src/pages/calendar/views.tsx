import { useRef, useEffect } from 'react'
import type { CalEvent } from './types'
import { WEEKDAYS_S, WEEKDAYS_F, MONTHS_RU_GEN, LOCATIONS } from './constants'
import { toYMD, getWeekStart, layoutEvents, timeToMin, minToTime, snapTo15 } from './utils'

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
export function WeekView({ cursor, today, eventsFor, allDayFor, onEventClick, onDragCreate }: {
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
export function DayColumn({ ymd, isToday, events, layout, bodyRef, onEventClick, onDragCreate, style }: {
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
export function DayView({ cursor, today, eventsFor, allDayFor, onEventClick, onDragCreate }: {
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
