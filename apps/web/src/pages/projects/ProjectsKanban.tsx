import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { Project, ProjectStatus } from './types'
import { STATUS_COLOR, STATUS_LABEL, KANBAN_COLS } from './constants'

// ── ProjectsKanban ────────────────────────────────────────────────────────────

export function ProjectsKanban({ projects, isLoading, onOpen }: {
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

// ── StatusChip ────────────────────────────────────────────────────────────────

export function StatusChip({ status, onSelect }: { status: ProjectStatus; onSelect: (s: string) => void }) {
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
