import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, CheckCircle2, RotateCcw } from 'lucide-react'
import { api } from '../lib/api'
import { ROLE } from '../lib/roleColors'
import { useAuthStore } from '../stores/auth'
import { useConfirm } from '../components/ConfirmModal'

// Стратегия компании — цели квартала/года, каскад департамент→отдел. Видимость — свой департамент.
// Спека — docs/STRATEGIC-GOALS.md. Фаза 1: цели + статусы + закрытие вручную.

interface Goal { id: string; title: string; description: string | null; deptId: string; divisionId: string | null; parentGoalId: string | null; horizon: string; periodKey: string; status: string; outcome: string | null; sortOrder: number; createdById: string; closedAt: string | null }
interface Div { id: string; name: string; head?: { id: string; name: string } | null; memberships: Array<{ user: { id: string } }> }
interface Dept { id: string; name: string; color?: string; director?: { id: string; name: string } | null; divisions: Div[] }

const STATUS: Record<string, { label: string; color: string }> = {
  active:  { label: 'В работе',   color: ROLE.info },
  done:    { label: 'Достигнута', color: ROLE.success },
  partial: { label: 'Частично',   color: ROLE.warning },
  dropped: { label: 'Снята',      color: ROLE.danger },
}

export function StrategyPage() {
  const me = useAuthStore(s => s.user)
  const isAdmin = !!me?.isAdmin
  const qc = useQueryClient()
  const { confirm, confirmUI } = useConfirm()
  const now = new Date()
  const [periodKey, setPeriodKey] = useState(() => `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`)
  const year = periodKey.slice(0, 4)

  const { data: structure = [] } = useQuery<Dept[]>({ queryKey: ['structure'], queryFn: () => api.get('/structure').then(r => r.data), staleTime: 300_000 })
  const { data: goals = [] } = useQuery<Goal[]>({ queryKey: ['strategic-goals', periodKey], queryFn: () => api.get(`/strategic-goals?periodKey=${periodKey}`).then(r => r.data), staleTime: 30_000 })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['strategic-goals'] })
  const del = useMutation({ mutationFn: (id: string) => api.delete(`/strategic-goals/${id}`), onSuccess: invalidate })

  const [modal, setModal] = useState<{ deptId: string; divisionId: string | null; edit?: Goal } | null>(null)
  const [closing, setClosing] = useState<Goal | null>(null)

  const canManage = (dept: Dept, div?: Div | null) => isAdmin || dept.director?.id === me?.id || (!!div && div.head?.id === me?.id)
  const mine = (dept: Dept) => isAdmin || canManage(dept) || dept.divisions.some(dv => dv.head?.id === me?.id || dv.memberships.some(m => m.user.id === me?.id))
  const goalsOf = (deptId: string, divisionId: string | null) => goals.filter(g => g.deptId === deptId && (g.divisionId ?? null) === divisionId)

  const depts = structure.filter(d => mine(d) || goals.some(g => g.deptId === d.id))
  const quarters = [1, 2, 3, 4].map(n => ({ key: `${year}-Q${n}`, label: `Q${n}` }))

  const GoalRow = ({ g, editable }: { g: Goal; editable: boolean }) => {
    const st = STATUS[g.status] ?? { label: g.status, color: 'var(--text-muted)' }
    const closed = !!g.closedAt
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
        <span style={{ marginTop: 3, fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: st.color + '22', color: st.color, whiteSpace: 'nowrap' }}>{st.label}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', lineHeight: 1.35 }}>
            {g.title}
            {g.horizon === 'year' && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: ROLE.primary, background: ROLE.primary + '1c', padding: '1px 7px', borderRadius: 6 }}>ГОД</span>}
          </div>
          {g.description && <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 3, whiteSpace: 'pre-wrap' }}>{g.description}</div>}
          {closed && g.outcome && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Итог: {g.outcome}</div>}
        </div>
        {editable && (
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            {!closed && <button onClick={() => setClosing(g)} title="Закрыть/подвести итог" style={iconBtn}><CheckCircle2 size={15} /></button>}
            {closed && <button onClick={() => setClosing(g)} title="Переоткрыть/итог" style={iconBtn}><RotateCcw size={14} /></button>}
            {!closed && <button onClick={() => setModal({ deptId: g.deptId, divisionId: g.divisionId, edit: g })} title="Править" style={iconBtn}><Pencil size={14} /></button>}
            {!closed && <button onClick={() => confirm({ message: 'Удалить цель?', confirmLabel: 'Удалить', danger: true }).then(ok => ok && del.mutate(g.id))} title="Удалить" style={iconBtn}><Trash2 size={14} /></button>}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ padding: '24px 28px', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        {/* Период */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 22, flexWrap: 'wrap' }}>
          {quarters.map(q => <PeriodBtn key={q.key} active={periodKey === q.key} onClick={() => setPeriodKey(q.key)}>{q.label} {year}</PeriodBtn>)}
          <PeriodBtn active={periodKey === year} onClick={() => setPeriodKey(year)}>Год {year}</PeriodBtn>
        </div>

        {depts.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '20px 0' }}>В вашем охвате нет департаментов и целей на этот период.</div>}

        {depts.map(dept => (
          <section key={dept.id} style={{ marginBottom: 20, background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: dept.color ?? ROLE.primary, flexShrink: 0 }} />
              <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)', flex: 1 }}>{dept.name}</span>
              {canManage(dept) && <button onClick={() => setModal({ deptId: dept.id, divisionId: null })} style={addBtn}><Plus size={13} /> Цель департамента</button>}
            </div>
            {goalsOf(dept.id, null).map(g => <GoalRow key={g.id} g={g} editable={canManage(dept)} />)}

            {dept.divisions.map(dv => {
              const dgoals = goalsOf(dept.id, dv.id)
              if (dgoals.length === 0 && !canManage(dept, dv)) return null
              return (
                <div key={dv.id} style={{ marginTop: 12, paddingLeft: 14, borderLeft: '2px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)', flex: 1 }}>{dv.name}</span>
                    {canManage(dept, dv) && <button onClick={() => setModal({ deptId: dept.id, divisionId: dv.id })} style={addBtn}><Plus size={12} /> Цель отдела</button>}
                  </div>
                  {dgoals.map(g => <GoalRow key={g.id} g={g} editable={canManage(dept, dv)} />)}
                </div>
              )
            })}
          </section>
        ))}
      </div>

      {modal && <GoalModal ctx={modal} periodKey={periodKey} year={year} onClose={() => setModal(null)} onSaved={invalidate} />}
      {closing && <CloseGoalModal goal={closing} onClose={() => setClosing(null)} onSaved={invalidate} />}
      {confirmUI}
    </div>
  )
}

