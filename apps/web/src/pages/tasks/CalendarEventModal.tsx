import React, { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../stores/auth'
import { api } from '../../lib/api'
import type { CalEventData, Task, TaskUser } from './types'
import { CAL_LOCS, CAL_LOC_IDS, CAL_TYPE_COLOR, CAL_TYPES } from './utils'

export function CalendarEventModal({ eventId, task, onClose, onSaved, onOpenChatWith }: {
  eventId: string
  task?: Task
  onClose: () => void
  onSaved: () => void
  onOpenChatWith?: (userId: string, t: { id: string; title: string; assigneeId: string; assignedById: string }, isSelf: boolean) => void
}) {
  const currentUser = useAuthStore(s => s.user)
  const qc          = useQueryClient()

  const { data: ev, isLoading, isError } = useQuery<CalEventData>({
    queryKey: ['event', eventId],
    queryFn:  () => api.get(`/events/${eventId}`).then(r => r.data),
    retry: 0,
    staleTime: 0,
  })

  const [type,           setType]          = useState('meeting')
  const [title,          setTitle]         = useState('')
  const [date,           setDate]          = useState('')
  const [start,          setStart]         = useState('09:00')
  const [end,            setEnd]           = useState('10:00')
  const [location,       setLocation]      = useState<string[]>([])
  const [vyezdAddr,      setVyezdAddr]     = useState('')
  const [participantIds, setParticipantIds] = useState<string[]>([])
  const [confirmDel,     setConfirmDel]    = useState(false)
  const [pickerOpen,     setPickerOpen]    = useState(false)
  const [memberSearch,   setMemberSearch]  = useState('')
  const pickerRef = useRef<HTMLDivElement>(null)
  const mouseDownOnBackdrop = useRef(false)

  useEffect(() => {
    if (!ev) return
    setType(ev.type)
    setTitle(ev.title)
    setDate(ev.date.slice(0, 10))
    setStart(ev.startTime)
    setEnd(ev.endTime)
    const locIds = ev.location.filter(l => CAL_LOC_IDS.has(l))
    const addr   = ev.location.find(l => !CAL_LOC_IDS.has(l)) ?? ''
    setLocation(locIds)
    setVyezdAddr(addr)
    setParticipantIds(ev.participants.map(p => p.userId))
  }, [ev])

  useEffect(() => {
    if (!pickerOpen) return
    function h(e: MouseEvent) { if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [pickerOpen])

  const { data: members = [] } = useQuery<TaskUser[]>({
    queryKey: ['users:members'],
    queryFn:  () => api.get('/users/members').then(r => r.data),
  })

  const updateMut = useMutation({
    mutationFn: (d: Record<string, unknown>) => api.patch(`/events/${eventId}`, d),
    onSuccess: () => { onSaved(); onClose() },
  })
  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/events/${eventId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      onClose()
    },
  })

  const isAuthor  = ev?.authorId === currentUser?.id || !!currentUser?.isAdmin
  const hasVyezd  = location.includes('vyezd')
  const filteredM = members.filter(m => m.name.toLowerCase().includes(memberSearch.toLowerCase()))
  const selNames  = members.filter(m => participantIds.includes(m.id)).map(m => m.name)

  function submit() {
    if (!title.trim() || start >= end) return
    const loc = [...location, ...(hasVyezd && vyezdAddr.trim() ? [vyezdAddr.trim()] : [])]
    updateMut.mutate({ type, title, date, startTime: start, endTime: end, location: loc, participantIds })
  }

  function toggleLoc(id: string) {
    setLocation(prev => prev.includes(id) ? prev.filter(l => l !== id) : [...prev, id])
    if (id === 'vyezd' && location.includes('vyezd')) setVyezdAddr('')
  }

  const inp: React.CSSProperties = { width:'100%', background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 11px', color:'var(--text-1)', fontFamily:'Inter,sans-serif', fontSize:13, outline:'none', boxSizing:'border-box' }
  const lbl: React.CSSProperties = { fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'1px', marginBottom:6, display:'block' }

  return (
    <div
      onMouseDown={e => { mouseDownOnBackdrop.current = e.target === e.currentTarget }}
      onMouseUp={e => { if (mouseDownOnBackdrop.current && e.target === e.currentTarget) onClose() }}
      style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
    >
      <div onMouseDown={e => e.stopPropagation()}
        style={{ background:'var(--surface-2)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:16, padding:24, width:420, maxWidth:'100%', maxHeight:'calc(100vh - 48px)', overflowY:'auto', boxShadow:'0 24px 64px rgba(0,0,0,0.5)', fontFamily:'Inter,sans-serif' }}
      >
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <div style={{ fontSize:15, fontWeight:700, color:'var(--text-1)', display:'flex', alignItems:'center', gap:8 }}>
            <span>📅</span> {isAuthor ? 'Редактировать событие' : 'Просмотр события'}
          </div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.06)', border:'1px solid var(--border)', color:'var(--text-3)', borderRadius:6, width:28, height:28, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>

        {isLoading ? (
          <div style={{ padding:'32px 0', textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>Загрузка...</div>
        ) : ev ? (<>
          {/* Type */}
          <div style={{ marginBottom:16 }}>
            <span style={lbl}>Тип</span>
            <div style={{ display:'flex', gap:8 }}>
              {CAL_TYPES.map(t => {
                const sel = type === t.value
                const color = CAL_TYPE_COLOR[t.value]
                return (
                  <button key={t.value} onClick={() => isAuthor && setType(t.value)}
                    style={{ flex:1, padding:'7px 0', borderRadius:8, border:`1px solid ${sel ? color : 'var(--border)'}`, background: sel ? color+'22' : 'none', color: sel ? color : 'var(--text-3)', fontFamily:'Inter,sans-serif', fontSize:12, fontWeight: sel ? 700 : 400, cursor: isAuthor ? 'pointer' : 'default' }}>
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Title */}
          <div style={{ marginBottom:14 }}>
            <span style={lbl}>Название</span>
            {isAuthor
              ? <input autoFocus value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit() }} placeholder="Название события" style={inp} />
              : <div style={{ ...inp, color:'var(--text-1)', userSelect:'text' }}>{title}</div>
            }
          </div>

          {/* Author */}
          <div style={{ marginBottom:14 }}>
            <span style={lbl}>Организатор</span>
            <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8, alignItems:'center' }}>
              <div style={{ ...inp, color:'var(--text-3)', userSelect:'none', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ev.author.name}</div>
              {onOpenChatWith && task && (
                <button
                  onClick={() => {
                    onClose()
                    onOpenChatWith(
                      ev.authorId,
                      { id: task.id, title: ev.title, assigneeId: task.assignee.id, assignedById: ev.authorId },
                      ev.authorId === currentUser?.id,
                    )
                  }}
                  style={{ height:38, padding:'0 14px', borderRadius:8, border:'1px solid var(--border)', background:'var(--surface-3)', color:'var(--text-2)', fontFamily:'Inter,sans-serif', fontSize:12, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0 }}
                >Открыть в чате</button>
              )}
            </div>
          </div>

          {/* Date */}
          <div style={{ marginBottom:14 }}>
            <span style={lbl}>Дата</span>
            {isAuthor
              ? <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inp, colorScheme:'dark' }} />
              : <div style={{ ...inp, color:'var(--text-3)' }}>{date}</div>
            }
          </div>

          {/* Time */}
          <div style={{ display:'flex', gap:10, marginBottom:14 }}>
            <div style={{ flex:1 }}>
              <span style={lbl}>Начало</span>
              {isAuthor
                ? <input type="time" value={start} onChange={e => setStart(e.target.value)} style={{ ...inp, colorScheme:'dark' }} />
                : <div style={{ ...inp, color:'var(--text-3)' }}>{start}</div>
              }
            </div>
            <div style={{ flex:1 }}>
              <span style={lbl}>Конец</span>
              {isAuthor
                ? <input type="time" value={end} onChange={e => setEnd(e.target.value)} style={{ ...inp, colorScheme:'dark' }} />
                : <div style={{ ...inp, color:'var(--text-3)' }}>{end}</div>
              }
            </div>
          </div>

          {/* Location */}
          <div style={{ marginBottom: hasVyezd ? 8 : 14 }}>
            <span style={lbl}>Место</span>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {CAL_LOCS.map(loc => {
                const sel = location.includes(loc.id)
                return (
                  <button key={loc.id} onClick={() => isAuthor && toggleLoc(loc.id)}
                    style={{ padding:'5px 12px', borderRadius:20, border:`1px solid ${sel ? '#FF6B35' : 'var(--border)'}`, background: sel ? 'rgba(255,107,53,0.15)' : 'none', color: sel ? '#FF6B35' : 'var(--text-3)', fontFamily:'Inter,sans-serif', fontSize:12, fontWeight: sel ? 600 : 400, cursor: isAuthor ? 'pointer' : 'default' }}>
                    {loc.label}
                  </button>
                )
              })}
            </div>
          </div>
          {hasVyezd && (
            <div style={{ marginBottom:14 }}>
              {isAuthor
                ? <input value={vyezdAddr} onChange={e => setVyezdAddr(e.target.value)} placeholder="Адрес выезда..." style={{ ...inp, fontSize:12 }} />
                : vyezdAddr ? <div style={{ ...inp, color:'var(--text-3)', fontSize:12 }}>{vyezdAddr}</div> : null
              }
            </div>
          )}

          {/* Participants */}
          <div style={{ marginBottom:22 }}>
            <span style={lbl}>Участники</span>
            {isAuthor ? (
              <div ref={pickerRef} style={{ position:'relative' }}>
                <div onClick={() => { setMemberSearch(''); setPickerOpen(o => !o) }}
                  style={{ ...inp, cursor:'pointer', minHeight:38, display:'flex', flexWrap:'wrap', gap:4, alignItems:'center', padding:'6px 10px' }}>
                  {selNames.length === 0
                    ? <span style={{ color:'var(--text-muted)', fontSize:12 }}>Добавить участников...</span>
                    : selNames.map(n => <span key={n} style={{ fontSize:11, padding:'2px 8px', borderRadius:12, background:'rgba(139,92,246,0.2)', color:'#8B5CF6', fontWeight:600 }}>{n}</span>)
                  }
                </div>
                {pickerOpen && (
                  <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:300, background:'var(--surface-1)', border:'1px solid var(--border)', borderRadius:8, marginTop:4, boxShadow:'0 8px 24px rgba(0,0,0,0.4)', overflow:'hidden' }}>
                    <div style={{ padding:'8px 10px', borderBottom:'1px solid var(--border)' }}>
                      <input autoFocus value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder="Поиск..." onMouseDown={e => e.stopPropagation()}
                        style={{ width:'100%', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:6, padding:'6px 8px', color:'var(--text-1)', fontFamily:'Inter,sans-serif', fontSize:12, outline:'none', boxSizing:'border-box' }} />
                    </div>
                    <div style={{ maxHeight:180, overflowY:'auto' }}>
                      {filteredM.map(m => {
                        const sel = participantIds.includes(m.id)
                        return (
                          <div key={m.id} onMouseDown={e => { e.preventDefault(); setParticipantIds(prev => prev.includes(m.id) ? prev.filter(x => x !== m.id) : [...prev, m.id]) }}
                            style={{ padding:'9px 12px', fontSize:13, color:'var(--text-1)', cursor:'pointer', display:'flex', alignItems:'center', gap:8, background: sel ? 'rgba(139,92,246,0.1)' : 'transparent' }}>
                            <div style={{ width:14, height:14, borderRadius:3, border:`1.5px solid ${sel ? '#8B5CF6' : 'var(--text-muted)'}`, background: sel ? '#8B5CF6' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, color:'#fff', flexShrink:0 }}>{sel ? '✓' : ''}</div>
                            {m.name}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                {ev.participants.length === 0
                  ? <span style={{ fontSize:12, color:'var(--text-muted)' }}>Нет участников</span>
                  : [ev.author, ...ev.participants.map(p => p.user)].map(u => (
                      <span key={u.id} style={{ fontSize:11, padding:'3px 10px', borderRadius:12, background:'rgba(139,92,246,0.15)', color:'#8B5CF6', fontWeight:600 }}>{u.name}</span>
                    ))
                }
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display:'flex', gap:8 }}>
            {isAuthor && (
              !confirmDel ? (
                <button onClick={() => setConfirmDel(true)} style={{ flex:1, fontFamily:'Inter,sans-serif', fontSize:13, fontWeight:600, background:'rgba(232,25,75,0.12)', border:'1px solid rgba(232,25,75,0.3)', color:'#E8194B', borderRadius:8, padding:'9px 0', cursor:'pointer' }}>Удалить</button>
              ) : (
                <div style={{ flex:1, display:'flex', gap:6 }}>
                  <button onClick={() => deleteMut.mutate()} style={{ flex:1, fontFamily:'Inter,sans-serif', fontSize:12, fontWeight:700, background:'var(--danger)', border:'none', color:'#fff', borderRadius:8, padding:'9px 0', cursor:'pointer' }}>Да</button>
                  <button onClick={() => setConfirmDel(false)} style={{ flex:1, fontFamily:'Inter,sans-serif', fontSize:12, background:'none', border:'1px solid var(--border)', color:'var(--text-3)', borderRadius:8, padding:'9px 0', cursor:'pointer' }}>Нет</button>
                </div>
              )
            )}
            <button onClick={onClose} style={{ flex:1, fontFamily:'Inter,sans-serif', fontSize:13, fontWeight:600, background:'rgba(255,255,255,0.06)', border:'1px solid var(--border)', color:'var(--text-3)', borderRadius:8, padding:'9px 0', cursor:'pointer' }}>
              {isAuthor ? 'Отмена' : 'Закрыть'}
            </button>
            {isAuthor && (
              <button onClick={submit} disabled={updateMut.isPending} style={{ flex:2, fontFamily:'Inter,sans-serif', fontSize:13, fontWeight:700, background:'linear-gradient(135deg,#FF6B35,#E8194B)', border:'none', color:'#fff', borderRadius:8, padding:'9px 0', cursor:'pointer' }}>
                {updateMut.isPending ? '...' : 'Сохранить'}
              </button>
            )}
          </div>
        </>) : isError ? (
          <div style={{ padding:'32px 0', textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>Событие было удалено или недоступно</div>
        ) : (
          <div style={{ padding:'32px 0', textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>Событие не найдено</div>
        )}
      </div>
    </div>
  )
}
