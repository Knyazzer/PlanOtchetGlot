import { useState, useEffect, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, RotateCcw, X, Link2 } from 'lucide-react'
import { api } from '../lib/api'
import { ROLE } from '../lib/roleColors'
import { useAuthStore } from '../stores/auth'
import { useConfirm } from '../components/ConfirmModal'

// Стратегия компании — канбан целей квартала/года, каскад департамент→отдел. См. docs/STRATEGIC-GOALS.md §11.

interface Goal { id: string; title: string; description: string | null; deptId: string; divisionId: string | null; parentGoalId: string | null; kind: string; horizon: string; periodKey: string; status: string; outcome: string | null; sortOrder: number; createdById: string; closedAt: string | null; carriedFromId?: string | null; tasksTotal?: number; tasksDone?: number; trackCount?: number }

// Прошлый период (квартал/год завершился) → цели read-only
function isPastPeriod(pk: string): boolean {
  const now = new Date(), y = now.getFullYear(), q = Math.floor(now.getMonth() / 3) + 1
  const m = pk.match(/^(\d{4})(?:-Q([1-4]))?$/); if (!m) return false
  const py = Number(m[1]), pq = m[2] ? Number(m[2]) : null
  return pq === null ? py < y : (py < y || (py === y && pq < q))
}
interface TrackLite { id: string; title: string; status: string; goalId: string | null; total: number; done: number }
interface GoalDetailData extends Goal { tracks: TrackLite[]; looseTasks: Array<{ id: string; title: string; status: string }>; progress: { total: number; done: number; trackCount: number } }
interface Div { id: string; name: string; head?: { id: string; name: string } | null; memberships: Array<{ user: { id: string } }> }
interface Dept { id: string; name: string; color?: string; director?: { id: string; name: string } | null; divisions: Div[] }

const STATUS: Record<string, { label: string; color: string }> = {
  active:  { label: 'В работе',   color: ROLE.info },
  done:    { label: 'Достигнута', color: ROLE.success },
  partial: { label: 'Частично',   color: ROLE.warning },
  dropped: { label: 'Снята',      color: ROLE.danger },
}
// колонки канбана → какой статус
const COLS = [
  { key: 'plan', title: 'План на период', color: ROLE.info, match: (g: Goal) => g.status === 'active' },
  { key: 'done', title: 'Реализовано', color: ROLE.success, match: (g: Goal) => g.status === 'done' },
  { key: 'notdone', title: 'Не реализовано', color: ROLE.danger, match: (g: Goal) => g.status === 'partial' || g.status === 'dropped' },
]

