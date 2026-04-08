import { useState, useMemo } from 'react'
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  request: 'Запрос',
  negotiation: 'На согл.',
  preproduction: 'Препрод.',
  production: 'Продакшн',
  postproduction: 'Постпрод.',
  delivered: 'Сдан',
  rejected: 'Не согл.',
  cancelled: 'Отменён',
  manual: 'Ручной',
}

const STATUS_COLORS: Record<string, string> = {
  request: '#f59e0b',
  negotiation: '#3b82f6',
  preproduction: '#8b5cf6',
  production: '#10b981',
  postproduction: '#06b6d4',
  delivered: '#16a34a',
  rejected: '#ef4444',
  cancelled: '#6b7280',
  manual: '#64748b',
}

function fmtDate(raw: string | null) {
  if (!raw) return '—'
  try { return format(new Date(raw), 'd MMM yyyy', { locale: ru }) } catch { return raw }
}

function uniq(values: (string | null | undefined)[]): string[] {
  const set = new Set<string>()
  for (const v of values) if (v) set.add(v)
  return Array.from(set).sort()
}

// ─── FilterPopup ──────────────────────────────────────────────────────────────

interface FilterColumn {
  key: string
  label: string
  values: string[]
}

// filters: { [colKey]: string[] } — список выбранных значений по колонке
// Логика: OR — строка видна если хоть одна пара (колонка, значение) совпадает
// Если ничего не выбрано — показываем все строки

