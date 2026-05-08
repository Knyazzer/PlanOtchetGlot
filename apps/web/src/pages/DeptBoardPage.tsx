import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useIsAdmin } from '../hooks/useAuth'

type DeptType = 'production' | 'support' | 'internal'
type DeptSubstatus = 'not_started' | 'in_progress' | 'done'

type Department = {
  id: string
  name: string
  type: DeptType
  parentId: string | null
  parent: { id: string; name: string } | null
  _count: { members: number; wiLinks: number }
}

type WIRef = {
  id: string
  name: string
  client: string | null
  format: string | null
  location: string | null
  date: string | null
  status: string
  notes: string | null
  project: { id: string; name: string; status: string } | null
}

type BoardLink = {
  id: string
  deptId: string
  wiId: string
  deadline: string | null
  substatus: DeptSubstatus
  createdAt: string
  workItem: WIRef
}

type Board = {
  not_started: BoardLink[]
  in_progress: BoardLink[]
  done: BoardLink[]
}

const SUBSTATUS_LABEL: Record<DeptSubstatus, string> = {
  not_started: 'Не начат',
  in_progress: 'В работе',
  done:        'Завершён',
}

const SUBSTATUS_COLOR: Record<DeptSubstatus, string> = {
  not_started: '#64748b',
  in_progress: '#2563eb',
  done:        '#16a34a',
}

const SUBSTATUS_BG: Record<DeptSubstatus, string> = {
  not_started: '#f1f5f9',
  in_progress: '#eff6ff',
  done:        '#f0fdf4',
}

const COLUMNS: DeptSubstatus[] = ['not_started', 'in_progress', 'done']

const NEXT_STATUS: Record<DeptSubstatus, DeptSubstatus | null> = {
  not_started: 'in_progress',
  in_progress: 'done',
  done:        null,
}

const PREV_STATUS: Record<DeptSubstatus, DeptSubstatus | null> = {
  not_started: null,
  in_progress: 'not_started',
  done:        'in_progress',
}

function formatDate(d: string | null) {
  if (!d) return null
  return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function isOverdue(deadline: string | null) {
  if (!deadline) return false
  return new Date(deadline) < new Date()
}

function WICard({ link, deptId }: { link: BoardLink; deptId: string }) {
  const qc = useQueryClient()

  const move = useMutation({
    mutationFn: (substatus: DeptSubstatus) =>
      api.patch(`/dept-wi-links/${link.id}/substatus`, { substatus }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dept-board', deptId] }),
  })

  const next = NEXT_STATUS[link.substatus]
  const prev = PREV_STATUS[link.substatus]
  const overdue = isOverdue(link.deadline)

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: 8,
      padding: '12px 14px',
      marginBottom: 8,
    }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, color: '#1e293b' }}>
        {link.workItem.name}
      </div>

      {link.workItem.project && (
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
          {link.workItem.project.name}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
        {link.workItem.client && (
          <span style={{ fontSize: 11, padding: '2px 6px', background: '#f1f5f9', borderRadius: 4, color: '#475569' }}>
            {link.workItem.client}
          </span>
        )}
        {link.workItem.format && (
          <span style={{ fontSize: 11, padding: '2px 6px', background: '#f1f5f9', borderRadius: 4, color: '#475569' }}>
            {link.workItem.format}
          </span>
        )}
        {link.workItem.date && (
          <span style={{ fontSize: 11, padding: '2px 6px', background: '#fef3c7', borderRadius: 4, color: '#92400e' }}>
            Эфир: {formatDate(link.workItem.date)}
          </span>
        )}
      </div>

      {link.deadline && (
        <div style={{
          fontSize: 12,
          marginBottom: 8,
          color: overdue ? '#dc2626' : '#475569',
          fontWeight: overdue ? 600 : 400,
        }}>
          Дедлайн: {formatDate(link.deadline)}{overdue ? ' ⚠ просрочен' : ''}
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
        {prev && (
          <button
            onClick={() => move.mutate(prev)}
            disabled={move.isPending}
            title={`Вернуть в «${SUBSTATUS_LABEL[prev]}»`}
            style={{
              fontSize: 11, padding: '3px 8px', border: '1px solid #e2e8f0',
              borderRadius: 4, background: '#fff', cursor: 'pointer', color: '#64748b',
            }}
          >
            ← {SUBSTATUS_LABEL[prev]}
          </button>
        )}
        {next && (
          <button
            onClick={() => move.mutate(next)}
            disabled={move.isPending}
            title={`Перевести в «${SUBSTATUS_LABEL[next]}»`}
            style={{
              fontSize: 11, padding: '3px 8px', border: 'none',
              borderRadius: 4,
              background: SUBSTATUS_COLOR[next],
              color: '#fff', cursor: 'pointer',
            }}
          >
            {SUBSTATUS_LABEL[next]} →
          </button>
        )}
      </div>
    </div>
  )
}

function BoardColumn({ title, links, color, bg, deptId }: {
  title: string
  links: BoardLink[]
  color: string
  bg: string
  deptId: string
}) {
  return (
    <div style={{
      flex: 1,
      minWidth: 260,
      background: bg,
      borderRadius: 10,
      padding: '12px 12px 16px',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
      }}>
        <span style={{
          width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0,
        }} />
        <span style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>{title}</span>
        <span style={{
          marginLeft: 'auto', background: color, color: '#fff',
          borderRadius: 10, padding: '1px 8px', fontSize: 12, fontWeight: 600,
        }}>
          {links.length}
        </span>
      </div>

      {links.map((link) => (
        <WICard key={link.id} link={link} deptId={deptId} />
      ))}

      {links.length === 0 && (
        <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, paddingTop: 20 }}>
          Нет задач
        </div>
      )}
    </div>
  )
}

