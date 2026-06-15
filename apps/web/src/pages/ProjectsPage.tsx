import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { TrackFormModal } from './TracksPage'
import { ProjectCardPage } from './ProjectCardPage'
import { formatName } from '../lib/utils'
import { Hint } from '../components/Hint'

// ── Types ─────────────────────────────────────────────────────────────────────

type ProjectStatus  = 'draft' | 'active' | 'done' | 'cancelled'
type WorkItemStatus = 'request' | 'active' | 'done' | 'rejected' | 'cancelled'
type ExpenseCategory = 'equipment' | 'transport' | 'fees' | 'postproduction' | 'other'

interface Client   { id: string; name: string }
interface UserRef  { id: string; name: string }
interface DivisionRef { id: string; name: string; department: { id: string; name: string; color: string } }
interface WIDepartment { division: DivisionRef }

interface Project {
  id: string; title: string; status: ProjectStatus; brief?: string; kpLink?: string
  client?: Client; producer?: UserRef
  _count: { workItems: number }
  createdAt: string; updatedAt: string
}

interface WorkItem {
  id: string; title: string; description?: string; status: WorkItemStatus
  date?: string; format?: string; location?: string; budget?: string | null
  execProducer?: UserRef; lineProducer?: UserRef; accountManager?: UserRef
  departments: WIDepartment[]
  _count: { tracks: number; expenses: number }
  project?: { id: string; title: string; client?: Client }
  createdAt: string; updatedAt: string
}

interface TrackSummary {
  id: string; title: string; status: string; workItemId: string | null
  leader: UserRef
  tasks: { status: string }[]
  stages: { tasks: { status: string }[] }[]
}

interface WorkItemDetail extends WorkItem {
  project: { id: string; title: string }
  tracks: TrackSummary[]
  expenses: Expense[]
}

interface Expense {
  id: string; amount: string; category: ExpenseCategory; description: string; date?: string
  createdBy: UserRef; createdAt: string; updatedAt: string
}

interface Department { id: string; name: string; color: string; divisions: DivisionRef[] }

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: 'Черновик', active: 'Активный', done: 'Завершён', cancelled: 'Отменён',
}
const STATUS_COLOR: Record<ProjectStatus, string> = {
  draft: '#888', active: '#FF6B35', done: '#29BF12', cancelled: '#666',
}
const WI_STATUS_LABEL: Record<WorkItemStatus, string> = {
  request: 'Заявка', active: 'В работе', done: 'Сдан', rejected: 'Отклонён', cancelled: 'Отменён',
}
const WI_STATUS_COLOR: Record<WorkItemStatus, string> = {
  request: '#888', active: '#FF6B35', done: '#29BF12', rejected: '#E8194B', cancelled: '#666',
}
const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  equipment: 'Оборудование', transport: 'Транспорт', fees: 'Гонорары',
  postproduction: 'Постпродакшн', other: 'Прочее',
}

const FORMATS = ['ТВ', 'Радио', 'Телерадио', 'Продакшн', 'Дизайн', 'Оффлайн', 'Виртуальный', 'Менеджмент']
const LOCATIONS = ['Знаменка крыша', 'Знаменка чёрная', 'Знаменка камин', 'Романов', 'Выезд']

// ── Shared styles ─────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4, marginTop: 12,
}
const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '8px 10px',
  background: 'var(--bg)', border: '1px solid var(--border)',
  borderRadius: 8, color: 'var(--text-1)', fontSize: 13, fontFamily: 'Inter, sans-serif',
  outline: 'none',
}
const cancelBtnStyle: React.CSSProperties = {
  background: 'none', border: '1px solid var(--border)', borderRadius: 8,
  color: 'var(--text-2)', fontSize: 13, padding: '8px 18px', cursor: 'pointer',
  fontFamily: 'Inter, sans-serif',
}
const submitBtnStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg,#FF6B35,#E8194B)',
  border: 'none', borderRadius: 8, color: '#fff',
  fontSize: 13, fontWeight: 600, padding: '8px 20px', cursor: 'pointer',
  fontFamily: 'Inter, sans-serif',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function trackProgress(track: TrackSummary) {
  const allTasks = [
    ...track.tasks,
    ...track.stages.flatMap(s => s.tasks),
  ]
  if (allTasks.length === 0) return null
  const done = allTasks.filter(t => t.status === 'done').length
  return { done, total: allTasks.length, pct: Math.round((done / allTasks.length) * 100) }
}

