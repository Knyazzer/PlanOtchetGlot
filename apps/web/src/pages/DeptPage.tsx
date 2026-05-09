import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

type DeptWILink = {
  id: string
  wiId: string
  substatus: 'not_started' | 'in_progress' | 'done'
  workItem: {
    id: string
    name: string
    client: string | null
    format: string | null
    deliveryDate: string | null
    project: { id: string; name: string } | null
  }
}

type Department = {
  id: string
  name: string
  type: string
}

type BoardData = {
  not_started: DeptWILink[]
  in_progress: DeptWILink[]
  done: DeptWILink[]
}

type Tab = 'board' | 'calendar' | 'gantt'

const SUBSTATUS_LABELS: Record<string, string> = {
  not_started: 'Не начат',
  in_progress: 'В работе',
  done: 'Завершён',
}

function WICard({ link, onMove, onRemove }: { link: DeptWILink; onMove: (id: string, s: string) => void; onRemove: (id: string) => void }) {
  const wi = link.workItem
  return (
    <div style={{ background: '#1e293b', borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
      <div style={{ color: '#94a3b8', fontSize: 10, marginBottom: 4 }}>
        {wi.project?.name ?? '—'}
      </div>
      <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{wi.name}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {wi.client && <span style={{ background: '#0f172a', color: '#64748b', padding: '2px 7px', borderRadius: 4, fontSize: 10 }}>{wi.client}</span>}
        {wi.format && <span style={{ background: '#0f172a', color: '#64748b', padding: '2px 7px', borderRadius: 4, fontSize: 10 }}>{wi.format}</span>}
        {wi.deliveryDate && (
          <span style={{ background: '#0f172a', color: '#64748b', padding: '2px 7px', borderRadius: 4, fontSize: 10 }}>
            {new Date(wi.deliveryDate).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {link.substatus !== 'not_started' && (
          <button onClick={() => onMove(link.id, link.substatus === 'in_progress' ? 'not_started' : 'in_progress')}
            style={{ flex: 1, background: '#334155', color: '#94a3b8', border: 'none', borderRadius: 5, padding: '4px 0', fontSize: 11, cursor: 'pointer' }}>
            ←
          </button>
        )}
        {link.substatus !== 'done' && (
          <button onClick={() => onMove(link.id, link.substatus === 'not_started' ? 'in_progress' : 'done')}
            style={{ flex: 1, background: link.substatus === 'in_progress' ? '#166534' : '#1e40af', color: '#fff', border: 'none', borderRadius: 5, padding: '4px 0', fontSize: 11, cursor: 'pointer' }}>
            {link.substatus === 'not_started' ? 'Начать' : 'Завершить'} →
          </button>
        )}
        <button onClick={() => onRemove(link.id)}
          style={{ background: '#450a0a', color: '#f87171', border: 'none', borderRadius: 5, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}>
          ✕
        </button>
      </div>
    </div>
  )
}

function BoardColumn({ title, links, onMove, onRemove }: { title: string; links: DeptWILink[]; onMove: (id: string, s: string) => void; onRemove: (id: string) => void }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid #1e293b', minWidth: 0 }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#64748b', fontSize: 11, fontWeight: 600 }}>{title.toUpperCase()}</span>
        <span style={{ background: '#0f172a', color: '#94a3b8', borderRadius: 10, padding: '1px 7px', fontSize: 11 }}>{links.length}</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
        {links.map((l) => <WICard key={l.id} link={l} onMove={onMove} onRemove={onRemove} />)}
        {links.length === 0 && <div style={{ color: '#334155', fontSize: 12, textAlign: 'center', paddingTop: 20 }}>Нет задач</div>}
      </div>
    </div>
  )
}

export function DeptPage() {
  const qc = useQueryClient()
  const [deptId, setDeptId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('board')

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then((r) => r.data),
  })

  const { data: board, isLoading } = useQuery<BoardData>({
    queryKey: ['dept-board', deptId],
    queryFn: () => api.get(`/departments/${deptId}/board`).then((r) => r.data),
    enabled: !!deptId && tab === 'board',
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })

  const moveLink = useMutation({
    mutationFn: ({ id, substatus }: { id: string; substatus: string }) =>
      api.patch(`/dept-wi-links/${id}/substatus`, { substatus }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dept-board', deptId] }),
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Ошибка'),
  })

  const removeLink = useMutation({
    mutationFn: (id: string) => api.delete(`/dept-wi-links/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dept-board', deptId] }),
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Ошибка'),
  })

  const selectedDept = departments.find((d) => d.id === deptId)

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      {/* Sidebar */}
      <div style={{ width: 220, flexShrink: 0, background: '#0f172a', borderRight: '1px solid #1e293b', padding: '16px 0', overflowY: 'auto' }}>
        <div style={{ padding: '0 16px 8px', color: '#475569', fontSize: 11 }}>ОТДЕЛЫ</div>
        {departments.map((d) => (
          <button key={d.id} onClick={() => setDeptId(d.id === deptId ? null : d.id)} title={d.name}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 16px', background: deptId === d.id ? '#1e293b' : 'transparent', border: 'none', color: deptId === d.id ? '#93c5fd' : '#94a3b8', fontSize: 13, cursor: 'pointer', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 10 }}>{deptId === d.id ? '◉' : '○'}</span>
            {d.name}
          </button>
        ))}
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 16 }}>
            {selectedDept ? selectedDept.name : 'Доска проектов'}
          </span>
          {isLoading && tab === 'board' && <span style={{ color: '#64748b', fontSize: 13 }}>Загрузка...</span>}
          {!deptId && <span style={{ color: '#475569', fontSize: 13 }}>Выберите отдел</span>}
          <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
            {(['board', 'calendar', 'gantt'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? '#2563eb' : 'transparent',
                color: tab === t ? '#fff' : '#64748b',
                border: 'none', borderRadius: 5, padding: '5px 12px',
                fontSize: 12, cursor: 'pointer',
              }}>
                {t === 'board' ? 'Доска проектов' : t === 'calendar' ? 'Событийный' : 'Гантт'}
              </button>
            ))}
          </div>
        </div>

        {tab === 'board' && deptId && (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {(['not_started', 'in_progress', 'done'] as const).map((s) => (
              <BoardColumn
                key={s} title={SUBSTATUS_LABELS[s]}
                links={board?.[s] ?? []}
                onMove={(id, substatus) => moveLink.mutate({ id, substatus })}
                onRemove={(id) => removeLink.mutate(id)}
              />
            ))}
          </div>
        )}

        {tab === 'calendar' && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: 14 }}>
            Событийный календарь — в разработке
          </div>
        )}

        {tab === 'gantt' && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: 14 }}>
            Диаграмма Гантт — в разработке
          </div>
        )}
      </div>
    </div>
  )
}
