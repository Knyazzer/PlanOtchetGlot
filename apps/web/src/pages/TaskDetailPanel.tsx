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
  linkedMatrix: { name: string | null; matrixId: string; projectName: string | null } | null
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

const STUDIO_GROUPS = ['sbor', 'montazh', 'efir', 'demontazh']
const VIEZD_GROUPS  = ['sbor', 'zavoz', 'montazh', 'efir', 'demontazh', 'vyvoz']
const DEFAULT_GROUP_TIMES: Record<string, { timeFrom: string; timeTo: string; startTime?: string }> = {
  sbor:      { timeFrom: '07:00', timeTo: '10:00' },
  zavoz:     { timeFrom: '10:00', timeTo: '11:00' },
  montazh:   { timeFrom: '11:00', timeTo: '16:00' },
  efir:      { timeFrom: '16:00', timeTo: '18:00', startTime: '16:30' },
  demontazh: { timeFrom: '18:00', timeTo: '20:00' },
  vyvoz:     { timeFrom: '20:00', timeTo: '21:00' },
}

const STATUS_LABELS: Record<string, string> = {
  request: 'Запрос', negotiation: 'На согласовании', connecting: 'Подключение к проекту',
  preproduction: 'Pre-production', production: 'Production', postproduction: 'Post-production',
  delivered: 'Сдан', rejected: 'Не согласован', cancelled: 'Отменён', manual: 'Ручной',
}

const STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  request:        { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
  negotiation:    { bg: '#fefce8', color: '#b45309', border: '#fde68a' },
  connecting:     { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  preproduction:  { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  production:     { bg: '#fdf4ff', color: '#9333ea', border: '#f3e8ff' },
  postproduction: { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
  delivered:      { bg: '#f0fdf4', color: '#166534', border: '#86efac' },
  rejected:       { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  cancelled:      { bg: '#f8fafc', color: '#94a3b8', border: '#e2e8f0' },
  manual:         { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' },
}

// ── Main component ────────────────────────────────────────────────────────────

interface KfpdData { columns: string[]; rows: string[][] }

export function TaskDetailPanel({ rowId, onClose }: { rowId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [notes, setNotes] = useState('')

  const { data: kfpdRaw } = useQuery<KfpdData>({
    queryKey: ['kfpd-preview'],
    queryFn: () => api.get('/database/preview/kfpd').then((r) => r.data),
    staleTime: 5 * 60_000,
  })
  const kfpdCol = (i: number) => kfpdRaw
    ? [...new Set(kfpdRaw.rows.map((r) => r[i] ?? '').filter(Boolean))]
    : []
  const clients   = kfpdCol(0)
  const producers = kfpdCol(2)

  const { data: row, isLoading: rowLoading } = useQuery<FullStatusRow>({
    queryKey: ['task-detail', rowId],
    queryFn: () => api.get(`/status-rows/${rowId}`).then((r) => r.data),
    staleTime: 30_000,
  })

  useEffect(() => {
    if (row) setNotes(row.notes ?? '')
  }, [row?.notes])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

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

  const notesArea = (
    <textarea
      value={notes}
      onChange={(e) => setNotes(e.target.value)}
      onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; saveNotes(e.target.value) }}
      onFocus={(e) => (e.target.style.borderColor = '#93c5fd')}
      placeholder="Добавьте описание..."
      style={{
        flex: 1, resize: 'none', border: '1px solid #e2e8f0', borderRadius: 6,
        padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', color: '#1e293b',
        background: '#fff', outline: 'none', lineHeight: 1.5, boxSizing: 'border-box',
        minHeight: 80,
      }}
    />
  )

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.4)' }}
      onMouseDown={onClose}
    >
      <div
        style={{
          background: '#f8fafc', borderRadius: 16,
          width: isEarlyStage ? 1100 : '98vw',
          maxWidth: isEarlyStage ? '98vw' : 1600,
          height: '95vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 24px 80px rgba(0,0,0,0.25)',
          transition: 'width .2s ease',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #1e293b 0%, #1e3a5f 100%)', padding: '18px 24px 12px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, overflow: 'hidden' }}>
            {row && (() => {
              const sc = STATUS_COLORS[row.status] ?? { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' }
              return (
                <span style={{ fontSize: 11, padding: '2px 9px', borderRadius: 10, fontWeight: 600, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, flexShrink: 0 }}>
                  {STATUS_LABELS[row.status] ?? row.status}
                </span>
              )
            })()}
            {!isEarlyStage && row ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 0, minWidth: 0, overflow: 'hidden' }}>
                {row.client && <span style={{ fontSize: 14, fontWeight: 500, color: '#94a3b8', flexShrink: 0 }}>{row.client}:&nbsp;</span>}
                {(row.linkedMatrix ?? row.matrixRegistry) && (
                  <span style={{ fontSize: 14, fontWeight: 500, color: '#94a3b8', flexShrink: 0 }}>
                    {(row.linkedMatrix?.projectName ?? (row.linkedMatrix ?? row.matrixRegistry)!.name ?? (row.linkedMatrix ?? row.matrixRegistry)!.matrixId)}:&nbsp;
                  </span>
                )}
                <span style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name || 'Без названия'}</span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {rowLoading ? '...' : (row?.name || 'Без названия')}
                </div>
                {row?.client && <div style={{ fontSize: 13, color: '#94a3b8', flexShrink: 0 }}>{row.client}</div>}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button
              onClick={() => { if (window.confirm('Удалить задачу?')) deleteRow.mutate() }}
              disabled={deleteRow.isPending}
              style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, color: '#fca5a5', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '5px 12px' }}
              onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.3)' }}
              onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)' }}
            >
              Удалить
            </button>
            <button
              onClick={onClose}
              style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, color: '#cbd5e1', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '3px 8px' }}
              onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)' }}
              onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Body */}
        {isEarlyStage ? (
          // Early stage: three equal columns — data | description | departments
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            <div style={{ flex: 1, borderRight: '1px solid #e2e8f0', overflowY: 'auto' }}>
              <InfoPanel row={row ?? null} isLoading={rowLoading} onPatch={(data) => patchRow.mutate(data)} isEarlyStage={isEarlyStage} clients={clients} producers={producers} onOpenMatrix={row?.matrixRegistryId ? () => { sessionStorage.setItem('open-matrix-id', row.matrixRegistryId!); sessionStorage.setItem('open-matrix-project-id', rowId); window.dispatchEvent(new CustomEvent('tvshifts:navigate', { detail: { page: 'syncdata' } })) } : undefined} />
            </div>
            <div style={{ flex: 1, borderRight: '1px solid #e2e8f0', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>Описание задачи</div>
              {notesArea}
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <EarlyDeptsPanel taskId={rowId} />
            </div>
          </div>
        ) : (
          // Production stage: left (info compact + description) | right (InternalShiftsPanel)
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Left: info (top half) + description (fills rest) */}
            <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ flexShrink: 0 }}>
                <InfoPanel row={row ?? null} isLoading={rowLoading} onPatch={(data) => patchRow.mutate(data)} isEarlyStage={isEarlyStage} clients={clients} producers={producers} onOpenMatrix={row?.matrixRegistryId ? () => { sessionStorage.setItem('open-matrix-id', row.matrixRegistryId!); sessionStorage.setItem('open-matrix-project-id', rowId); window.dispatchEvent(new CustomEvent('tvshifts:navigate', { detail: { page: 'syncdata' } })) } : undefined} />
              </div>
              <div style={{ flex: 1, padding: '12px 16px', borderTop: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>Описание задачи</div>
                {notesArea}
              </div>
            </div>
            {/* Right: department planner */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <InternalShiftsPanel
                matrixRegistryId={row?.matrixRegistryId ?? undefined}
                parentTaskId={rowId}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── InfoPanel ─────────────────────────────────────────────────────────────────

function InfoPanel({ row, isLoading, onPatch, isEarlyStage, clients, producers, onOpenMatrix }: {
  row: FullStatusRow | null
  isLoading: boolean
  onPatch: (data: Record<string, unknown>) => void
  isEarlyStage?: boolean
  clients: string[]
  producers: string[]
  onOpenMatrix?: () => void
}) {
  if (isLoading) return <div style={{ padding: 24, color: '#94a3b8', fontSize: 13 }}>Загрузка...</div>
  if (!row) return <div style={{ padding: 24, color: '#ef4444', fontSize: 13 }}>Не найдено</div>

  return (
    <div style={{ padding: '8px 16px 14px', display: 'flex', flexDirection: 'column' }}>
      {isEarlyStage && (
        <Field label="Клиент">
          {clients.length > 0 ? (
            <select
              defaultValue={row.client ?? ''}
              onFocus={(e) => (e.target.style.borderColor = '#93c5fd')}
              onBlur={(e) => (e.target.style.borderColor = '#e2e8f0')}
              onChange={(e) => onPatch({ client: e.target.value || null })}
              style={iS}
            >
              <option value="">—</option>
              {clients.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          ) : (
            <input
              defaultValue={row.client ?? ''}
              onFocus={(e) => (e.target.style.borderColor = '#93c5fd')}
              onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; if (e.target.value !== (row.client ?? '')) onPatch({ client: e.target.value || null }) }}
              placeholder="—" style={iS}
            />
          )}
        </Field>
      )}
      <Field label="Исп. продюсер">
        {producers.length > 0 ? (
          <select
            defaultValue={row.execProducer ?? ''}
            onFocus={(e) => (e.target.style.borderColor = '#93c5fd')}
            onBlur={(e) => (e.target.style.borderColor = '#e2e8f0')}
            onChange={(e) => onPatch({ execProducer: e.target.value || null })}
            style={iS}
          >
            <option value="">—</option>
            {producers.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        ) : (
          <input
            defaultValue={row.execProducer ?? ''}
            onFocus={(e) => (e.target.style.borderColor = '#93c5fd')}
            onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; if (e.target.value !== (row.execProducer ?? '')) onPatch({ execProducer: e.target.value || null }) }}
            placeholder="—" style={iS}
          />
        )}
      </Field>
      <Field label="Лайн-продюсер">
        {producers.length > 0 ? (
          <select
            defaultValue={row.lineProducer ?? ''}
            onFocus={(e) => (e.target.style.borderColor = '#93c5fd')}
            onBlur={(e) => (e.target.style.borderColor = '#e2e8f0')}
            onChange={(e) => onPatch({ lineProducer: e.target.value || null })}
            style={iS}
          >
            <option value="">—</option>
            {producers.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        ) : (
          <input
            defaultValue={row.lineProducer ?? ''}
            onFocus={(e) => (e.target.style.borderColor = '#93c5fd')}
            onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; if (e.target.value !== (row.lineProducer ?? '')) onPatch({ lineProducer: e.target.value || null }) }}
            placeholder="—" style={iS}
          />
        )}
      </Field>
      <Field label="Аккаунт менеджер">
        {producers.length > 0 ? (
          <select
            defaultValue={row.accountManager ?? ''}
            onFocus={(e) => (e.target.style.borderColor = '#93c5fd')}
            onBlur={(e) => (e.target.style.borderColor = '#e2e8f0')}
            onChange={(e) => onPatch({ accountManager: e.target.value || null })}
            style={iS}
          >
            <option value="">—</option>
            {producers.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        ) : (
          <input
            defaultValue={row.accountManager ?? ''}
            onFocus={(e) => (e.target.style.borderColor = '#93c5fd')}
            onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; if (e.target.value !== (row.accountManager ?? '')) onPatch({ accountManager: e.target.value || null }) }}
            placeholder="—" style={iS}
          />
        )}
      </Field>
      <Field label="Дата">
        <input
          defaultValue={row.dateApproximate ?? ''}
          onFocus={(e) => (e.target.style.borderColor = '#93c5fd')}
          onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; if (e.target.value !== (row.dateApproximate ?? '')) onPatch({ dateApproximate: e.target.value || null }) }}
          placeholder="апрель / 28 мая / 14-20 мая" style={iS}
        />
      </Field>
      <Field label="Формат">
        <select
          defaultValue={row.format ?? ''}
          onFocus={(e) => (e.target.style.borderColor = '#93c5fd')}
          onBlur={(e) => (e.target.style.borderColor = '#e2e8f0')}
          onChange={(e) => onPatch({ format: e.target.value || null })}
          style={iS}
        >
          <option value="">—</option>
          {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </Field>
      <Field label="Локация">
        <select
          defaultValue={row.location ?? ''}
          onFocus={(e) => (e.target.style.borderColor = '#93c5fd')}
          onBlur={(e) => (e.target.style.borderColor = '#e2e8f0')}
          onChange={(e) => onPatch({ location: e.target.value || null })}
          style={iS}
        >
          <option value="">—</option>
          {LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </Field>
      <Field label="Проект">
        {(row.linkedMatrix ?? row.matrixRegistry) ? (
          <button
            onClick={() => onOpenMatrix?.()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 12, fontWeight: 600, color: '#15803d',
              background: '#dcfce7', border: '1px solid #86efac',
              borderRadius: 20, padding: '3px 10px',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
            onMouseOver={(e) => { e.currentTarget.style.background = '#bbf7d0' }}
            onMouseOut={(e) => { e.currentTarget.style.background = '#dcfce7' }}
          >
            ✓ {(row.linkedMatrix ?? row.matrixRegistry)!.name || (row.linkedMatrix ?? row.matrixRegistry)!.matrixId}
          </button>
        ) : (
          <span style={{ fontSize: 13, color: '#94a3b8' }}>Не привязан</span>
        )}
      </Field>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      {children}
    </div>
  )
}

const iS: React.CSSProperties = {
  width: '100%', padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 6,
  fontSize: 13, fontFamily: 'inherit', color: '#1e293b', background: '#f8fafc',
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
    qc.invalidateQueries({ queryKey: ['workflow-children'] })
  }

  const deleteDept = useMutation({
    mutationFn: (id: string) => api.delete(`/status-rows/${id}`),
    onSuccess: invalidate,
  })

  const deptLabel = (d: DeptRow) => {
    const fmt = d.format || d.name || '—'
    return TV_FORMATS.includes(fmt) ? `ТВ:${fmt}` : fmt
  }

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
    mutationFn: async () => {
      const r = await api.post('/status-rows', {
        name: resolvedFormat || dept || 'Без названия',
        format: resolvedFormat || null,
        location: showLocation ? (location || null) : null,
        parentTaskId: taskId,
        status: 'request',
      })
      const newId: string = r.data.id

      if (showLocation && location) {
        const today = new Date().toISOString().slice(0, 10)
        const groups = location.startsWith('Выезд') ? VIEZD_GROUPS : STUDIO_GROUPS
        const schedule: Record<string, unknown> = {}
        for (const g of groups) {
          const t = DEFAULT_GROUP_TIMES[g]
          if (t) schedule[g] = { date: today, ...t }
        }
        await api.patch(`/status-rows/${newId}/group-schedule`, schedule)
      }

      return r.data
    },
    onSuccess: onCreated,
  })

  const sS: React.CSSProperties = { fontSize: 13, padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, color: '#1e293b', background: '#fff', width: '100%', boxSizing: 'border-box' }
  const lS: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4, display: 'block' }

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 12 }}>Новый отдел</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        <div>
          <span style={lS}>Отдел</span>
          <select value={dept} onChange={(e) => { setDept(e.target.value); setTvFormat(''); setLocation('') }} style={sS} autoFocus>
            <option value="">— не выбрано —</option>
            {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        {isTv && (
          <div>
            <span style={lS}>Формат</span>
            <select value={tvFormat} onChange={(e) => { setTvFormat(e.target.value); setLocation('') }} style={sS}>
              <option value="">— не выбрано —</option>
              {TV_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        )}
        {showLocation && (
          <div>
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