function fmtMoney(v: string | null | undefined) {
  if (!v) return '—'
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(Number(v))
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProjectsSubPage = 'registry' | 'workflow'

// ── ProjectsPage ──────────────────────────────────────────────────────────────

export function ProjectsPage({ subPage, onSubPageChange: _onSubPageChange }: {
  subPage: ProjectsSubPage
  onSubPageChange: (p: ProjectsSubPage) => void
}) {
  const [openProjectId, setOpenProjectId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn:  () => api.get('/projects').then(r => r.data),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })

  const openProject = projects.find(p => p.id === openProjectId) ?? null

  // При смене подстраницы сбрасываем открытый проект
  const currentSubPage = openProjectId ? 'registry' : subPage

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Breadcrumb */}
      <div style={{
        padding: '0 20px', height: 36, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 6,
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface-1)',
        fontSize: 12, color: 'var(--text-muted)',
      }}>
        <span
          onClick={() => setOpenProjectId(null)}
          style={{ cursor: openProjectId ? 'pointer' : 'default', color: openProjectId ? 'var(--accent-s)' : 'var(--text-muted)', fontWeight: openProjectId ? 600 : 400 }}
        >
          {currentSubPage === 'workflow' ? 'Workflow' : 'Реестр проектов'}
        </span>
        {openProject && (
          <>
            <span style={{ opacity: 0.4 }}>›</span>
            <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>{openProject.title}</span>
          </>
        )}
        {!openProjectId && (
          <button onClick={() => setShowForm(true)} style={{
            marginLeft: 'auto',
            background: 'linear-gradient(135deg,#FF6B35,#E8194B)',
            border: 'none', borderRadius: 7, color: '#fff',
            fontSize: 11, fontWeight: 600, padding: '4px 12px', cursor: 'pointer',
            fontFamily: 'Inter, sans-serif',
          }}>+ Создать</button>
        )}
      </div>

      {/* Content */}
      {subPage === 'registry' && !openProjectId && (
        <ProjectsKanban
          projects={projects}
          isLoading={isLoading}
          onOpen={setOpenProjectId}
        />
      )}

      {subPage === 'registry' && openProjectId && openProject && (
        <ProjectCardPage project={openProject as any} onBack={() => setOpenProjectId(null)} />
      )}

      {subPage === 'workflow' && <WorkflowTab />}

      {showForm && <ProjectFormModal onClose={() => setShowForm(false)} />}
    </div>
  )
}

// ── ProjectsKanban ────────────────────────────────────────────────────────────

const KANBAN_COLS: { status: ProjectStatus; label: string }[] = [
  { status: 'draft',     label: 'Черновик'  },
  { status: 'active',    label: 'В работе'  },
  { status: 'done',      label: 'Завершён'  },
  { status: 'cancelled', label: 'Отменён'   },
]