export function StrategyPage() {
  const me = useAuthStore(s => s.user)
  const isAdmin = !!me?.isAdmin
  const qc = useQueryClient()
  const { confirm, confirmUI } = useConfirm()
  const now = new Date()
  const [periodKey, setPeriodKey] = useState(() => `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`)
  const year = periodKey.slice(0, 4)
  const [deptId, setDeptId] = useState<string | null>(null)
  const [divId, setDivId] = useState<string | null>(null) // null = уровень департамента

  const { data: structure = [] } = useQuery<Dept[]>({ queryKey: ['structure'], queryFn: () => api.get('/structure').then(r => r.data), staleTime: 300_000 })
  const { data: goals = [] } = useQuery<Goal[]>({ queryKey: ['strategic-goals', periodKey], queryFn: () => api.get(`/strategic-goals?periodKey=${periodKey}`).then(r => r.data), staleTime: 30_000 })

  const canManage = (dept?: Dept | null, div?: Div | null) => !!dept && (isAdmin || dept.director?.id === me?.id || (!!div && div.head?.id === me?.id))
  const mine = (dept: Dept) => isAdmin || canManage(dept) || dept.divisions.some(dv => dv.head?.id === me?.id || dv.memberships.some(m => m.user.id === me?.id))
  // Директор любого департамента видит ВСЕ департаменты (как и админ); остальные — свой охват.
  const isDirector = structure.some(d => d.director?.id === me?.id)
  // Кто может ПРИВЯЗЫВАТЬ треки/задачи к цели (вклад ≠ правка): админ | директор департамента цели | рук/сотрудник отдела цели.
  const canContributeGoal = (g: Goal): boolean => {
    if (isAdmin) return true
    const d = structure.find(x => x.id === g.deptId)
    if (d?.director?.id === me?.id) return true
    if (g.divisionId && d) { const dv = d.divisions.find(v => v.id === g.divisionId); return !!dv && (dv.head?.id === me?.id || dv.memberships.some(m => m.user.id === me?.id)) }
    return false
  }
  const depts = useMemo(() => (isAdmin || isDirector) ? structure : structure.filter(d => mine(d) || goals.some(g => g.deptId === d.id)), [structure, goals, isAdmin, isDirector, me?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // выбранный департамент по умолчанию — первый доступный
  useEffect(() => { if (!deptId && depts.length) setDeptId(depts[0].id) }, [depts, deptId])
  const dept = depts.find(d => d.id === deptId) ?? null
  const div = divId ? dept?.divisions.find(d => d.id === divId) ?? null : null
  const isPast = isPastPeriod(periodKey)                       // прошлый период — read-only
  const editable = canManage(dept, div) && !isPast
  const canClosePeriod = !isPast && !!dept && (isAdmin || dept.director?.id === me?.id) // закрыть период — директор/админ

  const invalidate = () => qc.invalidateQueries({ queryKey: ['strategic-goals'] })
  const setStatus = useMutation({ mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/strategic-goals/${id}/close`, { status }), onSuccess: invalidate })
  const del = useMutation({ mutationFn: (id: string) => api.delete(`/strategic-goals/${id}`), onSuccess: invalidate })

  const [modal, setModal] = useState<{ deptId: string; divisionId: string | null; kind: 'goal' | 'growth'; edit?: Goal } | null>(null)
  const [closing, setClosing] = useState<Goal | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [closePeriod, setClosePeriod] = useState(false)

  // цели текущего уровня (департамент или отдел)
  const levelGoals = goals.filter(g => g.deptId === deptId && (g.divisionId ?? null) === divId)
  const kanban = levelGoals.filter(g => g.kind !== 'growth')
  const growth = levelGoals.filter(g => g.kind === 'growth')

  // drag-drop
  const onDropTo = (col: string, goalId: string) => {
    const g = kanban.find(x => x.id === goalId); if (!g || !editable) return
    if (col === 'plan') setStatus.mutate({ id: goalId, status: 'active' })
    else if (col === 'done') setStatus.mutate({ id: goalId, status: 'done' })
    else setClosing(g) // «не реализовано» — нужен итог (partial/dropped)
  }

  const quarters = [1, 2, 3, 4].map(n => ({ key: `${year}-Q${n}`, label: `Q${n}` }))

  return (
    <div style={{ padding: '20px 24px', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
      {/* Навигация: департамент (слева) · период (справа) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
          {depts.map(d => <Chip key={d.id} active={d.id === deptId} onClick={() => { setDeptId(d.id); setDivId(null) }} dot={d.color}>{d.name}</Chip>)}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {quarters.map(q => <Chip key={q.key} active={periodKey === q.key} onClick={() => setPeriodKey(q.key)}>{q.label}</Chip>)}
          <Chip active={periodKey === year} onClick={() => setPeriodKey(year)}>Год</Chip>
          {canClosePeriod && (
            <button onClick={() => setClosePeriod(true)}
              style={{ marginLeft: 6, background: ROLE.primary, color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Закрыть период
            </button>
          )}
        </div>
      </div>

      {isPast && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: ROLE.warning + '18', border: '1px solid ' + ROLE.warning + '44', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: 'var(--text-2)' }}>
          <span style={{ fontWeight: 700, color: ROLE.warning }}>Период закрыт</span> — прошлый квартал доступен только для просмотра (read-only).
        </div>
      )}

      {/* Под-вкладки: Департамент (общие) + отделы */}
      {dept && (
        <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 16, flexWrap: 'wrap' }}>
          <SubTab active={divId === null} onClick={() => setDivId(null)}>Департамент</SubTab>
          {dept.divisions.map(dv => <SubTab key={dv.id} active={divId === dv.id} onClick={() => setDivId(dv.id)}>{dv.name}</SubTab>)}
        </div>
      )}

      {!dept ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '20px 0' }}>В вашем охвате нет департаментов.</div>
      ) : (
        <>
          {/* Канбан 3 колонки (+ доработки справа только на уровне департамента) */}
          <div style={{ display: 'grid', gridTemplateColumns: divId === null ? '1fr 1fr 1fr 320px' : '1fr 1fr 1fr', gap: 14, alignItems: 'start' }}>
            {COLS.map(col => {
              const cards = kanban.filter(col.match)
              return (
                <div key={col.key}
                  onDragOver={e => { if (editable) e.preventDefault() }}
                  onDrop={e => { const id = e.dataTransfer.getData('text/plain'); if (id) onDropTo(col.key, id) }}
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 10, minHeight: 160 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '2px 4px 10px' }}>
                    <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: col.color, flex: 1 }}>{col.title}</span>
                    <span style={{ fontSize: 11, fontWeight: 800, padding: '1px 7px', borderRadius: 20, background: col.color + '26', color: col.color }}>{cards.length}</span>
                  </div>
                  {cards.map(g => (
                    <GoalCard key={g.id} g={g} editable={editable}
                      draggable={editable}
                      onOpen={() => setDetailId(g.id)}
                      onEdit={() => setModal({ deptId: g.deptId, divisionId: g.divisionId, kind: 'goal', edit: g })}
                      onClose={() => setClosing(g)}
                      onDelete={() => confirm({ message: 'Удалить цель?', confirmLabel: 'Удалить', danger: true }).then(ok => ok && del.mutate(g.id))} />
                  ))}
                  {col.key === 'plan' && editable && (
                    <button onClick={() => setModal({ deptId: deptId!, divisionId: divId, kind: 'goal' })} style={addDashed}><Plus size={13} /> Цель</button>
                  )}
                </div>
              )
            })}

            {/* Доработки к собранию — только на уровне департамента */}
            {divId === null && <MeetingNotes deptId={deptId!} periodKey={periodKey} editable={canManage(dept)} />}
          </div>

          {/* Зоны роста — под колонками, во всю ширину */}
          <div style={{ marginTop: 16, background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px' }}>
            <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: ROLE.warning, marginBottom: 10 }}>Зоны роста</div>
            {growth.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>Пока не выделено.</div>}
            {growth.map(g => (
              <div key={g.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0' }}>
                <span style={{ color: ROLE.warning, fontWeight: 800, marginTop: 1 }}>→</span>
                <span style={{ flex: 1, fontSize: 14, color: 'var(--text-1)', lineHeight: 1.4 }}>{g.title}</span>
                {editable && <button onClick={() => confirm({ message: 'Удалить зону роста?', confirmLabel: 'Удалить', danger: true }).then(ok => ok && del.mutate(g.id))} style={iconBtn}><Trash2 size={13} /></button>}
              </div>
            ))}
            {editable && <button onClick={() => setModal({ deptId: deptId!, divisionId: divId, kind: 'growth' })} style={{ ...addDashed, width: 'auto', marginTop: 8, padding: '6px 12px' }}><Plus size={13} /> Зона роста</button>}
          </div>
        </>
      )}

      {modal && <GoalModal ctx={modal} periodKey={periodKey} year={year} onClose={() => setModal(null)} onSaved={invalidate} />}
      {closing && <CloseGoalModal goal={closing} onClose={() => setClosing(null)} onSaved={invalidate} />}
      {detailId && <GoalDetail goalId={detailId} canContribute={(() => { const dg = goals.find(g => g.id === detailId); return dg ? canContributeGoal(dg) : false })()} meId={me?.id} onClose={() => setDetailId(null)} onChanged={invalidate} />}
      {closePeriod && dept && <ClosePeriodModal deptId={dept.id} deptName={dept.name} periodKey={periodKey} goals={goals.filter(g => g.deptId === dept.id && g.status === 'active' && g.kind !== 'growth')} onClose={() => setClosePeriod(false)} onDone={() => { setClosePeriod(false); invalidate() }} />}
      {confirmUI}
    </div>
  )
}

function GoalCard({ g, editable, draggable, onOpen, onEdit, onClose, onDelete }: { g: Goal; editable: boolean; draggable: boolean; onOpen: () => void; onEdit: () => void; onClose: () => void; onDelete: () => void }) {
  const st = STATUS[g.status] ?? { label: g.status, color: 'var(--text-muted)' }
  const total = g.tasksTotal ?? 0, done = g.tasksDone ?? 0
  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    <div draggable={draggable} onDragStart={e => e.dataTransfer.setData('text/plain', g.id)}
      style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 9, padding: '10px 12px', marginBottom: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', cursor: draggable ? 'grab' : 'default' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div onClick={onOpen} title="Открыть цель" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', lineHeight: 1.3, cursor: 'pointer' }}>
            {g.title}
            {g.horizon === 'year' && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: ROLE.primary, background: ROLE.primary + '1c', padding: '1px 6px', borderRadius: 5 }}>ГОД</span>}
            {g.carriedFromId && <span title="Перенесена из прошлого периода" style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: ROLE.warning, background: ROLE.warning + '1c', padding: '1px 6px', borderRadius: 5 }}>↩ ПЕРЕНОС</span>}
          </div>
          {g.description && <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 3 }}>{g.description}</div>}
          {(g.status === 'partial' || g.status === 'dropped') && <span style={{ display: 'inline-block', marginTop: 5, fontSize: 10, fontWeight: 800, padding: '1px 7px', borderRadius: 20, background: st.color + '22', color: st.color }}>{st.label}</span>}
          {g.closedAt && g.outcome && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 5, borderTop: '1px dashed var(--border)', paddingTop: 5 }}>Итог: {g.outcome}</div>}
          {/* Прогресс по задачам привязанных треков (+ прямые задачи, у департамента — roll-up) */}
          {(total > 0 || (g.trackCount ?? 0) > 0) && (
            <div style={{ marginTop: 8 }}>
              <div style={{ height: 5, borderRadius: 3, background: 'var(--surface-3)', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: ROLE.success, transition: 'width 0.3s' }} />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>
                <span>{done}/{total} задач</span>
                {(g.trackCount ?? 0) > 0 && <span>· {g.trackCount} трек{plural(g.trackCount!)}</span>}
                <span style={{ marginLeft: 'auto', fontWeight: 700, color: pct === 100 ? ROLE.success : 'var(--text-muted)' }}>{pct}%</span>
              </div>
            </div>
          )}
        </div>
        {editable && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
            <button onClick={onClose} title="Итог/статус" style={iconBtn}><RotateCcw size={13} /></button>
            {!g.closedAt && <button onClick={onEdit} title="Править" style={iconBtn}><Pencil size={13} /></button>}
            {!g.closedAt && <button onClick={onDelete} title="Удалить" style={iconBtn}><Trash2 size={13} /></button>}
          </div>
        )}
      </div>
    </div>
  )
}

// склонение «трек/трека/треков»
function plural(n: number): string {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return ''
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'а'
  return 'ов'
}

// Панель деталей цели: прогресс, привязанные треки (с прогрессом каждого), прямые задачи,
// привязка/отвязка трека к цели. Сбоку (не модал, без блюра); закрытие — правило попапов + Esc + ✕.
function GoalDetail({ goalId, canContribute, meId, onClose, onChanged }: { goalId: string; canContribute: boolean; meId?: string; onClose: () => void; onChanged: () => void }) {
  const qc = useQueryClient()
  const mdRef = useRef(false)
  const { data: d, isLoading } = useQuery<GoalDetailData>({ queryKey: ['strategic-goal', goalId], queryFn: () => api.get(`/strategic-goals/${goalId}`).then(r => r.data), staleTime: 10_000 })
  const { data: allTracks = [] } = useQuery<Array<{ id: string; title: string; goalId: string | null; leaderId?: string }>>({ queryKey: ['tracks'], queryFn: () => api.get('/tracks').then(r => r.data), staleTime: 30_000, enabled: canContribute })
  const { data: members = [] } = useQuery<Array<{ id: string; name: string }>>({ queryKey: ['members'], queryFn: () => api.get('/users/members').then(r => r.data), staleTime: 300_000, enabled: canContribute })

  const [menu, setMenu] = useState(false)          // открыт список привязки/создания
  const [creating, setCreating] = useState(false)  // форма создания трека
  const [newTitle, setNewTitle] = useState('')
  const [newMembers, setNewMembers] = useState<Set<string>>(new Set())
  const [tab, setTab] = useState<'overview' | 'history'>('overview')

  const { data: logs = [] } = useQuery<Array<{ id: string; action: string; details: string | null; userName: string; createdAt: string; meta?: { changes?: Array<{ field: string; label: string; from: string | null; to: string | null }> } | null }>>({
    queryKey: ['strategic-goal-log', goalId],
    queryFn: () => api.get(`/strategic-goals/${goalId}/log`).then(r => r.data),
    enabled: tab === 'history',
    staleTime: 0,
  })

  useEffect(() => { const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (menu ? setMenu(false) : onClose()); document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey) }, [onClose, menu])

  const refresh = () => { qc.invalidateQueries({ queryKey: ['strategic-goal', goalId] }); qc.invalidateQueries({ queryKey: ['tracks'] }); onChanged() }
  const attach = useMutation({ mutationFn: (trackId: string) => api.patch(`/tracks/${trackId}`, { goalId }), onSuccess: () => { setMenu(false); refresh() }, onError: (e: any) => alert(e?.response?.data?.error ?? 'Не удалось привязать трек') })
  const detach = useMutation({ mutationFn: (trackId: string) => api.patch(`/tracks/${trackId}`, { goalId: null }), onSuccess: refresh, onError: (e: any) => alert(e?.response?.data?.error ?? 'Не удалось отвязать') })
  const create = useMutation({
    mutationFn: async () => {
      const res = await api.post('/tracks', { title: newTitle.trim(), memberIds: [...newMembers] })
      const id = res.data?.id
      if (id) await api.patch(`/tracks/${id}`, { goalId })  // сразу привязываем к цели
    },
    onSuccess: () => { setCreating(false); setMenu(false); setNewTitle(''); setNewMembers(new Set()); refresh() },
    onError: (e: any) => alert(e?.response?.data?.error ?? 'Не удалось создать трек'),
  })

  // Привязать можно свой трек (лидер), ещё не привязанный к этой цели; админ — любой
  const available = allTracks.filter(t => t.goalId !== goalId && (!t.leaderId || t.leaderId === meId))
  const toggleMember = (id: string) => setNewMembers(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const pct = d && d.progress.total ? Math.round((d.progress.done / d.progress.total) * 100) : 0
  const st = d ? (STATUS[d.status] ?? { label: d.status, color: 'var(--text-muted)' }) : null

  return (
    <div onMouseDown={e => { mdRef.current = e.target === e.currentTarget }} onMouseUp={e => { if (mdRef.current && e.target === e.currentTarget) onClose(); mdRef.current = false }}
      style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ width: 420, maxWidth: '100%', height: '100%', background: 'var(--surface-1)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 24px rgba(0,0,0,0.35)' }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', flex: 1 }}>Цель</span>
          <button onClick={onClose} style={iconBtn}><X size={16} /></button>
        </div>

        {/* вкладки: Обзор | История */}
        <div style={{ display: 'flex', gap: 4, padding: '8px 12px 0', borderBottom: '1px solid var(--border)' }}>
          {(['overview', 'history'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', padding: '8px 12px', color: tab === t ? 'var(--text-1)' : 'var(--text-muted)', borderBottom: tab === t ? `2px solid ${ROLE.primary}` : '2px solid transparent', marginBottom: -1 }}>
              {t === 'overview' ? 'Обзор' : 'История'}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {isLoading || !d ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Загрузка…</div>
          : tab === 'history' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {logs.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic' }}>Изменений пока нет.</div>}
              {logs.map(l => (
                <div key={l.id} style={{ display: 'flex', gap: 10, padding: '10px 12px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: l.action === 'status' ? ROLE.success : l.action === 'created' ? ROLE.info : l.action.startsWith('track') ? ROLE.primary : 'var(--text-muted)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--text-1)', lineHeight: 1.4 }}><b style={{ fontWeight: 600 }}>{l.userName}</b> {l.details ?? l.action}</div>
                    {/* Диф «Было → Стало» по каждому изменённому полю */}
                    {l.meta?.changes?.map((c, ci) => (
                      <div key={ci} style={{ marginTop: 6, fontSize: 12, background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 3 }}>{c.label}</div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                          <span style={{ color: ROLE.danger, fontSize: 10, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>было</span>
                          <span style={{ color: 'var(--text-3)', textDecoration: 'line-through', wordBreak: 'break-word' }}>{c.from || '—'}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', marginTop: 2 }}>
                          <span style={{ color: ROLE.success, fontSize: 10, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>стало</span>
                          <span style={{ color: 'var(--text-1)', wordBreak: 'break-word' }}>{c.to || '—'}</span>
                        </div>
                      </div>
                    ))}
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{new Date(l.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.3 }}>{d.title}</div>
                {d.description && <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 6, lineHeight: 1.5 }}>{d.description}</div>}
                {st && <span style={{ display: 'inline-block', marginTop: 8, fontSize: 11, fontWeight: 800, padding: '2px 9px', borderRadius: 20, background: st.color + '22', color: st.color }}>{st.label}</span>}
                {d.closedAt && d.outcome && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8, borderTop: '1px dashed var(--border)', paddingTop: 8 }}>Итог: {d.outcome}</div>}
              </div>

              {/* Прогресс */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', flex: 1 }}>Прогресс</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: pct === 100 ? ROLE.success : 'var(--text-2)' }}>{pct}%</span>
                </div>
                <div style={{ height: 7, borderRadius: 4, background: 'var(--surface-3)', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: ROLE.success, transition: 'width 0.3s' }} />
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 5 }}>
                  {d.progress.done}/{d.progress.total} задач · {d.progress.trackCount} трек{plural(d.progress.trackCount)}
                  {d.divisionId === null && <span> · включая цели отделов (roll-up)</span>}
                </div>
              </div>

              {/* Треки */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: 8 }}>Треки цели</div>
                {d.tracks.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>Трек ещё не привязан.</div>}
                {d.tracks.map(t => {
                  const tp = t.total ? Math.round((t.done / t.total) * 100) : 0
                  return (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 6 }}>
                      <Link2 size={13} style={{ color: ROLE.info, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{t.done}/{t.total} задач · {tp}%</div>
                      </div>
                      {canContribute && <button onClick={() => detach.mutate(t.id)} title="Отвязать" style={iconBtn}><X size={13} /></button>}
                    </div>
                  )
                })}

                {/* Привязка / создание трека — тематический дропдаун (не нативный select) */}
                {canContribute && !creating && (
                  <div style={{ position: 'relative', marginTop: 8 }}>
                    <button onClick={() => setMenu(m => !m)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-2)', fontSize: 13, padding: '8px 11px', cursor: 'pointer', textAlign: 'left' }}>
                      <Plus size={14} style={{ color: ROLE.primary }} />
                      <span style={{ flex: 1 }}>Привязать или создать трек</span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', transform: menu ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
                    </button>
                    {menu && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 5, background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.28)', overflow: 'hidden', maxHeight: 260, overflowY: 'auto' }}>
                        <button onClick={() => { setCreating(true); setMenu(false) }}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', color: ROLE.primary, fontWeight: 600, fontSize: 13, padding: '9px 11px', cursor: 'pointer', textAlign: 'left' }}>
                          <Plus size={14} /> Создать новый трек…
                        </button>
                        {available.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '9px 11px', fontStyle: 'italic' }}>Своих свободных треков нет</div>}
                        {available.map(t => (
                          <button key={t.id} onClick={() => attach.mutate(t.id)} disabled={attach.isPending}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', color: 'var(--text-1)', fontSize: 13, padding: '9px 11px', cursor: 'pointer', textAlign: 'left' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                            <Link2 size={13} style={{ color: ROLE.info, flexShrink: 0 }} />
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Форма создания трека под цель (лидер = я, участники, сразу привязка) */}
                {canContribute && creating && (
                  <div style={{ marginTop: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                    <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Название трека"
                      style={{ width: '100%', boxSizing: 'border-box', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-1)', fontSize: 13, padding: '8px 10px', outline: 'none' }} />
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--text-muted)', margin: '10px 0 6px' }}>Участники</div>
                    <div style={{ maxHeight: 150, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {members.filter(m => m.id !== meId).map(m => (
                        <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-1)', padding: '4px 2px', cursor: 'pointer' }}>
                          <input type="checkbox" checked={newMembers.has(m.id)} onChange={() => toggleMember(m.id)} />
                          {m.name}
                        </label>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button onClick={() => create.mutate()} disabled={!newTitle.trim() || create.isPending}
                        style={{ background: ROLE.primary, color: '#fff', border: 'none', borderRadius: 7, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: newTitle.trim() ? 'pointer' : 'default', opacity: newTitle.trim() ? 1 : 0.5 }}>
                        {create.isPending ? 'Создаю…' : 'Создать и привязать'}
                      </button>
                      <button onClick={() => { setCreating(false); setNewTitle(''); setNewMembers(new Set()) }}
                        style={{ background: 'none', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 7, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>Отмена</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Прямые задачи (без трека) */}
              {d.looseTasks.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: 8 }}>Задачи напрямую</div>
                  {d.looseTasks.map(t => (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)', padding: '4px 0' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: t.status === 'done' ? ROLE.success : 'var(--text-muted)', flexShrink: 0 }} />
                      <span style={{ textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>{t.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function MeetingNotes({ deptId, periodKey, editable }: { deptId: string; periodKey: string; editable: boolean }) {
  const qc = useQueryClient()
  const { data } = useQuery<{ text: string }>({ queryKey: ['meeting-notes', deptId, periodKey], queryFn: () => api.get(`/meeting-notes?deptId=${deptId}&periodKey=${periodKey}`).then(r => r.data), staleTime: 30_000 })
  const [text, setText] = useState('')
  useEffect(() => { setText(data?.text ?? '') }, [data?.text])
  const put = useMutation({ mutationFn: (t: string) => api.put('/meeting-notes', { deptId, periodKey, text: t }), onSuccess: () => qc.invalidateQueries({ queryKey: ['meeting-notes', deptId, periodKey] }) })
  return (
    <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: 4 }}>Доработки к собранию</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>Заметки к встрече (уровень департамента).</div>
      <textarea value={text} onChange={e => setText(e.target.value)} onBlur={() => { if (editable && text !== (data?.text ?? '')) put.mutate(text) }} disabled={!editable}
        placeholder={editable ? '— что уточнить\n— что согласовать…' : 'Пусто'}
        style={{ width: '100%', boxSizing: 'border-box', minHeight: 220, resize: 'vertical', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px', color: 'var(--text-1)', fontFamily: 'Inter,sans-serif', fontSize: 13, outline: 'none', lineHeight: 1.5, opacity: editable ? 1 : 0.7 }} />
    </div>
  )
}

function GoalModal({ ctx, periodKey, year, onClose, onSaved }: { ctx: { deptId: string; divisionId: string | null; kind: 'goal' | 'growth'; edit?: Goal }; periodKey: string; year: string; onClose: () => void; onSaved: () => void }) {
  const edit = ctx.edit
  const isGrowth = ctx.kind === 'growth'
  const [title, setTitle] = useState(edit?.title ?? '')
  const [description, setDescription] = useState(edit?.description ?? '')
  const [horizon, setHorizon] = useState(edit?.horizon ?? (periodKey === year ? 'year' : 'quarter'))
  const down = useState({ v: false })[0]

  const save = useMutation({
    mutationFn: () => {
      if (edit) return api.patch(`/strategic-goals/${edit.id}`, { title: title.trim(), description: description.trim() || null })
      const pk = isGrowth ? (periodKey === year ? `${year}-Q${Math.floor(new Date().getMonth() / 3) + 1}` : periodKey)
        : (horizon === 'year' ? year : (periodKey === year ? `${year}-Q${Math.floor(new Date().getMonth() / 3) + 1}` : periodKey))
      return api.post('/strategic-goals', { title: title.trim(), description: description.trim() || undefined, deptId: ctx.deptId, divisionId: ctx.divisionId, kind: ctx.kind, horizon: isGrowth ? 'quarter' : horizon, periodKey: pk })
    },
    onSuccess: () => { onSaved(); onClose() },
    onError: (e: unknown) => { const err = e as { response?: { data?: { error?: string } } }; alert(err?.response?.data?.error ?? 'Не удалось сохранить') },
  })

  return (
    <div onMouseDown={e => { down.v = e.target === e.currentTarget }} onMouseUp={e => { if (down.v && e.target === e.currentTarget) onClose(); down.v = false }}
      style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onMouseDown={e => e.stopPropagation()} style={{ width: 460, maxWidth: '100%', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 16, padding: 22, boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', marginBottom: 16 }}>{edit ? 'Правка' : isGrowth ? 'Зона роста' : ctx.divisionId ? 'Цель отдела' : 'Цель департамента'}</div>
        <Label>{isGrowth ? 'Формулировка' : 'Название'}</Label>
        <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder={isGrowth ? 'На что обратить внимание' : 'Что нужно достичь'} style={inp} />
        {!edit && !isGrowth && (
          <div style={{ marginTop: 14 }}>
            <Label>Горизонт</Label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[['quarter', 'Квартал'], ['year', 'Год']].map(([v, l]) => {
                const s = horizon === v
                return <button key={v} onClick={() => setHorizon(v)} style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: `1px solid ${s ? ROLE.primary : 'var(--border)'}`, background: s ? ROLE.primary + '1f' : 'none', color: s ? ROLE.primary : 'var(--text-2)', fontSize: 13, fontWeight: s ? 700 : 500, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>{l}</button>
              })}
            </div>
          </div>
        )}
        {!isGrowth && (
          <div style={{ marginTop: 14 }}>
            <Label>Описание (необязательно)</Label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{ ...inp, resize: 'vertical' }} />
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
          <button onClick={onClose} style={btnGhost}>Отмена</button>
          <button onClick={() => title.trim() && save.mutate()} disabled={!title.trim() || save.isPending} style={{ ...btnPrimary, opacity: title.trim() ? 1 : 0.5 }}>{save.isPending ? '…' : 'Сохранить'}</button>
        </div>
      </div>
    </div>
  )
}

function CloseGoalModal({ goal, onClose, onSaved }: { goal: Goal; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState(goal.status === 'active' ? 'done' : goal.status)
  const [outcome, setOutcome] = useState(goal.outcome ?? '')
  const down = useState({ v: false })[0]
  const needOutcome = status === 'partial' || status === 'dropped'
  const save = useMutation({
    mutationFn: () => api.patch(`/strategic-goals/${goal.id}/close`, { status, outcome: outcome.trim() || undefined }),
    onSuccess: () => { onSaved(); onClose() },
    onError: (e: unknown) => { const err = e as { response?: { data?: { error?: string } } }; alert(err?.response?.data?.error ?? 'Не удалось сохранить') },
  })
  return (
    <div onMouseDown={e => { down.v = e.target === e.currentTarget }} onMouseUp={e => { if (down.v && e.target === e.currentTarget) onClose(); down.v = false }}
      style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onMouseDown={e => e.stopPropagation()} style={{ width: 440, maxWidth: '100%', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 16, padding: 22, boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>Итог по цели</div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16 }}>{goal.title}</div>
        <Label>Статус</Label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {(['done', 'partial', 'dropped', 'active'] as const).map(s => {
            const meta = STATUS[s]; const sel = status === s
            return <button key={s} onClick={() => setStatus(s)} style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${sel ? meta.color : 'var(--border)'}`, background: sel ? meta.color + '1f' : 'none', color: sel ? meta.color : 'var(--text-2)', fontSize: 13, fontWeight: sel ? 700 : 500, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>{s === 'active' ? 'В работу' : meta.label}</button>
          })}
        </div>
        {status !== 'active' && (
          <>
            <Label>Итог / почему {needOutcome && <span style={{ color: ROLE.danger }}>*</span>}</Label>
            <textarea value={outcome} onChange={e => setOutcome(e.target.value)} rows={3} placeholder="Что сделано / почему не сделано" style={{ ...inp, resize: 'vertical' }} />
          </>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
          <button onClick={onClose} style={btnGhost}>Отмена</button>
          <button onClick={() => save.mutate()} disabled={save.isPending || (needOutcome && !outcome.trim())} style={{ ...btnPrimary, opacity: (needOutcome && !outcome.trim()) ? 0.5 : 1 }}>{save.isPending ? '…' : 'Сохранить'}</button>
        </div>
      </div>
    </div>
  )
}

// ── стили/хелперы ──
function Chip({ active, onClick, dot, children }: { active: boolean; onClick: () => void; dot?: string; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 13px', borderRadius: 8, border: `1px solid ${active ? ROLE.primary : 'var(--border)'}`, background: active ? ROLE.primary + '1f' : 'var(--surface-1)', color: active ? ROLE.primary : 'var(--text-2)', fontSize: 13, fontWeight: active ? 700 : 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>{dot && <span style={{ width: 8, height: 8, borderRadius: 3, background: dot, flexShrink: 0 }} />}{children}</button>
}
function SubTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ padding: '8px 14px', fontSize: 13, fontWeight: active ? 700 : 600, color: active ? ROLE.primary : 'var(--text-muted)', background: 'none', border: 'none', borderBottom: `2px solid ${active ? ROLE.primary : 'transparent'}`, marginBottom: -1, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>{children}</button>
}
function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 7 }}>{children}</div>
}
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px', color: 'var(--text-1)', fontFamily: 'Inter,sans-serif', fontSize: 14, outline: 'none', lineHeight: 1.45 }
const iconBtn: React.CSSProperties = { background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, display: 'flex' }
const addDashed: React.CSSProperties = { width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, border: '1px dashed var(--border)', background: 'none', borderRadius: 8, padding: '7px', color: ROLE.primary, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }
const btnGhost: React.CSSProperties = { padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text-2)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }
const btnPrimary: React.CSSProperties = { padding: '9px 18px', borderRadius: 8, border: 'none', background: ROLE.primary, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }

