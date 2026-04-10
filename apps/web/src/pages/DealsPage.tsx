import { useState, useMemo, useLayoutEffect, useRef, Fragment, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
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
  date: string | null
  format: string | null
  location: string | null
  sheetMatrixId: string | null
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
}

interface ColDef { key: string; label: string }

interface GroupLine {
  id: string        // regId
  projCYs: number[] // Y centers of connected project rows (in SVG coords)
  regCY: number     // Y center of registry row (in SVG coords)
  color: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  request: 'Запрос', negotiation: 'На согл.', preproduction: 'Препрод.',
  production: 'Продакшн', postproduction: 'Постпрод.', delivered: 'Сдан',
  rejected: 'Не согл.', cancelled: 'Отменён', manual: 'Ручной',
}

const STATUS_COLORS: Record<string, string> = {
  request: '#f59e0b', negotiation: '#3b82f6', preproduction: '#8b5cf6',
  production: '#10b981', postproduction: '#06b6d4', delivered: '#16a34a',
  rejected: '#ef4444', cancelled: '#6b7280', manual: '#64748b',
}

const PROJ_COLS: ColDef[] = [
  { key: 'status',   label: 'A Статус'  },
  { key: 'name',     label: 'C Название' },
  { key: 'date',     label: 'G Дата'    },
  { key: 'format',   label: 'I Формат'  },
  { key: 'location', label: 'J Локация' },
]

const REG_COLS: ColDef[] = [
  { key: 'status',     label: 'A Статус'    },
  { key: 'matrixLink', label: 'B+C Матрица' },
  { key: 'unit',       label: 'E Юнит'      },
  { key: 'name',       label: 'G Название'  },
  { key: 'format',     label: 'H Формат'    },
]

const GAP  = 48
const MIDX = GAP / 2

// Cycled palette for linked groups (bg + line color)
const GROUP_PALETTE = [
  { bg: '#dbeafe', line: '#3b82f6' }, // blue
  { bg: '#dcfce7', line: '#16a34a' }, // green
  { bg: '#fef3c7', line: '#d97706' }, // amber
  { bg: '#f3e8ff', line: '#9333ea' }, // purple
  { bg: '#fce7f3', line: '#db2777' }, // pink
  { bg: '#e0f2fe', line: '#0284c7' }, // sky
  { bg: '#d1fae5', line: '#059669' }, // emerald
  { bg: '#fff7ed', line: '#ea580c' }, // orange
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(raw: string | null) {
  if (!raw) return '—'
  try { return format(new Date(raw), 'd MMM yyyy', { locale: ru }) } catch { return raw }
}

function renderProjCell(col: ColDef, p: Project) {
  switch (col.key) {
    case 'status':
      return (
        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: `${STATUS_COLORS[p.status] ?? '#94a3b8'}22`, color: STATUS_COLORS[p.status] ?? '#94a3b8' }}>
          {STATUS_LABELS[p.status] ?? p.status}
        </span>
      )
    case 'name':     return p.name
    case 'date':     return fmtDate(p.date)
    case 'format':   return p.format ?? '—'
    case 'location': return p.location ?? '—'
    default:         return null
  }
}

function renderRegCell(col: ColDef, r: RegistryEntry) {
  switch (col.key) {
    case 'status':
      return r.status
        ? <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: '#f1f5f9', color: '#475569' }}>{r.status}</span>
        : <span style={{ color: '#94a3b8' }}>—</span>
    case 'matrixLink':
      return r.sheetUrl?.startsWith('https://')
        ? <a href={r.sheetUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', textDecoration: 'underline', fontFamily: 'monospace', fontSize: 12 }}>{r.matrixId}</a>
        : <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#475569' }}>{r.matrixId}</span>
    case 'unit':   return r.unit   ?? '—'
    case 'name':   return r.name   ?? '—'
    case 'format': return r.format ?? '—'
    default:       return null
  }
}

// ─── Client Block ─────────────────────────────────────────────────────────────

