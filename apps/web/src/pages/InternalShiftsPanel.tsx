import React, { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient, useQueries } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { api } from '../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ShiftConfirmed = 'yes' | 'pending' | null

export interface ShiftValue {
  type?: string
  confirmed?: ShiftConfirmed
  timeStart?: string | null
  timeEnd?: string | null
}

type RawShiftValue = string | ShiftValue

export interface ProjectMember {
  id: string
  project_id: string
  name: string
  position: string | null
  employment_type: string | null
  rate_plan: string | null
  rate_fact: string | null
  shifts: Record<string, RawShiftValue>
}

interface ProjectDay {
  id: string
  date: string
  type: string
  startTime: string | null
  timeFrom: string | null
  timeTo: string | null
  allDay: boolean
  firstMotor: string | null
}

interface MicroProject {
  id: string
  name: string
  date: string | null
  dateApproximate: string | null
  status: string
  format: string | null
  location: string | null
  client: string | null
  execProducer: string | null
  lineProducer: string | null
  accountManager: string | null
  time: string | null
  notes: string | null
  days: ProjectDay[]
  matrixRegistryId: string | null
}

interface ShiftExpense {
  id: string
  project_id: string
  expense_type: string
  ordered_by: string | null
  amount: string | null
  notes: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateShort(raw: string | null | undefined): string {
  if (!raw) return '—'
  try { return format(new Date(raw), 'd MMM', { locale: ru }) } catch { return raw }
}

function fmtDateFull(raw: string | null | undefined): string {
  if (!raw) return '—'
  try { return format(new Date(raw), 'd MMM yyyy', { locale: ru }) } catch { return raw }
}

function toIsoDate(raw: string): string {
  try { return new Date(raw).toISOString().slice(0, 10) } catch { return raw }
}

function isoToInput(raw: string | null | undefined): string {
  if (!raw) return ''
  try { return new Date(raw).toISOString().slice(0, 10) } catch { return '' }
}

function normalise(raw: RawShiftValue | undefined): ShiftValue | null {
  if (!raw) return null
  if (typeof raw === 'string') return raw ? { type: raw, confirmed: 'yes' } : null
  return raw
}

function confirmedColor(v: ShiftConfirmed): string {
  if (v === 'yes')     return '#22c55e'
  if (v === 'pending') return '#f59e0b'
  return '#e2e8f0'
}

function nextConfirmed(v: ShiftConfirmed): ShiftConfirmed {
  if (v === null)  return 'yes'
  if (v === 'yes') return 'pending'
  return null
}

const EMP_LABELS: Record<string, string> = {
  staff: 'ШТАТ', ip_7: 'ИП 7%', ip_8: 'ИП 8%', ip_10: 'ИП 10%', szt: 'СЗТ',
}
const EMP_COLORS: Record<string, string> = {
  staff: '#6366f1', ip_7: '#0ea5e9', ip_8: '#0ea5e9', ip_10: '#0ea5e9', szt: '#f59e0b',
}

function EmpBadge({ type }: { type: string | null }) {
  if (!type) return <span style={{ color: '#cbd5e1' }}>—</span>
  const label = EMP_LABELS[type] ?? type
  const color = EMP_COLORS[type] ?? '#94a3b8'
  return (
    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, background: color + '1a', color, fontWeight: 700, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
      {label}
    </span>
  )
}

function fmtMoney(v: string | null | undefined): string {
  if (!v) return '—'
  const n = parseFloat(v)
  if (isNaN(n)) return '—'
  return n.toLocaleString('ru-RU')
}

function countConfirmedDays(shifts: Record<string, RawShiftValue>, dateCols: string[]): number {
  return dateCols.filter((d) => normalise(shifts[d])?.confirmed === 'yes').length
}

function calcSum(rateStr: string | null, shifts: Record<string, RawShiftValue>, dateCols: string[]): string {
  if (!rateStr) return '—'
  const rate = parseFloat(rateStr)
  if (isNaN(rate)) return '—'
  const days = countConfirmedDays(shifts, dateCols)
  if (days === 0) return '—'
  return (rate * days).toLocaleString('ru-RU')
}

function RateCell({ memberId, field, value, onSave }: { memberId: string; field: string; value: string | null; onSave: (v: string | null) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const commit = () => {
    const v = draft.trim() || null
    if (v !== (value || null)) onSave(v)
    setEditing(false)
  }
  if (editing) {
    return (
      <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false) } }}
        style={{ width: 72, fontSize: 12, padding: '2px 5px', border: '1px solid #3b82f6', borderRadius: 4, textAlign: 'right', outline: 'none', fontFamily: 'inherit' }} />
    )
  }
  return (
    <span onClick={() => { setDraft(value ?? ''); setEditing(true) }} title="Нажмите для редактирования"
      style={{ cursor: 'text', color: value ? '#1e293b' : '#cbd5e1', fontSize: 12, display: 'inline-block', minWidth: 40, textAlign: 'right' }}>
      {value ? Number(value).toLocaleString('ru-RU') : '—'}
    </span>
  )
}

const STATUS_LABELS: Record<string, string> = {
  request: 'Запрос', negotiation: 'На согл.', preproduction: 'Препрод.',
  production: 'Продакшн', postproduction: 'Постпрод.', delivered: 'Сдан',
  rejected: 'Не согл.', cancelled: 'Отменён', manual: 'Ручной',
}
const STATUS_COLORS: Record<string, string> = {
  request: '#f59e0b', negotiation: '#3b82f6', preproduction: '#8b5cf6',
  production: '#10b981', postproduction: '#06b6d4', delivered: '#16a34a',
  rejected: '#ef4444', cancelled: '#6b7280', manual: '#64748b',
}

// ─── InternalShiftsPanel ─────────────────────────────────────────────────────

