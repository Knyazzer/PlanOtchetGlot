import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../stores/auth'
import { api } from '../lib/api'
import { TaskModal } from './TasksPage'
import { Hint } from '../components/Hint'
import { ROLE, filled, tonal, outline } from '../lib/roleColors'

// ── Types ──────────────────────────────────────────────────────────────────────

type TrackType   = 'internal' | 'external'
type TrackStatus = 'active' | 'done' | 'archived'

interface TrackUser   { id: string; name: string }
interface TrackMember { user: TrackUser; joinedAt: string }

interface TrackSummaryTask  { status: string }
interface TrackSummaryStage { id: string; order: number; tasks: TrackSummaryTask[] }

interface Track {
  id: string; title: string; description: string
  type: TrackType; status: TrackStatus
  clientName: string | null; projectName: string | null
  deadline: string | null; leaderId: string
  workItemId: string | null
  chat?: { id: string } | null
  leader: TrackUser; members: TrackMember[]
  tasks:  TrackSummaryTask[]
  stages: TrackSummaryStage[]
  createdAt: string; updatedAt: string
}

interface WIRef { id: string; title: string }
interface ProjectRef { id: string; title: string }

interface StageTask {
  id: string; title: string; status: string; deadline: string | null; stageId: string | null
  assignee: TrackUser; assignedBy: TrackUser
}

interface DetailStage { id: string; title: string; order: number; tasks: StageTask[] }

interface TrackEvent { id: string; type: string; title: string; date: string; startTime: string; endTime: string; status: string }
interface TrackDetail extends Track {
  tasks: Array<StageTask & {
    description: string; startDate: string; seenAt: string | null
    calendarEventId: string | null; calendarEventEnd: string | null
    createdAt: string; updatedAt: string
  }>
  stages: DetailStage[]
  events?: TrackEvent[]
}

// ── Layout constants ───────────────────────────────────────────────────────────

const CIRCLE_D    = 48   // circle diameter px
const STAGE_COL_W = 200  // width per stage column (incl. task cards)

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function daysDiff(deadline: string) {
  const today = new Date(); today.setHours(0,0,0,0)
  const dl    = new Date(deadline); dl.setHours(0,0,0,0)
  return Math.round((dl.getTime() - today.getTime()) / 86_400_000)
}

function fmtToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

const STATUS_LABEL: Record<TrackStatus, string> = { active: 'Активный', done: 'Завершён', archived: 'Архив' }
const STATUS_COLOR: Record<TrackStatus, string> = { active: '#22C55E',  done: '#0EA5E9', archived: '#464658' }
const TASK_STATUS_COLOR: Record<string, string> = { backlog: '#464658', inprogress: '#0EA5E9', done: '#22C55E' }
const TASK_STATUS_LABEL: Record<string, string> = { backlog: 'Бэклог', inprogress: 'В работе', done: 'Готово' }

const lbl: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 5, display: 'block',
}
const inp: React.CSSProperties = {
  background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 8,
  color: 'var(--text-1)', fontSize: 14, padding: '8px 10px', outline: 'none',
  width: '100%', boxSizing: 'border-box', fontFamily: 'Inter,sans-serif',
}

// ── Stage helpers ──────────────────────────────────────────────────────────────

function stageIsDone(s: { tasks: { status: string }[] }) {
  return s.tasks.length > 0 && s.tasks.every(t => t.status === 'done')
}


// ── DonutChart (large, for track card) ────────────────────────────────────────

function DonutChart({ done, total, label, color = '#FF6B35' }: { done: number; total: number; label: string; color?: string }) {
  const r = 20, cx = 26, cy = 26, sw = 5
  const circ = 2 * Math.PI * r
  const dash  = total > 0 ? (done / total) * circ : 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
      <svg width={52} height={52}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={sw} />
        {total > 0 && (
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={sw}
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
            transform={`rotate(-90 ${cx} ${cy})`} />
        )}
        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
          fill="var(--text-1)" fontSize={9} fontWeight="700" fontFamily="Inter,sans-serif">
          {done}/{total}
        </text>
      </svg>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
    </div>
  )
}

// ── StageTimeline ──────────────────────────────────────────────────────────────

