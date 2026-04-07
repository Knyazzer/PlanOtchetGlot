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
  source: string
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

// ─── FilterTh ─────────────────────────────────────────────────────────────────

function FilterTh({
  col, label, options, value, onChange,
}: {
  col: string
  label: string
  options: string[]
  value: string
  onChange: (col: string, val: string) => void
}) {
  const active = !!value
  return (
    <th style={{ ...thBase, background: active ? '#eff6ff' : '#f1f5f9' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 90 }}>
        <span style={{ fontSize: 11, color: active ? '#2563eb' : '#64748b', fontWeight: 600 }}>{label}</span>
        <select
          value={value}
          onChange={(e) => onChange(col, e.target.value)}
          onClick={(e) => e.stopPropagation()}
          style={{
            fontSize: 11,
            border: `1px solid ${active ? '#93c5fd' : '#e2e8f0'}`,
            borderRadius: 4,
            padding: '2px 4px',
            background: active ? '#dbeafe' : '#fff',
            color: active ? '#1d4ed8' : '#374151',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          <option value="">Все</option>
          {options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </div>
    </th>
  )
}

function PlainTh({ label }: { label: string }) {
  return <th style={thBase}><span style={{ fontSize: 12, color: '#334155', fontWeight: 600 }}>{label}</span></th>
}

// ─── Projects Table ───────────────────────────────────────────────────────────

function ProjectsTable({ projects, loading }: { projects: Project[]; loading: boolean }) {
  const [filters, setFilters] = useState<Record<string, string>>({})

  function setFilter(col: string, val: string) {
    setFilters((prev) => ({ ...prev, [col]: val }))
  }

  function resetFilters() {
    setFilters({})
  }

  const activeCount = Object.values(filters).filter(Boolean).length

  // Unique option sets — computed from ALL rows (unfiltered)
  const opts = useMemo(() => ({
    status:   uniq(projects.map((p) => STATUS_LABELS[p.status] ?? p.status)),
    format:   uniq(projects.map((p) => p.format)),
    location: uniq(projects.map((p) => p.location)),
  }), [projects])

  const rows = useMemo(() => {
    // Если есть активные фильтры — разделители не показываем (они мешают)
    const hasFilters = Object.values(filters).some(Boolean)
    return projects.filter((p) => {
      if (p.source === 'separator') return !hasFilters
      if (filters.status) {
        const label = STATUS_LABELS[p.status] ?? p.status
        if (label !== filters.status) return false
      }
      if (filters.format && p.format !== filters.format) return false
      if (filters.location && p.location !== filters.location) return false
      return true
    })
  }, [projects, filters])

  return (
    <div style={panelStyle}>
      <div style={panelHeader}>
        <span style={{ fontWeight: 600, fontSize: 15, color: '#1e293b' }}>
          Проекты из таблицы
          <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 400, color: '#64748b' }}>
            {rows.length} / {projects.length}
          </span>
        </span>
        {activeCount > 0 && (
          <button onClick={resetFilters} style={resetBtn}>
            Сбросить фильтры ({activeCount})
          </button>
        )}
      </div>

      <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1 }}>
        {loading ? (
          <div style={emptyMsg}>Загрузка...</div>
        ) : projects.length === 0 ? (
          <div style={emptyMsg}>Данные не загружены — запустите синхронизацию</div>
        ) : (
          <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <FilterTh col="status"   label="A Статус"  options={opts.status}   value={filters.status ?? ''}   onChange={setFilter} />
                <PlainTh label="B Клиент" />
                <PlainTh label="C Название" />
                <PlainTh label="G Дата" />
                <FilterTh col="format"   label="I Формат"  options={opts.format}   value={filters.format ?? ''}   onChange={setFilter} />
                <FilterTh col="location" label="J Локация" options={opts.location} value={filters.location ?? ''} onChange={setFilter} />
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
  const [filters, setFilters] = useState<Record<string, string>>({})

  function setFilter(col: string, val: string) {
    setFilters((prev) => ({ ...prev, [col]: val }))
  }

  function resetFilters() {
    setFilters({})
  }

  const activeCount = Object.values(filters).filter(Boolean).length

  const opts = useMemo(() => ({
    status: uniq(registry.map((r) => r.status)),
    unit:   uniq(registry.map((r) => r.unit)),
    format: uniq(registry.map((r) => r.format)),
  }), [registry])

  const rows = useMemo(() => {
    return registry.filter((r) => {
      if (filters.status && r.status !== filters.status) return false
      if (filters.unit   && r.unit   !== filters.unit)   return false
      if (filters.format && r.format !== filters.format) return false
      return true
    })
  }, [registry, filters])

  return (
    <div style={panelStyle}>
      <div style={panelHeader}>
        <span style={{ fontWeight: 600, fontSize: 15, color: '#1e293b' }}>
          Реестр матриц
          <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 400, color: '#64748b' }}>
            {rows.length} / {registry.length}
          </span>
        </span>
        {activeCount > 0 && (
          <button onClick={resetFilters} style={resetBtn}>
            Сбросить фильтры ({activeCount})
          </button>
        )}
      </div>

      <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1 }}>
        {loading ? (
          <div style={emptyMsg}>Загрузка...</div>
        ) : registry.length === 0 ? (
          <div style={emptyMsg}>Данные не загружены — запустите синхронизацию</div>
        ) : (
          <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <FilterTh col="status" label="A Статус" options={opts.status} value={filters.status ?? ''} onChange={setFilter} />
                <PlainTh label="B Матрица" />
                <PlainTh label="C ID" />
                <FilterTh col="unit"   label="E Юнит"   options={opts.unit}   value={filters.unit ?? ''}   onChange={setFilter} />
                <PlainTh label="F Заказчик" />
                <PlainTh label="G Название" />
                <FilterTh col="format" label="H Формат" options={opts.format} value={filters.format ?? ''} onChange={setFilter} />
                <PlainTh label="I Дата" />
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
                    {r.sheetUrl ?? <span style={{ color: '#94a3b8' }}>—</span>}
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

  // Сортируем проекты в порядке строк Google Sheets
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
  padding: '6px 10px',
  borderBottom: '2px solid #e2e8f0',
  textAlign: 'left',
  verticalAlign: 'bottom',
  zIndex: 1,
  whiteSpace: 'nowrap',
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
  padding: '4px 10px',
  fontSize: 12,
  color: '#64748b',
  cursor: 'pointer',
}