export function InternalShiftsPanel({ matrixRegistryId }: { matrixRegistryId: string }) {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<'summary' | string>('summary')
  const [creating, setCreating] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')

  const renameProject = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.patch(`/status-rows/${id}`, { name }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['micro-projects', matrixRegistryId] }),
  })

  const commitRename = (id: string) => {
    const name = renameDraft.trim()
    if (name) renameProject.mutate({ id, name })
    setRenamingId(null)
  }

  const { data: projects = [], isLoading } = useQuery<MicroProject[]>({
    queryKey: ['micro-projects', matrixRegistryId],
    queryFn: () => api.get(`/status-rows?matrixRegistryId=${matrixRegistryId}`).then((r) => r.data),
    staleTime: 30_000,
  })

  const handleCreated = (id: string) => {
    qc.invalidateQueries({ queryKey: ['micro-projects', matrixRegistryId] })
    setCreating(false)
    setActiveTab(id)
  }

  const handleDeleted = (id: string) => {
    qc.invalidateQueries({ queryKey: ['micro-projects', matrixRegistryId] })
    if (activeTab === id) setActiveTab('summary')
  }

  const handleCopied = (newId: string) => {
    qc.invalidateQueries({ queryKey: ['micro-projects', matrixRegistryId] })
    setActiveTab(newId)
  }

  const handleUpdated = () => {
    qc.invalidateQueries({ queryKey: ['micro-projects', matrixRegistryId] })
  }

  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px', fontSize: 12, border: 'none', cursor: 'pointer', background: 'none',
    borderBottom: active ? '2px solid #3b82f6' : '2px solid transparent',
    color: active ? '#3b82f6' : '#64748b', fontWeight: active ? 600 : 400,
    whiteSpace: 'nowrap', flexShrink: 0,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Sub-tabs strip */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #e2e8f0', overflowX: 'auto', flexShrink: 0 }}>
        <button style={tabBtn(activeTab === 'summary')} onClick={() => { setActiveTab('summary'); setCreating(false) }}>
          Свод смен
        </button>

        {projects.map((p) => (
          renamingId === p.id ? (
            <input
              key={p.id}
              autoFocus
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onBlur={() => commitRename(p.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename(p.id)
                if (e.key === 'Escape') setRenamingId(null)
              }}
              style={{ fontSize: 12, padding: '4px 8px', border: '1px solid #3b82f6', borderRadius: 4, outline: 'none', maxWidth: 160, fontFamily: 'inherit' }}
            />
          ) : (
            <button
              key={p.id}
              style={{ ...tabBtn(activeTab === p.id), maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}
              title={p.name + ' (двойной клик — переименовать)'}
              onClick={() => { setActiveTab(p.id); setCreating(false) }}
              onDoubleClick={(e) => { e.preventDefault(); setRenameDraft(p.name); setRenamingId(p.id) }}
            >
              {p.name || '(без названия)'}
            </button>
          )
        ))}

        <button
          style={{ padding: '4px 14px', fontSize: 18, border: 'none', cursor: 'pointer', background: 'none', color: '#94a3b8', borderBottom: '2px solid transparent', flexShrink: 0 }}
          title="Добавить смену"
          onClick={() => { setCreating(true); setActiveTab('new') }}
        >+</button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {isLoading && <div style={{ padding: 24, color: '#94a3b8', fontSize: 14 }}>Загрузка...</div>}

        {!isLoading && activeTab === 'summary' && !creating && (
          <ShiftsSummaryTab matrixRegistryId={matrixRegistryId} projects={projects} />
        )}

        {!isLoading && creating && activeTab === 'new' && (
          <CreateMicroProjectForm
            matrixRegistryId={matrixRegistryId}
            onCreated={handleCreated}
            onCancel={() => { setCreating(false); setActiveTab('summary') }}
          />
        )}

        {!isLoading && !creating && activeTab !== 'summary' && (() => {
          const project = projects.find((p) => p.id === activeTab)
          if (!project) return null
          return (
            <MicroProjectTab
              key={project.id}
              project={project}
              onDeleted={() => handleDeleted(project.id)}
              onCopied={handleCopied}
              onUpdated={handleUpdated}
            />
          )
        })()}

        {!isLoading && projects.length === 0 && !creating && activeTab === 'summary' && (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
            Нет смен. Нажмите «+», чтобы добавить.
          </div>
        )}
      </div>
    </div>
  )
}

// ─── ShiftsSummaryTab ─────────────────────────────────────────────────────────

