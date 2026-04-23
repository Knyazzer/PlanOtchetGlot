import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { InternalShiftsPanel } from './InternalShiftsPanel'

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

interface DeptRow {
  id: string
  name: string
  format: string | null
  status: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const EARLY_STAGES = ['request', 'negotiation', 'connecting']

const FORMATS   = ['ТВ', 'Радио', 'Телерадио', 'Продакшн', 'Дизайн', 'Оффлайн', 'Виртуальный', 'Менеджмент']
const LOCATIONS = ['Знаменка крыша', 'Знаменка чёрная', 'Знаменка камин', 'Романов', 'Выезд']

const DEPARTMENTS         = ['ТВ', 'Моушн', 'Постпродакшн', 'Дизайн', 'Саунд-дизайн', 'Радио', 'Не профильный']
const TV_FORMATS          = ['Трансляция', 'Телерадио', 'Съемки']
const FORMATS_WITH_LOCATION = ['Трансляция', 'Телерадио', 'Съемки']

const STATUS_LABELS: Record<string, string> = {
  request: 'Запрос', negotiation: 'На согласовании', connecting: 'Подключение к проекту',
  preproduction: 'Pre-production', production: 'Production', postproduction: 'Post-production',
  delivered: 'Сдан', rejected: 'Не согласован', cancelled: 'Отменён', manual: 'Ручной',
}

// ── Main component ────────────────────────────────────────────────────────────

export function TaskDetailPanel({ rowId, onClose }: { rowId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [notes, setNotes] = useState('')

  const { data: row, isLoading: rowLoading } = useQuery<FullStatusRow>({
    queryKey: ['task-detail', rowId],
    queryFn: () => api.get(`/status-rows/${rowId}`).then((r) => r.data),
    staleTime: 30_000,
  })

  useEffect(() => {
    if (row) setNotes(row.notes ?? '')
  }, [row?.notes])

  const isEarlyStage = !row || EARLY_STAGES.includes(row.status)

  const patchRow = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.patch(`/status-rows/${rowId}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task-detail', rowId] })
      qc.invalidateQueries({ queryKey: ['workflow-rows'] })
    },
  })

  const deleteRow = useMutation({
    mutationFn: () => api.delete(`/status-rows/${rowId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow-rows'] })
      onClose()
    },
  })

  const saveNotes = (value: string) => {
    if (value !== (row?.notes ?? '')) patchRow.mutate({ notes: value || null })
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.4)' }}
      onMouseDown={onClose}
    >
      <div
        style={{
          background: '#fff', borderRadius: 14,
          width: isEarlyStage ? 860 : 1300, maxWidth: '96vw', maxHeight: '88vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.28)',
          transition: 'width .2s ease',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ background: '#1e293b', padding: '14px 20px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            {row && (
              <span style={{ fontSize: 11, padding: '2px 9px', borderRadius: 10, fontWeight: 600, background: '#334155', color: '#94a3b8', flexShrink: 0 }}>
                {STATUS_LABELS[row.status] ?? row.status}
              </span>
            )}
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {rowLoading ? '...' : (row?.name || 'Без названия')}
            </div>
            {row?.client && (
              <div style={{ fontSize: 13, color: '#94a3b8', flexShrink: 0 }}>{row.client}</div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button
              onClick={() => { if (window.confirm('Удалить задачу?')) deleteRow.mutate() }}
              disabled={deleteRow.isPending}
              style={{ background: 'none', border: '1px solid #ef4444', borderRadius: 6, color: '#ef4444', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '3px 10px' }}
              onMouseOver={(e) => { e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.color = '#fff' }}
              onMouseOut={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#ef4444' }}
            >
              Удалить
            </button>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: '0 4px' }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Body — two columns always visible */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Left: task info + notes */}
          <div style={{ width: 340, flexShrink: 0, borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <InfoPanel row={row ?? null} isLoading={rowLoading} onPatch={(data) => patchRow.mutate(data)} />
            </div>
            <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', flexShrink: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Заметки</div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; saveNotes(e.target.value) }}
                onFocus={(e) => (e.target.style.borderColor = '#93c5fd')}
                placeholder="Добавьте заметки..."
                style={{ width: '100%', height: 90, resize: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', color: '#1e293b', background: '#fff', outline: 'none', lineHeight: 1.5, boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* Right: dept panel — early = chips+form, production = full InternalShiftsPanel */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {isEarlyStage ? (
              <EarlyDeptsPanel taskId={rowId} />
            ) : (
              <InternalShiftsPanel
                matrixRegistryId={row?.matrixRegistryId ?? undefined}
                parentTaskId={rowId}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── InfoPanel ─────────────────────────────────────────────────────────────────

function InfoPanel({ row, isLoading, onPatch }: {
  row: FullStatusRow | null
  isLoading: boolean
  onPatch: (data: Record<string, unknown>) => void
}) {
  if (isLoading) return <div style={{ padding: 24, color: '#94a3b8', fontSize: 13 }}>Загрузка...</div>
  if (!row) return <div style={{ padding: 24, color: '#ef4444', fontSize: 13 }}>Не найдено</div>

  return (
    <div style={{ padding: '12px 16px 4px', display: 'flex', flexDirection: 'column' }}>
      <Field label="Клиент">
        <input
          defaultValue={row.client ?? ''}
          onBlur={(e) => { if (e.target.value !== (row.client ?? '')) onPatch({ client: e.target.value || null }) }}
          placeholder="—" style={iS}
        />
      </Field>
      <Field label="Название задачи">
        <input
          defaultValue={row.name}
          onBlur={(e) => { if (e.target.value !== row.name) onPatch({ name: e.target.value }) }}
          placeholder="Название..." style={iS}
        />
      </Field>
      <Field label="Исп. продюсер">
        <input
          defaultValue={row.execProducer ?? ''}
          onBlur={(e) => { if (e.target.value !== (row.execProducer ?? '')) onPatch({ execProducer: e.target.value || null }) }}
          placeholder="—" style={iS}
        />
      </Field>
      <Field label="Лайн-продюсер">
        <input
          defaultValue={row.lineProducer ?? ''}
          onBlur={(e) => { if (e.target.value !== (row.lineProducer ?? '')) onPatch({ lineProducer: e.target.value || null }) }}
          placeholder="—" style={iS}
        />
      </Field>
      <Field label="Аккаунт менеджер">
        <input
          defaultValue={row.accountManager ?? ''}
          onBlur={(e) => { if (e.target.value !== (row.accountManager ?? '')) onPatch({ accountManager: e.target.value || null }) }}
          placeholder="—" style={iS}
        />
      </Field>
      <Field label="Дата">
        <input
          defaultValue={row.dateApproximate ?? ''}
          onBlur={(e) => { if (e.target.value !== (row.dateApproximate ?? '')) onPatch({ dateApproximate: e.target.value || null }) }}
          placeholder="апрель / 28 мая / 14-20 мая" style={iS}
        />
      </Field>
      <Field label="Формат">
        <select defaultValue={row.format ?? ''} onChange={(e) => onPatch({ format: e.target.value || null })} style={iS}>
          <option value="">—</option>
          {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </Field>
      <Field label="Локация">
        <select defaultValue={row.location ?? ''} onChange={(e) => onPatch({ location: e.target.value || null })} style={iS}>
          <option value="">—</option>
          {LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </Field>
      <Field label="Проект">
        {row.matrixRegistry ? (
          <span style={{ fontSize: 13, color: '#16a34a', fontWeight: 500 }}>
            ✓ {row.matrixRegistry.name || row.matrixRegistry.matrixId}
          </span>
        ) : (
          <span style={{ fontSize: 13, color: '#94a3b8' }}>Не привязан</span>
        )}
      </Field>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '9px 0', borderBottom: '1px solid #f1f5f9' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      {children}
    </div>
  )
}

const iS: React.CSSProperties = {
  width: '100%', padding: '2px 0', border: 'none', fontSize: 13,
  fontFamily: 'inherit', color: '#1e293b', background: 'transparent',
  outline: 'none', boxSizing: 'border-box',
}

// ── EarlyDeptsPanel ───────────────────────────────────────────────────────────

function EarlyDeptsPanel({ taskId }: { taskId: string }) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)

  const { data: depts = [], isLoading } = useQuery<DeptRow[]>({
    queryKey: ['task-depts', taskId],
    queryFn: () => api.get('/status-rows', { params: { parentTaskId: taskId } }).then((r) => r.data),
    staleTime: 30_000,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['task-depts', taskId] })
    qc.invalidateQueries({ queryKey: ['workflow-children', taskId] })
  }

  const deleteDept = useMutation({
    mutationFn: (id: string) => api.delete(`/status-rows/${id}`),
    onSuccess: invalidate,
  })

  const deptLabel = (d: DeptRow) => d.format || d.name || '—'

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Отделы</div>

      {isLoading && <div style={{ color: '#94a3b8', fontSize: 13 }}>Загрузка...</div>}

      {!isLoading && depts.length === 0 && !showForm && (
        <div style={{ fontSize: 13, color: '#94a3b8' }}>Отделов пока нет.</div>
      )}

      {depts.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {depts.map((d) => (
            <div key={d.id} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '5px 10px 5px 14px', borderRadius: 20,
              background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8',
              fontSize: 13, fontWeight: 500,
            }}>
              <span>{deptLabel(d)}</span>
              <button
                onClick={() => deleteDept.mutate(d.id)}
                disabled={deleteDept.isPending}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#93c5fd', fontSize: 15, lineHeight: 1, padding: '0 2px', borderRadius: '50%' }}
                onMouseOver={(e) => (e.currentTarget.style.color = '#1d4ed8')}
                onMouseOut={(e) => (e.currentTarget.style.color = '#93c5fd')}
              >×</button>
            </div>
          ))}
        </div>
      )}

      {showForm ? (
        <AddDeptForm
          taskId={taskId}
          onCreated={() => { invalidate(); setShowForm(false) }}
          onCancel={() => setShowForm(false)}
        />
      ) : (
        <button
          onClick={() => setShowForm(true)}
          style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px dashed #bfdbfe', background: 'none', color: '#2563eb', fontSize: 13, cursor: 'pointer' }}
          onMouseOver={(e) => (e.currentTarget.style.background = '#eff6ff')}
          onMouseOut={(e) => (e.currentTarget.style.background = 'none')}
        >
          <span style={{ fontSize: 17, lineHeight: 1, fontWeight: 300 }}>+</span>
          <span>Добавить отдел</span>
        </button>
      )}
    </div>
  )
}

// ── AddDeptForm ───────────────────────────────────────────────────────────────

function AddDeptForm({ taskId, onCreated, onCancel }: {
  taskId: string
  onCreated: () => void
  onCancel: () => void
}) {
  const [dept, setDept] = useState('')
  const [tvFormat, setTvFormat] = useState('')
  const [location, setLocation] = useState('')

  const isTv = dept === 'ТВ'
  const resolvedFormat = isTv ? tvFormat : dept
  const showLocation = FORMATS_WITH_LOCATION.includes(resolvedFormat)
  const canCreate = dept.trim() !== '' && (!isTv || tvFormat.trim() !== '') && (!showLocation || location.trim() !== '')

  const create = useMutation({
    mutationFn: () => api.post('/status-rows', {
      name: resolvedFormat || dept || 'Без названия',
      format: resolvedFormat || null,
      location: showLocation ? (location || null) : null,
      parentTaskId: taskId,
      status: 'request',
    }).then((r) => r.data),
    onSuccess: onCreated,
  })

  const sS: React.CSSProperties = { fontSize: 13, padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, color: '#1e293b', background: '#fff', width: '100%', boxSizing: 'border-box' }
  const lS: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4, display: 'block' }

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 12 }}>Новый отдел</div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <span style={lS}>Отдел</span>
          <select value={dept} onChange={(e) => { setDept(e.target.value); setTvFormat(''); setLocation('') }} style={sS} autoFocus>
            <option value="">— не выбрано —</option>
            {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        {isTv && (
          <div style={{ flex: 1 }}>
            <span style={lS}>Формат</span>
            <select value={tvFormat} onChange={(e) => { setTvFormat(e.target.value); setLocation('') }} style={sS}>
              <option value="">— не выбрано —</option>
              {TV_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        )}
        {showLocation && (
          <div style={{ flex: 1 }}>
            <span style={lS}>Локация</span>
            <select value={location} onChange={(e) => setLocation(e.target.value)} style={sS}>
              <option value="">— не выбрано —</option>
              {LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{ fontSize: 13, padding: '7px 14px', borderRadius: 7, border: '1px solid #e2e8f0', background: 'none', color: '#475569', cursor: 'pointer' }}>Отмена</button>
        <button
          onClick={() => { if (canCreate) create.mutate() }}
          disabled={!canCreate || create.isPending}
          style={{ fontSize: 13, padding: '7px 18px', borderRadius: 7, border: 'none', background: !canCreate ? '#93c5fd' : '#2563eb', color: '#fff', cursor: canCreate ? 'pointer' : 'default', fontWeight: 500 }}
        >
          {create.isPending ? 'Создание...' : 'Создать'}
        </button>
      </div>
      {create.isError && <div style={{ marginTop: 8, fontSize: 12, color: '#ef4444' }}>Ошибка: не удалось создать</div>}
    </div>
  )
}