export function DeptBoardPage() {
  const isAdmin = useIsAdmin()
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null)

  const { data: departments = [], isLoading: deptsLoading } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then((r) => r.data),
  })

  const { data: board, isLoading: boardLoading } = useQuery<Board>({
    queryKey: ['dept-board', selectedDeptId],
    queryFn: () => api.get(`/departments/${selectedDeptId}/board`).then((r) => r.data),
    enabled: !!selectedDeptId,
  })

  const activeDept = departments.find((d) => d.id === selectedDeptId)

  const totalCards = board
    ? board.not_started.length + board.in_progress.length + board.done.length
    : 0

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1e293b' }}>
            Доска отдела
          </h1>
          {activeDept && (
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
              {activeDept.name}
              {activeDept.parent && ` · ${activeDept.parent.name}`}
              {' · '}Проектов: {totalCards}
            </div>
          )}
        </div>

        <div style={{ marginLeft: 'auto' }}>
          <select
            value={selectedDeptId ?? ''}
            onChange={(e) => setSelectedDeptId(e.target.value || null)}
            style={{
              padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8,
              fontSize: 14, background: '#fff', color: '#1e293b', cursor: 'pointer',
              minWidth: 200,
            }}
          >
            <option value="">— Выбрать отдел —</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.parent ? `${d.parent.name} / ` : ''}{d.name}
                {d._count.wiLinks > 0 ? ` (${d._count.wiLinks})` : ''}
              </option>
            ))}
          </select>
        </div>

        {isAdmin && (
          <button
            onClick={() => {
              window.dispatchEvent(new CustomEvent('tvshifts:navigate', { detail: { page: 'admindept' } }))
            }}
            style={{
              padding: '8px 14px', border: '1px solid #e2e8f0', borderRadius: 8,
              fontSize: 13, background: '#fff', cursor: 'pointer', color: '#475569',
            }}
          >
            Управление отделами
          </button>
        )}
      </div>

      {deptsLoading && (
        <div style={{ textAlign: 'center', color: '#64748b', padding: 40 }}>Загрузка...</div>
      )}

      {!selectedDeptId && !deptsLoading && (
        <div style={{
          textAlign: 'center', color: '#94a3b8', padding: 60,
          border: '2px dashed #e2e8f0', borderRadius: 12, fontSize: 15,
        }}>
          Выберите отдел в списке выше
        </div>
      )}

      {selectedDeptId && boardLoading && (
        <div style={{ textAlign: 'center', color: '#64748b', padding: 40 }}>Загрузка доски...</div>
      )}

      {selectedDeptId && board && (
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          {COLUMNS.map((col) => (
            <BoardColumn
              key={col}
              title={SUBSTATUS_LABEL[col]}
              links={board[col]}
              color={SUBSTATUS_COLOR[col]}
              bg={SUBSTATUS_BG[col]}
              deptId={selectedDeptId}
            />
          ))}
        </div>
      )}
    </div>
  )
}
