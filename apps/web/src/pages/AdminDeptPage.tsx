import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

type DeptType = 'production' | 'support' | 'internal'

type User = {
  id: string
  fullName: string
  email: string
  tabNumber: string | null
}

type DeptMember = {
  userId: string
  deptId: string
  isHead: boolean
  user: User
}

type Department = {
  id: string
  name: string
  type: DeptType
  parentId: string | null
  parent: { id: string; name: string } | null
  children: { id: string; name: string; type: DeptType }[]
  _count: { members: number; wiLinks: number }
}

type DeptDetail = Department & { members: DeptMember[] }

const TYPE_LABEL: Record<DeptType, string> = {
  production: 'Производство',
  support:    'Поддержка',
  internal:   'Внутренний',
}

const TYPE_COLOR: Record<DeptType, string> = {
  production: '#2563eb',
  support:    '#7c3aed',
  internal:   '#64748b',
}

function DeptForm({
  initial,
  departments,
  onSave,
  onCancel,
}: {
  initial?: Partial<Department>
  departments: Department[]
  onSave: (data: { name: string; type: DeptType; parentId: string | null }) => void
  onCancel: () => void
}) {
  const [name, setName]       = useState(initial?.name ?? '')
  const [type, setType]       = useState<DeptType>(initial?.type ?? 'production')
  const [parentId, setParentId] = useState<string>(initial?.parentId ?? '')

  return (
    <div style={{
      background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8,
      padding: '16px 20px', marginBottom: 16,
    }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ flex: '2 1 180px' }}>
          <label style={{ fontSize: 12, color: '#475569', display: 'block', marginBottom: 4 }}>
            Название *
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Название отдела"
            style={{
              width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0',
              borderRadius: 6, fontSize: 14, boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ flex: '1 1 140px' }}>
          <label style={{ fontSize: 12, color: '#475569', display: 'block', marginBottom: 4 }}>Тип</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as DeptType)}
            style={{
              width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0',
              borderRadius: 6, fontSize: 14,
            }}
          >
            <option value="production">Производство</option>
            <option value="support">Поддержка</option>
            <option value="internal">Внутренний</option>
          </select>
        </div>

        <div style={{ flex: '1 1 160px' }}>
          <label style={{ fontSize: 12, color: '#475569', display: 'block', marginBottom: 4 }}>
            Родительский отдел
          </label>
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            style={{
              width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0',
              borderRadius: 6, fontSize: 14,
            }}
          >
            <option value="">— Нет —</option>
            {departments
              .filter((d) => d.id !== initial?.id)
              .map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => onSave({ name: name.trim(), type, parentId: parentId || null })}
          disabled={!name.trim()}
          style={{
            padding: '7px 16px', border: 'none', borderRadius: 6,
            background: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: 13,
          }}
        >
          Сохранить
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: '7px 16px', border: '1px solid #e2e8f0', borderRadius: 6,
            background: '#fff', cursor: 'pointer', fontSize: 13, color: '#475569',
          }}
        >
          Отмена
        </button>
      </div>
    </div>
  )
}

