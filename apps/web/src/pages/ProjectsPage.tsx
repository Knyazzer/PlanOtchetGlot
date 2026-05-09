import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useCurrentUser } from '../hooks/useAuth'

type ProjectStatus = 'draft' | 'active' | 'done' | 'cancelled' | 'rejected'

type Project = {
  id: string
  name: string
  status: ProjectStatus
  client: string | null
  createdAt: string
  accountManager: { id: string; fullName: string } | null
}

const STATUS_LABEL: Record<ProjectStatus, string> = {
  draft:     'Заявка',
  active:    'Реализация',
  done:      'Сдан',
  cancelled: 'Отменён',
  rejected:  'Не согласован',
}

const STATUS_COLOR: Record<ProjectStatus, string> = {
  draft:     '#64748b',
  active:    '#2563eb',
  done:      '#16a34a',
  cancelled: '#94a3b8',
  rejected:  '#dc2626',
}

const STATUS_BG: Record<ProjectStatus, string> = {
  draft:     '#f1f5f9',
  active:    '#eff6ff',
  done:      '#f0fdf4',
  cancelled: '#f8fafc',
  rejected:  '#fef2f2',
}

const MAIN_STATUSES: ProjectStatus[] = ['draft', 'active', 'done']
const ARCHIVE_STATUSES: ProjectStatus[] = ['cancelled', 'rejected']

const TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  draft:     ['active', 'rejected', 'cancelled'],
  active:    ['done', 'cancelled'],
  done:      ['active'],
  cancelled: ['draft'],
  rejected:  ['draft'],
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: '2-digit' })
}

function ProjectCard({ project, canWrite }: { project: Project; canWrite: boolean }) {
  const qc = useQueryClient()
  const move = useMutation({
    mutationFn: (status: ProjectStatus) =>
      api.patch(`/projects/${project.id}`, { status }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['all-projects'] }),
  })

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px', marginBottom: 8 }}>
      <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b', marginBottom: 4 }}>{project.name}</div>
      {project.client && (
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>{project.client}</div>
      )}
      {project.accountManager && (
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>
          Менеджер: {project.accountManager.fullName}
        </div>
      )}
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>
        {formatDate(project.createdAt)}
      </div>
      {canWrite && TRANSITIONS[project.status].length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {TRANSITIONS[project.status].map((next) => (
            <button
              key={next}
              onClick={() => move.mutate(next)}
              disabled={move.isPending}
              style={{
                fontSize: 11, padding: '3px 8px', border: 'none', borderRadius: 4,
                background: STATUS_COLOR[next], color: '#fff', cursor: 'pointer',
              }}
            >
              → {STATUS_LABEL[next]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ProjectColumn({ status, projects, canWrite }: {
  status: ProjectStatus; projects: Project[]; canWrite: boolean
}) {
  return (
    <div style={{ flex: 1, minWidth: 220, background: STATUS_BG[status], borderRadius: 10, padding: '12px 12px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: STATUS_COLOR[status], flexShrink: 0 }} />
        <span style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>{STATUS_LABEL[status]}</span>
        <span style={{ marginLeft: 'auto', background: STATUS_COLOR[status], color: '#fff', borderRadius: 10, padding: '1px 8px', fontSize: 12, fontWeight: 600 }}>
          {projects.length}
        </span>
      </div>
      {projects.map((p) => <ProjectCard key={p.id} project={p} canWrite={canWrite} />)}
      {projects.length === 0 && (
        <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, paddingTop: 20 }}>Нет проектов</div>
      )}
    </div>
  )
}

export function ProjectsPage() {
  const user = useCurrentUser()
  const [showArchive, setShowArchive] = useState(false)
  const canWrite = user?.permissions?.includes('projects:write') ?? false

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ['all-projects'],
    queryFn: () => api.get('/projects').then((r) => r.data),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })

  const byStatus = (status: ProjectStatus) => projects.filter((p) => p.status === status)

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1e293b' }}>Доска проектов</h1>
        <div style={{ fontSize: 13, color: '#64748b' }}>Всего: {projects.length}</div>
        <button
          onClick={() => setShowArchive((v) => !v)}
          style={{ marginLeft: 'auto', padding: '6px 14px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 13, color: '#64748b' }}
        >
          {showArchive ? 'Скрыть архив' : 'Показать архив'}
        </button>
      </div>

      {isLoading && <div style={{ color: '#64748b' }}>Загрузка...</div>}

      {!isLoading && (
        <>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: showArchive ? 24 : 0 }}>
            {MAIN_STATUSES.map((s) => (
              <ProjectColumn key={s} status={s} projects={byStatus(s)} canWrite={canWrite} />
            ))}
          </div>

          {showArchive && (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                Архив
              </div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                {ARCHIVE_STATUSES.map((s) => (
                  <ProjectColumn key={s} status={s} projects={byStatus(s)} canWrite={canWrite} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
