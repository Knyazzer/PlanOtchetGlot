import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { WorkItem, WorkItemDetail, Expense, ExpenseCategory } from './types'
import { WI_STATUS_COLOR, WI_STATUS_LABEL, EXPENSE_LABEL, inputStyle } from './constants'
import { fmtMoney } from './utils'
import { KpiCard, FinSummaryRow, LoadingState } from './ui'

// ── FinanceTab ────────────────────────────────────────────────────────────────

export function FinanceTab({ projectId }: { projectId: string }) {
  const [selectedWI, setSelectedWI] = useState<string | null>(null)

  const { data: workItems = [], isLoading } = useQuery<WorkItem[]>({
    queryKey: ['work-items', projectId],
    queryFn:  () => api.get(`/projects/${projectId}/work-items`).then(r => r.data),
  })

  const activeWI = workItems.find(w => w.id === selectedWI) ?? (workItems[0] ?? null)

  const { data: wiDetail } = useQuery<WorkItemDetail>({
    queryKey: ['wi-detail', activeWI?.id],
    queryFn: () => api.get(`/work-items/${activeWI!.id}`).then(r => r.data),
    enabled: !!activeWI,
    staleTime: 30_000,
  })

  if (isLoading) return <LoadingState />

  const totalBudget = workItems.reduce((s, w) => s + Number(w.budget ?? 0), 0)
  const totalExpenses = wiDetail?.expenses.reduce((s, e) => s + Number(e.amount), 0) ?? 0

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

      {/* Left nav */}
      <div style={{ width: 260, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden' }}>
        <div style={{ padding: '0 14px', height: 40, display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>Финансы проекта</span>
        </div>

        {/* Summary strip */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 7 }}>
          <FinSummaryRow label="Бюджет" value={fmtMoney(String(totalBudget))} color="#FF6B35" />
          <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 2, background: 'linear-gradient(90deg,#FF6B35,#E8194B)', width: totalBudget > 0 ? `${Math.min(100, totalExpenses / totalBudget * 100)}%` : '0%' }} />
          </div>
          <FinSummaryRow label="Расходы" value={fmtMoney(String(totalExpenses))} />
        </div>

        {/* WI list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {workItems.map(wi => {
            const isActive = wi.id === activeWI?.id
            return (
              <div
                key={wi.id}
                onClick={() => setSelectedWI(wi.id)}
                style={{
                  padding: '10px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                  background: isActive ? 'rgba(255,107,53,0.06)' : 'transparent',
                  borderLeft: isActive ? '2px solid #FF6B35' : '2px solid transparent',
                  paddingLeft: isActive ? 12 : 14,
                  transition: 'background 0.1s',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wi.title}</div>
                <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                  <span style={{ color: WI_STATUS_COLOR[wi.status], fontWeight: 600 }}>{WI_STATUS_LABEL[wi.status]}</span>
                  <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>{fmtMoney(wi.budget)}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Detail panel */}
      {activeWI ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* WI header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
            <span style={{ width: 32, height: 32, borderRadius: 8, background: `${WI_STATUS_COLOR[activeWI.status]}20`, color: WI_STATUS_COLOR[activeWI.status], display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
              {WI_STATUS_LABEL[activeWI.status].slice(0,2).toUpperCase()}
            </span>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-1)', flex: 1 }}>{activeWI.title}</h3>
            <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 99, background: `${WI_STATUS_COLOR[activeWI.status]}18`, color: WI_STATUS_COLOR[activeWI.status] }}>
              {WI_STATUS_LABEL[activeWI.status]}
            </span>
          </div>

          {/* KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
            <KpiCard label="Бюджет WI" value={fmtMoney(activeWI.budget)} color="#FF6B35" />
            <KpiCard label="Расходы" value={wiDetail ? fmtMoney(String(wiDetail.expenses.reduce((s, e) => s + Number(e.amount), 0))) : '—'} color="var(--text-2)" />
            <KpiCard label="Треки" value={String(activeWI._count.tracks)} color="#29BF12" sub="активных" />
            <KpiCard label="Расходов" value={String(activeWI._count.expenses)} color="var(--text-3)" sub="записей" />
          </div>

          {/* Expenses */}
          {wiDetail && (
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>
                Расходы
              </div>
              {wiDetail.expenses.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>Нет расходов</div>
              )}
              {wiDetail.expenses.map((exp, i) => (
                <div key={exp.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px',
                  borderBottom: i < wiDetail.expenses.length - 1 ? '1px solid var(--border)' : 'none',
                  background: i % 2 === 1 ? 'rgba(255,255,255,0.018)' : 'transparent',
                }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', flexShrink: 0, letterSpacing: '0.04em' }}>{EXPENSE_LABEL[exp.category]}</span>
                  <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exp.description || '—'}</span>
                  {exp.date && <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{exp.date}</span>}
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', flexShrink: 0, fontFamily: 'monospace' }}>{fmtMoney(exp.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
          Выберите Work Item
        </div>
      )}
    </div>
  )
}

// ── ExpensesBlock (переиспользуется в StructureTab) ───────────────────────────

export function ExpensesBlock({ wiId, projectId, expenses, budget }: {
  wiId: string; projectId: string; expenses: Expense[]; budget?: string | null
}) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<ExpenseCategory>('other')
  const [desc, setDesc] = useState('')

  const addExpense = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post(`/work-items/${wiId}/expenses`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['wi-detail', wiId] }); setOpen(false); setAmount(''); setDesc('') },
  })

  const deleteExpense = useMutation({
    mutationFn: (expId: string) => api.delete(`/work-items/${wiId}/expenses/${expId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wi-detail', wiId] }),
  })

  const total = expenses.reduce((s, e) => s + Number(e.amount), 0)
  const bud = Number(budget ?? 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {bud > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: total > bud ? '#E8194B' : '#29BF12', fontWeight: 600 }}>
          <span>Итого: {fmtMoney(String(total))}</span>
          <span>Бюджет: {fmtMoney(budget)}</span>
        </div>
      )}
      {expenses.map(exp => (
        <div key={exp.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', background: 'var(--surface-3)', borderRadius: 6, fontSize: 12 }}>
          <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: 12, textTransform: 'uppercase', fontWeight: 600 }}>{EXPENSE_LABEL[exp.category]}</span>
          <span style={{ flex: 1, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exp.description || '—'}</span>
          <span style={{ fontWeight: 700, color: 'var(--text-1)', flexShrink: 0, fontFamily: 'monospace' }}>{fmtMoney(exp.amount)}</span>
          <button onClick={() => deleteExpense.mutate(exp.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, padding: 2, flexShrink: 0 }}>✕</button>
        </div>
      ))}
      {!open ? (
        <button onClick={() => setOpen(true)} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'Inter, sans-serif', alignSelf: 'flex-start' }}>
          + Добавить расход
        </button>
      ) : (
        <div style={{ padding: 10, background: 'var(--surface-3)', borderRadius: 8, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="number" placeholder="Сумма ₽" value={amount} onChange={e => setAmount(e.target.value)} style={{ ...inputStyle, width: 120, padding: '5px 8px', fontSize: 12 }} autoFocus />
            <select value={category} onChange={e => setCategory(e.target.value as ExpenseCategory)} style={{ ...inputStyle, padding: '5px 8px', fontSize: 12 }}>
              {(Object.entries(EXPENSE_LABEL) as [ExpenseCategory, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <input placeholder="Описание" value={desc} onChange={e => setDesc(e.target.value)} style={{ ...inputStyle, padding: '5px 8px', fontSize: 12 }} />
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => addExpense.mutate({ amount: Number(amount), category, description: desc })} disabled={!amount || addExpense.isPending} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: 'none', background: 'linear-gradient(135deg,#FF6B35,#E8194B)', color: '#fff', cursor: 'pointer', fontFamily: 'Inter, sans-serif', opacity: amount && !addExpense.isPending ? 1 : 0.5 }}>
              {addExpense.isPending ? '...' : 'Добавить'}
            </button>
            <button onClick={() => setOpen(false)} style={{ fontSize: 12, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>Отмена</button>
          </div>
        </div>
      )}
      {/* BudgetInput inline */}
      <BudgetInput wiId={wiId} projectId={projectId} current={budget} />
    </div>
  )
}

// ── BudgetInput ───────────────────────────────────────────────────────────────

function BudgetInput({ wiId, projectId, current }: { wiId: string; projectId: string; current?: string | null }) {
  const qc = useQueryClient()
  const [val, setVal] = useState(current ? String(Number(current)) : '')
  const [editing, setEditing] = useState(false)

  const save = useMutation({
    mutationFn: () => api.patch(`/work-items/${wiId}`, { budget: val ? Number(val) : null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work-items', projectId] })
      qc.invalidateQueries({ queryKey: ['wi-detail', wiId] })
      setEditing(false)
    },
  })

  if (!editing) return (
    <button onClick={() => setEditing(true)} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: current ? 'var(--text-1)' : 'var(--text-muted)', cursor: 'pointer', fontFamily: 'Inter, sans-serif', alignSelf: 'flex-start' }}>
      {current ? `Бюджет WI: ${fmtMoney(current)}` : '+ Бюджет WI'}
    </button>
  )

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <input autoFocus type="number" value={val} onChange={e => setVal(e.target.value)} placeholder="Сумма ₽" style={{ ...inputStyle, width: 140, padding: '4px 8px', fontSize: 12 }} onKeyDown={e => { if (e.key === 'Enter') save.mutate(); if (e.key === 'Escape') setEditing(false) }} />
      <button onClick={() => save.mutate()} disabled={save.isPending} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: 'none', background: 'linear-gradient(135deg,#FF6B35,#E8194B)', color: '#fff', cursor: 'pointer', fontFamily: 'Inter, sans-serif', opacity: save.isPending ? 0.5 : 1 }}>{save.isPending ? '...' : 'OK'}</button>
      <button onClick={() => setEditing(false)} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>✕</button>
    </div>
  )
}
