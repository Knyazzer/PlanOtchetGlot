import React, { useRef, useState } from 'react'
import type { Task } from './types'
import { DAY_W, ROW_H, TOTAL_D, WEEKEND, WDAYS_RU, navBtn, fmtD, addDays, parseD, daysBetween, fmtDisp, toDateStr, taskColor } from './utils'

// ── Gantt chart ────────────────────────────────────────────────────────────────
export function GanttChart({ tasks, onUpdate, onOpenCreate, onEdit, currentUserId, onToast }: {
  tasks: Task[]
  onUpdate: (id: string, patch: Record<string, unknown>) => void
  onOpenCreate: (opts?: { deadline?: string; startDate?: string }) => void
  onEdit: (task: Task) => void
  currentUserId: string
  onToast: (msg: string) => void
}) {
  const [viewStart, setVS] = useState(() => {
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - 3); return d
  })
  const wrapRef  = useRef<HTMLDivElement>(null)
  const listRef  = useRef<HTMLDivElement>(null)
  const ghostRef = useRef<HTMLDivElement>(null)
  const today    = fmtD(new Date())

  const totalW   = TOTAL_D * DAY_W
  const navRange = `${fmtDisp(viewStart)} — ${fmtDisp(addDays(viewStart, TOTAL_D-1))}`

  function dayIdx(date: Date) { return daysBetween(viewStart, date) }
  function onListScroll()    { if (wrapRef.current && listRef.current) wrapRef.current.scrollTop = listRef.current.scrollTop }
  function onWrapperScroll() { if (listRef.current && wrapRef.current) listRef.current.scrollTop = wrapRef.current.scrollTop }

  function startBarDrag(e: React.MouseEvent, task: Task, barEl: HTMLDivElement) {
    e.preventDefault(); e.stopPropagation()

    const HANDLE = 14 // px зона края
    const relX   = e.clientX - barEl.getBoundingClientRect().left
    const isLeft  = relX < HANDLE
    const isRight = relX > barEl.offsetWidth - HANDLE
    const isMid   = !isLeft && !isRight

    const origStartDate = parseD(toDateStr(task.startDate))
    const origDeadline  = task.deadline ? parseD(toDateStr(task.deadline)) : null

    // rawSIdx/rawDIdx — настоящие индексы без клипинга, для drag-вычислений
    const rawSIdx  = dayIdx(origStartDate)
    const rawDIdx  = origDeadline ? dayIdx(origDeadline) : rawSIdx
    // visLeft/visWidth — что сейчас нарисовано на экране (clipped), для DOM-возврата
    const visSIdx  = Math.max(0, rawSIdx)
    const visDIdx  = Math.min(TOTAL_D - 1, origDeadline ? rawDIdx : rawSIdx)
    const origLeft  = visSIdx * DAY_W
    const origWidth = Math.max(DAY_W, (visDIdx - visSIdx + 1) * DAY_W)
    // drag offset от настоящего левого края бара (может быть < 0)
    const truLeft  = rawSIdx * DAY_W

    const startX = e.clientX
    let dDay = 0

    function onMove(mv: MouseEvent) {
      dDay = Math.round((mv.clientX - startX) / DAY_W)
      if (isLeft) {
        const newTruLeft  = truLeft + dDay * DAY_W
        const newTruWidth = (rawDIdx - rawSIdx + 1) * DAY_W - dDay * DAY_W
        // минимальная ширина = 1 день, не даём левому краю заехать за правый
        if (newTruWidth >= DAY_W) {
          barEl.style.left  = newTruLeft + 'px'
          barEl.style.width = newTruWidth + 'px'
        }
      } else if (isRight) {
        const newWidth = origWidth + dDay * DAY_W
        if (newWidth >= DAY_W) barEl.style.width = newWidth + 'px'
      } else {
        // mid: двигаем от настоящей left-позиции (может уйти за левую границу — это нормально)
        barEl.style.left = (truLeft + dDay * DAY_W) + 'px'
      }
    }

    function revert() {
      barEl.style.left  = origLeft + 'px'
      barEl.style.width = origWidth + 'px'
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)

      if (dDay === 0) { revert(); return }

      if (task.assignedBy.id !== currentUserId) {
        revert()
        onToast('Диапазон задачи может менять только её создатель')
        return
      }

      if (isLeft) {
        const newStart = addDays(origStartDate, dDay)
        // не даём левому краю заехать за дедлайн
        if (origDeadline && newStart >= origDeadline) { revert(); return }
        onUpdate(task.id, { startDate: fmtD(newStart) })
      } else if (isRight) {
        const base = origDeadline ?? origStartDate
        const newDeadline = addDays(base, dDay)
        // не даём правому краю уйти раньше startDate
        if (newDeadline < origStartDate) { revert(); return }
        onUpdate(task.id, { deadline: fmtD(newDeadline) })
      } else {
        const patch: Record<string, string> = { startDate: fmtD(addDays(origStartDate, dDay)) }
        if (origDeadline) patch.deadline = fmtD(addDays(origDeadline, dDay))
        onUpdate(task.id, patch)
      }
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  function startCreateDrag(e: React.MouseEvent, afterTaskIdx: number) {
    if ((e.target as HTMLElement).closest('[data-bar]')) return
    e.preventDefault()
    const wrapEl = wrapRef.current; if (!wrapEl) return
    const wrapRect = wrapEl.getBoundingClientRect()
    const startXRel = e.clientX - wrapRect.left + wrapEl.scrollLeft
    let endDay = Math.floor(startXRel / DAY_W)

    if (ghostRef.current) {
      ghostRef.current.style.top    = (afterTaskIdx * ROW_H + 10) + 'px'
      ghostRef.current.style.left   = (endDay * DAY_W) + 'px'
      ghostRef.current.style.width  = DAY_W + 'px'
      ghostRef.current.style.display = 'block'
    }

    function onMove(mv: MouseEvent) {
      const curXRel = mv.clientX - wrapRect.left + (wrapRef.current?.scrollLeft ?? 0)
      endDay = Math.max(Math.floor(startXRel / DAY_W), Math.floor(curXRel / DAY_W))
      if (ghostRef.current) {
        ghostRef.current.style.left  = (Math.floor(startXRel / DAY_W) * DAY_W) + 'px'
        ghostRef.current.style.width = ((endDay - Math.floor(startXRel / DAY_W) + 1) * DAY_W) + 'px'
      }
    }
    function onUp() {
      if (ghostRef.current) ghostRef.current.style.display = 'none'
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      const startDay = Math.floor(startXRel / DAY_W)
      const startDate = fmtD(addDays(viewStart, startDay))
      const deadline  = fmtD(addDays(viewStart, endDay))
      onOpenCreate({ deadline, startDate })
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const sorted = [...tasks].sort((a, b) => {
    const da = a.deadline ? toDateStr(a.deadline) : ''
    const db = b.deadline ? toDateStr(b.deadline) : ''
    if (!da && !db) return 0
    if (!da) return 1
    if (!db) return -1
    return da.localeCompare(db)
  })

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={{ height:48, flexShrink:0, background:'var(--surface-1)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', padding:'0 20px', gap:12 }}>
        <button onClick={() => setVS(prev => addDays(prev, -7))} style={navBtn}>←</button>
        <div style={{ fontSize:12, color:'var(--text-3)', minWidth:220, textAlign:'center', fontWeight:500 }}>{navRange}</div>
        <button onClick={() => setVS(prev => addDays(prev, 7))} style={navBtn}>→</button>
      </div>

      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        {/* Left panel */}
        <div style={{ width:240, flexShrink:0, background:'var(--surface-1)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={{ height:36, borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', padding:'0 16px', flexShrink:0 }}>
            <span style={{ fontSize:12, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.8px', color:'var(--text-muted)' }}>Задачи</span>
          </div>
          <div ref={listRef} onScroll={onListScroll} style={{ flex:1, overflowY:'auto', overflowX:'hidden' }}>
            {sorted.map(task => {
              const isDone      = task.status === 'done'
              const isCalendar  = !!task.calendarEventId
              const isOutgoing  = !isCalendar && task.assignedBy.id === currentUserId && task.assignee.id !== currentUserId
              const isIncoming  = !isCalendar && task.assignee.id === currentUserId && task.assignedBy.id !== currentUserId
              return (
                <div key={task.id} style={{ height:ROW_H, display:'flex', alignItems:'center', padding:'0 16px', borderBottom:'1px solid var(--border)', gap:10 }}>
                  <div
                    onClick={() => { if (!isCalendar) onUpdate(task.id, { status: isDone ? 'inprogress' : 'done' }) }}
                    style={{ width:16, height:16, borderRadius:4, border:`1.5px solid ${isDone ? '#FF6B35' : 'var(--text-muted)'}`, background: isDone ? '#7B61FF' : 'transparent', cursor: isCalendar ? 'default' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:12, color:'#fff', opacity: isCalendar ? 0.5 : 1 }}>
                    {isDone ? '✓' : ''}
                  </div>
                  {isCalendar
                    ? <span title="Задача из события календаря" style={{ fontSize:14, lineHeight:1, flexShrink:0 }}>📅</span>
                    : (isOutgoing || isIncoming) && (
                        <span
                          title={isOutgoing ? `Поставлено вами → ${task.assignee.name}` : `Поставлено вам ← ${task.assignedBy.name}`}
                          style={{ fontSize:14, lineHeight:1, fontWeight:700, color: isOutgoing ? '#0EA5E9' : '#F59E0B', flexShrink:0 }}
                        >{isOutgoing ? '↑' : '↓'}</span>
                      )
                  }
                  <div
                    onClick={() => onEdit(task)}
                    style={{ fontSize:14, fontWeight:500, color: isDone ? 'var(--text-muted)' : 'var(--text-1)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', flex:1, textDecoration: isDone ? 'line-through' : 'none', cursor:'pointer' }}
                    title="Редактировать"
                  >{task.title}</div>
                </div>
              )
            })}
            <div
              onClick={() => onOpenCreate()}
              style={{ height:ROW_H, display:'flex', alignItems:'center', padding:'0 16px', gap:8, cursor:'pointer', color:'var(--text-muted)', fontSize:12, fontWeight:500, borderBottom:'1px solid var(--border)' }}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)'}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
            >
              <span style={{ fontSize:18, lineHeight:1, marginTop:-1 }}>+</span> Задача
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div ref={wrapRef} onScroll={onWrapperScroll} style={{ flex:1, overflow:'auto', position:'relative' }}>
          <div style={{ position:'relative', minWidth:totalW, display:'flex', flexDirection:'column' }}>
            {/* Header */}
            <div style={{ position:'sticky', top:0, zIndex:50, height:36, background:'var(--surface-1)', borderBottom:'1px solid var(--border)', display:'flex', flexShrink:0, width:totalW }}>
              {Array.from({length:TOTAL_D},(_,i) => {
                const d = addDays(viewStart, i)
                const dow = d.getDay()
                const isWE = WEEKEND.includes(dow)
                const isToday = fmtD(d) === today
                return (
                  <div key={i} style={{ width:DAY_W, flexShrink:0, height:'100%', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:1, borderRight:'1px solid var(--border)', background: isToday ? 'rgba(232,25,75,0.08)' : isWE ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                    <div style={{ fontSize:12, fontWeight:600, color: isToday ? '#F43F5E' : 'var(--text-3)', lineHeight:1 }}>{d.getDate()}</div>
                    <div style={{ fontSize:12, fontWeight:500, color: isToday ? '#F43F5E' : 'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.4px', opacity: isToday ? 0.7 : 1 }}>{WDAYS_RU[dow]}</div>
                  </div>
                )
              })}
            </div>

            {/* Rows + bars */}
            <div style={{ position:'relative', width:totalW, height: Math.max(sorted.length, 1) * ROW_H }}>
              {sorted.length === 0 && (
                <div onMouseDown={e => startCreateDrag(e, 0)} style={{ position:'absolute', inset:0, display:'flex' }}>
                  {Array.from({length:TOTAL_D},(_,i) => {
                    const d = addDays(viewStart,i); const dow = d.getDay()
                    return <div key={i} style={{ width:DAY_W, flexShrink:0, height:'100%', borderRight:'1px solid var(--border)', background: fmtD(d)===today ? 'rgba(232,25,75,0.04)' : WEEKEND.includes(dow) ? 'rgba(255,255,255,0.015)' : 'transparent' }} />
                  })}
                </div>
              )}

              {sorted.map((task, taskIdx) => (
                <div key={task.id} onMouseDown={e => startCreateDrag(e, taskIdx)}
                  style={{ position:'absolute', top:taskIdx*ROW_H, left:0, width:totalW, height:ROW_H, borderBottom:'1px solid var(--border)', display:'flex' }}>
                  {Array.from({length:TOTAL_D},(_,i) => {
                    const d = addDays(viewStart,i); const dow = d.getDay()
                    return <div key={i} style={{ width:DAY_W, flexShrink:0, height:'100%', borderRight:'1px solid var(--border)', background: fmtD(d)===today ? 'rgba(232,25,75,0.04)' : WEEKEND.includes(dow) ? 'rgba(255,255,255,0.015)' : 'transparent' }} />
                  })}
                </div>
              ))}

              {/* Today line */}
              {(() => {
                const idx = dayIdx(parseD(today))
                if (idx < 0 || idx >= TOTAL_D) return null
                return (
                  <div style={{ position:'absolute', top:0, bottom:0, left: idx*DAY_W + DAY_W/2 - 1, width:2, background:'linear-gradient(180deg,#F43F5E,rgba(232,25,75,0.2))', zIndex:30, pointerEvents:'none', borderRadius:1 }}>
                    <div style={{ position:'absolute', top:-3, left:-4, width:10, height:10, background:'#F43F5E', borderRadius:'50%' }} />
                  </div>
                )
              })()}

              {/* Ghost */}
              <div ref={ghostRef} style={{ position:'absolute', height:28, top:10, borderRadius:6, background:'rgba(123,97,255,0.4)', border:'2px dashed #FF6B35', pointerEvents:'none', zIndex:150, display:'none' }} />

              {/* Deadline bars */}
              {sorted.map((task, taskIdx) => {
                const deadlineStr = toDateStr(task.deadline)
                if (!deadlineStr) return null

                const rawSIdx = dayIdx(parseD(toDateStr(task.startDate)))
                const rawDIdx = dayIdx(parseD(deadlineStr))

                // бар полностью вне видимой области
                if (rawDIdx < 0 || rawSIdx >= TOTAL_D) return null

                // обрезаем по границам видимой области
                const sIdx = Math.max(0, rawSIdx)
                const dIdx = Math.min(TOTAL_D - 1, rawDIdx)
                const left  = sIdx * DAY_W
                const width = Math.max(DAY_W, (dIdx - sIdx + 1) * DAY_W)

                const color      = taskColor(task.id)
                const isDone     = task.status === 'done'
                const isCalendar = !!task.calendarEventId
                return (
                  <div key={task.id} data-bar="1"
                    onMouseDown={e => { if (!isCalendar) startBarDrag(e, task, e.currentTarget as HTMLDivElement) }}
                    onMouseMove={e => {
                      if (isCalendar) { e.currentTarget.style.cursor = 'default'; return }
                      const HANDLE = 14
                      const relX = e.clientX - e.currentTarget.getBoundingClientRect().left
                      const isEdge = relX < HANDLE || relX > e.currentTarget.offsetWidth - HANDLE
                      e.currentTarget.style.cursor = isEdge ? 'ew-resize' : 'grab'
                    }}
                    style={{ position:'absolute', left, top:taskIdx*ROW_H+8, width, height:ROW_H-16, borderRadius:8, cursor: isCalendar ? 'default' : 'grab', zIndex:20, boxShadow:'0 2px 8px rgba(0,0,0,0.35)', opacity: isDone ? 0.35 : 1, filter: isDone ? 'grayscale(1)' : 'none' }}>
                    {!isCalendar && <>
                      {/* left handle */}
                      <div style={{ position:'absolute', left:0, top:0, bottom:0, width:14, borderRadius:'8px 0 0 8px', background:'rgba(0,0,0,0.25)', display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
                        <div style={{ width:2, height:12, borderRadius:1, background:'rgba(255,255,255,0.5)' }} />
                      </div>
                      {/* right handle */}
                      <div style={{ position:'absolute', right:0, top:0, bottom:0, width:14, borderRadius:'0 8px 8px 0', background:'rgba(0,0,0,0.25)', display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
                        <div style={{ width:2, height:12, borderRadius:1, background:'rgba(255,255,255,0.5)' }} />
                      </div>
                    </>}
                    <div style={{ position:'absolute', inset:0, borderRadius:8, overflow:'hidden', display:'flex', alignItems:'center', gap:4, padding:'0 18px', background: isDone ? 'rgba(100,100,120,0.6)' : `linear-gradient(135deg,${color}ee,${color}88)` }}>
                      {isCalendar
                        ? <span style={{ fontSize:12, flexShrink:0, pointerEvents:'none' }}>📅</span>
                        : (() => {
                            const isOutgoing = task.assignedBy.id === currentUserId && task.assignee.id !== currentUserId
                            const isIncoming = task.assignee.id === currentUserId && task.assignedBy.id !== currentUserId
                            if (!isOutgoing && !isIncoming) return null
                            return (
                              <span
                                title={isOutgoing ? `Поставлено вами → ${task.assignee.name}` : `Поставлено вам ← ${task.assignedBy.name}`}
                                style={{ fontSize:12, lineHeight:1, fontWeight:700, color: isOutgoing ? '#7DD3FC' : '#FCD34D', flexShrink:0, pointerEvents:'none' }}
                              >{isOutgoing ? '↑' : '↓'}</span>
                            )
                          })()
                      }
                      <div style={{ fontSize:12, fontWeight:600, color:'rgba(255,255,255,0.92)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', pointerEvents:'none', textShadow:'0 1px 3px rgba(0,0,0,0.5)' }}>{task.title}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}