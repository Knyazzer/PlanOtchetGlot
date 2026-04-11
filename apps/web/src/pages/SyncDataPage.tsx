import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { api } from '../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Project {
  id: string
  googleRowIndex: number | null
  source: string
  status: string
  client: string | null
  name: string
  execProducer: string | null
  lineProducer: string | null
  accountManager: string | null
  date: string | null
  time: string | null
  format: string | null
  location: string | null
  sheetMatrixId: string | null
  uncertainFields: string[]
}

interface RegistryEntry {
  id: string
  matrixId: string
  sheetUrl: string | null
  status: string | null
  unit: string | null
  client: string | null
  name: string | null
  format: string | null
  date: string | null
  producer: string | null
  manager: string | null
  curator: string | null
  projectId: string | null
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
  'Знаменка чёрная': '#000000',  // чёрный
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
  { key: 'name',           label: 'C Название' },
  { key: 'execProducer',   label: 'D Исп.прод.' },
  { key: 'lineProducer',   label: 'E Лайн-прод.' },
  { key: 'accountManager', label: 'F Аккаунт' },
  { key: 'date',           label: 'G Дата',         filterable: true },
  { key: 'time',           label: 'H Время' },
  { key: 'format',         label: 'I Формат',       filterable: true },
  { key: 'location',       label: 'J Локация',      filterable: true },
  { key: 'matrixId',       label: 'K Матрица',      filterable: true, special: 'matrixId' },
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
  { key: 'sheetUrl', label: 'B Матрица' },
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

function uniq(values: (string | null | undefined)[]): string[] {
  const set = new Set<string>()
  for (const v of values) if (v) set.add(v)
  return Array.from(set).sort()
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function usePersistedFilters(storageKey: string) {
  const [state, setRaw] = useState<Record<string, string[]>>(() => {
    try { const s = localStorage.getItem(storageKey); return s ? JSON.parse(s) : {} } catch { return {} }
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
  values, selected, onToggle, onClear, onClose,
}: {
  values: string[]
  selected: string[]
  onToggle: (v: string) => void
  onClear: () => void
  onClose: () => void
}) {
  return (
    <>
      {/* Backdrop: closes dropdown on outside click */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 50 }}
        onMouseDown={onClose}
      />
      {/* Dropdown panel: absolute inside the <th> */}
      <div
        style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          zIndex: 51,
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          boxShadow: '0 4px 20px rgba(15,23,42,0.14)',
          padding: '6px 0',
          minWidth: 190,
          maxHeight: 280,
          overflowY: 'auto',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
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
        {selected.length > 0 && (
          <>
            <div style={{ borderTop: '1px solid #f1f5f9', margin: '4px 0' }} />
            <div style={{ padding: '2px 14px' }}>
              <button onClick={onClear} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 12, cursor: 'pointer', padding: '2px 0' }}>
                Сбросить ({selected.length})
              </button>
            </div>
          </>
        )}
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
            <span style={settingsSectionTitle}>Фильтры — Реестр матриц</span>
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

function getProjValue(p: Project, col: string): string {
  switch (col) {
    case 'status':   return STATUS_LABELS[p.status] ?? p.status
    case 'client':   return p.client ?? ''
    case 'date':     return fmtDate(p.date)
    case 'format':   return p.format ?? ''
    case 'location': return p.location ?? ''
    default:         return ''
  }
}

function applyProjColFilters(rows: Project[], colFilters: Record<string, string[]>): Project[] {
  return rows.filter((p) => {
    for (const [col, sel] of Object.entries(colFilters)) {
      if (sel.length === 0) continue
      if (col === 'matrixId') {
        const hasId = !!p.sheetMatrixId
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

function ProjectDetailModal({ project, onClose }: { project: Project; onClose: () => void }) {
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
    { label: 'Дата',    fieldKey: 'date',     value: fmtDate(project.date) },
    { label: 'Время',   fieldKey: 'time',     value: project.time },
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
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', lineHeight: 1.4 }}>{project.name}</div>
            {project.client && <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{project.client}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <span style={{ padding: '3px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600, background: `${statusColor}22`, color: statusColor }}>
              {status}
            </span>
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

        </div>
      </div>
    </div>
  )
}

// ─── Projects Table ───────────────────────────────────────────────────────────

function ProjectsTable({
  projects, loading, sheetUrl,
  primaryFilters,
}: {
  projects: Project[]
  loading: boolean
  sheetUrl: string | null
  primaryFilters: Record<string, string[]>
}) {
  const [colFilters, setColFilters] = usePersistedFilters('sync-col-proj')
  const [openDrop, setOpenDrop] = useState<string | null>(null)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
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

  const hiddenCols = getProjHiddenCols(containerWidth)

  // Close dropdown on scroll
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

  const allNonSep = useMemo(() => projects.filter((p) => p.source !== 'separator'), [projects])

  const afterPrimary = useMemo(() => {
    return allNonSep.filter((p) => {
      for (const [col, sel] of Object.entries(primaryFilters)) {
        if (sel.length === 0) continue
        if (!sel.includes(getProjValue(p, col))) return false
      }
      return true
    })
  }, [allNonSep, primaryFilters])

  const colValues = useMemo(() => ({
    status:   uniq(afterPrimary.map((p) => STATUS_LABELS[p.status] ?? p.status)),
    client:   uniq(afterPrimary.map((p) => p.client)),
    date:     uniq(afterPrimary.map((p) => { const d = fmtDate(p.date); return d !== '—' ? d : null })),
    format:   uniq(afterPrimary.map((p) => p.format)),
    location: uniq(afterPrimary.map((p) => p.location)),
    matrixId: ['Есть ID', 'Нет ID'] as string[],
  }), [afterPrimary])

  const afterSecondary = useMemo(() => applyProjColFilters(afterPrimary, colFilters), [afterPrimary, colFilters])
  const visibleIds = useMemo(() => new Set(afterSecondary.map((p) => p.id)), [afterSecondary])

  const rows = useMemo(() => {
    const result: Project[] = []
    for (let i = 0; i < projects.length; i++) {
      const p = projects[i]
      if (p.source === 'separator') {
        const nextSepIdx = projects.findIndex((q, j) => j > i && q.source === 'separator')
        const slice = projects.slice(i + 1, nextSepIdx === -1 ? undefined : nextSepIdx)
        if (slice.some((q) => visibleIds.has(q.id))) result.push(p)
      } else if (visibleIds.has(p.id)) {
        result.push(p)
      }
    }
    return result
  }, [projects, visibleIds])

  const visibleCols = PROJ_COLS.filter((c) => !hiddenCols.has(c.key))
  const colSpanCount = visibleCols.length
  const totalColFilters = Object.values(colFilters).reduce((s, a) => s + a.length, 0)

  function toggleColFilter(colKey: string, val: string) {
    setColFilters((f) => {
      const cur = f[colKey] ?? []
      const next = cur.includes(val) ? cur.filter((v) => v !== val) : [...cur, val]
      return { ...f, [colKey]: next }
    })
  }

  function renderProjCell(col: ColDef, p: Project, cc?: CellColor) {
    switch (col.key) {
      case 'status': {
        // Если есть цвет из таблицы — просто текст (td уже покрашен)
        if (cc?.bg || cc?.fg) {
          return <span style={{ fontSize: 11, fontWeight: 600 }}>{STATUS_LABELS[p.status] ?? p.status}</span>
        }
        return (
          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: `${STATUS_COLORS[p.status] ?? '#94a3b8'}22`, color: STATUS_COLORS[p.status] ?? '#94a3b8' }}>
            {STATUS_LABELS[p.status] ?? p.status}
          </span>
        )
      }
      case 'client':         return p.client ?? '—'
      case 'name':           return p.name
      case 'execProducer':   return p.execProducer ?? '—'
      case 'lineProducer':   return p.lineProducer ?? '—'
      case 'accountManager': return p.accountManager ?? '—'
      case 'date':           return fmtDate(p.date)
      case 'time':           return p.time ?? '—'
      case 'format':         return p.format ?? '—'
      case 'location':       return p.location ?? '—'
      case 'matrixId':       return <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#475569' }}>{p.sheetMatrixId ?? '—'}</span>
      default:               return null
    }
  }

  return (
    <>
    <div ref={containerRef} style={panelStyle}>
      <div style={panelHeader}>
        <span style={{ fontWeight: 600, fontSize: 15, color: '#1e293b' }}>
          <a href={sheetUrl ?? '#'} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none', borderBottom: '1px dashed #94a3b8' }}>
            Проекты из таблицы
          </a>
          <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 400, color: '#64748b' }}>
            {afterSecondary.length} / {allNonSep.length}
          </span>
        </span>
        {totalColFilters > 0 && (
          <button onClick={() => setColFilters({})} style={resetBtn}>
            Сбросить ({totalColFilters})
          </button>
        )}
      </div>

      <div ref={scrollRef} style={{ overflowX: 'hidden', overflowY: 'auto', flex: 1 }}>
        {loading ? (
          <div style={emptyMsg}>Загрузка...</div>
        ) : projects.length === 0 ? (
          <div style={emptyMsg}>Данные не загружены — запустите синхронизацию</div>
        ) : (
          <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>
            <thead>
              <tr>
                {visibleCols.map((col) => {
                  const hasFilter = (colFilters[col.key] ?? []).length > 0
                  const isOpen = openDrop === col.key
                  return (
                    <th key={col.key} style={{ ...thBase, position: 'relative', overflow: 'visible' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
                        <span style={thLabel}>{col.label}</span>
                        {col.filterable && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setOpenDrop(isOpen ? null : col.key) }}
                            style={filterDropBtn(hasFilter)}
                            title={hasFilter ? `Фильтр: ${(colFilters[col.key] ?? []).length}` : 'Фильтр'}
                          >
                            {hasFilter ? `${(colFilters[col.key] ?? []).length}` : '▾'}
                          </button>
                        )}
                      </div>
                      {isOpen && (
                        <ColDropdown
                          values={(colValues as Record<string, string[]>)[col.key] ?? []}
                          selected={colFilters[col.key] ?? []}
                          onToggle={(v) => toggleColFilter(col.key, v)}
                          onClear={() => setColFilters((f) => ({ ...f, [col.key]: [] }))}
                          onClose={() => setOpenDrop(null)}
                        />
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={colSpanCount} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Нет строк по выбранным фильтрам</td></tr>
              ) : rows.map((p, i) => {
                if (p.source === 'separator') {
                  return (
                    <tr key={p.id}>
                      <td colSpan={colSpanCount} style={separatorTd}>{p.name}</td>
                    </tr>
                  )
                }
                const cellColors = parseUncertainColors(p.uncertainFields ?? [])
                const rowBg = i % 2 === 0 ? '#fff' : '#f8fafc'
                return (
                  <tr
                    key={p.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedProject(p)}
                    title="Нажмите для просмотра деталей"
                  >
                    {visibleCols.map((col) => {
                      const chipBg = getValueChipColor(col.key, p)
                      const cc = chipBg ? { bg: chipBg } : cellColors[col.key]
                      const effectiveBg = cc?.bg ?? rowBg
                      const effectiveFg = cc?.fg ?? (cc?.bg ? contrastColor(cc.bg) : undefined)
                      return (
                        <td
                          key={col.key}
                          style={{
                            ...tdStyle,
                            background: effectiveBg,
                            color: effectiveFg,
                          }}
                          title={col.key === 'name' ? p.name : undefined}
                        >
                          {renderProjCell(col, p, cc)}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>

    {selectedProject && (
      <ProjectDetailModal project={selectedProject} onClose={() => setSelectedProject(null)} />
    )}
    </>
  )
}

// ─── Registry Table ───────────────────────────────────────────────────────────

function getRegValue(r: RegistryEntry, col: string): string {
  switch (col) {
    case 'status': return r.status ?? ''
    case 'unit':   return r.unit ?? ''
    case 'client': return r.client ?? ''
    default:       return ''
  }
}

function RegistryTable({
  registry, loading, sheetUrl,
  primaryFilters,
}: {
  registry: RegistryEntry[]
  loading: boolean
  sheetUrl: string | null
  primaryFilters: Record<string, string[]>
}) {
  const [colFilters, setColFilters] = usePersistedFilters('sync-col-reg')
  const [openDrop, setOpenDrop] = useState<string | null>(null)
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

  // Primary filter
  const afterPrimary = useMemo(() => {
    return registry.filter((r) => {
      for (const [col, sel] of Object.entries(primaryFilters)) {
        if (sel.length === 0) continue
        let val: string
        if (col === 'status') val = r.status ?? ''
        else if (col === 'unit') val = r.unit ?? ''
        else if (col === 'format') val = r.format ?? ''
        else continue
        if (!sel.includes(val)) return false
      }
      return true
    })
  }, [registry, primaryFilters])

  // Column dropdown values
  const colValues = useMemo(() => ({
    status: uniq(afterPrimary.map((r) => r.status)),
    unit:   uniq(afterPrimary.map((r) => r.unit)),
    client: uniq(afterPrimary.map((r) => r.client)),
  }), [afterPrimary])

  // Secondary filter
  const afterSecondary = useMemo(() => {
    return afterPrimary.filter((r) => {
      for (const [col, sel] of Object.entries(colFilters)) {
        if (sel.length === 0) continue
        if (!sel.includes(getRegValue(r, col))) return false
      }
      return true
    })
  }, [afterPrimary, colFilters])

  const visibleCols = REG_COLS.filter((c) => !hiddenCols.has(c.key))
  const colSpanCount = visibleCols.length
  const totalColFilters = Object.values(colFilters).reduce((s, a) => s + a.length, 0)

  function toggleColFilter(colKey: string, val: string) {
    setColFilters((f) => {
      const cur = f[colKey] ?? []
      const next = cur.includes(val) ? cur.filter((v) => v !== val) : [...cur, val]
      return { ...f, [colKey]: next }
    })
  }

  function renderRegCell(col: ColDef, r: RegistryEntry) {
    switch (col.key) {
      case 'status':
        return r.status
          ? <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: '#f1f5f9', color: '#475569' }}>{r.status}</span>
          : <span style={{ color: '#94a3b8' }}>—</span>
      case 'sheetUrl':
        return r.sheetUrl
          ? r.sheetUrl.startsWith('https://')
            ? <a href={r.sheetUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', textDecoration: 'underline' }}>Матрица</a>
            : r.sheetUrl
          : <span style={{ color: '#94a3b8' }}>—</span>
      case 'matrixId': return <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#475569' }}>{r.matrixId}</span>
      case 'unit':     return r.unit ?? '—'
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
    <div ref={containerRef} style={panelStyle}>
      <div style={panelHeader}>
        <span style={{ fontWeight: 600, fontSize: 15, color: '#1e293b' }}>
          <a href={sheetUrl ?? '#'} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none', borderBottom: '1px dashed #94a3b8' }}>
            Реестр матриц
          </a>
          <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 400, color: '#64748b' }}>
            {afterSecondary.length} / {registry.length}
          </span>
        </span>
        {totalColFilters > 0 && (
          <button onClick={() => setColFilters({})} style={resetBtn}>
            Сбросить ({totalColFilters})
          </button>
        )}
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
                {visibleCols.map((col) => {
                  const hasFilter = (colFilters[col.key] ?? []).length > 0
                  const isOpen = openDrop === col.key
                  return (
                    <th key={col.key} style={{ ...thBase, position: 'relative', overflow: 'visible' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
                        <span style={thLabel}>{col.label}</span>
                        {col.filterable && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setOpenDrop(isOpen ? null : col.key) }}
                            style={filterDropBtn(hasFilter)}
                            title={hasFilter ? `Фильтр: ${(colFilters[col.key] ?? []).length}` : 'Фильтр'}
                          >
                            {hasFilter ? `${(colFilters[col.key] ?? []).length}` : '▾'}
                          </button>
                        )}
                      </div>
                      {isOpen && (
                        <ColDropdown
                          values={(colValues as Record<string, string[]>)[col.key] ?? []}
                          selected={colFilters[col.key] ?? []}
                          onToggle={(v) => toggleColFilter(col.key, v)}
                          onClear={() => setColFilters((f) => ({ ...f, [col.key]: [] }))}
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
              ) : afterSecondary.map((r, i) => (
                <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
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
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function SyncDataPage() {
  const qc = useQueryClient()
  const [resetResult, setResetResult] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [showProj, setShowProj] = useState(true)
  const [showReg, setShowReg]  = useState(true)
  const [splitPct, setSplitPct] = useState(50)  // % ширины левой панели
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const [projFilters, setProjFilters] = usePersistedFilters('sync-primary-proj')
  const [regFilters, setRegFilters] = usePersistedFilters('sync-primary-reg')

  const { data: allProjects = [], isLoading: projLoading } = useQuery<Project[]>({
    queryKey: ['status-rows-sync'],
    queryFn: () => api.get('/status-rows?withSeparators=true&slim=true').then((r) => r.data),
  })

  const { data: sheetUrls } = useQuery<{ projectsSheetUrl: string | null; registrySheetUrl: string | null }>({
    queryKey: ['sync-sheet-urls'],
    queryFn: () => api.get('/sync/sheet-urls').then((r) => r.data),
    staleTime: Infinity,
  })

  const { data: registry = [], isLoading: regLoading } = useQuery<RegistryEntry[]>({
    queryKey: ['sync-registry'],
    queryFn: () => api.get('/sync/registry').then((r) => r.data),
  })

  const reset = useMutation({
    mutationFn: () => api.post('/sync/reset'),
    onSuccess: (res) => {
      const d = res.data.deleted
      setResetResult(`Удалено: ${d.projects} проектов, ${d.registryEntries} записей реестра, ${d.shiftEntries} смен`)
      qc.invalidateQueries({ queryKey: ['status-rows-sync'] })
      qc.invalidateQueries({ queryKey: ['sync-registry'] })
    },
  })

  const projects = useMemo(
    () => [...allProjects].sort((a, b) => (a.googleRowIndex ?? 0) - (b.googleRowIndex ?? 0)),
    [allProjects],
  )

  // Options for settings popup (full dataset, no filters applied)
  const allNonSepProj = useMemo(() => projects.filter((p) => p.source !== 'separator'), [projects])
  const projOpts = useMemo(() => ({
    status:   uniq(allNonSepProj.map((p) => STATUS_LABELS[p.status] ?? p.status)),
    format:   uniq(allNonSepProj.map((p) => p.format)),
    location: uniq(allNonSepProj.map((p) => p.location)),
  }), [allNonSepProj])
  const regOpts = useMemo(() => ({
    status: uniq(registry.map((r) => r.status)),
    unit:   uniq(registry.map((r) => r.unit)),
    format: uniq(registry.map((r) => r.format)),
  }), [registry])

  const totalPrimary =
    Object.values(projFilters).reduce((s, a) => s + a.length, 0) +
    Object.values(regFilters).reduce((s, a) => s + a.length, 0)

  const both = showProj && showReg

  function onDividerMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    dragging.current = true
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const pct = Math.min(85, Math.max(15, ((ev.clientX - rect.left) / rect.width) * 100))
      setSplitPct(pct)
    }
    const onUp = () => {
      dragging.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const toggleBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '5px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500,
    border: `1px solid ${active ? '#3b82f6' : '#e2e8f0'}`,
    background: active ? '#eff6ff' : '#f8fafc',
    color: active ? '#2563eb' : '#94a3b8',
    cursor: 'pointer',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 104px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexShrink: 0 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>
          Данные из Google Sheets
        </h2>
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

        {/* Переключатели видимости таблиц */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button onClick={() => setShowProj((v) => !v)} style={toggleBtnStyle(showProj)}>
            Проекты
          </button>
          <button onClick={() => setShowReg((v) => !v)} style={toggleBtnStyle(showReg)}>
            Реестр
          </button>
        </div>
      </div>

      {settingsOpen && (
        <GlobalSettingsPopup
          projFilters={projFilters} onProjFilters={setProjFilters}
          regFilters={regFilters} onRegFilters={setRegFilters}
          projOpts={projOpts} regOpts={regOpts}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      <div ref={containerRef} style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>
        {!showProj && !showReg ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 14 }}>
            Выберите таблицу для отображения
          </div>
        ) : both ? (
          <>
            <div style={{ width: `${splitPct}%`, minWidth: 0, display: 'flex' }}>
              <ProjectsTable
                projects={projects} loading={projLoading}
                sheetUrl={sheetUrls?.projectsSheetUrl ?? null}
                primaryFilters={projFilters}
              />
            </div>
            <div
              onMouseDown={onDividerMouseDown}
              style={{ width: 8, flexShrink: 0, cursor: 'col-resize', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <div style={{ width: 2, height: 40, borderRadius: 2, background: '#cbd5e1' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
              <RegistryTable
                registry={registry} loading={regLoading}
                sheetUrl={sheetUrls?.registrySheetUrl ?? null}
                primaryFilters={regFilters}
              />
            </div>
          </>
        ) : (
          <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
            {showProj && (
              <ProjectsTable
                projects={projects} loading={projLoading}
                sheetUrl={sheetUrls?.projectsSheetUrl ?? null}
                primaryFilters={projFilters}
              />
            )}
            {showReg && (
              <RegistryTable
                registry={registry} loading={regLoading}
                sheetUrl={sheetUrls?.registrySheetUrl ?? null}
                primaryFilters={regFilters}
              />
            )}
          </div>
        )}
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
  overflow: 'hidden',
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
