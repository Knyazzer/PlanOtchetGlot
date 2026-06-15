import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
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
  createdAt: string
}

interface WorkItem {
  id: string; title: string; description?: string; status: WorkItemStatus
  date?: string; format?: string; location?: string; budget?: string | null
  execProducer?: UserRef; lineProducer?: UserRef; accountManager?: UserRef
  departments: WIDepartment[]
  _count: { tracks: number; expenses: number }
  createdAt: string
}

interface Expense {
  id: string; amount: string; category: ExpenseCategory; description: string; date?: string
  createdBy: UserRef
}

interface WorkItemDetail extends WorkItem {
  tracks: { id: string; title: string; status: string; tasks: { status: string }[]; stages: { tasks: { status: string }[] }[] }[]
  expenses: Expense[]
}

interface Department {
  id: string; name: string; color: string
  divisions: DivisionRef[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: 'Черновик', active: 'В работе', done: 'Завершён', cancelled: 'Отменён',
}
const STATUS_COLOR: Record<ProjectStatus, string> = {
  draft: '#8A8A9A', active: '#FF6B35', done: '#29BF12', cancelled: '#555',
}
const WI_STATUS_LABEL: Record<WorkItemStatus, string> = {
  request: 'Заявка', active: 'В работе', done: 'Сдан', rejected: 'Отклонён', cancelled: 'Отменён',
}
const WI_STATUS_COLOR: Record<WorkItemStatus, string> = {
  request: '#8A8A9A', active: '#FF6B35', done: '#29BF12', rejected: '#E8194B', cancelled: '#555',
}
const EXPENSE_LABEL: Record<ExpenseCategory, string> = {
  equipment: 'Оборудование', transport: 'Транспорт', fees: 'Гонорары',
  postproduction: 'Постпродакшн', other: 'Прочее',
}
const FORMATS = ['ТВ', 'Радио', 'Телерадио', 'Продакшн', 'Дизайн', 'Оффлайн', 'Виртуальный', 'Менеджмент']
const LOCATIONS = ['Знаменка крыша', 'Знаменка чёрная', 'Знаменка камин', 'Романов', 'Выезд']

type CardTab = 'info' | 'structure' | 'finance' | 'team' | 'roadmap'

function fmtMoney(v: string | null | undefined) {
  if (!v) return '—'
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(Number(v))
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '7px 10px',
  background: 'var(--bg)', border: '1px solid var(--border)',
  borderRadius: 7, color: 'var(--text-1)', fontSize: 12.5,
  fontFamily: 'Inter, sans-serif', outline: 'none',
}
const miniSelectStyle: React.CSSProperties = {
  ...inputStyle, width: 'auto', padding: '4px 8px', fontSize: 12,
}

// ── ProjectCardPage ───────────────────────────────────────────────────────────

export function ProjectCardPage({ project, onBack }: { project: Project; onBack: () => void }) {
  const [tab, setTab] = useState<CardTab>('info')
  const qc = useQueryClient()

  const updateProject = useMutation({
    mutationFn: (data: Partial<Project>) => api.patch(`/projects/${project.id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })

  const tabs: { id: CardTab; label: string }[] = [
    { id: 'info',      label: 'Инфо'           },
    { id: 'structure', label: 'Структура'       },
    { id: 'finance',   label: 'Финансы'         },
    { id: 'team',      label: 'Команда'         },
    { id: 'roadmap',   label: 'Дорожная карта'  },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--surface-1)' }}>

      {/* ── Header ── */}
      <div style={{
        background: 'var(--surface-2)',
        borderBottom: '1px solid rgba(255,255,255,0.13)',
        padding: '14px 24px 0',
        flexShrink: 0,
        position: 'relative',
      }}>
        {/* orange top line */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg,#FF6B35,#E8194B)' }} />

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          {/* Left: eyebrow + title + status */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
              <span style={{ color: '#FF6B35', fontFamily: 'monospace' }}>{project.id.slice(0, 8).toUpperCase()}</span>
              <span>·</span>
              <span>{project.client?.name ?? '—'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-1)', lineHeight: 1.2 }}>
                {project.title}
              </h1>
              <select
                value={project.status}
                onChange={e => updateProject.mutate({ status: e.target.value as ProjectStatus })}
                style={{
                  appearance: 'none', border: 'none', outline: 'none', cursor: 'pointer',
                  fontFamily: 'Inter, sans-serif', fontSize: 11.5, fontWeight: 700,
                  color: STATUS_COLOR[project.status],
                  background: `${STATUS_COLOR[project.status]}22`,
                  padding: '3px 10px', borderRadius: 99,
                }}
              >
                {(Object.entries(STATUS_LABEL) as [ProjectStatus, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Right: tabs */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  background: tab === t.id ? 'var(--bg)' : 'transparent',
                  border: `1px solid ${tab === t.id ? 'rgba(255,255,255,0.13)' : 'transparent'}`,
                  borderBottom: tab === t.id ? `1px solid var(--bg)` : 'none',
                  borderTop: tab === t.id ? '2px solid #FF6B35' : '2px solid transparent',
                  borderRadius: '6px 6px 0 0',
                  padding: '6px 14px 8px',
                  fontFamily: 'Inter, sans-serif',
                  fontSize: 12.5,
                  fontWeight: tab === t.id ? 700 : 500,
                  color: tab === t.id ? 'var(--text-1)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  marginBottom: -1,
                  whiteSpace: 'nowrap',
                  transition: 'color 0.1s',
                  zIndex: tab === t.id ? 1 : 0,
                  position: 'relative',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tab content ── */}
      {tab === 'info'      && <InfoTab      project={project} onBack={onBack} />}
      {tab === 'structure' && <StructureTab projectId={project.id} />}
      {tab === 'finance'   && <FinanceTab   projectId={project.id} />}
      {tab === 'team'      && <TeamTab      projectId={project.id} />}
      {tab === 'roadmap'   && <RoadmapTab   />}
    </div>
  )
}

// ── InfoTab ───────────────────────────────────────────────────────────────────

function InfoTab({ project, onBack: _onBack }: { project: Project; onBack: () => void }) {
  const qc = useQueryClient()
  const { data: workItems = [] } = useQuery<WorkItem[]>({
    queryKey: ['work-items', project.id],
    queryFn:  () => api.get(`/projects/${project.id}/work-items`).then(r => r.data),
  })

  const wiDone  = workItems.filter(w => w.status === 'done').length
  const tasksDone = 0 // нет прямого API — покажем WI прогресс
  const daysLeft = project.createdAt
    ? Math.max(0, 90 - Math.floor((Date.now() - new Date(project.createdAt).getTime()) / 86400000))
    : null

  const updateProject = useMutation({
    mutationFn: (data: Partial<Project>) => api.patch(`/projects/${project.id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

      {/* Sidebar */}
      <div style={{ width: 280, flexShrink: 0, borderRight: '1px solid var(--border)', overflowY: 'auto', background: 'var(--surface-1)' }}>
        <SidebarSection label="О проекте">
          <InfoRow label="Клиент"   value={project.client?.name ?? '—'} />
          <InfoRow label="Продюсер" value={project.producer?.name ?? '—'} />
          <InfoRow label="ID"       value={<span style={{ fontFamily: 'monospace', fontSize: 11 }}>{project.id.slice(0, 12)}</span>} />
          {project.kpLink && (
            <InfoRow label="КП" value={<a href={project.kpLink} target="_blank" rel="noreferrer" style={{ color: '#FF6B35', fontSize: 12 }}>Открыть ↗</a>} />
          )}
          <InfoRow label="Создан" value={new Date(project.createdAt).toLocaleDateString('ru-RU')} />
        </SidebarSection>

        {project.brief && (
          <SidebarSection label="Описание">
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.55 }}>{project.brief}</p>
          </SidebarSection>
        )}

        <SidebarSection label="Статус">
          <select
            value={project.status}
            onChange={e => updateProject.mutate({ status: e.target.value as ProjectStatus })}
            style={{ ...inputStyle, fontSize: 12 }}
          >
            {(Object.entries(STATUS_LABEL) as [ProjectStatus, string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </SidebarSection>
      </div>

      {/* Main */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* KPI cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          <KpiCard label="Work Items" value={`${wiDone} / ${workItems.length}`} color="#FF6B35" sub={workItems.length > 0 ? `${Math.round(wiDone/workItems.length*100)}%` : '0%'} />
          <KpiCard label="До дедлайна" value={daysLeft !== null ? String(daysLeft) : '—'} unit="дн." color="#F59E0B" sub="~90 дн. от создания" />
          <KpiCard label="Расходы"  value={fmtMoney(null)} color="var(--text-3)" sub="нет данных" />
          <KpiCard label="Задачи"   value={String(tasksDone)} color="#29BF12" sub="из треков" />
        </div>

        {/* Work items list */}
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>
            Work Items ({workItems.length})
          </div>
          {workItems.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>Нет work items</div>
          )}
          {workItems.map((wi, i) => (
            <div key={wi.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px',
              borderBottom: i < workItems.length - 1 ? '1px solid var(--border)' : 'none',
              background: i % 2 === 1 ? 'rgba(255,255,255,0.018)' : 'transparent',
            }}>
              <span style={{
                fontSize: 10, fontWeight: 700, flexShrink: 0,
                color: WI_STATUS_COLOR[wi.status], background: `${WI_STATUS_COLOR[wi.status]}18`,
                padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.04em',
              }}>{WI_STATUS_LABEL[wi.status]}</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wi.title}</span>
              {wi.date && <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{wi.date}</span>}
              {wi.execProducer && <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{formatName(wi.execProducer.name)}</span>}
              {wi._count.tracks > 0 && <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, background: 'var(--surface-3)', padding: '1px 6px', borderRadius: 4 }}>{wi._count.tracks} т</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── StructureTab ──────────────────────────────────────────────────────────────

function StructureTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const [selectedWIId, setSelectedWIId] = useState<string | null>(null)
  const [expandedWIId, setExpandedWIId] = useState<string | null>(null)
  const [selectedDivId, setSelectedDivId] = useState<string | null>(null)
  const [detailTab, setDetailTab] = useState<'team' | 'scheduler' | 'freelancers' | 'expenses'>('team')
  const [wiCollapsed, setWiCollapsed] = useState(false)
  const [deptsCollapsed, setDeptsCollapsed] = useState(false)
  const [showWIForm, setShowWIForm] = useState(false)

  const { data: workItems = [], isLoading } = useQuery<WorkItem[]>({
    queryKey: ['work-items', projectId],
    queryFn:  () => api.get(`/projects/${projectId}/work-items`).then(r => r.data),
  })

  const { data: structure = [] } = useQuery<Department[]>({
    queryKey: ['structure'],
    queryFn: () => api.get('/structure').then(r => r.data),
    staleTime: 5 * 60_000,
  })

  const activeWI = workItems.find(w => w.id === selectedWIId) ?? (workItems[0] ?? null)
  const activeWIId = activeWI?.id ?? null

  const { data: wiDetail } = useQuery<WorkItemDetail>({
    queryKey: ['wi-detail', activeWIId],
    queryFn: () => api.get(`/work-items/${activeWIId}`).then(r => r.data),
    enabled: !!activeWIId,
    staleTime: 30_000,
  })

  const updateWI = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.patch(`/work-items/${activeWIId}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work-items', projectId] })
      qc.invalidateQueries({ queryKey: ['wi-detail', activeWIId] })
    },
  })

  const deleteWI = useMutation({
    mutationFn: (id: string) => api.delete(`/work-items/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work-items', projectId] })
      setSelectedWIId(null)
    },
  })

  const setDepartments = useMutation({
    mutationFn: (divisionIds: string[]) => api.put(`/work-items/${activeWIId}/departments`, { divisionIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work-items', projectId] })
      qc.invalidateQueries({ queryKey: ['wi-detail', activeWIId] })
    },
  })

  // Divisions for the active WI, enriched with dept color
  const allDivisions = structure.flatMap(dept =>
    (dept.divisions ?? []).map(div => ({ ...div, deptName: dept.name, deptColor: dept.color }))
  )
  const wiDivisions = activeWI
    ? activeWI.departments.map(d => allDivisions.find(ad => ad.id === d.division.id)).filter(Boolean) as typeof allDivisions
    : []
  const activeDivision = wiDivisions.find(d => d.id === selectedDivId) ?? (wiDivisions[0] ?? null)

  // When WI changes, reset dept selection
  const handleSelectWI = (id: string) => {
    if (selectedWIId !== id) {
      setSelectedWIId(id)
      setSelectedDivId(null)
      setDetailTab('team')
    }
    setExpandedWIId(expandedWIId === id ? null : id)
  }

  // When dept changes, reset detail tab
  const handleSelectDiv = (id: string) => {
    setSelectedDivId(id)
    setDetailTab('team')
  }

  const collapseBtn = (collapsed: boolean, onToggle: () => void): React.CSSProperties => ({
    width: 24, height: 24, borderRadius: 5, flexShrink: 0,
    background: 'var(--surface-3)', border: '1px solid rgba(255,255,255,0.13)',
    color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.12s', transform: collapsed ? 'rotate(180deg)' : 'none',
    fontFamily: 'monospace',
  })

  const initials = (name: string) => name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  if (isLoading) return <LoadingState />

  // grid template columns
  const wiW = wiCollapsed ? 36 : 360
  const depW = deptsCollapsed ? 36 : 280
  const gridCols = `${wiW}px ${depW}px 1fr`

  return (
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: gridCols, overflow: 'hidden', transition: 'grid-template-columns 0.22s cubic-bezier(.4,0,.2,1)' }}>

      {/* ── Col 1: WI папки ── */}
      <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg)', borderRight: '1px solid var(--border)', overflow: 'hidden', minWidth: 0 }}>
        {/* header */}
        <div style={{ padding: wiCollapsed ? 0 : '0 12px', height: 40, display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)', flexShrink: 0, justifyContent: wiCollapsed ? 'center' : 'flex-start' }}>
          {!wiCollapsed && <>
            <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', flex: 1 }}>Work Items</span>
            <button onClick={() => setShowWIForm(true)} style={{ background: 'none', border: 'none', fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer', padding: '3px 8px', fontFamily: 'Inter, sans-serif', borderRadius: 5, transition: 'color 0.1s' }}>+ Добавить</button>
          </>}
          <button
            onClick={() => setWiCollapsed(c => !c)}
            style={collapseBtn(wiCollapsed, () => {})}
            title={wiCollapsed ? 'Развернуть' : 'Свернуть'}
          >‹</button>
        </div>

        {/* collapsed strip */}
        {wiCollapsed && (
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0', gap: 5 }}>
            {workItems.map((wi, i) => (
              <div
                key={wi.id}
                onClick={() => { setWiCollapsed(false); handleSelectWI(wi.id) }}
                title={wi.title}
                style={{
                  width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, fontWeight: 800, cursor: 'pointer', flexShrink: 0,
                  background: wi.id === activeWIId ? 'rgba(245,158,11,0.3)' : 'rgba(245,158,11,0.08)',
                  color: wi.id === activeWIId ? '#F59E0B' : 'rgba(245,158,11,0.6)',
                  border: `1px solid ${wi.id === activeWIId ? 'rgba(245,158,11,0.7)' : 'rgba(245,158,11,0.15)'}`,
                }}
              >{String(i + 1).padStart(2, '0')}</div>
            ))}
          </div>
        )}

        {/* WI scroll */}
        {!wiCollapsed && (
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 2px 60px', direction: 'rtl' }}>
            {workItems.length === 0 && (
              <div style={{ direction: 'ltr', padding: '20px 12px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>Нет work items</div>
            )}
            {workItems.map((wi, idx) => {
              const isActive = wi.id === activeWIId
              const isExpanded = expandedWIId === wi.id || isActive
              return (
                <div
                  key={wi.id}
                  onClick={() => handleSelectWI(wi.id)}
                  style={{
                    direction: 'ltr', position: 'relative', paddingTop: 10, cursor: 'pointer',
                    width: isActive ? '100%' : '82%', alignSelf: 'flex-end',
                    transition: 'width 0.18s cubic-bezier(.4,0,.2,1)',
                  }}
                >
                  {/* tab ear */}
                  <div style={{ position: 'absolute', top: 0, left: 0, height: 10, width: 90, borderRadius: '6px 8px 0 0', background: 'rgba(245,158,11,0.55)' }} />
                  {/* card body */}
                  <div style={{
                    borderRadius: '0 8px 8px 8px',
                    border: `1.5px solid ${isActive ? 'rgba(245,158,11,0.55)' : 'rgba(245,158,11,0.28)'}`,
                    background: 'rgba(245,158,11,0.08)',
                    overflow: 'hidden',
                    transition: 'border-color 0.15s',
                  }}>
                    {/* amber strip */}
                    <div style={{ height: 3, background: 'linear-gradient(90deg,#F59E0B,#FCD34D)' }} />
                    {/* head */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px 6px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, fontWeight: 400, fontFamily: 'monospace', color: 'rgba(245,158,11,0.85)', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.22)', padding: '1px 5px', borderRadius: 4, flexShrink: 0 }}>
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{wi.title}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 3, background: `${WI_STATUS_COLOR[wi.status]}18`, color: WI_STATUS_COLOR[wi.status] }}>
                        {WI_STATUS_LABEL[wi.status]}
                      </span>
                    </div>
                    {/* expanded content */}
                    {isExpanded && (
                      <div onClick={e => e.stopPropagation()} style={{ padding: '0 10px 10px', borderTop: '1px solid rgba(245,158,11,0.12)', marginTop: 2 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 8 }}>
                          {wi.date && <WIExpRow label="Дата" value={wi.date} />}
                          {wi.location && <WIExpRow label="Локация" value={wi.location} />}
                          {wi.format && <WIExpRow label="Формат" value={wi.format} />}
                          {wi.execProducer && <WIExpRow label="Исп. продюсер" value={formatName(wi.execProducer.name)} />}
                          {wi.lineProducer && <WIExpRow label="Лайн" value={formatName(wi.lineProducer.name)} />}
                          {wi.budget && <WIExpRow label="Бюджет" value={fmtMoney(wi.budget)} />}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, gap: 6 }}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <select value={wi.status} onChange={e => { e.stopPropagation(); updateWI.mutate({ status: e.target.value }) }} style={{ ...miniSelectStyle, fontSize: 11 }}
                              onClick={e => e.stopPropagation()}>
                              {(Object.entries(WI_STATUS_LABEL) as [WorkItemStatus, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                          </div>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => deleteWI.mutate(wi.id)} style={{ ...miniSelectStyle, cursor: 'pointer', color: '#E8194B', background: 'rgba(232,25,75,0.08)', borderColor: 'rgba(232,25,75,0.2)', fontFamily: 'Inter, sans-serif' }}>
                              Удалить
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Col 2: Отделы ── */}
      <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg)', borderRight: '1px solid var(--border)', overflow: 'hidden', minWidth: 0 }}>
        {/* header */}
        <div style={{ padding: deptsCollapsed ? 0 : '0 12px', height: 40, display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)', flexShrink: 0, justifyContent: deptsCollapsed ? 'center' : 'flex-start' }}>
          {!deptsCollapsed && (
            <span style={{ flex: 1, fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
              {activeWI ? `Отделы · ${workItems.findIndex(w => w.id === activeWIId) + 1 > 0 ? `T${workItems.findIndex(w => w.id === activeWIId) + 1}` : '—'}` : 'Отделы'}
            </span>
          )}
          <button
            onClick={() => setDeptsCollapsed(c => !c)}
            style={collapseBtn(deptsCollapsed, () => {})}
            title={deptsCollapsed ? 'Развернуть' : 'Свернуть'}
          >‹</button>
        </div>

        {/* collapsed strip */}
        {deptsCollapsed && (
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0', gap: 5 }}>
            {wiDivisions.map(div => (
              <div
                key={div.id}
                onClick={() => { setDeptsCollapsed(false); handleSelectDiv(div.id) }}
                title={div.name}
                style={{
                  width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, fontWeight: 800, cursor: 'pointer', flexShrink: 0,
                  background: div.id === activeDivision?.id ? `${div.deptColor}40` : `${div.deptColor}18`,
                  color: div.deptColor,
                  border: `1px solid ${div.id === activeDivision?.id ? div.deptColor : `${div.deptColor}40`}`,
                }}
              >{initials(div.name)}</div>
            ))}
          </div>
        )}

        {/* dept cards */}
        {!deptsCollapsed && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {!activeWI ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>
                <span style={{ fontSize: 28, opacity: 0.2 }}>🏢</span>
                <span style={{ fontSize: 12 }}>Выберите Work Item</span>
              </div>
            ) : wiDivisions.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>
                <span style={{ fontSize: 28, opacity: 0.2 }}>🏢</span>
                <span style={{ fontSize: 12, lineHeight: 1.5 }}>Нет отделов.<br/>Добавьте через редактор WI.</span>
              </div>
            ) : (
              wiDivisions.map(div => {
                const isActiveDept = div.id === activeDivision?.id
                return (
                  <div
                    key={div.id}
                    onClick={() => handleSelectDiv(div.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 9,
                      background: isActiveDept ? 'rgba(255,107,53,0.06)' : 'var(--surface-2)',
                      border: `1px solid ${isActiveDept ? '#FF6B35' : 'rgba(255,255,255,0.13)'}`,
                      borderRadius: 9, padding: '8px 11px', cursor: 'pointer',
                      transition: 'border-color 0.12s, background 0.12s',
                    }}
                  >
                    <div style={{
                      width: 30, height: 30, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9.5, fontWeight: 800, flexShrink: 0,
                      background: `${div.deptColor}20`, color: div.deptColor,
                    }}>{initials(div.name)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{div.name}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 1 }}>{div.deptName}</div>
                    </div>
                  </div>
                )
              })
            )}
            {/* + Подключить отдел */}
            {activeWI && (
              <button
                onClick={() => {
                  // toggle all divisions selector inline — open WI form for now
                  setShowWIForm(true)
                }}
                style={{ background: 'none', border: '1px dashed rgba(255,255,255,0.13)', borderRadius: 8, fontFamily: 'Inter, sans-serif', fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', padding: '7px 12px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.1s', width: '100%', marginTop: 2 }}
              >+ Подключить отдел</button>
            )}
          </div>
        )}
      </div>

      {/* ── Col 3: Детали отдела ── */}
      <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--surface-2)', overflow: 'hidden' }}>
        {/* crumbs bar */}
        <div style={{ height: 40, padding: '0 20px', flexShrink: 0, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 5 }}>
          {activeWI && activeDivision ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden' }}>
              <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>{activeWI.title}</span>
              <span style={{ opacity: 0.5 }}>›</span>
              <span style={{ color: '#FF6B35', fontWeight: 700, whiteSpace: 'nowrap' }}>{activeDivision.name}</span>
            </div>
          ) : (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Выберите WI и отдел</span>
          )}
        </div>

        {!activeWI || !activeDivision ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
            <span style={{ fontSize: 36, opacity: 0.15 }}>🗂</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Выберите Work Item и отдел</span>
            <span style={{ fontSize: 12, maxWidth: 200, lineHeight: 1.5, color: 'var(--text-muted)', opacity: 0.7 }}>Нажмите на WI-карточку, затем на отдел чтобы увидеть детали</span>
          </div>
        ) : (
          <>
            {/* dept detail header */}
            <div style={{ padding: '14px 22px 0', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 12 }}>
                <div style={{
                  width: 46, height: 46, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700, flexShrink: 0,
                  background: `${activeDivision.deptColor}20`, color: activeDivision.deptColor,
                }}>{initials(activeDivision.name)}</div>
                <div style={{ flex: 1 }}>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>{activeDivision.name}</h2>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>{activeDivision.deptName}</div>
                </div>
                <button
                  onClick={() => setShowWIForm(true)}
                  style={{ background: 'var(--surface-3)', border: '1px solid rgba(255,255,255,0.13)', borderRadius: 7, padding: '5px 12px', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer' }}
                >Изменить</button>
              </div>
              {/* detail tabs */}
              <div style={{ display: 'flex', marginBottom: -1 }}>
                {(['team', 'scheduler', 'freelancers', 'expenses'] as const).map(t => {
                  const labels = { team: 'Команда', scheduler: 'Планировщик', freelancers: 'Фрилы', expenses: 'Расходы' }
                  return (
                    <button
                      key={t}
                      onClick={() => setDetailTab(t)}
                      style={{
                        background: 'none', border: 'none', borderBottom: `2px solid ${detailTab === t ? '#FF6B35' : 'transparent'}`,
                        padding: '9px 14px', fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: detailTab === t ? 600 : 500,
                        color: detailTab === t ? '#FF6B35' : 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.12s', marginBottom: -1,
                      }}
                    >{labels[t]}</button>
                  )
                })}
              </div>
            </div>

            {/* detail body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
              {detailTab === 'expenses' && wiDetail && (
                <ExpensesBlock wiId={activeWIId!} projectId={projectId} expenses={wiDetail.expenses} budget={activeWI.budget} />
              )}
              {detailTab === 'team' && (
                <div style={{ border: '1.5px dashed rgba(255,255,255,0.1)', borderRadius: 12, background: 'var(--surface-2)', padding: '48px 32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 32, opacity: 0.2, marginBottom: 10 }}>👥</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 5 }}>Команда отдела</div>
                  <div style={{ fontSize: 12, lineHeight: 1.55, maxWidth: 300, margin: '0 auto 12px' }}>Список штатных сотрудников и подрядчиков, подключённых к этому отделу: роли, тип занятости, количество смен, нагрузка.</div>
                  <span style={{ display: 'inline-block', padding: '3px 10px', background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 99, fontSize: 10.5, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>— ЗАГЛУШКА · В РАЗРАБОТКЕ —</span>
                </div>
              )}
              {detailTab === 'scheduler' && (
                <div style={{ border: '1.5px dashed rgba(255,255,255,0.1)', borderRadius: 12, background: 'var(--surface-2)', padding: '48px 32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 32, opacity: 0.2, marginBottom: 10 }}>📅</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 5 }}>Планировщик</div>
                  <div style={{ fontSize: 12, lineHeight: 1.55, maxWidth: 280, margin: '0 auto 12px' }}>График смен и нагрузки по отделу для этого Work Item.</div>
                  <span style={{ display: 'inline-block', padding: '3px 10px', background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 99, fontSize: 10.5, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>— ЗАГЛУШКА · В РАЗРАБОТКЕ —</span>
                </div>
              )}
              {detailTab === 'freelancers' && (
                <div style={{ border: '1.5px dashed rgba(255,255,255,0.1)', borderRadius: 12, background: 'var(--surface-2)', padding: '48px 32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 32, opacity: 0.2, marginBottom: 10 }}>🎭</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 5 }}>Фрилансеры</div>
                  <div style={{ fontSize: 12, lineHeight: 1.55, maxWidth: 280, margin: '0 auto 12px' }}>Внешние подрядчики, привлечённые для этого отдела в рамках Work Item.</div>
                  <span style={{ display: 'inline-block', padding: '3px 10px', background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 99, fontSize: 10.5, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>— ЗАГЛУШКА · В РАЗРАБОТКЕ —</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showWIForm && <WIFormModal projectId={projectId} onClose={() => setShowWIForm(false)} />}
    </div>
  )
}

function WIExpRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 90, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 11, color: 'var(--text-1)', fontWeight: 600 }}>{value}</span>
    </div>
  )
}

// ── FinanceTab ────────────────────────────────────────────────────────────────

function FinanceTab({ projectId }: { projectId: string }) {
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
          <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>Финансы проекта</span>
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
                <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
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
            <span style={{ width: 32, height: 32, borderRadius: 8, background: `${WI_STATUS_COLOR[activeWI.status]}20`, color: WI_STATUS_COLOR[activeWI.status], display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, flexShrink: 0 }}>
              {WI_STATUS_LABEL[activeWI.status].slice(0,2).toUpperCase()}
            </span>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-1)', flex: 1 }}>{activeWI.title}</h3>
            <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 99, background: `${WI_STATUS_COLOR[activeWI.status]}18`, color: WI_STATUS_COLOR[activeWI.status] }}>
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
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>
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
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', flexShrink: 0, letterSpacing: '0.04em' }}>{EXPENSE_LABEL[exp.category]}</span>
                  <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exp.description || '—'}</span>
                  {exp.date && <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{exp.date}</span>}
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

// ── TeamTab ───────────────────────────────────────────────────────────────────

function TeamTab({ projectId }: { projectId: string }) {
  const { data: workItems = [], isLoading } = useQuery<WorkItem[]>({
    queryKey: ['work-items', projectId],
    queryFn:  () => api.get(`/projects/${projectId}/work-items`).then(r => r.data),
  })

  if (isLoading) return <LoadingState />

  // Собираем уникальных людей из ролей WI
  type PersonEntry = { name: string; role: string; wis: string[] }
  const people = new Map<string, PersonEntry>()

  workItems.forEach(wi => {
    const roles: [UserRef | undefined, string][] = [
      [wi.execProducer, 'Исп. продюсер'],
      [wi.lineProducer, 'Лайн продюсер'],
      [wi.accountManager, 'Аккаунт менеджер'],
    ]
    roles.forEach(([user, role]) => {
      if (!user) return
      const key = `${user.id}-${role}`
      if (!people.has(key)) people.set(key, { name: user.name, role, wis: [] })
      people.get(key)!.wis.push(wi.title)
    })
  })

  // Группируем по отделам из WI
  const deptMap = new Map<string, { name: string; color: string; members: Set<string> }>()
  workItems.forEach(wi => {
    wi.departments.forEach(d => {
      const key = d.division.department.id
      if (!deptMap.has(key)) deptMap.set(key, { name: d.division.department.name, color: d.division.department.color, members: new Set() })
      deptMap.get(key)!.members.add(d.division.name)
    })
  })

  const peopleList = [...people.values()]

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Roles */}
      {peopleList.length > 0 && (
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>
            Ключевые роли
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            {peopleList.map((p, i) => (
              <div key={i} style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', borderRight: i % 2 === 0 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 4 }}>{p.role}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{formatName(p.name)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{p.wis.length} WI</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Departments */}
      {deptMap.size > 0 && (
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>
            Отделы на проекте
          </div>
          {[...deptMap.values()].map((dept, i, arr) => (
            <div key={dept.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <span style={{ width: 28, height: 28, borderRadius: 7, background: `${dept.color}22`, color: dept.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, flexShrink: 0 }}>
                {dept.name.slice(0, 2).toUpperCase()}
              </span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{dept.name}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{[...dept.members].join(', ')}</span>
            </div>
          ))}
        </div>
      )}

      {peopleList.length === 0 && deptMap.size === 0 && (
        <div style={{ padding: 48, textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
          Добавьте роли и отделы в Work Items
        </div>
      )}
    </div>
  )
}

// ── RoadmapTab ────────────────────────────────────────────────────────────────

function RoadmapTab() {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--text-muted)' }}>
      <div style={{ fontSize: 32 }}>🗓</div>
      <div style={{ fontSize: 14, fontWeight: 500 }}>Дорожная карта</div>
      <div style={{ fontSize: 12 }}>Будет добавлена в следующей версии</div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function KpiCard({ label, value, unit, color, sub }: { label: string; value: string; unit?: string; color: string; sub?: string }) {
  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1, color, fontFamily: 'monospace' }}>
        {value}{unit && <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 4 }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  )
}

function SidebarSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ padding: '8px 18px 6px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.015)' }}>{label}</div>
      <div>{children}</div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '8px 18px', gap: 12, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ fontSize: 11.5, color: 'var(--text-muted)', width: 90, flexShrink: 0 }}>{label}</span>
      <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-1)', fontWeight: 500 }}>{value}</span>
    </div>
  )
}

function StructSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.015)' }}>{title}</div>
      <div style={{ padding: '12px 14px' }}>{children}</div>
    </div>
  )
}

function Tag({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }}>
      <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{label}:</span>
      <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>{value}</span>
    </div>
  )
}

function FinSummaryRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 11 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: color ?? 'var(--text-1)' }}>{value}</span>
    </div>
  )
}

function LoadingState() {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Загрузка...</div>
  )
}

// ── ExpensesBlock (переиспользуется в StructureTab) ───────────────────────────

function ExpensesBlock({ wiId, projectId, expenses, budget }: {
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
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: total > bud ? '#E8194B' : '#29BF12', fontWeight: 600 }}>
          <span>Итого: {fmtMoney(String(total))}</span>
          <span>Бюджет: {fmtMoney(budget)}</span>
        </div>
      )}
      {expenses.map(exp => (
        <div key={exp.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', background: 'var(--surface-3)', borderRadius: 6, fontSize: 12 }}>
          <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: 10, textTransform: 'uppercase', fontWeight: 600 }}>{EXPENSE_LABEL[exp.category]}</span>
          <span style={{ flex: 1, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exp.description || '—'}</span>
          <span style={{ fontWeight: 700, color: 'var(--text-1)', flexShrink: 0, fontFamily: 'monospace' }}>{fmtMoney(exp.amount)}</span>
          <button onClick={() => deleteExpense.mutate(exp.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, padding: 2, flexShrink: 0 }}>✕</button>
        </div>
      ))}
      {!open ? (
        <button onClick={() => setOpen(true)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'Inter, sans-serif', alignSelf: 'flex-start' }}>
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
    <button onClick={() => setEditing(true)} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: current ? 'var(--text-1)' : 'var(--text-muted)', cursor: 'pointer', fontFamily: 'Inter, sans-serif', alignSelf: 'flex-start' }}>
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

