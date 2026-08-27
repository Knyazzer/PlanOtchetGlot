import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { TrackFormModal } from '../TracksPage'
import { formatName } from '../../lib/utils'
import type { Project, ProjectStatus, WorkItem, WorkItemStatus, WorkItemDetail, ExpenseCategory, Department } from './types'
import { WI_STATUS_LABEL, WI_STATUS_COLOR, EXPENSE_CATEGORY_LABEL, FORMATS, LOCATIONS, inputStyle, cancelBtnStyle, submitBtnStyle, miniSelectStyle } from './constants'
import { trackProgress, fmtMoney } from './utils'
import { StatusChip } from './ProjectsKanban'
import { WorkItemFormModal } from './modals'

// ── ProjectDetail ─────────────────────────────────────────────────────────────

export function ProjectDetail({ project, onBack }: { project: Project; onBack?: () => void }) {
  const qc = useQueryClient()
  const [showWIForm, setShowWIForm] = useState(false)
  const [selectedWI, setSelectedWI] = useState<string | null>(null)

  const { data: workItems = [] } = useQuery<WorkItem[]>({
    queryKey: ['work-items', project.id],
    queryFn:  () => api.get(`/projects/${project.id}/work-items`).then(r => r.data),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })

  const updateProject = useMutation({
    mutationFn: (data: Partial<Project>) => api.patch(`/projects/${project.id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })

  const deleteProject = useMutation({
    mutationFn: () => api.delete(`/projects/${project.id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '14px 20px 12px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <StatusChip status={project.status} onSelect={s => updateProject.mutate({ status: s as ProjectStatus })} />
            {project.client && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{project.client.name}</span>
            )}
          </div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.3 }}>
            {project.title}
          </h2>
          {project.producer && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
              Продюсер: {project.producer.name}
            </div>
          )}
        </div>
        <button
          onClick={() => { if (confirm(`Удалить проект «${project.title}»?`)) deleteProject.mutate() }}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, padding: 4, flexShrink: 0 }}
          title="Удалить проект"
        >🗑</button>
      </div>

      {(project.brief || project.kpLink) && (
        <div style={{ padding: '8px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {project.brief && (
            <p style={{ margin: '0 0 3px', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>{project.brief}</p>
          )}
          {project.kpLink && (
            <a href={project.kpLink} target="_blank" rel="noreferrer"
              style={{ fontSize: 12, color: 'var(--accent-s)' }}>Ссылка на КП →</a>
          )}
        </div>
      )}

      {/* Work Items */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{
          padding: '10px 20px 6px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', flexShrink: 0,
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>
            Work Items <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{workItems.length}</span>
          </span>
          <button onClick={() => setShowWIForm(true)} style={{
            background: 'none', border: '1px solid var(--border)', borderRadius: 6,
            color: 'var(--text-2)', fontSize: 12, padding: '3px 9px', cursor: 'pointer',
            fontFamily: 'Inter, sans-serif',
          }}>+ Добавить</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 16px' }}>
          {workItems.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
              Нет work items. Нажмите «+ Добавить».
            </div>
          )}
          {workItems.map(wi => (
            <WorkItemCard
              key={wi.id}
              item={wi}
              active={wi.id === selectedWI}
              onClick={() => setSelectedWI(wi.id === selectedWI ? null : wi.id)}
              projectId={project.id}
            />
          ))}
        </div>
      </div>

      {showWIForm && (
        <WorkItemFormModal
          projectId={project.id}
          onClose={() => setShowWIForm(false)}
        />
      )}
    </div>
  )
}

// ── WorkItemCard ──────────────────────────────────────────────────────────────

export function WorkItemCard({ item: wi, active, onClick, projectId }: {
  item: WorkItem; active: boolean; onClick: () => void; projectId: string
}) {
  const qc = useQueryClient()
  const [createTrack, setCreateTrack] = useState(false)

  const { data: detail } = useQuery<WorkItemDetail>({
    queryKey: ['wi-detail', wi.id],
    queryFn: () => api.get(`/work-items/${wi.id}`).then(r => r.data),
    enabled: active,
    staleTime: 30_000,
  })

  const { data: structure = [] } = useQuery<Department[]>({
    queryKey: ['structure'],
    queryFn: () => api.get('/structure').then(r => r.data),
    enabled: active,
    staleTime: 5 * 60_000,
  })

  const updateWI = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.patch(`/work-items/${wi.id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work-items', projectId] })
      qc.invalidateQueries({ queryKey: ['wi-detail', wi.id] })
    },
  })

  const setDepartments = useMutation({
    mutationFn: (divisionIds: string[]) => api.put(`/work-items/${wi.id}/departments`, { divisionIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work-items', projectId] })
      qc.invalidateQueries({ queryKey: ['wi-detail', wi.id] })
    },
  })

  const deleteWI = useMutation({
    mutationFn: () => api.delete(`/work-items/${wi.id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['work-items', projectId] }),
  })

  const addExpense = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post(`/work-items/${wi.id}/expenses`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wi-detail', wi.id] }),
  })

  const deleteExpense = useMutation({
    mutationFn: (expId: string) => api.delete(`/work-items/${wi.id}/expenses/${expId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wi-detail', wi.id] }),
  })

  const allDivisions = structure.flatMap(dept =>
    (dept.divisions ?? []).map(div => ({ ...div, deptName: dept.name, deptColor: dept.color }))
  )
  const selectedDivIds = new Set(wi.departments.map(d => d.division.id))

  const totalExpenses = detail?.expenses.reduce((s, e) => s + Number(e.amount), 0) ?? 0
  const budget = Number(wi.budget ?? 0)

  return (
    <div style={{
      background: 'var(--surface-1)', border: `1px solid ${active ? 'rgba(123,97,255,0.3)' : 'var(--border)'}`,
      borderRadius: 10, marginBottom: 8, overflow: 'hidden',
    }}>
      {/* Row */}
      <div onClick={onClick} style={{
        padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
      }}>
        <span style={{
          fontSize: 12, fontWeight: 700, flexShrink: 0,
          color: WI_STATUS_COLOR[wi.status],
          background: `${WI_STATUS_COLOR[wi.status]}18`,
          borderRadius: 4, padding: '1px 5px', textTransform: 'uppercase', letterSpacing: '0.5px',
        }}>{WI_STATUS_LABEL[wi.status]}</span>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text-1)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {wi.title}
        </span>
        {wi.date && <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{wi.date}</span>}
        {wi._count.tracks > 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0, background: 'var(--surface-3)', padding: '1px 6px', borderRadius: 4 }}>
            {wi._count.tracks} т
          </span>
        )}
        <button
          onClick={e => { e.stopPropagation(); if (confirm(`Удалить «${wi.title}»?`)) deleteWI.mutate() }}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: 2, flexShrink: 0 }}
        >✕</button>
      </div>

      {/* Expanded detail */}
      {active && (
        <div style={{ borderTop: '1px solid var(--border)' }}>

          {/* ── Детали ── */}
          <Section title="Детали">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <select value={wi.status} onChange={e => updateWI.mutate({ status: e.target.value })}
                style={miniSelectStyle}>
                {(Object.entries(WI_STATUS_LABEL) as [WorkItemStatus, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
              <select value={wi.format ?? ''} onChange={e => updateWI.mutate({ format: e.target.value || null })}
                style={miniSelectStyle}>
                <option value="">— Формат</option>
                {FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
              <select value={wi.location ?? ''} onChange={e => updateWI.mutate({ location: e.target.value || null })}
                style={miniSelectStyle}>
                <option value="">— Локация</option>
                {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {wi.execProducer && <Tag label="Исп. пр." value={formatName(wi.execProducer.name)} />}
              {wi.lineProducer && <Tag label="Лайн" value={formatName(wi.lineProducer.name)} />}
              {wi.accountManager && <Tag label="Аккаунт" value={formatName(wi.accountManager.name)} />}
            </div>

            {wi.description && (
              <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>{wi.description}</p>
            )}
          </Section>

          {/* ── Отделы ── */}
          <Section title="Отделы">
            {allDivisions.length === 0 ? (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Нет данных о структуре</span>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {allDivisions.map(div => {
                  const checked = selectedDivIds.has(div.id)
                  return (
                    <button
                      key={div.id}
                      onClick={() => {
                        const next = new Set(selectedDivIds)
                        if (checked) next.delete(div.id); else next.add(div.id)
                        setDepartments.mutate([...next])
                      }}
                      style={{
                        fontSize: 12, padding: '3px 9px', borderRadius: 6, cursor: 'pointer',
                        fontFamily: 'Inter, sans-serif',
                        border: `1px solid ${checked ? div.deptColor : 'var(--border)'}`,
                        background: checked ? div.deptColor + '22' : 'none',
                        color: checked ? div.deptColor : 'var(--text-3)',
                        fontWeight: checked ? 700 : 400,
                      }}
                    >
                      {div.name}
                    </button>
                  )
                })}
              </div>
            )}
          </Section>

          {/* ── Треки ── */}
          <Section title="Треки">
            {(!detail || detail.tracks.length === 0) ? (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Нет привязанных треков</span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {detail.tracks.map(track => {
                  const prog = trackProgress(track)
                  return (
                    <div key={track.id} style={{
                      background: 'var(--surface-2)', borderRadius: 8, padding: '8px 12px',
                      border: '1px solid var(--border)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                          background: track.status === 'done' ? '#22C55E' : track.status === 'archived' ? '#464658' : '#FF6B35',
                        }} />
                        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {track.title}
                        </span>
                        {prog && (
                          <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>
                            {prog.done}/{prog.total}
                          </span>
                        )}
                      </div>
                      {prog && (
                        <div style={{ marginTop: 6, height: 3, background: 'var(--border)', borderRadius: 99 }}>
                          <div style={{ width: `${prog.pct}%`, height: '100%', background: '#FF6B35', borderRadius: 99, transition: 'width 0.3s' }} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            <button
              onClick={() => setCreateTrack(true)}
              style={{
                marginTop: 8, fontSize: 12, padding: '4px 10px',
                borderRadius: 6, border: '1px solid var(--border)',
                background: 'none', color: 'var(--text-2)', cursor: 'pointer',
                fontFamily: 'Inter, sans-serif',
              }}
            >+ Создать трек</button>
          </Section>

          {/* ── Финансы ── */}
          <Section title="Финансы">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <BudgetInput wiId={wi.id} projectId={projectId} current={wi.budget} />
              {budget > 0 && totalExpenses > 0 && (
                <span style={{ fontSize: 12, color: totalExpenses > budget ? '#F43F5E' : '#22C55E' }}>
                  Расходы: {fmtMoney(String(totalExpenses))} / Бюджет: {fmtMoney(wi.budget)}
                </span>
              )}
            </div>

            {detail?.expenses && detail.expenses.length > 0 && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {detail.expenses.map(exp => (
                  <div key={exp.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '5px 8px', background: 'var(--surface-2)',
                    borderRadius: 6, border: '1px solid var(--border)', fontSize: 12,
                  }}>
                    <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: 12 }}>
                      {EXPENSE_CATEGORY_LABEL[exp.category]}
                    </span>
                    <span style={{ flex: 1, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {exp.description || '—'}
                    </span>
                    {exp.date && <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: 12 }}>{exp.date}</span>}
                    <span style={{ fontWeight: 700, color: 'var(--text-1)', flexShrink: 0 }}>
                      {fmtMoney(exp.amount)}
                    </span>
                    <button onClick={() => deleteExpense.mutate(exp.id)}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, padding: 2, flexShrink: 0 }}>
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            <AddExpenseForm wiId={wi.id} onAdd={data => addExpense.mutate(data)} isPending={addExpense.isPending} />
          </Section>

        </div>
      )}

      {createTrack && (
        <TrackFormModal
          defaultWorkItemId={wi.id}
          onClose={() => setCreateTrack(false)}
          onSaved={() => {
            setCreateTrack(false)
            qc.invalidateQueries({ queryKey: ['wi-detail', wi.id] })
            qc.invalidateQueries({ queryKey: ['work-items', projectId] })
          }}
        />
      )}
    </div>
  )
}

// ── Section ───────────────────────────────────────────────────────────────────

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

// ── BudgetInput ───────────────────────────────────────────────────────────────

export function BudgetInput({ wiId, projectId, current }: { wiId: string; projectId: string; current?: string | null }) {
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

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} style={{
        fontSize: 12, padding: '4px 10px', borderRadius: 6,
        border: '1px solid var(--border)', background: 'none',
        color: current ? 'var(--text-1)' : 'var(--text-muted)',
        cursor: 'pointer', fontFamily: 'Inter, sans-serif',
      }}>
        {current ? `Бюджет: ${fmtMoney(current)}` : '+ Бюджет WI'}
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <input
        autoFocus type="number" value={val} onChange={e => setVal(e.target.value)}
        placeholder="Сумма ₽"
        style={{ ...inputStyle, width: 140, padding: '4px 8px', fontSize: 12 }}
        onKeyDown={e => { if (e.key === 'Enter') save.mutate(); if (e.key === 'Escape') setEditing(false) }}
      />
      <button onClick={() => save.mutate()} disabled={save.isPending}
        style={{ ...submitBtnStyle, padding: '4px 10px', fontSize: 12 }}>
        {save.isPending ? '...' : 'OK'}
      </button>
      <button onClick={() => setEditing(false)} style={{ ...cancelBtnStyle, padding: '4px 8px', fontSize: 12 }}>✕</button>
    </div>
  )
}

// ── AddExpenseForm ────────────────────────────────────────────────────────────

export function AddExpenseForm({ wiId: _wiId, onAdd, isPending }: {
  wiId: string; onAdd: (data: Record<string, unknown>) => void; isPending: boolean
}) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<ExpenseCategory>('other')
  const [desc, setDesc] = useState('')
  const [date, setDate] = useState('')

  const submit = () => {
    if (!amount || Number(amount) <= 0) return
    onAdd({ amount: Number(amount), category, description: desc, date: date || undefined })
    setAmount(''); setDesc(''); setDate(''); setOpen(false)
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        marginTop: 8, fontSize: 12, padding: '4px 10px',
        borderRadius: 6, border: '1px solid var(--border)',
        background: 'none', color: 'var(--text-2)', cursor: 'pointer',
        fontFamily: 'Inter, sans-serif',
      }}>+ Добавить расход</button>
    )
  }

  return (
    <div style={{ marginTop: 8, padding: 10, background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        <input
          type="number" placeholder="Сумма ₽" value={amount} onChange={e => setAmount(e.target.value)}
          style={{ ...inputStyle, width: 120, padding: '5px 8px', fontSize: 12 }}
          autoFocus
        />
        <select value={category} onChange={e => setCategory(e.target.value as ExpenseCategory)}
          style={{ ...inputStyle, width: 140, padding: '5px 8px', fontSize: 12 }}>
          {(Object.entries(EXPENSE_CATEGORY_LABEL) as [ExpenseCategory, string][]).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ ...inputStyle, width: 130, padding: '5px 8px', fontSize: 12, colorScheme: 'dark' }} />
      </div>
      <input placeholder="Описание (необязательно)" value={desc} onChange={e => setDesc(e.target.value)}
        style={{ ...inputStyle, marginBottom: 8, padding: '5px 8px', fontSize: 12 }} />
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={submit} disabled={!amount || isPending}
          style={{ ...submitBtnStyle, padding: '5px 12px', fontSize: 12, opacity: amount && !isPending ? 1 : 0.5 }}>
          {isPending ? '...' : 'Добавить'}
        </button>
        <button onClick={() => setOpen(false)} style={{ ...cancelBtnStyle, padding: '5px 10px', fontSize: 12 }}>Отмена</button>
      </div>
    </div>
  )
}

// ── Tag ───────────────────────────────────────────────────────────────────────

export function Tag({ label, value }: { label: string; value: string }) {
  return (
    <span style={{
      fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg)',
      border: '1px solid var(--border)', borderRadius: 5, padding: '2px 7px',
    }}>
      <span style={{ color: 'var(--text-3)', marginRight: 3 }}>{label}:</span>{value}
    </span>
  )
}