import { useState, useMemo } from 'react'
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
          <button
            key={p.id}
            style={{ ...tabBtn(activeTab === p.id), maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}
            title={p.name}
            onClick={() => { setActiveTab(p.id); setCreating(false) }}
          >
            {p.name || '(без названия)'}
          </button>
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

  // All unique dates across all projects, sorted
  const allDates = useMemo(() => {
    const set = new Set<string>()
    projects.forEach((p) => {
      if (p.date) set.add(toIsoDate(p.date))
      p.days.forEach((d) => set.add(toIsoDate(d.date)))
    })
    memberQueries.forEach((q) => {
      (q.data ?? []).forEach((m: ProjectMember) => {
        Object.keys(m.shifts).forEach((rawDate) => set.add(toIsoDate(rawDate)))
      })
    })
    return [...set].sort()
  }, [projects, memberQueries])

  // Build rows grouped by project
  const rows = useMemo(() => {
    return projects.map((p, idx) => ({
      project: p,
      members: memberQueries[idx]?.data ?? [] as ProjectMember[],
    }))
  }, [projects, memberQueries])

  if (!allLoaded) return <div style={{ padding: 24, color: '#94a3b8', fontSize: 14 }}>Загрузка...</div>

  const hasAny = rows.some((r) => r.members.length > 0)
  if (!hasAny) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Нет участников.</div>

  const thS: React.CSSProperties = { padding: '7px 10px', fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'left', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1, textTransform: 'uppercase', letterSpacing: '0.03em' }
  const tdS: React.CSSProperties = { padding: '7px 10px', fontSize: 12, borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' }

  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...thS, minWidth: 160 }}>Смена</th>
            <th style={{ ...thS, minWidth: 160 }}>ФИО</th>
            <th style={{ ...thS, minWidth: 90 }}>Формат</th>
            <th style={{ ...thS, minWidth: 120 }}>Должность</th>
            <th style={{ ...thS, minWidth: 90, textAlign: 'right' }}>Сумма план</th>
            <th style={{ ...thS, minWidth: 90, textAlign: 'right' }}>Сумма факт</th>
            {allDates.map((d) => (
              <th key={d} style={{ ...thS, textAlign: 'center', minWidth: 64 }}>{fmtDateShort(d)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ project, members }) => {
            if (members.length === 0) return null
            const projDates = new Set<string>()
            if (project.date) projDates.add(toIsoDate(project.date))
            project.days.forEach((d) => projDates.add(toIsoDate(d.date)))
            const projDateCols = [...projDates].sort()

            return members.map((m, mi) => (
              <tr key={m.id} style={{ background: mi % 2 === 0 ? '#fff' : '#f8fafc' }}>
                {mi === 0 && (
                  <td rowSpan={members.length} style={{ ...tdS, verticalAlign: 'top', borderRight: '1px solid #e2e8f0', background: '#f8fafc', minWidth: 160, maxWidth: 200 }}>
                    <div style={{ fontWeight: 600, fontSize: 12, color: '#1e293b', marginBottom: 4, lineHeight: 1.3 }}>{project.name}</div>
                    {project.date && (
                      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 3 }}>{fmtDateFull(project.date)}</div>
                    )}
                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, background: (STATUS_COLORS[project.status] ?? '#94a3b8') + '22', color: STATUS_COLORS[project.status] ?? '#94a3b8', fontWeight: 600 }}>
                      {STATUS_LABELS[project.status] ?? project.status}
                    </span>
                    {project.execProducer && (
                      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>исп.пр.: {project.execProducer}</div>
                    )}
                  </td>
                )}
                <td style={{ ...tdS, fontWeight: 500, color: '#1e293b' }}>{m.name}</td>
                <td style={{ ...tdS }}><EmpBadge type={m.employment_type} /></td>
                <td style={{ ...tdS, color: '#64748b' }}>{m.position ?? <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                <td style={{ ...tdS, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#1e293b' }}>
                  {calcSum(m.rate_plan, m.shifts, projDateCols)} {m.rate_plan ? '₽' : ''}
                </td>
                <td style={{ ...tdS, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#1e293b' }}>
                  {calcSum(m.rate_fact, m.shifts, projDateCols)} {m.rate_fact ? '₽' : ''}
                </td>
                {allDates.map((d) => {
                  const v = normalise(m.shifts[d])
                  const confirmed: ShiftConfirmed = v?.confirmed ?? (v ? 'yes' : null)
                  const inProj = projDates.has(d)
                  return (
                    <td key={d} style={{ ...tdS, textAlign: 'center', background: !inProj ? '#f8fafc' : undefined }}>
                      {confirmed && (
                        <span title={confirmed === 'yes' ? 'Подтверждён' : 'Не подтверждён'} style={{
                          display: 'inline-block', width: 20, height: 20, borderRadius: 5,
                          background: confirmed === 'yes' ? '#bbf7d0' : '#fef08a',
                          border: confirmed === 'yes' ? '1px solid #22c55e' : '1px solid #f59e0b',
                        }} />
                      )}
                    </td>
                  )
                })}
              </tr>
            ))
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── MicroProjectTab ──────────────────────────────────────────────────────────

function MicroProjectTab({ project, onDeleted, onCopied, onUpdated }: {
  project: MicroProject
  onDeleted: () => void
  onCopied: (newId: string) => void
  onUpdated: () => void
}) {
  const qc = useQueryClient()
  const [microTab, setMicroTab] = useState<'team' | 'expenses'>('team')

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Content — left info panel always visible */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <ProjectInfoPanel project={project} onSave={saveField} onUpdated={onUpdated} />
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
        />
      </div>
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

// ─── ProjectInfoPanel ─────────────────────────────────────────────────────────

function ProjectInfoPanel({ project, onSave, onUpdated }: {
  project: MicroProject
  onSave: (key: string, value: unknown) => void
  onUpdated: () => void
}) {
  const [editingStatus, setEditingStatus] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [newType, setNewType] = useState('efir')

  const TYPE_LABELS: Record<string, string> = {
    zastroyka: 'Застройка', efir: 'Эфир', deadline: 'Дедлайн', semka: 'Съёмка',
  }
  const TYPE_COLORS: Record<string, { bg: string; color: string }> = {
    zastroyka: { bg: '#fef3c7', color: '#92400e' },
    efir:      { bg: '#dbeafe', color: '#1d4ed8' },
    deadline:  { bg: '#fee2e2', color: '#991b1b' },
    semka:     { bg: '#d1fae5', color: '#065f46' },
  }

  const dateCols = useMemo(() => {
    const entries: { date: string; type: string; isMain: boolean }[] = []
    if (project.date) {
      const mainDay = project.days.find((d) => toIsoDate(d.date) === toIsoDate(project.date!))
      entries.push({ date: toIsoDate(project.date), type: mainDay?.type ?? 'efir', isMain: true })
    }
    project.days.forEach((d) => {
      const iso = toIsoDate(d.date)
      if (!entries.some((e) => e.date === iso)) {
        entries.push({ date: iso, type: d.type, isMain: false })
      }
    })
    return entries.sort((a, b) => a.date.localeCompare(b.date))
  }, [project.date, project.days])

  const addDate = useMutation({
    mutationFn: () => {
      const iso = toIsoDate(new Date(newDate).toISOString())
      const existingDays = project.days.map((d) => ({ id: d.id, date: d.date, type: d.type, startTime: d.startTime }))
      if (existingDays.some((d) => toIsoDate(d.date) === iso)) return Promise.resolve(null)
      return api.patch(`/status-rows/${project.id}`, {
        days: [...existingDays, { date: new Date(newDate).toISOString(), type: newType, startTime: null }],
      }).then((r) => r.data)
    },
    onSuccess: () => { onUpdated(); setShowAddForm(false); setNewDate('') },
  })

  const removeDate = useMutation({
    mutationFn: (date: string) => {
      const remaining = project.days
        .filter((d) => toIsoDate(d.date) !== date)
        .map((d) => ({ id: d.id, date: d.date, type: d.type, startTime: d.startTime }))
      return api.patch(`/status-rows/${project.id}`, { days: remaining }).then((r) => r.data)
    },
    onSuccess: onUpdated,
  })

  const inputS: React.CSSProperties = {
    width: '100%', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 8px',
    fontSize: 12, color: '#1e293b', fontFamily: 'inherit', outline: 'none',
    background: '#fff', boxSizing: 'border-box',
  }

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

      {/* Block 2: Date manager */}
      <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px 8px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Даты и время</span>
          <button onClick={() => setShowAddForm((v) => !v)}
            style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, border: '1px solid #3b82f6', background: '#eff6ff', color: '#2563eb', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            + Дата
          </button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {dateCols.map((entry) => {
            const tColor = TYPE_COLORS[entry.type] ?? { bg: '#f3e8ff', color: '#7e22ce' }
            return (
              <div key={entry.date} style={{ padding: '7px 12px', borderBottom: '1px solid #f8fafc', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>{fmtDateShort(entry.date)}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: tColor.bg, color: tColor.color }}>
                      {TYPE_LABELS[entry.type] ?? entry.type}
                    </span>
                  </div>
                  {entry.isMain && <span style={{ fontSize: 10, color: '#94a3b8' }}>основная</span>}
                </div>
                {!entry.isMain && (
                  <button onClick={() => removeDate.mutate(entry.date)}
                    style={{ flexShrink: 0, background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: '1px 3px' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#cbd5e1')}>
                    ×
                  </button>
                )}
              </div>
            )
          })}
          {dateCols.length === 0 && (
            <div style={{ padding: 12, fontSize: 12, color: '#cbd5e1', textAlign: 'center' }}>Нет дат</div>
          )}
        </div>

        {showAddForm && (
          <div style={{ padding: '10px 12px', borderTop: '2px solid #e2e8f0', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 2 }}>Дата</label>
              <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} style={inputS} />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 2 }}>Тип</label>
              <select value={newType} onChange={(e) => setNewType(e.target.value)} style={inputS}>
                <option value="zastroyka">Застройка</option>
                <option value="efir">Эфир</option>
                <option value="deadline">Дедлайн</option>
                <option value="semka">Съёмка</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => { if (newDate) addDate.mutate() }} disabled={!newDate || addDate.isPending}
                style={{ flex: 1, fontSize: 12, padding: '6px', borderRadius: 6, border: '1px solid #2563eb', background: '#2563eb', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                {addDate.isPending ? '...' : 'Добавить'}
              </button>
              <button onClick={() => { setShowAddForm(false); setNewDate('') }}
                style={{ flex: 1, fontSize: 12, padding: '6px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: 'pointer' }}>
                Отмена
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


// ─── TeamTable ────────────────────────────────────────────────────────────────

function TeamTable({ project, members, loading, onUpdated, microTab, setMicroTab, onCopy, onDelete, copyPending, deletePending }: {
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
}) {
  const qc = useQueryClient()
  const [addingMember, setAddingMember] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPos, setNewPos] = useState('')
  const [newEmpType, setNewEmpType] = useState('')
  const [newRatePlan, setNewRatePlan] = useState('')
  const [newRateFact, setNewRateFact] = useState('')

  // Date columns derived from project — managed via left panel date manager
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

  const addMember = useMutation({
    mutationFn: () => api.post('/project-members', {
      projectId: project.id,
      name: newName.trim(),
      position: newPos.trim() || null,
      employmentType: newEmpType || null,
      ratePlan: newRatePlan ? parseFloat(newRatePlan) : null,
      rateFact: newRateFact ? parseFloat(newRateFact) : null,
    }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-members', project.id] })
      qc.invalidateQueries({ queryKey: ['micro-projects', project.matrixRegistryId] })
      setNewName(''); setNewPos(''); setNewEmpType(''); setNewRatePlan(''); setNewRateFact(''); setAddingMember(false)
    },
  })

  const updateMember = useMutation({
    mutationFn: ({ id, ...data }: { id: string; employmentType?: string | null; ratePlan?: number | null; rateFact?: number | null }) =>
      api.patch(`/project-members/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-members', project.id] }),
  })

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
          {microTab === 'team' && !addingMember && (
            <button onClick={() => setAddingMember(true)}
              style={{ fontSize: 12, padding: '4px 12px', borderRadius: 6, border: '1px solid #2563eb', background: '#eff6ff', color: '#2563eb', cursor: 'pointer', fontFamily: 'inherit' }}>
              + Добавить
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading && <div style={{ padding: 20, color: '#94a3b8', fontSize: 13 }}>Загрузка...</div>}

        {!loading && microTab === 'team' && (
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ padding: '8px 14px', fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'left', borderBottom: '2px solid #e2e8f0', minWidth: 150, textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>ФИО</th>
                <th style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'left', borderBottom: '2px solid #e2e8f0', minWidth: 80, textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>Формат</th>
                <th style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'left', borderBottom: '2px solid #e2e8f0', minWidth: 120, textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>Должность</th>
                <th style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'right', borderBottom: '2px solid #e2e8f0', minWidth: 80, textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>Цена план</th>
                <th style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'right', borderBottom: '2px solid #e2e8f0', minWidth: 80, textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>Цена факт</th>
                <th style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'right', borderBottom: '2px solid #e2e8f0', minWidth: 80, textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>Сумма план</th>
                <th style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'right', borderBottom: '2px solid #e2e8f0', borderRight: '2px solid #cbd5e1', minWidth: 80, textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>Сумма факт</th>
                {dateCols.map((d) => {
                  const type = dateTypeMap[d] ?? 'efir'
                  const tColor = TYPE_COLORS[type] ?? { bg: '#f3e8ff', color: '#7e22ce' }
                  return (
                    <th key={d} style={{ padding: '6px 10px', borderBottom: '2px solid #e2e8f0', minWidth: 84, textAlign: 'center', verticalAlign: 'bottom', fontSize: 11, fontWeight: 700, color: '#64748b' }}>
                      {fmtDateShort(d)}
                      <div style={{ marginTop: 2, fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: tColor.bg, color: tColor.color, display: 'inline-block' }}>
                        {TYPE_LABELS[type] ?? type}
                      </div>
                    </th>
                  )
                })}
                <th style={{ width: '100%', borderBottom: '2px solid #e2e8f0' }} />
                <th style={{ padding: '8px 6px', borderBottom: '2px solid #e2e8f0', width: 30 }} />
              </tr>
            </thead>
            <tbody>
              {members.map((m, ri) => {
                const sumPlan = calcSum(m.rate_plan, m.shifts, dateCols)
                const sumFact = calcSum(m.rate_fact, m.shifts, dateCols)
                return (
                  <tr key={m.id} style={{ background: ri % 2 === 0 ? '#fff' : '#f8fafc' }}>
                    <td style={{ padding: '8px 14px', fontWeight: 600, color: '#1e293b', borderBottom: '1px solid #eef0f4', whiteSpace: 'nowrap' }}>{m.name}</td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #eef0f4' }}>
                      <EmpBadge type={m.employment_type} />
                    </td>
                    <td style={{ padding: '8px 10px', color: '#64748b', borderBottom: '1px solid #eef0f4', whiteSpace: 'nowrap' }}>{m.position ?? <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #eef0f4', textAlign: 'right' }}>
                      <RateCell memberId={m.id} field="ratePlan" value={m.rate_plan} onSave={(v) => updateMember.mutate({ id: m.id, ratePlan: v })} />
                    </td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #eef0f4', textAlign: 'right' }}>
                      <RateCell memberId={m.id} field="rateFact" value={m.rate_fact} onSave={(v) => updateMember.mutate({ id: m.id, rateFact: v })} />
                    </td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #eef0f4', textAlign: 'right', color: '#1e293b', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                      {sumPlan}{m.rate_plan ? ' ₽' : ''}
                    </td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #eef0f4', textAlign: 'right', color: '#1e293b', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                      {sumFact}{m.rate_fact ? ' ₽' : ''}
                    </td>
                    {dateCols.map((d) => {
                      const v = normalise(m.shifts[d])
                      const confirmed: ShiftConfirmed = v?.confirmed ?? (v ? 'yes' : null)
                      return (
                        <td key={d} style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '1px solid #eef0f4', borderLeft: '1px solid #f1f5f9' }}>
                          <button onClick={() => toggleCell(m, d)}
                            title={confirmed === 'yes' ? 'Подтверждён (нажмите → не подтверждён)' : confirmed === 'pending' ? 'Не подтверждён (нажмите → убрать)' : 'Нет (нажмите → добавить)'}
                            style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid', borderColor: confirmed === 'yes' ? '#22c55e' : confirmed === 'pending' ? '#f59e0b' : '#e2e8f0', background: confirmedColor(confirmed), cursor: 'pointer', display: 'inline-block', transition: 'background 0.15s' }}
                          />
                        </td>
                      )
                    })}
                    <td style={{ borderBottom: '1px solid #eef0f4' }} />
                    <td style={{ padding: '8px 6px', borderBottom: '1px solid #eef0f4', textAlign: 'center' }}>
                      <button onClick={() => removeMember.mutate(m.id)}
                        style={{ fontSize: 14, color: '#cbd5e1', border: 'none', background: 'none', cursor: 'pointer', lineHeight: 1 }} title="Удалить">×</button>
                    </td>
                  </tr>
                )
              })}

              {addingMember && (
                <tr style={{ background: '#eff6ff' }}>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid #eef0f4' }}>
                    <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
                      placeholder="ФИО *" style={{ ...inputS, width: '100%' }} />
                  </td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #eef0f4' }}>
                    <select value={newEmpType} onChange={(e) => setNewEmpType(e.target.value)} style={{ ...inputS, width: '100%' }}>
                      <option value="">—</option>
                      {Object.entries(EMP_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #eef0f4' }}>
                    <input value={newPos} onChange={(e) => setNewPos(e.target.value)}
                      placeholder="Должность" style={{ ...inputS, width: '100%' }} />
                  </td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #eef0f4' }}>
                    <input type="number" value={newRatePlan} onChange={(e) => setNewRatePlan(e.target.value)}
                      placeholder="0" style={{ ...inputS, width: '100%' }} />
                  </td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #eef0f4' }}>
                    <input type="number" value={newRateFact} onChange={(e) => setNewRateFact(e.target.value)}
                      placeholder="0" style={{ ...inputS, width: '100%' }} />
                  </td>
                  <td style={{ borderBottom: '1px solid #eef0f4' }} />
                  <td style={{ borderBottom: '1px solid #eef0f4' }} />
                  {dateCols.map((d) => <td key={d} style={{ borderBottom: '1px solid #eef0f4', borderLeft: '1px solid #f1f5f9' }} />)}
                  <td style={{ borderBottom: '1px solid #eef0f4' }} />
                  <td style={{ padding: '6px', borderBottom: '1px solid #eef0f4' }}>
                    <div style={{ display: 'flex', gap: 3 }}>
                      <button onClick={() => { if (newName.trim()) addMember.mutate() }} disabled={!newName.trim() || addMember.isPending}
                        style={{ fontSize: 11, padding: '3px 7px', borderRadius: 5, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}>
                        {addMember.isPending ? '...' : 'OK'}
                      </button>
                      <button onClick={() => { setAddingMember(false); setNewName(''); setNewPos(''); setNewEmpType(''); setNewRatePlan(''); setNewRateFact('') }}
                        style={{ fontSize: 11, padding: '3px 5px', borderRadius: 5, border: '1px solid #e2e8f0', background: 'none', cursor: 'pointer', color: '#64748b' }}>×</button>
                    </div>
                  </td>
                </tr>
              )}
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
  const [adding, setAdding] = useState(false)
  const [newType, setNewType] = useState('')
  const [newBy, setNewBy] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newNotes, setNewNotes] = useState('')

  const { data: expenses = [], isLoading } = useQuery<ShiftExpense[]>({
    queryKey: ['shift-expenses', projectId],
    queryFn: () => api.get(`/shift-expenses?projectId=${projectId}`).then((r) => r.data),
    staleTime: 30_000,
  })

  const addExpense = useMutation({
    mutationFn: () => api.post('/shift-expenses', {
      projectId,
      expenseType: newType.trim(),
      orderedBy: newBy.trim() || null,
      amount: newAmount ? parseFloat(newAmount) : null,
      notes: newNotes.trim() || null,
    }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shift-expenses', projectId] })
      setAdding(false); setNewType(''); setNewBy(''); setNewAmount(''); setNewNotes('')
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
  const thS: React.CSSProperties = { padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'left', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.03em', background: '#f8fafc' }
  const tdS: React.CSSProperties = { padding: '8px 12px', fontSize: 13, borderBottom: '1px solid #f1f5f9' }

  const EditableCell = ({ expense, field, type = 'text' }: { expense: ShiftExpense; field: keyof ShiftExpense; type?: string }) => {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(String(expense[field] ?? ''))
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

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {isLoading && <div style={{ padding: 20, color: '#94a3b8', fontSize: 13 }}>Загрузка...</div>}
        {!isLoading && (
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ ...thS, width: '30%' }}>Тип расхода</th>
                <th style={{ ...thS, width: '25%' }}>Кто заказал</th>
                <th style={{ ...thS, width: '15%' }}>Сумма, ₽</th>
                <th style={{ ...thS, flex: 1 }}>Примечание</th>
                <th style={{ ...thS, width: 36 }} />
              </tr>
            </thead>
            <tbody>
              {expenses.map((e, ri) => (
                <tr key={e.id} style={{ background: ri % 2 === 0 ? '#fff' : '#f8fafc' }}>
                  <td style={tdS}><EditableCell expense={e} field="expense_type" /></td>
                  <td style={tdS}><EditableCell expense={e} field="ordered_by" /></td>
                  <td style={tdS}><EditableCell expense={e} field="amount" type="number" /></td>
                  <td style={tdS}><EditableCell expense={e} field="notes" /></td>
                  <td style={{ ...tdS, textAlign: 'center' }}>
                    <button onClick={() => deleteExpense.mutate(e.id)}
                      style={{ fontSize: 14, color: '#cbd5e1', border: 'none', background: 'none', cursor: 'pointer' }}>×</button>
                  </td>
                </tr>
              ))}

              {adding && (
                <tr style={{ background: '#eff6ff' }}>
                  <td style={tdS}><input autoFocus value={newType} onChange={(e) => setNewType(e.target.value)} placeholder="Тип расхода" style={{ ...inputS, width: '100%' }} /></td>
                  <td style={tdS}><input value={newBy} onChange={(e) => setNewBy(e.target.value)} placeholder="Кто заказал" style={{ ...inputS, width: '100%' }} /></td>
                  <td style={tdS}><input type="number" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} placeholder="0" style={{ ...inputS, width: '100%' }} /></td>
                  <td style={tdS}><input value={newNotes} onChange={(e) => setNewNotes(e.target.value)} placeholder="Примечание" style={{ ...inputS, width: '100%' }} /></td>
                  <td style={{ ...tdS, textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 3 }}>
                      <button onClick={() => { if (newType.trim() || newAmount) addExpense.mutate() }}
                        style={{ fontSize: 11, padding: '3px 7px', borderRadius: 5, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}>OK</button>
                      <button onClick={() => setAdding(false)}
                        style={{ fontSize: 11, padding: '3px 5px', borderRadius: 5, border: '1px solid #e2e8f0', background: 'none', cursor: 'pointer', color: '#64748b' }}>×</button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
            {expenses.length > 0 && (
              <tfoot>
                <tr style={{ background: '#f1f5f9' }}>
                  <td colSpan={2} style={{ ...tdS, fontWeight: 700, color: '#475569' }}>Итого:</td>
                  <td style={{ ...tdS, fontWeight: 700, color: '#1e293b' }}>{total.toLocaleString('ru-RU')} ₽</td>
                  <td colSpan={2} style={tdS} />
                </tr>
              </tfoot>
            )}
          </table>
        )}
        {!isLoading && expenses.length === 0 && !adding && (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Расходов нет</div>
        )}
      </div>
      <div style={{ padding: '8px 14px', borderTop: '1px solid #f1f5f9', flexShrink: 0, background: '#fafafa' }}>
        {!adding && (
          <button onClick={() => setAdding(true)}
            style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: '1px dashed #cbd5e1', background: 'none', color: '#64748b', cursor: 'pointer' }}>
            + Добавить расход
          </button>
        )}
      </div>
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
