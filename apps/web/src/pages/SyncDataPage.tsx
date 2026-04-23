import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { api } from '../lib/api'
import { InternalShiftsPanel, MicroProjectTab } from './InternalShiftsPanel'
import { GanttTab, NotesTab, DocumentsTab } from './MatrixTabs'
import { TaskDetailPanel } from './TaskDetailPanel'

// ─── ConfirmDialog ────────────────────────────────────────────────────────────

interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  confirmColor?: string
}

interface ConfirmState extends ConfirmOptions {
  open: boolean
  resolve: ((ok: boolean) => void) | null
}

function useConfirmDialog() {
  const [state, setState] = useState<ConfirmState>({
    open: false, title: '', resolve: null,
  })

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({ ...opts, open: true, resolve })
    })
  }, [])

  const handleConfirm = useCallback(() => {
    setState((s) => { s.resolve?.(true); return { ...s, open: false, resolve: null } })
  }, [])

  const handleCancel = useCallback(() => {
    setState((s) => { s.resolve?.(false); return { ...s, open: false, resolve: null } })
  }, [])

  return { confirm, confirmDialogProps: { ...state, onConfirm: handleConfirm, onCancel: handleCancel } }
}

function ConfirmDialog({
  open, title, message, confirmLabel = 'Подтвердить', confirmColor = '#ef4444',
  onConfirm, onCancel,
}: {
  open: boolean
  title: string
  message?: string
  confirmLabel?: string
  confirmColor?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onCancel() }
      if (e.key === 'Enter') { e.stopPropagation(); onConfirm() }
    }
    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [open, onConfirm, onCancel])

  if (!open) return null

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onMouseDown={onCancel}
    >
      <div
        style={{ background: '#fff', borderRadius: 14, boxShadow: '0 24px 64px rgba(0,0,0,0.25)', width: '100%', maxWidth: 400, overflow: 'hidden' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '20px 24px 0' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: message ? 8 : 0 }}>{title}</div>
          {message && <div style={{ fontSize: 14, color: '#64748b', lineHeight: 1.55 }}>{message}</div>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '20px 24px' }}>
          <button
            onClick={onCancel}
            style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
          >
            Отмена
          </button>
          <button
            onClick={onConfirm}
            style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: confirmColor, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Project {
  id: string
  googleRowIndex: number | null
  source: string
  status: string
  client: string | null
  name: string
  notes: string | null
  execProducer: string | null
  lineProducer: string | null
  accountManager: string | null
  date: string | null
  dateApproximate: string | null
  time: string | null
  format: string | null
  location: string | null
  postProduction: string | null
  matrixRegistryId: string | null
  linkedMatrix: { matrixId: string } | null
  sheetMatrixId: string | null
  uncertainFields: string[]
  days: Array<{ id: string; date: string; type: string; startTime: string | null; timeFrom: string | null; timeTo: string | null; allDay: boolean; firstMotor: string | null }>
}

interface RegistryEntry {
  id: string
  matrixId: string
  sheetUrl: string | null
  status: string | null
  unit: string[]
  client: string | null
  name: string | null
  format: string | null
  date: string | null
  producer: string | null
  manager: string | null
  curator: string | null
  projectName: string | null
  kpLink: string | null
  brief: string | null
  projectId: string | null
  googleRowIndex: number | null
  hasShiftsData: boolean | null
  lastSyncedAt: string | null
  source: string
  templateId: string | null
  revenuePlan: number | null
}

interface MatrixTemplate {
  id: string
  name: string
  sheet_url: string
  is_active: boolean
}

interface ProjectMember {
  id: string
  project_id: string
  name: string
  position: string | null
  shifts: Record<string, string>
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  request: 'Запрос', negotiation: 'На согл.', preproduction: 'Препрод.',
  production: 'Продакшн', postproduction: 'Постпрод.', delivered: 'Сдан',
  rejected: 'Не согл.', cancelled: 'Отменён', manual: 'Ручной',
}

// Chip-цвета из Google Sheets (dropdown с цветными чипами)
const STATUS_CHIP_COLORS: Record<string, string> = {
  request:        '#fce8e6',  // Запрос — светло-розовый
  negotiation:    '#fce5cd',  // На согласовании — персиковый
  preproduction:  '#fff2cc',  // Препродакшн — жёлтый
  production:     '#c9daf8',  // Продакшн — голубой
  postproduction: '#1c4587',  // Постпродакшн — тёмно-синий
  delivered:      '#d9ead3',  // Сдан — светло-зелёный
  rejected:       '#660000',  // Не согласован — тёмно-бордовый
  cancelled:      '#cc0000',  // Отменён — красный
  manual:         '#f1f5f9',  // Ручной
}

const FORMAT_CHIP_COLORS: Record<string, string> = {
  'ТВ':          '#c9daf8',  // голубой
  'Радио':       '#fff2cc',  // жёлтый
  'Телерадио':   '#fce5cd',  // персиковый
  'Продакшн':    '#d9d2e9',  // лавандовый
  'Дизайн':      '#d9ead3',  // светло-зелёный
  'Оффлайн':     '#0c343d',  // тёмно-бирюзовый
  'Виртуальный': '#ead1dc',  // светло-розовый
  'Менеджмент':  '#f4cccc',  // розовый
}

const LOCATION_CHIP_COLORS: Record<string, string> = {
  'Знаменка крыша':  '#fff2cc',  // жёлтый
  'Знаменка чёрная': '#7a7a7a',  // серый
  'Знаменка камин':  '#fce5cd',  // персиковый
  'Романов':         '#d9d2e9',  // лавандовый
  'Выезд':           '#c9daf8',  // голубой
}

// Возвращает chip-цвет ячейки по значению (фолбэк когда нет явного цвета из таблицы)
function getValueChipColor(fieldKey: string, p: Project): string | undefined {
  switch (fieldKey) {
    case 'status':   return STATUS_CHIP_COLORS[p.status]
    case 'format':   return p.format   ? FORMAT_CHIP_COLORS[p.format]   : undefined
    case 'location': return p.location ? LOCATION_CHIP_COLORS[p.location] : undefined
    default:         return undefined
  }
}

// Старые цвета-ацкенты для бейджей (используются только как запасной вариант)
const STATUS_COLORS: Record<string, string> = {
  request: '#f59e0b', negotiation: '#3b82f6', preproduction: '#8b5cf6',
  production: '#10b981', postproduction: '#06b6d4', delivered: '#16a34a',
  rejected: '#ef4444', cancelled: '#6b7280', manual: '#64748b',
}

interface ColDef {
  key: string
  label: string
  filterable?: boolean
  special?: 'matrixId'
}

const PROJ_COLS: ColDef[] = [
  { key: 'status',         label: 'A Статус',       filterable: true },
  { key: 'client',         label: 'B Клиент',       filterable: true },
  { key: 'notes',          label: 'C Описание' },
  { key: 'execProducer',   label: 'D Исп.прод.',   filterable: true },
  { key: 'lineProducer',   label: 'E Лайн-прод.',  filterable: true },
  { key: 'accountManager', label: 'F Аккаунт',     filterable: true },
  { key: 'date',           label: 'G Дата',         filterable: true },
  { key: 'time',           label: 'H Время' },
  { key: 'format',         label: 'I Формат',       filterable: true },
  { key: 'location',       label: 'J Локация',      filterable: true },
  { key: 'matrixId',       label: 'K Проект',       filterable: true, special: 'matrixId' },
]

// Брейкпоинты по ширине: убираем столбцы по мере сужения
// Полная: A B C D E F G H I J K
// -K:     A B C D E F G H I J
// -E -F:  A B C D G H I J
// -H -I:  A B C D G J
// -G -J:  A B C D
function getProjHiddenCols(width: number): Set<string> {
  if (width >= 1200) return new Set()
  if (width >= 1000) return new Set(['matrixId'])
  if (width >= 780)  return new Set(['matrixId', 'lineProducer', 'accountManager'])
  if (width >= 560)  return new Set(['matrixId', 'lineProducer', 'accountManager', 'time', 'format'])
  return new Set(['matrixId', 'lineProducer', 'accountManager', 'time', 'format', 'date', 'location'])
}

const REG_COLS: ColDef[] = [
  { key: 'status',   label: 'A Статус',   filterable: true },
  { key: 'sheetUrl', label: 'B Проект' },
  { key: 'matrixId', label: 'C ID' },
  { key: 'unit',     label: 'E Юнит',     filterable: true },
  { key: 'client',   label: 'F Заказчик', filterable: true },
  { key: 'name',     label: 'G Название' },
  { key: 'format',   label: 'H Формат' },
  { key: 'date',     label: 'I Дата' },
  { key: 'producer', label: 'J Продюсер' },
  { key: 'manager',  label: 'K Менеджер' },
  { key: 'curator',  label: 'L Куратор' },
]