function FilterPopup({
  title,
  columns,
  filters,
  onFiltersChange,
  onClose,
}: {
  title: string
  columns: FilterColumn[]
  filters: Record<string, string[]>
  onFiltersChange: (f: Record<string, string[]>) => void
  onClose: () => void
}) {
  function toggle(col: string, val: string) {
    const cur = filters[col] ?? []
    const next = cur.includes(val) ? cur.filter((v) => v !== val) : [...cur, val]
    onFiltersChange({ ...filters, [col]: next })
  }

  const totalSelected = Object.values(filters).reduce((s, arr) => s + arr.length, 0)

  return (
    <div style={popupOverlay} onClick={onClose}>
      <div style={popupBox} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>Фильтры — {title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#94a3b8', lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start' }}>
          {columns.map((col) => (
            <div key={col.key} style={{ minWidth: 150 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {col.label}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 320, overflowY: 'auto' }}>
                {col.values.map((v) => {
                  const checked = (filters[col.key] ?? []).includes(v)
                  return (
                    <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 13, color: checked ? '#1d4ed8' : '#374151' }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(col.key, v)}
                        style={{ cursor: 'pointer', accentColor: '#3b82f6' }}
                      />
                      {v}
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        {totalSelected > 0 && (
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
            <button onClick={() => onFiltersChange({})} style={resetBtn}>
              Сбросить все ({totalSelected})
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Projects Table ───────────────────────────────────────────────────────────

function ProjectsTable({ projects, loading }: { projects: Project[]; loading: boolean }) {
  const [filters, setFilters] = useState<Record<string, string[]>>({})
  const [popupOpen, setPopupOpen] = useState(false)

  const opts = useMemo(() => ({
    status:   uniq(projects.filter((p) => p.source !== 'separator').map((p) => STATUS_LABELS[p.status] ?? p.status)),
    format:   uniq(projects.map((p) => p.format)),
    location: uniq(projects.map((p) => p.location)),
  }), [projects])

  const filterColumns: FilterColumn[] = [
    { key: 'status',   label: 'A Статус',  values: opts.status   },
    { key: 'format',   label: 'I Формат',  values: opts.format   },
    { key: 'location', label: 'J Локация', values: opts.location },
  ]

  const totalSelected = Object.values(filters).reduce((s, arr) => s + arr.length, 0)
  const hasFilters = totalSelected > 0

  const rows = useMemo(() => {
    return projects.filter((p) => {
      if (p.source === 'separator') return !hasFilters
      if (!hasFilters) return true
      // OR: строка видна если хоть одно выбранное значение совпадает
      const statusSel = filters.status ?? []
      const formatSel = filters.format ?? []
      const locationSel = filters.location ?? []
      if (statusSel.length && statusSel.includes(STATUS_LABELS[p.status] ?? p.status)) return true
      if (formatSel.length && formatSel.includes(p.format ?? '')) return true
      if (locationSel.length && locationSel.includes(p.location ?? '')) return true
      return false
    })
  }, [projects, filters, hasFilters])

  const visibleNonSep = rows.filter((p) => p.source !== 'separator').length
  const totalNonSep = projects.filter((p) => p.source !== 'separator').length

  return (
    <div style={panelStyle}>
      <div style={panelHeader}>
        <span style={{ fontWeight: 600, fontSize: 15, color: '#1e293b' }}>
          Проекты из таблицы
          <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 400, color: '#64748b' }}>
            {visibleNonSep} / {totalNonSep}
          </span>
        </span>
        <button
          onClick={() => setPopupOpen(true)}
          style={{
            ...filterBtn,
            background: hasFilters ? '#eff6ff' : '#f8fafc',
            borderColor: hasFilters ? '#93c5fd' : '#e2e8f0',
            color: hasFilters ? '#2563eb' : '#64748b',
          }}
        >
          Фильтр{hasFilters ? ` (${totalSelected})` : ''}
        </button>
      </div>

      {popupOpen && (
        <FilterPopup
          title="Проекты"
          columns={filterColumns}
          filters={filters}
          onFiltersChange={setFilters}
          onClose={() => setPopupOpen(false)}
        />
      )}

      <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1 }}>
        {loading ? (
          <div style={emptyMsg}>Загрузка...</div>
        ) : projects.length === 0 ? (
          <div style={emptyMsg}>Данные не загружены — запустите синхронизацию</div>
        ) : (
          <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={thBase}><span style={thLabel}>A Статус</span></th>
                <th style={thBase}><span style={thLabel}>B Клиент</span></th>
                <th style={thBase}><span style={thLabel}>C Название</span></th>
                <th style={thBase}><span style={thLabel}>G Дата</span></th>
                <th style={thBase}><span style={thLabel}>I Формат</span></th>
                <th style={thBase}><span style={thLabel}>J Локация</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Нет строк по выбранным фильтрам</td></tr>
              ) : rows.map((p, i) => {
                if (p.source === 'separator') {
                  return (
                    <tr key={p.id}>
                      <td colSpan={6} style={{
                        padding: '5px 10px',
                        background: '#f1f5f9',
                        borderTop: '2px solid #e2e8f0',
                        borderBottom: '1px solid #e2e8f0',
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#64748b',
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                      }}>
                        {p.name}
                      </td>
                    </tr>
                  )
                }
                return (
                  <tr key={p.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                    <td style={tdStyle}>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                        background: `${STATUS_COLORS[p.status] ?? '#94a3b8'}22`,
                        color: STATUS_COLORS[p.status] ?? '#94a3b8',
                      }}>
                        {STATUS_LABELS[p.status] ?? p.status}
                      </span>
                    </td>
                    <td style={tdStyle}>{p.client ?? '—'}</td>
                    <td style={{ ...tdStyle, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.name}>{p.name}</td>
                    <td style={tdStyle}>{fmtDate(p.date)}</td>
                    <td style={tdStyle}>{p.format ?? '—'}</td>
                    <td style={tdStyle}>{p.location ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── Registry Table ───────────────────────────────────────────────────────────

function RegistryTable({ registry, loading }: { registry: RegistryEntry[]; loading: boolean }) {
  const [filters, setFilters] = useState<Record<string, string[]>>({})
  const [popupOpen, setPopupOpen] = useState(false)

  const opts = useMemo(() => ({
    status: uniq(registry.map((r) => r.status)),
    unit:   uniq(registry.map((r) => r.unit)),
    format: uniq(registry.map((r) => r.format)),
  }), [registry])

  const filterColumns: FilterColumn[] = [
    { key: 'status', label: 'A Статус', values: opts.status },
    { key: 'unit',   label: 'E Юнит',   values: opts.unit   },
    { key: 'format', label: 'H Формат', values: opts.format },
  ]

  const totalSelected = Object.values(filters).reduce((s, arr) => s + arr.length, 0)
  const hasFilters = totalSelected > 0

  const rows = useMemo(() => {
    return registry.filter((r) => {
      if (!hasFilters) return true
      const statusSel = filters.status ?? []
      const unitSel   = filters.unit   ?? []
      const formatSel = filters.format ?? []
      if (statusSel.length && statusSel.includes(r.status ?? '')) return true
      if (unitSel.length   && unitSel.includes(r.unit ?? ''))     return true
      if (formatSel.length && formatSel.includes(r.format ?? '')) return true
      return false
    })
  }, [registry, filters, hasFilters])

  return (
    <div style={panelStyle}>
      <div style={panelHeader}>
        <span style={{ fontWeight: 600, fontSize: 15, color: '#1e293b' }}>
          Реестр матриц
          <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 400, color: '#64748b' }}>
            {rows.length} / {registry.length}
          </span>
        </span>
        <button
          onClick={() => setPopupOpen(true)}
          style={{
            ...filterBtn,
            background: hasFilters ? '#eff6ff' : '#f8fafc',
            borderColor: hasFilters ? '#93c5fd' : '#e2e8f0',
            color: hasFilters ? '#2563eb' : '#64748b',
          }}
        >
          Фильтр{hasFilters ? ` (${totalSelected})` : ''}
        </button>
      </div>

      {popupOpen && (
        <FilterPopup
          title="Реестр матриц"
          columns={filterColumns}
          filters={filters}
          onFiltersChange={setFilters}
          onClose={() => setPopupOpen(false)}
        />
      )}

      <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1 }}>
        {loading ? (
          <div style={emptyMsg}>Загрузка...</div>
        ) : registry.length === 0 ? (
          <div style={emptyMsg}>Данные не загружены — запустите синхронизацию</div>
        ) : (
          <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={thBase}><span style={thLabel}>A Статус</span></th>
                <th style={thBase}><span style={thLabel}>B Матрица</span></th>
                <th style={thBase}><span style={thLabel}>C ID</span></th>
                <th style={thBase}><span style={thLabel}>E Юнит</span></th>
                <th style={thBase}><span style={thLabel}>F Заказчик</span></th>
                <th style={thBase}><span style={thLabel}>G Название</span></th>
                <th style={thBase}><span style={thLabel}>H Формат</span></th>
                <th style={thBase}><span style={thLabel}>I Дата</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Нет строк по выбранным фильтрам</td></tr>
              ) : rows.map((r, i) => (
                <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                  <td style={tdStyle}>
                    {r.status
                      ? <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: '#f1f5f9', color: '#475569' }}>{r.status}</span>
                      : <span style={{ color: '#94a3b8' }}>—</span>}
                  </td>
                  <td style={{ ...tdStyle, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.sheetUrl ?? ''}>
                    {r.sheetUrl
                      ? r.sheetUrl.startsWith('https://')
                        ? <a href={r.sheetUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', textDecoration: 'underline' }}>Матрица</a>
                        : r.sheetUrl
                      : <span style={{ color: '#94a3b8' }}>—</span>}
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12, color: '#475569' }}>{r.matrixId}</td>
                  <td style={tdStyle}>{r.unit ?? '—'}</td>
                  <td style={tdStyle}>{r.client ?? '—'}</td>
                  <td style={{ ...tdStyle, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.name ?? ''}>{r.name ?? '—'}</td>
                  <td style={tdStyle}>{r.format ?? '—'}</td>
                  <td style={tdStyle}>{fmtDate(r.date)}</td>
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

  const { data: allProjects = [], isLoading: projLoading } = useQuery<Project[]>({
    queryKey: ['projects-sync'],
    queryFn: () => api.get('/projects').then((r) => r.data),
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
      qc.invalidateQueries({ queryKey: ['projects-sync'] })
      qc.invalidateQueries({ queryKey: ['sync-registry'] })
    },
  })

  const projects = useMemo(
    () => [...allProjects].sort((a, b) => (a.googleRowIndex ?? 0) - (b.googleRowIndex ?? 0)),
    [allProjects],
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 104px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12, flexShrink: 0 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>
          Данные из Google Sheets
        </h2>
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
        {resetResult && (
          <span style={{ fontSize: 13, color: '#16a34a' }}>{resetResult}</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>
        <ProjectsTable projects={projects} loading={projLoading} />
        <RegistryTable registry={registry} loading={regLoading} />
      </div>
    </div>
  )
}

// ─── Shared styles ────────────────────────────────────────────────────────────

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
  whiteSpace: 'nowrap',
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
  whiteSpace: 'nowrap',
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
  padding: '5px 12px',
  fontSize: 12,
  color: '#64748b',
  cursor: 'pointer',
}

const filterBtn: React.CSSProperties = {
  padding: '5px 12px',
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

const popupBox: React.CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  padding: 24,
  boxShadow: '0 8px 32px rgba(15,23,42,0.18)',
  minWidth: 360,
  maxWidth: '90vw',
}
