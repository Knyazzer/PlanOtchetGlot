import React, { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../stores/auth'
import { api } from '../lib/api'
import { TASK_TYPE_OPTIONS, taskTypeMeta, fmtMinutes } from '../lib/taskMeta'
import { formatName } from '../lib/utils'
import { TracksPage, TrackFormModal } from './TracksPage'
import { Hint } from '../components/Hint'

// ── Types ──────────────────────────────────────────────────────────────────────
interface TaskLogEntry {
  id:        string
  action:    string
  meta:      Record<string, string | null> | null
  createdAt: string
  user:      { id: string; name: string }
}

type TaskStatus = 'backlog' | 'inprogress' | 'done'
type View       = 'kanban' | 'table' | 'gantt'
type TaskView   = 'mine' | 'sent'

interface TaskUser { id: string; name: string }

export interface Task {
  id:               string
  title:            string
  description:      string
  status:           TaskStatus
  startDate:        string
  deadline:         string | null
  type:             string
  client:           string | null
  projectId:        string | null
  project:          { id: string; title: string } | null
  divisionId:       string | null
  plannedMinutes:   number | null
  actualMinutes:    number | null
  doneAt:           string | null
  archived:         boolean
  manualOrder:      number | null
  repeatRule:       string | null
  repeatUntil:      string | null
  recurringParentId: string | null
  seenAt:           string | null
  calendarEventId:  string | null
  calendarEventEnd: string | null
  trackId:          string | null
  track:            { id: string; title: string; type: string } | null
  stageId:          string | null
  stage:            { id: string; title: string } | null
  createdAt:        string
  updatedAt:        string
  assignedBy:       TaskUser
  assignee:         TaskUser
}


// ── Constants ──────────────────────────────────────────────────────────────────
const COLS: { id: TaskStatus; label: string; color: string }[] = [
  { id: 'backlog',    label: 'Бэклог',   color: '#464658' },
  { id: 'inprogress', label: 'В работе', color: '#0EA5E9' },
  { id: 'done',       label: 'Готово',   color: '#29BF12' },
]

const TASK_COLORS: Record<string, string> = {}
const COLOR_PALETTE = ['#8B5CF6','#0EA5E9','#FF6B35','#E8194B','#F59E0B','#29BF12']
function taskColor(id: string) {
  if (!TASK_COLORS[id]) {
    const idx = Object.keys(TASK_COLORS).length % COLOR_PALETTE.length
    TASK_COLORS[id] = COLOR_PALETTE[idx]
  }
  return TASK_COLORS[id]
}

const DAY_W   = 40
const ROW_H   = 48
const TOTAL_D = 30
const WEEKEND = [0, 6]
const WDAYS_RU = ['вс','пн','вт','ср','чт','пт','сб']
const MONTHS_S = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек']

// ── Helpers ────────────────────────────────────────────────────────────────────
function toDateStr(iso: string | null | undefined): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

function fmtD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate()+n); return r }
function parseD(s: string) { const [y,m,d] = s.split('-').map(Number); return new Date(y,m-1,d) }
function fmtDisp(d: Date) { return `${d.getDate()} ${MONTHS_S[d.getMonth()]} ${d.getFullYear()}` }
function daysBetween(a: Date, b: Date) { return Math.round((b.getTime()-a.getTime())/86400000) }

const inputStyle: React.CSSProperties = {
  background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:8,
  color:'var(--text-1)', fontSize:13, padding:'8px 10px', outline:'none', width:'100%', boxSizing:'border-box',
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
      <span style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.5px', display:'flex', alignItems:'center' }}>
        {label}
        {hint && <Hint text={hint} />}
      </span>
      {children}
    </div>
  )
}

// ── Date Picker ───────────────────────────────────────────────────────────────
const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
const DAYS_RU   = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']

