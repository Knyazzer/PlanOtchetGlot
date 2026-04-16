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

  const summary = useMemo(() => {
    const map = new Map<string, Map<string, string[]>>()
    memberQueries.forEach((q, idx) => {
      const members: ProjectMember[] = q.data ?? []
      const proj = projects[idx]
      members.forEach((m) => {
        Object.entries(m.shifts).forEach(([rawDate, rawVal]) => {
          const v = normalise(rawVal)
          if (!v || v.confirmed === null) return
          const date = toIsoDate(rawDate)
          if (!map.has(date)) map.set(date, new Map())
          const names = map.get(date)!
          if (!names.has(m.name)) names.set(m.name, [])
          names.get(m.name)!.push(proj?.name || '?')
        })
      })
    })
    return { dates: [...map.keys()].sort(), map }
  }, [memberQueries, projects])

  const allNames = useMemo(() => {
    const set = new Set<string>()
    memberQueries.forEach((q) => (q.data ?? []).forEach((m: ProjectMember) => set.add(m.name)))
    return [...set].sort()
  }, [memberQueries])

  if (!allLoaded) return <div style={{ padding: 24, color: '#94a3b8', fontSize: 14 }}>Загрузка...</div>
  if (allNames.length === 0) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Нет участников.</div>

  const thS: React.CSSProperties = { padding: '7px 12px', fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'left', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1, textTransform: 'uppercase', letterSpacing: '0.03em' }
  const tdS: React.CSSProperties = { padding: '7px 12px', fontSize: 13, borderBottom: '1px solid #f1f5f9' }

  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...thS, minWidth: 180 }}>ФИО</th>
            {summary.dates.map((d) => (
              <th key={d} style={{ ...thS, textAlign: 'center', minWidth: 72 }}>{fmtDateShort(d)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allNames.map((name, ri) => (
            <tr key={name} style={{ background: ri % 2 === 0 ? '#fff' : '#f8fafc' }}>
              <td style={{ ...tdS, fontWeight: 500, color: '#1e293b' }}>{name}</td>
              {summary.dates.map((d) => {
                const projs = summary.map.get(d)?.get(name) ?? []
                const conflict = projs.length > 1
                return (
                  <td key={d} style={{ ...tdS, textAlign: 'center' }}>
                    {projs.length > 0 && (
                      <span title={projs.join(', ')} style={{
                        display: 'inline-block', width: 22, height: 22, borderRadius: 5,
                        background: conflict ? '#fef08a' : '#bbf7d0',
                        border: conflict ? '1px solid #ca8a04' : '1px solid #22c55e',
                      }} />
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
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

  // Editable fields state — initialised from project, updated optimistically
  const [editName, setEditName] = useState(project.name)
  const [nameEditing, setNameEditing] = useState(false)

  const updateProject = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.patch(`/status-rows/${project.id}`, data).then((r) => r.data),
    onSuccess: onUpdated,
  })

  const saveField = (key: string, value: unknown) => {
    updateProject.mutate({ [key]: value })
  }

  const saveName = () => {
    const trimmed = editName.trim()
    if (trimmed && trimmed !== project.name) saveField('name', trimmed)
    setNameEditing(false)
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

  const microTabBtn = (t: 'team' | 'expenses'): React.CSSProperties => ({
    padding: '5px 14px', fontSize: 12, border: 'none', cursor: 'pointer', background: 'none',
    borderBottom: microTab === t ? '2px solid #3b82f6' : '2px solid transparent',
    color: microTab === t ? '#3b82f6' : '#64748b', fontWeight: microTab === t ? 600 : 400,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '8px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, background: '#fafafa', flexWrap: 'wrap' }}>
        {nameEditing ? (
          <input
            autoFocus
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setEditName(project.name); setNameEditing(false) } }}
            style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', border: '1px solid #3b82f6', borderRadius: 5, padding: '3px 8px', flex: 1, minWidth: 180, outline: 'none' }}
          />
        ) : (
          <span
            onClick={() => setNameEditing(true)}
            title="Нажмите, чтобы переименовать"
            style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', cursor: 'text', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderBottom: '1px dashed #cbd5e1', paddingBottom: 1 }}
          >
            {project.name || '(без названия)'}
          </span>
        )}
        {project.date && (
          <span style={{ fontSize: 12, color: '#64748b', flexShrink: 0 }}>{fmtDateFull(project.date)}</span>
        )}
        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: STATUS_COLORS[project.status] + '22', color: STATUS_COLORS[project.status], fontWeight: 600, flexShrink: 0 }}>
          {STATUS_LABELS[project.status] ?? project.status}
        </span>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexShrink: 0 }}>
          <button onClick={() => { if (!copyProject.isPending) copyProject.mutate() }} disabled={copyProject.isPending}
            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'none', color: '#475569', cursor: 'pointer' }}>
            {copyProject.isPending ? '...' : 'Копировать'}
          </button>
          <button onClick={() => { if (confirm(`Удалить «${project.name}»?`)) deleteProject.mutate() }} disabled={deleteProject.isPending}
            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #fecaca', background: 'none', color: '#ef4444', cursor: 'pointer' }}>
            {deleteProject.isPending ? '...' : 'Удалить'}
          </button>
        </div>
      </div>

      {/* Micro-tabs: Команда | Расходы */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', flexShrink: 0, paddingLeft: 4 }}>
        <button style={microTabBtn('team')} onClick={() => setMicroTab('team')}>Команда</button>
        <button style={microTabBtn('expenses')} onClick={() => setMicroTab('expenses')}>Расходы</button>
      </div>

      {/* Content */}
      {microTab === 'team' && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <ProjectInfoPanel project={project} onSave={saveField} />
          <TeamTable project={project} members={members} loading={membersLoading} onUpdated={onUpdated} />
        </div>
      )}
      {microTab === 'expenses' && (
        <ExpensesTab projectId={project.id} />
      )}
    </div>
  )
}

// ─── ProjectInfoPanel ─────────────────────────────────────────────────────────

function ProjectInfoPanel({ project, onSave }: {
  project: MicroProject
  onSave: (key: string, value: unknown) => void
}) {
  const Row = ({ label, fieldKey, value, type = 'text' }: {
    label: string; fieldKey: string; value: string | null; type?: string
  }) => {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(value ?? '')

    const commit = () => {
      const trimmed = type === 'date'
        ? (draft ? new Date(draft).toISOString() : null)
        : (draft.trim() || null)
      if (trimmed !== value) onSave(fieldKey, trimmed)
      setEditing(false)
    }

    const displayVal = type === 'date' ? fmtDateFull(value) : (value || '—')

    return (
      <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>{label}</div>
        {editing ? (
          <input
            autoFocus
            type={type}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false) } }}
            style={{ fontSize: 12, padding: '3px 7px', border: '1px solid #3b82f6', borderRadius: 5, width: '100%', boxSizing: 'border-box', outline: 'none', color: '#1e293b' }}
          />
        ) : (
          <div
            onClick={() => { setDraft(type === 'date' ? isoToInput(value) : (value ?? '')); setEditing(true) }}
            title="Нажмите для редактирования"
            style={{ fontSize: 12, color: value ? '#1e293b' : '#cbd5e1', cursor: 'text', minHeight: 18, borderBottom: '1px dashed transparent' }}
            onMouseEnter={(e) => (e.currentTarget.style.borderBottomColor = '#cbd5e1')}
            onMouseLeave={(e) => (e.currentTarget.style.borderBottomColor = 'transparent')}
          >
            {displayVal}
          </div>
        )}
      </div>
    )
  }

  const StatusRow = () => {
    const [open, setOpen] = useState(false)
    return (
      <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>A Статус</div>
        <div style={{ position: 'relative' }}>
          <div
            onClick={() => setOpen((v) => !v)}
            style={{ fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[project.status] ?? '#94a3b8', flexShrink: 0 }} />
            <span style={{ color: STATUS_COLORS[project.status] ?? '#475569', fontWeight: 500 }}>{STATUS_LABELS[project.status] ?? project.status}</span>
          </div>
          {open && (
            <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 10, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, boxShadow: '0 4px 14px rgba(0,0,0,0.1)', minWidth: 150, overflow: 'hidden' }}>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <div
                  key={k}
                  onClick={() => { onSave('status', k); setOpen(false) }}
                  style={{ padding: '6px 12px', fontSize: 12, cursor: 'pointer', color: STATUS_COLORS[k] ?? '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                >
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLORS[k], display: 'inline-block' }} />
                  {v}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ width: 210, flexShrink: 0, borderRight: '1px solid #e2e8f0', overflowY: 'auto', padding: '12px 14px', background: '#fafafa' }}>
      <StatusRow />
      <Row label="B Клиент"     fieldKey="client"         value={project.client} />
      <Row label="C Название"   fieldKey="name"            value={project.name} />
      <Row label="D Исп.прод."  fieldKey="execProducer"    value={project.execProducer} />
      <Row label="E Лайн-прод." fieldKey="lineProducer"    value={project.lineProducer} />
      <Row label="F Аккаунт"    fieldKey="accountManager"  value={project.accountManager} />
      <Row label="G Дата"       fieldKey="date"            value={project.date} type="date" />
      <Row label="H Время"      fieldKey="time"            value={project.time} />
      <Row label="I Формат"     fieldKey="format"          value={project.format} />
      <Row label="J Локация"    fieldKey="location"        value={project.location} />
    </div>
  )
}