// Полная: A B C E F G H I J K L
// -H -K -L: A B C E F G I J
// -J:       A B C E F G I
// -E -I:    A B C F G
function getRegHiddenCols(width: number): Set<string> {
  if (width >= 1100) return new Set()
  if (width >= 860)  return new Set(['format', 'manager', 'curator'])
  if (width >= 640)  return new Set(['format', 'manager', 'curator', 'producer'])
  return new Set(['format', 'manager', 'curator', 'producer', 'unit', 'date'])
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(raw: string | null) {
  if (!raw) return '—'
  try { return format(new Date(raw), 'd MMM yyyy', { locale: ru }) } catch { return raw }
}

function fmtTime(raw: string | null) {
  if (!raw) return '—'
  const num = parseFloat(raw)
  if (!isNaN(num) && /^\d*\.?\d+$/.test(raw.trim()) && num >= 0 && num < 1) {
    const totalMin = Math.round(num * 24 * 60)
    const h = Math.floor(totalMin / 60)
    const m = totalMin % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  return raw
}

function uniq(values: (string | null | undefined)[]): string[] {
  const set = new Set<string>()
  for (const v of values) if (v) set.add(v)
  return Array.from(set).sort()
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function usePersistedFilters(storageKey: string) {
  const [state, setRaw] = useState<Record<string, string[]>>(() => {
    try {
      const s = localStorage.getItem(storageKey)
      if (!s) return {}
      const parsed = JSON.parse(s) as Record<string, string[]>
      // Удаляем пустые массивы — старые данные до изменения логики фильтрации
      const clean: Record<string, string[]> = {}
      for (const [k, v] of Object.entries(parsed)) if (v.length > 0) clean[k] = v
      return clean
    } catch { return {} }
  })
  function setState(next: Record<string, string[]> | ((prev: Record<string, string[]>) => Record<string, string[]>)) {
    setRaw((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next
      try { localStorage.setItem(storageKey, JSON.stringify(resolved)) } catch {}
      return resolved
    })
  }
  return [state, setState] as const
}

function usePersistedHidden(storageKey: string) {
  const [state, setRaw] = useState<Set<string>>(() => {
    try { const s = localStorage.getItem(storageKey); return s ? new Set(JSON.parse(s) as string[]) : new Set() } catch { return new Set() }
  })
  function toggle(col: string) {
    setRaw((prev) => {
      const next = new Set(prev)
      if (next.has(col)) next.delete(col); else next.add(col)
      try { localStorage.setItem(storageKey, JSON.stringify(Array.from(next))) } catch {}
      return next
    })
  }
  return [state, toggle] as const
}

// ─── Inline column filter dropdown (renders inside <th>, no fixed positioning) ─

function ColDropdown({
  values, selected, onToggle, onClear, onSelectAll, onClose,
}: {
  values: string[]
  selected: string[]
  onToggle: (v: string) => void
  onClear: () => void
  onSelectAll: () => void
  onClose: () => void
}) {
  const allSelected = values.length > 0 && values.every((v) => selected.includes(v))
  return (
    <>
      {/* Backdrop */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onMouseDown={onClose} />
      {/* Dropdown panel */}
      <div
        style={{ position: 'absolute', top: '100%', left: 0, zIndex: 51, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 4px 20px rgba(15,23,42,0.14)', minWidth: 190, maxHeight: 300, display: 'flex', flexDirection: 'column' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Sticky header with action buttons */}
        <div style={{ display: 'flex', gap: 4, padding: '6px 10px', borderBottom: '1px solid #f1f5f9', flexShrink: 0, background: '#fff', borderRadius: '8px 8px 0 0' }}>
          <button
            onClick={onSelectAll}
            disabled={allSelected}
            style={{ flex: 1, fontSize: 11, padding: '4px 0', borderRadius: 5, border: '1px solid #e2e8f0', background: allSelected ? '#f8fafc' : '#fff', color: allSelected ? '#cbd5e1' : '#475569', cursor: allSelected ? 'default' : 'pointer', fontWeight: 500 }}
          >
            Выбрать все
          </button>
          <button
            onClick={onClear}
            disabled={selected.length === 0}
            style={{ flex: 1, fontSize: 11, padding: '4px 0', borderRadius: 5, border: '1px solid #e2e8f0', background: selected.length === 0 ? '#f8fafc' : '#fff', color: selected.length === 0 ? '#cbd5e1' : '#475569', cursor: selected.length === 0 ? 'default' : 'pointer', fontWeight: 500 }}
          >
            Сбросить
          </button>
        </div>
        {/* Scrollable list */}
        <div style={{ overflowY: 'auto', padding: '4px 0' }}>
          {values.length === 0
            ? <div style={{ padding: '8px 14px', fontSize: 12, color: '#94a3b8' }}>Нет вариантов</div>
            : values.map((v) => {
                const checked = selected.includes(v)
                return (
                  <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', cursor: 'pointer', fontSize: 13, color: checked ? '#1d4ed8' : '#374151', background: checked ? '#eff6ff' : 'transparent', userSelect: 'none' }}>
                    <input type="checkbox" checked={checked} onChange={() => onToggle(v)} style={{ accentColor: '#3b82f6', cursor: 'pointer', flexShrink: 0 }} />
                    {v}
                  </label>
                )
              })
          }
        </div>
      </div>
    </>
  )
}

// ─── Filter group (must be at module level to avoid scroll-reset on re-render) ─

function FilterGroup({ label, values, colKey, filters, onToggle }: {
  label: string
  values: string[]
  colKey: string
  filters: Record<string, string[]>
  onToggle: (v: string) => void
}) {
  const sel = filters[colKey] ?? []
  return (
    <div style={{ minWidth: 130 }}>
      <div style={filterColLabel}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
        {values.length === 0
          ? <span style={{ fontSize: 12, color: '#94a3b8' }}>—</span>
          : values.map((v) => {
              const checked = sel.includes(v)
              return (
                <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 13, color: checked ? '#1d4ed8' : '#374151' }}>
                  <input type="checkbox" checked={checked} onChange={() => onToggle(v)} style={{ accentColor: '#3b82f6', cursor: 'pointer' }} />
                  {v}
                </label>
              )
            })
        }
      </div>
    </div>
  )
}

// ─── Global settings popup ────────────────────────────────────────────────────

function GlobalSettingsPopup({
  projFilters, onProjFilters,
  regFilters, onRegFilters,
  projOpts, regOpts,
  onClose,
}: {
  projFilters: Record<string, string[]>
  onProjFilters: (f: Record<string, string[]>) => void
  regFilters: Record<string, string[]>
  onRegFilters: (f: Record<string, string[]>) => void
  projOpts: { status: string[]; format: string[]; location: string[] }
  regOpts: { status: string[]; unit: string[]; format: string[] }
  onClose: () => void
}) {
  function toggleF(
    filters: Record<string, string[]>,
    set: (f: Record<string, string[]>) => void,
    col: string,
    val: string,
  ) {
    const cur = filters[col] ?? []
    const next = cur.includes(val) ? cur.filter((v) => v !== val) : [...cur, val]
    set({ ...filters, [col]: next })
  }

  const projTotal = Object.values(projFilters).reduce((s, a) => s + a.length, 0)
  const regTotal = Object.values(regFilters).reduce((s, a) => s + a.length, 0)

  // Lock body scroll while popup is open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  return (
    <div style={popupOverlay} onClick={onClose}>
      <div
        style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 8px 32px rgba(15,23,42,0.18)', minWidth: 480, maxWidth: '92vw', maxHeight: '85vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: '#1e293b' }}>Настройки отображения</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#94a3b8', lineHeight: 1 }}>✕</button>
        </div>

        {/* Filters — Projects */}
        <div style={settingsSection}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={settingsSectionTitle}>Фильтры — Проекты</span>
            {projTotal > 0 && (
              <button onClick={() => onProjFilters({})} style={resetBtn}>Сбросить ({projTotal})</button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <FilterGroup label="A Статус" values={projOpts.status} colKey="status" filters={projFilters} onToggle={(v) => toggleF(projFilters, onProjFilters, 'status', v)} />
            <FilterGroup label="I Формат" values={projOpts.format} colKey="format" filters={projFilters} onToggle={(v) => toggleF(projFilters, onProjFilters, 'format', v)} />
            <FilterGroup label="J Локация" values={projOpts.location} colKey="location" filters={projFilters} onToggle={(v) => toggleF(projFilters, onProjFilters, 'location', v)} />
          </div>
        </div>

        {/* Filters — Registry */}
        <div style={settingsSection}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={settingsSectionTitle}>Фильтры — Реестр проектов</span>
            {regTotal > 0 && (
              <button onClick={() => onRegFilters({})} style={resetBtn}>Сбросить ({regTotal})</button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <FilterGroup label="A Статус" values={regOpts.status} colKey="status" filters={regFilters} onToggle={(v) => toggleF(regFilters, onRegFilters, 'status', v)} />
            <FilterGroup label="E Юнит" values={regOpts.unit} colKey="unit" filters={regFilters} onToggle={(v) => toggleF(regFilters, onRegFilters, 'unit', v)} />
            <FilterGroup label="H Формат" values={regOpts.format} colKey="format" filters={regFilters} onToggle={(v) => toggleF(regFilters, onRegFilters, 'format', v)} />
          </div>
        </div>

      </div>
    </div>
  )
}

// ─── Projects column filter helpers ───────────────────────────────────────────

// Maps each project id to the month label of its nearest preceding separator row
function buildMonthMap(projects: Project[]): Record<string, string> {
  const map: Record<string, string> = {}
  let currentMonth = ''
  for (const p of projects) {
    if (p.source === 'separator') {
      currentMonth = p.name
    } else {
      map[p.id] = currentMonth
    }
  }
  return map
}

function getProjValue(p: Project, col: string): string {
  switch (col) {
    case 'status':         return STATUS_LABELS[p.status] ?? p.status
    case 'client':         return p.client ?? ''
    case 'execProducer':   return p.execProducer ?? ''
    case 'lineProducer':   return p.lineProducer ?? ''
    case 'accountManager': return p.accountManager ?? ''
    case 'date':           return fmtDate(p.date)
    case 'format':         return p.format ?? ''
    case 'location':       return p.location ?? ''
    default:               return ''
  }
}

function applyProjColFilters(rows: Project[], colFilters: Record<string, string[]>): Project[] {
  return rows.filter((p) => {
    for (const [col, sel] of Object.entries(colFilters)) {
      if (sel.length === 0) continue
      if (col === 'matrixId') {
        const hasId = !!(p.sheetMatrixId ?? p.linkedMatrix?.matrixId)
        const wantHas = sel.includes('Есть ID')
        const wantNot = sel.includes('Нет ID')
        if (wantHas && !wantNot && !hasId) return false
        if (!wantHas && wantNot && hasId) return false
        continue
      }
      const val = getProjValue(p, col)
      if (!sel.includes(val)) return false
    }
    return true
  })
}

// ─── Project Detail Modal ─────────────────────────────────────────────────────

type CellColor = { bg?: string; fg?: string }

// Parse "fieldName:#bgColor", "fieldName:#bgColor|#fgColor", or "fieldName:|#fgColor"
function parseUncertainColors(fields: string[]): Record<string, CellColor> {
  const map: Record<string, CellColor> = {}
  for (const f of fields) {
    const colonIdx = f.indexOf(':')
    if (colonIdx <= 0) continue
    const fieldName = f.slice(0, colonIdx)
    const colorPart = f.slice(colonIdx + 1)
    const pipeIdx = colorPart.indexOf('|')
    const entry: CellColor = {}
    if (pipeIdx >= 0) {
      const bg = colorPart.slice(0, pipeIdx)
      const fg = colorPart.slice(pipeIdx + 1)
      if (bg.startsWith('#')) entry.bg = bg
      if (fg.startsWith('#')) entry.fg = fg
    } else if (colorPart.startsWith('#')) {
      entry.bg = colorPart  // legacy format: bg only
    }
    if (entry.bg || entry.fg) map[fieldName] = entry
  }
  return map
}

// Compute readable text color (black or white) for a given hex background
function contrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  // Perceived luminance
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.55 ? '#1e293b' : '#fff'
}

function ProjectDetailModal({ project, onClose, onEdit, onDelete }: { project: Project; onClose: () => void; onEdit?: () => void; onDelete?: () => void }) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const status = STATUS_LABELS[project.status] ?? project.status
  const statusColor = STATUS_COLORS[project.status] ?? '#94a3b8'

  // Map from fieldKey → Google Sheets cell color
  const cellColors = parseUncertainColors(project.uncertainFields)

  type FieldDef = { label: string; fieldKey: string; value: string | number | null | undefined; mono?: boolean }

  const leftCol: FieldDef[] = [
    { label: 'Дата',    fieldKey: 'date',     value: project.dateApproximate ?? fmtDate(project.date) },
    { label: 'Время',   fieldKey: 'time',     value: fmtTime(project.time) },
    { label: 'Формат',  fieldKey: 'format',   value: project.format },
    { label: 'Локация', fieldKey: 'location', value: project.location },
  ]

  const rightCol: FieldDef[] = [
    { label: 'Исп. продюсер',    fieldKey: 'execProducer',   value: project.execProducer },
    { label: 'Лайн-продюсер',    fieldKey: 'lineProducer',   value: project.lineProducer },
    { label: 'Аккаунт-менеджер', fieldKey: 'accountManager', value: project.accountManager },
  ]

  const bottomRow: FieldDef[] = [
    { label: 'ID матрицы',       fieldKey: 'sheetMatrixId',  value: project.sheetMatrixId, mono: true },
    { label: 'Строка в таблице', fieldKey: 'googleRowIndex', value: project.googleRowIndex },
    { label: 'Источник',         fieldKey: 'source',         value: project.source },
  ]

  function Field({ label, fieldKey, value, mono }: FieldDef) {
    const display = value != null && value !== '' ? String(value) : null
    const chipBg = getValueChipColor(fieldKey, project)
    const cc = chipBg ? { bg: chipBg } : cellColors[fieldKey]
    const bg = cc?.bg
    const hasColor = !!(bg || cc?.fg)
    const textColor = cc?.fg ?? (bg ? contrastColor(bg) : (display ? '#1e293b' : '#cbd5e1'))
    return (
      <div
        style={{
          borderRadius: 6,
          padding: hasColor ? '6px 8px' : '0 0 10px 0',
          borderBottom: hasColor ? 'none' : '1px solid #f1f5f9',
          background: bg ?? 'transparent',
        }}
      >
        <div style={{ fontSize: 11, color: hasColor ? `${textColor}99` : '#94a3b8', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 13, color: textColor, fontFamily: mono ? 'monospace' : undefined }}>
          {display ?? '—'}
        </div>
      </div>
    )
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onMouseDown={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', width: '100%', maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <SourceBadge source={project.source} />
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', lineHeight: 1.4 }}>{project.name}</div>
            </div>
            {project.client && <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{project.client}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span style={{ padding: '3px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600, background: `${statusColor}22`, color: statusColor }}>
              {status}
            </span>
            {project.source === 'manual' && onEdit && (
              <button
                onClick={onEdit}
                style={{ background: 'none', border: '1px solid #e2e8f0', color: '#475569', cursor: 'pointer', fontSize: 12, padding: '4px 10px', borderRadius: 6 }}
                title="Редактировать"
              >Изменить</button>
            )}
            {project.source === 'manual' && onDelete && (
              <button
                onClick={onDelete}
                style={{ background: 'none', border: '1px solid #fecaca', color: '#ef4444', cursor: 'pointer', fontSize: 12, padding: '4px 10px', borderRadius: 6 }}
                title="Удалить проект"
              >Удалить</button>
            )}
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '2px 4px', borderRadius: 4 }}
              title="Закрыть (Esc)"
            >×</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '16px 20px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Two columns: left = дата/формат/локация, right = продюсеры */}
          <div style={{ display: 'flex', gap: 24 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {leftCol.map(f => <Field key={f.fieldKey} {...f} />)}
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rightCol.map(f => <Field key={f.fieldKey} {...f} />)}
            </div>
          </div>

          {/* Bottom row: матрица / строка / источник */}
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px 16px' }}>
            {bottomRow.map(f => <Field key={f.fieldKey} {...f} />)}
          </div>

          {/* Sections only for internal projects */}
          {project.source === 'manual' && (
            <>
              <ProjectMatrixSection projectId={project.id} client={project.client} />
              <ProjectTeamSection projectId={project.id} />
            </>
          )}

        </div>
      </div>
    </div>
  )
}

// ─── Project Matrix Section ───────────────────────────────────────────────────

function ProjectMatrixSection({ projectId, client }: { projectId: string; client: string | null }) {
  const qc = useQueryClient()
  const [picking, setPicking] = useState(false)
  const [pickedMatrixId, setPickedMatrixId] = useState<string>('')

  const { data: linkInfo, isLoading } = useQuery<{
    matrixRegistryId: string | null
    blockSlot: number | null
    linkedMatrix: { id: string; name: string | null; client: string | null; matrixId: string; sheetUrl: string | null; source: string } | null
  }>({
    queryKey: ['project-link', projectId],
    queryFn: () => api.get(`/status-rows/${projectId}/link-info`).then((r) => r.data),
    staleTime: 30_000,
  })

  const { data: matrices = [] } = useQuery<{ id: string; name: string | null; client: string | null; matrix_id: string }[]>({
    queryKey: ['internal-matrices', client],
    queryFn: () => api.get('/internal-matrix').then((r) => r.data),
    enabled: picking,
    staleTime: 30_000,
  })

  const link = useMutation({
    mutationFn: () => api.patch(`/status-rows/${projectId}`, { matrixRegistryId: pickedMatrixId || null }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-link', projectId] })
      qc.invalidateQueries({ queryKey: ['status-rows-sync'] })
      setPicking(false)
    },
  })

  const unlink = useMutation({
    mutationFn: () => api.patch(`/status-rows/${projectId}`, { matrixRegistryId: null }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-link', projectId] })
      qc.invalidateQueries({ queryKey: ['status-rows-sync'] })
    },
  })

  const sectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }

  return (
    <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 14 }}>
      <div style={sectionLabel}>Проект (внутренний)</div>
      {isLoading && <div style={{ fontSize: 13, color: '#94a3b8' }}>Загрузка...</div>}
      {!isLoading && linkInfo && (
        <>
          {linkInfo.linkedMatrix ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f0fdf4', borderRadius: 8, padding: '8px 12px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#15803d' }}>{linkInfo.linkedMatrix.name ?? linkInfo.linkedMatrix.matrixId}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  {linkInfo.linkedMatrix.client && `${linkInfo.linkedMatrix.client} · `}Блок {linkInfo.blockSlot ?? '—'}
                </div>
              </div>
              <button onClick={() => unlink.mutate()} disabled={unlink.isPending} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid #bbf7d0', background: 'none', color: '#16a34a', cursor: 'pointer' }}>
                Отвязать
              </button>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 8 }}>Не привязана</div>
              {!picking && (
                <button onClick={() => { setPicking(true); setPickedMatrixId('') }} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'none', color: '#475569', cursor: 'pointer' }}>
                  + Привязать матрицу
                </button>
              )}
            </>
          )}

          {picking && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8, background: '#f8fafc', borderRadius: 8, padding: 12 }}>
              <select
                value={pickedMatrixId}
                onChange={(e) => setPickedMatrixId(e.target.value)}
                style={{ fontSize: 13, padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, color: '#1e293b', background: '#fff' }}
              >
                <option value="">— Выберите матрицу —</option>
                {matrices.map((m) => (
                  <option key={m.id} value={m.id}>{m.name ?? m.matrix_id}{m.client ? ` (${m.client})` : ''}</option>
                ))}
              </select>
              {matrices.length === 0 && <div style={{ fontSize: 12, color: '#94a3b8' }}>Нет созданных матриц</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => link.mutate()} disabled={!pickedMatrixId || link.isPending}
                  style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: 'none', background: pickedMatrixId ? '#2563eb' : '#94a3b8', color: '#fff', cursor: pickedMatrixId ? 'pointer' : 'default', fontWeight: 500 }}>
                  {link.isPending ? 'Сохраняю...' : 'Привязать'}
                </button>
                <button onClick={() => setPicking(false)} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'none', cursor: 'pointer', color: '#475569' }}>Отмена</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Project Team Section ─────────────────────────────────────────────────────