function DatePicker({ value, onChange, min }: { value: string; onChange: (v: string) => void; min?: string }) {
  const today    = new Date()
  const initDate = value ? parseD(value) : today
  const [year,   setYear]   = useState(initDate.getFullYear())
  const [month,  setMonth]  = useState(initDate.getMonth())
  const [open,   setOpen]   = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // sync calendar head when value changes externally
  useEffect(() => {
    if (value) { const d = parseD(value); setYear(d.getFullYear()); setMonth(d.getMonth()) }
  }, [value])

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function nav(dir: number) {
    let m = month + dir, y = year
    if (m > 11) { m = 0; y++ }
    if (m < 0)  { m = 11; y-- }
    setMonth(m); setYear(y)
  }

  function pick(d: number) {
    const s = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    if (min && s < min) return
    onChange(s)
    setOpen(false)
  }

  const displayVal = value
    ? (() => { const d = parseD(value); return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}` })()
    : null

  const firstDow = (() => { const d = new Date(year, month, 1).getDay(); return d === 0 ? 6 : d - 1 })()
  const daysInMonth = new Date(year, month+1, 0).getDate()

  return (
    <div ref={ref} style={{ position:'relative' }}>
      <div
        onMouseDown={() => setOpen(o => !o)}
        style={{
          display:'flex', alignItems:'center', gap:8,
          background:'var(--surface-2)', border:`1px solid ${open ? 'rgba(255,107,53,.5)' : 'var(--border)'}`,
          borderRadius:8, padding:'8px 10px', cursor:'pointer',
          transition:'border-color .15s', userSelect:'none', fontSize:13,
          color: displayVal ? 'var(--text-1)' : 'var(--text-muted)',
        }}
      >
        <span style={{ color:'var(--text-muted)', fontSize:14 }}>📅</span>
        <span style={{ flex:1 }}>{displayVal ?? 'Выбрать дату'}</span>
        {displayVal && (
          <span
            onMouseDown={e => { e.stopPropagation(); onChange(''); }}
            style={{ color:'var(--text-muted)', fontSize:11, padding:'2px 4px', borderRadius:4, lineHeight:1 }}
          >✕</span>
        )}
      </div>

      {open && (
        <div style={{
          position:'absolute', top:'calc(100% + 4px)', left:0, zIndex:400,
          background:'var(--surface-1)', border:'1px solid var(--border)',
          borderRadius:12, boxShadow:'0 8px 32px rgba(0,0,0,.4)',
          padding:16, minWidth:260,
          animation:'dropDown .15s ease',
        }}>
          {/* header */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
            <button onMouseDown={e => { e.preventDefault(); nav(-1) }} style={{ width:26, height:26, borderRadius:6, background:'var(--surface-2)', border:'1px solid var(--border)', color:'var(--text-2)', cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center' }}>‹</button>
            <span style={{ fontSize:13, fontWeight:700, color:'var(--text-1)' }}>{MONTHS_RU[month]} {year}</span>
            <button onMouseDown={e => { e.preventDefault(); nav(1) }} style={{ width:26, height:26, borderRadius:6, background:'var(--surface-2)', border:'1px solid var(--border)', color:'var(--text-2)', cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center' }}>›</button>
          </div>

          {/* grid */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 34px)', gap:2 }}>
            {DAYS_RU.map(d => (
              <div key={d} style={{ width:34, height:24, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'var(--text-muted)', letterSpacing:'.5px' }}>{d}</div>
            ))}
            {Array.from({ length: firstDow }, (_, i) => <div key={'e'+i} style={{ width:34, height:34 }} />)}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const d = i + 1
              const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
              const isToday   = d === today.getDate() && month === today.getMonth() && year === today.getFullYear()
              const isSel     = ds === value
              const isDisabled = min ? ds < min : false
              return (
                <div
                  key={d}
                  onMouseDown={e => { e.preventDefault(); pick(d) }}
                  style={{
                    width:34, height:34, borderRadius:8,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:13, cursor: isDisabled ? 'default' : 'pointer',
                    fontWeight: isToday || isSel ? 700 : 400,
                    color: isDisabled ? 'var(--text-muted)' : isSel ? '#fff' : isToday ? 'var(--text-1)' : 'var(--text-2)',
                    background: isSel ? 'linear-gradient(135deg,#FF6B35,#E8194B)' : 'transparent',
                    opacity: isDisabled ? 0.3 : 1,
                    transition:'all .1s',
                  }}
                  onMouseEnter={e => { if (!isSel && !isDisabled) (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-2)' }}
                  onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLDivElement).style.background = isSel ? 'linear-gradient(135deg,#FF6B35,#E8194B)' : 'transparent' }}
                >{d}</div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Task history ──────────────────────────────────────────────────────────────
const ACTION_LABELS: Record<string, (meta: Record<string, string | null>) => string> = {
  created:             m => `Задача создана → ${m.assigneeName ?? ''}${m.deadline ? `, дедлайн ${m.deadline}` : ''}`,
  status_changed:      m => `Статус: ${m.from} → ${m.to}`,
  assignee_changed:    m => `Исполнитель: ${m.from} → ${m.to}`,
  start_changed:       m => `Начало: ${m.from} → ${m.to}`,
  deadline_changed:    m => m.to ? `Дедлайн: ${m.from ?? 'не задан'} → ${m.to}` : `Дедлайн снят (был ${m.from ?? '—'})`,
  title_changed:       m => `Название изменено → «${m.title}»`,
  description_changed: () => `Описание обновлено`,
}

function fmtTs(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getDate()} ${MONTHS_S[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface HistoryGroup {
  action:  string
  entries: TaskLogEntry[]
}

function groupEntries(entries: TaskLogEntry[]): HistoryGroup[] {
  const groups: HistoryGroup[] = []
  for (const e of entries) {
    const last = groups[groups.length - 1]
    if (last && last.action === e.action) {
      last.entries.push(e)
    } else {
      groups.push({ action: e.action, entries: [e] })
    }
  }
  return groups
}

function HistoryGroupRow({ group, isFirst, isLast, hasLineAfter }: { group: HistoryGroup; isFirst: boolean; isLast: boolean; hasLineAfter: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const isCollapsed = group.entries.length > 1
  // свёрнуто: показываем первую и последнюю запись группы
  const first = group.entries[0]
  const last  = group.entries[group.entries.length - 1]

  const dotBg = isFirst
    ? 'linear-gradient(135deg,#FF6B35,#E8194B)'
    : isLast
      ? 'linear-gradient(135deg,#29BF12,#0EA5E9)'
      : 'var(--surface-3)'

  return (
    <div style={{ display:'flex', gap:12, position:'relative', paddingBottom: hasLineAfter ? 16 : 0 }}>
      {hasLineAfter && (
        <div style={{ position:'absolute', left:15, top:28, bottom:0, width:2, background:'var(--border)' }} />
      )}
      <div
        style={{ width:30, height:30, borderRadius:'50%', background: dotBg, border:'2px solid var(--border)', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:isCollapsed ? 10 : 12, fontWeight:700, marginTop:2, zIndex:1, cursor: isCollapsed ? 'pointer' : 'default' }}
        onClick={() => isCollapsed && setExpanded(x => !x)}
      >
        {isFirst ? '★' : isLast ? '●' : isCollapsed ? group.entries.length : '·'}
      </div>

      <div style={{ flex:1, paddingTop:4 }}>
        {/* свёрнутая группа */}
        {isCollapsed && !expanded && (
          <div>
            <div style={{ fontSize:13, color:'var(--text-1)', lineHeight:1.4 }}>
              {ACTION_LABELS[last.action]?.(last.meta ?? {}) ?? last.action}
            </div>
            <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>
              {formatName(last.user.name)} · {fmtTs(last.createdAt)}
            </div>
            <button
              onClick={() => setExpanded(true)}
              style={{ marginTop:5, background:'none', border:'none', padding:0, cursor:'pointer', color:'var(--text-muted)', fontSize:11, fontFamily:'Inter,sans-serif' }}
            >
              Показать все {group.entries.length} изменения ›
            </button>
          </div>
        )}

        {/* развёрнутая группа или одиночная запись */}
        {(!isCollapsed || expanded) && (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {group.entries.map((e, ei) => (
              <div key={e.id}>
                <div style={{ fontSize:13, color:'var(--text-1)', lineHeight:1.4 }}>
                  {ACTION_LABELS[e.action]?.(e.meta ?? {}) ?? e.action}
                </div>
                <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>
                  {formatName(e.user.name)} · {fmtTs(e.createdAt)}
                </div>
                {ei < group.entries.length - 1 && (
                  <div style={{ height:1, background:'var(--border)', margin:'8px 0 0' }} />
                )}
              </div>
            ))}
            {expanded && isCollapsed && (
              <button
                onClick={() => setExpanded(false)}
                style={{ background:'none', border:'none', padding:0, cursor:'pointer', color:'var(--text-muted)', fontSize:11, fontFamily:'Inter,sans-serif', textAlign:'left' }}
              >
                Свернуть ‹
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function TaskHistory({ entries, isLoading }: { entries: TaskLogEntry[]; isLoading: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [entries])

  if (isLoading) return (
    <div style={{ padding:'32px 0', textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>Загрузка...</div>
  )
  if (entries.length === 0) return (
    <div style={{ padding:'32px 0', textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>История пуста</div>
  )
  const groups = groupEntries(entries)
  return (
    <div ref={scrollRef} style={{ display:'flex', flexDirection:'column', gap:0, overflowY:'auto', maxHeight:340 }}>
      {groups.map((g, i) => (
        <HistoryGroupRow
          key={g.entries[0].id}
          group={g}
          isFirst={i === 0}
          isLast={i === groups.length - 1}
          hasLineAfter={i < groups.length - 1}
        />
      ))}
    </div>
  )
}

// ── Task Modal (create + edit) ─────────────────────────────────────────────────
interface TaskModalProps {
  onClose:            () => void
  onDone:             () => void
  defaultDeadline?:   string
  defaultStartDate?:  string
  defaultTrackId?:    string
  defaultTrackTitle?: string
  defaultStageId?:    string
  editTask?:          Task
  onOpenChatWith?:    (userId: string, task: { id: string; title: string; assigneeId: string; assignedById: string }, isSelf: boolean) => void
}

export function TaskModal({ onClose, onDone, defaultDeadline, defaultStartDate, defaultTrackId, defaultTrackTitle, defaultStageId, editTask, onOpenChatWith }: TaskModalProps) {
  const currentUser = useAuthStore(s => s.user)
  const qc = useQueryClient()
  const isEdit = !!editTask

  const [tab,          setTab]          = useState<'task' | 'history'>('task')
  const [title,        setTitle]        = useState(editTask?.title ?? '')
  const [description,  setDescription]  = useState(editTask?.description ?? '')
  const [assigneeId,   setAssigneeId]   = useState(editTask?.assignee.id ?? currentUser?.id ?? '')
  const [assigneeName, setAssigneeName] = useState(editTask?.assignee.name ?? currentUser?.name ?? '')
  const [deadline,     setDeadline]     = useState(editTask ? toDateStr(editTask.deadline) : (defaultDeadline ?? fmtD(addDays(new Date(), 3))))
  const [trackId,      setTrackId]      = useState<string | null>(editTask?.trackId ?? defaultTrackId ?? null)
  const [stageId,      setStageId]      = useState<string | null>(editTask?.stageId ?? defaultStageId ?? null)
  const [taskType,     setTaskType]     = useState(editTask?.type ?? 'task')
  const [client,       setClient]       = useState(editTask?.client ?? '')
  const [plannedMin,   setPlannedMin]   = useState<string>(editTask?.plannedMinutes != null ? String(editTask.plannedMinutes) : '')
  const [actualMin,    setActualMin]    = useState<string>(editTask?.actualMinutes != null ? String(editTask.actualMinutes) : '')
  const [projectId,    setProjectId]    = useState<string | null>(editTask?.projectId ?? null)
  const [repeatRule,   setRepeatRule]   = useState<string>('')   // только при создании
  const [repeatUntil,  setRepeatUntil]  = useState<string>('')
  const [members,      setMembers]      = useState<TaskUser[]>([])
  const [showPicker,   setShowPicker]   = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [confirmDel,   setConfirmDel]   = useState(false)
  const mouseDownOnBackdrop = useRef(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  const trackTitle = editTask?.track?.title ?? defaultTrackTitle ?? null

  const { data: logEntries = [], isLoading: logLoading } = useQuery<TaskLogEntry[]>({
    queryKey: ['taskLog', editTask?.id],
    queryFn:  () => api.get(`/tasks/${editTask!.id}/log`).then(r => r.data),
    enabled:  isEdit && tab === 'history',
    staleTime: 0,
  })

  const assignedByName = isEdit ? editTask.assignedBy.name : (currentUser?.name ?? '—')
  const isCalendarTask = isEdit && !!editTask.calendarEventId
  const isReadOnly = isCalendarTask || (isEdit && editTask.assignedBy.id !== currentUser?.id && !currentUser?.isAdmin)
  const canChangeAssignee = !isEdit || editTask.assignedBy.id === currentUser?.id || !!currentUser?.isAdmin

  useEffect(() => {
    api.get('/users/members').then(r => setMembers(r.data)).catch(() => {})
  }, [])

  // подсказки клиентов (строки из справочника) и проекты — для полей планирования
  const { data: clientOptions = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['clients'],
    queryFn: () => api.get('/clients').then(r => r.data),
    staleTime: 1000 * 60 * 5,
  })
  const { data: projectOptions = [] } = useQuery<Array<{ id: string; title: string }>>({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects').then(r => r.data),
    staleTime: 1000 * 60 * 5,
  })

  useEffect(() => {
    if (!showPicker) return
    function handler(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        closePicker()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showPicker])

  const planningPayload = () => ({
    type: taskType,
    client: client.trim() || null,
    projectId,
    plannedMinutes: plannedMin !== '' ? Number(plannedMin) : null,
    actualMinutes: actualMin !== '' ? Number(actualMin) : null,
  })
  const saveMutation = useMutation({
    mutationFn: () => isEdit
      ? api.patch(`/tasks/${editTask.id}`, { title: title.trim(), description, assigneeId, deadline: deadline || null, trackId, stageId, ...planningPayload() })
      : api.post('/tasks', {
          title: title.trim(), description, assigneeId, deadline: deadline || undefined, trackId, stageId,
          ...(defaultStartDate ? { startDate: defaultStartDate } : {}),
          ...planningPayload(),
          ...(repeatRule && repeatUntil ? { repeatRule, repeatUntil } : {}),
        }),
    onSuccess: () => {
      onDone()
      if (isEdit) {
        qc.invalidateQueries({ queryKey: ['taskLog', editTask.id] })
        setTab('history')
      } else {
        onClose()
      }
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/tasks/${editTask!.id}`),
    onSuccess: () => { onDone(); onClose() },
  })

  function submit() {
    if (!title.trim() || !assigneeId) return
    saveMutation.mutate()
  }

  const filteredMembers = members.filter(m =>
    m.name.toLowerCase().includes(pickerSearch.toLowerCase())
  )

  function openPicker() {
    setPickerSearch('')
    setShowPicker(true)
  }

  function closePicker() {
    setShowPicker(false)
    setPickerSearch('')
  }

  const Picker = (
    <div ref={pickerRef} style={{ position:'relative' }}>
      <div
        onClick={() => showPicker ? closePicker() : openPicker()}
        style={{ ...inputStyle, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between' }}
      >
        <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{assigneeName || '—'}</span>
        <span style={{ fontSize:10, color:'var(--text-muted)', marginLeft:6, flexShrink:0 }}>{showPicker ? '▴' : '▾'}</span>
      </div>
      {showPicker && (
        <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:300, background:'var(--surface-1)', border:'1px solid var(--border)', borderRadius:8, marginTop:4, boxShadow:'0 8px 24px rgba(0,0,0,0.4)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={{ padding:'8px 10px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
            <input
              autoFocus
              value={pickerSearch}
              onChange={e => setPickerSearch(e.target.value)}
              placeholder="Поиск..."
              onMouseDown={e => e.stopPropagation()}
              style={{ ...inputStyle, padding:'6px 8px', fontSize:12 }}
            />
          </div>
          <div style={{ maxHeight:180, overflowY:'auto' }}>
            {filteredMembers.length === 0 && (
              <div style={{ padding:'12px', fontSize:12, color:'var(--text-muted)', textAlign:'center' }}>Не найдено</div>
            )}
            {filteredMembers.map(m => (
              <div key={m.id}
                onMouseDown={e => { e.preventDefault(); setAssigneeId(m.id); setAssigneeName(m.name); closePicker() }}
                style={{ padding:'9px 12px', fontSize:13, color:'var(--text-1)', cursor:'pointer', background: m.id === assigneeId ? 'rgba(255,107,53,0.12)' : 'transparent' }}
                onMouseEnter={e => { if (m.id !== assigneeId) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.05)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = m.id === assigneeId ? 'rgba(255,107,53,0.12)' : 'transparent' }}
              >{m.name}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  return (
    <>
    <div
      onMouseDown={e => { mouseDownOnBackdrop.current = e.target === e.currentTarget }}
      onMouseUp={e => { if (mouseDownOnBackdrop.current && e.target === e.currentTarget) onClose() }}
      style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
    >
      <div onMouseDown={e => e.stopPropagation()} style={{ background:'var(--surface-1)', border:'1px solid var(--border)', borderRadius:16, padding:'28px 28px 24px', width:'100%', maxWidth:560, maxHeight:'calc(100vh - 48px)', display:'flex', flexDirection:'column', gap:16, overflowY:'auto' }}>

        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ fontSize:16, fontWeight:700, color:'var(--text-1)', display:'flex', alignItems:'center', gap:8 }}>
            {isCalendarTask && <span title="Задача из события">📅</span>}
            {isEdit ? (isReadOnly ? 'Просмотр задачи' : 'Редактировать задачу') : 'Новая задача'}
          </div>
          {isEdit && (
            <div style={{ display:'flex', background:'var(--surface-2)', borderRadius:8, padding:3, gap:2 }}>
              {(['task','history'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  padding:'4px 12px', borderRadius:6, border:'none', cursor:'pointer',
                  background: tab === t ? 'var(--surface-1)' : 'none',
                  color: tab === t ? 'var(--text-1)' : 'var(--text-muted)',
                  fontFamily:'Inter,sans-serif', fontSize:12, fontWeight: tab === t ? 600 : 400,
                  boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,0.2)' : 'none',
                }}>
                  {t === 'task' ? 'Задача' : 'История'}
                </button>
              ))}
            </div>
          )}
        </div>

        {tab === 'history' && (
          <TaskHistory entries={logEntries} isLoading={logLoading} />
        )}

        {tab === 'task' && (<>
          <Field label="Название">
            {isReadOnly
              ? <div style={{ ...inputStyle, color:'var(--text-1)', userSelect:'text' }}>{title || '—'}</div>
              : <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submit() }}
                  placeholder="Что нужно сделать?" style={inputStyle} />
            }
          </Field>

          <Field label="Описание">
            {isReadOnly
              ? <div style={{ ...inputStyle, minHeight:80, whiteSpace:'pre-wrap', wordBreak:'break-word', color: description ? 'var(--text-1)' : 'var(--text-muted)', userSelect:'text' }}>{description || 'Нет описания'}</div>
              : <textarea
                  ref={el => {
                    if (!el) return
                    el.style.height = 'auto'
                    const h = Math.min(el.scrollHeight, 300)
                    el.style.height = h + 'px'
                    el.style.overflowY = el.scrollHeight > 300 ? 'auto' : 'hidden'
                  }}
                  value={description}
                  onChange={e => {
                    setDescription(e.target.value)
                    e.target.style.height = 'auto'
                    const h = Math.min(e.target.scrollHeight, 300)
                    e.target.style.height = h + 'px'
                    e.target.style.overflowY = e.target.scrollHeight > 300 ? 'auto' : 'hidden'
                  }}
                  placeholder="Подробности..."
                  style={{ ...inputStyle, resize:'none', fontFamily:'inherit', overflowY:'hidden', minHeight:80 }}
                />
            }
          </Field>

          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:12, alignItems:'flex-end' }}>
              <Field label="Кто поставил">
                <div style={{ ...inputStyle, color:'var(--text-3)', userSelect:'none', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{assignedByName}</div>
              </Field>
              <button
                disabled={!isEdit || !onOpenChatWith}
                onClick={() => {
                  if (!isEdit || !onOpenChatWith) return
                  const targetId = editTask.assignedBy.id
                  onClose()
                  onOpenChatWith(targetId, { id: editTask.id, title: editTask.title, assigneeId: editTask.assignee.id, assignedById: editTask.assignedBy.id }, targetId === currentUser?.id)
                }}
                style={{ height:36, padding:'0 14px', borderRadius:8, border:'1px solid var(--border)', background:'var(--surface-3)', color:'var(--text-2)', fontFamily:'Inter,sans-serif', fontSize:12, cursor: (isEdit && onOpenChatWith) ? 'pointer' : 'default', whiteSpace:'nowrap', flexShrink:0, opacity: (isEdit && onOpenChatWith) ? 1 : 0.35 }}
              >Открыть в чате</button>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:12, alignItems:'flex-end' }}>
              <Field label="Исполнитель" hint="Кто выполняет задачу. Исполнитель получит уведомление о назначении. По умолчанию — вы сами.">
                {(!isReadOnly && canChangeAssignee)
                  ? Picker
                  : <div style={{ ...inputStyle, color:'var(--text-3)', userSelect:'none', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{assigneeName}</div>
                }
              </Field>
              <button
                disabled={!isEdit || !onOpenChatWith}
                onClick={() => {
                  if (!isEdit || !onOpenChatWith) return
                  const targetId = editTask.assignee.id
                  onClose()
                  onOpenChatWith(targetId, { id: editTask.id, title: editTask.title, assigneeId: editTask.assignee.id, assignedById: editTask.assignedBy.id }, targetId === currentUser?.id)
                }}
                style={{ height:36, padding:'0 14px', borderRadius:8, border:'1px solid var(--border)', background:'var(--surface-3)', color:'var(--text-2)', fontFamily:'Inter,sans-serif', fontSize:12, cursor: (isEdit && onOpenChatWith) ? 'pointer' : 'default', whiteSpace:'nowrap', flexShrink:0, opacity: (isEdit && onOpenChatWith) ? 1 : 0.35 }}
              >Открыть в чате</button>
            </div>
          </div>

          {/* — Планирование (поля донора: тип 94%, клиент 95%, минуты 83/80%) — */}
          <Field label="Тип" hint="Влияет на иконку в ленте и фильтры. «Встреча» автоматически создаёт событие в Календаре.">
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {TASK_TYPE_OPTIONS.map(o => (
                <button key={o.value} disabled={isReadOnly}
                  onClick={() => !isReadOnly && setTaskType(o.value)}
                  style={{
                    padding:'5px 12px', borderRadius:14, fontFamily:'Inter,sans-serif', fontSize:12,
                    cursor: isReadOnly ? 'default' : 'pointer', fontWeight: taskType === o.value ? 700 : 400,
                    border: `1px solid ${taskType === o.value ? o.color : 'var(--border)'}`,
                    background: taskType === o.value ? `${o.color}22` : 'var(--surface-3)',
                    color: taskType === o.value ? o.color : 'var(--text-3)',
                  }}>{o.label}</button>
              ))}
            </div>
          </Field>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Field label="Клиент" hint="Необязательно. Используется в Аналитике и при фильтрации задач по клиенту.">
              {isReadOnly
                ? <div style={{ ...inputStyle, color:'var(--text-3)' }}>{client || '—'}</div>
                : <>
                    <input value={client} onChange={e => setClient(e.target.value)} list="task-client-options"
                      placeholder="ММ, Пятёрочка…" style={inputStyle} />
                    <datalist id="task-client-options">
                      {clientOptions.map(c => <option key={c.id} value={c.name} />)}
                    </datalist>
                  </>
              }
            </Field>
            <Field label="Проект" hint="Привязывает задачу к проекту компании. Задача появится в карточке этого проекта.">
              {isReadOnly
                ? <div style={{ ...inputStyle, color:'var(--text-3)' }}>{editTask?.project?.title ?? '—'}</div>
                : <select value={projectId ?? ''} onChange={e => setProjectId(e.target.value || null)}
                    style={{ ...inputStyle, width:'100%' }}>
                    <option value="">—</option>
                    {projectOptions.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </select>
              }
            </Field>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Field label="План, мин" hint="Планируемое время на задачу в минутах. Учитывается в расчёте нагрузки сотрудника в Аналитике.">
              {isReadOnly
                ? <div style={{ ...inputStyle, color:'var(--text-3)' }}>{plannedMin || '—'}</div>
                : <input type="number" min={0} step={15} value={plannedMin}
                    onChange={e => setPlannedMin(e.target.value)} placeholder="45" style={inputStyle} />
              }
            </Field>
            <Field label="Факт, мин" hint="Фактически затраченное время. Если при завершении задачи факт не указан — автоматически скопируется из плана.">
              {isReadOnly
                ? <div style={{ ...inputStyle, color:'var(--text-3)' }}>{actualMin || '—'}</div>
                : <input type="number" min={0} step={15} value={actualMin}
                    onChange={e => setActualMin(e.target.value)}
                    placeholder={plannedMin ? `${plannedMin} (при завершении)` : ''} style={inputStyle} />
              }
            </Field>
          </div>

          {!isEdit && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <Field label="Повторять" hint="Создаёт отдельные копии задачи на каждый день по правилу. Каждая копия независима и помечается иконкой ↻.">
                <select value={repeatRule} onChange={e => setRepeatRule(e.target.value)} style={{ ...inputStyle, width:'100%' }}>
                  <option value="">Не повторять</option>
                  <option value="daily">Ежедневно</option>
                  <option value="weekdays">По будням</option>
                </select>
              </Field>
              {repeatRule && (
                <Field label="До даты">
                  <DatePicker value={repeatUntil} onChange={setRepeatUntil} min={fmtD(new Date())} />
                </Field>
              )}
            </div>
          )}
          {isEdit && editTask?.repeatRule && (
            <div style={{ fontSize:11, color:'var(--text-muted)' }}>
              ↻ Серия: {editTask.repeatRule === 'daily' ? 'ежедневно' : 'по будням'} до {toDateStr(editTask.repeatUntil)}
            </div>
          )}

          <div style={{ display:'grid', gridTemplateColumns: trackId ? '1fr 1fr' : '1fr', gap:12, marginTop:4 }}>
            {trackId && trackTitle && (
              <Field label="Трек">
                <div style={{ ...inputStyle, color:'var(--accent-s)', userSelect:'none', fontSize:13, display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ fontSize:11, opacity:0.7 }}>◈</span> {trackTitle}
                  {(editTask?.stage?.title ?? null) && <span style={{ fontSize:11, color:'var(--text-muted)', marginLeft:4 }}>/ {editTask!.stage!.title}</span>}
                </div>
              </Field>
            )}
            <Field label="Дедлайн" hint="Срок выполнения. Просроченные задачи выделяются красным в ленте и попадают в блок дедлайнов на Главной.">
              {isReadOnly
                ? <div style={{ ...inputStyle, color:'var(--text-3)', userSelect:'none' }}>{deadline ? deadline : '—'}</div>
                : <DatePicker value={deadline} onChange={setDeadline} min={isEdit ? toDateStr(editTask.startDate) : fmtD(new Date())} />
              }
            </Field>
          </div>
        </>)}

        <div style={{ display:'flex', alignItems:'center', justifyContent: (isEdit && !isReadOnly) ? 'space-between' : 'flex-end', marginTop:4 }}>
          {isEdit && !isReadOnly && (
            !confirmDel ? (
              <button onClick={() => setConfirmDel(true)} style={{ padding:'8px 14px', borderRadius:8, border:'1px solid rgba(232,25,75,0.3)', background:'none', color:'var(--danger)', fontFamily:'Inter,sans-serif', fontSize:12, cursor:'pointer' }}>
                Удалить
              </button>
            ) : (
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <span style={{ fontSize:12, color:'var(--text-3)' }}>Точно удалить?</span>
                <button onClick={() => deleteMutation.mutate()} style={{ padding:'6px 12px', borderRadius:8, border:'none', background:'var(--danger)', color:'#fff', fontFamily:'Inter,sans-serif', fontSize:12, cursor:'pointer', fontWeight:600 }}>Да</button>
                <button onClick={() => setConfirmDel(false)} style={{ padding:'6px 12px', borderRadius:8, border:'1px solid var(--border)', background:'none', color:'var(--text-3)', fontFamily:'Inter,sans-serif', fontSize:12, cursor:'pointer' }}>Нет</button>
              </div>
            )
          )}
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={onClose} style={{ padding:'8px 18px', borderRadius:8, border:'1px solid var(--border)', background:'none', color:'var(--text-3)', fontFamily:'Inter,sans-serif', fontSize:13, cursor:'pointer' }}>{isReadOnly ? 'Закрыть' : 'Отмена'}</button>
            {!isReadOnly && (
              <button onClick={submit} disabled={!title.trim() || saveMutation.isPending} style={{ padding:'8px 20px', borderRadius:8, border:'none', background: title.trim() ? 'linear-gradient(135deg,#FF6B35,#E8194B)' : 'rgba(255,255,255,0.08)', color: title.trim() ? '#fff' : 'var(--text-muted)', fontFamily:'Inter,sans-serif', fontSize:13, fontWeight:600, cursor: title.trim() ? 'pointer' : 'default' }}>
                {saveMutation.isPending ? '...' : isEdit ? 'Сохранить' : 'Создать'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>

    </>
  )
}

// ── Segmented control ──────────────────────────────────────────────────────────
function SegmentedControl<T extends string>({ value, options, onChange }: { value: T; options: readonly [T, string][]; onChange: (v: T) => void }) {
  return (
    <div style={{ display:'flex', background:'var(--surface-2)', borderRadius:8, padding:3, gap:2 }}>
      {options.map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)} style={{
          padding:'5px 14px', borderRadius:6, border:'none', cursor:'pointer',
          background: value === v ? 'var(--surface-1)' : 'none',
          color: value === v ? 'var(--text-1)' : 'var(--text-muted)',
          fontFamily:'Inter,sans-serif', fontSize:13, fontWeight: value === v ? 600 : 400,
          boxShadow: value === v ? '0 1px 4px rgba(0,0,0,0.2)' : 'none',
        }}>
          {label}
        </button>
      ))}
    </div>
  )
}