// Мастер закрытия периода: по каждой активной цели департамента — статус + итог + опц. перенос.
const CLOSE_OPTS: Array<{ v: 'done' | 'partial' | 'dropped'; label: string; color: string }> = [
  { v: 'done', label: 'Достигнута', color: ROLE.success },
  { v: 'partial', label: 'Частично', color: ROLE.warning },
  { v: 'dropped', label: 'Снята', color: ROLE.danger },
]
function ClosePeriodModal({ deptId, deptName, periodKey, goals, onClose, onDone }: { deptId: string; deptName: string; periodKey: string; goals: Goal[]; onClose: () => void; onDone: () => void }) {
  const mdRef = useRef(false)
  const [dec, setDec] = useState<Record<string, { status: 'done' | 'partial' | 'dropped'; outcome: string; carry: boolean }>>(
    () => Object.fromEntries(goals.map(g => [g.id, { status: 'done' as const, outcome: '', carry: false }])),
  )
  const set = (id: string, patch: Partial<{ status: 'done' | 'partial' | 'dropped'; outcome: string; carry: boolean }>) => setDec(d => ({ ...d, [id]: { ...d[id], ...patch } }))
  const missing = goals.some(g => { const x = dec[g.id]; return (x.status === 'partial' || x.status === 'dropped') && !x.outcome.trim() })

  const submit = useMutation({
    mutationFn: () => api.post('/strategic-goals/close-period', {
      deptId, periodKey,
      decisions: goals.map(g => ({ goalId: g.id, status: dec[g.id].status, outcome: dec[g.id].outcome.trim() || undefined, carry: dec[g.id].carry })),
    }),
    onSuccess: onDone,
    onError: (e: any) => alert(e?.response?.data?.error ?? 'Не удалось закрыть период'),
  })

  return (
    <div onMouseDown={e => { mdRef.current = e.target === e.currentTarget }} onMouseUp={e => { if (mdRef.current && e.target === e.currentTarget) onClose(); mdRef.current = false }}
      style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: 620, maxWidth: '100%', maxHeight: 'calc(100vh - 48px)', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 14, display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>Закрыть период · {periodKey}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{deptName} · итог по целям квартальной встречи</div>
          </div>
          <button onClick={onClose} style={{ ...iconBtn, fontSize: 18 }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {goals.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', padding: 20 }}>Активных целей нет — закрывать нечего.</div>}
          {goals.map(g => {
            const x = dec[g.id]
            return (
              <div key={g.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--surface-2)' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', marginBottom: 8 }}>{g.title}</div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                  {CLOSE_OPTS.map(o => (
                    <button key={o.v} onClick={() => set(g.id, { status: o.v })}
                      style={{ background: x.status === o.v ? o.color : 'var(--surface-1)', color: x.status === o.v ? '#fff' : 'var(--text-2)', border: '1px solid ' + (x.status === o.v ? o.color : 'var(--border)'), borderRadius: 7, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {o.label}
                    </button>
                  ))}
                </div>
                {(x.status === 'partial' || x.status === 'dropped') && (
                  <textarea value={x.outcome} onChange={e => set(g.id, { outcome: e.target.value })} placeholder="Итог/почему (обязательно)"
                    style={{ width: '100%', boxSizing: 'border-box', minHeight: 52, resize: 'vertical', background: 'var(--surface-1)', border: '1px solid ' + (x.outcome.trim() ? 'var(--border)' : ROLE.danger + '88'), borderRadius: 8, padding: '8px 10px', color: 'var(--text-1)', fontFamily: 'Inter,sans-serif', fontSize: 13, outline: 'none', marginBottom: 8 }} />
                )}
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={x.carry} onChange={e => set(g.id, { carry: e.target.checked })} />
                  Перенести в следующий период
                </label>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderTop: '1px solid var(--border)' }}>
          <div style={{ flex: 1, fontSize: 12, color: 'var(--text-muted)' }}>Закрытые цели станут read-only; переносы создадут копии в следующем периоде.</div>
          <button onClick={onClose} style={btnGhost}>Отмена</button>
          <button onClick={() => submit.mutate()} disabled={goals.length === 0 || missing || submit.isPending}
            style={{ ...btnPrimary, opacity: (goals.length === 0 || missing || submit.isPending) ? 0.5 : 1 }}>
            {submit.isPending ? 'Закрываю…' : 'Закрыть период'}
          </button>
        </div>
      </div>
    </div>
  )
}