function GoalModal({ ctx, periodKey, year, onClose, onSaved }: { ctx: { deptId: string; divisionId: string | null; edit?: Goal }; periodKey: string; year: string; onClose: () => void; onSaved: () => void }) {
  const edit = ctx.edit
  const [title, setTitle] = useState(edit?.title ?? '')
  const [description, setDescription] = useState(edit?.description ?? '')
  const [horizon, setHorizon] = useState(edit?.horizon ?? (periodKey === year ? 'year' : 'quarter'))
  const down = useState({ v: false })[0]

  const save = useMutation({
    mutationFn: () => {
      if (edit) return api.patch(`/strategic-goals/${edit.id}`, { title: title.trim(), description: description.trim() || null })
      const pk = horizon === 'year' ? year : (periodKey === year ? `${year}-Q${Math.floor(new Date().getMonth() / 3) + 1}` : periodKey)
      return api.post('/strategic-goals', { title: title.trim(), description: description.trim() || undefined, deptId: ctx.deptId, divisionId: ctx.divisionId, horizon, periodKey: pk })
    },
    onSuccess: () => { onSaved(); onClose() },
    onError: (e: unknown) => { const err = e as { response?: { data?: { error?: string } } }; alert(err?.response?.data?.error ?? 'Не удалось сохранить') },
  })

  return (
    <div onMouseDown={e => { down.v = e.target === e.currentTarget }} onMouseUp={e => { if (down.v && e.target === e.currentTarget) onClose(); down.v = false }}
      style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onMouseDown={e => e.stopPropagation()} style={{ width: 460, maxWidth: '100%', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 16, padding: 22, boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', marginBottom: 16 }}>{edit ? 'Правка цели' : ctx.divisionId ? 'Цель отдела' : 'Цель департамента'}</div>
        <Label>Название</Label>
        <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Что нужно достичь" style={inp} />
        {!edit && (
          <div style={{ marginTop: 14 }}>
            <Label>Горизонт</Label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[['quarter', 'Квартал'], ['year', 'Год']].map(([v, l]) => {
                const sel = horizon === v
                return <button key={v} onClick={() => setHorizon(v)} style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: `1px solid ${sel ? ROLE.primary : 'var(--border)'}`, background: sel ? ROLE.primary + '1f' : 'none', color: sel ? ROLE.primary : 'var(--text-2)', fontSize: 13, fontWeight: sel ? 700 : 500, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>{l}</button>
              })}
            </div>
          </div>
        )}
        <div style={{ marginTop: 14 }}>
          <Label>Описание (необязательно)</Label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{ ...inp, resize: 'vertical' }} />
        </div>
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
            return <button key={s} onClick={() => setStatus(s)} style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${sel ? meta.color : 'var(--border)'}`, background: sel ? meta.color + '1f' : 'none', color: sel ? meta.color : 'var(--text-2)', fontSize: 13, fontWeight: sel ? 700 : 500, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>{s === 'active' ? 'Вернуть в работу' : meta.label}</button>
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

// ── стили ──
function PeriodBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${active ? ROLE.primary : 'var(--border)'}`, background: active ? ROLE.primary + '1f' : 'none', color: active ? ROLE.primary : 'var(--text-2)', fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>{children}</button>
}
function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 7 }}>{children}</div>
}
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px', color: 'var(--text-1)', fontFamily: 'Inter,sans-serif', fontSize: 14, outline: 'none', lineHeight: 1.45 }
const iconBtn: React.CSSProperties = { background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 3, display: 'flex' }
const addBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: '1px solid var(--border)', borderRadius: 7, padding: '4px 10px', color: ROLE.primary, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }
const btnGhost: React.CSSProperties = { padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text-2)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }
const btnPrimary: React.CSSProperties = { padding: '9px 18px', borderRadius: 8, border: 'none', background: ROLE.primary, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }
