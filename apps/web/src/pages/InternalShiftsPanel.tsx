import React, { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient, useQueries } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { api } from '../lib/api'
import { ShiftPlanner } from './ShiftPlanner'
import { useCurrentUser } from '../hooks/useAuth'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ShiftConfirmed = 'yes' | 'pending' | null

export interface ShiftValue {
  type?: string
  confirmed?: ShiftConfirmed
  timeStart?: string | null
  timeEnd?: string | null
}

type RawShiftValue = string | ShiftValue

export interface ProjectMember {
  id: string
  project_id: string
  name: string
  position: string | null
  employment_type: string | null
  rate_plan: string | null
  rate_fact: string | null
  shifts: Record<string, RawShiftValue>
  is_approved: boolean
  field_approvals: Record<string, boolean>
  group_name: string | null
  telegram_username: string | null
  is_freelancer: boolean
  payment_type: string | null
  payment_status: string
  payment_amount: string | null
}

interface ProjectDay {
  id: string
  date: string
  type: string
  startTime: string | null
  timeFrom: string | null
  timeTo: string | null
  allDay: boolean
  firstMotor: string | null
}

interface MicroProject {
  id: string
  name: string
  date: string | null
  dateApproximate: string | null
  status: string
  format: string | null
  location: string | null
  client: string | null
  execProducer: string | null
  lineProducer: string | null
  accountManager: string | null
  time: string | null
  notes: string | null
  days: ProjectDay[]
  matrixRegistryId: string | null
}

interface GroupScheduleEntry {
  date?: string
  time?: string      // одиночное время (завоз, монтаж)
  timeFrom?: string  // диапазон от
  timeTo?: string    // диапазон до
  startTime?: string // начало эфира
  note?: string      // пометка в заголовке блока
}

interface ShiftExpense {
  id: string
  project_id: string
  expense_type: string
  ordered_by: string | null
  amount: string | null
  notes: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateShort(raw: string | null | undefined): string {
  if (!raw) return '—'
  try { return format(new Date(raw), 'd MMM', { locale: ru }) } catch { return raw }
}

function fmtDateFull(raw: string | null | undefined): string {
  if (!raw) return '—'
  try { return format(new Date(raw), 'd MMM yyyy', { locale: ru }) } catch { return raw }
}

function toIsoDate(raw: string): string {
  try { return new Date(raw).toISOString().slice(0, 10) } catch { return raw }
}

function isoToInput(raw: string | null | undefined): string {
  if (!raw) return ''
  try { return new Date(raw).toISOString().slice(0, 10) } catch { return '' }
}

function normalise(raw: RawShiftValue | undefined): ShiftValue | null {
  if (!raw) return null
  if (typeof raw === 'string') return raw ? { type: raw, confirmed: 'yes' } : null
  return raw
}

function confirmedColor(v: ShiftConfirmed): string {
  return (v === 'yes' || v === 'pending') ? '#3b82f6' : '#e2e8f0'
}

function nextConfirmed(v: ShiftConfirmed): ShiftConfirmed {
  return v === null ? 'yes' : null
}

const EMP_LABELS: Record<string, string> = {
  staff: 'ШТАТ', ip_7: 'ИП 7%', ip_8: 'ИП 8%', ip_10: 'ИП 10%', szt: 'СЗТ',
}
const EMP_COLORS: Record<string, string> = {
  staff: '#6366f1', ip_7: '#0ea5e9', ip_8: '#0ea5e9', ip_10: '#0ea5e9', szt: '#f59e0b',
}

function EmpBadge({ type }: { type: string | null }) {
  if (!type) return <span style={{ color: '#cbd5e1' }}>—</span>
  const label = EMP_LABELS[type] ?? type
  const color = EMP_COLORS[type] ?? '#94a3b8'
  return (
    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, background: color + '1a', color, fontWeight: 700, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
      {label}
    </span>
  )
}

function fmtMoney(v: string | null | undefined): string {
  if (!v) return '—'
  const n = parseFloat(v)
  if (isNaN(n)) return '—'
  return n.toLocaleString('ru-RU')
}

function countConfirmedDays(shifts: Record<string, RawShiftValue>, dateCols: string[]): number {
  return dateCols.filter((d) => normalise(shifts[d])?.confirmed === 'yes').length
}

function fmtPrice(v: string): string {
  if (!v) return ''
  const n = parseFloat(v)
  if (isNaN(n)) return v
  return n.toLocaleString('ru-RU') + ' ₽'
}

function calcSum(rateStr: string | null, shifts: Record<string, RawShiftValue>, dateCols: string[]): string {
  if (!rateStr) return '—'
  const rate = parseFloat(rateStr)
  if (isNaN(rate)) return '—'
  const days = countConfirmedDays(shifts, dateCols)
  if (days === 0) return '—'
  return (rate * days).toLocaleString('ru-RU')
}

function RateCell({ memberId, field, value, onSave }: { memberId: string; field: string; value: string | null; onSave: (v: string | null) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const commit = () => {
    const v = draft.trim() || null
    if (v !== (value || null)) onSave(v)
    setEditing(false)
  }
  if (editing) {
    return (
      <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false) } }}
        style={{ width: 72, fontSize: 12, padding: '2px 5px', border: '1px solid #3b82f6', borderRadius: 4, textAlign: 'right', outline: 'none', fontFamily: 'inherit' }} />
    )
  }
  return (
    <span onClick={() => { setDraft(value ?? ''); setEditing(true) }} title="Нажмите для редактирования"
      style={{ cursor: 'text', color: value ? '#1e293b' : '#cbd5e1', fontSize: 12, display: 'inline-block', minWidth: 40, textAlign: 'right' }}>
      {value ? Number(value).toLocaleString('ru-RU') : '—'}
    </span>
  )
}

const STATUS_LABELS: Record<string, string> = {
  request: 'Запрос', preproduction: 'Препрод.',
  production: 'Продакшн', postproduction: 'Постпрод.', delivered: 'Сдан',
  rejected: 'Не согл.', cancelled: 'Отменён',
}
const STATUS_COLORS: Record<string, string> = {
  request: '#f59e0b', preproduction: '#8b5cf6',
  production: '#10b981', postproduction: '#06b6d4', delivered: '#16a34a',
  rejected: '#ef4444', cancelled: '#6b7280',
}

const LOCATION_OPTIONS = [
  'Знаменка крыша',
  'Знаменка чёрная',
  'Знаменка камин',
  'Романов',
  'Выезд',
]

const SHIFT_FORMATS = ['Трансляция', 'Телерадио', 'Съемки', 'Радио', 'Моушн', 'Постпродакшн', 'Дизайн', 'Саунд-дизайн']
const FORMATS_WITH_LOCATION = ['Трансляция', 'Телерадио', 'Съемки']
const DEPARTMENTS = ['ТВ', 'Моушн', 'Постпродакшн', 'Дизайн', 'Саунд-дизайн', 'Радио', 'Не профильный']
const CREATIVE_FORMATS = ['Моушн', 'Постпродакшн', 'Дизайн', 'Саунд-дизайн', 'Не профильный', 'Радио']
const TV_FORMATS = ['Трансляция', 'Телерадио', 'Съемки']

// Which schedule fields each group uses
const GROUP_FIELDS: Record<string, ('date' | 'time' | 'timeFrom' | 'timeTo' | 'startTime')[]> = {
  sbor:      ['date', 'timeFrom', 'timeTo'],
  zavoz:     ['date', 'timeFrom', 'timeTo'],
  montazh:   ['date', 'timeFrom', 'timeTo'],
  efir:      ['date', 'timeFrom', 'timeTo', 'startTime'],
  demontazh: ['date', 'timeFrom', 'timeTo'],
  vyvoz:     ['date', 'timeFrom', 'timeTo'],
  default:   ['date', 'timeFrom', 'timeTo'],
}

const STUDIO_GROUPS: { id: string; label: string; color: string }[] = [
  { id: 'sbor',      label: 'Сбор оборудования',     color: '#64748b' },
  { id: 'montazh',   label: 'Монтаж оборудования',   color: '#0ea5e9' },
  { id: 'efir',      label: 'Эфир',                  color: '#10b981' },
  { id: 'demontazh', label: 'Демонтаж оборудования', color: '#f59e0b' },
]

const VIEZD_GROUPS: { id: string; label: string; color: string }[] = [
  { id: 'sbor',      label: 'Сбор оборудования',     color: '#64748b' },
  { id: 'zavoz',     label: 'Завоз оборудования',    color: '#7c3aed' },
  { id: 'montazh',   label: 'Монтаж оборудования',   color: '#0ea5e9' },
  { id: 'efir',      label: 'Эфир',                  color: '#10b981' },
  { id: 'demontazh', label: 'Демонтаж оборудования', color: '#f59e0b' },
  { id: 'vyvoz',     label: 'Вывоз оборудования',    color: '#ef4444' },
]

// ─── HoldToDelete ─────────────────────────────────────────────────────────────

function HoldToDelete({ onDelete }: { onDelete: () => void }) {
  const [progress, setProgress] = useState(0)
  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number>(0)
  const HOLD_MS = 800

  const onStart = (e: React.MouseEvent) => {
    e.preventDefault()
    startRef.current = Date.now()
    const tick = () => {
      const p = Math.min((Date.now() - startRef.current) / HOLD_MS, 1)
      setProgress(p)
      if (p < 1) { rafRef.current = requestAnimationFrame(tick) }
      else { rafRef.current = null; onDelete() }
    }
    rafRef.current = requestAnimationFrame(tick)
  }
  const onStop = () => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    setProgress(0)
  }

  return (
    <button
      onMouseDown={onStart} onMouseUp={onStop} onMouseLeave={onStop}
      title="Удержите для удаления"
      style={{ position: 'relative', width: 24, height: 24, borderRadius: 5, border: '1px solid #e2e8f0', background: '#f8fafc', overflow: 'hidden', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0 }}
    >
      <span style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1, userSelect: 'none' }}>×</span>
      {progress > 0 && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, height: 3, width: `${progress * 100}%`, background: '#ef4444', transition: 'none' }} />
      )}
    </button>
  )
}

// ─── DeleteConfirmModal ────────────────────────────────────────────────────────

