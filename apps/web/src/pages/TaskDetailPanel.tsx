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

type GroupSchedule = Record<string, { date: string | null; notes: string | null } | null>

// ── Constants ─────────────────────────────────────────────────────────────────

const DEPT_LIST = ['ТВ', 'Моушн', 'Постпродакшн', 'Дизайн', 'Саунд-дизайн', 'Радио', 'Не профильный']

// Sub-types for departments that have format variants
const DEPT_SUB_TYPES: Record<string, string[]> = {
  'ТВ': ['Съёмка', 'Трансляция', 'Телерадио'],
}

const FORMATS   = ['ТВ', 'Радио', 'Телерадио', 'Продакшн', 'Дизайн', 'Оффлайн', 'Виртуальный', 'Менеджмент']
const LOCATIONS = ['Знаменка', 'Крыша Чёрный', 'Камин', 'Романов', 'Выезд']
const STATUS_LABELS: Record<string, string> = {
  request: 'Запрос', negotiation: 'На согласовании', connecting: 'Подключение к проекту',
  preproduction: 'Pre-production', production: 'Production', postproduction: 'Post-production',
  delivered: 'Сдан', rejected: 'Не согласован', cancelled: 'Отменён', manual: 'Ручной',
}

// ── Main component ────────────────────────────────────────────────────────────

