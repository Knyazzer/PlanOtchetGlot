import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface FullStatusRow {
  id: string
  name: string
  client: string | null
  execProducer: string | null
  lineProducer: string | null
  accountManager: string | null
  date: string | null
  dateApproximate: string | null
  format: string | null
  location: string | null
  status: string
  source: string
  notes: string | null
  matrixRegistryId: string | null
  matrixRegistry: { name: string | null; matrixId: string } | null
}

interface Member {
  id: string
  project_id: string
  name: string
  position: string | null
  employment_type: string | null
  rate_plan: string | null
  group_name: string | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEPT_LIST = ['ТВ', 'Моушн', 'Постпродакшн', 'Дизайн', 'Саунд-дизайн', 'Радио', 'Не профильный']
const FORMATS   = ['ТВ', 'Радио', 'Телерадио', 'Продакшн', 'Дизайн', 'Оффлайн', 'Виртуальный', 'Менеджмент']
const LOCATIONS = ['Знаменка', 'Крыша Чёрный', 'Камин', 'Романов', 'Выезд']
const STATUS_LABELS: Record<string, string> = {
  request: 'Запрос', negotiation: 'На согласовании', connecting: 'Подключение к проекту',
  preproduction: 'Pre-production', production: 'Production', postproduction: 'Post-production',
  delivered: 'Сдан', rejected: 'Не согласован', cancelled: 'Отменён', manual: 'Ручной',
}

// ── Main component ────────────────────────────────────────────────────────────

export function TaskDetailPanel({ rowId, onClose }: { rowId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'info' | 'departments'>('info')

  // Departments tab state
  const [localGroups, setLocalGroups] = useState<string[]>([])
  const [newDeptOpen, setNewDeptOpen] = useState(false)
  const [newDeptName, setNewDeptName] = useState('')
  const [newDeptDate, setNewDeptDate] = useState('')
  const [newDeptDesc, setNewDeptDesc] = useState('')

  const { data: row, isLoading: rowLoading } = useQuery<FullStatusRow>({
    queryKey: ['task-detail', rowId],
    queryFn: () => api.get(`/status-rows/${rowId}`).then((r) => r.data),
    staleTime: 30_000,
  })

  const { data: members = [], isLoading: membersLoading } = useQuery<Member[]>({
    queryKey: ['task-members', rowId],
    queryFn: () => api.get('/project-members', { params: { projectId: rowId } }).then((r) => r.data),
    staleTime: 30_000,
    enabled: tab === 'departments',
  })

  const patchRow = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.patch(`/status-rows/${rowId}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task-detail', rowId] })
      qc.invalidateQueries({ queryKey: ['workflow-rows'] })
    },
  })

  const patchGroupSchedule = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.patch(`/status-rows/${rowId}/group-schedule`, data),
  })

  const addMember = useMutation({
    mutationFn: ({ name, groupName }: { name: string; groupName: string }) =>
      api.post('/project-members', { projectId: rowId, name, groupName }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-members', rowId] }),
  })

  const deleteMember = useMutation({
    mutationFn: (id: string) => api.delete(`/project-members/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-members', rowId] }),
  })

  // Group members by group_name
  const grouped = members.reduce<Record<string, Member[]>>((acc, m) => {
    const key = m.group_name ?? '—'
    if (!acc[key]) acc[key] = []
    acc[key].push(m)
    return acc
  }, {})

  // Departments to show: DEPT_LIST ones that have members or were locally added
  const memberGroupNames = members.map((m) => m.group_name).filter(Boolean) as string[]
  const uniqueMemberGroups = [...new Set(memberGroupNames)]
  const activeDepts = DEPT_LIST.filter(
    (g) => uniqueMemberGroups.includes(g) || localGroups.includes(g),
  )
  // Any member groups outside DEPT_LIST
  const extraDepts = uniqueMemberGroups.filter((g) => !DEPT_LIST.includes(g) && g !== '—')
  const allDepts = [...activeDepts, ...extraDepts]
  const availableDepts = DEPT_LIST.filter((g) => !allDepts.includes(g))

  const handleCreateDept = () => {
    if (!newDeptName) return
    patchGroupSchedule.mutate({
      [newDeptName]: { date: newDeptDate || null, notes: newDeptDesc || null },
    })
    setLocalGroups((prev) => [...prev, newDeptName])
    setNewDeptOpen(false)
    setNewDeptName('')
    setNewDeptDate('')
    setNewDeptDesc('')
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 400,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(15,23,42,0.4)',
      }}
      onMouseDown={onClose}
    >
      <div
        style={{
          background: '#fff', borderRadius: 14,
          width: 640, maxWidth: '92vw', maxHeight: '88vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.28)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ background: '#1e293b', padding: '16px 20px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {row && (
                <span style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                  background: '#334155', color: '#94a3b8',
                }}>
                  {STATUS_LABELS[row.status] ?? row.status}
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '2px 6px', marginTop: -2 }}
            >
              ×
            </button>
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#fff', lineHeight: 1.3, marginBottom: 4 }}>
            {rowLoading ? '...' : (row?.name || 'Без названия')}
          </div>
          {row?.client && <div style={{ fontSize: 13, color: '#94a3b8' }}>{row.client}</div>}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', flexShrink: 0 }}>
          {(['info', 'departments'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: tab === t ? 700 : 400,
                color: tab === t ? '#1e293b' : '#64748b',
                borderBottom: tab === t ? '2px solid #2563eb' : '2px solid transparent',
              }}
            >
              {t === 'info' ? 'Инфо' : 'Отделы'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {tab === 'info' && (
            <InfoTab row={row ?? null} isLoading={rowLoading} onPatch={(data) => patchRow.mutate(data)} />
          )}

          {tab === 'departments' && (
            <div style={{ padding: '16px 20px' }}>
              {membersLoading ? (
                <div style={{ color: '#94a3b8', fontSize: 13, padding: '20px 0' }}>Загрузка...</div>
              ) : (
                <>
                  {allDepts.length === 0 && (
                    <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>
                      Отделов пока нет.
                    </div>
                  )}

                  {allDepts.map((deptName) => (
                    <DepartmentBlock
                      key={deptName}
                      groupName={deptName}
                      members={grouped[deptName] ?? []}
                      onAddMember={(name) => addMember.mutate({ name, groupName: deptName })}
                      onDeleteMember={(id) => deleteMember.mutate(id)}
                    />
                  ))}

                  {/* Members without group */}
                  {(grouped['—']?.length ?? 0) > 0 && (
                    <DepartmentBlock
                      groupName="Без группы"
                      members={grouped['—']}
                      onAddMember={(name) => addMember.mutate({ name, groupName: '—' })}
                      onDeleteMember={(id) => deleteMember.mutate(id)}
                    />
                  )}

                  {/* Add department */}
                  {!newDeptOpen ? (
                    <button
                      onClick={() => setNewDeptOpen(true)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, marginTop: 12,
                        border: '1px dashed #cbd5e1', borderRadius: 8, background: 'none',
                        padding: '8px 14px', color: '#64748b', fontSize: 13, cursor: 'pointer', width: '100%',
                      }}
                    >
                      + Новый отдел
                    </button>
                  ) : (
                    <div style={{
                      marginTop: 12, border: '1px solid #e2e8f0', borderRadius: 10, padding: 16,
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 14 }}>
                        Новый отдел
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div>
                          <label style={labelStyle}>ОТДЕЛ</label>
                          <select
                            value={newDeptName}
                            onChange={(e) => setNewDeptName(e.target.value)}
                            style={fieldStyle}
                          >
                            <option value="">— выберите отдел —</option>
                            {availableDepts.map((d) => (
                              <option key={d} value={d}>{d}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label style={labelStyle}>ДАТА</label>
                          <input
                            type="date"
                            value={newDeptDate}
                            onChange={(e) => setNewDeptDate(e.target.value)}
                            style={fieldStyle}
                          />
                        </div>

                        <div>
                          <label style={labelStyle}>ОПИСАНИЕ</label>
                          <input
                            value={newDeptDesc}
                            onChange={(e) => setNewDeptDesc(e.target.value)}
                            placeholder="Краткое описание..."
                            style={fieldStyle}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => {
                            setNewDeptOpen(false)
                            setNewDeptName('')
                            setNewDeptDate('')
                            setNewDeptDesc('')
                          }}
                          style={{
                            padding: '7px 14px', borderRadius: 7, border: '1px solid #e2e8f0',
                            background: '#f8fafc', color: '#64748b', fontSize: 13, cursor: 'pointer',
                          }}
                        >
                          Отмена
                        </button>
                        <button
                          onClick={handleCreateDept}
                          disabled={!newDeptName}
                          style={{
                            padding: '7px 16px', borderRadius: 7, border: 'none',
                            background: newDeptName ? '#2563eb' : '#e2e8f0',
                            color: newDeptName ? '#fff' : '#94a3b8',
                            fontSize: 13, fontWeight: 600, cursor: newDeptName ? 'pointer' : 'default',
                          }}
                        >
                          Создать
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── InfoTab ───────────────────────────────────────────────────────────────────

function InfoTab({ row, isLoading, onPatch }: {
  row: FullStatusRow | null
  isLoading: boolean
  onPatch: (data: Record<string, unknown>) => void
}) {
  if (isLoading) return <div style={{ padding: 24, color: '#94a3b8', fontSize: 13 }}>Загрузка...</div>
  if (!row) return <div style={{ padding: 24, color: '#ef4444', fontSize: 13 }}>Не найдено</div>

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 0 }}>
      <InfoField label="Клиент">
        <input
          defaultValue={row.client ?? ''}
          onBlur={(e) => { if (e.target.value !== (row.client ?? '')) onPatch({ client: e.target.value || null }) }}
          placeholder="—"
          style={inputStyle}
        />
      </InfoField>

      <InfoField label="Название задачи">
        <input
          defaultValue={row.name}
          onBlur={(e) => { if (e.target.value !== row.name) onPatch({ name: e.target.value }) }}
          placeholder="Название..."
          style={inputStyle}
        />
      </InfoField>

      <InfoField label="Исп. продюсер">
        <input
          defaultValue={row.execProducer ?? ''}
          onBlur={(e) => { if (e.target.value !== (row.execProducer ?? '')) onPatch({ execProducer: e.target.value || null }) }}
          placeholder="—"
          style={inputStyle}
        />
      </InfoField>

      <InfoField label="Лин. продюсер">
        <input
          defaultValue={row.lineProducer ?? ''}
          onBlur={(e) => { if (e.target.value !== (row.lineProducer ?? '')) onPatch({ lineProducer: e.target.value || null }) }}
          placeholder="—"
          style={inputStyle}
        />
      </InfoField>

      <InfoField label="Аккаунт менеджер">
        <input
          defaultValue={row.accountManager ?? ''}
          onBlur={(e) => { if (e.target.value !== (row.accountManager ?? '')) onPatch({ accountManager: e.target.value || null }) }}
          placeholder="—"
          style={inputStyle}
        />
      </InfoField>

      <InfoField label="Дата (приблиз.)">
        <input
          defaultValue={row.dateApproximate ?? ''}
          onBlur={(e) => { if (e.target.value !== (row.dateApproximate ?? '')) onPatch({ dateApproximate: e.target.value || null }) }}
          placeholder="апрель / 28 мая / 14-20 мая"
          style={inputStyle}
        />
      </InfoField>

      <InfoField label="Формат">
        <select
          defaultValue={row.format ?? ''}
          onChange={(e) => onPatch({ format: e.target.value || null })}
          style={inputStyle}
        >
          <option value="">—</option>
          {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </InfoField>

      <InfoField label="Локация">
        <select
          defaultValue={row.location ?? ''}
          onChange={(e) => onPatch({ location: e.target.value || null })}
          style={inputStyle}
        >
          <option value="">—</option>
          {LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </InfoField>

      <InfoField label="Проект">
        {row.matrixRegistry ? (
          <span style={{ fontSize: 13, color: '#16a34a', fontWeight: 500 }}>
            ✓ {row.matrixRegistry.name || row.matrixRegistry.matrixId}
          </span>
        ) : (
          <span style={{ fontSize: 13, color: '#94a3b8' }}>Не привязан</span>
        )}
      </InfoField>

      <InfoField label="Заметки">
        <textarea
          defaultValue={row.notes ?? ''}
          onBlur={(e) => { if (e.target.value !== (row.notes ?? '')) onPatch({ notes: e.target.value || null }) }}
          placeholder="—"
          rows={3}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
        />
      </InfoField>
    </div>
  )
}

function InfoField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      {children}
    </div>
  )
}

// ── DepartmentBlock ───────────────────────────────────────────────────────────

function DepartmentBlock({ groupName, members, onAddMember, onDeleteMember }: {
  groupName: string
  members: Member[]
  onAddMember: (name: string) => void
  onDeleteMember: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const [addingMember, setAddingMember] = useState(false)
  const [memberName, setMemberName] = useState('')

  const submitMember = () => {
    const trimmed = memberName.trim()
    if (!trimmed) return
    onAddMember(trimmed)
    setMemberName('')
    setAddingMember(false)
  }

  return (
    <div style={{ marginBottom: 10, border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', background: '#f8fafc', cursor: 'pointer',
          borderBottom: expanded ? '1px solid #e2e8f0' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 12, color: '#94a3b8', display: 'inline-block',
            transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform .15s',
          }}>▶</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{groupName}</span>
          <span style={{ fontSize: 11, background: '#e2e8f0', color: '#64748b', borderRadius: 10, padding: '1px 7px' }}>
            {members.length}
          </span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); setAddingMember(true); setExpanded(true) }}
          style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 12, cursor: 'pointer', padding: '2px 6px' }}
        >
          + участник
        </button>
      </div>

      {expanded && (
        <div>
          {members.length === 0 && !addingMember ? (
            <div style={{ padding: '10px 14px', fontSize: 12, color: '#94a3b8' }}>Нет участников</div>
          ) : (
            members.map((m) => (
              <div
                key={m.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '7px 14px', borderBottom: '1px solid #f8fafc',
                }}
              >
                <div>
                  <div style={{ fontSize: 13, color: '#1e293b' }}>{m.name}</div>
                  {m.position && <div style={{ fontSize: 11, color: '#94a3b8' }}>{m.position}</div>}
                </div>
                <button
                  onClick={() => onDeleteMember(m.id)}
                  style={{ background: 'none', border: 'none', color: '#e2e8f0', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '2px 4px' }}
                  onMouseOver={(e) => (e.currentTarget.style.color = '#ef4444')}
                  onMouseOut={(e) => (e.currentTarget.style.color = '#e2e8f0')}
                  title="Удалить участника"
                >
                  ×
                </button>
              </div>
            ))
          )}

          {addingMember && (
            <div style={{
              padding: '8px 14px', display: 'flex', gap: 8, alignItems: 'center',
              background: '#f8fafc', borderTop: members.length > 0 ? '1px solid #f1f5f9' : 'none',
            }}>
              <input
                autoFocus
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitMember()
                  if (e.key === 'Escape') { setAddingMember(false); setMemberName('') }
                }}
                placeholder="ФИО участника..."
                style={{ flex: 1, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none' }}
              />
              <button
                onClick={submitMember}
                disabled={!memberName.trim()}
                style={{
                  padding: '6px 12px', borderRadius: 6, background: '#2563eb', color: '#fff',
                  border: 'none', fontSize: 13, cursor: 'pointer', fontWeight: 600, flexShrink: 0,
                }}
              >
                Добавить
              </button>
              <button
                onClick={() => { setAddingMember(false); setMemberName('') }}
                style={{
                  padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0',
                  background: '#fff', color: '#64748b', fontSize: 13, cursor: 'pointer', flexShrink: 0,
                }}
              >
                Отмена
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Style constants ───────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 0', border: 'none', borderBottom: '1px solid transparent',
  fontSize: 13, fontFamily: 'inherit', color: '#1e293b', background: 'transparent',
  outline: 'none', boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5,
}

const fieldStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 7,
  fontSize: 13, fontFamily: 'inherit', color: '#1e293b', background: '#fff',
  outline: 'none', boxSizing: 'border-box',
}