// ── WIFormModal ───────────────────────────────────────────────────────────────

function WIFormModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [format, setFormat] = useState('')
  const [location, setLocation] = useState('')

  const create = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/work-items`, { title, date: date || undefined, format: format || undefined, location: location || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['work-items', projectId] }); onClose() },
  })

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface-1)', borderRadius: 14, padding: 24, width: 400, border: '1px solid var(--border)' }}>
        <h3 style={{ margin: '0 0 18px', fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>Новый Work Item</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Название *" style={inputStyle} autoFocus />
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5, display: 'flex', alignItems: 'center' }}>
              Дата <Hint text="Дата съёмки или события. Отображается в карточке WI." />
            </div>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inputStyle, colorScheme: 'dark' }} />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5, display: 'flex', alignItems: 'center' }}>
              Формат <Hint text="Производственный формат съёмки: ТВ, Радио и т.д. Влияет на фильтры по проектам." />
            </div>
            <select value={format} onChange={e => setFormat(e.target.value)} style={inputStyle}><option value="">— Формат</option>{FORMATS.map(f => <option key={f} value={f}>{f}</option>)}</select>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5, display: 'flex', alignItems: 'center' }}>
              Локация <Hint text="Место проведения съёмки. Из предустановленного списка площадок компании." />
            </div>
            <select value={location} onChange={e => setLocation(e.target.value)} style={inputStyle}><option value="">— Локация</option>{LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}</select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose} style={{ fontSize: 13, padding: '7px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>Отмена</button>
          <button onClick={() => create.mutate()} disabled={!title.trim() || create.isPending} style={{ fontSize: 13, padding: '7px 18px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#FF6B35,#E8194B)', color: '#fff', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', opacity: title.trim() && !create.isPending ? 1 : 0.5 }}>
            {create.isPending ? 'Создание...' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  )
}