// ── Toast ──────────────────────────────────────────────────────────────────────
function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3200)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div style={{ position:'fixed', bottom:28, left:'50%', transform:'translateX(-50%)', zIndex:9999, pointerEvents:'none' }}>
      <div style={{ background:'var(--surface-1)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 18px', fontSize:13, color:'var(--text-1)', boxShadow:'0 4px 20px rgba(0,0,0,0.4)', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:8 }}>
        <span style={{ color:'#F59E0B', fontSize:16, lineHeight:1 }}>⚠</span>
        {message}
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
interface TasksPageProps {
  onOpenChatWith?: (userId: string, task: { id: string; title: string; assigneeId: string; assignedById: string }, isSelf: boolean) => void
}

export function TasksPage({ onOpenChatWith }: TasksPageProps = {}) {
  const currentUser = useAuthStore(s => s.user)
  const [tab,      setTab]      = useState<'tasks' | 'tracks'>('tasks')
  const [view,     setView]     = useState<View>('kanban')
  const [taskView, setTaskView] = useState<TaskView>('mine')
  // группировка доски персистится per-user (паттерн донора)
  const [groupBy,  setGroupByState] = useState<BoardGroupBy>(
    () => (localStorage.getItem('nexus:board-group') as BoardGroupBy) || 'status',
  )
  const setGroupBy = (g: BoardGroupBy) => { setGroupByState(g); localStorage.setItem('nexus:board-group', g) }
  const [showCreate, setShowCreate] = useState(false)
  const [createDeadline,   setCreateDeadline]   = useState<string | undefined>()
  const [createStartDate,  setCreateStartDate]  = useState<string | undefined>()
  const [editTask,    setEditTask]    = useState<Task | null>(null)
  const [editCalData, setEditCalData] = useState<{ eventId: string; task: Task } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const qc = useQueryClient()

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ['tasks'],
    queryFn: () => api.get('/tasks').then(r => r.data),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: 30_000,
  })

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['tasks'] })
  }

  function openEdit(task: Task) {
    if (task.assignee.id === currentUser?.id && !task.seenAt) {
      api.post(`/tasks/${task.id}/seen`).then(() => {
        qc.invalidateQueries({ queryKey: ['tasks:unseen'] })
        qc.setQueryData<Task[]>(['tasks'], old =>
          old?.map(t => t.id === task.id ? { ...t, seenAt: new Date().toISOString() } : t) ?? []
        )
      }).catch(() => {})
    }
    if (task.calendarEventId) {
      setEditCalData({ eventId: task.calendarEventId, task })
      return
    }
    setEditTask(task)
  }

  function openCreate(opts: { deadline?: string; startDate?: string } = {}) {
    setCreateDeadline(opts.deadline)
    setCreateStartDate(opts.startDate)
    setShowCreate(true)
  }

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      api.patch(`/tasks/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: ['tasks'] })
      const prev = qc.getQueryData<Task[]>(['tasks'])
      qc.setQueryData<Task[]>(['tasks'], old =>
        old?.map(t => t.id === id ? { ...t, ...patch } : t) ?? []
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['tasks'], ctx.prev)
    },
    onSettled: invalidate,
  })

  function updateTask(id: string, patch: Record<string, unknown>) {
    updateMutation.mutate({ id, patch })
  }

  const uid          = currentUser?.id ?? ''
  const hasSent      = tasks.some(t => t.assignedBy.id === uid && t.assignee.id !== uid)
  const filteredTasks = taskView === 'mine'
    ? tasks.filter(t => t.assignee.id === uid)
    : tasks.filter(t => t.assignedBy.id === uid && t.assignee.id !== uid)

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      {/* Tab bar */}
      <div style={{ padding:'12px 24px 0', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'flex-end', gap:0, flexShrink:0 }}>
        {(['tasks','tracks'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{ padding:'8px 18px', marginRight:4, borderRadius:'8px 8px 0 0', border:'1px solid var(--border)', borderBottom: tab === t ? '1px solid var(--bg)' : '1px solid var(--border)', background: tab === t ? 'var(--bg)' : 'none', color: tab === t ? 'var(--accent-s)' : 'var(--text-3)', fontFamily:'Inter,sans-serif', fontSize:13, fontWeight: tab === t ? 700 : 500, cursor:'pointer', marginBottom: tab === t ? -1 : 0 }}
          >
            {t === 'tasks' ? 'Задачи' : 'Треки'}
          </button>
        ))}
      </div>

      {tab === 'tracks' && <TracksPage onOpenChatWith={onOpenChatWith} />}

      {tab === 'tasks' && <>
      <div style={{ padding:'16px 24px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12, flexShrink:0, flexWrap:'wrap' }}>
        <SegmentedControl value={view} options={[['kanban','Доска'],['table','Таблица'],['gantt','Гант']] as const} onChange={v => setView(v as View)} />
        {view === 'kanban' && (
          <SegmentedControl value={groupBy} options={[['status','По статусу'],['client','По клиенту'],['custom','Мои колонки']] as const} onChange={v => setGroupBy(v as BoardGroupBy)} />
        )}
        {hasSent && (
          <SegmentedControl value={taskView} options={[['mine','Мои'],['sent','Отправленные']] as const} onChange={v => setTaskView(v as TaskView)} />
        )}
        {isLoading && <span style={{ fontSize:12, color:'var(--text-muted)' }}>Загрузка...</span>}
        <div style={{ flex:1 }} />
        <button onClick={() => openCreate()} style={{ padding:'7px 16px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#FF6B35,#E8194B)', color:'#fff', fontFamily:'Inter,sans-serif', fontSize:13, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ fontSize:16, lineHeight:1 }}>+</span> Задача
        </button>
      </div>

      {view === 'kanban' && <KanbanBoard tasks={filteredTasks.filter(t => !t.calendarEventId)} groupBy={groupBy} onUpdate={updateTask} onOpenCreate={openCreate} onEdit={openEdit} currentUserId={currentUser?.id ?? ''} onToast={setToast} />}
      {view === 'table'  && <TaskTable tasks={filteredTasks.filter(t => !t.calendarEventId)} onEdit={openEdit} />}
      {view === 'gantt'  && <GanttChart  tasks={filteredTasks.filter(t => !t.calendarEventId)} onUpdate={updateTask} onOpenCreate={openCreate} onEdit={openEdit} currentUserId={currentUser?.id ?? ''} onToast={setToast} />}

      {showCreate && (
        <TaskModal
          defaultDeadline={createDeadline}
          defaultStartDate={createStartDate}
          onClose={() => setShowCreate(false)}
          onDone={invalidate}
        />
      )}

      {editTask && (
        <TaskModal
          editTask={editTask}
          onClose={() => setEditTask(null)}
          onDone={invalidate}
          onOpenChatWith={onOpenChatWith}
        />
      )}

      {editCalData && (
        <CalendarEventModal
          eventId={editCalData.eventId}
          task={editCalData.task}
          onClose={() => setEditCalData(null)}
          onSaved={() => { invalidate(); qc.invalidateQueries({ queryKey: ['events'] }) }}
          onOpenChatWith={onOpenChatWith}
        />
      )}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
      </>}
    </div>
  )
}

// ── Kanban card ────────────────────────────────────────────────────────────────
function KanbanCard({ task, color, isDone, deadlineStr, dragId, onEdit, currentUserId }: {
  task:          Task
  color:         string
  isDone:        boolean
  deadlineStr:   string
  dragId:        React.MutableRefObject<string | null>
  onEdit:        (task: Task) => void
  currentUserId: string
}) {
  const isCalendar = !!task.calendarEventId
  const isOutgoing = !isCalendar && task.assignedBy.id === currentUserId && task.assignee.id !== currentUserId
  const isIncoming = !isCalendar && task.assignee.id === currentUserId && task.assignedBy.id !== currentUserId
  const isNew      = !task.seenAt && task.assignee.id === currentUserId

  return (
    <div
      draggable={!isCalendar}
      onDragStart={() => { if (!isCalendar) dragId.current = task.id }}
      onDragEnd={() => { dragId.current = null }}
      className={isNew ? 'task-new' : undefined}
      style={{
        background: 'var(--surface-2)',
        border: isNew ? '1px solid rgba(255,107,53,0.4)' : '1px solid var(--border)',
        borderRadius: 12, padding: '14px 16px', cursor: isCalendar ? 'default' : 'grab',
        opacity: isDone ? 0.55 : 1, position: 'relative',
      }}
    >
      <button
        onMouseDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); onEdit(task) }}
        title="Редактировать"
        style={{ position:'absolute', top:10, right:10, width:24, height:24, borderRadius:6, border:'1px solid var(--border)', background:'var(--surface-3)', color:'var(--text-muted)', fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1, opacity:0.7 }}
      >✎</button>

      <div style={{ paddingRight:32, marginBottom: task.description ? 8 : 10, display:'flex', alignItems:'baseline', gap:6 }}>
        {isCalendar && (
          <span title="Задача из события календаря" style={{ fontSize:15, lineHeight:1, cursor:'default', flexShrink:0 }}>📅</span>
        )}
        {(isOutgoing || isIncoming) && (
          <span
            title={isOutgoing ? `Поставлено вами → ${task.assignee.name}` : `Поставлено вам ← ${task.assignedBy.name}`}
            style={{ fontSize:18, lineHeight:1, fontWeight:700, color: isOutgoing ? '#0EA5E9' : '#F59E0B', cursor:'default', flexShrink:0 }}
          >
            {isOutgoing ? '↑' : '↓'}
          </span>
        )}
        <span style={{ fontSize:13, fontWeight:600, color:'var(--text-1)', lineHeight:1.45, textDecoration: isDone ? 'line-through' : 'none' }}>
          {task.title}
        </span>
      </div>

      {task.description && (
        <div style={{ fontSize:11, color:'var(--text-3)', marginBottom:10, lineHeight:1.4, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>{task.description}</div>
      )}
      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
        {/* клиент · проект — главная мета карточки (95%/40% заполняемости донора) */}
        {(task.client || task.project) && (
          <span style={{ fontSize:10, fontWeight:600, color:'var(--text-2)' }}>
            {task.client}{task.client && task.project ? ' · ' : ''}{task.project?.title ?? ''}
          </span>
        )}
        {task.type !== 'task' && taskTypeMeta(task.type) && (
          <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:20,
            background: taskTypeMeta(task.type)!.color + '22', color: taskTypeMeta(task.type)!.color }}>
            {taskTypeMeta(task.type)!.label}
          </span>
        )}
        {(task.actualMinutes ?? task.plannedMinutes) != null && (
          <span style={{ fontSize:10, fontFamily:'monospace', color:'var(--text-3)', border:'1px solid var(--border)', borderRadius:20, padding:'1px 7px' }}>
            {fmtMinutes((task.actualMinutes ?? task.plannedMinutes)!)}
          </span>
        )}
        {task.recurringParentId || task.repeatRule ? (
          <span title="Серия повторов" style={{ fontSize:10, color:'var(--text-muted)' }}>↻</span>
        ) : null}
        {task.track && (
          <span style={{ fontSize:10, padding:'2px 8px', borderRadius:20, background:'rgba(255,255,255,0.04)', border:'1px solid var(--border)', color:'var(--accent-s)', display:'inline-flex', alignItems:'center', gap:4 }}>
            <span style={{ fontSize:9 }}>◈</span> {task.track.title}
          </span>
        )}
        {(isCalendar || isOutgoing || isIncoming) && (
          <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:20, background:color+'22', color }}>
            {(isIncoming || isCalendar) ? task.assignedBy.name : task.assignee.name}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Kanban board ───────────────────────────────────────────────────────────────
export type BoardGroupBy = 'status' | 'client' | 'custom'

type BoardData = {
  columns: Array<{ id: string; name: string; order: number }>
  placements: Array<{ taskId: string; columnId: string; sort: number }>
}

// Обобщённая доска: группировка статус / клиент / мои колонки (инсайт донора:
// люди группируют по клиентам и направлениям, не по статусному workflow).
function KanbanBoard({ tasks, groupBy, onUpdate, onOpenCreate, onEdit, currentUserId, onToast }: {
  tasks: Task[]
  groupBy: BoardGroupBy
  onUpdate: (id: string, patch: Record<string, unknown>) => void
  onOpenCreate: (opts?: { deadline?: string; startDate?: string }) => void
  onEdit: (task: Task) => void
  currentUserId: string
  onToast: (msg: string) => void
}) {
  const dragId = useRef<string | null>(null)
  const qc = useQueryClient()
  const [newColName, setNewColName] = useState('')
  const [renamingCol, setRenamingCol] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const { data: board } = useQuery<BoardData>({
    queryKey: ['board'],
    queryFn: () => api.get('/board').then(r => r.data),
    enabled: groupBy === 'custom',
  })

  const placeMutation = useMutation({
    mutationFn: (p: { taskId: string; columnId: string | null }) => api.put('/board/placements', p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['board'] }),
    onError: (err: unknown) => onToast((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Ошибка'),
  })
  const addColMutation = useMutation({
    mutationFn: (name: string) => api.post('/board/columns', { name }),
    onSuccess: () => { setNewColName(''); qc.invalidateQueries({ queryKey: ['board'] }) },
  })
  const renameColMutation = useMutation({
    mutationFn: (p: { id: string; name: string }) => api.patch(`/board/columns/${p.id}`, { name: p.name }),
    onSuccess: () => { setRenamingCol(null); qc.invalidateQueries({ queryKey: ['board'] }) },
  })
  const delColMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/board/columns/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['board'] }),
  })

  // Колонки текущего режима: key → {label, color, taskFilter}
  type BoardCol = { key: string; label: string; color: string; tasks: Task[]; customId?: string; deletable?: boolean }
  let cols: BoardCol[] = []
  if (groupBy === 'status') {
    cols = COLS.map(c => ({ key: c.id, label: c.label, color: c.color, tasks: tasks.filter(t => t.status === c.id) }))
  } else if (groupBy === 'client') {
    const clients = [...new Set(tasks.map(t => t.client).filter(Boolean))] as string[]
    clients.sort((a, b) => a.localeCompare(b, 'ru'))
    cols = [
      ...clients.map((c, i) => ({
        key: `client:${c}`, label: c, color: COLOR_PALETTE[i % COLOR_PALETTE.length],
        tasks: tasks.filter(t => t.client === c),
      })),
      { key: 'client:', label: 'Без клиента', color: '#464658', tasks: tasks.filter(t => !t.client) },
    ]
  } else {
    const placementByTask = new Map((board?.placements ?? []).map(p => [p.taskId, p.columnId]))
    const customCols = board?.columns ?? []
    cols = [
      ...customCols.map((c, i) => ({
        key: `col:${c.id}`, label: c.name, color: COLOR_PALETTE[i % COLOR_PALETTE.length],
        customId: c.id, deletable: true,
        tasks: tasks.filter(t => placementByTask.get(t.id) === c.id),
      })),
      { key: 'col:', label: 'Без колонки', color: '#464658', tasks: tasks.filter(t => !placementByTask.has(t.id)) },
    ]
  }

  function onDrop(col: BoardCol) {
    if (!dragId.current) return
    const id = dragId.current
    dragId.current = null
    const task = tasks.find(t => t.id === id)
    if (!task) return

    if (groupBy === 'status') {
      const status = col.key as TaskStatus
      if (task.calendarEventId) { onToast('Задача из события — статус меняется автоматически'); return }
      if (task.assignee.id !== currentUserId) { onToast('Статус задачи может менять только исполнитель'); return }
      if (task.status === status) return
      onUpdate(id, { status })
    } else if (groupBy === 'client') {
      const client = col.key === 'client:' ? null : col.label
      if (task.client === client) return
      onUpdate(id, { client })
    } else {
      placeMutation.mutate({ taskId: id, columnId: col.customId ?? null })
    }
  }

  return (
    <div style={{ flex:1, display:'flex', gap:16, padding:'24px 28px', overflowX:'auto', alignItems:'flex-start', justifyContent: cols.length <= 3 ? 'center' : 'flex-start' }}>
      {cols.map(col => {
        const colTasks = col.tasks
        return (
          <div key={col.key}
            onDragOver={e => e.preventDefault()}
            onDrop={() => onDrop(col)}
            style={{ width:300, flexShrink:0, background:'var(--surface-1)', borderRadius:16, border:'1px solid var(--border)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
            <div style={{ height:3, background:col.color }} />
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'14px 16px 10px' }}>
              {renamingCol === col.customId && col.customId ? (
                <input autoFocus value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && renameValue.trim()) renameColMutation.mutate({ id: col.customId!, name: renameValue.trim() })
                    if (e.key === 'Escape') setRenamingCol(null)
                  }}
                  onBlur={() => setRenamingCol(null)}
                  style={{ flex:1, background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:6, padding:'3px 8px', color:'var(--text-1)', fontFamily:'Inter,sans-serif', fontSize:13, fontWeight:700, outline:'none' }} />
              ) : (
                <span
                  onDoubleClick={() => { if (col.customId) { setRenamingCol(col.customId); setRenameValue(col.label) } }}
                  title={col.customId ? 'Двойной клик — переименовать' : undefined}
                  style={{ fontSize:13, fontWeight:700, letterSpacing:'0.3px', color:col.color, flex:1, cursor: col.customId ? 'text' : 'default' }}>
                  {col.label}
                </span>
              )}
              <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20, background:'var(--surface-3)', color:'var(--text-3)' }}>{colTasks.length}</span>
              {col.deletable && (
                <button onClick={() => delColMutation.mutate(col.customId!)}
                  title="Удалить колонку (задачи останутся)"
                  style={{ width:20, height:20, borderRadius:5, border:'none', background:'none', color:'var(--text-muted)', fontSize:12, cursor:'pointer', opacity:0.6 }}>✕</button>
              )}
            </div>
            <div style={{ height:1, background:'var(--border)', margin:'0 0 6px' }} />
            <div style={{ display:'flex', flexDirection:'column', gap:8, padding:'8px 12px 14px', minHeight:80 }}>
              {colTasks.length === 0 && (
                <div style={{ color:'var(--text-muted)', fontSize:12, textAlign:'center', padding:'16px 0', opacity:0.5 }}>
                  {groupBy === 'status' ? 'Нет задач' : 'Перетащите задачи сюда'}
                </div>
              )}
              {colTasks.map(task => {
                const color       = taskColor(task.id)
                const isDone      = task.status === 'done'
                const deadlineStr = toDateStr(task.deadline)
                return (
                  <KanbanCard
                    key={task.id}
                    task={task}
                    color={color}
                    isDone={isDone}
                    deadlineStr={deadlineStr}
                    dragId={dragId}
                    onEdit={onEdit}
                    currentUserId={currentUserId}
                  />
                )
              })}
            </div>
          </div>
        )
      })}
      {groupBy === 'custom' && (
        <div style={{ width:260, flexShrink:0 }}>
          <input
            value={newColName}
            onChange={e => setNewColName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && newColName.trim()) addColMutation.mutate(newColName.trim()) }}
            placeholder="+ Новая колонка (Enter)"
            style={{ width:'100%', boxSizing:'border-box', background:'none', border:'1.5px dashed var(--border)', borderRadius:12, padding:'12px 14px', color:'var(--text-2)', fontFamily:'Inter,sans-serif', fontSize:13, outline:'none' }} />
        </div>
      )}
    </div>
  )
}

// ── Gantt chart ────────────────────────────────────────────────────────────────
const navBtn: React.CSSProperties = {
  width:32, height:32, background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:8,
  color:'var(--text-3)', fontSize:14, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
}

function GanttChart({ tasks, onUpdate, onOpenCreate, onEdit, currentUserId, onToast }: {
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
            <span style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.8px', color:'var(--text-muted)' }}>Задачи</span>
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
                    style={{ width:16, height:16, borderRadius:4, border:`1.5px solid ${isDone ? '#FF6B35' : 'var(--text-muted)'}`, background: isDone ? 'linear-gradient(135deg,#FF6B35,#E8194B)' : 'transparent', cursor: isCalendar ? 'default' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:10, color:'#fff', opacity: isCalendar ? 0.5 : 1 }}>
                    {isDone ? '✓' : ''}
                  </div>
                  {isCalendar
                    ? <span title="Задача из события календаря" style={{ fontSize:13, lineHeight:1, flexShrink:0 }}>📅</span>
                    : (isOutgoing || isIncoming) && (
                        <span
                          title={isOutgoing ? `Поставлено вами → ${task.assignee.name}` : `Поставлено вам ← ${task.assignedBy.name}`}
                          style={{ fontSize:14, lineHeight:1, fontWeight:700, color: isOutgoing ? '#0EA5E9' : '#F59E0B', flexShrink:0 }}
                        >{isOutgoing ? '↑' : '↓'}</span>
                      )
                  }
                  <div
                    onClick={() => onEdit(task)}
                    style={{ fontSize:13, fontWeight:500, color: isDone ? 'var(--text-muted)' : 'var(--text-1)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', flex:1, textDecoration: isDone ? 'line-through' : 'none', cursor:'pointer' }}
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
                    <div style={{ fontSize:12, fontWeight:600, color: isToday ? '#E8194B' : 'var(--text-3)', lineHeight:1 }}>{d.getDate()}</div>
                    <div style={{ fontSize:9, fontWeight:500, color: isToday ? '#E8194B' : 'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.4px', opacity: isToday ? 0.7 : 1 }}>{WDAYS_RU[dow]}</div>
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
                  <div style={{ position:'absolute', top:0, bottom:0, left: idx*DAY_W + DAY_W/2 - 1, width:2, background:'linear-gradient(180deg,#E8194B,rgba(232,25,75,0.2))', zIndex:30, pointerEvents:'none', borderRadius:1 }}>
                    <div style={{ position:'absolute', top:-3, left:-4, width:10, height:10, background:'#E8194B', borderRadius:'50%' }} />
                  </div>
                )
              })()}

              {/* Ghost */}
              <div ref={ghostRef} style={{ position:'absolute', height:28, top:10, borderRadius:6, background:'rgba(255,107,53,0.4)', border:'2px dashed #FF6B35', pointerEvents:'none', zIndex:150, display:'none' }} />

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
                      <div style={{ fontSize:11, fontWeight:600, color:'rgba(255,255,255,0.92)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', pointerEvents:'none', textShadow:'0 1px 3px rgba(0,0,0,0.5)' }}>{task.title}</div>
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

// ── Calendar event modal (opened from Kanban/Gantt for calendar tasks) ─────────
interface CalEventData {
  id: string; type: string; title: string; description: string
  date: string; startTime: string; endTime: string; location: string[]; status: string
  authorId: string; author: { id: string; name: string }
  participants: Array<{ userId: string; user: { id: string; name: string } }>
}

const CAL_LOCS = [
  { id: 'kaminoka', label: 'Знаменка Каминка' },
  { id: 'chernaya', label: 'Знаменка Чёрная'  },
  { id: 'kupol',    label: 'Знаменка Купол'   },
  { id: 'zoom',     label: 'Zoom'              },
  { id: 'office',   label: 'Офис'             },
  { id: 'vyezd',    label: 'Выезд'            },
]
const CAL_LOC_IDS = new Set(CAL_LOCS.map(l => l.id))
const CAL_TYPE_COLOR: Record<string, string> = {
  meeting: '#8B5CF6', task: '#FF6B35', personal: '#29BF12',
}
const CAL_TYPES = [
  { value: 'meeting',  label: 'Встреча' },
  { value: 'task',     label: 'Задача'  },
  { value: 'personal', label: 'Личное'  },
]

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

// ── Таблица задач (скелет Figma v2 TableView; наполнение — канон) ─────────────
type SortKey = 'title' | 'status' | 'client' | 'project' | 'type' | 'minutes' | 'startDate' | 'deadline'

function TaskTable({ tasks, onEdit }: { tasks: Task[]; onEdit: (t: Task) => void }) {
  const [sortKey, setSortKey] = useState<SortKey>('startDate')
  const [sortDir, setSortDir] = useState<1 | -1>(-1)

  const sortVal = (t: Task, k: SortKey): string | number => {
    switch (k) {
      case 'title': return t.title.toLowerCase()
      case 'status': return t.status
      case 'client': return t.client ?? ''
      case 'project': return t.project?.title ?? ''
      case 'type': return t.type
      case 'minutes': return t.actualMinutes ?? t.plannedMinutes ?? -1
      case 'startDate': return t.startDate
      case 'deadline': return t.deadline ?? ''
    }
  }
  const sorted = [...tasks].sort((a, b) => {
    const va = sortVal(a, sortKey)
    const vb = sortVal(b, sortKey)
    return (va < vb ? -1 : va > vb ? 1 : 0) * sortDir
  })
  const clickSort = (k: SortKey) => {
    if (k === sortKey) setSortDir(d => (d === 1 ? -1 : 1))
    else { setSortKey(k); setSortDir(1) }
  }

  const TT_STATUS_LABEL: Record<string, string> = { backlog: 'Бэклог', inprogress: 'В работе', done: 'Готово' }
  const TT_STATUS_COLOR: Record<string, string> = { backlog: '#64748b', inprogress: '#0EA5E9', done: '#29BF12' }

  const th = (k: SortKey, label: string, right = false): React.ReactNode => (
    <th key={k} onClick={() => clickSort(k)} style={{
      padding: '8px 12px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
      textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: right ? 'right' : 'left',
      borderBottom: '1px solid var(--border)', cursor: 'pointer', userSelect: 'none',
      position: 'sticky', top: 0, background: 'var(--surface-2)', whiteSpace: 'nowrap',
    }}>
      {label}{sortKey === k ? (sortDir === 1 ? ' ↑' : ' ↓') : ''}
    </th>
  )
  const td: React.CSSProperties = { padding: '8px 12px', fontSize: 13, color: 'var(--text-1)', borderBottom: '1px solid var(--border)' }

  return (
    <div style={{ flex: 1, overflow: 'auto', margin: '16px 28px 24px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface-2)' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr>
          {th('title', 'Задача')}
          {th('status', 'Статус')}
          {th('client', 'Клиент')}
          {th('project', 'Проект')}
          {th('type', 'Тип')}
          {th('minutes', 'Минуты', true)}
          {th('startDate', 'Дата')}
          {th('deadline', 'Дедлайн')}
        </tr></thead>
        <tbody>
          {sorted.length === 0 && (
            <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 28 }}>Нет задач</td></tr>
          )}
          {sorted.map(t => {
            const tm = taskTypeMeta(t.type)
            return (
              <tr key={t.id} onClick={() => onEdit(t)} style={{ cursor: 'pointer' }}
                onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(127,127,127,0.06)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent' }}>
                <td style={{ ...td, fontWeight: 500 }}>
                  {(t.repeatRule || t.recurringParentId) && <span title="Серия" style={{ marginRight: 5, color: 'var(--text-muted)' }}>↻</span>}
                  <span style={{ textDecoration: t.status === 'done' ? 'line-through' : 'none', opacity: t.status === 'done' ? 0.65 : 1 }}>{t.title}</span>
                </td>
                <td style={td}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: TT_STATUS_COLOR[t.status] }}>{TT_STATUS_LABEL[t.status] ?? t.status}</span>
                </td>
                <td style={{ ...td, color: 'var(--text-2)' }}>{t.client ?? '—'}</td>
                <td style={{ ...td, color: 'var(--text-2)' }}>{t.project?.title ?? '—'}</td>
                <td style={td}>
                  {tm && t.type !== 'task'
                    ? <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: tm.color + '22', color: tm.color }}>{tm.label}</span>
                    : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Задача</span>}
                </td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>
                  {(t.actualMinutes ?? t.plannedMinutes) != null ? fmtMinutes((t.actualMinutes ?? t.plannedMinutes)!) : '—'}
                </td>
                <td style={{ ...td, fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap' }}>{toDateStr(t.startDate)}</td>
                <td style={{ ...td, fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap', color: t.deadline && t.status !== 'done' && toDateStr(t.deadline) < fmtD(new Date()) ? '#E8194B' : 'var(--text-2)' }}>
                  {t.deadline ? toDateStr(t.deadline) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
