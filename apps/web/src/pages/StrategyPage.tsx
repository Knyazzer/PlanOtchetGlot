import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, RotateCcw } from 'lucide-react'
import { api } from '../lib/api'
import { ROLE } from '../lib/roleColors'
import { useAuthStore } from '../stores/auth'
import { useConfirm } from '../components/ConfirmModal'

// Стратегия компании — канбан целей квартала/года, каскад департамент→отдел. См. docs/STRATEGIC-GOALS.md §11.

interface Goal { id: string; title: string; description: string | null; deptId: string; divisionId: string | null; parentGoalId: string | null; kind: string; horizon: string; periodKey: string; status: string; outcome: string | null; sortOrder: number; createdById: string; closedAt: string | null }
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
  const depts = useMemo(() => structure.filter(d => mine(d) || goals.some(g => g.deptId === d.id)), [structure, goals, isAdmin, me?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // выбранный департамент по умолчанию — первый доступный
  useEffect(() => { if (!deptId && depts.length) setDeptId(depts[0].id) }, [depts, deptId])
  const dept = depts.find(d => d.id === deptId) ?? null
  const div = divId ? dept?.divisions.find(d => d.id === divId) ?? null : null
  const editable = canManage(dept, div)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['strategic-goals'] })
  const setStatus = useMutation({ mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/strategic-goals/${id}/close`, { status }), onSuccess: invalidate })
  const del = useMutation({ mutationFn: (id: string) => api.delete(`/strategic-goals/${id}`), onSuccess: invalidate })

  const [modal, setModal] = useState<{ deptId: string; divisionId: string | null; kind: 'goal' | 'growth'; edit?: Goal } | null>(null)
  const [closing, setClosing] = useState<Goal | null>(null)

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
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {quarters.map(q => <Chip key={q.key} active={periodKey === q.key} onClick={() => setPeriodKey(q.key)}>{q.label}</Chip>)}
          <Chip active={periodKey === year} onClick={() => setPeriodKey(year)}>Год</Chip>
        </div>
      </div>

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
      {confirmUI}
    </div>
  )
}

function GoalCard({ g, editable, draggable, onEdit, onClose, onDelete }: { g: Goal; editable: boolean; draggable: boolean; onEdit: () => void; onClose: () => void; onDelete: () => void }) {
  const st = STATUS[g.status] ?? { label: g.status, color: 'var(--text-muted)' }
  return (
    <div draggable={draggable} onDragStart={e => e.dataTransfer.setData('text/plain', g.id)}
      style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 9, padding: '10px 12px', marginBottom: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', cursor: draggable ? 'grab' : 'default' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', lineHeight: 1.3 }}>
            {g.title}
            {g.horizon === 'year' && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: ROLE.primary, background: ROLE.primary + '1c', padding: '1px 6px', borderRadius: 5 }}>ГОД</span>}
          </div>
          {g.description && <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 3 }}>{g.description}</div>}
          {(g.status === 'partial' || g.status === 'dropped') && <span style={{ display: 'inline-block', marginTop: 5, fontSize: 10, fontWeight: 800, padding: '1px 7px', borderRadius: 20, background: st.color + '22', color: st.color }}>{st.label}</span>}
          {g.closedAt && g.outcome && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 5, borderTop: '1px dashed var(--border)', paddingTop: 5 }}>Итог: {g.outcome}</div>}
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