type OpenChatFn = (userId: string, task: { id: string; title: string; assigneeId: string; assignedById: string }, isSelf: boolean) => void

function StageTimeline({ track, isInvolved, canDeleteStage, onOpenTask, onOpenChatWith }: {
  track: TrackDetail; isInvolved: boolean; canDeleteStage: boolean; onOpenTask: (id: string) => void; onOpenChatWith?: OpenChatFn
}) {
  const qc = useQueryClient()
  const sorted = [...track.stages].sort((a, b) => a.order - b.order)
  const CRAD = CIRCLE_D / 2

  const initIdx = () => {
    const i = sorted.findIndex(s => s.tasks.some(t => t.status !== 'done'))
    return i >= 0 ? i : 0
  }
  const [selectedIdx, setSelectedIdx] = useState<number>(initIdx)
  const [creatingTask, setCreatingTask] = useState(false)

  useEffect(() => {
    if (sorted.length === 0) return
    setSelectedIdx(prev => Math.min(prev, sorted.length - 1))
  }, [sorted.length])

  const addStageMut = useMutation({
    mutationFn: () => api.post(`/tracks/${track.id}/stages`, { title: String(sorted.length + 1) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['track', track.id] })
      setSelectedIdx(sorted.length)
    },
    onError: (e: any) => alert(e?.response?.data?.error ?? 'Ошибка'),
  })

  const deleteStageMut = useMutation({
    mutationFn: (stageId: string) => api.delete(`/tracks/${track.id}/stages/${stageId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['track', track.id] })
      setSelectedIdx(prev => Math.max(0, prev - 1))
    },
    onError: (e: any) => alert(e?.response?.data?.error ?? 'Ошибка'),
  })

  const unstageTasks = track.tasks.filter(t => !t.stageId)
  const selectedStage = sorted[selectedIdx] ?? null

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px', boxSizing: 'border-box' }}>

      {/* Horizontal stage board */}
      <div style={{ display: 'flex', alignItems: 'flex-start', position: 'relative' }}>

        {/* Connecting line behind circles */}
        {sorted.length > 0 && (
          <div style={{
            position: 'absolute',
            left: STAGE_COL_W / 2,
            right: isInvolved ? CIRCLE_D / 2 : STAGE_COL_W / 2,
            top: CRAD - 1,
            height: 2,
            background: 'rgba(255,255,255,0.08)',
            pointerEvents: 'none',
          }} />
        )}

        {sorted.map((stage, i) => {
          const isSel   = i === selectedIdx
          const done    = stage.tasks.filter(t => t.status === 'done').length
          const total   = stage.tasks.length
          const allDone = stageIsDone(stage)
          const textColor = isSel ? '#FF6B35' : allDone ? '#22C55E' : 'rgba(255,255,255,0.28)'

          return (
            <div key={stage.id} style={{ width: STAGE_COL_W, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>

              {/* Circle */}
              <div style={{ position: 'relative', zIndex: 1 }}>
                <svg width={CIRCLE_D} height={CIRCLE_D} style={{ cursor: 'pointer', display: 'block' }} onClick={() => setSelectedIdx(i)}>
                  {isSel && <circle cx={CRAD} cy={CRAD} r={CRAD - 1} fill="none" stroke="#FF6B35" strokeWidth={2} />}
                  <circle cx={CRAD} cy={CRAD} r={CRAD - 5}
                    fill={isSel ? 'rgba(123,97,255,0.12)' : allDone ? 'rgba(41,191,18,0.08)' : 'var(--bg,#0e0e14)'}
                    stroke={isSel ? 'none' : allDone ? 'rgba(41,191,18,0.5)' : 'rgba(255,255,255,0.12)'}
                    strokeWidth={1.5}
                  />
                  <text x={CRAD} y={CRAD + 0.5} textAnchor="middle" dominantBaseline="middle"
                    fontSize={total > 0 ? 11 : 13} fontWeight="700" fontFamily="Inter,sans-serif"
                    fill={textColor}
                  >
                    {total > 0 ? `${done}/${total}` : `${i + 1}`}
                  </text>
                </svg>
                {canDeleteStage && isSel && (
                  <button
                    onClick={() => { if (confirm(`Удалить Этап ${i + 1}? Задачи открепятся.`)) deleteStageMut.mutate(stage.id) }}
                    title="Удалить этап"
                    style={{ position: 'absolute', top: -5, right: -5, width: 16, height: 16, borderRadius: '50%', border: 'none', background: 'rgba(232,25,75,0.85)', color: '#fff', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1 }}
                  >×</button>
                )}
              </div>

              {/* Label */}
              <span style={{ fontSize: 12, fontFamily: 'Inter,sans-serif', whiteSpace: 'nowrap', color: textColor, fontWeight: isSel ? 700 : 400 }}>
                {allDone ? '✓ Готово' : `Этап ${i + 1}`}
              </span>

              {/* Task cards */}
              <div style={{ width: '100%', padding: '0 8px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {stage.tasks.map(t => <TaskCard key={t.id} t={t} onOpen={() => onOpenTask(t.id)} />)}
                {stage.tasks.length === 0 && (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.12)', textAlign: 'center', padding: '6px 0', fontFamily: 'Inter,sans-serif' }}>—</div>
                )}
                {isInvolved && isSel && (
                  <button onClick={() => setCreatingTask(true)}
                    style={{ fontSize: 12, color: 'rgba(123,97,255,0.65)', background: 'none', border: '1px dashed rgba(123,97,255,0.25)', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', fontFamily: 'Inter,sans-serif', textAlign: 'center', marginTop: 2 }}>
                    + задача
                  </button>
                )}
              </div>
            </div>
          )
        })}

        {/* "+" add stage */}
        {isInvolved && (
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, zIndex: 1, width: CIRCLE_D }}>
            <button
              onClick={() => !addStageMut.isPending && addStageMut.mutate()}
              style={{ width: CIRCLE_D, height: CIRCLE_D, borderRadius: '50%', border: '2px dashed rgba(123,97,255,0.35)', background: 'var(--bg,#0e0e14)', color: 'rgba(123,97,255,0.55)', fontSize: 22, cursor: addStageMut.isPending ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, opacity: addStageMut.isPending ? 0.4 : 1, fontFamily: 'Inter,sans-serif', lineHeight: 1 }}
            >+</button>
            <span style={{ fontSize: 12, color: 'rgba(123,97,255,0.35)', fontFamily: 'Inter,sans-serif' }}>Этап</span>
          </div>
        )}
      </div>

      {unstageTasks.length > 0 && <UnstageBlock tasks={unstageTasks} onOpenTask={onOpenTask} />}

      {creatingTask && (
        <TaskModal
          defaultTrackId={track.id}
          defaultTrackTitle={track.title}
          defaultStageId={selectedStage?.id}
          onOpenChatWith={onOpenChatWith}
          onClose={() => setCreatingTask(false)}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ['track', track.id] })
            qc.invalidateQueries({ queryKey: ['tasks'] })
            setCreatingTask(false)
          }}
        />
      )}
    </div>
  )
}

function TaskCard({ t, onOpen }: { t: StageTask; onOpen?: () => void }) {
  const sc = TASK_STATUS_COLOR[t.status] ?? '#464658'
  return (
    <div
      onClick={onOpen}
      onMouseEnter={e => onOpen && (e.currentTarget.style.borderColor = 'rgba(123,97,255,0.35)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', cursor: onOpen ? 'pointer' : 'default' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: sc, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{TASK_STATUS_LABEL[t.status]} · {t.assignee.name}</div>
      </div>
      {t.deadline && (
        <span style={{ fontSize: 12, color: daysDiff(t.deadline) <= 1 ? '#F43F5E' : 'var(--text-muted)', flexShrink: 0 }}>{fmtDate(t.deadline)}</span>
      )}
    </div>
  )
}

function UnstageBlock({ tasks, onOpenTask }: { tasks: StageTask[]; onOpenTask?: (id: string) => void }) {
  const [collapsed, setCollapsed] = useState(true)
  return (
    <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px dashed rgba(255,255,255,0.08)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: collapsed ? 0 : 10, cursor: 'pointer' }} onClick={() => setCollapsed(v => !v)}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{collapsed ? '▶' : '▼'}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Без этапа</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>({tasks.length})</span>
      </div>
      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: STAGE_COL_W }}>
          {tasks.map(t => <TaskCard key={t.id} t={t} onOpen={onOpenTask ? () => onOpenTask(t.id) : undefined} />)}
        </div>
      )}
    </div>
  )
}

// ── UserPicker ─────────────────────────────────────────────────────────────────

function UserPicker({ selected, onChange, label, hint }: { selected: string[]; onChange: (ids: string[]) => void; label: string; hint?: string }) {
  const [open,  setOpen]  = useState(false)
  const [query, setQuery] = useState('')

  const { data: users = [] } = useQuery<TrackUser[]>({
    queryKey: ['members'],
    queryFn:  () => api.get('/users/members').then(r => r.data),
    staleTime: 60_000,
  })

  const filtered = users.filter(u => u.name.toLowerCase().includes(query.toLowerCase()))
  const selectedUsers = users.filter(u => selected.includes(u.id))

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])
  }

  return (
    <div style={{ position: 'relative' }}>
      <span style={{ ...lbl, display: hint ? 'flex' : 'block', alignItems: 'center' }}>{label}{hint && <Hint text={hint} />}</span>
      <div onClick={() => setOpen(v => !v)}
        style={{ ...inp, cursor: 'pointer', minHeight: 36, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
        {selectedUsers.length === 0
          ? <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Не выбрано</span>
          : selectedUsers.map(u => (
              <span key={u.id} style={{ fontSize: 12, padding: '2px 8px', borderRadius: 20, background: 'rgba(123,97,255,0.15)', color: 'var(--accent-s)' }}>{u.name}</span>
            ))
        }
      </div>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 10, zIndex: 50, maxHeight: 220, display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск..." style={{ ...inp, padding: '5px 8px' }} />
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.map(u => (
              <div key={u.id} onClick={() => toggle(u.id)}
                style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: selected.includes(u.id) ? 'var(--accent-s)' : 'var(--text-2)' }}>
                <span style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${selected.includes(u.id) ? 'var(--accent-s)' : 'var(--border)'}`, background: selected.includes(u.id) ? 'rgba(123,97,255,0.2)' : 'none', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>
                  {selected.includes(u.id) ? '✓' : ''}
                </span>
                {u.name}
              </div>
            ))}
          </div>
          <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)' }}>
            <button onClick={() => setOpen(false)} style={{ width: '100%', padding: '6px 0', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text-3)', fontFamily: 'Inter,sans-serif', fontSize: 12, cursor: 'pointer' }}>Готово</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── TrackFormModal — упрощённая форма (без типа/клиента/проекта) ──────────────

export function TrackFormModal({
  initial, onClose, onSaved, defaultWorkItemId,
}: {
  initial?: Track; onClose: () => void; onSaved: (trackId?: string) => void
  defaultWorkItemId?: string
}) {
  const currentUser = useAuthStore(s => s.user)
  const qc = useQueryClient()
  const mdRef = useRef(false)

  const [title,       setTitle]       = useState(initial?.title ?? '')
  const [desc,        setDesc]        = useState(initial?.description ?? '')
  const [status,      setStatus]      = useState<TrackStatus>(initial?.status ?? 'active')
  const [deadline,    setDeadline]    = useState(initial?.deadline ? initial.deadline.slice(0, 10) : '')
  const [memberIds,   setMemberIds]   = useState<string[]>(initial?.members.map(m => m.user.id) ?? [])
  const [selProjectId, setSelProjectId] = useState('')
  const [workItemId,  setWorkItemId]  = useState<string>(
    defaultWorkItemId ?? initial?.workItemId ?? ''
  )
  const leaderId = initial?.leaderId ?? currentUser?.id ?? ''
  const isEdit = !!initial

  const { data: projects = [] } = useQuery<ProjectRef[]>({
    queryKey: ['projects-list'],
    queryFn: () => api.get('/projects').then(r => r.data),
  })

  const { data: workItems = [] } = useQuery<WIRef[]>({
    queryKey: ['wi-for-project', selProjectId],
    queryFn: () => api.get(`/projects/${selProjectId}/work-items`).then(r => r.data),
    enabled: !!selProjectId,
  })

  const createMut = useMutation({
    mutationFn: async () => {
      const res = await api.post('/tracks', {
        title: title.trim(), description: desc.trim(),
        deadline: deadline ? new Date(deadline).toISOString() : null,
        memberIds,
        workItemId: workItemId || null,
      })
      return res.data
    },
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ['tracks'] }); onSaved(data.id); onClose() },
    onError: (e: any) => alert(e?.response?.data?.error ?? 'Ошибка'),
  })

  const editMut = useMutation({
    mutationFn: async () => {
      await api.patch(`/tracks/${initial!.id}`, {
        title: title.trim(), description: desc.trim(), status,
        deadline: deadline ? new Date(deadline).toISOString() : null,
        leaderId, workItemId: workItemId || null,
      })
      await api.put(`/tracks/${initial!.id}/members`, { memberIds })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tracks'] }); qc.invalidateQueries({ queryKey: ['track', initial!.id] }); onSaved(); onClose() },
    onError: (e: any) => alert(e?.response?.data?.error ?? 'Ошибка'),
  })

  const pending = createMut.isPending || editMut.isPending

  const segBtn = (val: TrackStatus, c: string) => (
    <button key={val} onClick={() => setStatus(val)} style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: `1px solid ${status === val ? c : 'var(--border)'}`, background: status === val ? c + '22' : 'none', color: status === val ? c : 'var(--text-3)', fontFamily: 'Inter,sans-serif', fontSize: 12, fontWeight: status === val ? 700 : 400, cursor: 'pointer' }}>
      {STATUS_LABEL[val]}
    </button>
  )

  return (
    <div
      onMouseDown={e => { mdRef.current = e.target === e.currentTarget }}
      onMouseUp={e => { if (mdRef.current && e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <div onMouseDown={e => e.stopPropagation()}
        style={{ background: 'var(--surface-2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, width: 460, maxWidth: '100%', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.5)', fontFamily: 'Inter,sans-serif' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>{isEdit ? 'Редактировать трек' : 'Новый трек'}</div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'var(--text-3)', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><span style={lbl}>Название</span><input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Название трека" style={inp} /></div>
          <div><span style={lbl}>Описание</span><textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Цель / краткое описание" rows={2} style={{ ...inp, resize: 'vertical', minHeight: 56 }} /></div>
          <div><span style={{ ...lbl, display: 'flex', alignItems: 'center' }}>Дедлайн <Hint text="Срок выполнения трека. Просроченные треки выделяются красным на карточке." /></span><input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} style={{ ...inp, colorScheme: 'dark' }} /></div>
          {!defaultWorkItemId && (
            <div>
              <span style={{ ...lbl, display: 'flex', alignItems: 'center' }}>Привязать к Work Item (необязательно) <Hint text="Опционально. Связывает трек с конкретной съёмкой в рамках проекта. Трек будет виден в карточке WI." width={250} /></span>
              <select value={selProjectId} onChange={e => { setSelProjectId(e.target.value); setWorkItemId('') }}
                style={{ ...inp, marginBottom: 6 }}>
                <option value="">— выберите проект —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
              {selProjectId && (
                <select value={workItemId} onChange={e => setWorkItemId(e.target.value)} style={inp}>
                  <option value="">— без привязки —</option>
                  {workItems.map(wi => <option key={wi.id} value={wi.id}>{wi.title}</option>)}
                </select>
              )}
            </div>
          )}
          <UserPicker label="Участники" hint="Сотрудники, работающие над треком. Им видны все задачи трека в их ленте." selected={memberIds} onChange={setMemberIds} />
          {isEdit && (
            <div>
              <span style={{ ...lbl, display: 'flex', alignItems: 'center' }}>Статус <Hint text="Активный — трек в работе; Завершён — все задачи выполнены; Архив — трек заморожен и скрыт." /></span>
              <div style={{ display: 'flex', gap: 8 }}>{(['active', 'done', 'archived'] as TrackStatus[]).map(v => segBtn(v, STATUS_COLOR[v]))}</div>
            </div>
          )}
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexShrink: 0 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text-3)', fontFamily: 'Inter,sans-serif', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Отмена</button>
          <button onClick={() => isEdit ? editMut.mutate() : createMut.mutate()} disabled={!title.trim() || pending}
            style={{ flex: 2, padding: '9px 0', borderRadius: 8, border: 'none', background: ROLE.primary, color: '#fff', fontFamily: 'Inter,sans-serif', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: title.trim() && !pending ? 1 : 0.5 }}>
            {pending ? '...' : isEdit ? 'Сохранить' : 'Создать трек'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── CreateTrackEventModal ──────────────────────────────────────────────────────

function CreateTrackEventModal({ track, onClose }: { track: TrackDetail; onClose: () => void }) {
  const qc = useQueryClient()
  const mdRef = useRef(false)

  const allParticipantIds = [
    track.leaderId,
    ...track.members.map(m => m.user.id),
  ]

  const [title,     setTitle]     = useState(track.title)
  const [desc,      setDesc]      = useState('')
  const [date,      setDate]      = useState(fmtToday())
  const [startTime, setStartTime] = useState('10:00')
  const [endTime,   setEndTime]   = useState('11:00')

  const createMut = useMutation({
    mutationFn: () => api.post('/events', {
      type: 'meeting',
      title: title.trim(),
      description: desc.trim(),
      date: new Date(date).toISOString(),
      startTime, endTime,
      location: [],
      participantIds: allParticipantIds,
      trackId: track.id,   // §9: событие видно внутри трека
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['events'] }); qc.invalidateQueries({ queryKey: ['track', track.id] }); onClose() },
    onError: (e: any) => alert(e?.response?.data?.error ?? 'Ошибка'),
  })

  return (
    <div
      onMouseDown={e => { mdRef.current = e.target === e.currentTarget }}
      onMouseUp={e => { if (mdRef.current && e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <div onMouseDown={e => e.stopPropagation()}
        style={{ background: 'var(--surface-2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, width: 440, maxWidth: '100%', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.5)', fontFamily: 'Inter,sans-serif' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>📅 Событие по треку</div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'var(--text-3)', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><span style={lbl}>Название</span><input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Название встречи" style={inp} /></div>
          <div><span style={lbl}>Описание</span><textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} placeholder="Повестка / цель" style={{ ...inp, resize: 'vertical', minHeight: 56 }} /></div>
          <div><span style={lbl}>Дата</span><input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inp, colorScheme: 'dark' }} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><span style={lbl}>Начало</span><input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={{ ...inp, colorScheme: 'dark' }} /></div>
            <div><span style={lbl}>Конец</span><input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} style={{ ...inp, colorScheme: 'dark' }} /></div>
          </div>
          <div>
            <span style={lbl}>Участники (автоматически)</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 10px', background: 'var(--surface-3)', borderRadius: 8, border: '1px solid var(--border)' }}>
              {[track.leader, ...track.members.map(m => m.user)].map(u => (
                <span key={u.id} style={{ fontSize: 12, padding: '2px 8px', borderRadius: 20, background: 'rgba(123,97,255,0.15)', color: 'var(--accent-s)' }}>{u.name}</span>
              ))}
            </div>
          </div>
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text-3)', fontFamily: 'Inter,sans-serif', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Отмена</button>
          <button onClick={() => createMut.mutate()} disabled={!title.trim() || createMut.isPending}
            style={{ flex: 2, padding: '9px 0', borderRadius: 8, border: 'none', background: ROLE.primary, color: '#fff', fontFamily: 'Inter,sans-serif', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: title.trim() && !createMut.isPending ? 1 : 0.5 }}>
            {createMut.isPending ? '...' : 'Создать событие'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── MetaItem ───────────────────────────────────────────────────────────────────

function MetaItem({ icon, label, value, highlight }: { icon: string; label: string; value: string; highlight?: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3 }}>{icon} {label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: highlight ?? 'var(--text-1)' }}>{value}</div>
    </div>
  )
}

// ── OpenTask — fetches a task by id and shows TaskModal ───────────────────────

function OpenTask({ taskId, onClose, onDone, onOpenChatWith }: { taskId: string; onClose: () => void; onDone: () => void; onOpenChatWith?: OpenChatFn }) {
  const { data: task } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => api.get(`/tasks/${taskId}`).then(r => r.data),
    staleTime: 0,
  })
  if (!task) return null
  return <TaskModal editTask={task} onClose={onClose} onDone={onDone} onOpenChatWith={onOpenChatWith} />
}

// ── TrackDetail ────────────────────────────────────────────────────────────────

function TrackDetail({ trackId, onClose, onOpenChatWith, onOpenTrackChat }: { trackId: string; onClose: () => void; onOpenChatWith?: OpenChatFn; onOpenTrackChat?: (chatId: string) => void }) {
  const currentUser = useAuthStore(s => s.user)
  const qc = useQueryClient()
  const [editing,      setEditing]      = useState(false)
  const [creatingEvent, setCreatingEvent] = useState(false)
  const [openTaskId,   setOpenTaskId]   = useState<string | null>(null)

  const { data: track, isLoading, error } = useQuery<TrackDetail>({
    queryKey: ['track', trackId],
    queryFn:  () => api.get(`/tracks/${trackId}`).then(r => r.data),
    staleTime: 0, refetchOnMount: 'always',
  })

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/tracks/${trackId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tracks'] }); onClose() },
    onError: (e: any) => alert(e?.response?.data?.error ?? 'Ошибка'),
  })

  const canEdit  = !!currentUser && (currentUser.isAdmin || track?.leaderId === currentUser.id)
  const isMember = !!currentUser && (canEdit || !!track?.members.some(m => m.user.id === currentUser.id))

  if (isLoading) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 14 }}>Загрузка...</div>
  if (error || !track) return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
      <div style={{ fontSize: 14, color: 'var(--danger)' }}>Трек не найден</div>
      <button onClick={onClose} style={{ padding: '7px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>Назад</button>
    </div>
  )

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'Inter,sans-serif' }}>
      {/* Header */}
      <div style={{ padding: '20px 32px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18, padding: 0, lineHeight: 1, marginTop: 3, flexShrink: 0 }}>←</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: STATUS_COLOR[track.status] + '22', color: STATUS_COLOR[track.status] }}>{STATUS_LABEL[track.status]}</span>
            </div>
            <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--text-1)', lineHeight: 1.2 }}>{track.title}</div>
            {track.description && <div style={{ fontSize: 14, color: 'var(--text-3)', marginTop: 5, lineHeight: 1.5 }}>{track.description}</div>}
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {isMember && track.chat && onOpenTrackChat && (
              <button onClick={() => onOpenTrackChat(track.chat!.id)} style={{ ...tonal('primary'), padding: '6px 14px', fontSize: 12, fontWeight: 600 }}>💬 Чат трека</button>
            )}
            <button onClick={() => setCreatingEvent(true)} style={{ ...tonal('info'), padding: '6px 14px', fontSize: 12, fontWeight: 600 }}>📅 Событие</button>
            {canEdit && (
              <>
                <button onClick={() => setEditing(true)} style={{ ...outline(), padding: '6px 14px', fontSize: 12, fontWeight: 600 }}>Редактировать</button>
                <button onClick={() => { if (confirm('Удалить трек?')) deleteMut.mutate() }} style={{ ...tonal('danger'), padding: '6px 14px', fontSize: 12, fontWeight: 600 }}>Удалить</button>
              </>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <MetaItem icon="👤" label="Лидер" value={track.leader.name} />
          {track.deadline && <MetaItem icon="📅" label="Дедлайн" value={fmtDate(track.deadline) ?? ''} highlight={daysDiff(track.deadline) <= 3 ? '#F43F5E' : undefined} />}
          <MetaItem icon="👥" label="Участники" value={track.members.length === 0 ? 'Нет' : track.members.map(m => m.user.name).join(', ')} />
        </div>
      </div>

      {/* §9: встречи, привязанные к треку (видны прямо здесь, не только в календаре) */}
      {track.events && track.events.length > 0 && (
        <div style={{ padding: '12px 32px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Встречи трека ({track.events.length})</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {track.events.map(ev => (
              <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', fontSize: 12, opacity: ev.status === 'done' ? 0.6 : 1 }}>
                <span style={{ color: '#8B5CF6', fontWeight: 700 }}>{new Date(ev.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span>
                <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{ev.startTime.slice(0, 5)}–{ev.endTime.slice(0, 5)}</span>
                <span style={{ color: 'var(--text-1)' }}>{ev.title}</span>
                {ev.status === 'done' && <span style={{ color: '#22C55E', fontSize: 11 }}>✓</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <StageTimeline track={track} isInvolved={isMember} canDeleteStage={canEdit} onOpenTask={id => setOpenTaskId(id)} onOpenChatWith={onOpenChatWith} />

      {editing      && <TrackFormModal initial={track} onClose={() => setEditing(false)} onSaved={() => {}} />}
      {creatingEvent && <CreateTrackEventModal track={track} onClose={() => setCreatingEvent(false)} />}
      {openTaskId && <OpenTask taskId={openTaskId} onClose={() => setOpenTaskId(null)} onDone={() => { qc.invalidateQueries({ queryKey: ['track', trackId] }); qc.invalidateQueries({ queryKey: ['tasks'] }); setOpenTaskId(null) }} onOpenChatWith={onOpenChatWith} />}
    </div>
  )
}

// ── TrackCard ──────────────────────────────────────────────────────────────────

function TrackCard({ track, onClick }: { track: Track; onClick: () => void }) {
  const daysLeft = track.deadline ? daysDiff(track.deadline) : null

  const doneTasks  = track.tasks.filter(t => t.status === 'done').length
  const totalTasks = track.tasks.length

  const sortedStages = [...track.stages].sort((a, b) => a.order - b.order)
  const doneStages   = sortedStages.filter(s => s.tasks.length > 0 && s.tasks.every(t => t.status === 'done')).length
  const totalStages  = sortedStages.length

  const memberCount = track.members.length + 1

  return (
    <div onClick={onClick}
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10, transition: 'border-color 0.12s', fontFamily: 'Inter,sans-serif' }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = ROLE.primary + '59')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.3, marginBottom: 2 }}>{track.title}</div>
          {track.description && <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.description}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <DonutChart done={doneTasks}  total={totalTasks}       label="Задачи" color="#0EA5E9" />
          <DonutChart done={doneStages} total={totalStages || 1} label="Этапы"  color="#FF6B35" />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: STATUS_COLOR[track.status] + '22', color: STATUS_COLOR[track.status] }}>{STATUS_LABEL[track.status]}</span>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>👥 {memberCount}</span>
        </div>
        {daysLeft !== null && (
          <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: (daysLeft < 0 ? '#F43F5E' : daysLeft <= 3 ? '#F59E0B' : 'var(--text-muted)') + '22', color: daysLeft < 0 ? '#F43F5E' : daysLeft <= 3 ? '#F59E0B' : 'var(--text-muted)' }}>
            {daysLeft < 0 ? `просрочено ${Math.abs(daysLeft)} д.` : daysLeft === 0 ? 'сегодня' : `${daysLeft} дн.`}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────

export function TracksPage({ onOpenChatWith, onOpenTrackChat }: { onOpenChatWith?: OpenChatFn; onOpenTrackChat?: (chatId: string) => void } = {}) {
  const [creating, setCreating] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

  const { data: tracks = [], isLoading } = useQuery<Track[]>({
    queryKey: ['tracks'],
    queryFn:  () => api.get('/tracks').then(r => r.data),
    staleTime: 0, refetchOnMount: 'always',
  })

  const active   = tracks.filter(t => t.status === 'active')
  const inactive = tracks.filter(t => t.status !== 'active')

  if (detailId) {
    return <TrackDetail trackId={detailId} onClose={() => setDetailId(null)} onOpenChatWith={onOpenChatWith} onOpenTrackChat={onOpenTrackChat} />
  }

  return (
    <div style={{ padding: '28px 32px', fontFamily: 'Inter,sans-serif', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-1)' }}>Треки</div>
        <button onClick={() => setCreating(true)} style={filled('primary')}>
          + Новый трек
        </button>
      </div>

      {isLoading && <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Загрузка...</div>}
      {!isLoading && active.length === 0 && inactive.length === 0 && (
        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 14 }}>Нет треков. Создайте первый.</div>
      )}

      {active.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>Активные ({active.length})</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {active.map(t => <TrackCard key={t.id} track={t} onClick={() => setDetailId(t.id)} />)}
          </div>
        </div>
      )}

      {inactive.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>Завершённые / Архив ({inactive.length})</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {inactive.map(t => <TrackCard key={t.id} track={t} onClick={() => setDetailId(t.id)} />)}
          </div>
        </div>
      )}

      {creating && <TrackFormModal onClose={() => setCreating(false)} onSaved={() => {}} />}
    </div>
  )
}