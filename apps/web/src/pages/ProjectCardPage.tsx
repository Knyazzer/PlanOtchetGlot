import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Project, ProjectStatus, CardTab } from './project-card/types'
import { STATUS_LABEL, STATUS_COLOR } from './project-card/constants'
import { InfoTab } from './project-card/InfoTab'
import { StructureTab } from './project-card/StructureTab'
import { FinanceTab } from './project-card/FinanceTab'
import { TeamTab } from './project-card/TeamTab'
import { RoadmapTab } from './project-card/RoadmapTab'

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
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: '#F97316' }} />

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          {/* Left: eyebrow + title + status */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
              <span style={{ color: '#FF6B35', fontFamily: 'monospace' }}>{project.id.slice(0, 8).toUpperCase()}</span>
              <span>·</span>
              <span>{project.client?.name ?? '—'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-1)', lineHeight: 1.2 }}>
                {project.title}
              </h1>
              <select
                value={project.status}
                onChange={e => updateProject.mutate({ status: e.target.value as ProjectStatus })}
                style={{
                  appearance: 'none', border: 'none', outline: 'none', cursor: 'pointer',
                  fontFamily: 'Inter, sans-serif', fontSize: 12.5, fontWeight: 700,
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