function ClientBlock({ client, projects, registry }: {
  client: string
  projects: Project[]
  registry: RegistryEntry[]
}) {
  const [expanded, setExpanded] = useState(false)
  const tablesRef   = useRef<HTMLDivElement>(null)
  const regTbodyRef = useRef<HTMLTableSectionElement | null>(null)
  const projRowRefs = useRef<Record<string, HTMLTableRowElement | null>>({})

  const [rowH, setRowH]               = useState(0)
  const [groupLineData, setGroupLineData] = useState<GroupLine[]>([])

  // ── Connection map ────────────────────────────────────────────────────────

  const matchPairs = useMemo(() => {
    const pairs: { projId: string; regId: string }[] = []
    for (const p of projects) {
      if (!p.sheetMatrixId) continue
      for (const r of registry) {
        if (r.matrixId === p.sheetMatrixId) pairs.push({ projId: p.id, regId: r.id })
      }
    }
    return pairs
  }, [projects, registry])

  // ── Group color maps ──────────────────────────────────────────────────────
  //
  // Each registry row that has ≥1 connection gets a palette color (by order).
  // Project rows inherit the same color from their connected registry row.

  const groupColorMap = useMemo(() => {
    const map = new Map<string, number>()  // regId → palette index
    let idx = 0
    for (const r of registry) {
      if (matchPairs.some(mp => mp.regId === r.id)) {
        map.set(r.id, idx % GROUP_PALETTE.length)
        idx++
      }
    }
    return map
  }, [registry, matchPairs])

  const projColorMap = useMemo(() => {
    const map = new Map<string, number>()  // projId → palette index
    for (const { projId, regId } of matchPairs) {
      const ci = groupColorMap.get(regId)
      if (ci !== undefined) map.set(projId, ci)
    }
    return map
  }, [matchPairs, groupColorMap])

  // ── Row ordering ──────────────────────────────────────────────────────────
  //
  // Both tables are reordered so connected rows form compact groups.
  //
  // orderedProjects: groups (each = all proj rows for one registry row, in
  //   original order) followed by unconnected proj rows.
  //
  // orderedRegistry: registry rows ordered by the first project row they own
  //   (so they appear top-to-bottom in the same order as their groups).

  const orderedProjects = useMemo(() => {
    const result: Project[] = []
    const placed = new Set<string>()
    // Iterate registry in original order to respect user's ordering
    for (const r of registry) {
      const group = projects
        .filter(p => p.sheetMatrixId === r.matrixId)
        .sort((a, b) => projects.indexOf(a) - projects.indexOf(b))
      for (const p of group) {
        if (!placed.has(p.id)) { result.push(p); placed.add(p.id) }
      }
    }
    // Unconnected projects after all groups
    for (const p of projects) {
      if (!placed.has(p.id)) result.push(p)
    }
    return result
  }, [projects, registry])

  const orderedRegistry = useMemo(() => {
    const result: RegistryEntry[] = []
    const placed = new Set<string>()
    // Follow orderedProjects to pick registry rows in group order
    for (const p of orderedProjects) {
      if (!p.sheetMatrixId) continue
      const r = registry.find(x => x.matrixId === p.sheetMatrixId)
      if (r && !placed.has(r.id)) { result.push(r); placed.add(r.id) }
    }
    // Unconnected registry rows last
    for (const r of registry) {
      if (!placed.has(r.id)) result.push(r)
    }
    return result
  }, [orderedProjects, registry])

  // ── Registry row spacers ──────────────────────────────────────────────────
  //
  // Connected rows: centered at avgProjIndex * rowH from registry tbody top.
  //
  // Unconnected rows: pushed below the last connected project row, with a gap
  // of half the total connected project span.
  //   unconnectedStart = (maxConnIdx + 1) * rowH + connSpan / 2
  //   connSpan = (maxConnIdx - minConnIdx + 1) * rowH

  const regPlacements = useMemo(() => {
    if (rowH === 0) return orderedRegistry.map(r => ({ id: r.id, spacerPx: 0 }))

    // Pre-classify each registry row and compute the spacer it needs.
    // Pass 1: collect per-row info (no mutation, no flags).
    type RowInfo =
      | { kind: 'connected'; avgIdx: number }
      | { kind: 'unconnected' }

    const info: RowInfo[] = orderedRegistry.map(r => {
      const connIds = matchPairs.filter(mp => mp.regId === r.id).map(mp => mp.projId)
      if (connIds.length === 0) return { kind: 'unconnected' }
      const indices = connIds
        .map(id => orderedProjects.findIndex(p => p.id === id))
        .filter(i => i >= 0)
      if (indices.length === 0) return { kind: 'unconnected' }
      const avgIdx = indices.reduce((a, b) => a + b, 0) / indices.length
      return { kind: 'connected', avgIdx }
    })

    // Actual max project row index among ALL connected rows (across all groups).
    // Used to align unconnected registry rows with unconnected project rows.
    const allConnProjIndices = matchPairs
      .map(mp => orderedProjects.findIndex(p => p.id === mp.projId))
      .filter(i => i >= 0)
    const maxConnProjIdx = allConnProjIndices.length > 0 ? Math.max(...allConnProjIndices) : -1
    // Top of first unconnected project row = (maxConnProjIdx + 1) * rowH from tbody
    const unconnectedStart = maxConnProjIdx >= 0 ? (maxConnProjIdx + 1) * rowH : 0

    // Pass 2: walk and assign spacers.
    let cursor = 0
    let unconnStartUsed = false

    return orderedRegistry.map((r, i) => {
      const row = info[i]

      if (row.kind === 'connected') {
        const spacerPx = Math.max(0, row.avgIdx * rowH - cursor)
        cursor += spacerPx + rowH
        return { id: r.id, spacerPx }
      }

      // First unconnected row: jump cursor to unconnectedStart
      if (!unconnStartUsed && maxConnProjIdx >= 0) {
        unconnStartUsed = true
        const spacerPx = Math.max(0, unconnectedStart - cursor)
        cursor += spacerPx + rowH
        return { id: r.id, spacerPx }
      }

      cursor += rowH
      return { id: r.id, spacerPx: 0 }
    })
  }, [orderedRegistry, matchPairs, orderedProjects, rowH])

  // ── Measurement effects ───────────────────────────────────────────────────

  // Pass 1: measure rowH from first rendered project row.
  // useLayoutEffect blocks paint → re-render with correct spacers before first paint.
  useLayoutEffect(() => {
    if (!expanded) { setRowH(0); setGroupLineData([]); return }
    const el = orderedProjects[0] ? projRowRefs.current[orderedProjects[0].id] : null
    const h = el?.getBoundingClientRect().height ?? 0
    if (h > 0) setRowH(h)
  }, [expanded, orderedProjects.length])

  // Pass 2: compute SVG line coordinates.
  //
  // Strategy (same as bracketDisplay.js):
  //   • Project rows — measure each row's actual DOM position (no spacers, always reliable).
  //   • Registry rows — compute from regTbodyRef.top + accumulated cursor (mirrors regPlacements).
  //     This avoids measuring spacer-affected rows whose layout may not be flushed yet.
  useLayoutEffect(() => {
    if (!expanded || rowH === 0 || !tablesRef.current || !regTbodyRef.current) {
      setGroupLineData([])
      return
    }

    const compute = () => {
      if (!tablesRef.current || !regTbodyRef.current) return
      const cRect = tablesRef.current.getBoundingClientRect()
      // Registry tbody starts here (relative to SVG origin = tablesRef top)
      const regT0 = regTbodyRef.current.getBoundingClientRect().top - cRect.top

      let regCursor = 0
      const lines: GroupLine[] = []

      for (const { id: regId, spacerPx } of regPlacements) {
        regCursor += spacerPx
        const regCY = regT0 + regCursor + rowH / 2
        regCursor += rowH

        const connProjIds = matchPairs
          .filter(mp => mp.regId === regId)
          .map(mp => mp.projId)
        if (connProjIds.length === 0) continue

        const ci = groupColorMap.get(regId) ?? 0
        const color = GROUP_PALETTE[ci].line

        // Project rows: measure actual DOM position (project table has no spacers)
        const projCYs = connProjIds
          .map(projId => {
            const el = projRowRefs.current[projId]
            if (!el) return null
            const r = el.getBoundingClientRect()
            return r.top - cRect.top + r.height / 2
          })
          .filter((y): y is number => y !== null)

        if (projCYs.length > 0) {
          lines.push({ id: regId, projCYs, regCY, color })
        }
      }

      setGroupLineData(lines)
    }

    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(tablesRef.current)
    return () => ro.disconnect()
  }, [expanded, rowH, matchPairs, groupColorMap, regPlacements])

  // ── Render ────────────────────────────────────────────────────────────────

  const countParts: string[] = []
  if (projects.length > 0)  countParts.push(`${projects.length} стр.`)
  if (registry.length > 0)  countParts.push(`${registry.length} матр.`)
  if (matchPairs.length > 0) countParts.push(`${matchPairs.length} связей`)

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      {/* Accordion header */}
      <button
        onClick={() => setExpanded(v => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 20px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: expanded ? '1px solid #e2e8f0' : 'none' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{client}</span>
          {countParts.length > 0 && (
            <span style={{ fontSize: 13, color: '#94a3b8' }}>{countParts.join(' · ')}</span>
          )}
        </div>
        <span style={{ fontSize: 14, color: '#94a3b8', display: 'inline-block', transition: 'transform 0.15s', transform: expanded ? 'rotate(180deg)' : 'none' }}>▾</span>
      </button>

      {expanded && (
        <>
          {/* Sub-headers */}
          <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ flex: 1, ...subHeader }}>Таблица проектов · {projects.length}</div>
            <div style={{ width: GAP, background: '#f8fafc', flexShrink: 0 }} />
            <div style={{ flex: 1, ...subHeader }}>Реестр матриц · {registry.length}</div>
          </div>

          {/* Tables + gap */}
          <div ref={tablesRef} style={{ display: 'flex', alignItems: 'stretch' }}>

            {/* Left — projects (reordered by group) */}
            <div style={{ flex: 1, minWidth: 0, overflowX: 'auto' }}>
              {orderedProjects.length === 0 ? (
                <div style={emptyMsg}>Нет строк</div>
              ) : (
                <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>{PROJ_COLS.map(c => <th key={c.key} style={thBase}><span style={thLabel}>{c.label}</span></th>)}</tr>
                  </thead>
                  <tbody>
                    {orderedProjects.map(p => {
                      const ci = projColorMap.get(p.id)
                      const bg = ci !== undefined ? GROUP_PALETTE[ci].bg : '#fff'
                      return (
                        <tr
                          key={p.id}
                          ref={el => { projRowRefs.current[p.id] = el }}
                          style={{ background: bg }}
                        >
                          {PROJ_COLS.map(c => <td key={c.key} style={tdStyle}>{renderProjCell(c, p)}</td>)}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Gap — SVG bracket connectors (same logic as bracketDisplay.js) */}
            <div style={{ width: GAP, flexShrink: 0, position: 'relative', background: '#f8fafc' }}>
              <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'visible' }}>
                {groupLineData.map(gl => {
                  const minCY = Math.min(...gl.projCYs)
                  const maxCY = Math.max(...gl.projCYs)
                  return (
                    <g key={gl.id}>
                      {/* Horizontal stubs: each project row → midX */}
                      {gl.projCYs.map((cy, i) => (
                        <line key={i} x1={0} y1={cy} x2={MIDX} y2={cy}
                          stroke={gl.color} strokeWidth={1.5} strokeOpacity={0.85} />
                      ))}
                      {/* Vertical spine at midX connecting all project stubs */}
                      {gl.projCYs.length > 1 && (
                        <line x1={MIDX} y1={minCY} x2={MIDX} y2={maxCY}
                          stroke={gl.color} strokeWidth={1.5} strokeOpacity={0.85} />
                      )}
                      {/* Vertical from spine to registry row (if spine midpoint ≠ regCY) */}
                      {gl.projCYs.length === 1 && Math.abs(gl.projCYs[0] - gl.regCY) > 0.5 && (
                        <line x1={MIDX} y1={gl.projCYs[0]} x2={MIDX} y2={gl.regCY}
                          stroke={gl.color} strokeWidth={1.5} strokeOpacity={0.85} />
                      )}
                      {/* Horizontal stub: midX → registry row */}
                      <line x1={MIDX} y1={gl.regCY} x2={GAP} y2={gl.regCY}
                        stroke={gl.color} strokeWidth={1.5} strokeOpacity={0.85} />
                      {/* Dots at project endpoints */}
                      {gl.projCYs.map((cy, i) => (
                        <circle key={i} cx={0} cy={cy} r={3} fill={gl.color} fillOpacity={0.85} />
                      ))}
                      {/* Dot at registry endpoint */}
                      <circle cx={GAP} cy={gl.regCY} r={3} fill={gl.color} fillOpacity={0.85} />
                    </g>
                  )
                })}
              </svg>
            </div>

            {/* Right — registry (reordered + spacers for vertical alignment) */}
            <div style={{ flex: 1, minWidth: 0, overflowX: 'auto' }}>
              {orderedRegistry.length === 0 ? (
                <div style={emptyMsg}>Нет строк</div>
              ) : (
                <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>{REG_COLS.map(c => <th key={c.key} style={thBase}><span style={thLabel}>{c.label}</span></th>)}</tr>
                  </thead>
                  <tbody ref={regTbodyRef}>
                    {regPlacements.map(({ id: regId, spacerPx }) => {
                      const r = orderedRegistry.find(x => x.id === regId)!
                      const ci = groupColorMap.get(regId)
                      const bg = ci !== undefined ? GROUP_PALETTE[ci].bg : '#fff'
                      return (
                        <Fragment key={regId}>
                          {/* Exact-height spacer to push this row to the center of its group */}
                          {spacerPx > 0 && (
                            <tr>
                              <td colSpan={REG_COLS.length} style={{ padding: 0, height: spacerPx, border: 'none', background: '#fff' }} />
                            </tr>
                          )}
                          <tr style={{ background: bg }}>
                            {REG_COLS.map(c => <td key={c.key} style={tdStyle}>{renderRegCell(c, r)}</td>)}
                          </tr>
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

          </div>
        </>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function DealsPage() {
  const [search, setSearch] = useState('')

  const { data: allProjects = [], isLoading: projLoading } = useQuery<Project[]>({
    queryKey: ['status-rows-clients'],
    queryFn: () => api.get('/status-rows').then(r => r.data),
  })

  const { data: registry = [], isLoading: regLoading } = useQuery<RegistryEntry[]>({
    queryKey: ['registry-clients'],
    queryFn: () => api.get('/sync/registry').then(r => r.data),
  })

  const isLoading = projLoading || regLoading

  const clients = useMemo(() => {
    const set = new Set<string>()
    allProjects.forEach(p => set.add(p.client ?? ''))
    registry.forEach(r => set.add(r.client ?? ''))
    return Array.from(set).sort((a, b) => {
      if (!a) return 1
      if (!b) return -1
      return a.localeCompare(b, 'ru')
    })
  }, [allProjects, registry])

  const q = search.trim().toLowerCase()
  const filtered = useMemo(
    () => q ? clients.filter(c => c.toLowerCase().includes(q)) : clients,
    [clients, q],
  )

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1e293b' }}>Клиенты</h1>
        {!isLoading && (
          <span style={{ fontSize: 14, color: '#94a3b8' }}>{filtered.length} клиентов</span>
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по клиенту..."
          style={{ width: '100%', maxWidth: 360, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, color: '#1e293b', outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      {isLoading ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>Загрузка...</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>
          {q ? 'Ничего не найдено' : 'Нет данных — запустите синхронизацию'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map(client => (
            <ClientBlock
              key={client}
              client={client || '(без клиента)'}
              projects={allProjects.filter(p => (p.client ?? '') === client)}
              registry={registry.filter(r => (r.client ?? '') === client)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const subHeader: CSSProperties = {
  padding: '8px 12px',
  fontSize: 12,
  fontWeight: 600,
  color: '#64748b',
  background: '#f8fafc',
}

const thBase: CSSProperties = {
  position: 'sticky',
  top: 0,
  background: '#f1f5f9',
  padding: '8px 10px',
  borderBottom: '2px solid #e2e8f0',
  textAlign: 'left',
  verticalAlign: 'bottom',
  zIndex: 1,
}

const thLabel: CSSProperties = {
  fontSize: 12,
  color: '#334155',
  fontWeight: 600,
  whiteSpace: 'nowrap',
}

const tdStyle: CSSProperties = {
  padding: '6px 10px',
  borderBottom: '1px solid #f1f5f9',
  color: '#374151',
  whiteSpace: 'nowrap',
}

const emptyMsg: CSSProperties = {
  padding: 24,
  textAlign: 'center',
  color: '#94a3b8',
  fontSize: 13,
}