function ShiftsSummaryTab({ matrixRegistryId, projects }: { matrixRegistryId: string; projects: MicroProject[] }) {
  const memberQueries = useQueries({
    queries: projects.map((p) => ({
      queryKey: ['project-members', p.id],
      queryFn: () => api.get(`/project-members?projectId=${p.id}`).then((r) => r.data as ProjectMember[]),
      staleTime: 30_000,
    })),
  })

  const allLoaded = memberQueries.every((q) => !q.isLoading)

  const DLABEL_COLORS: Record<string, { bg: string; color: string }> = {
    zastroyka: { bg: '#fef3c7', color: '#92400e' },
    efir:      { bg: '#dbeafe', color: '#1d4ed8' },
    deadline:  { bg: '#fee2e2', color: '#991b1b' },
    semka:     { bg: '#d1fae5', color: '#065f46' },
  }
  const TYPE_LABELS: Record<string, string> = {
    zastroyka: 'Застройка', efir: 'Эфир', deadline: 'Дедлайн', semka: 'Съёмка',
  }

  const rows = useMemo(() => {
    return projects.map((p, idx) => {
      const dateTypeMap: Record<string, string> = {}
      if (p.date) {
        const mainDay = p.days.find((d) => toIsoDate(d.date) === toIsoDate(p.date!))
        dateTypeMap[toIsoDate(p.date)] = mainDay?.type ?? 'efir'
      }
      p.days.forEach((d) => {
        const iso = toIsoDate(d.date)
        if (!dateTypeMap[iso]) dateTypeMap[iso] = d.type
      })
      return {
        project: p,
        members: memberQueries[idx]?.data ?? [] as ProjectMember[],
        dateTypeMap,
        dates: Object.keys(dateTypeMap).sort(),
      }
    })
  }, [projects, memberQueries])

  const globalDates = useMemo(() => {
    const all = new Set<string>()
    rows.forEach((r) => r.dates.forEach((d) => all.add(d)))
    return [...all].sort()
  }, [rows])

  if (!allLoaded) return <div style={{ padding: 24, color: '#94a3b8', fontSize: 14 }}>Загрузка...</div>

  const visibleRows = rows.filter((r) => r.members.length > 0)
  if (visibleRows.length === 0) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Нет участников.</div>
  }

  const thS: React.CSSProperties = {
    padding: '7px 10px', fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'left',
    borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap', position: 'sticky', top: 0,
    background: '#f8fafc', zIndex: 2, textTransform: 'uppercase', letterSpacing: '0.03em',
  }
  const tdS: React.CSSProperties = { padding: '6px 10px', fontSize: 12, borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' }

  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...thS, minWidth: 170 }}>Смена</th>
            <th style={{ ...thS, minWidth: 160 }}>ФИО</th>
            <th style={{ ...thS, minWidth: 80 }}>Формат</th>
            <th style={{ ...thS, minWidth: 130 }}>Должность</th>
            <th style={{ ...thS, minWidth: 90, textAlign: 'right' }}>Сумма план</th>
            <th style={{ ...thS, minWidth: 90, textAlign: 'right' }}>Сумма факт</th>
            {globalDates.map((d) => (
              <th key={d} style={{ ...thS, minWidth: 60, textAlign: 'center' }}>{fmtDateShort(d)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map(({ project, members, dateTypeMap, dates }, vIdx) => {
            const rowCount = members.length + 1
            return (
              <>
                {/* date-label-row */}
                <tr key={`${project.id}-lbl`} style={{ background: '#f8fafc' }}>
                  <td rowSpan={rowCount} style={{
                    ...tdS, verticalAlign: 'top', borderRight: '1px solid #e2e8f0',
                    background: '#f8fafc', minWidth: 170, maxWidth: 200, padding: '10px 12px',
                    borderTop: '2px solid #e2e8f0',
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: '#0f172a', lineHeight: 1.3, marginBottom: 4 }}>
                      {project.name || '(без названия)'}
                    </div>
                    {project.date && (
                      <div style={{ fontSize: 11, color: '#3b82f6', marginBottom: 5, fontWeight: 500 }}>
                        {fmtDateShort(project.date)}
                      </div>
                    )}
                    <div style={{ marginBottom: project.execProducer ? 5 : 0 }}>
                      <span style={{
                        fontSize: 10, padding: '2px 7px', borderRadius: 10,
                        background: (STATUS_COLORS[project.status] ?? '#94a3b8') + '22',
                        color: STATUS_COLORS[project.status] ?? '#94a3b8', fontWeight: 700,
                      }}>
                        {STATUS_LABELS[project.status] ?? project.status}
                      </span>
                    </div>
                    {project.execProducer && (
                      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
                        Исп. пр.: {project.execProducer}
                      </div>
                    )}
                  </td>
                  <td style={{ ...tdS, borderTop: '2px solid #e2e8f0' }} />
                  <td style={{ ...tdS, borderTop: '2px solid #e2e8f0' }} />
                  <td style={{ ...tdS, borderTop: '2px solid #e2e8f0' }} />
                  <td style={{ ...tdS, borderTop: '2px solid #e2e8f0' }} />
                  <td style={{ ...tdS, borderTop: '2px solid #e2e8f0' }} />
                  {globalDates.map((d) => {
                    const type = dateTypeMap[d]
                    const tColor = type ? (DLABEL_COLORS[type] ?? { bg: '#f3e8ff', color: '#7e22ce' }) : null
                    return (
                      <td key={d} style={{ ...tdS, textAlign: 'center', borderTop: '2px solid #e2e8f0' }}>
                        {type && tColor ? (
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 10,
                            background: tColor.bg, color: tColor.color, whiteSpace: 'nowrap',
                          }}>
                            {TYPE_LABELS[type] ?? type}
                          </span>
                        ) : (
                          <span style={{ color: '#e2e8f0', fontSize: 11 }}>—</span>
                        )}
                      </td>
                    )
                  })}
                </tr>

                {/* member rows */}
                {members.map((m, mi) => (
                  <tr key={m.id} style={{ background: mi % 2 === 0 ? '#fff' : '#f8fafc' }}>
                    <td style={{ ...tdS, fontWeight: 600, color: '#1e293b' }}>{m.name}</td>
                    <td style={tdS}><EmpBadge type={m.employment_type} /></td>
                    <td style={{ ...tdS, color: '#64748b' }}>{m.position ?? <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                    <td style={{ ...tdS, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#1e293b' }}>
                      {calcSum(m.rate_plan, m.shifts, dates)}{m.rate_plan ? ' ₽' : ''}
                    </td>
                    <td style={{ ...tdS, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#1e293b' }}>
                      {calcSum(m.rate_fact, m.shifts, dates)}{m.rate_fact ? ' ₽' : ''}
                    </td>
                    {globalDates.map((d) => {
                      if (!dateTypeMap[d]) {
                        return <td key={d} style={{ ...tdS, background: '#f3f4f6' }} />
                      }
                      const v = normalise(m.shifts[d])
                      const confirmed: ShiftConfirmed = v?.confirmed ?? (v ? 'yes' : null)
                      return (
                        <td key={d} style={{ ...tdS, textAlign: 'center' }}>
                          {confirmed ? (
                            <span title={confirmed === 'yes' ? 'Подтверждён' : 'Не подтверждён'} style={{
                              display: 'inline-block', width: 18, height: 18, borderRadius: 5,
                              background: confirmed === 'yes' ? '#22c55e' : '#f59e0b',
                            }} />
                          ) : (
                            <span style={{ display: 'inline-block', width: 18, height: 4, borderRadius: 2, background: '#f1f5f9' }} />
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}

                {/* section-gap */}
                {vIdx < visibleRows.length - 1 && (
                  <tr key={`${project.id}-gap`}>
                    <td colSpan={6 + globalDates.length} style={{ height: 12, background: '#f8fafc', borderTop: '2px solid #e2e8f0', padding: 0 }} />
                  </tr>
                )}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── MicroProjectTab ──────────────────────────────────────────────────────────

export { MicroProject }

export function MicroProjectTab({ project, onDeleted, onCopied, onUpdated }: {
  project: MicroProject
  onDeleted: () => void
  onCopied: (newId: string) => void
  onUpdated: () => void
}) {
  const qc = useQueryClient()
  const [microTab, setMicroTab] = useState<'team' | 'expenses'>('team')
  const [datePopup, setDatePopup] = useState<DatePopup | null>(null)

  const updateProject = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.patch(`/status-rows/${project.id}`, data).then((r) => r.data),
    onSuccess: onUpdated,
  })

  const saveField = (key: string, value: unknown) => {
    updateProject.mutate({ [key]: value })
  }

  const deleteProject = useMutation({
    mutationFn: () => api.delete(`/status-rows/${project.id}`).then((r) => r.data),
    onSuccess: onDeleted,
  })

  const { data: members = [], isLoading: membersLoading } = useQuery<ProjectMember[]>({
    queryKey: ['project-members', project.id],
    queryFn: () => api.get(`/project-members?projectId=${project.id}`).then((r) => r.data),
    staleTime: 30_000,
  })

  const copyProject = useMutation({
    mutationFn: async () => {
      const created = await api.post('/status-rows', {
        name: project.name + ' (копия)',
        client: project.client,
        format: project.format,
        location: project.location,
        execProducer: project.execProducer,
        lineProducer: project.lineProducer,
        accountManager: project.accountManager,
        matrixRegistryId: project.matrixRegistryId,
        status: 'request',
        date: null,
      }).then((r) => r.data)
      for (const m of members) {
        await api.post('/project-members', { projectId: created.id, name: m.name, position: m.position, shifts: {} })
      }
      return created
    },
    onSuccess: (d) => onCopied(d.id),
  })

  // ── Date mutations ─────────────────────────────────────────────────────────

  const addDateMutation = useMutation({
    mutationFn: (p: DatePopup) => {
      const iso = p.date
      if (project.days.some((d) => toIsoDate(d.date) === iso)) return Promise.resolve(null)
      return api.patch(`/status-rows/${project.id}`, {
        days: [
          ...buildDaysPayload(project.days),
          { date: new Date(iso).toISOString(), type: p.type, startTime: p.startTime || null, timeFrom: p.timeFrom || null, timeTo: p.timeTo || null, allDay: p.allDay, firstMotor: p.firstMotor || null },
        ],
      }).then((r) => r.data)
    },
    onSuccess: () => { onUpdated(); setDatePopup(null) },
  })

  const updateDayMutation = useMutation({
    mutationFn: (p: DatePopup) => {
      const updated = project.days.map((d) =>
        toIsoDate(d.date) === p.origDate
          ? { id: d.id, date: p.date ? new Date(p.date).toISOString() : d.date, type: p.type, startTime: p.startTime || null, timeFrom: p.timeFrom || null, timeTo: p.timeTo || null, allDay: p.allDay, firstMotor: p.firstMotor || null }
          : { id: d.id, date: d.date, type: d.type, startTime: d.startTime ?? null, timeFrom: d.timeFrom ?? null, timeTo: d.timeTo ?? null, allDay: d.allDay ?? false, firstMotor: d.firstMotor ?? null }
      )
      return api.patch(`/status-rows/${project.id}`, { days: updated }).then((r) => r.data)
    },
    onSuccess: () => { onUpdated(); setDatePopup(null) },
  })

  const removeDateMutation = useMutation({
    mutationFn: (date: string) => {
      const remaining = project.days
        .filter((d) => toIsoDate(d.date) !== date)
        .map((d) => ({ id: d.id, date: d.date, type: d.type, startTime: d.startTime ?? null, timeFrom: d.timeFrom ?? null, timeTo: d.timeTo ?? null, allDay: d.allDay ?? false, firstMotor: d.firstMotor ?? null }))
      return api.patch(`/status-rows/${project.id}`, { days: remaining }).then((r) => r.data)
    },
    onSuccess: onUpdated,
  })

  const openAddDate = () => setDatePopup({ mode: 'add', origDate: '', date: '', type: 'efir', timeFrom: '', timeTo: '', startTime: '', allDay: false, firstMotor: '' })
  const openEditDate = (entry: { date: string; type: string; isMain?: boolean }) => {
    const day = project.days.find((d) => toIsoDate(d.date) === entry.date)
    setDatePopup({ mode: 'edit', origDate: entry.date, date: entry.date, type: entry.type, isMain: entry.isMain, timeFrom: day?.timeFrom ?? '', timeTo: day?.timeTo ?? '', startTime: day?.startTime ?? '', allDay: day?.allDay ?? false, firstMotor: day?.firstMotor ?? '' })
  }
  const closePopup = () => setDatePopup(null)
  const submitPopup = () => {
    if (!datePopup) return
    if (datePopup.mode === 'add') { if (datePopup.date) addDateMutation.mutate(datePopup) }
    else updateDayMutation.mutate(datePopup)
  }
  const datePopupPending = addDateMutation.isPending || updateDayMutation.isPending

  const inputS: React.CSSProperties = { width: '100%', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 8px', fontSize: 12, color: '#1e293b', fontFamily: 'inherit', outline: 'none', background: '#fff', boxSizing: 'border-box' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Content — left info panel always visible */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <ProjectInfoPanel project={project} onSave={saveField} />
        <TeamTable
          project={project}
          members={members}
          loading={membersLoading}
          onUpdated={onUpdated}
          microTab={microTab}
          setMicroTab={setMicroTab}
          onCopy={() => { if (!copyProject.isPending) copyProject.mutate() }}
          onDelete={() => { if (confirm(`Удалить «${project.name}»?`)) deleteProject.mutate() }}
          copyPending={copyProject.isPending}
          deletePending={deleteProject.isPending}
          onAddDate={openAddDate}
          onEditDate={openEditDate}
        />
      </div>

      {/* Date popup (shared) */}
      {datePopup && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onMouseDown={closePopup}>
          <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 8px 40px rgba(0,0,0,0.18)', padding: 20, width: 300, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '90vh', overflowY: 'auto' }}
            onMouseDown={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
              {datePopup.mode === 'add' ? 'Добавить дату' : 'Редактировать дату'}
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 4 }}>Дата</label>
              <input type="date" value={datePopup.date} onChange={(e) => setDatePopup((p) => p ? { ...p, date: e.target.value } : null)} style={inputS} />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 4 }}>Тип</label>
              <select value={datePopup.type} onChange={(e) => setDatePopup((p) => p ? { ...p, type: e.target.value } : null)} style={inputS}>
                <option value="zastroyka">Застройка</option>
                <option value="efir">Эфир</option>
                <option value="deadline">Дедлайн</option>
                <option value="semka">Съёмка</option>
              </select>
            </div>
            {datePopup.type === 'efir' && (
              <>
                <div style={{ display: 'flex', gap: 8 }}>
                  <TimeField label="Начало" value={datePopup.timeFrom} onChange={(v) => setDatePopup((p) => p ? { ...p, timeFrom: v } : null)} />
                  <TimeField label="Конец" value={datePopup.timeTo} onChange={(v) => setDatePopup((p) => p ? { ...p, timeTo: v } : null)} />
                </div>
                <TimeField label="Начало эфира" value={datePopup.startTime} onChange={(v) => setDatePopup((p) => p ? { ...p, startTime: v } : null)} />
              </>
            )}
            {datePopup.type === 'zastroyka' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <TimeField label="Начало" value={datePopup.timeFrom} onChange={(v) => setDatePopup((p) => p ? { ...p, timeFrom: v } : null)} />
                <TimeField label="Конец" value={datePopup.timeTo} onChange={(v) => setDatePopup((p) => p ? { ...p, timeTo: v } : null)} />
              </div>
            )}
            {datePopup.type === 'deadline' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="allday-chk" checked={datePopup.allDay} onChange={(e) => setDatePopup((p) => p ? { ...p, allDay: e.target.checked } : null)} style={{ width: 16, height: 16 }} />
                <label htmlFor="allday-chk" style={{ fontSize: 12, color: '#1e293b', cursor: 'pointer' }}>Весь день</label>
              </div>
            )}
            {datePopup.type === 'semka' && (
              <>
                <div style={{ display: 'flex', gap: 8 }}>
                  <TimeField label="Начало" value={datePopup.timeFrom} onChange={(v) => setDatePopup((p) => p ? { ...p, timeFrom: v } : null)} />
                  <TimeField label="Конец" value={datePopup.timeTo} onChange={(v) => setDatePopup((p) => p ? { ...p, timeTo: v } : null)} />
                </div>
                <TimeField label="Первый мотор" value={datePopup.firstMotor} onChange={(v) => setDatePopup((p) => p ? { ...p, firstMotor: v } : null)} />
              </>
            )}
            <div style={{ display: 'flex', gap: 6, paddingTop: 4 }}>
              <button onClick={submitPopup} disabled={!datePopup.date || datePopupPending}
                style={{ flex: 1, fontSize: 12, padding: '7px', borderRadius: 6, border: '1px solid #2563eb', background: '#2563eb', color: '#fff', cursor: (!datePopup.date || datePopupPending) ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: (!datePopup.date || datePopupPending) ? 0.6 : 1 }}>
                {datePopupPending ? '...' : datePopup.mode === 'add' ? 'Добавить' : 'Сохранить'}
              </button>
              {datePopup.mode === 'edit' && !datePopup.isMain && (
                <button onClick={() => { removeDateMutation.mutate(datePopup.origDate); closePopup() }}
                  style={{ fontSize: 12, padding: '7px 10px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff', color: '#ef4444', cursor: 'pointer' }}>
                  Удалить
                </button>
              )}
              <button onClick={closePopup}
                style={{ flex: 1, fontSize: 12, padding: '7px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: 'pointer' }}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── InfoField (helper for ProjectInfoPanel) ──────────────────────────────────

function InfoField({ label, fieldKey, value, onSave }: {
  label: string; fieldKey: string; value: string | null
  onSave: (k: string, v: unknown) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const commit = () => {
    if ((draft.trim() || null) !== (value || null)) onSave(fieldKey, draft.trim() || null)
    setEditing(false)
  }
  return (
    <div style={{ padding: '9px 14px', borderBottom: '1px solid #f8fafc' }}>
      <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: 3 }}>{label}</div>
      {editing ? (
        <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false) } }}
          style={{ fontSize: 13, padding: '2px 6px', border: '1px solid #3b82f6', borderRadius: 5, width: '100%', boxSizing: 'border-box' as const, outline: 'none', color: '#1e293b', fontFamily: 'inherit' }} />
      ) : (
        <div onClick={() => { setDraft(value ?? ''); setEditing(true) }}
          title="Нажмите для редактирования"
          style={{ fontSize: 13, color: value ? '#1e293b' : '#cbd5e1', cursor: 'text', minHeight: 18, fontWeight: value ? 500 : 400 }}>
          {value || '—'}
        </div>
      )}
    </div>
  )
}

// ─── ProjectInfoPanel ──────────────────────────────────────────────────────

function buildDaysPayload(days: ProjectDay[]) {
  return days.map((d) => ({
    id: d.id, date: d.date, type: d.type,
    startTime: d.startTime ?? null,
    timeFrom: d.timeFrom ?? null,
    timeTo: d.timeTo ?? null,
    allDay: d.allDay ?? false,
    firstMotor: d.firstMotor ?? null,
  }))
}

type DatePopup = {
  mode: 'add' | 'edit'
  origDate: string        // original ISO date (key for edit)
  date: string            // date input value (YYYY-MM-DD)
  type: string
  isMain?: boolean
  timeFrom: string
  timeTo: string
  startTime: string       // начало эфира (efir) — reused for съёмка first motor display
  allDay: boolean
  firstMotor: string
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ flex: 1 }}>
      <label style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 3 }}>{label}</label>
      <input type="time" value={value} onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 8px', fontSize: 12, color: '#1e293b', fontFamily: 'inherit', outline: 'none', background: '#fff', boxSizing: 'border-box' as const }} />
    </div>
  )
}

function ProjectInfoPanel({ project, onSave }: {
  project: MicroProject
  onSave: (key: string, value: unknown) => void
}) {
  const [editingStatus, setEditingStatus] = useState(false)
  const [notesDraft, setNotesDraft] = useState(project.notes ?? '')

  useEffect(() => { setNotesDraft(project.notes ?? '') }, [project.id, project.notes])

  return (
    <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid #e2e8f0', background: '#fafafa', display: 'flex', flexDirection: 'column', gap: 10, padding: 14, overflowY: 'auto' }}>

      {/* Block 1: static fields */}
      <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 10, overflow: 'hidden' }}>
        {/* Status */}
        <div style={{ padding: '9px 14px', borderBottom: '1px solid #f8fafc', position: 'relative' }}>
          <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: 3 }}>Статус</div>
          <div onClick={() => setEditingStatus((v) => !v)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[project.status] ?? '#94a3b8', flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: STATUS_COLORS[project.status] ?? '#475569', fontWeight: 500 }}>
              {STATUS_LABELS[project.status] ?? project.status}
            </span>
          </div>
          {editingStatus && (
            <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 20, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, boxShadow: '0 4px 14px rgba(0,0,0,0.12)', minWidth: 160, overflow: 'hidden' }}>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <div key={k} onClick={() => { onSave('status', k); setEditingStatus(false) }}
                  style={{ padding: '7px 12px', fontSize: 12, cursor: 'pointer', color: STATUS_COLORS[k] ?? '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLORS[k], display: 'inline-block' }} />
                  {v}
                </div>
              ))}
            </div>
          )}
        </div>
        <InfoField label="Локация"        fieldKey="location"      value={project.location}      onSave={onSave} />
        <InfoField label="Исп. продюсер"  fieldKey="execProducer"  value={project.execProducer}  onSave={onSave} />
        <InfoField label="Лайн-продюсер"  fieldKey="lineProducer"  value={project.lineProducer}  onSave={onSave} />
      </div>

      {/* Block 2: Описание */}
      <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div style={{ padding: '9px 12px 8px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Описание</span>
        </div>
        <textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          onBlur={() => { if ((notesDraft.trim() || null) !== (project.notes || null)) onSave('notes', notesDraft.trim() || null) }}
          placeholder="Добавьте описание..."
          style={{ flex: 1, resize: 'none', border: 'none', outline: 'none', padding: '10px 12px', fontSize: 12, color: '#1e293b', fontFamily: 'inherit', background: 'transparent', lineHeight: 1.5, minHeight: 80 }}
        />
      </div>
    </div>
  )
}