function MemberPanel({ dept, allUsers }: { dept: DeptDetail; allUsers: User[] }) {
  const qc = useQueryClient()
  const [addUserId, setAddUserId] = useState('')
  const [isHead, setIsHead]       = useState(false)

  const addMember = useMutation({
    mutationFn: ({ userId, isHead }: { userId: string; isHead: boolean }) =>
      api.post(`/departments/${dept.id}/members`, { userId, isHead }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dept-detail', dept.id] })
      setAddUserId('')
      setIsHead(false)
    },
  })

  const removeMember = useMutation({
    mutationFn: (userId: string) =>
      api.delete(`/departments/${dept.id}/members/${userId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dept-detail', dept.id] }),
  })

  const memberIds = new Set(dept.members.map((m) => m.userId))
  const available = allUsers.filter((u) => !memberIds.has(u.id))

  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 13, color: '#475569', marginBottom: 8 }}>
        Участники ({dept.members.length})
      </div>

      {dept.members.map((m) => (
        <div key={m.userId} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
          borderBottom: '1px solid #f1f5f9',
        }}>
          <span style={{
            fontSize: 13, flex: 1, color: '#1e293b',
          }}>
            {m.user.fullName}
            {m.isHead && (
              <span style={{
                marginLeft: 6, fontSize: 11, color: '#d97706',
                background: '#fef3c7', padding: '1px 6px', borderRadius: 10,
              }}>
                Руководитель
              </span>
            )}
          </span>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>{m.user.email}</span>
          <button
            onClick={() => removeMember.mutate(m.userId)}
            disabled={removeMember.isPending}
            style={{
              fontSize: 12, color: '#dc2626', background: 'none', border: 'none',
              cursor: 'pointer', padding: '2px 6px',
            }}
          >
            Удалить
          </button>
        </div>
      ))}

      {available.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={addUserId}
            onChange={(e) => setAddUserId(e.target.value)}
            style={{
              flex: '1 1 180px', padding: '6px 10px', border: '1px solid #e2e8f0',
              borderRadius: 6, fontSize: 13,
            }}
          >
            <option value="">— Выбрать сотрудника —</option>
            {available.map((u) => (
              <option key={u.id} value={u.id}>{u.fullName}</option>
            ))}
          </select>

          <label style={{ fontSize: 13, color: '#475569', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={isHead}
              onChange={(e) => setIsHead(e.target.checked)}
            />
            Руководитель
          </label>

          <button
            onClick={() => addMember.mutate({ userId: addUserId, isHead })}
            disabled={!addUserId || addMember.isPending}
            style={{
              padding: '6px 14px', border: 'none', borderRadius: 6,
              background: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: 13,
            }}
          >
            Добавить
          </button>
        </div>
      )}
    </div>
  )
}

function DeptCard({
  dept,
  departments,
  allUsers,
}: {
  dept: Department
  departments: Department[]
  allUsers: User[]
}) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing]   = useState(false)

  const { data: detail } = useQuery<DeptDetail>({
    queryKey: ['dept-detail', dept.id],
    queryFn: () => api.get(`/departments/${dept.id}`).then((r) => r.data),
    enabled: expanded,
  })

  const updateDept = useMutation({
    mutationFn: (data: { name: string; type: DeptType; parentId: string | null }) =>
      api.patch(`/departments/${dept.id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departments'] })
      setEditing(false)
    },
  })

  const deleteDept = useMutation({
    mutationFn: () => api.delete(`/departments/${dept.id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['departments'] }),
  })

  return (
    <div style={{
      border: '1px solid #e2e8f0', borderRadius: 10,
      background: '#fff', marginBottom: 8, overflow: 'hidden',
    }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
          cursor: 'pointer', userSelect: 'none',
        }}
        onClick={() => !editing && setExpanded((v) => !v)}
      >
        <span style={{ fontSize: 16, transform: expanded ? 'rotate(90deg)' : 'none', transition: '0.15s' }}>▶</span>
        <span style={{ fontWeight: 600, fontSize: 15, color: '#1e293b', flex: 1 }}>{dept.name}</span>

        <span style={{
          fontSize: 11, padding: '2px 8px', borderRadius: 10,
          background: TYPE_COLOR[dept.type] + '15',
          color: TYPE_COLOR[dept.type], fontWeight: 500,
        }}>
          {TYPE_LABEL[dept.type]}
        </span>

        {dept.parent && (
          <span style={{ fontSize: 12, color: '#94a3b8' }}>в {dept.parent.name}</span>
        )}

        <span style={{ fontSize: 12, color: '#64748b' }}>
          {dept._count.members} чел · {dept._count.wiLinks} проектов
        </span>

        <button
          onClick={(e) => { e.stopPropagation(); setEditing((v) => !v) }}
          style={{
            fontSize: 12, padding: '3px 10px', border: '1px solid #e2e8f0',
            borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#475569',
          }}
        >
          {editing ? 'Отмена' : 'Изменить'}
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation()
            if (confirm(`Удалить отдел «${dept.name}»? Все привязки к проектам будут удалены.`)) {
              deleteDept.mutate()
            }
          }}
          style={{
            fontSize: 12, padding: '3px 10px', border: '1px solid #fecaca',
            borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#dc2626',
          }}
        >
          Удалить
        </button>
      </div>

      {editing && (
        <div style={{ padding: '0 16px 12px' }}>
          <DeptForm
            initial={dept}
            departments={departments}
            onSave={(data) => updateDept.mutate(data)}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}

      {expanded && !editing && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid #f1f5f9' }}>
          {dept.children.length > 0 && (
            <div style={{ marginBottom: 12, marginTop: 12 }}>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Подотделы:</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {dept.children.map((c) => (
                  <span key={c.id} style={{
                    fontSize: 12, padding: '2px 8px', background: '#f1f5f9',
                    borderRadius: 6, color: '#475569',
                  }}>{c.name}</span>
                ))}
              </div>
            </div>
          )}
          {detail ? (
            <MemberPanel dept={detail} allUsers={allUsers} />
          ) : (
            <div style={{ fontSize: 13, color: '#94a3b8' }}>Загрузка...</div>
          )}
        </div>
      )}
    </div>
  )
}

export function AdminDeptPage() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [typeFilter, setTypeFilter] = useState<DeptType | ''>('')

  const { data: departments = [], isLoading } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then((r) => r.data),
  })

  const { data: allUsers = [] } = useQuery<User[]>({
    queryKey: ['users-list'],
    queryFn: () => api.get('/users').then((r) => r.data),
  })

  const createDept = useMutation({
    mutationFn: (data: { name: string; type: DeptType; parentId: string | null }) =>
      api.post('/departments', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departments'] })
      setShowCreate(false)
    },
  })

  const filtered = typeFilter
    ? departments.filter((d) => d.type === typeFilter)
    : departments

  const topLevel  = filtered.filter((d) => !d.parentId)
  const withParent = filtered.filter((d) => d.parentId)

  const grouped = [...topLevel, ...withParent]

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1e293b' }}>
          Отделы
        </h1>
        <span style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>
          {departments.length} отделов
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as DeptType | '')}
            style={{
              padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 8,
              fontSize: 13, background: '#fff', cursor: 'pointer',
            }}
          >
            <option value="">Все типы</option>
            <option value="production">Производство</option>
            <option value="support">Поддержка</option>
            <option value="internal">Внутренний</option>
          </select>

          <button
            onClick={() => setShowCreate((v) => !v)}
            style={{
              padding: '7px 16px', border: 'none', borderRadius: 8,
              background: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: 13,
              fontWeight: 600,
            }}
          >
            + Создать отдел
          </button>
        </div>
      </div>

      {showCreate && (
        <DeptForm
          departments={departments}
          onSave={(data) => createDept.mutate(data)}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {isLoading && (
        <div style={{ textAlign: 'center', color: '#64748b', padding: 40 }}>Загрузка...</div>
      )}

      {!isLoading && grouped.length === 0 && (
        <div style={{
          textAlign: 'center', color: '#94a3b8', padding: 40,
          border: '2px dashed #e2e8f0', borderRadius: 10,
        }}>
          Нет отделов
        </div>
      )}

      {grouped.map((dept) => (
        <DeptCard
          key={dept.id}
          dept={dept}
          departments={departments}
          allUsers={allUsers}
        />
      ))}
    </div>
  )
}
