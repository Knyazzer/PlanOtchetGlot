import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { ProjectCardPage } from './ProjectCardPage'
import type { Project } from './projects/types'
import { ProjectsKanban } from './projects/ProjectsKanban'
import { WorkflowTab } from './projects/WorkflowTab'
import { ProjectFormModal } from './projects/modals'
import type { ProjectsSubPage } from './projects/types'

export type { ProjectsSubPage } from './projects/types'

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
            fontSize: 12, fontWeight: 600, padding: '4px 12px', cursor: 'pointer',
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