function ProjectsKanban({ projects, isLoading, onOpen }: {
  projects: Project[]
  isLoading: boolean
  onOpen: (id: string) => void
}) {
  const qc = useQueryClient()

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ProjectStatus }) =>
      api.patch(`/projects/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })

  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<ProjectStatus | null>(null)

  function handleDragStart(e: React.DragEvent, id: string) {
    setDraggingId(id)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e: React.DragEvent, status: ProjectStatus) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setOverCol(status)
  }

  function handleDrop(e: React.DragEvent, status: ProjectStatus) {
    e.preventDefault()
    if (draggingId) {
      const proj = projects.find(p => p.id === draggingId)
      if (proj && proj.status !== status) updateStatus.mutate({ id: draggingId, status })
    }
    setDraggingId(null)
    setOverCol(null)
  }

  if (isLoading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
      Загрузка...
    </div>
  )

  return (
    <div style={{
      flex: 1, overflow: 'hidden',
      display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 1, background: 'var(--border)',
    }}>
      {KANBAN_COLS.map(col => {
        const colProjects = projects.filter(p => p.status === col.status)
        const isOver = overCol === col.status
        return (
          <div
            key={col.status}
            onDragOver={e => handleDragOver(e, col.status)}
            onDrop={e => handleDrop(e, col.status)}
            onDragLeave={() => setOverCol(null)}
            style={{
              background: isOver ? 'rgba(255,107,53,0.04)' : 'var(--bg)',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
              transition: 'background 0.1s',
            }}
          >
            {/* Column header */}
            <div style={{
              padding: '10px 14px 8px', flexShrink: 0,
              borderBottom: `2px solid ${STATUS_COLOR[col.status]}40`,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.06em', color: STATUS_COLOR[col.status],
              }}>{col.label}</span>
              <span style={{
                fontSize: 10, fontWeight: 600,
                background: `${STATUS_COLOR[col.status]}18`,
                color: STATUS_COLOR[col.status],
                padding: '1px 6px', borderRadius: 99,
              }}>{colProjects.length}</span>
            </div>

            {/* Cards */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 16px' }}>
              {colProjects.length === 0 && (
                <div style={{
                  margin: 8, padding: '20px 0', textAlign: 'center',
                  fontSize: 11, color: 'var(--text-muted)',
                  border: '1px dashed var(--border)', borderRadius: 8,
                }}>
                  Нет проектов
                </div>
              )}
              {colProjects.map(p => (
                <KanbanCard
                  key={p.id}
                  project={p}
                  dragging={draggingId === p.id}
                  onDragStart={e => handleDragStart(e, p.id)}
                  onDragEnd={() => { setDraggingId(null); setOverCol(null) }}
                  onOpen={() => onOpen(p.id)}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── KanbanCard ────────────────────────────────────────────────────────────────

function KanbanCard({ project: p, dragging, onDragStart, onDragEnd, onOpen }: {
  project: Project
  dragging: boolean
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onOpen: () => void
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{
        background: 'var(--surface-1)',
        border: `1px solid var(--border)`,
        borderRadius: 10, marginBottom: 6, padding: '10px 12px',
        cursor: 'grab', opacity: dragging ? 0.4 : 1,
        transition: 'opacity 0.1s, box-shadow 0.1s',
        boxShadow: dragging ? 'none' : '0 1px 4px rgba(0,0,0,0.25)',
      }}
    >
      {/* Eyebrow */}
      {p.client && (
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
          {p.client.name}
        </div>
      )}

      {/* Title — клик открывает карточку */}
      <div
        onClick={onOpen}
        style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.3, marginBottom: 6, cursor: 'pointer' }}
      >
        {p.title}
      </div>

      {/* Meta */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {p.producer && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.producer.name}</span>
        )}
        <span style={{
          marginLeft: 'auto', fontSize: 10, fontWeight: 600,
          background: 'var(--surface-3)', color: 'var(--text-muted)',
          padding: '1px 6px', borderRadius: 4,
        }}>{p._count.workItems} WI</span>
      </div>
    </div>
  )
}

// ── ProjectCard ───────────────────────────────────────────────────────────────

// ── ProjectDetail ─────────────────────────────────────────────────────────────

function ProjectDetail({ project, onBack }: { project: Project; onBack?: () => void }) {
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
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
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
            color: 'var(--text-2)', fontSize: 11, padding: '3px 9px', cursor: 'pointer',
            fontFamily: 'Inter, sans-serif',
          }}>+ Добавить</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 16px' }}>
          {workItems.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
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

function WorkItemCard({ item: wi, active, onClick, projectId }: {
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
      background: 'var(--surface-1)', border: `1px solid ${active ? 'rgba(255,107,53,0.3)' : 'var(--border)'}`,
      borderRadius: 10, marginBottom: 8, overflow: 'hidden',
    }}>
      {/* Row */}
      <div onClick={onClick} style={{
        padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
      }}>
        <span style={{
          fontSize: 10, fontWeight: 700, flexShrink: 0,
          color: WI_STATUS_COLOR[wi.status],
          background: `${WI_STATUS_COLOR[wi.status]}18`,
          borderRadius: 4, padding: '1px 5px', textTransform: 'uppercase', letterSpacing: '0.5px',
        }}>{WI_STATUS_LABEL[wi.status]}</span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-1)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {wi.title}
        </span>
        {wi.date && <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{wi.date}</span>}
        {wi._count.tracks > 0 && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, background: 'var(--surface-3)', padding: '1px 6px', borderRadius: 4 }}>
            {wi._count.tracks} т
          </span>
        )}
        <button
          onClick={e => { e.stopPropagation(); if (confirm(`Удалить «${wi.title}»?`)) deleteWI.mutate() }}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, padding: 2, flexShrink: 0 }}
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
                        fontSize: 11, padding: '3px 9px', borderRadius: 6, cursor: 'pointer',
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
                          background: track.status === 'done' ? '#29BF12' : track.status === 'archived' ? '#464658' : '#FF6B35',
                        }} />
                        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {track.title}
                        </span>
                        {prog && (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
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
                marginTop: 8, fontSize: 11, padding: '4px 10px',
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
                <span style={{ fontSize: 12, color: totalExpenses > budget ? '#E8194B' : '#29BF12' }}>
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
                    <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: 10 }}>
                      {EXPENSE_CATEGORY_LABEL[exp.category]}
                    </span>
                    <span style={{ flex: 1, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {exp.description || '—'}
                    </span>
                    {exp.date && <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: 11 }}>{exp.date}</span>}
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>
        {title}
      </div>
      {children}
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

function AddExpenseForm({ wiId: _wiId, onAdd, isPending }: {
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
        marginTop: 8, fontSize: 11, padding: '4px 10px',
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

// ── WorkflowTab ───────────────────────────────────────────────────────────────

function WorkflowTab() {
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')

  const { data: items = [], isLoading } = useQuery<WorkItem[]>({
    queryKey: ['workflow', statusFilter, search],
    queryFn: () => {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (search) params.set('search', search)
      return api.get(`/work-items?${params}`).then(r => r.data)
    },
    staleTime: 30_000,
  })

  const total = items.length
  const byStatus = Object.fromEntries(
    (Object.keys(WI_STATUS_LABEL) as WorkItemStatus[]).map(s => [s, items.filter(i => i.status === s).length])
  )

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div style={{
        padding: '10px 20px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap',
      }}>
        <input
          placeholder="Поиск по названию..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, width: 200, padding: '6px 10px', fontSize: 12 }}
        />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ ...inputStyle, width: 140, padding: '6px 8px', fontSize: 12 }}>
          <option value="">Все статусы</option>
          {(Object.entries(WI_STATUS_LABEL) as [WorkItemStatus, string][]).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>

        {/* Summary chips */}
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          {(Object.entries(WI_STATUS_LABEL) as [WorkItemStatus, string][]).map(([s, l]) =>
            byStatus[s] > 0 ? (
              <span key={s} style={{
                fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 5,
                background: `${WI_STATUS_COLOR[s]}18`, color: WI_STATUS_COLOR[s],
              }}>{l}: {byStatus[s]}</span>
            ) : null
          )}
          <span style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 8px' }}>
            Всего: {total}
          </span>
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 16px' }}>
        {isLoading && (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Загрузка...</div>
        )}
        {!isLoading && items.length === 0 && (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Нет work items
          </div>
        )}
        {items.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['Статус', 'Название', 'Проект', 'Дата', 'Треки', 'Бюджет'].map(h => (
                  <th key={h} style={{
                    padding: '8px 14px', textAlign: 'left',
                    borderBottom: '1px solid var(--border)',
                    fontWeight: 700, fontSize: 10, color: 'var(--text-muted)',
                    textTransform: 'uppercase', letterSpacing: '0.5px',
                    position: 'sticky', top: 0, background: 'var(--bg)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((wi, i) => (
                <tr key={wi.id} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      color: WI_STATUS_COLOR[wi.status], background: `${WI_STATUS_COLOR[wi.status]}18`,
                      borderRadius: 4, padding: '1px 6px', textTransform: 'uppercase', letterSpacing: '0.4px',
                    }}>{WI_STATUS_LABEL[wi.status]}</span>
                  </td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', fontWeight: 600, color: 'var(--text-1)' }}>
                    {wi.title}
                    {wi.execProducer && (
                      <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginTop: 1 }}>
                        {formatName(wi.execProducer.name)}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                    {wi.project?.title ?? '—'}
                    {wi.project?.client && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{wi.project.client.name}</div>
                    )}
                  </td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {wi.date ?? '—'}
                  </td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', textAlign: 'center' }}>
                    {wi._count.tracks > 0 ? wi._count.tracks : '—'}
                  </td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                    {fmtMoney(wi.budget)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── StatusChip ────────────────────────────────────────────────────────────────

function StatusChip({ status, onSelect }: { status: ProjectStatus; onSelect: (s: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <span
        onClick={() => setOpen(v => !v)}
        style={{
          fontSize: 11, fontWeight: 700, cursor: 'pointer',
          color: STATUS_COLOR[status], background: `${STATUS_COLOR[status]}18`,
          borderRadius: 5, padding: '2px 8px', textTransform: 'uppercase', letterSpacing: '0.5px',
        }}
      >{STATUS_LABEL[status]}</span>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 10,
          background: 'var(--surface-1)', border: '1px solid var(--border)',
          borderRadius: 8, padding: 4, minWidth: 130,
        }}>
          {(Object.entries(STATUS_LABEL) as [ProjectStatus, string][]).map(([v, l]) => (
            <div key={v} onClick={() => { onSelect(v); setOpen(false) }} style={{
              padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
              color: STATUS_COLOR[v], fontWeight: 600,
            }}>{l}</div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Tag ───────────────────────────────────────────────────────────────────────

function Tag({ label, value }: { label: string; value: string }) {
  return (
    <span style={{
      fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg)',
      border: '1px solid var(--border)', borderRadius: 5, padding: '2px 7px',
    }}>
      <span style={{ color: 'var(--text-3)', marginRight: 3 }}>{label}:</span>{value}
    </span>
  )
}

// ── ProjectFormModal ──────────────────────────────────────────────────────────

function ProjectFormModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [title, setTitle]   = useState('')
  const [clientId, setClientId] = useState('')
  const [brief, setBrief]   = useState('')
  const [kpLink, setKpLink] = useState('')

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ['clients'],
    queryFn:  () => api.get('/clients').then(r => r.data),
  })

  const create = useMutation({
    mutationFn: () => api.post('/projects', { title, clientId: clientId || undefined, brief: brief || undefined, kpLink: kpLink || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); onClose() },
  })

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface-1)', borderRadius: 14, padding: 28, width: 440,
        border: '1px solid var(--border)',
      }}>
        <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>Новый проект</h3>

        <label style={labelStyle}>Название <span style={{ color: '#E8194B' }}>*</span></label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Название проекта"
          style={inputStyle} autoFocus />

        <label style={{ ...labelStyle, display: 'flex', alignItems: 'center' }}>Клиент <Hint text="Клиент проекта. Если нужного нет в списке — добавьте через Персонал → Клиенты." /></label>
        <select value={clientId} onChange={e => setClientId(e.target.value)} style={inputStyle}>
          <option value="">— не выбрано —</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <label style={{ ...labelStyle, display: 'flex', alignItems: 'center' }}>Ссылка на КП <Hint text="Коммерческое предложение — ссылка на Google Docs, PDF или другой документ." /></label>
        <input value={kpLink} onChange={e => setKpLink(e.target.value)} placeholder="https://"
          style={inputStyle} />

        <label style={{ ...labelStyle, display: 'flex', alignItems: 'center' }}>Бриф <Hint text="Краткое описание: задача, цель, контекст." /></label>
        <textarea value={brief} onChange={e => setBrief(e.target.value)} placeholder="Краткое описание проекта"
          rows={3} style={{ ...inputStyle, resize: 'vertical' }} />

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} style={cancelBtnStyle}>Отмена</button>
          <button
            onClick={() => create.mutate()}
            disabled={!title.trim() || create.isPending}
            style={{ ...submitBtnStyle, opacity: title.trim() && !create.isPending ? 1 : 0.5 }}
          >{create.isPending ? 'Создание...' : 'Создать'}</button>
        </div>
      </div>
    </div>
  )
}

// ── WorkItemFormModal ─────────────────────────────────────────────────────────

function WorkItemFormModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [title, setTitle]   = useState('')
  const [date,  setDate]    = useState('')
  const [format, setFormat] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')

  const create = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/work-items`, {
      title, date: date || undefined, format: format || undefined,
      location: location || undefined, description: description || undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['work-items', projectId] }); onClose() },
  })

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface-1)', borderRadius: 14, padding: 28, width: 420,
        border: '1px solid var(--border)',
      }}>
        <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>Новый Work Item</h3>

        <label style={labelStyle}>Название <span style={{ color: '#E8194B' }}>*</span></label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Что нужно сделать"
          style={inputStyle} autoFocus />

        <label style={{ ...labelStyle, display: 'flex', alignItems: 'center' }}>Дата / период <Hint text="Дата или период съёмки, вводится в свободной форме." /></label>
        <input value={date} onChange={e => setDate(e.target.value)} placeholder="например: 15 июня" style={inputStyle} />

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ ...labelStyle, display: 'flex', alignItems: 'center' }}>Формат <Hint text="Производственный формат съёмки. Влияет на фильтры и отчёты по проектам." /></label>
            <select value={format} onChange={e => setFormat(e.target.value)} style={inputStyle}>
              <option value="">—</option>
              {FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ ...labelStyle, display: 'flex', alignItems: 'center' }}>Локация <Hint text="Место проведения съёмки из предустановленного списка площадок." /></label>
            <select value={location} onChange={e => setLocation(e.target.value)} style={inputStyle}>
              <option value="">—</option>
              {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>

        <label style={labelStyle}>Описание</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Детали задачи"
          rows={2} style={{ ...inputStyle, resize: 'vertical' }} />

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} style={cancelBtnStyle}>Отмена</button>
          <button
            onClick={() => create.mutate()}
            disabled={!title.trim() || create.isPending}
            style={{ ...submitBtnStyle, opacity: title.trim() && !create.isPending ? 1 : 0.5 }}
          >{create.isPending ? 'Создание...' : 'Добавить'}</button>
        </div>
      </div>
    </div>
  )
}

// ── miniSelectStyle ───────────────────────────────────────────────────────────

const miniSelectStyle: React.CSSProperties = {
  fontSize: 11, padding: '3px 6px', borderRadius: 6,
  border: '1px solid var(--border)', background: 'var(--bg)',
  color: 'var(--text-2)', fontFamily: 'Inter, sans-serif', cursor: 'pointer',
}
