import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../stores/auth'
import { api } from '../lib/api'
import { TaskModal, CalendarEventModal } from './TasksPage'
import type { Task } from './TasksPage'
import { DayFillCard } from '../components/DayFillCard'
import { formatName } from '../lib/utils'

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
  meeting: '#8B5CF6', task: '#FF6B35', personal: '#29BF12',
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

  const inp: React.CSSProperties = { width:'100%', background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 11px', color:'var(--text-1)', fontFamily:'Inter,sans-serif', fontSize:13, outline:'none', boxSizing:'border-box' as const }
  const lbl: React.CSSProperties = { fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase' as const, letterSpacing:'1px', marginBottom:6, display:'block' }

  return (
    <div
      onMouseDown={e => { mdRef.current = e.target === e.currentTarget }}
      onMouseUp={e => { if (mdRef.current && e.target === e.currentTarget) onClose() }}
      style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
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
          <button onClick={onClose} style={{ flex:1, fontFamily:'Inter,sans-serif', fontSize:13, fontWeight:600, background:'rgba(255,255,255,0.06)', border:'1px solid var(--border)', color:'var(--text-3)', borderRadius:8, padding:'9px 0', cursor:'pointer' }}>Отмена</button>
          <button onClick={() => { if (title.trim()) createMut.mutate() }} disabled={!title.trim() || createMut.isPending} style={{ flex:2, fontFamily:'Inter,sans-serif', fontSize:13, fontWeight:700, background:'linear-gradient(135deg,#FF6B35,#E8194B)', border:'none', color:'#fff', borderRadius:8, padding:'9px 0', cursor:'pointer', opacity: title.trim() ? 1 : 0.5 }}>
            {createMut.isPending ? '...' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Deadline badge ─────────────────────────────────────────────────────────────
function DeadlineBadge({ days }: { days: number }) {
  const color = days < 0 ? '#E8194B' : days === 0 ? '#FF6B35' : days <= 2 ? '#F59E0B' : 'var(--text-muted)'
  const label = days < 0 ? `просрочено ${Math.abs(days)} д.` : days === 0 ? 'сегодня' : `${days} дн.`
  return (
    <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, background: color+'22', color, whiteSpace:'nowrap' }}>
      {label}
    </span>
  )
}

// ── Row styles ─────────────────────────────────────────────────────────────────
const rowStyle: React.CSSProperties = {
  display:'flex', alignItems:'flex-start', gap:10, padding:'10px 0',
  borderBottom:'1px solid var(--border)', cursor:'pointer',
}

// ── Main ───────────────────────────────────────────────────────────────────────
export function DashboardPage() {
  const currentUser = useAuthStore(s => s.user)
  const qc          = useQueryClient()
  const now         = new Date()
  const todayStr    = toDay(now)
  const dateStr     = now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const [showCreateTask,  setShowCreateTask]  = useState(false)
  const [showCreateEvent, setShowCreateEvent] = useState(false)
  const [editTask,        setEditTask]        = useState<Task | null>(null)
  const [viewEventId,     setViewEventId]     = useState<string | null>(null)
  const [dlThreshold,     setDlThreshold]     = useState<1 | 3 | 7>(7)

  const { data: allTasks = [] } = useQuery<Task[]>({
    queryKey: ['tasks', 'mine'],
    queryFn:  () => api.get('/tasks', { params: { scope: 'mine' } }).then(r => r.data),
    staleTime: 0, refetchOnMount: 'always',
  })

  const { data: todayEvents = [] } = useQuery<ApiEvent[]>({
    queryKey: ['dashboard:events', todayStr],
    queryFn:  () => api.get(`/events?from=${todayStr}&to=${todayStr}`).then(r => r.data),
    staleTime: 0, refetchOnMount: 'always',
  })

  const doneMut = useMutation({
    mutationFn: (id: string) => api.patch(`/tasks/${id}`, { status: 'done' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })

  // Only regular (non-calendar) tasks
  const regularTasks = allTasks.filter(t => !t.calendarEventId)

  const todayTasks = regularTasks.filter(t => {
    if (t.status === 'done') return false
    const started = toDay(t.startDate) <= todayStr
    const notPast = !t.deadline || toDay(t.deadline) >= todayStr
    return started && notPast
  })

  const deadlineTasks = regularTasks
    .filter(t => {
      if (!t.deadline || t.status === 'done') return false
      const days = daysDiff(t.deadline)
      return days <= dlThreshold
    })
    .sort((a, b) => a.deadline!.localeCompare(b.deadline!))

  const sortedEvents = [...todayEvents].sort((a, b) => a.startTime.localeCompare(b.startTime))

  const card: React.CSSProperties = {
    background: 'var(--surface-1)', border: '1px solid var(--border)',
    borderRadius: 14, padding: '20px 24px', flex: 1, minWidth: 260,
    display: 'flex', flexDirection: 'column',
  }
  const colTitle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 14,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    flexShrink: 0,
  }
  const addBtn: React.CSSProperties = {
    background: 'none', border: 'none', color: 'var(--text-muted)',
    cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px',
    borderRadius: 4, fontFamily: 'Inter,sans-serif',
  }
  const emptyText: React.CSSProperties = {
    fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 0',
  }

  return (
    <div style={{ padding: '40px 48px', display: 'flex', flexDirection: 'column', gap: 32, overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
      <div>
        <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-1)', textTransform: 'capitalize' }}>{dateStr}</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
          {currentUser?.name ? `Добро пожаловать, ${formatName(currentUser.name).split(' ')[0]}` : 'Добро пожаловать'}
        </div>
      </div>

      {/* Карточка дня — точка ввода ядра (план/отчёт) прямо с главной */}
      <DayFillCard />

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>

        {/* ── Задачи на сегодня ── */}
        <div style={card}>
          <div style={colTitle}>
            <span>Задачи на сегодня</span>
            <button style={addBtn} title="Новая задача" onClick={() => setShowCreateTask(true)}>+</button>
          </div>
          {todayTasks.length === 0
            ? <div style={emptyText}>Нет активных задач</div>
            : todayTasks.map(t => {
                const isAssignee = t.assignee.id === currentUser?.id
                return (
                  <div
                    key={t.id}
                    style={rowStyle}
                    onClick={() => setEditTask(t)}
                  >
                    <button
                      disabled={!isAssignee || doneMut.isPending}
                      onClick={e => { e.stopPropagation(); if (isAssignee) doneMut.mutate(t.id) }}
                      title={!isAssignee ? 'Только исполнитель может отметить' : 'Отметить выполненной'}
                      style={{ width:18, height:18, borderRadius:5, border:'1.5px solid var(--border)', background:'none', cursor: isAssignee ? 'pointer' : 'default', flexShrink:0, marginTop:1, opacity: isAssignee ? 1 : 0.4 }}
                    />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:'var(--text-1)', lineHeight:1.4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.title}</div>
                      <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:4, flexWrap:'wrap' }}>
                        <span style={{ fontSize:10, padding:'1px 7px', borderRadius:20, background:'rgba(255,255,255,0.04)', border:'1px solid var(--border)', color:'var(--text-muted)', display:'inline-flex', alignItems:'center', gap:3 }}>
                          <span style={{ fontSize:9 }}>◈</span> Не выбран
                        </span>
                        {t.deadline && <DeadlineBadge days={daysDiff(t.deadline)} />}
                      </div>
                    </div>
                  </div>
                )
              })
          }
        </div>

        {/* ── Дедлайны ── */}
        <div style={card}>
          <div style={colTitle}>
            <span>Дедлайны</span>
            <div style={{ display:'flex', gap:4 }}>
              {([1,3,7] as const).map(d => (
                <button
                  key={d}
                  onClick={() => setDlThreshold(d)}
                  style={{ padding:'2px 8px', borderRadius:20, border:`1px solid ${dlThreshold === d ? 'var(--accent-s)' : 'var(--border)'}`, background: dlThreshold === d ? 'rgba(255,107,53,0.15)' : 'none', color: dlThreshold === d ? 'var(--accent-s)' : 'var(--text-muted)', fontFamily:'Inter,sans-serif', fontSize:10, fontWeight:700, cursor:'pointer' }}
                >{d}д</button>
              ))}
            </div>
          </div>
          {deadlineTasks.length === 0
            ? <div style={emptyText}>Нет дедлайнов в ближайшие {dlThreshold} дн.</div>
            : deadlineTasks.map(t => (
                <div key={t.id} style={{ ...rowStyle, alignItems:'center' }} onClick={() => setEditTask(t)}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--text-1)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.title}</div>
                    <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>
                      {new Date(t.deadline!).toLocaleDateString('ru-RU', { day:'numeric', month:'short' })}
                    </div>
                  </div>
                  <DeadlineBadge days={daysDiff(t.deadline!)} />
                </div>
              ))
          }
        </div>

        {/* ── События сегодня ── */}
        <div style={card}>
          <div style={colTitle}>
            <span>События сегодня</span>
            <button style={addBtn} title="Новое событие" onClick={() => setShowCreateEvent(true)}>+</button>
          </div>
          {sortedEvents.length === 0
            ? <div style={emptyText}>Нет событий на сегодня</div>
            : sortedEvents.map(ev => {
                const color  = TYPE_COLOR[ev.type] ?? '#8B5CF6'
                const nowMin = now.getHours() * 60 + now.getMinutes()
                const [sh, sm] = ev.startTime.split(':').map(Number)
                const [eh, em] = ev.endTime.split(':').map(Number)
                const isNow  = nowMin >= sh * 60 + sm && nowMin < eh * 60 + em
                const isPast = nowMin >= eh * 60 + em
                return (
                  <div
                    key={ev.id}
                    style={{ ...rowStyle, opacity: isPast ? 0.5 : 1 }}
                    onClick={() => setViewEventId(ev.id)}
                  >
                    <div style={{ width:3, borderRadius:4, background: color, flexShrink:0, alignSelf:'stretch', minHeight:36 }} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                        <span style={{ fontSize:11, fontWeight:700, color }}>
                          {fmtTime(ev.startTime)}–{fmtTime(ev.endTime)}
                        </span>
                        {isNow && (
                          <span style={{ fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:20, background: color+'33', color }}>СЕЙЧАС</span>
                        )}
                      </div>
                      <div style={{ fontSize:13, fontWeight:600, color:'var(--text-1)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ev.title}</div>
                      {ev.location.length > 0 && (
                        <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>{ev.location[0]}</div>
                      )}
                    </div>
                    <span style={{ fontSize:10, padding:'2px 8px', borderRadius:20, background: color+'18', color, fontWeight:600, flexShrink:0, alignSelf:'flex-start', marginTop:2 }}>
                      {TYPE_LABEL[ev.type] ?? ev.type}
                    </span>
                  </div>
                )
              })
          }
        </div>
      </div>

      {/* Modals */}
      {showCreateTask && (
        <TaskModal
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
          date={todayStr}
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
  )
}