// ─── TeamTable ────────────────────────────────────────────────────────────────

function TeamTable({ project, members, loading, onUpdated, microTab, setMicroTab, onCopy, onDelete, copyPending, deletePending, onAddDate, onEditDate }: {
  project: MicroProject
  members: ProjectMember[]
  loading: boolean
  onUpdated: () => void
  microTab: 'team' | 'expenses'
  setMicroTab: (t: 'team' | 'expenses') => void
  onCopy: () => void
  onDelete: () => void
  copyPending: boolean
  deletePending: boolean
  onAddDate: () => void
  onEditDate: (entry: { date: string; type: string; isMain?: boolean }) => void
}) {
  const qc = useQueryClient()

  // Collapsible columns
  const [collapsedCols, setCollapsedCols] = useState<Set<string>>(new Set())
  const toggleCol = (col: string) => setCollapsedCols((prev) => {
    const next = new Set(prev); if (next.has(col)) next.delete(col); else next.add(col); return next
  })
  const isC = (col: string) => collapsedCols.has(col)

  // New-member inline edit row
  type EditRowState = { id: string; name: string; pos: string; empType: string; ratePlan: string; rateFact: string }
  const [editRow, setEditRow] = useState<EditRowState | null>(null)

  // Date columns derived from project — editable via column header clicks
  const dateCols = useMemo(() => {
    const set = new Set<string>()
    if (project.date) set.add(toIsoDate(project.date))
    project.days.forEach((d) => set.add(toIsoDate(d.date)))
    return [...set].sort()
  }, [project.date, project.days])

  // Map date → type label for column headers
  const dateTypeMap = useMemo(() => {
    const map: Record<string, string> = {}
    if (project.date) map[toIsoDate(project.date)] = 'efir'
    project.days.forEach((d) => { map[toIsoDate(d.date)] = d.type })
    return map
  }, [project.date, project.days])

  const TYPE_COLORS: Record<string, { bg: string; color: string }> = {
    zastroyka: { bg: '#fef3c7', color: '#92400e' },
    efir:      { bg: '#dbeafe', color: '#1d4ed8' },
    deadline:  { bg: '#fee2e2', color: '#991b1b' },
    semka:     { bg: '#d1fae5', color: '#065f46' },
  }
  const TYPE_LABELS: Record<string, string> = {
    zastroyka: 'Застройка', efir: 'Эфир', deadline: 'Дедлайн', semka: 'Съёмка',
  }

  const createMember = useMutation({
    mutationFn: () => api.post('/project-members', {
      projectId: project.id, name: 'Новый участник', position: null, employmentType: null, ratePlan: null, rateFact: null,
    }).then((r) => r.data),
    onSuccess: (created: ProjectMember) => {
      qc.setQueryData(['project-members', project.id], (old: ProjectMember[] | undefined) => [...(old ?? []), created])
      setEditRow({ id: created.id, name: 'Новый участник', pos: '', empType: '', ratePlan: '', rateFact: '' })
    },
  })

  const updateMember = useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; position?: string | null; employmentType?: string | null; ratePlan?: number | null; rateFact?: number | null }) =>
      api.patch(`/project-members/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-members', project.id] }),
  })

  const saveEditField = (field: keyof EditRowState, val: string) => {
    if (!editRow) return
    const id = editRow.id
    if (field === 'name') updateMember.mutate({ id, name: val.trim() || 'Новый участник' })
    else if (field === 'pos') updateMember.mutate({ id, position: val.trim() || null })
    else if (field === 'empType') updateMember.mutate({ id, employmentType: val || null })
    else if (field === 'ratePlan') updateMember.mutate({ id, ratePlan: val ? parseFloat(val) : null })
    else if (field === 'rateFact') updateMember.mutate({ id, rateFact: val ? parseFloat(val) : null })
  }

  const removeMember = useMutation({
    mutationFn: (id: string) => api.delete(`/project-members/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-members', project.id] }),
  })

  const updateMemberShifts = useMutation({
    mutationFn: ({ id, shifts }: { id: string; shifts: Record<string, RawShiftValue> }) =>
      api.patch(`/project-members/${id}`, { shifts }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-members', project.id] }),
  })

  const toggleCell = (member: ProjectMember, date: string) => {
    const current = normalise(member.shifts[date])
    const currentConfirmed: ShiftConfirmed = current?.confirmed ?? (current ? 'yes' : null)
    const next = nextConfirmed(currentConfirmed)
    const newShifts = { ...member.shifts }
    if (next === null) delete newShifts[date]
    else newShifts[date] = { type: 'efir', confirmed: next }
    updateMemberShifts.mutate({ id: member.id, shifts: newShifts })
  }

  const inputS: React.CSSProperties = { fontSize: 12, padding: '3px 7px', border: '1px solid #e2e8f0', borderRadius: 5, color: '#1e293b', background: '#fff' }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* View toggle bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', borderBottom: '1px solid #f1f5f9', flexShrink: 0, gap: 8 }}>
        <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: 7, overflow: 'hidden' }}>
          <button onClick={() => setMicroTab('team')}
            style={{ fontSize: 12, padding: '5px 14px', border: 'none', cursor: 'pointer', background: microTab === 'team' ? '#2563eb' : '#fff', color: microTab === 'team' ? '#fff' : '#64748b', fontFamily: 'inherit' }}>
            Команда
          </button>
          <button onClick={() => setMicroTab('expenses')}
            style={{ fontSize: 12, padding: '5px 14px', border: 'none', cursor: 'pointer', background: microTab === 'expenses' ? '#2563eb' : '#fff', color: microTab === 'expenses' ? '#fff' : '#64748b', fontFamily: 'inherit' }}>
            Производственные расходы
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={onCopy} disabled={copyPending}
            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'none', color: '#475569', cursor: 'pointer', fontFamily: 'inherit' }}>
            {copyPending ? '...' : 'Копировать'}
          </button>
          <button onClick={onDelete} disabled={deletePending}
            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #fecaca', background: 'none', color: '#ef4444', cursor: 'pointer', fontFamily: 'inherit' }}>
            {deletePending ? '...' : 'Удалить'}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading && <div style={{ padding: 20, color: '#94a3b8', fontSize: 13 }}>Загрузка...</div>}

        {!loading && microTab === 'team' && (
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {/* collapsible team columns — double-click to collapse */}
                {(['name','emp','pos','ratePlan','rateFact','sumPlan','sumFact'] as const).map((col, ci) => {
                  const labels: Record<string, string> = { name:'ФИО', emp:'Формат', pos:'Должность', ratePlan:'Цена план', rateFact:'Цена факт', sumPlan:'Сумма план', sumFact:'Сумма факт' }
                  const minWidths: Record<string, number> = { name:150, emp:80, pos:120, ratePlan:80, rateFact:80, sumPlan:80, sumFact:80 }
                  const aligns: Record<string, string> = { ratePlan:'right', rateFact:'right', sumPlan:'right', sumFact:'right' }
                  const collapsed = isC(col)
                  return (
                    <th key={col} onDoubleClick={() => toggleCol(col)} title={collapsed ? `Показать «${labels[col]}»` : 'Двойной клик — скрыть столбец'}
                      style={{ borderBottom: '2px solid #e2e8f0', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', ...(collapsed
                        ? { width: 20, padding: '0 2px', textAlign: 'center', fontSize: 10, color: '#94a3b8', background: '#f8fafc', ...(col === 'sumFact' ? { borderRight: '2px solid #cbd5e1' } : {}) }
                        : { padding: col === 'name' ? '8px 14px' : '8px 10px', fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: (aligns[col] ?? 'left') as any, minWidth: minWidths[col], textTransform: 'uppercase', letterSpacing: '0.03em', ...(col === 'sumFact' ? { borderRight: '2px solid #cbd5e1' } : {}) }
                      )}}>
                      {collapsed ? '▶' : labels[col]}
                    </th>
                  )
                })}
                {/* + button before first date */}
                <th style={{ borderBottom: '2px solid #e2e8f0', width: 24, padding: '0 2px', textAlign: 'center', verticalAlign: 'middle' }}>
                  <button onClick={onAddDate} title="Добавить дату"
                    style={{ fontSize: 14, lineHeight: 1, width: 20, height: 20, borderRadius: 4, border: '1px dashed #cbd5e1', background: 'none', color: '#94a3b8', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                </th>
                {dateCols.map((d) => {
                  const type = dateTypeMap[d] ?? 'efir'
                  const tColor = TYPE_COLORS[type] ?? { bg: '#f3e8ff', color: '#7e22ce' }
                  const isMain = project.date ? toIsoDate(project.date) === d : false
                  return (
                    <React.Fragment key={d}>
                      <th onClick={() => onEditDate({ date: d, type, isMain })}
                        title="Нажмите для редактирования"
                        style={{ padding: '6px 10px', borderBottom: '2px solid #e2e8f0', minWidth: 84, textAlign: 'center', verticalAlign: 'bottom', fontSize: 11, fontWeight: 700, color: '#64748b', cursor: 'pointer' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                        {fmtDateShort(d)}
                        <div style={{ marginTop: 2, fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: tColor.bg, color: tColor.color, display: 'inline-block' }}>
                          {TYPE_LABELS[type] ?? type}
                        </div>
                      </th>
                      {/* + button after each date */}
                      <th style={{ borderBottom: '2px solid #e2e8f0', width: 24, padding: '0 2px', textAlign: 'center', verticalAlign: 'middle' }}>
                        <button onClick={onAddDate} title="Добавить дату"
                          style={{ fontSize: 14, lineHeight: 1, width: 20, height: 20, borderRadius: 4, border: '1px dashed #cbd5e1', background: 'none', color: '#94a3b8', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                      </th>
                    </React.Fragment>
                  )
                })}
                <th style={{ width: '100%', borderBottom: '2px solid #e2e8f0' }} />
                <th style={{ padding: '8px 6px', borderBottom: '2px solid #e2e8f0', width: 30 }} />
              </tr>
            </thead>
            <tbody>
              {members.map((m, ri) => {
                const isEditRow = editRow?.id === m.id
                const sumPlan = calcSum(m.rate_plan, m.shifts, dateCols)
                const sumFact = calcSum(m.rate_fact, m.shifts, dateCols)
                const rowBg = isEditRow ? '#f0f9ff' : ri % 2 === 0 ? '#fff' : '#f8fafc'
                const cellBdr = '1px solid #eef0f4'
                return (
                  <tr key={m.id} style={{ background: rowBg }}>
                    {/* ФИО */}
                    {isC('name') ? <td style={{ width: 20, borderBottom: cellBdr }} /> : (
                      <td style={{ padding: '8px 14px', fontWeight: 600, color: '#1e293b', borderBottom: cellBdr, whiteSpace: 'nowrap' }}>
                        {isEditRow
                          ? <input autoFocus value={editRow!.name} onChange={(e) => setEditRow((p) => p ? { ...p, name: e.target.value } : null)} onBlur={() => saveEditField('name', editRow!.name)} style={{ ...inputS, width: '100%', fontWeight: 600 }} />
                          : m.name}
                      </td>
                    )}
                    {/* Формат */}
                    {isC('emp') ? <td style={{ width: 20, borderBottom: cellBdr }} /> : (
                      <td style={{ padding: '8px 10px', borderBottom: cellBdr }}>
                        {isEditRow
                          ? <select value={editRow!.empType} onChange={(e) => setEditRow((p) => p ? { ...p, empType: e.target.value } : null)} onBlur={() => saveEditField('empType', editRow!.empType)} style={{ ...inputS, width: '100%' }}>
                              <option value="">—</option>
                              {Object.entries(EMP_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                          : <EmpBadge type={m.employment_type} />}
                      </td>
                    )}
                    {/* Должность */}
                    {isC('pos') ? <td style={{ width: 20, borderBottom: cellBdr }} /> : (
                      <td style={{ padding: '8px 10px', color: '#64748b', borderBottom: cellBdr }}>
                        {isEditRow
                          ? <input value={editRow!.pos} onChange={(e) => setEditRow((p) => p ? { ...p, pos: e.target.value } : null)} onBlur={() => saveEditField('pos', editRow!.pos)} placeholder="Должность" style={{ ...inputS, width: '100%' }} />
                          : m.position ?? <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                    )}
                    {/* Цена план */}
                    {isC('ratePlan') ? <td style={{ width: 20, borderBottom: cellBdr }} /> : (
                      <td style={{ padding: '8px 10px', borderBottom: cellBdr, textAlign: 'right' }}>
                        {isEditRow
                          ? <input type="number" value={editRow!.ratePlan} onChange={(e) => setEditRow((p) => p ? { ...p, ratePlan: e.target.value } : null)} onBlur={() => saveEditField('ratePlan', editRow!.ratePlan)} placeholder="0" style={{ ...inputS, width: '100%', textAlign: 'right' }} />
                          : <RateCell memberId={m.id} field="ratePlan" value={m.rate_plan} onSave={(v) => updateMember.mutate({ id: m.id, ratePlan: v })} />}
                      </td>
                    )}
                    {/* Цена факт */}
                    {isC('rateFact') ? <td style={{ width: 20, borderBottom: cellBdr }} /> : (
                      <td style={{ padding: '8px 10px', borderBottom: cellBdr, textAlign: 'right' }}>
                        {isEditRow
                          ? <input type="number" value={editRow!.rateFact} onChange={(e) => setEditRow((p) => p ? { ...p, rateFact: e.target.value } : null)} onBlur={() => saveEditField('rateFact', editRow!.rateFact)} placeholder="0" style={{ ...inputS, width: '100%', textAlign: 'right' }} />
                          : <RateCell memberId={m.id} field="rateFact" value={m.rate_fact} onSave={(v) => updateMember.mutate({ id: m.id, rateFact: v })} />}
                      </td>
                    )}
                    {/* Сумма план */}
                    {isC('sumPlan') ? <td style={{ width: 20, borderBottom: cellBdr }} /> : (
                      <td style={{ padding: '8px 10px', borderBottom: cellBdr, textAlign: 'right', color: '#1e293b', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                        {isEditRow ? null : <>{sumPlan}{m.rate_plan ? ' ₽' : ''}</>}
                      </td>
                    )}
                    {/* Сумма факт */}
                    {isC('sumFact') ? <td style={{ width: 20, borderBottom: cellBdr, borderRight: '2px solid #cbd5e1' }} /> : (
                      <td style={{ padding: '8px 10px', borderBottom: cellBdr, textAlign: 'right', color: '#1e293b', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                        {isEditRow ? null : <>{sumFact}{m.rate_fact ? ' ₽' : ''}</>}
                      </td>
                    )}
                    {/* leading + spacer */}
                    <td style={{ borderBottom: cellBdr }} />
                    {dateCols.map((d) => {
                      const v = normalise(m.shifts[d])
                      const confirmed: ShiftConfirmed = v?.confirmed ?? (v ? 'yes' : null)
                      return (
                        <React.Fragment key={d}>
                          <td style={{ padding: '8px 10px', textAlign: 'center', borderBottom: cellBdr, borderLeft: '1px solid #f1f5f9' }}>
                            {!isEditRow && (
                              <button onClick={() => toggleCell(m, d)}
                                title={confirmed === 'yes' ? 'Подтверждён (нажмите → не подтверждён)' : confirmed === 'pending' ? 'Не подтверждён (нажмите → убрать)' : 'Нет (нажмите → добавить)'}
                                style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid', borderColor: confirmed === 'yes' ? '#22c55e' : confirmed === 'pending' ? '#f59e0b' : '#e2e8f0', background: confirmedColor(confirmed), cursor: 'pointer', display: 'inline-block', transition: 'background 0.15s' }}
                              />
                            )}
                          </td>
                          <td style={{ borderBottom: cellBdr }} />
                        </React.Fragment>
                      )
                    })}
                    <td style={{ borderBottom: cellBdr }} />
                    <td style={{ padding: '8px 6px', borderBottom: cellBdr, textAlign: 'center' }}>
                      <button onClick={() => { removeMember.mutate(m.id); if (isEditRow) setEditRow(null) }}
                        style={{ fontSize: 14, color: '#cbd5e1', border: 'none', background: 'none', cursor: 'pointer', lineHeight: 1 }} title="Удалить">×</button>
                    </td>
                  </tr>
                )
              })}

              {/* + row to add new member */}
              <tr onClick={() => { if (!createMember.isPending) createMember.mutate() }}
                style={{ cursor: createMember.isPending ? 'default' : 'pointer', background: 'transparent' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                <td colSpan={99} style={{ padding: '5px 14px', textAlign: 'center', color: '#94a3b8', fontSize: 18, borderBottom: '1px solid #eef0f4' }}>
                  {createMember.isPending ? '…' : '+'}
                </td>
              </tr>
            </tbody>
          </table>
        )}

        {!loading && microTab === 'expenses' && (
          <ExpensesTab projectId={project.id} />
        )}
      </div>

      {/* Footer legend (only for team tab) */}
      {!loading && microTab === 'team' && (
        <div style={{ padding: '6px 14px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, background: '#fafafa' }}>
          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#94a3b8', marginLeft: 'auto' }}>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: '#22c55e', verticalAlign: 'middle', marginRight: 4 }} />Подтверждён</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: '#f59e0b', verticalAlign: 'middle', marginRight: 4 }} />Не подтверждён</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── ExpensesTab ──────────────────────────────────────────────────────────────

function ExpensesTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const [collapsedCols, setCollapsedCols] = useState<Set<string>>(new Set())
  const [uploadExpenseId, setUploadExpenseId] = useState<string | null>(null)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const toggleCol = (col: string) => setCollapsedCols((prev) => {
    const next = new Set(prev); if (next.has(col)) next.delete(col); else next.add(col); return next
  })
  const isC = (col: string) => collapsedCols.has(col)

  const { data: expenses = [], isLoading } = useQuery<ShiftExpense[]>({
    queryKey: ['shift-expenses', projectId],
    queryFn: () => api.get(`/shift-expenses?projectId=${projectId}`).then((r) => r.data),
    staleTime: 30_000,
  })

  const createExpense = useMutation({
    mutationFn: () => api.post('/shift-expenses', { projectId, expenseType: 'Новый расход', orderedBy: null, amount: null, notes: null }).then((r) => r.data),
    onSuccess: (created) => {
      qc.setQueryData(['shift-expenses', projectId], (old: ShiftExpense[] | undefined) => [...(old ?? []), created])
    },
  })

  const updateExpense = useMutation({
    mutationFn: ({ id, ...data }: Partial<ShiftExpense> & { id: string }) =>
      api.patch(`/shift-expenses/${id}`, {
        expenseType: (data as any).expense_type,
        orderedBy: (data as any).ordered_by,
        amount: (data as any).amount != null ? parseFloat(String((data as any).amount)) : null,
        notes: (data as any).notes,
      }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shift-expenses', projectId] }),
  })

  const deleteExpense = useMutation({
    mutationFn: (id: string) => api.delete(`/shift-expenses/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shift-expenses', projectId] }),
  })

  const inputS: React.CSSProperties = { fontSize: 12, padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 5, color: '#1e293b', background: '#fff' }

  const thBase: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'left', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.03em', background: '#f8fafc', cursor: 'pointer', userSelect: 'none' }
  const tdS: React.CSSProperties = { padding: '8px 12px', fontSize: 13, borderBottom: '1px solid #f1f5f9' }

  const ColTh = ({ col, label, style }: { col: string; label: string; style?: React.CSSProperties }) => {
    const collapsed = isC(col)
    return (
      <th onDoubleClick={() => toggleCol(col)} title={collapsed ? `Показать «${label}»` : 'Двойной клик — скрыть столбец'}
        style={{ ...thBase, ...(collapsed ? { width: 20, padding: '0 2px', textAlign: 'center' } : { padding: '8px 12px', ...style }) }}>
        {collapsed ? '▶' : label}
      </th>
    )
  }
  const ColTd = ({ col, children, style }: { col: string; children?: React.ReactNode; style?: React.CSSProperties }) =>
    isC(col) ? <td style={{ width: 20, borderBottom: '1px solid #f1f5f9', overflow: 'hidden', padding: 0 }} /> : <td style={{ ...tdS, ...style }}>{children}</td>

  const EditableCell = ({ expense, field, type = 'text' }: { expense: ShiftExpense; field: keyof ShiftExpense; type?: string }) => {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(String(expense[field] ?? ''))
    useEffect(() => { setDraft(String(expense[field] ?? '')) }, [expense.id, expense[field]])
    const commit = () => {
      const v = type === 'number' ? (draft ? parseFloat(draft) : null) : (draft.trim() || null)
      updateExpense.mutate({ id: expense.id, [field]: v } as any)
      setEditing(false)
    }
    if (editing) return (
      <input autoFocus type={type} value={draft} onChange={(e) => setDraft(e.target.value)}
        onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
        style={{ ...inputS, width: '100%' }} />
    )
    return (
      <span onClick={() => setEditing(true)} style={{ cursor: 'text', display: 'block', minHeight: 18, color: expense[field] ? '#1e293b' : '#cbd5e1' }}>
        {expense[field] != null && String(expense[field]) !== '' ? String(expense[field]) : '—'}
      </span>
    )
  }

  const total = expenses.reduce((s, e) => s + (e.amount ? parseFloat(String(e.amount)) : 0), 0)

  const canUpload = (e: ShiftExpense) => !!(e.expense_type && e.ordered_by && e.amount)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {isLoading && <div style={{ padding: 20, color: '#94a3b8', fontSize: 13 }}>Загрузка...</div>}
        {!isLoading && (
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <ColTh col="type"     label="Тип расхода"         style={{ width: '28%' }} />
                <ColTh col="by"       label="Кто заказал"         style={{ width: '22%' }} />
                <ColTh col="amount"   label="Сумма, ₽"            style={{ width: '13%' }} />
                <ColTh col="dropbox"  label="Путь к папке Dropbox" style={{}} />
                <th style={{ ...thBase, width: 100, padding: '8px 12px', cursor: 'default' }}>Чек</th>
                <th style={{ ...thBase, width: 36, cursor: 'default' }} />
              </tr>
            </thead>
            <tbody>
              {expenses.map((e, ri) => (
                <tr key={e.id} style={{ background: ri % 2 === 0 ? '#fff' : '#f8fafc' }}>
                  <ColTd col="type"><EditableCell expense={e} field="expense_type" /></ColTd>
                  <ColTd col="by"><EditableCell expense={e} field="ordered_by" /></ColTd>
                  <ColTd col="amount"><EditableCell expense={e} field="amount" type="number" /></ColTd>
                  <ColTd col="dropbox"><EditableCell expense={e} field="notes" /></ColTd>
                  <td style={{ ...tdS, textAlign: 'center' }}>
                    {canUpload(e) ? (
                      <button onClick={() => { setUploadExpenseId(e.id); setUploadFile(null) }}
                        style={{ fontSize: 11, padding: '3px 8px', borderRadius: 10, border: '1px solid #3b82f6', background: '#eff6ff', color: '#2563eb', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 500 }}>
                        📎 Загрузить чек
                      </button>
                    ) : (
                      <span style={{ fontSize: 11, color: '#cbd5e1' }} title="Заполните тип, заказчика и сумму">—</span>
                    )}
                  </td>
                  <td style={{ ...tdS, textAlign: 'center' }}>
                    <button onClick={() => deleteExpense.mutate(e.id)}
                      style={{ fontSize: 14, color: '#cbd5e1', border: 'none', background: 'none', cursor: 'pointer' }}>×</button>
                  </td>
                </tr>
              ))}
              {/* inline + row */}
              <tr onClick={() => { if (!createExpense.isPending) createExpense.mutate() }}
                style={{ cursor: createExpense.isPending ? 'default' : 'pointer' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                <td colSpan={99} style={{ padding: '5px 14px', textAlign: 'center', color: '#94a3b8', fontSize: 18, borderBottom: '1px solid #f1f5f9' }}>
                  {createExpense.isPending ? '…' : '+'}
                </td>
              </tr>
            </tbody>
            {expenses.length > 0 && (
              <tfoot>
                <tr style={{ background: '#f1f5f9' }}>
                  <td colSpan={2} style={{ ...tdS, fontWeight: 700, color: '#475569' }}>Итого:</td>
                  <td style={{ ...tdS, fontWeight: 700, color: '#1e293b' }}>{total.toLocaleString('ru-RU')} ₽</td>
                  <td colSpan={3} style={tdS} />
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>

      {/* File upload popup */}
      {uploadExpenseId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onMouseDown={() => { setUploadExpenseId(null); setUploadFile(null) }}>
          <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 8px 40px rgba(0,0,0,0.2)', padding: 28, width: 360, display: 'flex', flexDirection: 'column', gap: 16 }}
            onMouseDown={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Загрузить чек</div>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) setUploadFile(f) }}
              onClick={() => fileInputRef.current?.click()}
              style={{ border: `2px dashed ${dragOver ? '#3b82f6' : '#cbd5e1'}`, borderRadius: 10, padding: '32px 20px', textAlign: 'center', cursor: 'pointer', background: dragOver ? '#eff6ff' : '#f8fafc', transition: 'all 0.15s' }}>
              <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) setUploadFile(f) }} />
              {uploadFile ? (
                <div style={{ fontSize: 13, color: '#1e293b', fontWeight: 500 }}>📄 {uploadFile.name}</div>
              ) : (
                <>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
                  <div style={{ fontSize: 13, color: '#64748b' }}>Перетащите файл сюда или кликните для выбора</div>
                </>
              )}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>
              Загрузка файлов будет доступна после настройки хранилища
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button disabled={!uploadFile}
                style={{ flex: 1, fontSize: 12, padding: '8px', borderRadius: 7, border: '1px solid #2563eb', background: uploadFile ? '#2563eb' : '#e2e8f0', color: uploadFile ? '#fff' : '#94a3b8', cursor: uploadFile ? 'pointer' : 'not-allowed', fontWeight: 600 }}>
                Загрузить
              </button>
              <button onClick={() => { setUploadExpenseId(null); setUploadFile(null) }}
                style={{ flex: 1, fontSize: 12, padding: '8px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: 'pointer' }}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── CreateMicroProjectForm ───────────────────────────────────────────────────

function CreateMicroProjectForm({ matrixRegistryId, onCreated, onCancel }: {
  matrixRegistryId: string
  onCreated: (id: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [format_, setFormat] = useState('')
  const [location, setLocation] = useState('')
  const [status, setStatus] = useState('request')

  const create = useMutation({
    mutationFn: () => api.post('/status-rows', {
      name: name.trim(),
      date: date ? new Date(date).toISOString() : null,
      format: format_ || null,
      location: location || null,
      matrixRegistryId,
      status,
    }).then((r) => r.data),
    onSuccess: (data) => onCreated(data.id),
  })

  const inputS: React.CSSProperties = { fontSize: 13, padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, color: '#1e293b', background: '#fff', width: '100%', boxSizing: 'border-box' }
  const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4, display: 'block' }

  return (
    <div style={{ padding: 20, maxWidth: 480 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>Новая смена</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div><span style={label}>Название *</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Название смены" style={inputS} autoFocus /></div>
        <div><span style={label}>Дата</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputS} /></div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><span style={label}>Формат</span><input value={format_} onChange={(e) => setFormat(e.target.value)} placeholder="Формат" style={inputS} /></div>
          <div style={{ flex: 1 }}><span style={label}>Локация</span><input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Локация" style={inputS} /></div>
        </div>
        <div>
          <span style={label}>Статус</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputS}>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
        <button onClick={() => { if (name.trim()) create.mutate() }} disabled={!name.trim() || create.isPending}
          style={{ fontSize: 13, padding: '7px 18px', borderRadius: 7, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontWeight: 500 }}>
          {create.isPending ? 'Создание...' : 'Создать'}
        </button>
        <button onClick={onCancel} style={{ fontSize: 13, padding: '7px 14px', borderRadius: 7, border: '1px solid #e2e8f0', background: 'none', color: '#475569', cursor: 'pointer' }}>Отмена</button>
      </div>
      {create.isError && <div style={{ marginTop: 10, fontSize: 12, color: '#ef4444' }}>Ошибка: {(create.error as any)?.response?.data?.error ?? 'Не удалось создать'}</div>}
    </div>
  )
}
