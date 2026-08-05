import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatName } from '../../lib/utils'
import type { Project, WorkItem, ProjectStatus } from './types'
import { STATUS_LABEL, WI_STATUS_COLOR, WI_STATUS_LABEL, inputStyle } from './constants'
import { fmtMoney } from './utils'
import { SidebarSection, InfoRow, KpiCard } from './ui'

// ── InfoTab ───────────────────────────────────────────────────────────────────

export function InfoTab({ project, onBack: _onBack }: { project: Project; onBack: () => void }) {
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
          <InfoRow label="ID"       value={<span style={{ fontFamily: 'monospace', fontSize: 12 }}>{project.id.slice(0, 12)}</span>} />
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
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>
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
                fontSize: 12, fontWeight: 700, flexShrink: 0,
                color: WI_STATUS_COLOR[wi.status], background: `${WI_STATUS_COLOR[wi.status]}18`,
                padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.04em',
              }}>{WI_STATUS_LABEL[wi.status]}</span>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wi.title}</span>
              {wi.date && <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{wi.date}</span>}
              {wi.execProducer && <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{formatName(wi.execProducer.name)}</span>}
              {wi._count.tracks > 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0, background: 'var(--surface-3)', padding: '1px 6px', borderRadius: 4 }}>{wi._count.tracks} т</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