function ProjectTeamSection({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPos, setNewPos] = useState('')

  const { data: members = [], isLoading } = useQuery<ProjectMember[]>({
    queryKey: ['project-members', projectId],
    queryFn: () => api.get(`/project-members?projectId=${projectId}`).then((r) => r.data),
    staleTime: 30_000,
  })

  const addMember = useMutation({
    mutationFn: () => api.post('/project-members', { projectId, name: newName.trim(), position: newPos.trim() || null }).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['project-members', projectId] }); setNewName(''); setNewPos(''); setAdding(false) },
  })

  const removeMember = useMutation({
    mutationFn: (id: string) => api.delete(`/project-members/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-members', projectId] }),
  })

  const sectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }
  const inputS: React.CSSProperties = { fontSize: 13, padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, color: '#1e293b', background: '#fff', flex: 1, minWidth: 0 }

  return (
    <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={sectionLabel}>Команда{members.length > 0 ? ` (${members.length})` : ''}</div>
        <button onClick={() => setAdding((v) => !v)} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}>+ Добавить</button>
      </div>

      {isLoading && <div style={{ fontSize: 13, color: '#94a3b8' }}>Загрузка...</div>}

      {adding && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="ФИО *" style={inputS} />
          <input value={newPos} onChange={(e) => setNewPos(e.target.value)} placeholder="Должность" style={{ ...inputS, flex: '0 0 160px' }} />
          <button onClick={() => { if (newName.trim()) addMember.mutate() }} disabled={!newName.trim() || addMember.isPending}
            style={{ fontSize: 12, padding: '6px 12px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', flexShrink: 0 }}>
            {addMember.isPending ? '...' : 'OK'}
          </button>
          <button onClick={() => setAdding(false)} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'none', cursor: 'pointer', color: '#475569', flexShrink: 0 }}>×</button>
        </div>
      )}

      {members.length === 0 && !isLoading && !adding && (
        <div style={{ fontSize: 13, color: '#94a3b8' }}>Команда не назначена</div>
      )}

      {members.map((m) => (
        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#f8fafc', borderRadius: 6, marginBottom: 4 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{m.name}</span>
            {m.position && <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>{m.position}</span>}
          </div>
          <button onClick={() => removeMember.mutate(m.id)} style={{ fontSize: 12, color: '#94a3b8', border: 'none', background: 'none', cursor: 'pointer', padding: '2px 6px' }} title="Удалить">×</button>
        </div>
      ))}
    </div>
  )
}

// ─── Source badge ─────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: string }) {
  const isInternal = source === 'internal' || source === 'manual'
  return (
    <span title={isInternal ? 'Создан внутри системы' : 'Из Google Sheets'} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 18, height: 18, borderRadius: 4, fontSize: 10, fontWeight: 700,
      background: isInternal ? '#dcfce7' : '#dbeafe',
      color: isInternal ? '#16a34a' : '#2563eb',
      flexShrink: 0,
    }}>
      {isInternal ? '✎' : 'G'}
    </span>
  )
}

// ─── Project Form Modal ───────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'request',        label: 'Запрос' },
  { value: 'preproduction',  label: 'Препрод.' },
  { value: 'production',     label: 'Продакшн' },
  { value: 'postproduction', label: 'Постпрод.' },
  { value: 'delivered',      label: 'Сдан' },
  { value: 'rejected',       label: 'Не согл.' },
  { value: 'cancelled',      label: 'Отменён' },
]

function ProjectFormModal({
  project,
  onClose,
  onSaved,
}: {
  project?: Project
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!project

  const [form, setForm] = useState({
    notes:            (project as any)?.notes   ?? '',
    client:           project?.client           ?? '',
    matrixRegistryId: project?.matrixRegistryId ?? '',
    execProducer:     project?.execProducer     ?? '',
    lineProducer:     project?.lineProducer     ?? '',
    accountManager:   project?.accountManager   ?? '',
    date:             project?.date ? project.date.slice(0, 10) : '',
    format:           project?.format           ?? '',
    location:         project?.location         ?? '',
    postProduction:   project?.postProduction   ?? '',
  })
  const TV_FORMATS_LIST = ['Трансляция', 'Телерадио', 'Съемки']
  const DEPT_LIST = ['ТВ', 'Моушн', 'Постпродакшн', 'Дизайн', 'Саунд-дизайн', 'Радио', 'Не профильный']
  const initDept    = TV_FORMATS_LIST.includes(project?.format ?? '') ? 'ТВ' : (project?.format ?? '')
  const initTvFmt   = TV_FORMATS_LIST.includes(project?.format ?? '') ? (project?.format ?? '') : ''
  const [dept,    setDept]    = useState(initDept)
  const [tvFormat, setTvFormat] = useState(initTvFmt)

  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})

  // КФПД data for dropdowns
  const { data: kfpdRaw } = useQuery<KfpdData>({
    queryKey: ['kfpd-preview'],
    queryFn: () => api.get('/database/preview/kfpd').then((r) => r.data),
  })
  const kfpdCol = (idx: number) => kfpdRaw
    ? [...new Set(kfpdRaw.rows.map((r) => r[idx] ?? '').filter(Boolean))]
    : []
  const kfpdClients   = kfpdCol(0)
  const kfpdProducers = kfpdCol(2)
  const kfpdStatuses  = kfpdCol(8)

  // Unique format & location from existing projects
  const { data: uniqueVals } = useQuery<{ formats: string[]; locations: string[] }>({
    queryKey: ['status-rows-unique-values'],
    queryFn: () => api.get('/status-rows/unique-values').then((r) => r.data),
  })

  // Matrices for the selected client (all sources)
  const { data: clientMatrices = [] } = useQuery<{ id: string; matrix_id: string; name: string | null; date: string | null; source: string }[]>({
    queryKey: ['matrices-by-client', form.client],
    queryFn: () =>
      form.client
        ? api.get(`/internal-matrix/by-client/${encodeURIComponent(form.client)}`).then((r) => r.data)
        : Promise.resolve([]),
    enabled: !!form.client,
  })

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', handler); document.body.style.overflow = '' }
  }, [onClose])

  // Reset matrix selection when client changes
  useEffect(() => {
    setForm((f) => ({ ...f, matrixRegistryId: '' }))
  }, [form.client])

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const save = useMutation({
    mutationFn: () => {
      const fmt = (dept === 'ТВ' ? tvFormat : dept).trim()
      const hasLocation = ['Трансляция', 'Телерадио', 'Съемки'].includes(fmt)
      const body: Record<string, unknown> = {
        name:             isEdit ? (project!.name || fmt || 'Без названия') : (fmt || 'Без названия'),
        notes:            form.notes.trim()           || null,
        client:           form.client.trim()          || null,
        matrixRegistryId: form.matrixRegistryId       || null,
        execProducer:     form.execProducer.trim()    || null,
        lineProducer:     form.lineProducer.trim()    || null,
        accountManager:   form.accountManager.trim()  || null,
        date:             form.date ? new Date(form.date).toISOString() : null,
        format:           fmt                         || null,
        location:         hasLocation ? (form.location.trim() || null) : null,
        postProduction:   form.postProduction.trim()  || null,
        status:           isEdit ? undefined           : 'request',
      }
      return isEdit
        ? api.patch(`/status-rows/${project!.id}`, body).then((r) => r.data)
        : api.post('/status-rows', body).then((r) => r.data)
    },
    onSuccess: () => { onSaved(); onClose() },
    onError: (e: any) => {
      const data = e?.response?.data
      setError(data?.error ?? e?.message ?? 'Ошибка')
      setFieldErrors(data?.details?.fieldErrors ?? {})
    },
  })

  const fs: React.CSSProperties = {
    width: '100%', fontSize: 13, padding: '7px 10px', border: '1px solid #e2e8f0',
    borderRadius: 6, outline: 'none', boxSizing: 'border-box', color: '#1e293b', background: '#f8fafc',
  }
  const fsErr: React.CSSProperties = { ...fs, borderColor: '#f87171', background: '#fff5f5' }
  const ls: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: '#64748b',
    textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4,
  }
  const lsErr: React.CSSProperties = { ...ls, color: '#ef4444' }

  const fg = (label: string, key: string, placeholder?: string) => {
    const errs = fieldErrors[key]
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={errs ? lsErr : ls}>{label}{errs ? ` — ${errs[0]}` : ''}</div>
        <input style={errs ? fsErr : fs} value={(form as any)[key]} onChange={set(key)} placeholder={placeholder} />
      </div>
    )
  }

  const fsel = (label: string, key: string, options: string[]) => {
    const errs = fieldErrors[key]
    const curVal = (form as any)[key] as string
    const allOptions = curVal && !options.includes(curVal) ? [curVal, ...options] : options
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={errs ? lsErr : ls}>{label}{errs ? ` — ${errs[0]}` : ''}</div>
        <select style={errs ? fsErr : fs} value={curVal} onChange={set(key)}>
          <option value="">— не выбрано —</option>
          {allOptions.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    )
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onMouseDown={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', width: '100%', maxWidth: 580, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>{isEdit ? 'Редактировать отдел' : 'Новый отдел'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '2px 4px' }}>×</button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '16px 20px', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Status badge — fixed to "Запрос" at creation, editable after */}
          {!isEdit && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Статус</span>
              <span style={{ padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' }}>
                Запрос
              </span>
            </div>
          )}
          {isEdit && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={fieldErrors['status'] ? lsErr : ls}>Статус{fieldErrors['status'] ? ` — ${fieldErrors['status'][0]}` : ''}</div>
              <select style={fieldErrors['status'] ? fsErr : fs} value={(form as any).status ?? ''} onChange={set('status')}>
                {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}

          {fsel('Клиент', 'client', kfpdClients)}

          {/* Matrix dropdown — depends on selected client */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={ls}>Проект</div>
            <select style={fs} value={form.matrixRegistryId} onChange={set('matrixRegistryId')}>
              <option value="">— отсутствует —</option>
              {clientMatrices.map((m) => {
                const dateStr = m.date ? m.date.slice(0, 10) : ''
                const label = [m.matrix_id, m.name, dateStr].filter(Boolean).join(' · ')
                return <option key={m.id} value={m.id}>{label}</option>
              })}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: dept === 'ТВ' ? '1fr 1fr' : '1fr', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={ls}>Отдел</div>
              <select style={fs} value={dept} onChange={(e) => { setDept(e.target.value); setTvFormat('') }}>
                <option value="">— не выбрано —</option>
                {DEPT_LIST.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            {dept === 'ТВ' && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={ls}>Формат</div>
                <select style={fs} value={tvFormat} onChange={(e) => setTvFormat(e.target.value)}>
                  <option value="">— не выбрано —</option>
                  {TV_FORMATS_LIST.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            )}
          </div>
          {TV_FORMATS_LIST.includes(dept === 'ТВ' ? tvFormat : dept) && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={ls}>Локация</div>
              <select style={fs} value={form.location} onChange={set('location')}>
                <option value="">— не выбрано —</option>
                {(uniqueVals?.locations ?? []).map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={ls}>Дата</div>
            <input type="date" style={fs} value={form.date} onChange={set('date')} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            {fsel('Исп. продюсер', 'execProducer', kfpdProducers)}
            {fsel('Лайн-продюсер', 'lineProducer', kfpdProducers)}
            {fsel('Аккаунт-менеджер', 'accountManager', kfpdProducers)}
          </div>

          {fg('Описание', 'notes', 'Краткое описание смены')}

          {fg('Постпродакшн', 'postProduction', 'Студия / подрядчик')}

          {error && Object.keys(fieldErrors).length === 0 && (
            <div style={{ fontSize: 13, color: '#ef4444', background: '#fef2f2', padding: '8px 12px', borderRadius: 6 }}>{error}</div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ fontSize: 13, padding: '7px 16px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'none', cursor: 'pointer', color: '#475569' }}>Отмена</button>
          <button
            onClick={() => {
  setFieldErrors({})
  if (!dept.trim()) { setError('Выберите отдел'); return }
  if (dept === 'ТВ' && !tvFormat.trim()) { setError('Выберите формат'); return }
  const resolvedFmt = (dept === 'ТВ' ? tvFormat : dept).trim()
  if (TV_FORMATS_LIST.includes(resolvedFmt) && !form.location.trim()) { setError('Укажите локацию'); return }
  save.mutate()
}}
            disabled={save.isPending}
            style={{ fontSize: 13, padding: '7px 16px', borderRadius: 6, border: 'none', background: save.isPending ? '#93c5fd' : '#2563eb', color: '#fff', cursor: save.isPending ? 'default' : 'pointer', fontWeight: 500 }}
          >
            {save.isPending ? 'Сохраняю...' : isEdit ? 'Сохранить' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Registry Detail Modal ───────────────────────────────────────────────────

interface ShiftRow { isSeparator: true; text: string }
interface ShiftEmployee { isSeparator: false; name: string; role: string | null; employmentType: string | null; shifts: boolean[] }
interface MatrixShiftsData { sheetTitle: string; dates: string[]; activeCols: number[]; rows: (ShiftRow | ShiftEmployee)[] }

// ─── Change Log Tab ───────────────────────────────────────────────────────────

interface ChangeLogEntry {
  id: string
  entityType: string
  entityId: string
  field: string
  oldValue: string | null
  newValue: string | null
  changedAt: string
  source: string
  user: { id: string; fullName: string } | null
}

// ─── Registry Info Tab ────────────────────────────────────────────────────────

interface GanttTaskInfo { id: string; done: boolean }

function RegistryInfoTab({
  entry, ganttTasks, onStatusChanged,
}: {
  entry: RegistryEntry
  ganttTasks?: GanttTaskInfo[]
  onStatusChanged?: (newStatus: string) => void
}) {
  const isInternal = entry.source === 'internal'

  const { data: kfpdRaw } = useQuery<KfpdData>({
    queryKey: ['kfpd-preview'],
    queryFn: () => api.get('/database/preview/kfpd').then((r) => r.data),
    staleTime: 5 * 60_000,
  })
  const kfpdCol = (idx: number): string[] => kfpdRaw
    ? [...new Set(kfpdRaw.rows.map((r) => r[idx] ?? '').filter(Boolean) as string[])]
    : []
  const unitOptions  = kfpdCol(5)
  const formatOptions = kfpdCol(1)
  const producerOptions = kfpdCol(2)

  // Fetch micro-projects and their financial data (only for internal)
  const { data: projects = [] } = useQuery<any[]>({
    queryKey: ['micro-projects-info', entry.id],
    queryFn: () => api.get(`/status-rows?matrixRegistryId=${entry.id}`).then((r) => r.data),
    enabled: isInternal,
    staleTime: 60_000,
  })

  const memberQueries = useQueries({
    queries: projects.map((p: any) => ({
      queryKey: ['project-members', p.id],
      queryFn: () => api.get(`/project-members?projectId=${p.id}`).then((r) => r.data as any[]),
      staleTime: 60_000,
    })),
  })

  const expenseQueries = useQueries({
    queries: projects.map((p: any) => ({
      queryKey: ['shift-expenses', p.id],
      queryFn: () => api.get(`/shift-expenses?projectId=${p.id}`).then((r) => r.data as any[]),
      staleTime: 60_000,
    })),
  })

  // Financial calculations
  const fin = useMemo(() => {
    let specPlan = 0, specFact = 0, servicesPlan = 0, servicesFact = 0
    projects.forEach((p: any, idx: number) => {
      const members: any[] = memberQueries[idx]?.data ?? []
      const expenses: any[] = expenseQueries[idx]?.data ?? []
      // Date cols for this project
      const dateCols: string[] = []
      if (p.date) dateCols.push(new Date(p.date).toISOString().slice(0, 10))
      ;(p.days ?? []).forEach((d: any) => {
        const iso = new Date(d.date).toISOString().slice(0, 10)
        if (!dateCols.includes(iso)) dateCols.push(iso)
      })
      members.forEach((m: any) => {
        const confirmed = dateCols.filter((d) => {
          const v = m.shifts?.[d]
          if (!v) return false
          if (typeof v === 'string') return !!v
          return v.confirmed === 'yes'
        }).length
        if (m.rate_plan) specPlan += parseFloat(m.rate_plan) * confirmed
        if (m.rate_fact) specFact += parseFloat(m.rate_fact) * confirmed
      })
      expenses.forEach((e: any) => {
        const amt = e.amount ? parseFloat(String(e.amount)) : 0
        servicesPlan += amt
        servicesFact += amt
      })
    })
    const taxRate = 0.13
    const taxPlan = Math.round((specPlan + servicesPlan) * taxRate)
    const taxFact = Math.round((specFact + servicesFact) * taxRate)
    const totalPlan = specPlan + servicesPlan + taxPlan
    const totalFact = specFact + servicesFact + taxFact
    return { specPlan, specFact, servicesPlan, servicesFact, taxPlan, taxFact, totalPlan, totalFact }
  }, [projects, memberQueries, expenseQueries])

  const qc = useQueryClient()

  const updateStatus = useMutation({
    mutationFn: (newStatus: string) =>
      api.patch(`/internal-matrix/${entry.id}`, { status: newStatus }).then((r) => r.data),
    onSuccess: (_data: unknown, newStatus: string) => {
      qc.invalidateQueries({ queryKey: ['internal-matrix'] })
      onStatusChanged?.(newStatus)
    },
  })

  const [briefText, setBriefText] = useState(entry.brief ?? '')
  const [briefDirty, setBriefDirty] = useState(false)

  useEffect(() => {
    if (!briefDirty) setBriefText(entry.brief ?? '')
  }, [entry.id, entry.brief])

  const saveBrief = useMutation({
    mutationFn: () =>
      api.patch(`/internal-matrix/${entry.id}`, { brief: briefText }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['internal-matrix'] })
      setBriefDirty(false)
    },
  })

  // Inline editable fields (internal only)
  const initFields = () => ({
    kpLink:      entry.kpLink   ?? '',
    format:      entry.format   ?? '',
    date:        entry.date ? new Date(entry.date).toISOString().slice(0, 10) : '',
    producer:    entry.producer ?? '',
    manager:     entry.manager  ?? '',
    curator:     entry.curator  ?? '',
    unit:        Array.isArray(entry.unit) ? entry.unit : [],
    revenuePlan: entry.revenuePlan != null ? String(entry.revenuePlan) : '',
  })

  const [fields, setFields] = useState(initFields)
  const [savedFields, setSavedFields] = useState(fields)

  useEffect(() => {
    const next = initFields()
    setFields(next)
    setSavedFields(next)
  }, [entry.id])

  const patchField = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      api.patch(`/internal-matrix/${entry.id}`, patch).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['internal-matrix'] })
      qc.invalidateQueries({ queryKey: ['sync-registry'] })
    },
  })

  const saveField = (key: string, value: unknown) => {
    setSavedFields((prev) => ({ ...prev, [key]: value }))
    const apiVal = key === 'revenuePlan'
      ? (value !== '' && value != null ? Number(value) : null)
      : (value || null)
    patchField.mutate({ [key]: apiVal })
  }

  const onFieldBlur = (key: string) => {
    const cur = (fields as any)[key]
    const saved = (savedFields as any)[key]
    if (cur !== saved) saveField(key, cur)
  }

  // Styled editable field — always shows border (readable + editable)
  const editField: React.CSSProperties = {
    fontSize: 13, color: '#1e293b', fontWeight: 500, textAlign: 'right',
    border: '1px solid #e2e8f0', borderRadius: 20, padding: '3px 10px',
    background: '#f8fafc', outline: 'none', maxWidth: 200, width: 'auto',
    fontFamily: 'inherit', cursor: 'text',
  }

  const fmt = (n: number) => n === 0 ? '—' : n.toLocaleString('ru-RU') + ' ₽'
  const pct = (plan: number, fact: number) => {
    if (!plan) return '—'
    const d = ((fact - plan) / plan) * 100
    return (d >= 0 ? '+' : '') + d.toFixed(1) + '%'
  }

  // Gantt donut
  const total = ganttTasks?.length ?? 0
  const done = ganttTasks?.filter((t) => t.done).length ?? 0
  const gPct = total > 0 ? Math.round((done / total) * 100) : 0
  const R = 38, C = 2 * Math.PI * R
  const dashFilled = total > 0 ? (done / total) * C : 0

  const card: React.CSSProperties = { border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', background: '#fff' }
  const cardHdr: React.CSSProperties = { padding: '11px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }
  const dot = (color: string): React.CSSProperties => ({ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block' })
  const cardTitle: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b' }
  const fRow: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', padding: '9px 18px', borderBottom: '1px solid #f8fafc', gap: 12 }
  const fLbl: React.CSSProperties = { fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }
  const fVal: React.CSSProperties = { fontSize: 14, color: '#1e293b', fontWeight: 500, textAlign: 'right' }
  const thS: React.CSSProperties = { padding: '9px 10px', fontSize: 12, fontWeight: 700, color: '#fff', borderBottom: '2px solid #e2e8f0', textAlign: 'right', whiteSpace: 'nowrap' }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Row 1: О проекте | Команда | Прогресс */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.4fr', gap: 18 }}>

        {/* О проекте */}
        <div style={card}>
          <div style={cardHdr}><span style={dot('#3b82f6')} /><span style={cardTitle}>О проекте</span></div>
          <div style={{ ...fRow, borderBottom: '1px solid #f8fafc' }}>
            <span style={fLbl}>ID матрицы</span>
            <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180, whiteSpace: 'nowrap' }}>{entry.matrixId}</span>
          </div>
          <div style={{ ...fRow, borderBottom: '1px solid #f8fafc' }}>
            <span style={fLbl}>Google Таблица</span>
            {entry.sheetUrl ? (
              <a href={entry.sheetUrl} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 20, padding: '3px 10px 3px 7px', color: '#15803d', textDecoration: 'none', fontSize: 12, fontWeight: 600 }}>
                <span style={{ fontSize: 13 }}>📊</span> Открыть <span style={{ opacity: 0.6, fontSize: 10 }}>↗</span>
              </a>
            ) : (
              <span style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>Таблица не сгенерирована</span>
            )}
          </div>
          <div style={{ ...fRow, borderBottom: '1px solid #f8fafc' }}>
            <span style={fLbl}>Юнит</span>
            {isInternal ? (
              <MultiSelect
                options={unitOptions}
                value={fields.unit}
                onChange={(v) => { setFields((p) => ({ ...p, unit: v })); saveField('unit', v) }}
                placeholder="Не выбрано"
              />
            ) : (
              <span style={fVal}>{Array.isArray(entry.unit) && entry.unit.length ? entry.unit.join(', ') : '—'}</span>
            )}
          </div>
          <div style={{ ...fRow, borderBottom: '1px solid #f8fafc' }}>
            <span style={fLbl}>Формат</span>
            {isInternal ? (
              <StyledSelect
                options={formatOptions}
                value={fields.format}
                onChange={(v) => { setFields((p) => ({ ...p, format: v })); saveField('format', v) }}
                placeholder="— не выбрано —"
              />
            ) : (
              <span style={fVal}>{entry.format || '—'}</span>
            )}
          </div>
          <div style={{ ...fRow, borderBottom: 'none' }}>
            <span style={fLbl}>Дата</span>
            {isInternal ? (
              <input
                type="date"
                value={fields.date}
                onChange={(e) => setFields((p) => ({ ...p, date: e.target.value }))}
                onBlur={() => onFieldBlur('date')}
                style={{ ...editField, cursor: 'pointer', maxWidth: 160 }}
              />
            ) : (
              <span style={{ ...fVal, fontWeight: 700 }}>{fmtDate(entry.date)}</span>
            )}
          </div>
        </div>

        {/* Команда */}
        <div style={card}>
          <div style={cardHdr}><span style={dot('#8b5cf6')} /><span style={cardTitle}>Команда</span></div>
          {(['producer', 'manager', 'curator'] as const).map((key, i, arr) => {
            const labels: Record<string, string> = { producer: 'Продюсер от ММ', manager: 'Менеджер по продажам', curator: 'Куратор от заказчика' }
            const isSelect = key === 'producer' || key === 'manager'
            return (
              <div key={key} style={{ ...fRow, borderBottom: i < arr.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                <span style={fLbl}>{labels[key]}</span>
                {isInternal ? (
                  isSelect ? (
                    <StyledSelect
                      options={producerOptions}
                      value={fields[key]}
                      onChange={(v) => { setFields((p) => ({ ...p, [key]: v })); saveField(key, v) }}
                      placeholder="— не выбрано —"
                    />
                  ) : (
                    <input
                      value={fields[key]}
                      onChange={(e) => setFields((p) => ({ ...p, [key]: e.target.value }))}
                      onBlur={() => onFieldBlur(key)}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                      placeholder="ФИО"
                      style={{ ...editField }}
                    />
                  )
                ) : (
                  <span style={fVal}>{(entry as any)[key] || '—'}</span>
                )}
              </div>
            )
          })}
        </div>

        {/* Прогресс */}
        <div style={card}>
          <div style={cardHdr}><span style={dot('#f59e0b')} /><span style={cardTitle}>Прогресс</span></div>
          <div style={{ display: 'flex', alignItems: 'flex-start', padding: '12px', gap: 0 }}>

            {/* Ганта dial */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '0 8px', borderRight: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ганта</div>
              <svg width="90" height="90" viewBox="0 0 90 90">
                <circle cx="45" cy="45" r={R} fill="none" stroke="#e2e8f0" strokeWidth={8} />
                {total > 0 && (
                  <circle cx="45" cy="45" r={R} fill="none"
                    stroke={gPct === 100 ? '#22c55e' : '#3b82f6'} strokeWidth={8}
                    strokeDasharray={`${dashFilled} ${C - dashFilled}`}
                    strokeDashoffset={C / 4} strokeLinecap="round" />
                )}
                <circle cx="45" cy="45" r="24" fill="#fff" />
                <text x="45" y="41" textAnchor="middle" fontSize="11" fontWeight="700" fill="#0f172a">{gPct}%</text>
                <text x="45" y="54" textAnchor="middle" fontSize="9" fill="#64748b">{done}/{total}</text>
              </svg>
              <div style={{ fontSize: 11, color: '#64748b', textAlign: 'center' }}>задач выполнено</div>
            </div>

            {/* Подтверждено */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '0 8px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Смены</div>
              <svg width="90" height="90" viewBox="0 0 90 90">
                <circle cx="45" cy="45" r={R} fill="none" stroke="#f1f5f9" strokeWidth={2} strokeDasharray="6 4" />
                <circle cx="45" cy="45" r="24" fill="#f8fafc" />
                <text x="45" y="41" textAnchor="middle" fontSize="10" fill="#cbd5e1">—</text>
                <text x="45" y="54" textAnchor="middle" fontSize="9" fill="#cbd5e1">скоро</text>
              </svg>
              <div style={{ fontSize: 11, color: '#cbd5e1', textAlign: 'center' }}>данных нет</div>
            </div>

          </div>
        </div>
      </div>

      {/* Row 2: Описание | Финансовые показатели */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px,0.58fr) minmax(0,1fr)', gap: 18, alignItems: 'stretch' }}>

        {/* Описание */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          <div style={cardHdr}><span style={dot('#8b5cf6')} /><span style={cardTitle}>Описание</span></div>
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', flex: 1, gap: 10 }}>

            {/* Ссылка на КП */}
            {entry.kpLink && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingBottom: 8, borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>Ссылка на КП</span>
                <a href={entry.kpLink} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 20, padding: '3px 10px 3px 7px', color: '#2563eb', textDecoration: 'none', fontSize: 12, fontWeight: 600 }}>
                  <span style={{ fontSize: 13 }}>📄</span> КП <span style={{ opacity: 0.6, fontSize: 10 }}>↗</span>
                </a>
              </div>
            )}

            {/* Статус (только для внутренних) */}
            {entry.source === 'internal' && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingBottom: 8, borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>Статус</span>
                <StyledSelect
                  options={Object.keys(STATUS_LABELS)}
                  value={entry.status ?? ''}
                  onChange={(v) => { if (v) updateStatus.mutate(v) }}
                  renderOption={(opt) => <span>{STATUS_LABELS[opt] ?? opt}</span>}
                  renderValue={(v) => <span>{STATUS_LABELS[v] ?? v}</span>}
                  placeholder="— статус —"
                />
              </div>
            )}

            {/* Бриф / описание */}
            <textarea
              value={briefText}
              onChange={(e) => { setBriefText(e.target.value); setBriefDirty(true) }}
              placeholder="Введите описание проекта…"
              style={{ flex: 1, minHeight: 80, border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#1e293b', fontFamily: 'inherit', resize: 'none', outline: 'none', lineHeight: 1.6, background: '#fff' }}
            />
            {briefDirty && (
              <button
                onClick={() => saveBrief.mutate()}
                disabled={saveBrief.isPending}
                style={{ alignSelf: 'flex-end', fontSize: 12, padding: '5px 14px', borderRadius: 6, border: 'none', background: saveBrief.isPending ? '#93c5fd' : '#2563eb', color: '#fff', cursor: saveBrief.isPending ? 'default' : 'pointer', fontWeight: 500 }}
              >
                {saveBrief.isPending ? 'Сохраняю...' : 'Сохранить'}
              </button>
            )}

          </div>
        </div>

        {/* Финансовые показатели */}
        <div style={card}>
          <div style={cardHdr}><span style={dot('#10b981')} /><span style={cardTitle}>Финансовые показатели</span></div>
          <div style={{ padding: '0 0 14px', overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '9px 18px', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', minWidth: 200 }}></th>
                  <th style={{ ...thS, background: '#94a3b8' }}>План</th>
                  <th style={{ ...thS, background: '#3b82f6' }}>Факт</th>
                  <th style={{ ...thS, background: '#f8fafc', color: '#64748b', fontSize: 11 }}>% откл.</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ background: '#f0fdf4' }}>
                  <td style={{ padding: '9px 18px', fontWeight: 700, color: '#0f172a', borderBottom: '2px solid #e2e8f0' }}>Доход</td>
                  <td style={{ padding: '5px 10px', textAlign: 'right', fontWeight: 700, borderBottom: '2px solid #e2e8f0' }}>
                    {isInternal ? (
                      <input
                        type="number"
                        value={fields.revenuePlan}
                        onChange={(e) => setFields((p) => ({ ...p, revenuePlan: e.target.value }))}
                        onBlur={() => onFieldBlur('revenuePlan')}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                        placeholder="0"
                        style={{ ...editField, maxWidth: 120, textAlign: 'right', fontSize: 13 }}
                      />
                    ) : (
                      <span style={{ color: '#94a3b8' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, borderBottom: '2px solid #e2e8f0', color: '#94a3b8' }}>—</td>
                  <td style={{ padding: '9px 8px', textAlign: 'right', color: '#94a3b8', borderBottom: '2px solid #e2e8f0' }}>—</td>
                </tr>
                <tr><td colSpan={4} style={{ padding: '6px 18px 2px', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>Статья расходов</td></tr>
                <tr>
                  <td style={{ padding: '7px 18px 7px 28px', color: '#475569', borderBottom: '1px solid #f8fafc' }}>Специалисты</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', borderBottom: '1px solid #f8fafc', color: fin.specPlan ? '#1e293b' : '#94a3b8' }}>{fmt(fin.specPlan)}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', borderBottom: '1px solid #f8fafc', color: fin.specFact ? '#1e293b' : '#94a3b8' }}>{fmt(fin.specFact)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: '#94a3b8', borderBottom: '1px solid #f8fafc' }}>{pct(fin.specPlan, fin.specFact)}</td>
                </tr>
                <tr style={{ background: '#f8fafc' }}>
                  <td style={{ padding: '7px 18px 7px 28px', color: '#475569', borderBottom: '1px solid #f1f5f9' }}>Услуги</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', color: fin.servicesPlan ? '#1e293b' : '#94a3b8' }}>{fmt(fin.servicesPlan)}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', color: fin.servicesFact ? '#1e293b' : '#94a3b8' }}>{fmt(fin.servicesFact)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: '#94a3b8', borderBottom: '1px solid #f1f5f9' }}>{pct(fin.servicesPlan, fin.servicesFact)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '7px 18px 7px 28px', color: '#475569', borderBottom: '1px solid #f8fafc' }}>Иные расходы</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: '#94a3b8', borderBottom: '1px solid #f8fafc' }}>—</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: '#94a3b8', borderBottom: '1px solid #f8fafc' }}>—</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: '#94a3b8', borderBottom: '1px solid #f8fafc' }}>—</td>
                </tr>
                <tr style={{ background: '#f8fafc' }}>
                  <td style={{ padding: '7px 18px 7px 28px', color: '#475569', borderBottom: '1px solid #f1f5f9' }}>Налог 13%</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', color: fin.taxPlan ? '#1e293b' : '#94a3b8' }}>{fmt(fin.taxPlan)}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', color: fin.taxFact ? '#1e293b' : '#94a3b8' }}>{fmt(fin.taxFact)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: '#94a3b8', borderBottom: '1px solid #f1f5f9' }}>{pct(fin.taxPlan, fin.taxFact)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '9px 18px', fontWeight: 700, color: '#0f172a', borderTop: '2px solid #e2e8f0', borderBottom: '2px solid #e2e8f0' }}>Общая сумма расходов</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, borderTop: '2px solid #e2e8f0', borderBottom: '2px solid #e2e8f0', color: fin.totalPlan ? '#1e293b' : '#94a3b8' }}>{fmt(fin.totalPlan)}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, borderTop: '2px solid #e2e8f0', borderBottom: '2px solid #e2e8f0', color: fin.totalFact ? '#1e293b' : '#94a3b8' }}>{fmt(fin.totalFact)}</td>
                  <td style={{ padding: '9px 8px', textAlign: 'right', color: '#94a3b8', borderTop: '2px solid #e2e8f0', borderBottom: '2px solid #e2e8f0' }}>{pct(fin.totalPlan, fin.totalFact)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 18px', fontWeight: 700, color: '#0f172a', borderBottom: '1px solid #f1f5f9' }}>Прибыль</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#94a3b8', borderBottom: '1px solid #f1f5f9' }}>—</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#94a3b8', borderBottom: '1px solid #f1f5f9' }}>—</td>
                  <td style={{ padding: '8px 8px', textAlign: 'right', color: '#94a3b8', borderBottom: '1px solid #f1f5f9' }}>—</td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 18px', fontWeight: 700, color: '#0f172a' }}>Маржинальность</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#94a3b8' }}>—</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#94a3b8' }}>—</td>
                  <td style={{ padding: '8px 8px', textAlign: 'right', color: '#94a3b8' }}>—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Row 3: Доход·Прибыль·Маржа donuts | Расходы bar chart */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>

        {/* Доход · Прибыль · Маржинальность */}
        <div style={card}>
          <div style={cardHdr}><span style={dot('#3b82f6')} /><span style={cardTitle}>Доход · Прибыль · Маржинальность</span></div>
          <div style={{ display: 'flex', alignItems: 'flex-start', padding: '12px 8px 16px', gap: 0 }}>
            {([
              { label: 'Доход', plan: '—', fact: '—', color: '#3b82f6' },
              { label: 'Прибыль', plan: '—', fact: '—', color: '#3b82f6' },
              { label: 'Маржа', plan: '—', fact: '—', color: '#ef4444' },
            ]).map((item, i) => (
              <div key={item.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '0 8px', borderRight: i < 2 ? '1px solid #e2e8f0' : undefined }}>
                <svg viewBox="0 0 200 200" style={{ width: '100%', display: 'block' }}>
                  <circle cx="100" cy="100" r="80" fill="none" stroke="#e2e8f0" strokeWidth="6" strokeDasharray="6 4" />
                  <circle cx="100" cy="100" r="44" fill="#f8fafc" />
                  <text x="100" y="95" textAnchor="middle" fontSize="12" fontWeight="700" fill="#cbd5e1">—</text>
                  <text x="100" y="110" textAnchor="middle" fontSize="10" fill="#94a3b8">{item.label.toUpperCase()}</text>
                </svg>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#64748b' }}>
                      <span style={{ width: 8, height: 8, background: '#cbd5e1', borderRadius: 2, display: 'inline-block' }} />
                      План
                    </span>
                    <span style={{ fontWeight: 700, color: '#94a3b8' }}>{item.plan}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#64748b' }}>
                      <span style={{ width: 8, height: 8, background: item.color, borderRadius: 2, display: 'inline-block' }} />
                      Факт
                    </span>
                    <span style={{ fontWeight: 700, color: '#94a3b8' }}>{item.fact}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Расходы: план vs факт bar chart */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          <div style={cardHdr}><span style={dot('#f59e0b')} /><span style={cardTitle}>Расходы: план vs факт</span></div>
          <div style={{ padding: '14px 14px', display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b' }}>
                <span style={{ width: 10, height: 10, background: '#94a3b8', borderRadius: 2, display: 'inline-block' }} />План
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b' }}>
                <span style={{ width: 10, height: 10, background: '#3b82f6', borderRadius: 2, display: 'inline-block' }} />Факт
              </span>
            </div>
            {(() => {
              const maxVal = Math.max(fin.specPlan, fin.servicesPlan, fin.taxPlan, fin.totalPlan, 1)
              const H = 140
              const barH = (v: number) => Math.max(2, Math.round((v / maxVal) * H))
              const groups = [
                { label: 'Специалисты', plan: fin.specPlan, fact: fin.specFact },
                { label: 'Услуги', plan: fin.servicesPlan, fact: fin.servicesFact },
                { label: 'Налог', plan: fin.taxPlan, fact: fin.taxFact },
                { label: 'Общ. расходы', plan: fin.totalPlan, fact: fin.totalFact },
              ]
              return (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, height: H + 30, flex: 1 }}>
                  {groups.map((g) => (
                    <div key={g.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, height: '100%', justifyContent: 'flex-end' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: H }}>
                        <div style={{ width: 18, background: '#94a3b8', borderRadius: '3px 3px 0 0', height: barH(g.plan) }} />
                        <div style={{ width: 18, background: '#3b82f6', borderRadius: '3px 3px 0 0', height: barH(g.fact) }} />
                      </div>
                      <div style={{ fontSize: 9, color: '#64748b', textAlign: 'center', marginTop: 4, lineHeight: 1.3 }}>{g.label}</div>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
        </div>
      </div>


    </div>
  )
}


function RegistryChangesTab({ entityId }: { entityId: string }) {
  const { data: logs = [], isLoading } = useQuery<ChangeLogEntry[]>({
    queryKey: ['change-logs', 'MatrixRegistry', entityId],
    queryFn: () => api.get(`/change-logs?entityType=MatrixRegistry&entityId=${entityId}&limit=100`).then((r) => r.data),
    staleTime: 30_000,
  })

  if (isLoading) return <div style={{ padding: '20px 24px', color: '#94a3b8', fontSize: 14 }}>Загрузка...</div>
  if (logs.length === 0) return <div style={{ padding: '20px 24px', color: '#94a3b8', fontSize: 14 }}>Нет записанных изменений</div>

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {logs.map((log) => (
          <div key={log.id} style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', padding: '12px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{log.user?.fullName ?? 'Система'}</span>
                <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 10, background: log.source === 'sync' ? '#eff6ff' : '#f0fdf4', color: log.source === 'sync' ? '#2563eb' : '#15803d', fontWeight: 500 }}>
                  {log.source === 'sync' ? 'синхр.' : 'вручную'}
                </span>
              </div>
              <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>
                {new Date(log.changedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
              <span style={{ fontWeight: 600, color: '#475569' }}>{log.field}</span>
              {log.oldValue != null && (
                <> <span style={{ color: '#ef4444', textDecoration: 'line-through', background: '#fef2f2', padding: '0 4px', borderRadius: 3 }}>{log.oldValue}</span></>
              )}
              {log.newValue != null && (
                <> <span style={{ color: '#94a3b8' }}>→</span> <span style={{ color: '#16a34a', background: '#f0fdf4', padding: '0 4px', borderRadius: 3 }}>{log.newValue}</span></>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Registry Tasks Tab ───────────────────────────────────────────────────────

interface LinkedTask {
  id: string
  name: string
  client: string | null
  status: string
  execProducer: string | null
  date: string | null
  dateApproximate: string | null
  format: string | null
}

const TASK_STATUS_LABELS: Record<string, string> = {
  request: 'Запрос', negotiation: 'На согл.', connecting: 'Подключение',
  preproduction: 'Препрод.', production: 'Продакшн', postproduction: 'Постпрод.',
  delivered: 'Сдан', rejected: 'Не согл.', cancelled: 'Отменён',
}

const TASK_STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  request:        { bg: '#dbeafe', color: '#1d4ed8' },
  negotiation:    { bg: '#e0f2fe', color: '#0369a1' },
  connecting:     { bg: '#fef3c7', color: '#92400e' },
  preproduction:  { bg: '#fef9c3', color: '#a16207' },
  production:     { bg: '#dcfce7', color: '#15803d' },
  postproduction: { bg: '#f0fdf4', color: '#16a34a' },
  delivered:      { bg: '#f5f3ff', color: '#6d28d9' },
  rejected:       { bg: '#fee2e2', color: '#b91c1c' },
  cancelled:      { bg: '#f1f5f9', color: '#64748b' },
}

function RegistryTasksTab({ matrixRegistryId, initialProjectId }: { matrixRegistryId: string; initialProjectId?: string | null }) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(initialProjectId ?? null)
  const [openTaskId, setOpenTaskId] = useState<string | null>(initialProjectId ?? null)

  const { data: tasks = [], isLoading } = useQuery<LinkedTask[]>({
    queryKey: ['registry-tasks', matrixRegistryId],
    queryFn: () => api.get('/status-rows', { params: { matrixRegistryId } }).then((r) => r.data),
    staleTime: 30_000,
  })

  const handleTaskClick = (taskId: string) => {
    setOpenTaskId((prev) => (prev === taskId ? null : taskId))
    setSelectedTaskId(taskId)
  }

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* ── LEFT: task accordion list ── */}
      <div style={{ width: 290, flexShrink: 0, background: '#fff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Задачи</span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {isLoading && (
            <div style={{ padding: '20px 16px', color: '#94a3b8', fontSize: 13 }}>Загрузка...</div>
          )}

          {!isLoading && tasks.length === 0 && (
            <div style={{ padding: '20px 16px', color: '#94a3b8', fontSize: 13, lineHeight: 1.5 }}>
              Нет задач.<br />
              <span style={{ fontSize: 12, color: '#cbd5e1' }}>Привязать задачу можно в Workflow.</span>
            </div>
          )}

          {tasks.map((task) => {
            const isOpen = openTaskId === task.id
            const isSelected = selectedTaskId === task.id
            const sc = TASK_STATUS_COLORS[task.status] ?? { bg: '#f1f5f9', color: '#64748b' }
            const label = task.format || task.name || '(без названия)'
            const dateStr = task.date
              ? new Date(task.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
              : task.dateApproximate || null

            return (
              <div key={task.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <div
                  onClick={() => handleTaskClick(task.id)}
                  style={{
                    padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8,
                    cursor: 'pointer', background: isSelected ? '#eff6ff' : 'transparent',
                    transition: 'background .15s',
                  }}
                  onMouseOver={(e) => { if (!isSelected) e.currentTarget.style.background = '#f8fafc' }}
                  onMouseOut={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                >
                  <span style={{
                    fontSize: 10, color: isSelected ? '#2563eb' : '#94a3b8',
                    transition: 'transform .22s', display: 'inline-block',
                    transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                    flexShrink: 0,
                  }}>▶</span>
                  <span style={{
                    fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    color: isSelected ? '#1d4ed8' : '#1e293b',
                  }}>{label}</span>
                  <span style={{ ...sc, padding: '2px 7px', borderRadius: 8, fontSize: 10, fontWeight: 600, flexShrink: 0 }}>
                    {TASK_STATUS_LABELS[task.status] ?? task.status}
                  </span>
                </div>

                {/* Accordion body — grid-template-rows for smooth animation */}
                <div style={{
                  display: 'grid',
                  gridTemplateRows: isOpen ? '1fr' : '0fr',
                  transition: 'grid-template-rows .25s cubic-bezier(.4,0,.2,1)',
                  background: '#fafbff',
                }}>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ padding: isOpen ? '8px 14px 12px' : '0 14px', transition: 'padding .25s cubic-bezier(.4,0,.2,1)' }}>
                      {task.client && (
                        <div style={{ paddingBottom: 6, marginBottom: 6, borderBottom: '1px solid #f1f5f9' }}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Клиент</div>
                          <div style={{ fontSize: 12, color: '#1e293b', fontWeight: 500 }}>{task.client}</div>
                        </div>
                      )}
                      {task.execProducer && (
                        <div style={{ paddingBottom: 6, marginBottom: 6, borderBottom: dateStr ? '1px solid #f1f5f9' : 'none' }}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Исп. продюсер</div>
                          <div style={{ fontSize: 12, color: '#1e293b', fontWeight: 500 }}>{task.execProducer}</div>
                        </div>
                      )}
                      {dateStr && (
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Дата</div>
                          <div style={{ fontSize: 12, color: '#1e293b', fontWeight: 500 }}>{dateStr}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── RIGHT: InternalShiftsPanel (same as former Отделы tab) ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <InternalShiftsPanel
          matrixRegistryId={matrixRegistryId}
          initialProjectId={selectedTaskId}
        />
      </div>
    </div>
  )
}

// ─── Registry Detail Modal ────────────────────────────────────────────────────

function RegistryDetailModal({ entry, onClose, onShiftsLoaded, onEdit, onDelete, initialProjectId }: { entry: RegistryEntry; onClose: () => void; onShiftsLoaded: (matrixId: string, hasShifts: boolean) => void; onEdit?: () => void; onDelete?: () => void; initialProjectId?: string | null }) {
  const [localEntry, setLocalEntry] = useState<RegistryEntry>(entry)
  const [tab, setTab] = useState<'info' | 'tasks' | 'gantt' | 'notes' | 'docs' | 'changes' | 'svodmatrix'>(initialProjectId ? 'tasks' : 'info')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const qc = useQueryClient()
  const isInternal = localEntry.source === 'internal'

  const { data: ganttTasks } = useQuery<GanttTaskInfo[]>({
    queryKey: ['gantt-tasks', entry.id],
    queryFn: () => api.get(`/matrix-gantt?matrixId=${entry.id}`).then((r) => r.data),
    staleTime: 30_000,
  })

  const statusColors: Record<string, { bg: string; color: string; border: string }> = {
    request:        { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
    negotiation:    { bg: '#fefce8', color: '#b45309', border: '#fde68a' },
    preproduction:  { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
    production:     { bg: '#fdf4ff', color: '#9333ea', border: '#f3e8ff' },
    postproduction: { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
    delivered:      { bg: '#f0fdf4', color: '#166534', border: '#86efac' },
    rejected:       { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
    cancelled:      { bg: '#f8fafc', color: '#94a3b8', border: '#e2e8f0' },
    manual:         { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' },
  }
  const statusStyle = localEntry.status ? (statusColors[localEntry.status] ?? { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' }) : null

  const TABS: { key: 'info' | 'tasks' | 'gantt' | 'notes' | 'docs' | 'changes' | 'svodmatrix'; label: string }[] = [
    { key: 'info',        label: 'Инфо' },
    { key: 'tasks',       label: 'Задачи' },
    { key: 'gantt',       label: 'Ганта' },
    { key: 'notes',       label: 'Заметки' },
    { key: 'docs',        label: 'Документы' },
    { key: 'changes',     label: 'Изменения' },
    { key: 'svodmatrix',  label: 'Свод матрица' },
  ]

  return (
    <>
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onMouseDown={() => {
        const el = document.activeElement
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) {
          (el as HTMLElement).blur()
          return
        }
        onClose()
      }}
    >
      <div
        style={{ background: '#f8fafc', borderRadius: 16, boxShadow: '0 24px 80px rgba(0,0,0,0.25)', width: '97vw', maxWidth: 1300, height: '95vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header + Tabs */}
        <div style={{ background: 'linear-gradient(135deg, #1e293b 0%, #1e3a5f 100%)', flexShrink: 0 }}>
          {/* Top row: title + buttons */}
          <div style={{ padding: '18px 24px 12px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                {statusStyle && (
                  <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: statusStyle.bg, color: statusStyle.color, border: `1px solid ${statusStyle.border}`, letterSpacing: '0.03em' }}>
                    {STATUS_LABELS[localEntry.status!] ?? localEntry.status}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {localEntry.client
                  ? <><span style={{ color: '#94a3b8' }}>{localEntry.client}:</span>{' '}{localEntry.projectName ?? localEntry.name ?? localEntry.matrixId}</>
                  : (localEntry.projectName ?? localEntry.name ?? localEntry.matrixId)
                }
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              {onDelete && (
                <button onClick={onDelete} style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', cursor: 'pointer', fontSize: 12, padding: '5px 12px', borderRadius: 8, fontWeight: 500 }}>
                  Удалить
                </button>
              )}
              <button
                onClick={onClose}
                style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#cbd5e1', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '4px 10px', borderRadius: 8 }}
                title="Закрыть (Esc)"
              >×</button>
            </div>
          </div>

          {/* Tabs row — inside the dark header */}
          <div style={{ display: 'flex', overflowX: 'auto', paddingLeft: 20 }}>
            {TABS.map(({ key, label }) => (
              <button key={key} onClick={() => setTab(key)} style={{
                padding: '8px 18px', fontSize: 13, border: 'none', cursor: 'pointer', background: 'none',
                borderBottom: tab === key ? '2px solid #60a5fa' : '2px solid transparent',
                color: tab === key ? '#f0f9ff' : '#94a3b8',
                fontWeight: tab === key ? 600 : 400,
                whiteSpace: 'nowrap', flexShrink: 0, transition: 'color .12s',
              }}
              onMouseOver={(e) => { if (tab !== key) e.currentTarget.style.color = '#cbd5e1' }}
              onMouseOut={(e) => { if (tab !== key) e.currentTarget.style.color = '#94a3b8' }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {/* Tab: Info */}
        {tab === 'info' && (
          <RegistryInfoTab
            entry={localEntry}
            ganttTasks={ganttTasks}
            onStatusChanged={(newStatus) => setLocalEntry((prev) => ({ ...prev, status: newStatus }))}
          />
        )}

        {/* Tab: Tasks */}
        {tab === 'tasks' && (
          <RegistryTasksTab matrixRegistryId={entry.id} initialProjectId={initialProjectId} />
        )}

        {/* Tab: Gantt */}
        {tab === 'gantt' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <GanttTab matrixId={entry.id} />
          </div>
        )}

        {/* Tab: Notes */}
        {tab === 'notes' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <NotesTab matrixId={entry.id} />
          </div>
        )}

        {/* Tab: Docs */}
        {tab === 'docs' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <DocumentsTab matrixId={entry.id} />
          </div>
        )}

        {/* Tab: Changes */}
        {tab === 'changes' && (
          <RegistryChangesTab entityId={entry.id} />
        )}

        {/* Tab: Свод матрица */}
        {tab === 'svodmatrix' && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
            <div style={{ textAlign: 'center', color: '#94a3b8' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>Свод матрица</div>
              <div style={{ fontSize: 13 }}>Появится после подключения базы цен сотрудников</div>
            </div>
          </div>
        )}

        {/* Sticky footer — source info */}
        <div style={{ flexShrink: 0, borderTop: '1px solid #e2e8f0', background: '#f8fafc', padding: '7px 24px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>Источник:</span>
          <span style={{
            padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
            background: isInternal ? '#f0fdf4' : '#eff6ff',
            color: isInternal ? '#15803d' : '#2563eb',
            border: `1px solid ${isInternal ? '#bbf7d0' : '#bfdbfe'}`,
          }}>
            {isInternal ? 'Внутренняя' : 'Google Sheets'}
          </span>
          {localEntry.lastSyncedAt && !isInternal && (
            <span style={{ fontSize: 11, color: '#cbd5e1' }}>· синхр. {fmtDate(localEntry.lastSyncedAt)}</span>
          )}
        </div>

      </div>
    </div>

    </>
  )
}

// ─── Matrix Preview Modal ─────────────────────────────────────────────────────

interface MatrixCell {
  value: string
  bg: string | null
  fg: string | null
  bold: boolean
  italic: boolean
  colSpan?: number
  rowSpan?: number
  hidden?: boolean
}

interface MatrixPreview {
  spreadsheetTitle: string
  spreadsheetUrl: string
  sheets: { title: string; sheetId: number }[]
  data: { title: string; rows: MatrixCell[][]; colWidths: number[] } | null
}

function MatrixPreviewModal({ matrixId, onClose }: { matrixId: string; onClose: () => void }) {
  const [activeSheet, setActiveSheet] = useState<string | undefined>(undefined)

  const { data, isLoading, error } = useQuery<MatrixPreview>({
    queryKey: ['matrix-preview', matrixId, activeSheet],
    queryFn: () => api.get(`/sync/matrix-preview/${encodeURIComponent(matrixId)}${activeSheet ? `?sheet=${encodeURIComponent(activeSheet)}` : ''}`).then((r) => r.data),
  })

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const sheets = data?.sheets ?? []
  const sheetData = data?.data

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 24px 80px rgba(0,0,0,0.25)',
          width: '96vw',
          height: '92vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {data?.spreadsheetTitle ?? matrixId}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace', marginTop: 2 }}>{matrixId}</div>
          </div>
          {data?.spreadsheetUrl && (
            <a href={data.spreadsheetUrl} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 13, color: '#3b82f6', textDecoration: 'none', flexShrink: 0 }}>
              Открыть в Google ↗
            </a>
          )}
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#94a3b8', lineHeight: 1, flexShrink: 0 }}>✕</button>
        </div>

        {/* Sheet tabs */}
        {sheets.length > 1 && (
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e2e8f0', overflowX: 'auto', flexShrink: 0 }}>
            {sheets.map((s) => {
              const isActive = (activeSheet ?? sheets[0]?.title) === s.title
              return (
                <button
                  key={s.sheetId}
                  onClick={() => setActiveSheet(s.title)}
                  style={{
                    padding: '8px 16px',
                    fontSize: 13,
                    border: 'none',
                    borderBottom: isActive ? '2px solid #3b82f6' : '2px solid transparent',
                    background: 'none',
                    cursor: 'pointer',
                    color: isActive ? '#3b82f6' : '#64748b',
                    fontWeight: isActive ? 600 : 400,
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {s.title}
                </button>
              )
            })}
          </div>
        )}

        {/* Grid */}
        <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
          {isLoading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b', fontSize: 14 }}>
              Загрузка...
            </div>
          )}
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#ef4444', fontSize: 14 }}>
              Ошибка загрузки: {(error as any).message}
            </div>
          )}
          {!isLoading && !error && sheetData && (
            <table style={{ borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' }}>
              <colgroup>
                {sheetData.colWidths.map((w, ci) => (
                  <col key={ci} style={{ width: w }} />
                ))}
              </colgroup>
              <tbody>
                {sheetData.rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => {
                      if (cell.hidden) return null
                      return (
                        <td
                          key={ci}
                          rowSpan={cell.rowSpan}
                          colSpan={cell.colSpan}
                          style={{
                            padding: '3px 6px',
                            border: '1px solid #e2e8f0',
                            background: cell.bg ?? (ri === 0 ? '#f1f5f9' : '#fff'),
                            color: cell.fg ?? '#1e293b',
                            fontWeight: cell.bold ? 600 : 400,
                            fontStyle: cell.italic ? 'italic' : 'normal',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            verticalAlign: 'middle',
                            maxWidth: 300,
                          }}
                        >
                          {cell.value}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!isLoading && !error && !sheetData && data && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: 14 }}>
              Нет данных на этом листе
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Registry Table ───────────────────────────────────────────────────────────

function getRegValue(r: RegistryEntry, col: string): string {
  switch (col) {
    case 'status': return r.status ?? ''
    case 'unit':   return Array.isArray(r.unit) ? r.unit.join(', ') : ''
    case 'client': return r.client ?? ''
    default:       return ''
  }
}

// ─── MultiSelect ──────────────────────────────────────────────────────────────

function MultiSelect({
  label, options, value, onChange,
}: {
  label: string
  options: string[]
  value: string[]
  onChange: (v: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const mouseHandler = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || dropRef.current?.contains(t)) return
      e.stopPropagation() // don't let this click close the parent modal
      setOpen(false)
    }
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) }
    }
    document.addEventListener('mousedown', mouseHandler, true)
    document.addEventListener('keydown', keyHandler, true)
    return () => {
      document.removeEventListener('mousedown', mouseHandler, true)
      document.removeEventListener('keydown', keyHandler, true)
    }
  }, [open])

  const toggle = (opt: string) => {
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt])
  }

  const handleOpen = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setDropPos({ top: rect.bottom + 2, left: rect.left, width: Math.max(rect.width, 240) })
    }
    setOpen((o) => !o)
  }

  const ls: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: '#64748b',
    textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4,
  }
  const triggerStyle: React.CSSProperties = {
    width: '100%', fontSize: 13, padding: '7px 10px', border: '1px solid #e2e8f0',
    borderRadius: 6, outline: 'none', color: value.length ? '#1e293b' : '#94a3b8',
    background: '#f8fafc', boxSizing: 'border-box', cursor: 'pointer',
    textAlign: 'left', fontFamily: 'inherit',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={ls}>{label}</div>
      <button type="button" ref={triggerRef} style={triggerStyle} onClick={handleOpen}>
        {value.length === 0 ? '— не выбрано —' : value.join(', ')}
      </button>
      {open && dropPos && (
        <div ref={dropRef} style={{
          position: 'fixed', top: dropPos.top, left: dropPos.left, width: dropPos.width,
          zIndex: 9999, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6,
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)', maxHeight: 200, overflowY: 'auto',
        }}>
          {options.map((opt) => (
            <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', cursor: 'pointer', fontSize: 13, color: '#1e293b' }}>
              <input type="checkbox" checked={value.includes(opt)} onChange={() => toggle(opt)} style={{ cursor: 'pointer' }} />
              {opt}
            </label>
          ))}
          {options.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: 13, color: '#94a3b8' }}>Нет вариантов</div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── StyledSelect ─────────────────────────────────────────────────────────────

function StyledSelect({
  options, value, onChange, placeholder = '—',
  renderOption, renderValue,
}: {
  options: string[]
  value: string
  onChange: (v: string) => void
  placeholder?: string
  renderOption?: (opt: string) => React.ReactNode
  renderValue?: (v: string) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const mouseHandler = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || dropRef.current?.contains(t)) return
      e.stopPropagation()
      setOpen(false)
    }
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) }
    }
    document.addEventListener('mousedown', mouseHandler, true)
    document.addEventListener('keydown', keyHandler, true)
    return () => {
      document.removeEventListener('mousedown', mouseHandler, true)
      document.removeEventListener('keydown', keyHandler, true)
    }
  }, [open])

  const handleOpen = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setDropPos({ top: rect.bottom + 2, left: rect.left, width: Math.max(rect.width, 200) })
    }
    setOpen((o) => !o)
  }

  const triggerStyle: React.CSSProperties = {
    fontSize: 13, padding: '4px 10px', border: '1px solid #e2e8f0',
    borderRadius: 20, outline: 'none', color: value ? '#1e293b' : '#94a3b8',
    background: '#f8fafc', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
    whiteSpace: 'nowrap', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis',
    display: 'inline-flex', alignItems: 'center', gap: 5,
  }

  return (
    <>
    <button type="button" ref={triggerRef} style={triggerStyle} onClick={handleOpen}>
      {value ? (renderValue ? renderValue(value) : value) : placeholder}
      <span style={{ opacity: 0.5, fontSize: 10, marginLeft: 2 }}>▾</span>
    </button>
    {open && dropPos && (
      <div ref={dropRef} style={{
        position: 'fixed', top: dropPos.top, left: dropPos.left, width: dropPos.width,
        zIndex: 9999, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
        boxShadow: '0 4px 20px rgba(0,0,0,0.12)', maxHeight: 220, overflowY: 'auto',
      }}>
        {options.map((opt) => (
          <div
            key={opt}
            onClick={() => { onChange(opt); setOpen(false) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
              cursor: 'pointer', fontSize: 13, color: opt === value ? '#1d4ed8' : '#1e293b',
              background: opt === value ? '#eff6ff' : 'transparent',
            }}
          >
            <span style={{ width: 14, flexShrink: 0, fontSize: 11 }}>{opt === value ? '✓' : ''}</span>
            {renderOption ? renderOption(opt) : opt}
          </div>
        ))}
        {options.length === 0 && (
          <div style={{ padding: '10px 14px', fontSize: 13, color: '#94a3b8' }}>Нет вариантов</div>
        )}
      </div>
    )}
    </>
  )
}

// ─── Matrix Form Modal ────────────────────────────────────────────────────────

interface KfpdData {
  columns: string[]
  rows: string[][]
}

function MatrixFormModal({
  matrix,
  onClose,
  onSaved,
}: {
  matrix?: RegistryEntry
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!matrix
  const [form, setForm] = useState({
    projectName: matrix?.projectName ?? '',
    client:      matrix?.client     ?? '',
    unit:        matrix?.unit       ?? [],
    format:      matrix?.format     ?? '',
    date:        matrix?.date ? matrix.date.slice(0, 10) : '',
    producer:    matrix?.producer   ?? '',
    manager:     matrix?.manager    ?? '',
    curator:     matrix?.curator    ?? '',
    kpLink:      matrix?.kpLink     ?? '',
    brief:       matrix?.brief      ?? '',
    templateId:  matrix?.templateId ?? '',
  })
  const [error, setError] = useState<string | null>(null)

  const { data: kfpdRaw } = useQuery<KfpdData>({
    queryKey: ['kfpd-preview'],
    queryFn: () => api.get('/database/preview/kfpd').then((r) => r.data),
  })

  // Extract unique non-empty values from a КФПД column by index
  const kfpdCol = (colIdx: number): string[] => {
    if (!kfpdRaw) return []
    return [...new Set(kfpdRaw.rows.map((r) => r[colIdx] ?? '').filter(Boolean))]
  }

  const clients    = kfpdCol(0)
  const formats    = kfpdCol(1)
  const producers  = kfpdCol(2)
  const bizUnits   = kfpdCol(5)

  const { confirm, confirmDialogProps } = useConfirmDialog()

  const confirmClose = async () => {
    const ok = await confirm({ title: 'Закрыть форму?', message: 'Несохранённые данные будут потеряны.', confirmLabel: 'Закрыть', confirmColor: '#64748b' })
    if (ok) onClose()
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') confirmClose() }
    window.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', handler); document.body.style.overflow = '' }
  }, [])

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        projectName: form.projectName.trim() || null,
        client:      form.client.trim()      || null,
        unit:        form.unit,
        format:      form.format.trim()      || null,
        date:        form.date ? new Date(form.date).toISOString() : null,
        producer:    form.producer.trim()    || null,
        manager:     form.manager.trim()     || null,
        curator:     form.curator.trim()     || null,
        kpLink:      form.kpLink.trim()      || null,
        brief:       form.brief.trim()       || null,
        templateId:  form.templateId         || null,
      }
      return isEdit
        ? api.patch(`/internal-matrix/${matrix!.id}`, body).then((r) => r.data)
        : api.post('/internal-matrix', body).then((r) => r.data)
    },
    onSuccess: (data: any) => {
      if (data?.driveError) setError(`Проект создан, но ошибка Drive: ${data.driveError}`)
      else { onSaved(); onClose() }
    },
    onError: (e: any) => setError(e?.response?.data?.error ?? e?.message ?? 'Ошибка'),
  })

  const fs: React.CSSProperties = {
    width: '100%', fontSize: 13, padding: '7px 10px', border: '1px solid #e2e8f0',
    borderRadius: 6, outline: 'none', color: '#1e293b', background: '#f8fafc', boxSizing: 'border-box',
  }
  const ls: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: '#64748b',
    textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4,
  }

  const fg = (label: string, key: string, placeholder?: string) => (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={ls}>{label}</div>
      <input style={fs} value={(form as any)[key]} onChange={set(key)} placeholder={placeholder} />
    </div>
  )

  const fsel = (label: string, key: string, options: string[]) => (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={ls}>{label}</div>
      <select style={fs} value={(form as any)[key]} onChange={set(key)}>
        <option value="">— не выбрано —</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )

  return (
    <>
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onMouseDown={confirmClose}>
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', width: '100%', maxWidth: 580, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onMouseDown={(e) => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>{isEdit ? 'Редактировать проект' : 'Новый проект'}</div>
          <button onClick={confirmClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>
        <div style={{ overflowY: 'auto', padding: '16px 20px', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Status badge — read-only */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Статус</span>
            <span style={{
              padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
              background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe',
            }}>
              {STATUS_LABELS[isEdit ? (matrix?.status ?? 'request') : 'request'] ?? 'Запрос'}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {fsel('Клиент', 'client', clients)}
            {fg('Название проекта', 'projectName', 'Название проекта')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {fsel('Формат', 'format', formats)}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={ls}>Дата</div>
              <input type="date" style={fs} value={form.date} onChange={set('date')} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {fsel('Продюсер от ММ', 'producer', producers)}
            {fsel('Менеджер по продажам', 'manager', producers)}
          </div>
          {fg('Ссылка на КП', 'kpLink', 'https://')}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {fg('Куратор от заказчика', 'curator', 'ФИО')}
            <MultiSelect
              label="Бизнес Юнит"
              options={bizUnits}
              value={form.unit}
              onChange={(v) => setForm((f) => ({ ...f, unit: v }))}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={ls}>Бриф по проекту</div>
            <textarea
              style={{ ...fs, resize: 'vertical', minHeight: 60 }}
              value={form.brief}
              onChange={set('brief')}
              placeholder="Краткое описание проекта"
            />
          </div>
          {error && <div style={{ fontSize: 13, color: '#ef4444', background: '#fef2f2', padding: '8px 12px', borderRadius: 6 }}>{error}</div>}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={confirmClose} style={{ fontSize: 13, padding: '7px 16px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'none', cursor: 'pointer', color: '#475569' }}>Отмена</button>
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            style={{ fontSize: 13, padding: '7px 16px', borderRadius: 6, border: 'none', background: save.isPending ? '#93c5fd' : '#2563eb', color: '#fff', cursor: save.isPending ? 'default' : 'pointer', fontWeight: 500 }}
          >
            {save.isPending ? 'Сохраняю...' : isEdit ? 'Сохранить' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
    <ConfirmDialog {...confirmDialogProps} />
    </>
  )
}

// ─── Registry Table ───────────────────────────────────────────────────────────

function RegistryTable({
  registry, loading, sheetUrl,
  primaryFilters, externalOpenTarget, onExternalOpenConsumed,
}: {
  registry: RegistryEntry[]
  loading: boolean
  sheetUrl: string | null
  primaryFilters: Record<string, string[]>
  externalOpenTarget?: { registryId: string; projectId: string } | null
  onExternalOpenConsumed?: () => void
}) {
  const queryClient = useQueryClient()
  const [colFilters, setColFilters] = usePersistedFilters('sync-col-reg')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'external' | 'internal'>(() => {
    return (localStorage.getItem('sync-reg-source-filter') as 'all' | 'external' | 'internal') ?? 'all'
  })
  const [openDrop, setOpenDrop] = useState<string | null>(null)
  const [selectedMatrix, setSelectedMatrix] = useState<string | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<RegistryEntry | null>(null)
  const [formMatrix, setFormMatrix] = useState<RegistryEntry | 'new' | null>(null)
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [deletedNotice, setDeletedNotice] = useState<string | null>(null)

  const deleteMatrix = useMutation({
    mutationFn: (id: string) => api.delete(`/internal-matrix/${id}`).then((r) => r.data),
    onSuccess: (_data, id) => {
      const entry = registry.find((r) => r.id === id)
      setDeletedNotice(entry?.projectName ?? entry?.name ?? entry?.matrixId ?? id)
      queryClient.invalidateQueries({ queryKey: ['sync-registry'] })
    },
  })

  const { confirm: confirmAction, confirmDialogProps } = useConfirmDialog()

  function openEntry(r: RegistryEntry) {
    if (highlightTimer.current) { clearTimeout(highlightTimer.current); highlightTimer.current = null }
    setHighlightedId(r.id)
    setSelectedEntry(r)
  }

  function closeEntry() {
    setSelectedEntry(null)
    highlightTimer.current = setTimeout(() => { setHighlightedId(null); highlightTimer.current = null }, 1000)
  }

  // External open (from "Открыть в проекте" button in ProjectsTable)
  const [initialProjectId, setInitialProjectId] = useState<string | null>(null)
  useEffect(() => {
    if (!externalOpenTarget) return
    const entry = registry.find((r) => r.id === externalOpenTarget.registryId)
    if (entry) {
      openEntry(entry)
      setInitialProjectId(externalOpenTarget.projectId)
    }
    onExternalOpenConsumed?.()
  }, [externalOpenTarget])

  const [shiftsStatus, setShiftsStatus] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('matrix-shifts-status') ?? '{}') } catch { return {} }
  })
  const handleShiftsLoaded = (matrixId: string, hasShifts: boolean) => {
    setShiftsStatus((prev) => {
      const next = { ...prev, [matrixId]: hasShifts }
      localStorage.setItem('matrix-shifts-status', JSON.stringify(next))
      return next
    })
  }
  const scrollRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(9999)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver((entries) => setContainerWidth(entries[0].contentRect.width))
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const hiddenCols = getRegHiddenCols(containerWidth)

  useEffect(() => {
    if (!openDrop) return
    const el = scrollRef.current
    const close = () => setOpenDrop(null)
    el?.addEventListener('scroll', close)
    window.addEventListener('scroll', close)
    return () => {
      el?.removeEventListener('scroll', close)
      window.removeEventListener('scroll', close)
    }
  }, [openDrop])

  const registryFiltered = useMemo(() => {
    if (sourceFilter === 'external') return registry.filter((r) => r.source === 'google')
    if (sourceFilter === 'internal') return registry.filter((r) => r.source === 'internal')
    return registry
  }, [registry, sourceFilter])

  // Primary filter
  const afterPrimary = useMemo(() => {
    return registryFiltered.filter((r) => {
      for (const [col, sel] of Object.entries(primaryFilters)) {
        if (sel.length === 0) continue
        let val: string
        if (col === 'unit') {
          if (!r.unit.some((u) => sel.includes(u))) return false
          continue
        }
        if (col === 'status') val = r.status ?? ''
        else if (col === 'format') val = r.format ?? ''
        else continue
        if (!sel.includes(val)) return false
      }
      return true
    })
  }, [registryFiltered, primaryFilters])

  // Column dropdown values
  const colValues = useMemo(() => ({
    status: uniq(afterPrimary.map((r) => r.status)),
    unit:   uniq(afterPrimary.flatMap((r) => r.unit)),
    client: uniq(afterPrimary.map((r) => r.client)),
  }), [afterPrimary])

  // Secondary filter + sort by date
  const afterSecondary = useMemo(() => {
    return afterPrimary
      .filter((r) => {
        for (const [col, sel] of Object.entries(colFilters)) {
          if (sel.length === 0) return false
          if (!sel.includes(getRegValue(r, col))) return false
        }
        return true
      })
      .sort((a, b) => {
        if (!a.date && !b.date) return 0
        if (!a.date) return 1
        if (!b.date) return -1
        return new Date(a.date).getTime() - new Date(b.date).getTime()
      })
  }, [afterPrimary, colFilters])

  const visibleCols = REG_COLS.filter((c) => !hiddenCols.has(c.key))
  const colSpanCount = visibleCols.length + 1 // +1 for source icon column
  const totalColFilters = Object.values(colFilters).reduce((s, a) => s + a.length, 0)


  function renderRegCell(col: ColDef, r: RegistryEntry) {
    switch (col.key) {
      case 'status':
        return r.status
          ? <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: '#f1f5f9', color: '#475569' }}>{r.status}</span>
          : <span style={{ color: '#94a3b8' }}>—</span>
      case 'sheetUrl':
        return r.sheetUrl
          ? r.sheetUrl.startsWith('https://')
            ? (
              <a
                href={r.sheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 20,
                  padding: '1px 8px 1px 5px', color: '#15803d', textDecoration: 'none',
                  fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap',
                }}
              >
                <span style={{ fontSize: 12 }}>📊</span>
                Открыть
                <span style={{ fontSize: 9, opacity: 0.6 }}>↗</span>
              </a>
            )
            : r.sheetUrl
          : <span style={{ color: '#94a3b8' }}>—</span>
      case 'matrixId': return (
        <button
          onClick={(e) => { e.stopPropagation(); setSelectedMatrix(r.matrixId) }}
          style={{ fontFamily: 'monospace', fontSize: 12, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
        >
          {r.matrixId}
        </button>
      )
      case 'unit':     return Array.isArray(r.unit) && r.unit.length ? r.unit.join(', ') : '—'
      case 'client':   return r.client ?? '—'
      case 'name':     return r.name ?? '—'
      case 'format':   return r.format ?? '—'
      case 'date':     return fmtDate(r.date)
      case 'producer': return r.producer ?? '—'
      case 'manager':  return r.manager ?? '—'
      case 'curator':  return r.curator ?? '—'
      default:         return null
    }
  }

  return (
    <>
    <div ref={containerRef} style={panelStyle}>
      <div style={panelHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: 15, color: '#1e293b', whiteSpace: 'nowrap' }}>
            <a href={sheetUrl ?? '#'} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none', borderBottom: '1px dashed #94a3b8' }}>
              Реестр проектов
            </a>
            <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 400, color: '#64748b' }}>
              {afterSecondary.length} / {registry.length}
            </span>
          </span>
          <div style={{ display: 'flex', gap: 3 }}>
            {(['all', 'external', 'internal'] as const).map((v) => (
              <button
                key={v}
                onClick={() => { setSourceFilter(v); localStorage.setItem('sync-reg-source-filter', v) }}
                style={{
                  fontSize: 11, padding: '3px 9px', borderRadius: 5, border: `1px solid ${sourceFilter === v ? '#3b82f6' : '#e2e8f0'}`,
                  background: sourceFilter === v ? '#eff6ff' : '#f8fafc',
                  color: sourceFilter === v ? '#2563eb' : '#94a3b8',
                  cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap',
                }}
              >
                {v === 'all' ? 'Все' : v === 'external' ? 'Внешние' : 'Внутренние'}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {totalColFilters > 0 && (
            <button onClick={() => setColFilters({})} style={resetBtn}>
              Сбросить ({totalColFilters})
            </button>
          )}
          <button
            onClick={() => setFormMatrix('new')}
            style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap' }}
          >
            + Создать проект
          </button>
        </div>
      </div>

      <div ref={scrollRef} style={{ overflowX: 'hidden', overflowY: 'auto', flex: 1 }}>
        {loading ? (
          <div style={emptyMsg}>Загрузка...</div>
        ) : registry.length === 0 ? (
          <div style={emptyMsg}>Данные не загружены — запустите синхронизацию</div>
        ) : (
          <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>
            <thead>
              <tr>
                <th style={{ ...thBase, width: 28, padding: '6px 4px 6px 8px' }} />
                {visibleCols.map((col) => {
                  const allVals = (colValues as Record<string, string[]>)[col.key] ?? []
                  const activeSel = colFilters[col.key]
                  const hiddenCount = activeSel != null ? allVals.filter((v) => !activeSel.includes(v)).length : 0
                  const hasFilter = hiddenCount > 0
                  const isOpen = openDrop === col.key
                  return (
                    <th key={col.key} style={{ ...thBase, overflow: 'visible' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
                        <span style={thLabel}>{col.label}</span>
                        {col.filterable && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setOpenDrop(isOpen ? null : col.key) }}
                            style={filterDropBtn(hasFilter)}
                            title={hasFilter ? `Скрыто: ${hiddenCount}` : 'Фильтр'}
                          >
                            {hasFilter ? `-${hiddenCount}` : '▾'}
                          </button>
                        )}
                      </div>
                      {isOpen && (
                        <ColDropdown
                          values={(colValues as Record<string, string[]>)[col.key] ?? []}
                          selected={activeSel ?? allVals}
                          onToggle={(v) => setColFilters((f) => {
                            const cur = f[col.key] ?? allVals
                            const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]
                            if (next.length >= allVals.length && allVals.every((av) => next.includes(av))) {
                              const n = { ...f }; delete n[col.key]; return n
                            }
                            return { ...f, [col.key]: next }
                          })}
                          onClear={() => setColFilters((f) => ({ ...f, [col.key]: [] }))}
                          onSelectAll={() => setColFilters((f) => { const n = { ...f }; delete n[col.key]; return n })}
                          onClose={() => setOpenDrop(null)}
                        />
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {afterSecondary.length === 0 ? (
                <tr><td colSpan={colSpanCount} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Нет строк по выбранным фильтрам</td></tr>
              ) : afterSecondary.map((r, i) => {
                // hasShiftsData from DB (set during sync) takes priority; fall back to manual-open cache
                const dbKnown  = r.hasShiftsData !== null && r.hasShiftsData !== undefined
                const hasShifts = dbKnown ? r.hasShiftsData === true  : (shiftsStatus[r.matrixId] === true)
                const noShifts  = dbKnown ? r.hasShiftsData === false : (shiftsStatus[r.matrixId] === false)
                const known = hasShifts || noShifts
                return (
                <tr
                  key={r.id}
                  style={{ background: highlightedId === r.id ? '#eff6ff' : noShifts ? (i % 2 === 0 ? '#fee2e2' : '#fecaca') : hasShifts ? (i % 2 === 0 ? '#dcfce7' : '#bbf7d0') : (i % 2 === 0 ? '#fff' : '#f8fafc'), cursor: 'pointer', outline: highlightedId === r.id ? '2px solid #93c5fd' : undefined, outlineOffset: '-1px' }}
                  onClick={() => openEntry(r)}
                  title={noShifts ? 'Нет данных о сменах' : known ? 'Есть данные о сменах' : 'Нажмите для просмотра деталей'}
                >
                  <td style={{ ...tdStyle, width: 28, padding: '4px 4px 4px 8px' }}>
                    <SourceBadge source={r.source ?? 'google'} />
                  </td>
                  {visibleCols.map((col) => (
                    <td
                      key={col.key}
                      style={tdStyle}
                      title={col.key === 'name' ? (r.name ?? '') : undefined}
                    >
                      {renderRegCell(col, r)}
                    </td>
                  ))}
                </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
    {selectedEntry && (
      <RegistryDetailModal
        entry={selectedEntry}
        onClose={() => { closeEntry(); setInitialProjectId(null) }}
        onShiftsLoaded={handleShiftsLoaded}
        initialProjectId={initialProjectId}
        onEdit={selectedEntry.source === 'internal' ? () => { setFormMatrix(selectedEntry); closeEntry() } : undefined}
        onDelete={selectedEntry.source === 'internal' ? async () => {
          const name = selectedEntry.projectName ?? selectedEntry.name ?? selectedEntry.matrixId
          const ok = await confirmAction({ title: `Удалить проект «${name}»?`, message: 'Это действие нельзя отменить.', confirmLabel: 'Удалить', confirmColor: '#ef4444' })
          if (ok) { deleteMatrix.mutate(selectedEntry.id); closeEntry() }
        } : undefined}
      />
    )}
    {selectedMatrix && (
      <MatrixPreviewModal matrixId={selectedMatrix} onClose={() => setSelectedMatrix(null)} />
    )}
    {deletedNotice && (
      <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', zIndex: 500, background: '#1e293b', color: '#fff', borderRadius: 10, padding: '12px 20px', fontSize: 13, boxShadow: '0 4px 24px rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', gap: 12, maxWidth: 420 }}>
        <span>Проект <b>«{deletedNotice}»</b> удалён вручную — запись удалена из реестра</span>
        <button onClick={() => setDeletedNotice(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
      </div>
    )}
    {formMatrix != null && (
      <MatrixFormModal
        matrix={formMatrix === 'new' ? undefined : formMatrix}
        onClose={() => setFormMatrix(null)}
        onSaved={() => { queryClient.invalidateQueries({ queryKey: ['sync-registry'] }); setFormMatrix(null) }}
      />
    )}
    <ConfirmDialog {...confirmDialogProps} />
    </>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function SyncDataPage() {
  const qc = useQueryClient()
  const [resetResult, setResetResult] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [regFilters, setRegFilters] = usePersistedFilters('sync-primary-reg')
  const [openMatrixTarget, setOpenMatrixTarget] = useState<{ registryId: string; projectId: string } | null>(null)

  const { data: sheetUrls } = useQuery<{ projectsSheetUrl: string | null; registrySheetUrl: string | null }>({
    queryKey: ['sync-sheet-urls'],
    queryFn: () => api.get('/sync/sheet-urls').then((r) => r.data),
    staleTime: Infinity,
  })

  const { data: registry = [], isLoading: regLoading } = useQuery<RegistryEntry[]>({
    queryKey: ['sync-registry'],
    queryFn: () => api.get('/sync/registry').then((r) => r.data),
    refetchInterval: 5000,
  })

  const reset = useMutation({
    mutationFn: () => api.post('/sync/reset'),
    onSuccess: (res) => {
      const d = res.data.deleted
      setResetResult(`Удалено: ${d.registryEntries} записей реестра, ${d.shiftEntries} смен`)
      qc.invalidateQueries({ queryKey: ['sync-registry'] })
    },
  })

  const regOpts = useMemo(() => ({
    status: uniq(registry.map((r) => r.status)),
    unit:   uniq(registry.flatMap((r) => r.unit)),
    format: uniq(registry.map((r) => r.format)),
  }), [registry])

  const totalPrimary = Object.values(regFilters).reduce((s, a) => s + (a as string[]).length, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 104px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexShrink: 0 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Реестр проектов</h2>
        <button
          onClick={() => setSettingsOpen(true)}
          style={{
            ...filterBtn,
            background: totalPrimary > 0 ? '#eff6ff' : '#f8fafc',
            borderColor: totalPrimary > 0 ? '#93c5fd' : '#e2e8f0',
            color: totalPrimary > 0 ? '#2563eb' : '#64748b',
          }}
        >
          ⚙ Настройки{totalPrimary > 0 ? ` (${totalPrimary})` : ''}
        </button>
        <button
          onClick={() => {
            if (window.confirm('Удалить все импортированные данные? Вручную созданные проекты останутся.')) {
              setResetResult(null)
              reset.mutate()
            }
          }}
          disabled={reset.isPending}
          style={{
            padding: '6px 14px', borderRadius: 6, border: '1px solid #fca5a5',
            background: reset.isPending ? '#f1f5f9' : '#fff',
            color: reset.isPending ? '#94a3b8' : '#dc2626',
            fontSize: 13, cursor: reset.isPending ? 'default' : 'pointer',
          }}
        >
          {reset.isPending ? 'Удаление...' : 'Сбросить импорт'}
        </button>
        {resetResult && <span style={{ fontSize: 13, color: '#16a34a' }}>{resetResult}</span>}
      </div>

      {settingsOpen && (
        <GlobalSettingsPopup
          projFilters={{}} onProjFilters={() => {}}
          regFilters={regFilters} onRegFilters={setRegFilters}
          projOpts={{ status: [], format: [], location: [] }} regOpts={regOpts}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <RegistryTable
          registry={registry} loading={regLoading}
          sheetUrl={sheetUrls?.registrySheetUrl ?? null}
          primaryFilters={regFilters}
          externalOpenTarget={openMatrixTarget}
          onExternalOpenConsumed={() => setOpenMatrixTarget(null)}
        />
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  background: '#fff',
  borderRadius: 10,
  border: '1px solid #e2e8f0',
  overflow: 'clip',
}

const panelHeader: React.CSSProperties = {
  padding: '10px 16px',
  borderBottom: '1px solid #e2e8f0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexShrink: 0,
}

const thBase: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  background: '#f1f5f9',
  padding: '8px 10px',
  borderBottom: '2px solid #e2e8f0',
  textAlign: 'left',
  verticalAlign: 'bottom',
  zIndex: 1,
}

const thLabel: React.CSSProperties = {
  fontSize: 12,
  color: '#334155',
  fontWeight: 600,
}

const tdStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderBottom: '1px solid #f1f5f9',
  color: '#374151',
  whiteSpace: 'normal',
  overflowWrap: 'normal',
}

const shiftTh: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  background: '#f8fafc',
  padding: '6px 10px',
  borderBottom: '2px solid #e2e8f0',
  fontWeight: 600,
  fontSize: 12,
  color: '#334155',
  whiteSpace: 'nowrap',
  zIndex: 1,
}

const shiftTd: React.CSSProperties = {
  padding: '5px 10px',
  borderBottom: '1px solid #f1f5f9',
  color: '#374151',
  whiteSpace: 'nowrap',
}

const separatorTd: React.CSSProperties = {
  padding: '6px 12px',
  background: '#f1f5f9',
  borderTop: '2px solid #cbd5e1',
  borderBottom: '1px solid #e2e8f0',
  borderLeft: '3px solid #3b82f6',
  fontSize: 11,
  fontWeight: 700,
  color: '#475569',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

const emptyMsg: React.CSSProperties = {
  padding: 32,
  textAlign: 'center',
  color: '#94a3b8',
  fontSize: 14,
}

const resetBtn: React.CSSProperties = {
  background: 'none',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  padding: '4px 10px',
  fontSize: 12,
  color: '#64748b',
  cursor: 'pointer',
}

const filterBtn: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 6,
  border: '1px solid #e2e8f0',
  fontSize: 13,
  cursor: 'pointer',
  fontWeight: 500,
}

const popupOverlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.35)',
  zIndex: 1000,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  paddingTop: 80,
}

const settingsSection: React.CSSProperties = {
  paddingBottom: 20,
  marginBottom: 20,
  borderBottom: '1px solid #f1f5f9',
}

const settingsSectionTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

const filterColLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#94a3b8',
  marginBottom: 8,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

function colToggleBtn(visible: boolean): React.CSSProperties {
  return {
    padding: '4px 10px',
    borderRadius: 6,
    border: `1px solid ${visible ? '#93c5fd' : '#e2e8f0'}`,
    background: visible ? '#eff6ff' : '#f8fafc',
    color: visible ? '#2563eb' : '#94a3b8',
    fontSize: 12,
    cursor: 'pointer',
    fontWeight: 500,
  }
}

function filterDropBtn(active: boolean): React.CSSProperties {
  return {
    background: active ? '#3b82f6' : 'transparent',
    border: active ? 'none' : '1px solid #cbd5e1',
    borderRadius: 4,
    cursor: 'pointer',
    padding: '1px 5px',
    fontSize: 10,
    color: active ? '#fff' : '#94a3b8',
    lineHeight: 1.5,
    flexShrink: 0,
  }
}