// ─── TeamTable ────────────────────────────────────────────────────────────────

function TeamTable({ project, members, loading, onUpdated }: {
  project: MicroProject
  members: ProjectMember[]
  loading: boolean
  onUpdated: () => void
}) {
  const qc = useQueryClient()
  const [addingMember, setAddingMember] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPos, setNewPos] = useState('')
  const [addingDate, setAddingDate] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [editingDateCol, setEditingDateCol] = useState<string | null>(null) // dateString being edited
  const [editingDateVal, setEditingDateVal] = useState('')

  // Date columns: main date + ProjectDay dates, deduplicated + sorted
  const dateCols = useMemo(() => {
    const set = new Set<string>()
    if (project.date) set.add(toIsoDate(project.date))
    project.days.forEach((d) => set.add(toIsoDate(d.date)))
    return [...set].sort()
  }, [project.date, project.days])

  const addMember = useMutation({
    mutationFn: () => api.post('/project-members', { projectId: project.id, name: newName.trim(), position: newPos.trim() || null }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-members', project.id] })
      qc.invalidateQueries({ queryKey: ['micro-projects', project.matrixRegistryId] })
      setNewName(''); setNewPos(''); setAddingMember(false)
    },
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

  const addDateCol = useMutation({
    mutationFn: (date: string) => {
      const existingDays = project.days.map((d) => ({ id: d.id, date: d.date, type: d.type, startTime: d.startTime }))
      if (existingDays.some((d) => toIsoDate(d.date) === date)) return Promise.resolve(null)
      return api.patch(`/status-rows/${project.id}`, {
        days: [...existingDays, { date: new Date(date).toISOString(), type: 'efir', startTime: null }],
      }).then((r) => r.data)
    },
    onSuccess: () => { onUpdated(); setAddingDate(false); setNewDate('') },
  })

  // Edit existing date column header
  const editDateCol = useMutation({
    mutationFn: ({ oldDate, newDateStr }: { oldDate: string; newDateStr: string }) => {
      // Is it the main project date?
      if (project.date && toIsoDate(project.date) === oldDate) {
        return api.patch(`/status-rows/${project.id}`, { date: new Date(newDateStr).toISOString() }).then((r) => r.data)
      }
      // It's a ProjectDay
      const updatedDays = project.days.map((d) =>
        toIsoDate(d.date) === oldDate
          ? { id: d.id, date: new Date(newDateStr).toISOString(), type: d.type, startTime: d.startTime }
          : { id: d.id, date: d.date, type: d.type, startTime: d.startTime }
      )
      return api.patch(`/status-rows/${project.id}`, { days: updatedDays }).then((r) => r.data)
    },
    onSuccess: () => { onUpdated(); setEditingDateCol(null); setEditingDateVal('') },
  })

  const removeDateCol = useMutation({
    mutationFn: (date: string) => {
      const remaining = project.days
        .filter((d) => toIsoDate(d.date) !== date)
        .map((d) => ({ id: d.id, date: d.date, type: d.type, startTime: d.startTime }))
      return api.patch(`/status-rows/${project.id}`, { days: remaining }).then((r) => r.data)
    },
    onSuccess: onUpdated,
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

  const isMainDate = (d: string) => project.date ? toIsoDate(project.date) === d : false
  const isDay = (d: string) => project.days.some((pd) => toIsoDate(pd.date) === d)

  const inputS: React.CSSProperties = { fontSize: 12, padding: '3px 7px', border: '1px solid #e2e8f0', borderRadius: 5, color: '#1e293b', background: '#fff' }

  // Table header cell for a date column
  const DateHeader = ({ d }: { d: string }) => {
    const isEditing = editingDateCol === d

    if (isEditing) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <input
            type="date"
            autoFocus
            value={editingDateVal}
            onChange={(e) => setEditingDateVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && editingDateVal) editDateCol.mutate({ oldDate: d, newDateStr: editingDateVal })
              if (e.key === 'Escape') { setEditingDateCol(null); setEditingDateVal('') }
            }}
            onBlur={() => { if (editingDateVal) editDateCol.mutate({ oldDate: d, newDateStr: editingDateVal }); else { setEditingDateCol(null) } }}
            style={{ ...inputS, fontSize: 11, width: 110 }}
          />
        </div>
      )
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <span
          onClick={() => { setEditingDateCol(d); setEditingDateVal(d) }}
          title="Нажмите для изменения даты"
          style={{ cursor: 'pointer', borderBottom: '1px dashed #cbd5e1', paddingBottom: 1, fontSize: 11, color: '#475569', fontWeight: 600 }}
        >
          {fmtDateShort(d)}
        </span>
        {isDay(d) && !isMainDate(d) && (
          <button onClick={() => removeDateCol.mutate(d)} title="Удалить столбец"
            style={{ fontSize: 9, color: '#cbd5e1', border: 'none', background: 'none', cursor: 'pointer', lineHeight: 1, padding: 0 }}>
            ×
          </button>
        )}
        {isMainDate(d) && (
          <span style={{ fontSize: 9, color: '#94a3b8' }}>осн.</span>
        )}
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading && <div style={{ padding: 20, color: '#94a3b8', fontSize: 13 }}>Загрузка...</div>}

        {!loading && (
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ padding: '8px 14px', fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'left', borderBottom: '2px solid #e2e8f0', minWidth: 150, textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>ФИО</th>
                <th style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'left', borderBottom: '2px solid #e2e8f0', minWidth: 120, textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>Должность</th>
                {dateCols.map((d) => (
                  <th key={d} style={{ padding: '8px 10px', borderBottom: '2px solid #e2e8f0', minWidth: 80, textAlign: 'center', verticalAlign: 'bottom' }}>
                    <DateHeader d={d} />
                  </th>
                ))}
                {/* Add date col */}
                <th style={{ padding: '8px 10px', borderBottom: '2px solid #e2e8f0', minWidth: 70, textAlign: 'center', verticalAlign: 'bottom' }}>
                  {addingDate ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
                      <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)}
                        style={{ ...inputS, width: 110, fontSize: 11 }} autoFocus />
                      <div style={{ display: 'flex', gap: 3 }}>
                        <button onClick={() => { if (newDate) addDateCol.mutate(toIsoDate(new Date(newDate).toISOString())) }}
                          disabled={!newDate} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}>OK</button>
                        <button onClick={() => { setAddingDate(false); setNewDate('') }}
                          style={{ fontSize: 10, padding: '2px 5px', borderRadius: 4, border: '1px solid #e2e8f0', background: 'none', cursor: 'pointer', color: '#64748b' }}>×</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setAddingDate(true)} title="Добавить дату"
                      style={{ fontSize: 16, color: '#94a3b8', border: 'none', background: 'none', cursor: 'pointer' }}>+</button>
                  )}
                </th>
                <th style={{ padding: '8px 6px', borderBottom: '2px solid #e2e8f0', width: 30 }} />
              </tr>
            </thead>
            <tbody>
              {members.map((m, ri) => (
                <tr key={m.id} style={{ background: ri % 2 === 0 ? '#fff' : '#f8fafc' }}>
                  <td style={{ padding: '8px 14px', fontWeight: 600, color: '#1e293b', borderBottom: '1px solid #eef0f4', whiteSpace: 'nowrap' }}>{m.name}</td>
                  <td style={{ padding: '8px 10px', color: '#64748b', borderBottom: '1px solid #eef0f4', whiteSpace: 'nowrap' }}>{m.position ?? <span style={{ color: '#cbd5e1' }}>—</span>}</td>
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
              ))}

              {addingMember && (
                <tr style={{ background: '#eff6ff' }}>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid #eef0f4' }}>
                    <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
                      placeholder="ФИО *" style={{ ...inputS, width: '100%' }} />
                  </td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #eef0f4' }}>
                    <input value={newPos} onChange={(e) => setNewPos(e.target.value)}
                      placeholder="Должность" style={{ ...inputS, width: '100%' }} />
                  </td>
                  {dateCols.map((d) => <td key={d} style={{ borderBottom: '1px solid #eef0f4', borderLeft: '1px solid #f1f5f9' }} />)}
                  <td style={{ borderBottom: '1px solid #eef0f4' }} />
                  <td style={{ padding: '6px', borderBottom: '1px solid #eef0f4' }}>
                    <div style={{ display: 'flex', gap: 3 }}>
                      <button onClick={() => { if (newName.trim()) addMember.mutate() }} disabled={!newName.trim() || addMember.isPending}
                        style={{ fontSize: 11, padding: '3px 7px', borderRadius: 5, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}>
                        {addMember.isPending ? '...' : 'OK'}
                      </button>
                      <button onClick={() => { setAddingMember(false); setNewName(''); setNewPos('') }}
                        style={{ fontSize: 11, padding: '3px 5px', borderRadius: 5, border: '1px solid #e2e8f0', background: 'none', cursor: 'pointer', color: '#64748b' }}>×</button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer: add member + legend */}
      {!loading && (
        <div style={{ padding: '8px 14px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0, background: '#fafafa' }}>
          {!addingMember && (
            <button onClick={() => setAddingMember(true)}
              style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: '1px dashed #cbd5e1', background: 'none', color: '#64748b', cursor: 'pointer' }}>
              + Участник
            </button>
          )}
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