function DeleteConfirmModal({ name, onConfirm, onCancel }: { name: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000 }} onClick={onCancel} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 1001, background: '#fff', borderRadius: 12, padding: '24px 28px', minWidth: 320, boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>Удалить отдел?</div>
        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 22 }}>«{name}» будет удалена без возможности восстановления.</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancel}
            style={{ padding: '7px 18px', border: '1px solid #e2e8f0', borderRadius: 7, background: '#f8fafc', color: '#64748b', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
            Отмена
          </button>
          <button onClick={onConfirm}
            style={{ padding: '7px 18px', border: 'none', borderRadius: 7, background: '#ef4444', color: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
            Удалить
          </button>
        </div>
      </div>
    </>
  )
}

// ─── ProducerField ────────────────────────────────────────────────────────────

// Парсит "Выезд: ул. Тверская 10" → { selected: 'Выезд', address: 'ул. Тверская 10' }
// Для остальных локаций → { selected: value, address: '' }
function parseLocation(value: string | null): { selected: string | null; address: string } {
  if (!value) return { selected: null, address: '' }
  if (value.startsWith('Выезд: ')) return { selected: 'Выезд', address: value.slice('Выезд: '.length) }
  if (value === 'Выезд') return { selected: 'Выезд', address: '' }
  return { selected: value, address: '' }
}

function ProducerField({ label, fieldKey, value, options, onSave, isApproved, onApprovalToggle }: {
  label: string; fieldKey: string; value: string | null
  options: string[]
  onSave: (k: string, v: unknown) => void
  isApproved?: boolean
  onApprovalToggle?: () => void
}) {
  const isLocation = fieldKey === 'location'
  const { selected, address: initAddress } = isLocation ? parseLocation(value) : { selected: value, address: '' }

  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [addressDraft, setAddressDraft] = useState(initAddress)
  const ref = useRef<HTMLDivElement>(null)
  const [dropRect, setDropRect] = useState<{ top: number; left: number; width: number } | null>(null)

  // Sync address draft when value changes externally
  useEffect(() => {
    if (isLocation) setAddressDraft(parseLocation(value).address)
  }, [value])

  const filtered = filter.trim()
    ? options.filter((o) => o.toLowerCase().includes(filter.trim().toLowerCase()))
    : options

  const openDrop = () => {
    const rect = ref.current?.getBoundingClientRect()
    setDropRect(rect ? { top: rect.bottom + 2, left: rect.left, width: rect.width } : null)
    setFilter('')
    setOpen(true)
  }

  const pick = (v: string | null) => {
    if (isLocation && v !== 'Выезд') setAddressDraft('')
    onSave(fieldKey, v)
    setOpen(false)
  }

  const saveAddress = (addr: string) => {
    const trimmed = addr.trim()
    onSave(fieldKey, trimmed ? `Выезд: ${trimmed}` : 'Выезд')
  }

  const displayValue = isLocation ? selected : value

  // Approval for "Выезд" is blocked until address is filled
  const addressMissing = isLocation && selected === 'Выезд' && !addressDraft.trim()
  const effectiveApprovalToggle = addressMissing ? undefined : onApprovalToggle
  const handleCtx = effectiveApprovalToggle ? (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); effectiveApprovalToggle() } : undefined
  const dropBorder = onApprovalToggle
    ? (isApproved ? '1px solid #22c55e' : '2px solid #f97316')
    : '1px solid #e2e8f0'
  const dropBg = onApprovalToggle && !isApproved ? 'rgba(249,115,22,0.09)' : '#fafafa'
  const addrStyle: React.CSSProperties | undefined = addressMissing
    ? { borderColor: '#cbd5e1', opacity: 0.6 }
    : onApprovalToggle
      ? (isApproved ? { borderColor: '#22c55e', borderWidth: 1 } : { borderColor: '#f97316', borderWidth: 2, background: 'rgba(249,115,22,0.09)' })
      : undefined

  return (
    <div
      title={onApprovalToggle ? (isApproved ? 'Утверждено (ПКМ → отменить)' : 'Не утверждено (ПКМ → утвердить)') : undefined}
      style={{ padding: '9px 14px', borderBottom: '1px solid #f8fafc' }}
    >
      <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: 3 }}>{label}</div>
      <div ref={ref} onClick={openDrop} onContextMenu={handleCtx} style={{ fontSize: 13, color: displayValue ? '#1e293b' : '#94a3b8', cursor: 'pointer', minHeight: 18, fontWeight: displayValue ? 500 : 400, display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: dropBorder, borderRadius: 5, padding: '3px 7px', background: dropBg }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayValue || 'Не выбрано'}</span>
        <span style={{ color: '#cbd5e1', fontSize: 10, flexShrink: 0, marginLeft: 4 }}>▾</span>
      </div>

      {/* Адрес — только для локации "Выезд" */}
      {isLocation && selected === 'Выезд' && (
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <input
            value={addressDraft}
            onChange={(e) => setAddressDraft(e.target.value)}
            onBlur={() => { if (addressDraft !== initAddress) saveAddress(addressDraft) }}
            onContextMenu={handleCtx}
            onKeyDown={(e) => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur() } }}
            placeholder="Введите адрес..."
            style={{ width: '100%', fontSize: 12, borderRadius: 5, padding: '4px 7px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', color: '#1e293b', border: '1px solid #e2e8f0', background: '#fff', ...addrStyle }}
          />
          {addressMissing && onApprovalToggle && (
            <div style={{ fontSize: 10, color: '#f97316', marginTop: 1 }}>Введите адрес для утверждения</div>
          )}
          {addressDraft.trim() && (
            <a
              href={`https://yandex.ru/maps/?text=${encodeURIComponent(addressDraft.trim())}`}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 11, color: '#2563eb', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 0' }}
            >
              <span style={{ fontSize: 13 }}>🗺</span> Открыть в Я.Картах
            </a>
          )}
        </div>
      )}

      {open && dropRect && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 599 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'fixed', top: dropRect.top, left: dropRect.left, width: Math.max(dropRect.width, 180), zIndex: 600, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 7, boxShadow: '0 4px 16px rgba(0,0,0,0.13)', overflow: 'hidden', maxHeight: 260, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
              <input autoFocus value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Поиск..." style={{ width: '100%', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 5, padding: '3px 7px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              <div onClick={() => pick(null)} style={{ padding: '6px 10px', fontSize: 12, cursor: 'pointer', color: '#94a3b8' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
                — Не выбрано
              </div>
              {filtered.map((o) => (
                <div key={o} onClick={() => pick(o)} style={{ padding: '6px 10px', fontSize: 12, cursor: 'pointer', color: o === selected ? '#2563eb' : '#1e293b', fontWeight: o === selected ? 600 : 400, background: o === selected ? '#eff6ff' : 'none' }}
                  onMouseEnter={(e) => { if (o !== selected) e.currentTarget.style.background = '#f8fafc' }}
                  onMouseLeave={(e) => { if (o !== selected) e.currentTarget.style.background = 'none' }}>
                  {o}
                </div>
              ))}
              {filtered.length === 0 && <div style={{ padding: '8px 10px', fontSize: 12, color: '#94a3b8' }}>Не найдено</div>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── InternalShiftsPanel ─────────────────────────────────────────────────────

export function InternalShiftsPanel({ matrixRegistryId, initialProjectId, parentTaskId }: { matrixRegistryId?: string | null; initialProjectId?: string | null; parentTaskId?: string | null }) {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<'summary' | string>('summary')

  useEffect(() => {
    if (initialProjectId) setActiveTab(initialProjectId)
  }, [initialProjectId])
  const [creating, setCreating] = useState(false)

  // When parentTaskId is provided, load departments belonging to that specific task.
  // Otherwise fall back to loading all projects for the matrix (legacy behaviour).
  const queryKey = parentTaskId
    ? ['micro-projects', 'task', parentTaskId]
    : ['micro-projects', matrixRegistryId]
  const queryUrl = parentTaskId
    ? `/status-rows?parentTaskId=${parentTaskId}`
    : `/status-rows?matrixRegistryId=${matrixRegistryId}`

  const { data: projects = [], isLoading } = useQuery<MicroProject[]>({
    queryKey,
    queryFn: () => api.get(queryUrl).then((r) => r.data),
    enabled: parentTaskId ? !!parentTaskId : !!matrixRegistryId,
    staleTime: 30_000,
  })

  const invalidateMicroProjects = () => {
    qc.invalidateQueries({ queryKey })
    qc.invalidateQueries({ queryKey: ['micro-projects-info', matrixRegistryId] })
    qc.invalidateQueries({ queryKey: ['status-rows-sync'] })
  }

  const handleCreated = (id: string) => {
    invalidateMicroProjects()
    setCreating(false)
    setActiveTab(id)
  }

  const handleDeleted = (id: string) => {
    invalidateMicroProjects()
    if (activeTab === id) setActiveTab('summary')
  }

  const handleCopied = (newId: string) => {
    invalidateMicroProjects()
    setActiveTab(newId)
  }

  const handleUpdated = () => {
    qc.invalidateQueries({ queryKey })
  }

  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px', fontSize: 12, border: 'none', cursor: 'pointer', background: 'none',
    borderBottom: active ? '2px solid #3b82f6' : '2px solid transparent',
    color: active ? '#3b82f6' : '#64748b', fontWeight: active ? 600 : 400,
    whiteSpace: 'nowrap', flexShrink: 0,
  })

  if (parentTaskId === null || parentTaskId === undefined) {
    // No task selected yet — show a prompt
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Sub-tabs strip */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #e2e8f0', overflowX: 'auto', flexShrink: 0 }}>
        <button style={tabBtn(activeTab === 'summary')} onClick={() => { setActiveTab('summary'); setCreating(false) }}>
          Свод отделов
        </button>

        {projects.map((p) => {
          const fmt = p.format ?? ''
          const label = TV_FORMATS.includes(fmt) ? `ТВ:${fmt}` : (fmt || p.name || '(без названия)')
          return (
            <button
              key={p.id}
              style={{ ...tabBtn(activeTab === p.id), maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title={label}
              onClick={() => { setActiveTab(p.id); setCreating(false) }}
            >
              {label}
            </button>
          )
        })}

        <button
          style={{ padding: '4px 14px', fontSize: 18, border: 'none', cursor: 'pointer', background: 'none', color: '#94a3b8', borderBottom: '2px solid transparent', flexShrink: 0 }}
          title="Добавить отдел"
          onClick={() => { setCreating(true); setActiveTab('new') }}
        >+</button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {isLoading && <div style={{ padding: 24, color: '#94a3b8', fontSize: 14 }}>Загрузка...</div>}

        {!isLoading && activeTab === 'summary' && !creating && (
          <ShiftsSummaryTab matrixRegistryId={matrixRegistryId} projects={projects} />
        )}

        {!isLoading && creating && activeTab === 'new' && (
          <CreateMicroProjectForm
            matrixRegistryId={parentTaskId ? undefined : matrixRegistryId}
            parentTaskId={parentTaskId ?? undefined}
            onCreated={handleCreated}
            onCancel={() => { setCreating(false); setActiveTab('summary') }}
          />
        )}

        {!isLoading && !creating && activeTab !== 'summary' && (() => {
          const project = projects.find((p) => p.id === activeTab)
          if (!project) return null
          return (
            <MicroProjectTab
              key={project.id}
              project={project}
              onDeleted={() => handleDeleted(project.id)}
              onCopied={handleCopied}
              onUpdated={handleUpdated}
            />
          )
        })()}

        {!isLoading && projects.length === 0 && !creating && activeTab === 'summary' && (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
            Нет отделов. Нажмите «+», чтобы добавить.
          </div>
        )}
      </div>
    </div>
  )
}

// ─── ShiftsSummaryTab ─────────────────────────────────────────────────────────

function ShiftsSummaryTab({ matrixRegistryId, projects }: { matrixRegistryId?: string | null; projects: MicroProject[] }) {
  const memberQueries = useQueries({
    queries: projects.map((p) => ({
      queryKey: ['project-members', p.id],
      queryFn: () => api.get(`/project-members?projectId=${p.id}`).then((r) => r.data as ProjectMember[]),
      staleTime: 30_000,
    })),
  })

  const allLoaded = memberQueries.every((q) => !q.isLoading)

  const DLABEL_COLORS: Record<string, { bg: string; color: string }> = {
    zastroyka: { bg: '#fef3c7', color: '#92400e' },
    efir:      { bg: '#dbeafe', color: '#1d4ed8' },
    deadline:  { bg: '#fee2e2', color: '#991b1b' },
    semka:     { bg: '#d1fae5', color: '#065f46' },
  }
  const TYPE_LABELS: Record<string, string> = {
    zastroyka: 'Застройка', efir: 'Эфир', deadline: 'Дедлайн', semka: 'Съёмка',
  }

  const rows = useMemo(() => {
    return projects.map((p, idx) => {
      const dateTypeMap: Record<string, string> = {}
      if (p.date) {
        const mainDay = p.days.find((d) => toIsoDate(d.date) === toIsoDate(p.date!))
        dateTypeMap[toIsoDate(p.date)] = mainDay?.type ?? 'efir'
      }
      p.days.forEach((d) => {
        const iso = toIsoDate(d.date)
        if (!dateTypeMap[iso]) dateTypeMap[iso] = d.type
      })
      return {
        project: p,
        members: memberQueries[idx]?.data ?? [] as ProjectMember[],
        dateTypeMap,
        dates: Object.keys(dateTypeMap).sort(),
      }
    })
  }, [projects, memberQueries])

  const globalDates = useMemo(() => {
    const all = new Set<string>()
    rows.forEach((r) => r.dates.forEach((d) => all.add(d)))
    return [...all].sort()
  }, [rows])

  if (!allLoaded) return <div style={{ padding: 24, color: '#94a3b8', fontSize: 14 }}>Загрузка...</div>

  const visibleRows = rows.filter((r) => r.members.length > 0)
  if (visibleRows.length === 0) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Нет участников.</div>
  }

  const thS: React.CSSProperties = {
    padding: '7px 10px', fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'left',
    borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap', position: 'sticky', top: 0,
    background: '#f8fafc', zIndex: 2, textTransform: 'uppercase', letterSpacing: '0.03em',
  }
  const tdS: React.CSSProperties = { padding: '6px 10px', fontSize: 12, borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' }

  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...thS, minWidth: 170 }}>Отдел</th>
            <th style={{ ...thS, minWidth: 160 }}>ФИО</th>
            <th style={{ ...thS, minWidth: 80 }}>Формат</th>
            <th style={{ ...thS, minWidth: 130 }}>Должность</th>
            <th style={{ ...thS, minWidth: 90, textAlign: 'right' }}>Сумма план</th>
            <th style={{ ...thS, minWidth: 90, textAlign: 'right' }}>Сумма факт</th>
            {globalDates.map((d) => (
              <th key={d} style={{ ...thS, minWidth: 60, textAlign: 'center' }}>{fmtDateShort(d)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map(({ project, members, dateTypeMap, dates }, vIdx) => {
            const rowCount = members.length + 1
            return (
              <>
                {/* date-label-row */}
                <tr key={`${project.id}-lbl`} style={{ background: '#f8fafc' }}>
                  <td rowSpan={rowCount} style={{
                    ...tdS, verticalAlign: 'top', borderRight: '1px solid #e2e8f0',
                    background: '#f8fafc', minWidth: 170, maxWidth: 200, padding: '10px 12px',
                    borderTop: '2px solid #e2e8f0',
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: '#0f172a', lineHeight: 1.3, marginBottom: 4 }}>
                      {project.name || '(без названия)'}
                    </div>
                    {project.date && (
                      <div style={{ fontSize: 11, color: '#3b82f6', marginBottom: 5, fontWeight: 500 }}>
                        {fmtDateShort(project.date)}
                      </div>
                    )}
                    <div style={{ marginBottom: project.execProducer ? 5 : 0 }}>
                      <span style={{
                        fontSize: 10, padding: '2px 7px', borderRadius: 10,
                        background: (STATUS_COLORS[project.status] ?? '#94a3b8') + '22',
                        color: STATUS_COLORS[project.status] ?? '#94a3b8', fontWeight: 700,
                      }}>
                        {STATUS_LABELS[project.status] ?? project.status}
                      </span>
                    </div>
                    {project.execProducer && (
                      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
                        Исп. пр.: {project.execProducer}
                      </div>
                    )}
                  </td>
                  <td style={{ ...tdS, borderTop: '2px solid #e2e8f0' }} />
                  <td style={{ ...tdS, borderTop: '2px solid #e2e8f0' }} />
                  <td style={{ ...tdS, borderTop: '2px solid #e2e8f0' }} />
                  <td style={{ ...tdS, borderTop: '2px solid #e2e8f0' }} />
                  <td style={{ ...tdS, borderTop: '2px solid #e2e8f0' }} />
                  {globalDates.map((d) => {
                    const type = dateTypeMap[d]
                    const tColor = type ? (DLABEL_COLORS[type] ?? { bg: '#f3e8ff', color: '#7e22ce' }) : null
                    return (
                      <td key={d} style={{ ...tdS, textAlign: 'center', borderTop: '2px solid #e2e8f0' }}>
                        {type && tColor ? (
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 10,
                            background: tColor.bg, color: tColor.color, whiteSpace: 'nowrap',
                          }}>
                            {TYPE_LABELS[type] ?? type}
                          </span>
                        ) : (
                          <span style={{ color: '#e2e8f0', fontSize: 11 }}>—</span>
                        )}
                      </td>
                    )
                  })}
                </tr>

                {/* member rows */}
                {members.map((m, mi) => (
                  <tr key={m.id} style={{ background: mi % 2 === 0 ? '#fff' : '#f8fafc' }}>
                    <td style={{ ...tdS, fontWeight: 600, color: '#1e293b' }}>{m.name}</td>
                    <td style={tdS}><EmpBadge type={m.employment_type} /></td>
                    <td style={{ ...tdS, color: '#64748b' }}>{m.position ?? <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                    <td style={{ ...tdS, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#1e293b' }}>
                      {calcSum(m.rate_plan, m.shifts, dates)}{m.rate_plan ? ' ₽' : ''}
                    </td>
                    <td style={{ ...tdS, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: m.employment_type === 'staff' ? '#cbd5e1' : '#1e293b', textDecoration: m.employment_type === 'staff' ? 'line-through' : 'none' }}
                      title={m.employment_type === 'staff' ? 'ШТАТ — не учитывается в своде' : undefined}>
                      {calcSum(m.rate_fact, m.shifts, dates)}{m.rate_fact ? ' ₽' : ''}
                    </td>
                    {globalDates.map((d) => {
                      if (!dateTypeMap[d]) {
                        return <td key={d} style={{ ...tdS, background: '#f3f4f6' }} />
                      }
                      const v = normalise(m.shifts[d])
                      const confirmed: ShiftConfirmed = v?.confirmed ?? (v ? 'yes' : null)
                      return (
                        <td key={d} style={{ ...tdS, textAlign: 'center' }}>
                          {confirmed ? (
                            <span title={confirmed === 'yes' ? 'Подтверждён' : 'Не подтверждён'} style={{
                              display: 'inline-block', width: 18, height: 18, borderRadius: 5,
                              background: confirmed === 'yes' ? '#22c55e' : '#f59e0b',
                            }} />
                          ) : (
                            <span style={{ display: 'inline-block', width: 18, height: 4, borderRadius: 2, background: '#f1f5f9' }} />
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}

                {/* section-gap */}
                {vIdx < visibleRows.length - 1 && (
                  <tr key={`${project.id}-gap`}>
                    <td colSpan={6 + globalDates.length} style={{ height: 12, background: '#f8fafc', borderTop: '2px solid #e2e8f0', padding: 0 }} />
                  </tr>
                )}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── MicroProjectTab ──────────────────────────────────────────────────────────

export { MicroProject }

export function MicroProjectTab({ project, onDeleted, onCopied, onUpdated }: {
  project: MicroProject
  onDeleted: () => void
  onCopied: (newId: string) => void
  onUpdated: () => void
}) {
  const qc = useQueryClient()
  const [microTab, setMicroTab] = useState<'team' | 'planner' | 'expenses' | 'freelancers'>('team')
  const [datePopup, setDatePopup] = useState<DatePopup | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Field approvals for this project (location, execProducer, lineProducer)
  const { data: fieldApprovals = {} } = useQuery<Record<string, boolean>>({
    queryKey: ['field-approvals', project.id],
    queryFn: () => api.get(`/status-rows/${project.id}/approvals`).then((r) => r.data),
    staleTime: 30_000,
  })

  // Group schedule — date/time/type per group block
  const { data: groupSchedule = {} } = useQuery<Record<string, GroupScheduleEntry>>({
    queryKey: ['group-schedule', project.id],
    queryFn: () => api.get(`/status-rows/${project.id}/group-schedule`).then((r) => r.data),
    staleTime: 30_000,
  })
  const updateGroupSchedule = useMutation({
    mutationFn: (patch: Record<string, GroupScheduleEntry | null>) =>
      api.patch(`/status-rows/${project.id}/group-schedule`, patch).then((r) => r.data),
    onSuccess: (data) => qc.setQueryData(['group-schedule', project.id], data),
  })

  const updateProject = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.patch(`/status-rows/${project.id}`, data).then((r) => r.data),
    onSuccess: (updated) => {
      qc.setQueryData(['micro-projects', project.matrixRegistryId!], (old: MicroProject[] | undefined) =>
        old?.map((p) => (p.id === project.id ? { ...p, ...updated } : p))
      )
      onUpdated()
    },
  })

  const saveField = (key: string, value: unknown) => {
    updateProject.mutate({ [key]: value })
  }

  const deleteProject = useMutation({
    mutationFn: () => api.delete(`/status-rows/${project.id}`).then((r) => r.data),
    onSuccess: onDeleted,
  })

  const { data: members = [], isLoading: membersLoading } = useQuery<ProjectMember[]>({
    queryKey: ['project-members', project.id],
    queryFn: () => api.get(`/project-members?projectId=${project.id}`).then((r) => r.data),
    staleTime: 30_000,
  })

  const copyProject = useMutation({
    mutationFn: async () => {
      const created = await api.post('/status-rows', {
        name: project.name + ' (копия)',
        client: project.client,
        format: project.format,
        location: project.location,
        execProducer: project.execProducer,
        lineProducer: project.lineProducer,
        accountManager: project.accountManager,
        matrixRegistryId: project.matrixRegistryId,
        status: 'request',
        date: null,
      }).then((r) => r.data)
      for (const m of members) {
        await api.post('/project-members', { projectId: created.id, name: m.name, position: m.position, shifts: {} })
      }
      return created
    },
    onSuccess: (d) => onCopied(d.id),
  })

  // ── Date mutations ─────────────────────────────────────────────────────────

  const addDateMutation = useMutation({
    mutationFn: (p: DatePopup) => {
      const iso = p.date
      if (project.days.some((d) => toIsoDate(d.date) === iso)) return Promise.resolve(null)
      return api.patch(`/status-rows/${project.id}`, {
        days: [
          ...buildDaysPayload(project.days),
          { date: new Date(iso).toISOString(), type: p.type, startTime: p.startTime || null, timeFrom: p.timeFrom || null, timeTo: p.timeTo || null, allDay: p.allDay, firstMotor: p.firstMotor || null },
        ],
      }).then((r) => r.data)
    },
    onSuccess: () => { onUpdated(); setDatePopup(null) },
  })

  const updateDayMutation = useMutation({
    mutationFn: (p: DatePopup) => {
      const exists = project.days.some((d) => toIsoDate(d.date) === p.origDate)
      let days
      if (exists) {
        // обновляем существующий день
        days = project.days.map((d) =>
          toIsoDate(d.date) === p.origDate
            ? { id: d.id, date: p.date ? new Date(p.date).toISOString() : d.date, type: p.type, startTime: p.startTime || null, timeFrom: p.timeFrom || null, timeTo: p.timeTo || null, allDay: p.allDay, firstMotor: p.firstMotor || null }
            : { id: d.id, date: d.date, type: d.type, startTime: d.startTime ?? null, timeFrom: d.timeFrom ?? null, timeTo: d.timeTo ?? null, allDay: d.allDay ?? false, firstMotor: d.firstMotor ?? null }
        )
      } else {
        // основная дата ещё не в days — добавляем
        days = [
          ...buildDaysPayload(project.days),
          { date: new Date(p.origDate).toISOString(), type: p.type, startTime: p.startTime || null, timeFrom: p.timeFrom || null, timeTo: p.timeTo || null, allDay: p.allDay, firstMotor: p.firstMotor || null },
        ]
      }
      return api.patch(`/status-rows/${project.id}`, { days }).then((r) => r.data)
    },
    onSuccess: () => { onUpdated(); setDatePopup(null) },
  })

  const removeDateMutation = useMutation({
    mutationFn: (date: string) => {
      const remaining = project.days
        .filter((d) => toIsoDate(d.date) !== date)
        .map((d) => ({ id: d.id, date: d.date, type: d.type, startTime: d.startTime ?? null, timeFrom: d.timeFrom ?? null, timeTo: d.timeTo ?? null, allDay: d.allDay ?? false, firstMotor: d.firstMotor ?? null }))
      return api.patch(`/status-rows/${project.id}`, { days: remaining }).then((r) => r.data)
    },
    onSuccess: onUpdated,
  })

  const openAddDate = () => setDatePopup({ mode: 'add', origDate: '', date: '', type: 'efir', timeFrom: '', timeTo: '', startTime: '', allDay: false, firstMotor: '' })
  const openEditDate = (entry: { date: string; type: string; isMain?: boolean }) => {
    const day = project.days.find((d) => toIsoDate(d.date) === entry.date)
    setDatePopup({ mode: 'edit', origDate: entry.date, date: entry.date, type: entry.type, isMain: entry.isMain, timeFrom: day?.timeFrom ?? '', timeTo: day?.timeTo ?? '', startTime: day?.startTime ?? '', allDay: day?.allDay ?? false, firstMotor: day?.firstMotor ?? '' })
  }
  const closePopup = () => setDatePopup(null)
  const submitPopup = () => {
    if (!datePopup) return
    if (datePopup.mode === 'add') { if (datePopup.date) addDateMutation.mutate(datePopup) }
    else updateDayMutation.mutate(datePopup)
  }
  const datePopupPending = addDateMutation.isPending || updateDayMutation.isPending

  const inputS: React.CSSProperties = { width: '100%', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 8px', fontSize: 12, color: '#1e293b', fontFamily: 'inherit', outline: 'none', background: '#fff', boxSizing: 'border-box' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Content — left info panel always visible */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <ProjectInfoPanel project={project} onSave={saveField} />
        <TeamTable
          project={project}
          members={members}
          loading={membersLoading}
          onUpdated={onUpdated}
          microTab={microTab}
          setMicroTab={setMicroTab}
          onCopy={() => { if (!copyProject.isPending) copyProject.mutate() }}
          onDelete={() => setShowDeleteConfirm(true)}
          copyPending={copyProject.isPending}
          deletePending={deleteProject.isPending}
          groupSchedule={groupSchedule}
          onGroupScheduleUpdate={(patch) => updateGroupSchedule.mutate(patch)}
        />
      </div>

      {/* Delete confirm modal */}
      {showDeleteConfirm && (
        <DeleteConfirmModal
          name={project.name}
          onConfirm={() => { setShowDeleteConfirm(false); deleteProject.mutate() }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {/* Date popup (shared) */}
      {datePopup && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onMouseDown={closePopup}>
          <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 8px 40px rgba(0,0,0,0.18)', padding: 20, width: 300, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '90vh', overflowY: 'auto' }}
            onMouseDown={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
              {datePopup.mode === 'add' ? 'Добавить дату' : 'Редактировать дату'}
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 4 }}>Дата</label>
              <input type="date" value={datePopup.date} onChange={(e) => setDatePopup((p) => p ? { ...p, date: e.target.value } : null)} style={inputS} />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 4 }}>Тип</label>
              <select value={datePopup.type} onChange={(e) => setDatePopup((p) => p ? { ...p, type: e.target.value } : null)} style={inputS}>
                <option value="zastroyka">Застройка</option>
                <option value="efir">Эфир</option>
                <option value="deadline">Дедлайн</option>
                <option value="semka">Съёмка</option>
              </select>
            </div>
            {datePopup.type === 'efir' && (
              <>
                <div style={{ display: 'flex', gap: 8 }}>
                  <TimeField label="Начало" value={datePopup.timeFrom} onChange={(v) => setDatePopup((p) => p ? { ...p, timeFrom: v } : null)} />
                  <TimeField label="Конец" value={datePopup.timeTo} onChange={(v) => setDatePopup((p) => p ? { ...p, timeTo: v } : null)} />
                </div>
                <TimeField label="Начало эфира" value={datePopup.startTime} onChange={(v) => setDatePopup((p) => p ? { ...p, startTime: v } : null)} />
              </>
            )}
            {datePopup.type === 'zastroyka' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <TimeField label="Начало" value={datePopup.timeFrom} onChange={(v) => setDatePopup((p) => p ? { ...p, timeFrom: v } : null)} />
                <TimeField label="Конец" value={datePopup.timeTo} onChange={(v) => setDatePopup((p) => p ? { ...p, timeTo: v } : null)} />
              </div>
            )}
            {datePopup.type === 'semka' && (
              <>
                <div style={{ display: 'flex', gap: 8 }}>
                  <TimeField label="Начало" value={datePopup.timeFrom} onChange={(v) => setDatePopup((p) => p ? { ...p, timeFrom: v } : null)} />
                  <TimeField label="Конец" value={datePopup.timeTo} onChange={(v) => setDatePopup((p) => p ? { ...p, timeTo: v } : null)} />
                </div>
                <TimeField label="Первый мотор" value={datePopup.firstMotor} onChange={(v) => setDatePopup((p) => p ? { ...p, firstMotor: v } : null)} />
              </>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" id="allday-chk" checked={datePopup.allDay} onChange={(e) => setDatePopup((p) => p ? { ...p, allDay: e.target.checked } : null)} style={{ width: 16, height: 16 }} />
              <label htmlFor="allday-chk" style={{ fontSize: 12, color: '#1e293b', cursor: 'pointer' }}>Весь день</label>
            </div>
            <div style={{ display: 'flex', gap: 6, paddingTop: 4 }}>
              <button onClick={submitPopup} disabled={!datePopup.date || datePopupPending}
                style={{ flex: 1, fontSize: 12, padding: '7px', borderRadius: 6, border: '1px solid #2563eb', background: '#2563eb', color: '#fff', cursor: (!datePopup.date || datePopupPending) ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: (!datePopup.date || datePopupPending) ? 0.6 : 1 }}>
                {datePopupPending ? '...' : datePopup.mode === 'add' ? 'Добавить' : 'Сохранить'}
              </button>
              {datePopup.mode === 'edit' && !datePopup.isMain && (
                <button onClick={() => { removeDateMutation.mutate(datePopup.origDate); closePopup() }}
                  style={{ fontSize: 12, padding: '7px 10px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff', color: '#ef4444', cursor: 'pointer' }}>
                  Удалить
                </button>
              )}
              <button onClick={closePopup}
                style={{ flex: 1, fontSize: 12, padding: '7px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: 'pointer' }}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── InfoField (helper for ProjectInfoPanel) ──────────────────────────────────

function InfoField({ label, fieldKey, value, onSave }: {
  label: string; fieldKey: string; value: string | null
  onSave: (k: string, v: unknown) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [hovered, setHovered] = useState(false)
  const commit = () => {
    if ((draft.trim() || null) !== (value || null)) onSave(fieldKey, draft.trim() || null)
    setEditing(false)
  }
  return (
    <div style={{ padding: '9px 14px', borderBottom: '1px solid #f8fafc' }}>
      <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: 3 }}>{label}</div>
      {editing ? (
        <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false) } }}
          style={{ fontSize: 13, padding: '2px 6px', border: '1px solid #3b82f6', borderRadius: 5, width: '100%', boxSizing: 'border-box' as const, outline: 'none', color: '#1e293b', fontFamily: 'inherit' }} />
      ) : (
        <div onClick={() => { setDraft(value ?? ''); setEditing(true) }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          title="Нажмите для редактирования"
          style={{ fontSize: 13, color: value ? '#1e293b' : '#94a3b8', cursor: 'text', minHeight: 18, fontWeight: value ? 500 : 400, border: hovered ? '1px solid #cbd5e1' : '1px solid transparent', borderRadius: 4, padding: '1px 5px', margin: '0 -5px', background: hovered ? '#f8fafc' : 'transparent', transition: 'all 0.1s' }}>
          {value || 'Не указано'}
        </div>
      )}
    </div>
  )
}

// ─── ProjectInfoPanel ──────────────────────────────────────────────────────

function buildDaysPayload(days: ProjectDay[]) {
  return days.map((d) => ({
    id: d.id, date: d.date, type: d.type,
    startTime: d.startTime ?? null,
    timeFrom: d.timeFrom ?? null,
    timeTo: d.timeTo ?? null,
    allDay: d.allDay ?? false,
    firstMotor: d.firstMotor ?? null,
  }))
}

type DatePopup = {
  mode: 'add' | 'edit'
  origDate: string        // original ISO date (key for edit)
  date: string            // date input value (YYYY-MM-DD)
  type: string
  isMain?: boolean
  timeFrom: string
  timeTo: string
  startTime: string       // начало эфира (efir) — reused for съёмка first motor display
  allDay: boolean
  firstMotor: string
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ flex: 1 }}>
      <label style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 3 }}>{label}</label>
      <input type="time" step={1800} value={value} onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 8px', fontSize: 12, color: '#1e293b', fontFamily: 'inherit', outline: 'none', background: '#fff', boxSizing: 'border-box' as const }} />
    </div>
  )
}

function ProjectInfoPanel({ project, onSave }: {
  project: MicroProject
  onSave: (key: string, value: unknown) => void
}) {
  const qc = useQueryClient()
  const [editingStatus, setEditingStatus] = useState(false)
  const [notesDraft, setNotesDraft] = useState(project.notes ?? '')
  const statusRef = useRef<HTMLDivElement>(null)
  const [dropRect, setDropRect] = useState<{ top: number; left: number; width: number } | null>(null)

  const { data: fieldApprovals = {} } = useQuery<Record<string, boolean>>({
    queryKey: ['field-approvals', project.id],
    queryFn: () => api.get(`/status-rows/${project.id}/approvals`).then((r) => r.data),
    staleTime: 30_000,
  })
  const toggleFieldApproval = useMutation({
    mutationFn: (field: string) =>
      api.patch(`/status-rows/${project.id}/approvals`, { [field]: !fieldApprovals[field] }).then((r) => r.data),
    onSuccess: (data) => qc.setQueryData(['field-approvals', project.id], data),
  })

  const { data: kfpdRaw } = useQuery<{ columns: string[]; rows: string[][] }>({
    queryKey: ['kfpd-preview'],
    queryFn: () => api.get('/database/preview/kfpd').then((r) => r.data),
    staleTime: 5 * 60_000,
  })
  const producerOptions: string[] = kfpdRaw
    ? [...new Set(kfpdRaw.rows.map((r) => r[2] ?? '').filter(Boolean))]
    : []

  useEffect(() => { setNotesDraft(project.notes ?? '') }, [project.id, project.notes])

  const openStatus = () => {
    const rect = statusRef.current?.getBoundingClientRect()
    setDropRect(rect ? { top: rect.bottom + 2, left: rect.left, width: rect.width } : null)
    setEditingStatus(true)
  }

  return (
    <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid #e2e8f0', background: '#fafafa', display: 'flex', flexDirection: 'column', gap: 10, padding: 14, overflowY: 'auto' }}>

      {/* Block 1: static fields */}
      <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 10, overflow: 'hidden' }}>
        {/* Status */}
        <div style={{ padding: '9px 14px', borderBottom: '1px solid #f8fafc' }}>
          <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: 3 }}>Статус</div>
          <div ref={statusRef} onClick={openStatus} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[project.status] ?? '#94a3b8', flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: STATUS_COLORS[project.status] ?? '#475569', fontWeight: 500 }}>
              {STATUS_LABELS[project.status] ?? project.status}
            </span>
          </div>
          {editingStatus && dropRect && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 499 }} onClick={() => setEditingStatus(false)} />
              <div style={{ position: 'fixed', top: dropRect.top, left: dropRect.left, minWidth: Math.max(dropRect.width, 160), zIndex: 500, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, boxShadow: '0 4px 14px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <div key={k} onClick={() => { onSave('status', k); setEditingStatus(false) }}
                    style={{ padding: '7px 12px', fontSize: 12, cursor: 'pointer', color: STATUS_COLORS[k] ?? '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLORS[k], display: 'inline-block' }} />
                    {v}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        {FORMATS_WITH_LOCATION.includes(project.format ?? '') && (
          <ProducerField label="Локация"        fieldKey="location"      value={project.location}      options={LOCATION_OPTIONS} onSave={onSave} isApproved={fieldApprovals['location']}     onApprovalToggle={() => toggleFieldApproval.mutate('location')} />
        )}
        <ProducerField label="Исп. продюсер"  fieldKey="execProducer"  value={project.execProducer}  options={producerOptions}    onSave={onSave} isApproved={fieldApprovals['execProducer']} onApprovalToggle={() => toggleFieldApproval.mutate('execProducer')} />
        <ProducerField label="Лайн-продюсер"  fieldKey="lineProducer"  value={project.lineProducer}  options={producerOptions}    onSave={onSave} isApproved={fieldApprovals['lineProducer']} onApprovalToggle={() => toggleFieldApproval.mutate('lineProducer')} />
      </div>

      {/* Block 2: Описание */}
      <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div style={{ padding: '9px 12px 8px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Описание задачи для отдела</span>
        </div>
        <textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          onBlur={() => { if ((notesDraft.trim() || null) !== (project.notes || null)) onSave('notes', notesDraft.trim() || null) }}
          placeholder="Добавьте описание..."
          style={{ flex: 1, resize: 'none', border: 'none', outline: 'none', padding: '10px 12px', fontSize: 12, color: '#1e293b', fontFamily: 'inherit', background: 'transparent', lineHeight: 1.5, minHeight: 80 }}
        />
      </div>
    </div>
  )
}


// ─── GroupDateBlock ───────────────────────────────────────────────────────────

function GroupDateBlock({ groupId, color, sched, onSave, startTimeLabel = 'Начало эфира' }: {
  groupId: string
  color: string
  sched: GroupScheduleEntry
  onSave: (patch: Partial<GroupScheduleEntry>) => void
  startTimeLabel?: string
}) {
  const baseId = /^efir_\d+$/.test(groupId) ? 'efir' : groupId
  const fields = GROUP_FIELDS[baseId] ?? GROUP_FIELDS.default
  const inpS: React.CSSProperties = {
    fontSize: 11, padding: '3px 6px', border: '1px solid #e2e8f0', borderRadius: 5,
    color: '#1e293b', background: 'rgba(255,255,255,0.8)', fontFamily: 'inherit',
    outline: 'none', width: '100%', boxSizing: 'border-box' as const,
  }
  const rowS: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2 }
  const lblS: React.CSSProperties = { fontSize: 9, color: color, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px', background: color + '08', minWidth: 150 }}>
      {fields.includes('date') && (
        <div style={rowS}>
          <span style={lblS}>Дата</span>
          <input type="date" value={sched.date ?? ''} onChange={(e) => onSave({ date: e.target.value || undefined })} style={inpS} />
        </div>
      )}
      {fields.includes('time') && (
        <div style={rowS}>
          <span style={lblS}>Время</span>
          <input type="time" step={1800} value={sched.time ?? ''} onChange={(e) => onSave({ time: e.target.value || undefined })} style={inpS} />
        </div>
      )}
      {fields.includes('timeFrom') && (
        <div style={rowS}>
          <span style={lblS}>Время</span>
          <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
            <input type="time" step={1800} value={sched.timeFrom ?? ''} onChange={(e) => onSave({ timeFrom: e.target.value || undefined })} style={{ ...inpS, flex: 1 }} />
            <span style={{ color: '#94a3b8', fontSize: 10, flexShrink: 0 }}>—</span>
            <input type="time" step={1800} value={sched.timeTo ?? ''} onChange={(e) => onSave({ timeTo: e.target.value || undefined })} style={{ ...inpS, flex: 1 }} />
          </div>
        </div>
      )}
      {fields.includes('startTime') && (
        <div style={rowS}>
          <span style={lblS}>{startTimeLabel}</span>
          <input type="time" step={1800} value={sched.startTime ?? ''} onChange={(e) => onSave({ startTime: e.target.value || undefined })} style={inpS} />
        </div>
      )}
    </div>
  )
}

// ─── MemberRow ────────────────────────────────────────────────────────────────

function fieldApprovalStyle(approved: boolean | undefined): React.CSSProperties {
  if (approved === true) return { borderColor: '#22c55e', borderWidth: 1 }
  return { borderColor: '#f97316', borderWidth: 2, background: 'rgba(249,115,22,0.09)' }
}

function MemberRow({
  m, isC, updateMember, removeMember, onFieldApprovalToggle, onDragStart, isDragging, rightCell, inputS, cellBdr,
}: {
  m: ProjectMember
  isC: (col: string) => boolean
  updateMember: (data: { id: string; name?: string; position?: string | null; employmentType?: string | null; ratePlan?: number | null; rateFact?: number | null; isApproved?: boolean; fieldApprovals?: Record<string, boolean>; groupName?: string | null; telegramUsername?: string | null; isFreelancer?: boolean; paymentType?: string | null; paymentStatus?: string; paymentAmount?: number | null }) => void
  removeMember: (id: string) => void
  onFieldApprovalToggle: (m: ProjectMember, field: string) => void
  onDragStart: (e: React.PointerEvent, m: ProjectMember) => void
  isDragging: boolean
  rightCell?: React.ReactNode
  inputS: React.CSSProperties
  cellBdr: string
}) {
  const [name, setName] = useState(m.name)
  const [pos, setPos] = useState(m.position ?? '')
  const [empType, setEmpType] = useState(m.employment_type ?? '')
  const [ratePlan, setRatePlan] = useState(m.rate_plan ?? '')
  const [rateFact, setRateFact] = useState(m.rate_fact ?? '')
  const [ratePlanFocused, setRatePlanFocused] = useState(false)
  const [rateFacrFocused, setRateFacrFocused] = useState(false)
  const [tg, setTg] = useState(m.telegram_username ?? '')

  useEffect(() => { setName(m.name) }, [m.id, m.name])
  useEffect(() => { setPos(m.position ?? '') }, [m.id, m.position])
  useEffect(() => { setEmpType(m.employment_type ?? '') }, [m.id, m.employment_type])
  useEffect(() => { setRatePlan(m.rate_plan ?? '') }, [m.id, m.rate_plan])
  useEffect(() => { setRateFact(m.rate_fact ?? '') }, [m.id, m.rate_fact])
  useEffect(() => { setTg(m.telegram_username ?? '') }, [m.id, m.telegram_username])

  const fa = m.field_approvals ?? {}
  const mkCtx = (field: string) => (e: React.MouseEvent) => { e.preventDefault(); onFieldApprovalToggle(m, field) }

  return (
    <tr style={{ opacity: isDragging ? 0.35 : 1, transition: 'opacity 0.15s' }}>
      {/* Drag handle */}
      <td style={{ width: 22, borderBottom: cellBdr, textAlign: 'center', padding: '0 3px', cursor: 'grab', userSelect: 'none' }}
        onPointerDown={(e) => onDragStart(e, m)}>
        <span style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, width: 12, margin: '0 auto' }}>
          {[0,1,2,3,4,5].map((i) => (
            <span key={i} style={{ width: 3, height: 3, borderRadius: '50%', background: '#94a3b8', display: 'block' }} />
          ))}
        </span>
      </td>
      {isC('name') ? <td style={{ width: 20, borderBottom: cellBdr }} /> : (
        <td style={{ padding: '4px 14px', borderBottom: cellBdr }}>
          <input value={name} onChange={(e) => setName(e.target.value)}
            onContextMenu={mkCtx('name')}
            onBlur={() => { const v = name.trim() || m.name; if (v !== m.name) updateMember({ id: m.id, name: v }) }}
            style={{ ...inputS, ...fieldApprovalStyle(fa['name']), width: '100%', fontWeight: 600 }} />
        </td>
      )}
      {isC('emp') ? <td style={{ width: 20, borderBottom: cellBdr }} /> : (
        <td style={{ padding: '4px 10px', borderBottom: cellBdr }}>
          <select value={empType}
            onContextMenu={mkCtx('emp')}
            onChange={(e) => { setEmpType(e.target.value); updateMember({ id: m.id, employmentType: e.target.value || null }) }}
            style={{ ...inputS, ...fieldApprovalStyle(fa['emp']), width: '100%' }}>
            <option value="">—</option>
            {Object.entries(EMP_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </td>
      )}
      {isC('pos') ? <td style={{ width: 20, borderBottom: cellBdr }} /> : (
        <td style={{ padding: '4px 10px', borderBottom: cellBdr }}>
          <input value={pos} onChange={(e) => setPos(e.target.value)} placeholder="Должность"
            onContextMenu={mkCtx('pos')}
            onBlur={() => { const v = pos.trim() || null; if (v !== m.position) updateMember({ id: m.id, position: v }) }}
            style={{ ...inputS, ...fieldApprovalStyle(fa['pos']), width: '100%', color: '#64748b' }} />
        </td>
      )}
      {isC('ratePlan') ? <td style={{ width: 20, borderBottom: cellBdr }} /> : (
        <td style={{ padding: '4px 10px', borderBottom: cellBdr, textAlign: 'right' }}>
          <input type="text" inputMode="numeric"
            value={ratePlanFocused ? ratePlan : fmtPrice(ratePlan)}
            onFocus={() => setRatePlanFocused(true)}
            onContextMenu={mkCtx('ratePlan')}
            onChange={(e) => setRatePlan(e.target.value.replace(/[^\d.]/g, ''))}
            onBlur={() => { setRatePlanFocused(false); const v = ratePlan !== '' ? parseFloat(ratePlan) : null; if (v !== (m.rate_plan != null ? parseFloat(m.rate_plan) : null)) updateMember({ id: m.id, ratePlan: v }) }}
            placeholder="—" style={{ ...inputS, ...fieldApprovalStyle(fa['ratePlan']), width: '100%', textAlign: 'right' }} />
        </td>
      )}
      {isC('rateFact') ? <td style={{ width: 20, borderBottom: cellBdr }} /> : (
        <td style={{ padding: '4px 10px', borderBottom: cellBdr, textAlign: 'right' }}>
          <input type="text" inputMode="numeric"
            value={rateFacrFocused ? rateFact : fmtPrice(rateFact)}
            disabled={m.employment_type === 'staff'}
            onFocus={() => setRateFacrFocused(true)}
            onContextMenu={mkCtx('rateFact')}
            onChange={(e) => setRateFact(e.target.value.replace(/[^\d.]/g, ''))}
            onBlur={() => { setRateFacrFocused(false); const v = rateFact !== '' ? parseFloat(rateFact) : null; if (v !== (m.rate_fact != null ? parseFloat(m.rate_fact) : null)) updateMember({ id: m.id, rateFact: v }) }}
            placeholder="—" style={{ ...inputS, ...fieldApprovalStyle(fa['rateFact']), width: '100%', textAlign: 'right', ...(m.employment_type === 'staff' ? { background: '#f1f5f9', color: '#cbd5e1', cursor: 'not-allowed' } : {}) }} />
        </td>
      )}
      {isC('tg') ? <td style={{ width: 20, borderBottom: cellBdr }} /> : (
        <td style={{ padding: '4px 10px', borderBottom: cellBdr }}>
          <input value={tg} onChange={(e) => setTg(e.target.value)} placeholder="@username"
            onBlur={() => { const v = tg.trim() || null; if (v !== m.telegram_username) updateMember({ id: m.id, telegramUsername: v }) }}
            style={{ ...inputS, width: '100%', color: '#64748b', fontFamily: 'monospace' }} />
        </td>
      )}
      <td style={{ padding: '4px 6px', borderBottom: cellBdr, textAlign: 'center' }}>
        <HoldToDelete onDelete={() => removeMember(m.id)} />
      </td>
      {rightCell}
    </tr>
  )
}

// ─── TeamTable ────────────────────────────────────────────────────────────────

function TeamTable({ project, members, loading, onUpdated, microTab, setMicroTab, onCopy, onDelete, copyPending, deletePending, groupSchedule, onGroupScheduleUpdate }: {
  project: MicroProject
  members: ProjectMember[]
  loading: boolean
  onUpdated: () => void
  microTab: 'team' | 'planner' | 'expenses' | 'freelancers'
  setMicroTab: (t: 'team' | 'planner' | 'expenses' | 'freelancers') => void
  onCopy: () => void
  onDelete: () => void
  copyPending: boolean
  deletePending: boolean
  groupSchedule: Record<string, GroupScheduleEntry | null>
  onGroupScheduleUpdate: (patch: Record<string, GroupScheduleEntry | null>) => void
}) {
  const qc = useQueryClient()

  // Collapsible columns
  const [collapsedCols, setCollapsedCols] = useState<Set<string>>(new Set())
  const toggleCol = (col: string) => setCollapsedCols((prev) => {
    const next = new Set(prev); if (next.has(col)) next.delete(col); else next.add(col); return next
  })
  const isC = (col: string) => collapsedCols.has(col)

  // ── Drag state ──────────────────────────────────────────────────────────────
  const [dragMember, setDragMember] = useState<ProjectMember | null>(null)
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 })
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null)
  const groupBodyRefs = useRef<Record<string, HTMLTableSectionElement | null>>({})

  useEffect(() => {
    if (!dragMember) return
    const onMove = (e: PointerEvent) => {
      setDragPos({ x: e.clientX, y: e.clientY })
      // Find which group tbody we're over
      let found: string | null = null
      for (const [gid, el] of Object.entries(groupBodyRefs.current)) {
        if (!el) continue
        const r = el.getBoundingClientRect()
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          found = gid; break
        }
      }
      setDragOverGroup(found)
    }
    const onUp = () => {
      if (dragMember && dragOverGroup && dragOverGroup !== dragMember.group_name) {
        updateMember.mutate({ id: dragMember.id, groupName: dragOverGroup === 'ungrouped' ? null : dragOverGroup })
      }
      setDragMember(null)
      setDragOverGroup(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dragMember, dragOverGroup])

  const startDrag = (e: React.PointerEvent, m: ProjectMember) => {
    e.preventDefault()
    setDragMember(m)
    setDragPos({ x: e.clientX, y: e.clientY })
  }

  // ── Groups ──────────────────────────────────────────────────────────────────
  const fmt = project.format ?? ''
  const loc = project.location ?? ''
  const isCreative = CREATIVE_FORMATS.includes(fmt)
  const hasLocationPreset = FORMATS_WITH_LOCATION.includes(fmt)
  const isViezd = hasLocationPreset && loc.startsWith('Выезд')
  const isStudio = hasLocationPreset && !isViezd && loc !== ''
  const activeGroupDefs = isViezd ? VIEZD_GROUPS : isStudio ? STUDIO_GROUPS : []
  const hasGroups = activeGroupDefs.length > 0

  const efirLabel = fmt === 'Съемки' ? 'Съёмки' : 'Эфир'

  const efirCopyIds = useMemo(() =>
    Object.entries(groupSchedule)
      .filter(([k, v]) => /^efir_\d+$/.test(k) && v != null)
      .map(([k]) => k)
      .sort(),
  [groupSchedule])

  const groups = useMemo(() => {
    if (!hasGroups) {
      return [{ id: 'default', label: 'Команда', color: '#64748b', members }]
    }
    const efirDef = activeGroupDefs.find((g) => g.id === 'efir')
    const allDefinedIds = new Set([...activeGroupDefs.map((g) => g.id), ...efirCopyIds])
    const result: { id: string; label: string; color: string; members: ProjectMember[] }[] = []
    for (const g of activeGroupDefs) {
      result.push({ ...g, label: g.id === 'efir' ? efirLabel : g.label, members: members.filter((m) => m.group_name === g.id) })
      if (g.id === 'efir' && efirDef) {
        for (const copyId of efirCopyIds) {
          result.push({ id: copyId, label: efirLabel, color: efirDef.color, members: members.filter((m) => m.group_name === copyId) })
        }
      }
    }
    const ungroupedMembers = members.filter((m) => !m.group_name || !allDefinedIds.has(m.group_name))
    if (ungroupedMembers.length > 0) {
      result.push({ id: 'ungrouped', label: 'Без группы', color: '#94a3b8', members: ungroupedMembers })
    }
    return result
  }, [members, hasGroups, activeGroupDefs, efirLabel, efirCopyIds])

  const copyEfirGroup = () => {
    const nums = efirCopyIds.map((id) => parseInt(id.replace('efir_', ''), 10))
    const next = nums.length > 0 ? Math.max(...nums) + 1 : 2
    onGroupScheduleUpdate({ [`efir_${next}`]: {} })
  }

  const deleteEfirCopy = (copyId: string) => {
    members.filter((m) => m.group_name === copyId).forEach((m) => updateMember.mutate({ id: m.id, groupName: null }))
    onGroupScheduleUpdate({ [copyId]: null })
  }

  // ── Mutations ───────────────────────────────────────────────────────────────
  const createMember = useMutation({
    mutationFn: (groupName: string | null = null) => api.post('/project-members', {
      projectId: project.id, name: 'Новый участник', position: null, employmentType: null, ratePlan: null, rateFact: null, groupName,
    }).then((r) => r.data),
    onSuccess: (created: ProjectMember) => {
      qc.setQueryData(['project-members', project.id], (old: ProjectMember[] | undefined) => [...(old ?? []), created])
    },
  })

  const createFreelancer = useMutation({
    mutationFn: () => api.post('/project-members', {
      projectId: project.id, name: 'Новый фрил', position: null, isFreelancer: true,
    }).then((r) => r.data),
    onSuccess: (created: ProjectMember) => {
      qc.setQueryData(['project-members', project.id], (old: ProjectMember[] | undefined) => [...(old ?? []), created])
    },
  })

  const updateMember = useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; position?: string | null; employmentType?: string | null; ratePlan?: number | null; rateFact?: number | null; isApproved?: boolean; fieldApprovals?: Record<string, boolean>; groupName?: string | null; telegramUsername?: string | null; isFreelancer?: boolean; paymentType?: string | null; paymentStatus?: string; paymentAmount?: number | null }) =>
      api.patch(`/project-members/${id}`, data).then((r) => r.data),
    onSuccess: (updated: any) => {
      qc.setQueryData(['project-members', project.id], (old: ProjectMember[] | undefined) =>
        (old ?? []).map((m) => m.id === updated.id ? { ...m, ...updated } : m)
      )
    },
  })

  const removeMember = useMutation({
    mutationFn: (id: string) => api.delete(`/project-members/${id}`).then((r) => r.data),
    onSuccess: (_, deletedId) =>
      qc.setQueryData(['project-members', project.id], (old: ProjectMember[] | undefined) =>
        old?.filter((m) => m.id !== deletedId)
      ),
  })

  const toggleFieldApproval = (member: ProjectMember, field: string) => {
    const current = member.field_approvals?.[field] ?? false
    updateMember.mutate({ id: member.id, fieldApprovals: { [field]: !current } })
  }

  const inputS: React.CSSProperties = { fontSize: 12, padding: '3px 7px', border: '1px solid #e2e8f0', borderRadius: 5, color: '#1e293b', background: '#fff' }

  const [callSheetOpen, setCallSheetOpen] = useState(false)
  const [callSheetMode, setCallSheetMode] = useState<'plain' | 'telegram'>('plain')

  const callSheetText = useMemo(() => {
    const fmtTime = (t?: string) => t ? t.substring(0, 5) : ''
    const fmtRange = (entry?: GroupScheduleEntry | null) => {
      if (!entry) return ''
      const from = fmtTime(entry.timeFrom)
      const to = fmtTime(entry.timeTo)
      if (from && to) return `${from}–${to}`
      if (from) return `с ${from}`
      return ''
    }
    const fmtDate = (entry?: GroupScheduleEntry | null) => {
      if (!entry?.date) return ''
      try { return new Date(entry.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) } catch { return '' }
    }

    const lines: string[] = []
    lines.push(project.name)
    lines.push('')

    const allGroups = [...groups, ...efirCopyIds.map((copyId) => {
      const copyEntry = groupSchedule[copyId]
      return { id: copyId, label: `${efirLabel} (копия)`, color: '#10b981', members: members.filter((m) => m.group_name === copyId), extra: copyEntry }
    })]

    for (const g of allGroups) {
      const gs = groupSchedule[g.id]
      const dateStr = fmtDate(gs)
      const timeStr = fmtRange(gs)
      const header = [g.label, dateStr, timeStr].filter(Boolean).join(' · ')
      lines.push(`— ${header} —`)
      for (const m of g.members) {
        const timeDisplay = timeStr || ''
        const identity = callSheetMode === 'telegram' && m.telegram_username
          ? m.telegram_username
          : m.name
        const pos = m.position ? ` (${m.position})` : ''
        lines.push(`${identity}${pos}${timeDisplay ? ` · ${timeDisplay}` : ''}`)
      }
      lines.push('')
    }

    return lines.join('\n').trim()
  }, [groups, groupSchedule, members, project.name, callSheetMode, efirLabel, efirCopyIds])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      {/* View toggle bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', borderBottom: '1px solid #f1f5f9', flexShrink: 0, gap: 8 }}>
        <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: 7, overflow: 'hidden' }}>
          <button onClick={() => setMicroTab('team')}
            style={{ fontSize: 12, padding: '5px 14px', border: 'none', cursor: 'pointer', background: microTab === 'team' ? '#2563eb' : '#fff', color: microTab === 'team' ? '#fff' : '#64748b', fontFamily: 'inherit' }}>
            Команда
          </button>
          <button onClick={() => setMicroTab('planner')}
            style={{ fontSize: 12, padding: '5px 14px', border: 'none', cursor: 'pointer', background: microTab === 'planner' ? '#2563eb' : '#fff', color: microTab === 'planner' ? '#fff' : '#64748b', fontFamily: 'inherit' }}>
            Планировщик
          </button>
          <button onClick={() => setMicroTab('freelancers')}
            style={{ fontSize: 12, padding: '5px 14px', border: 'none', cursor: 'pointer', background: microTab === 'freelancers' ? '#2563eb' : '#fff', color: microTab === 'freelancers' ? '#fff' : '#64748b', fontFamily: 'inherit' }}>
            Фрилы
          </button>
          <button onClick={() => setMicroTab('expenses')}
            style={{ fontSize: 12, padding: '5px 14px', border: 'none', cursor: 'pointer', background: microTab === 'expenses' ? '#2563eb' : '#fff', color: microTab === 'expenses' ? '#fff' : '#64748b', fontFamily: 'inherit' }}>
            Производственные расходы
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {!isCreative && <button onClick={() => setCallSheetOpen(true)}
            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#2563eb', cursor: 'pointer', fontFamily: 'inherit' }}>
            Вызывной лист
          </button>}
          <button onClick={onCopy} disabled={copyPending}
            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'none', color: '#475569', cursor: 'pointer', fontFamily: 'inherit' }}>
            {copyPending ? '...' : 'Копировать'}
          </button>
          <button onClick={onDelete} disabled={deletePending}
            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #fecaca', background: 'none', color: '#ef4444', cursor: 'pointer', fontFamily: 'inherit' }}>
            {deletePending ? '...' : 'Удалить'}
          </button>
        </div>
      </div>

      {!loading && microTab === 'planner' && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {isCreative
            ? <KanbanBoard projectId={project.id} members={members} />
            : <ShiftPlanner
                projectId={project.id}
                projectDate={project.date}
                projectFormat={project.format}
                groups={groups}
                groupSchedule={groupSchedule}
                onGroupScheduleUpdate={onGroupScheduleUpdate}
              />
          }
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', display: microTab === 'planner' ? 'none' : undefined }}>
        {loading && <div style={{ padding: 20, color: '#94a3b8', fontSize: 13 }}>Загрузка...</div>}

        {!loading && microTab === 'team' && (
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ width: 22, borderBottom: '2px solid #e2e8f0' }} />
                {(['name','emp','pos','ratePlan','rateFact','tg'] as const).map((col) => {
                  const labels: Record<string, string> = { name:'ФИО', emp:'Формат', pos:'Должность', ratePlan:'Цена план', rateFact:'Цена факт', tg:'Telegram' }
                  const minWidths: Record<string, number> = { name:150, emp:80, pos:120, ratePlan:80, rateFact:80, tg:100 }
                  const aligns: Record<string, string> = { ratePlan:'right', rateFact:'right' }
                  const collapsed = isC(col)
                  return (
                    <th key={col} onDoubleClick={() => toggleCol(col)} title={collapsed ? `Показать «${labels[col]}»` : 'Двойной клик — скрыть столбец'}
                      style={{ borderBottom: '2px solid #e2e8f0', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', ...(collapsed
                        ? { width: 20, padding: '0 2px', textAlign: 'center', fontSize: 10, color: '#94a3b8', background: '#f8fafc' }
                        : { padding: col === 'name' ? '8px 14px' : '8px 10px', fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: (aligns[col] ?? 'left') as any, minWidth: minWidths[col], textTransform: 'uppercase', letterSpacing: '0.03em' }
                      )}}>
                      {collapsed ? '▶' : labels[col]}
                    </th>
                  )
                })}
                <th style={{ width: 30, borderBottom: '2px solid #e2e8f0' }} />
                {!isCreative && <th style={{ borderBottom: '2px solid #e2e8f0', borderLeft: '2px solid #e2e8f0', minWidth: 160, padding: '8px 10px', fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Дата / Время</th>}
              </tr>
            </thead>

            {/* Render each group as a separate <tbody> for drag targeting */}
            {groups.map((group) => {
              const isDropTarget = dragMember !== null && dragOverGroup === group.id && dragMember.group_name !== group.id
              return (
                <tbody
                  key={group.id}
                  ref={(el) => { groupBodyRefs.current[group.id] = el }}
                  style={{ outline: isDropTarget ? `2px solid ${group.color}` : 'none', outlineOffset: -2, transition: 'outline 0.1s' }}>
                  {(() => {
                    const sched: GroupScheduleEntry = (groupSchedule[group.id] as GroupScheduleEntry | null) ?? {}
                    const saveSched = (patch: Partial<GroupScheduleEntry>) =>
                      onGroupScheduleUpdate({ [group.id]: { ...sched, ...patch } })
                    const startTimeLabel = (group.id === 'efir' || /^efir_\d+$/.test(group.id))
                      ? (project.format === 'Съемки' ? 'Первый мотор' : 'Начало эфира')
                      : 'Начало эфира'
                    // rowSpan covers: (hasGroups ? 1 header row : 0) + members + 1 add row
                    const dateRowSpan = (hasGroups ? 1 : 0) + group.members.length + 1
                    const dateCell = isCreative ? null : (
                      <td rowSpan={dateRowSpan}
                        style={{ borderLeft: '2px solid #e2e8f0', borderBottom: '1px solid #eef0f4', padding: 0, verticalAlign: 'top', minWidth: 160 }}>
                        <GroupDateBlock groupId={group.id} color={group.color} sched={sched} onSave={saveSched} startTimeLabel={startTimeLabel} />
                      </td>
                    )
                    return (
                      <>
                        {/* Group header row — date cell anchored here with rowSpan */}
                        {hasGroups ? (
                          <tr style={{ background: group.color + '0a', borderTop: '2px solid #f1f5f9' }}>
                            <td colSpan={8} style={{ padding: '4px 10px 3px', borderBottom: '1px solid #e2e8f0' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: group.color, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: group.color }} />
                                  {group.label}
                                </span>
                                <input
                                  key={`${group.id}-note`}
                                  placeholder="Пометка..."
                                  defaultValue={(groupSchedule[group.id] as GroupScheduleEntry | null | undefined)?.note ?? ''}
                                  onBlur={(e) => {
                                    const note = e.target.value || undefined
                                    const current = (groupSchedule[group.id] as GroupScheduleEntry | null) ?? {}
                                    onGroupScheduleUpdate({ [group.id]: { ...current, note } })
                                  }}
                                  style={{ fontSize: 11, padding: '2px 7px', border: '1px solid #e2e8f0', borderRadius: 4, color: '#475569', flex: 1, fontFamily: 'inherit', outline: 'none', background: 'transparent' }}
                                />
                                {group.id === 'efir' && (
                                  <button onClick={copyEfirGroup} title="Копировать блок"
                                    style={{ fontSize: 12, padding: '1px 8px', border: '1px solid #e2e8f0', borderRadius: 4, background: 'none', color: '#64748b', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, lineHeight: 1.4 }}>
                                    ⎘
                                  </button>
                                )}
                                {/^efir_\d+$/.test(group.id) && (
                                  <button onClick={() => deleteEfirCopy(group.id)} title="Удалить копию"
                                    style={{ fontSize: 13, padding: '1px 6px', border: '1px solid #fecaca', borderRadius: 4, background: 'none', color: '#ef4444', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, lineHeight: 1.4 }}>
                                    ×
                                  </button>
                                )}
                              </div>
                            </td>
                            {dateCell}
                          </tr>
                        ) : null}

                        {/* Member rows */}
                        {group.members.map((m, idx) => (
                          <MemberRow
                            key={m.id}
                            m={m}
                            isC={isC}
                            updateMember={(data) => updateMember.mutate(data)}
                            removeMember={(id) => removeMember.mutate(id)}
                            onFieldApprovalToggle={toggleFieldApproval}
                            onDragStart={startDrag}
                            isDragging={dragMember?.id === m.id}
                            rightCell={!hasGroups && idx === 0 ? dateCell : undefined}
                            inputS={inputS}
                            cellBdr="1px solid #eef0f4"
                          />
                        ))}

                        {/* + add row */}
                        <tr style={{ cursor: createMember.isPending ? 'default' : 'pointer', background: 'transparent' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                          <td colSpan={8} style={{ padding: '4px 14px', textAlign: 'center', color: isDropTarget ? group.color : '#94a3b8', fontSize: 16, borderBottom: '1px solid #eef0f4', fontWeight: isDropTarget ? 700 : 400, transition: 'color 0.1s' }}
                            onClick={() => { if (!createMember.isPending) createMember.mutate(hasGroups && group.id !== 'ungrouped' ? group.id : null) }}>
                            {createMember.isPending ? '…' : '+'}
                          </td>
                          {/* no-groups + no members: date cell goes here */}
                          {!hasGroups && group.members.length === 0 && dateCell}
                        </tr>
                      </>
                    )
                  })()}
                </tbody>
              )
            })}
          </table>
        )}

        {!loading && microTab === 'expenses' && (
          <ExpensesTab projectId={project.id} />
        )}

        {!loading && microTab === 'freelancers' && (
          <FreelancersTab members={members} updateMember={(data) => updateMember.mutate(data)} removeMember={(id) => removeMember.mutate(id)} addFreelancer={() => createFreelancer.mutate()} />
        )}
      </div>

      {/* Footer legend (only for team tab) */}
      {!loading && microTab === 'team' && (
        <div style={{ padding: '6px 14px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, background: '#fafafa' }}>
          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#94a3b8', marginLeft: 'auto' }}>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: '#3b82f6', verticalAlign: 'middle', marginRight: 4 }} />Участвует</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: '#e2e8f0', border: '1px solid #cbd5e1', verticalAlign: 'middle', marginRight: 4 }} />Не участвует</span>
          </div>
        </div>
      )}

      {/* Call sheet modal */}
      {callSheetOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setCallSheetOpen(false)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 480, maxWidth: '90vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: 14 }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Вызывной лист</span>
              <button onClick={() => setCallSheetOpen(false)} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>
            <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: 7, overflow: 'hidden', alignSelf: 'flex-start' }}>
              <button onClick={() => setCallSheetMode('plain')}
                style={{ fontSize: 12, padding: '5px 14px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: callSheetMode === 'plain' ? '#2563eb' : '#fff', color: callSheetMode === 'plain' ? '#fff' : '#64748b' }}>
                Текст
              </button>
              <button onClick={() => setCallSheetMode('telegram')}
                style={{ fontSize: 12, padding: '5px 14px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: callSheetMode === 'telegram' ? '#2563eb' : '#fff', color: callSheetMode === 'telegram' ? '#fff' : '#64748b' }}>
                Telegram
              </button>
            </div>
            <textarea readOnly value={callSheetText}
              style={{ flex: 1, minHeight: 260, fontFamily: 'monospace', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', resize: 'none', color: '#1e293b', lineHeight: 1.6 }} />
            <button onClick={() => navigator.clipboard.writeText(callSheetText)}
              style={{ fontSize: 13, padding: '8px 0', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
              Копировать
            </button>
          </div>
        </div>
      )}

      {/* Drag ghost — follows cursor */}
      {dragMember && (
        <div style={{
          position: 'fixed',
          left: dragPos.x + 14,
          top: dragPos.y - 12,
          zIndex: 9999,
          background: '#fff',
          border: '2px solid #3b82f6',
          borderRadius: 8,
          padding: '5px 12px',
          fontSize: 12,
          fontWeight: 600,
          color: '#1e293b',
          boxShadow: '0 8px 28px rgba(0,0,0,0.18)',
          pointerEvents: 'none',
          userSelect: 'none',
          transform: 'rotate(-1.5deg)',
          whiteSpace: 'nowrap',
          maxWidth: 220,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {dragMember.name}
          {dragOverGroup && (() => {
            const g = groups.find((g) => g.id === dragOverGroup)
            return g ? <span style={{ fontSize: 10, color: g.color, marginLeft: 6, fontWeight: 400 }}>→ {g.label}</span> : null
          })()}
        </div>
      )}
    </div>
  )
}

// ─── FreelancersTab ───────────────────────────────────────────────────────────

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  cash: 'Наличные', card: 'Карта', sbp: 'СБП', invoice: 'Счёт',
}
const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid: 'Не оплачено', pending: 'Ожидает', paid: 'Оплачено',
}
const PAYMENT_STATUS_COLORS: Record<string, string> = {
  unpaid: '#ef4444', pending: '#f59e0b', paid: '#10b981',
}

function FreelancersTab({ members, updateMember, removeMember, addFreelancer }: {
  members: ProjectMember[]
  updateMember: (data: { id: string; paymentType?: string | null; paymentStatus?: string }) => void
  removeMember: (id: string) => void
  addFreelancer: () => void
}) {
  const freelancers = members.filter((m) => m.is_freelancer || (m.employment_type && m.employment_type !== 'staff'))

  const thS: React.CSSProperties = { padding: '8px 10px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '2px solid #e2e8f0', background: '#f8fafc', textAlign: 'left' }
  const inputS: React.CSSProperties = { fontSize: 12, padding: '3px 7px', border: '1px solid #e2e8f0', borderRadius: 5, color: '#1e293b', background: '#fff', width: '100%' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: '#64748b' }}>{freelancers.length} фрил{freelancers.length === 1 ? '' : freelancers.length < 5 ? 'а' : 'ов'}</span>
        <button onClick={addFreelancer}
          style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#2563eb', cursor: 'pointer', fontFamily: 'inherit' }}>
          + Добавить фрила
        </button>
      </div>
      {freelancers.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
          Нет фрилансеров. Нажмите «+ Добавить фрила».
        </div>
      ) : (
        <div style={{ overflow: 'auto', flex: 1 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ ...thS, minWidth: 150 }}>ФИО</th>
                <th style={{ ...thS, minWidth: 90 }}>Формат</th>
                <th style={{ ...thS, minWidth: 110 }}>Должность</th>
                <th style={{ ...thS, minWidth: 80, textAlign: 'right' }}>Цена план</th>
                <th style={{ ...thS, minWidth: 80, textAlign: 'right' }}>Цена факт</th>
                <th style={{ ...thS, minWidth: 100, fontFamily: 'monospace' }}>Telegram</th>
                <th style={{ ...thS, minWidth: 130 }}>Формат оплаты</th>
                <th style={{ ...thS, width: 30 }} />
              </tr>
            </thead>
            <tbody>
              {freelancers.map((m) => (
                <FreelancerRow key={m.id} m={m} inputS={inputS} updateMember={updateMember} removeMember={removeMember} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function FreelancerRow({ m, inputS, updateMember, removeMember }: {
  m: ProjectMember
  inputS: React.CSSProperties
  updateMember: (data: { id: string; paymentType?: string | null; paymentStatus?: string }) => void
  removeMember: (id: string) => void
}) {
  const bdr = '1px solid #f1f5f9'
  const tdS: React.CSSProperties = { padding: '5px 10px', borderBottom: bdr }
  const roS: React.CSSProperties = { fontSize: 13, color: '#1e293b' }

  const billingMode = m.payment_type === 'month' ? 'month' : 'project'
  const status = m.payment_status ?? 'unpaid'

  return (
    <tr>
      <td style={tdS}>
        <span style={{ ...roS, fontWeight: 600 }}>{m.name}</span>
      </td>
      <td style={tdS}>
        <EmpBadge type={m.employment_type} />
      </td>
      <td style={tdS}>
        <span style={{ ...roS, color: '#64748b' }}>{m.position || '—'}</span>
      </td>
      <td style={{ ...tdS, textAlign: 'right' }}>
        <span style={{ ...roS, fontVariantNumeric: 'tabular-nums' }}>{m.rate_plan != null ? Number(m.rate_plan).toLocaleString('ru-RU') : '—'}</span>
      </td>
      <td style={{ ...tdS, textAlign: 'right' }}>
        <span style={{ ...roS, fontVariantNumeric: 'tabular-nums' }}>{m.rate_fact != null ? Number(m.rate_fact).toLocaleString('ru-RU') : '—'}</span>
      </td>
      <td style={tdS}>
        <span style={{ ...roS, fontFamily: 'monospace', color: '#64748b' }}>{m.telegram_username || '—'}</span>
      </td>
      <td style={tdS}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <select value={billingMode}
            onChange={(e) => updateMember({ id: m.id, paymentType: e.target.value === 'month' ? 'month' : null })}
            style={{ ...inputS }}>
            <option value="project">По проекту</option>
            <option value="month">По месяцу</option>
          </select>
          {billingMode === 'project' && (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: PAYMENT_STATUS_COLORS[status] ?? '#64748b', whiteSpace: 'nowrap' }}>
                {PAYMENT_STATUS_LABELS[status] ?? status}
              </span>
              {status !== 'pending' && status !== 'paid' && (
                <button onClick={() => updateMember({ id: m.id, paymentStatus: 'pending' })}
                  style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, border: '1px solid #fde68a', background: '#fffbeb', color: '#92400e', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                  Запросить
                </button>
              )}
              {status === 'pending' && (
                <button onClick={() => updateMember({ id: m.id, paymentStatus: 'paid' })}
                  style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#166534', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                  Оплачено
                </button>
              )}
              {status === 'paid' && (
                <button onClick={() => updateMember({ id: m.id, paymentStatus: 'unpaid' })}
                  style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, border: '1px solid #e2e8f0', background: 'none', color: '#94a3b8', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                  Сбросить
                </button>
              )}
            </div>
          )}
          {billingMode === 'month' && (
            <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>В разделе Фрилансеры</span>
          )}
        </div>
      </td>
      <td style={{ ...tdS, textAlign: 'center' }}>
        <HoldToDelete onDelete={() => removeMember(m.id)} />
      </td>
    </tr>
  )
}

// ─── ExpenseRow ───────────────────────────────────────────────────────────────

function ExpenseRow({ e, isC, inputS, tdS, updateExpense, deleteExpense, onUpload }: {
  e: ShiftExpense
  isC: (col: string) => boolean
  inputS: React.CSSProperties
  tdS: React.CSSProperties
  updateExpense: (data: Partial<ShiftExpense> & { id: string }) => void
  deleteExpense: (id: string) => void
  onUpload: (id: string) => void
}) {
  const [type, setType] = useState(e.expense_type ?? '')
  const [by, setBy] = useState(e.ordered_by ?? '')
  const [amount, setAmount] = useState(e.amount != null ? String(e.amount) : '')
  const [notes, setNotes] = useState(e.notes ?? '')

  useEffect(() => { setType(e.expense_type ?? '') }, [e.id, e.expense_type])
  useEffect(() => { setBy(e.ordered_by ?? '') }, [e.id, e.ordered_by])
  useEffect(() => { setAmount(e.amount != null ? String(e.amount) : '') }, [e.id, e.amount])
  useEffect(() => { setNotes(e.notes ?? '') }, [e.id, e.notes])

  const canUpload = !!(e.expense_type && e.ordered_by && e.amount)

  return (
    <tr>
      {isC('type') ? <td style={{ width: 20, borderBottom: '1px solid #f1f5f9' }} /> : (
        <td style={tdS}>
          <input value={type} onChange={(ev) => setType(ev.target.value)} placeholder="Тип расхода"
            onBlur={() => { if ((type.trim() || null) !== (e.expense_type || null)) updateExpense({ id: e.id, expense_type: type.trim() || e.expense_type } as any) }}
            style={{ ...inputS, width: '100%' }} />
        </td>
      )}
      {isC('by') ? <td style={{ width: 20, borderBottom: '1px solid #f1f5f9' }} /> : (
        <td style={tdS}>
          <input value={by} onChange={(ev) => setBy(ev.target.value)} placeholder="Кто заказал"
            onBlur={() => { if ((by.trim() || null) !== (e.ordered_by || null)) updateExpense({ id: e.id, ordered_by: by.trim() || null } as any) }}
            style={{ ...inputS, width: '100%' }} />
        </td>
      )}
      {isC('amount') ? <td style={{ width: 20, borderBottom: '1px solid #f1f5f9' }} /> : (
        <td style={tdS}>
          <input type="number" value={amount} onChange={(ev) => setAmount(ev.target.value)} placeholder="0"
            onBlur={() => { const v = amount !== '' ? parseFloat(amount) : null; if (v !== (e.amount != null ? parseFloat(String(e.amount)) : null)) updateExpense({ id: e.id, amount: v } as any) }}
            style={{ ...inputS, width: '100%', textAlign: 'right' }} />
        </td>
      )}
      {isC('dropbox') ? <td style={{ width: 20, borderBottom: '1px solid #f1f5f9' }} /> : (
        <td style={tdS}>
          <input value={notes} onChange={(ev) => setNotes(ev.target.value)} placeholder="Путь к папке..."
            onBlur={() => { if ((notes.trim() || null) !== (e.notes || null)) updateExpense({ id: e.id, notes: notes.trim() || null } as any) }}
            style={{ ...inputS, width: '100%' }} />
        </td>
      )}
      <td style={{ ...tdS, textAlign: 'center' }}>
        {canUpload ? (
          <button onClick={() => onUpload(e.id)}
            style={{ fontSize: 11, padding: '3px 8px', borderRadius: 10, border: '1px solid #3b82f6', background: '#eff6ff', color: '#2563eb', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 500 }}>
            📎 Загрузить чек
          </button>
        ) : (
          <span style={{ fontSize: 11, color: '#cbd5e1' }} title="Заполните тип, заказчика и сумму">—</span>
        )}
      </td>
      <td style={{ ...tdS, textAlign: 'center' }}>
        <HoldToDelete onDelete={() => deleteExpense(e.id)} />
      </td>
    </tr>
  )
}

// ─── ExpensesTab ──────────────────────────────────────────────────────────────

function ExpensesTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const [collapsedCols, setCollapsedCols] = useState<Set<string>>(new Set())
  const [uploadExpenseId, setUploadExpenseId] = useState<string | null>(null)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const toggleCol = (col: string) => setCollapsedCols((prev) => {
    const next = new Set(prev); if (next.has(col)) next.delete(col); else next.add(col); return next
  })
  const isC = (col: string) => collapsedCols.has(col)

  const { data: expenses = [], isLoading } = useQuery<ShiftExpense[]>({
    queryKey: ['shift-expenses', projectId],
    queryFn: () => api.get(`/shift-expenses?projectId=${projectId}`).then((r) => r.data),
    staleTime: 30_000,
  })

  const createExpense = useMutation({
    mutationFn: () => api.post('/shift-expenses', { projectId, expenseType: 'Новый расход', orderedBy: null, amount: null, notes: null }).then((r) => r.data),
    onSuccess: (created) => {
      qc.setQueryData(['shift-expenses', projectId], (old: ShiftExpense[] | undefined) => [...(old ?? []), created])
    },
  })

  const updateExpense = useMutation({
    mutationFn: ({ id, ...data }: Partial<ShiftExpense> & { id: string }) =>
      api.patch(`/shift-expenses/${id}`, {
        expenseType: (data as any).expense_type,
        orderedBy: (data as any).ordered_by,
        amount: (data as any).amount != null ? parseFloat(String((data as any).amount)) : null,
        notes: (data as any).notes,
      }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shift-expenses', projectId] }),
  })

  const deleteExpense = useMutation({
    mutationFn: (id: string) => api.delete(`/shift-expenses/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shift-expenses', projectId] }),
  })

  const inputS: React.CSSProperties = { fontSize: 12, padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 5, color: '#1e293b', background: '#fff' }

  const thBase: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'left', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.03em', background: '#f8fafc', cursor: 'pointer', userSelect: 'none' }
  const tdS: React.CSSProperties = { padding: '8px 12px', fontSize: 13, borderBottom: '1px solid #f1f5f9' }

  const ColTh = ({ col, label, style }: { col: string; label: string; style?: React.CSSProperties }) => {
    const collapsed = isC(col)
    return (
      <th onDoubleClick={() => toggleCol(col)} title={collapsed ? `Показать «${label}»` : 'Двойной клик — скрыть столбец'}
        style={{ ...thBase, ...(collapsed ? { width: 20, padding: '0 2px', textAlign: 'center' } : { padding: '8px 12px', ...style }) }}>
        {collapsed ? '▶' : label}
      </th>
    )
  }
  const ColTd = ({ col, children, style }: { col: string; children?: React.ReactNode; style?: React.CSSProperties }) =>
    isC(col) ? <td style={{ width: 20, borderBottom: '1px solid #f1f5f9', overflow: 'hidden', padding: 0 }} /> : <td style={{ ...tdS, ...style }}>{children}</td>

  const total = expenses.reduce((s, e) => s + (e.amount ? parseFloat(String(e.amount)) : 0), 0)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {isLoading && <div style={{ padding: 20, color: '#94a3b8', fontSize: 13 }}>Загрузка...</div>}
        {!isLoading && (
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <ColTh col="type"     label="Тип расхода"         style={{ width: '28%' }} />
                <ColTh col="by"       label="Кто заказал"         style={{ width: '22%' }} />
                <ColTh col="amount"   label="Сумма, ₽"            style={{ width: '13%' }} />
                <ColTh col="dropbox"  label="Путь к папке Dropbox" style={{}} />
                <th style={{ ...thBase, width: 100, padding: '8px 12px', cursor: 'default' }}>Чек</th>
                <th style={{ ...thBase, width: 36, cursor: 'default' }} />
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <ExpenseRow
                  key={e.id}
                  e={e}
                  isC={isC}
                  inputS={inputS}
                  tdS={tdS}
                  updateExpense={(data) => updateExpense.mutate(data)}
                  deleteExpense={(id) => deleteExpense.mutate(id)}
                  onUpload={(id) => { setUploadExpenseId(id); setUploadFile(null) }}
                />
              ))}
              {/* inline + row */}
              <tr onClick={() => { if (!createExpense.isPending) createExpense.mutate() }}
                style={{ cursor: createExpense.isPending ? 'default' : 'pointer' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                <td colSpan={99} style={{ padding: '5px 14px', textAlign: 'center', color: '#94a3b8', fontSize: 18, borderBottom: '1px solid #f1f5f9' }}>
                  {createExpense.isPending ? '…' : '+'}
                </td>
              </tr>
            </tbody>
            {expenses.length > 0 && (
              <tfoot>
                <tr style={{ background: '#f1f5f9' }}>
                  <td colSpan={2} style={{ ...tdS, fontWeight: 700, color: '#475569' }}>Итого:</td>
                  <td style={{ ...tdS, fontWeight: 700, color: '#1e293b' }}>{total.toLocaleString('ru-RU')} ₽</td>
                  <td colSpan={3} style={tdS} />
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>

      {/* File upload popup */}
      {uploadExpenseId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onMouseDown={() => { setUploadExpenseId(null); setUploadFile(null) }}>
          <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 8px 40px rgba(0,0,0,0.2)', padding: 28, width: 360, display: 'flex', flexDirection: 'column', gap: 16 }}
            onMouseDown={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Загрузить чек</div>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) setUploadFile(f) }}
              onClick={() => fileInputRef.current?.click()}
              style={{ border: `2px dashed ${dragOver ? '#3b82f6' : '#cbd5e1'}`, borderRadius: 10, padding: '32px 20px', textAlign: 'center', cursor: 'pointer', background: dragOver ? '#eff6ff' : '#f8fafc', transition: 'all 0.15s' }}>
              <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) setUploadFile(f) }} />
              {uploadFile ? (
                <div style={{ fontSize: 13, color: '#1e293b', fontWeight: 500 }}>📄 {uploadFile.name}</div>
              ) : (
                <>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
                  <div style={{ fontSize: 13, color: '#64748b' }}>Перетащите файл сюда или кликните для выбора</div>
                </>
              )}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>
              Загрузка файлов будет доступна после настройки хранилища
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button disabled={!uploadFile}
                style={{ flex: 1, fontSize: 12, padding: '8px', borderRadius: 7, border: '1px solid #2563eb', background: uploadFile ? '#2563eb' : '#e2e8f0', color: uploadFile ? '#fff' : '#94a3b8', cursor: uploadFile ? 'pointer' : 'not-allowed', fontWeight: 600 }}>
                Загрузить
              </button>
              <button onClick={() => { setUploadExpenseId(null); setUploadFile(null) }}
                style={{ flex: 1, fontSize: 12, padding: '8px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: 'pointer' }}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── KanbanBoard ─────────────────────────────────────────────────────────────

interface KanbanTask {
  id: string
  project_id: string
  title: string
  status: string
  created_by: string | null
  assignee_id: string | null
  date_start: string | null
  date_end: string | null
  creator_name: string | null
  assignee_name: string | null
}

const KANBAN_COLS: { id: string; label: string; color: string }[] = [
  { id: 'request',     label: 'Заявка',   color: '#f59e0b' },
  { id: 'in_progress', label: 'В работе', color: '#3b82f6' },
  { id: 'done',        label: 'Сделано',  color: '#10b981' },
]

function KanbanBoard({ projectId, members }: { projectId: string; members: ProjectMember[] }) {
  const qc = useQueryClient()
  const currentUser = useCurrentUser()

  const { data: tasks = [] } = useQuery<KanbanTask[]>({
    queryKey: ['kanban-tasks', projectId],
    queryFn: () => api.get(`/kanban-tasks?projectId=${projectId}`).then((r) => r.data),
    staleTime: 15_000,
  })

  const [editTask, setEditTask] = useState<KanbanTask | null>(null)
  const [dragTask, setDragTask] = useState<KanbanTask | null>(null)
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 })
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  const colRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    if (!dragTask) return
    const onMove = (e: PointerEvent) => {
      setDragPos({ x: e.clientX, y: e.clientY })
      let found: string | null = null
      for (const [colId, el] of Object.entries(colRefs.current)) {
        if (!el) continue
        const r = el.getBoundingClientRect()
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          found = colId; break
        }
      }
      setDragOverCol(found)
    }
    const onUp = () => {
      if (dragTask && dragOverCol && dragOverCol !== dragTask.status) {
        patchTask.mutate({ id: dragTask.id, status: dragOverCol })
      }
      setDragTask(null)
      setDragOverCol(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
  }, [dragTask, dragOverCol])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['kanban-tasks', projectId] })

  const createTask = useMutation({
    mutationFn: (status: string) => api.post('/kanban-tasks', { projectId, status }).then((r) => r.data),
    onSuccess: (created: KanbanTask) => {
      qc.setQueryData(['kanban-tasks', projectId], (old: KanbanTask[] | undefined) => [...(old ?? []), created])
      setEditTask(created)
    },
  })

  const patchTask = useMutation({
    mutationFn: (data: { id: string } & Partial<KanbanTask>) => {
      const { id, ...rest } = data
      return api.patch(`/kanban-tasks/${id}`, rest).then((r) => r.data)
    },
    onSuccess: (updated: KanbanTask) => {
      qc.setQueryData(['kanban-tasks', projectId], (old: KanbanTask[] | undefined) =>
        (old ?? []).map((t) => t.id !== updated.id ? t : {
          ...t,
          ...updated,
          creator_name:  updated.creator_name  ?? t.creator_name,
          assignee_name: updated.assignee_name ?? t.assignee_name,
        }))
    },
  })

  const deleteTask = useMutation({
    mutationFn: (id: string) => api.delete(`/kanban-tasks/${id}`).then((r) => r.data),
    onSuccess: (_: unknown, id: string) => {
      qc.setQueryData(['kanban-tasks', projectId], (old: KanbanTask[] | undefined) =>
        (old ?? []).filter((t) => t.id !== id))
      setEditTask(null)
    },
  })

  const nonFreelanceMembers = members.filter((m) => !m.is_freelancer)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Columns */}
      <div style={{ flex: 1, display: 'flex', gap: 12, padding: 16, overflow: 'auto' }}>
        {KANBAN_COLS.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.id)
          const isOver = dragTask !== null && dragOverCol === col.id && dragTask.status !== col.id
          return (
            <div
              key={col.id}
              ref={(el) => { colRefs.current[col.id] = el }}
              style={{
                flex: '1 1 0', minWidth: 220, display: 'flex', flexDirection: 'column',
                background: isOver ? col.color + '18' : '#f8fafc',
                border: `1.5px solid ${isOver ? col.color : '#e2e8f0'}`,
                borderRadius: 10, transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              {/* Column header */}
              <div style={{ padding: '10px 12px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: col.color, display: 'inline-block' }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{col.label}</span>
                  <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>{colTasks.length}</span>
                </div>
                <button
                  onClick={() => createTask.mutate(col.id)}
                  disabled={createTask.isPending}
                  style={{ width: 22, height: 22, borderRadius: 5, border: 'none', background: col.color + '22', color: col.color, fontSize: 16, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}
                  title="Добавить задачу"
                >+</button>
              </div>

              {/* Cards */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 4px' }}>
                {colTasks.map((task) => (
                  <div
                    key={task.id}
                    onPointerDown={(e) => { e.preventDefault(); setDragTask(task); setDragPos({ x: e.clientX, y: e.clientY }) }}
                    onClick={() => setEditTask(task)}
                    style={{
                      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
                      padding: '10px 12px', marginBottom: 8, cursor: 'grab',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                      opacity: dragTask?.id === task.id ? 0.4 : 1,
                      userSelect: 'none',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginBottom: 8, lineHeight: 1.3 }}>{task.title}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', gap: 6, fontSize: 11 }}>
                        <span style={{ color: '#94a3b8', flexShrink: 0, minWidth: 60 }}>Исполнитель</span>
                        <span style={{ color: '#1e293b', fontWeight: 500 }}>{task.assignee_name || '—'}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, fontSize: 11 }}>
                        <span style={{ color: '#94a3b8', flexShrink: 0, minWidth: 60 }}>Создал</span>
                        <span style={{ color: '#475569' }}>{task.creator_name || '—'}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, fontSize: 11 }}>
                        <span style={{ color: '#94a3b8', flexShrink: 0, minWidth: 60 }}>Начало</span>
                        <span style={{ color: '#475569' }}>{task.date_start ? task.date_start.slice(0, 10) : '—'}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, fontSize: 11 }}>
                        <span style={{ color: '#94a3b8', flexShrink: 0, minWidth: 60 }}>Конец</span>
                        <span style={{ color: '#475569' }}>{task.date_end ? task.date_end.slice(0, 10) : '—'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Drag ghost */}
      {dragTask && (
        <div style={{ position: 'fixed', left: dragPos.x + 12, top: dragPos.y - 20, zIndex: 9999, pointerEvents: 'none', background: '#fff', border: '1.5px solid #2563eb', borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 600, color: '#1e293b', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', maxWidth: 200 }}>
          {dragTask.title}
        </div>
      )}

      {/* Edit modal */}
      {editTask && (
        <KanbanTaskModal
          task={editTask}
          members={nonFreelanceMembers}
          onSave={(patch) => patchTask.mutate({ id: editTask.id, ...patch })}
          onDelete={() => deleteTask.mutate(editTask.id)}
          onClose={() => setEditTask(null)}
        />
      )}
    </div>
  )
}

function KanbanTaskModal({ task, members, onSave, onDelete, onClose }: {
  task: KanbanTask
  members: ProjectMember[]
  onSave: (patch: Partial<KanbanTask>) => void
  onDelete: () => void
  onClose: () => void
}) {
  const [title, setTitle] = useState(task.title)
  const [assigneeId, setAssigneeId] = useState(task.assignee_id ?? '')
  const [dateStart, setDateStart] = useState(task.date_start ? task.date_start.slice(0, 10) : '')
  const [dateEnd, setDateEnd] = useState(task.date_end ? task.date_end.slice(0, 10) : '')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const save = () => {
    onSave({
      title: title.trim() || 'Новая задача',
      assigneeId: (assigneeId || null) as any,
      dateStart: (dateStart || null) as any,
      dateEnd: (dateEnd || null) as any,
    })
    onClose()
  }

  const inp: React.CSSProperties = { width: '100%', border: '1px solid #e2e8f0', borderRadius: 6, padding: '7px 10px', fontSize: 13, color: '#1e293b', outline: 'none', boxSizing: 'border-box', background: '#f8fafc', fontFamily: 'inherit' }
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4, display: 'block' }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onMouseDown={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onMouseDown={(e) => e.stopPropagation()}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Задача</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, color: '#94a3b8', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <span style={lbl}>Название</span>
            <input style={inp} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </div>
          <div>
            <span style={lbl}>Исполнитель</span>
            <select style={inp} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">— не назначен —</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <span style={lbl}>Начало</span>
              <input type="date" style={inp} value={dateStart} onChange={(e) => setDateStart(e.target.value)} />
            </div>
            <div>
              <span style={lbl}>Конец</span>
              <input type="date" style={inp} value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} />
            </div>
          </div>
          {task.creator_name && (
            <div style={{ fontSize: 11, color: '#94a3b8' }}>Создал: {task.creator_name}</div>
          )}
        </div>
        <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between' }}>
          <button onClick={onDelete} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 6, border: '1px solid #fecaca', background: 'none', color: '#ef4444', cursor: 'pointer' }}>Удалить</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'none', color: '#475569', cursor: 'pointer' }}>Отмена</button>
            <button onClick={save} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontWeight: 500 }}>Сохранить</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── CreateMicroProjectForm ───────────────────────────────────────────────────

function CreateMicroProjectForm({ matrixRegistryId, parentTaskId, onCreated, onCancel }: {
  matrixRegistryId?: string
  parentTaskId?: string
  onCreated: (id: string) => void
  onCancel: () => void
}) {
  const [dept, setDept] = useState('')          // выбранный отдел (ТВ / Моушн / ...)
  const [tvFormat, setTvFormat] = useState('')  // формат внутри ТВ
  const [location, setLocation] = useState('')
  const [date, setDate] = useState('')
  const [notes, setNotes] = useState('')

  const isTv = dept === 'ТВ'
  // итоговый формат сохраняемый в БД
  const resolvedFormat = isTv ? tvFormat : dept
  const showLocation = FORMATS_WITH_LOCATION.includes(resolvedFormat)
  const canCreate = dept.trim() !== '' && (!isTv || tvFormat.trim() !== '') && (!showLocation || location.trim() !== '')

  const DEFAULT_GROUP_TIMES: Record<string, { timeFrom: string; timeTo: string; startTime?: string }> = {
    sbor:      { timeFrom: '07:00', timeTo: '10:00' },
    zavoz:     { timeFrom: '10:00', timeTo: '11:00' },
    montazh:   { timeFrom: '11:00', timeTo: '16:00' },
    efir:      { timeFrom: '16:00', timeTo: '18:00', startTime: '16:30' },
    demontazh: { timeFrom: '18:00', timeTo: '20:00' },
    vyvoz:     { timeFrom: '20:00', timeTo: '21:00' },
  }

  const create = useMutation({
    mutationFn: async () => {
      const r = await api.post('/status-rows', {
        name: resolvedFormat || dept || 'Без названия',
        notes: notes.trim() || null,
        date: date ? new Date(date).toISOString() : null,
        format: resolvedFormat || null,
        location: showLocation ? (location || null) : null,
        ...(parentTaskId ? { parentTaskId } : { matrixRegistryId }),
        status: 'request',
      })
      const newId: string = r.data.id

      if (showLocation && location) {
        const today = new Date().toISOString().slice(0, 10)
        const isViezd = location.startsWith('Выезд')
        const groups = isViezd ? VIEZD_GROUPS : STUDIO_GROUPS
        const schedule: Record<string, unknown> = {}
        for (const g of groups) {
          const t = DEFAULT_GROUP_TIMES[g.id]
          if (t) schedule[g.id] = { date: today, ...t }
        }
        await api.patch(`/status-rows/${newId}/group-schedule`, schedule)
      }

      return r.data
    },
    onSuccess: (data) => onCreated(data.id),
  })

  const inputS: React.CSSProperties = { fontSize: 13, padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, color: '#1e293b', background: '#fff', width: '100%', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4, display: 'block' }

  return (
    <div style={{ padding: 20, maxWidth: 480 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>Новый отдел</div>
        <span style={{ padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' }}>Запрос</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Отдел */}
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <span style={lbl}>Отдел</span>
            <select value={dept} onChange={(e) => { setDept(e.target.value); setTvFormat(''); setLocation('') }} style={inputS} autoFocus>
              <option value="">— не выбрано —</option>
              {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          {isTv && (
            <div style={{ flex: 1 }}>
              <span style={lbl}>Формат</span>
              <select value={tvFormat} onChange={(e) => { setTvFormat(e.target.value); setLocation('') }} style={inputS}>
                <option value="">— не выбрано —</option>
                {TV_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          )}
          {showLocation && (
            <div style={{ flex: 1 }}>
              <span style={lbl}>Локация</span>
              <select value={location} onChange={(e) => setLocation(e.target.value)} style={inputS}>
                <option value="">— не выбрано —</option>
                {LOCATION_OPTIONS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          )}
        </div>
        <div><span style={lbl}>Дата</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputS} /></div>
        <div><span style={lbl}>Описание</span><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Краткое описание" style={inputS} /></div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
        <button onClick={() => { if (canCreate) create.mutate() }} disabled={!canCreate || create.isPending}
          style={{ fontSize: 13, padding: '7px 18px', borderRadius: 7, border: 'none', background: !canCreate ? '#93c5fd' : '#2563eb', color: '#fff', cursor: canCreate ? 'pointer' : 'default', fontWeight: 500 }}>
          {create.isPending ? 'Создание...' : 'Создать'}
        </button>
        <button onClick={onCancel} style={{ fontSize: 13, padding: '7px 14px', borderRadius: 7, border: '1px solid #e2e8f0', background: 'none', color: '#475569', cursor: 'pointer' }}>Отмена</button>
      </div>
      {create.isError && <div style={{ marginTop: 10, fontSize: 12, color: '#ef4444' }}>Ошибка: {(create.error as any)?.response?.data?.error ?? 'Не удалось создать'}</div>}
    </div>
  )
}
