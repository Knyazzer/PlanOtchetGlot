import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useCurrentUser, useIsAdmin, useIsDeptDirector, usePrimaryDept } from '../hooks/useAuth'

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

type Department = { id: string; name: string; type: string }

type BoardData = {
  not_started: DeptWILink[]
  in_progress: DeptWILink[]
  done: DeptWILink[]
}

const SUBSTATUS_LABELS: Record<string, string> = {
  not_started: 'Не начат',
  in_progress: 'В работе',
  done:        'Завершён',
}

const SUBSTATUS_COLOR: Record<string, string> = {
  not_started: '#64748b',
  in_progress: '#2563eb',
  done:        '#16a34a',
}

function WICard({ link, onMove, onRemove }: {
  link: DeptWILink
  onMove: (id: string, s: string) => void
  onRemove: (id: string) => void
}) {
  const wi = link.workItem
  return (
    <div style={{
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
      padding: '10px 12px', marginBottom: 8,
    }}>
      <div style={{ color: '#94a3b8', fontSize: 10, marginBottom: 4 }}>{wi.project?.name ?? '—'}</div>
      <div style={{ color: '#1e293b', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{wi.name}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {wi.client && (
          <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 7px', borderRadius: 4, fontSize: 10 }}>
            {wi.client}
          </span>
        )}
        {wi.format && (
          <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 7px', borderRadius: 4, fontSize: 10 }}>
            {wi.format}
          </span>
        )}
        {wi.deliveryDate && (
          <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 7px', borderRadius: 4, fontSize: 10 }}>
            {new Date(wi.deliveryDate).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {link.substatus !== 'not_started' && (
          <button
            onClick={() => onMove(link.id, link.substatus === 'in_progress' ? 'not_started' : 'in_progress')}
            style={{ flex: 1, background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 5, padding: '4px 0', fontSize: 11, cursor: 'pointer' }}
          >
            ←
          </button>
        )}
        {link.substatus !== 'done' && (
          <button
            onClick={() => onMove(link.id, link.substatus === 'not_started' ? 'in_progress' : 'done')}
            style={{
              flex: 1, border: 'none', borderRadius: 5, padding: '4px 0', fontSize: 11, cursor: 'pointer',
              background: link.substatus === 'not_started' ? '#2563eb' : '#16a34a', color: '#fff',
            }}
          >
            {link.substatus === 'not_started' ? 'Начать' : 'Завершить'} →
          </button>
        )}
        <button
          onClick={() => onRemove(link.id)}
          style={{ background: '#fef2f2', color: '#ef4444', border: 'none', borderRadius: 5, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}
        >
          ✕
        </button>
      </div>
    </div>
  )
}

function BoardColumn({ substatus, links, onMove, onRemove }: {
  substatus: 'not_started' | 'in_progress' | 'done'
  links: DeptWILink[]
  onMove: (id: string, s: string) => void
  onRemove: (id: string) => void
}) {
  return (
    <div style={{ flex: 1, minWidth: 260, background: '#f8fafc', borderRadius: 10, padding: '12px 12px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: SUBSTATUS_COLOR[substatus], flexShrink: 0 }} />
        <span style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>{SUBSTATUS_LABELS[substatus]}</span>
        <span style={{
          marginLeft: 'auto', background: SUBSTATUS_COLOR[substatus], color: '#fff',
          borderRadius: 10, padding: '1px 7px', fontSize: 12, fontWeight: 600,
        }}>
          {links.length}
        </span>
      </div>
      {links.map((l) => (
        <WICard key={l.id} link={l} onMove={onMove} onRemove={onRemove} />
      ))}
      {links.length === 0 && (
        <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, paddingTop: 20 }}>Нет проектов</div>
      )}
    </div>
  )
}

export function DeptProjectsPage() {
  const qc = useQueryClient()
  const user = useCurrentUser()
  const isAdmin = useIsAdmin()
  const isDeptDirector = useIsDeptDirector()
  const primaryDept = usePrimaryDept()
  const canSwitchDept = isAdmin || isDeptDirector

  const [deptId, setDeptId] = useState<string | null>(primaryDept?.id ?? null)

  const { data: allDepts = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then((r) => r.data),
    enabled: canSwitchDept,
  })

  const activeDeptId = canSwitchDept ? deptId : (primaryDept?.id ?? null)

  const { data: board, isLoading } = useQuery<BoardData>({
    queryKey: ['dept-board', activeDeptId],
    queryFn: () => api.get(`/departments/${activeDeptId}/board`).then((r) => r.data),
    enabled: !!activeDeptId,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })

  const moveLink = useMutation({
    mutationFn: ({ id, substatus }: { id: string; substatus: string }) =>
      api.patch(`/dept-wi-links/${id}/substatus`, { substatus }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dept-board', activeDeptId] }),
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Ошибка'),
  })

  const removeLink = useMutation({
    mutationFn: (id: string) => api.delete(`/dept-wi-links/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dept-board', activeDeptId] }),
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Ошибка'),
  })

  const displayDepts = canSwitchDept ? allDepts : (user?.depts ?? [])
  const selectedDept = displayDepts.find((d) => d.id === activeDeptId)
  const deptName = selectedDept?.name ?? primaryDept?.name ?? 'Мой отдел'

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1e293b' }}>
          Проекты — {deptName}
        </h1>
        {isLoading && <span style={{ color: '#94a3b8', fontSize: 13 }}>Загрузка...</span>}

        {/* Dept switcher — только для admin/director */}
        {canSwitchDept && allDepts.length > 0 && (
          <select
            value={deptId ?? ''}
            onChange={(e) => setDeptId(e.target.value || null)}
            style={{
              marginLeft: 'auto', padding: '6px 10px', border: '1px solid #e2e8f0',
              borderRadius: 6, fontSize: 13, color: '#1e293b', background: '#fff', cursor: 'pointer',
            }}
          >
            <option value="">Выберите отдел</option>
            {allDepts.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        )}
      </div>

      {!activeDeptId && (
        <div style={{ color: '#94a3b8', fontSize: 15, textAlign: 'center', paddingTop: 60 }}>
          Вы не состоите ни в одном отделе
        </div>
      )}

      {activeDeptId && (
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          {(['not_started', 'in_progress', 'done'] as const).map((s) => (
            <BoardColumn
              key={s}
              substatus={s}
              links={board?.[s] ?? []}
              onMove={(id, substatus) => moveLink.mutate({ id, substatus })}
              onRemove={(id) => removeLink.mutate(id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