export function TaskDetailPanel({
  rowId,
  onClose,
  defaultTab = 'info',
}: {
  rowId: string
  onClose: () => void
  defaultTab?: 'info' | 'departments'
}) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'info' | 'departments'>(defaultTab)

  // "Новый отдел" form state
  const [newDeptOpen, setNewDeptOpen] = useState(false)
  const [newDeptBase, setNewDeptBase] = useState('')
  const [newDeptSub, setNewDeptSub] = useState('')
  const [newDeptDate, setNewDeptDate] = useState('')
  const [newDeptDesc, setNewDeptDesc] = useState('')

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: row, isLoading: rowLoading } = useQuery<FullStatusRow>({
    queryKey: ['task-detail', rowId],
    queryFn: () => api.get(`/status-rows/${rowId}`).then((r) => r.data),
    staleTime: 30_000,
  })

  const { data: groupSchedule = {}, isLoading: gsLoading } = useQuery<GroupSchedule>({
    queryKey: ['group-schedule', rowId],
    queryFn: () => api.get(`/status-rows/${rowId}/group-schedule`).then((r) => r.data),
    staleTime: 30_000,
    enabled: tab === 'departments',
  })

  // ── Mutations ──────────────────────────────────────────────────────────────

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['group-schedule', rowId] })
      qc.invalidateQueries({ queryKey: ['workflow-rows'] })
    },
  })

  // ── Derived ────────────────────────────────────────────────────────────────

  // Active depts: keys in group_schedule where value is non-null
  const activeDeptKeys = Object.entries(groupSchedule)
    .filter(([, v]) => v !== null)
    .map(([k]) => k)

  const subTypes = DEPT_SUB_TYPES[newDeptBase] ?? []
  const fullDeptName =
    newDeptBase === 'ТВ' && subTypes.length > 0
      ? newDeptSub ? `ТВ — ${newDeptSub}` : ''
      : newDeptBase

  // Available base depts: non-TV ones that aren't already active; TV is always available
  const availableDepts = DEPT_LIST.filter((d) => {
    if (d === 'ТВ') return true
    return !activeDeptKeys.includes(d)
  })

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleCreateDept = () => {
    if (!fullDeptName) return
    patchGroupSchedule.mutate({
      [fullDeptName]: { date: newDeptDate || null, notes: newDeptDesc || null },
    })
    setNewDeptOpen(false)
    setNewDeptBase('')
    setNewDeptSub('')
    setNewDeptDate('')
    setNewDeptDesc('')
  }

  const handleDeleteDept = (key: string) => {
    patchGroupSchedule.mutate({ [key]: null })
  }

  const resetNewDept = () => {
    setNewDeptOpen(false)
    setNewDeptBase('')
    setNewDeptSub('')
    setNewDeptDate('')
    setNewDeptDesc('')
  }

  // ── Render ─────────────────────────────────────────────────────────────────

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
            <InfoTab
              row={row ?? null}
              isLoading={rowLoading}
              onPatch={(data) => patchRow.mutate(data)}
            />
          )}

          {tab === 'departments' && (
            <div style={{ padding: '16px 20px' }}>
              {gsLoading ? (
                <div style={{ color: '#94a3b8', fontSize: 13, padding: '20px 0' }}>Загрузка...</div>
              ) : (
                <>
                  {/* Active department chips */}
                  {activeDeptKeys.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                      {activeDeptKeys.map((key) => (
                        <div
                          key={key}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '5px 10px 5px 14px', borderRadius: 20,
                            background: '#eff6ff', border: '1px solid #bfdbfe',
                            color: '#1d4ed8', fontSize: 13, fontWeight: 500,
                          }}
                        >
                          <span>{key}</span>
                          <button
                            onClick={() => handleDeleteDept(key)}
                            disabled={patchGroupSchedule.isPending}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              color: '#93c5fd', fontSize: 14, lineHeight: 1, padding: '0 2px',
                              borderRadius: '50%',
                            }}
                            onMouseOver={(e) => (e.currentTarget.style.color = '#1d4ed8')}
                            onMouseOut={(e) => (e.currentTarget.style.color = '#93c5fd')}
                            title="Удалить отдел"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeDeptKeys.length === 0 && !newDeptOpen && (
                    <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>
                      Отделов пока нет.
                    </div>
                  )}

                  {/* Add department */}
                  {!newDeptOpen ? (
                    <button
                      onClick={() => setNewDeptOpen(true)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        border: '1px dashed #cbd5e1', borderRadius: 8, background: 'none',
                        padding: '8px 14px', color: '#64748b', fontSize: 13, cursor: 'pointer', width: '100%',
                      }}
                    >
                      + Новый отдел
                    </button>
                  ) : (
                    <div style={{
                      border: '1px solid #e2e8f0', borderRadius: 10, padding: 16,
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 14 }}>
                        Новый отдел
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {/* ОТДЕЛ */}
                        <div>
                          <label style={labelStyle}>ОТДЕЛ</label>
                          <select
                            value={newDeptBase}
                            onChange={(e) => { setNewDeptBase(e.target.value); setNewDeptSub('') }}
                            style={fieldStyle}
                          >
                            <option value="">— выберите отдел —</option>
                            {availableDepts.map((d) => (
                              <option key={d} value={d}>{d}</option>
                            ))}
                          </select>
                        </div>

                        {/* ТИП (sub-type) — only for depts with sub-types */}
                        {subTypes.length > 0 && (
                          <div>
                            <label style={labelStyle}>ТИП</label>
                            <select
                              value={newDeptSub}
                              onChange={(e) => setNewDeptSub(e.target.value)}
                              style={fieldStyle}
                            >
                              <option value="">— выберите тип —</option>
                              {subTypes.map((s) => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* ДАТА */}
                        <div>
                          <label style={labelStyle}>ДАТА</label>
                          <input
                            type="date"
                            value={newDeptDate}
                            onChange={(e) => setNewDeptDate(e.target.value)}
                            style={fieldStyle}
                          />
                        </div>

                        {/* ОПИСАНИЕ */}
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
                          onClick={resetNewDept}
                          style={{
                            padding: '7px 14px', borderRadius: 7, border: '1px solid #e2e8f0',
                            background: '#f8fafc', color: '#64748b', fontSize: 13, cursor: 'pointer',
                          }}
                        >
                          Отмена
                        </button>
                        <button
                          onClick={handleCreateDept}
                          disabled={!fullDeptName || patchGroupSchedule.isPending}
                          style={{
                            padding: '7px 16px', borderRadius: 7, border: 'none',
                            background: fullDeptName ? '#2563eb' : '#e2e8f0',
                            color: fullDeptName ? '#fff' : '#94a3b8',
                            fontSize: 13, fontWeight: 600,
                            cursor: fullDeptName ? 'pointer' : 'default',
                          }}
                        >
                          {patchGroupSchedule.isPending ? 'Сохранение...' : 'Создать'}
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

      <InfoField label="Дата">
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
