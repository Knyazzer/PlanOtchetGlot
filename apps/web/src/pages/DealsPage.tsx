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
  linkedMatrix: { matrixId: string } | null
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

// ─── Spacer computation (mirrors debug.html computePlacements) ────────────────
//
// Uses actual DOM-measured project row CYs and actual registry row height.
// No assumptions about uniform row heights or equal thead sizes.
//
// targetCY for connected row     = avg CY of its connected project rows (DOM)
// targetCY for first unconn row  = CY of first unconnected project row (DOM)
// spacerPx = max(0, targetCY − regT0 − cursor − regRowH / 2)
// cursor  += spacerPx + regRowH

function computeRegPlacements(
  orderedRegistry: RegistryEntry[],
  orderedProjects: Project[],
  matchPairs: Array<{ projId: string; regId: string }>,
  projCYs: Map<string, number>,
  regT0: number,
  regRowH: number,
): Array<{ id: string; spacerPx: number }> {
  const allConnIndices = matchPairs
    .map(mp => orderedProjects.findIndex(p => p.id === mp.projId))
    .filter(i => i >= 0)
  const maxConnProjIdx = allConnIndices.length > 0 ? Math.max(...allConnIndices) : -1
  const firstUnconnProjId =
    maxConnProjIdx >= 0 && maxConnProjIdx + 1 < orderedProjects.length
      ? orderedProjects[maxConnProjIdx + 1].id
      : null

  let cursor = 0
  let unconnStartUsed = false

  return orderedRegistry.map(r => {
    const connProjIds = matchPairs.filter(mp => mp.regId === r.id).map(mp => mp.projId)

    if (connProjIds.length > 0) {
      const cys = connProjIds.map(id => projCYs.get(id)).filter((y): y is number => y !== undefined)
      if (cys.length > 0) {
        const targetCY = cys.reduce((a, b) => a + b, 0) / cys.length
        const spacerPx = Math.max(0, targetCY - regT0 - cursor - regRowH / 2)
        cursor += spacerPx + regRowH
        return { id: r.id, spacerPx }
      }
    }

    if (!unconnStartUsed && firstUnconnProjId !== null) {
      unconnStartUsed = true
      const targetCY = projCYs.get(firstUnconnProjId)
      const spacerPx = targetCY !== undefined
        ? Math.max(0, targetCY - regT0 - cursor - regRowH / 2)
        : 0
      cursor += spacerPx + regRowH
      return { id: r.id, spacerPx }
    }

    cursor += regRowH
    return { id: r.id, spacerPx: 0 }
  })
}

// ─── Client Block ─────────────────────────────────────────────────────────────

function ClientBlock({ client, projects, registry }: {
  client: string
  projects: Project[]
  registry: RegistryEntry[]
}) {
  const [expanded, setExpanded] = useState(false)
  const tablesRef    = useRef<HTMLDivElement>(null)
  const gapDivRef    = useRef<HTMLDivElement>(null)   // SVG is position:absolute inside this div
  const regTbodyRef  = useRef<HTMLTableSectionElement | null>(null)
  const projRowRefs  = useRef<Record<string, HTMLTableRowElement | null>>({})
  const regRowRefs   = useRef<Record<string, HTMLTableRowElement | null>>({})
  // spacerTdRefs: direct DOM control for spacer heights (bypasses React state → no two-pass lag)
  const spacerTdRefs = useRef<Record<string, HTMLTableCellElement | null>>({})

  const [groupLineData, setGroupLineData] = useState<GroupLine[]>([])

  // ── Connection map ────────────────────────────────────────────────────────

  const matchPairs = useMemo(() => {
    const pairs: { projId: string; regId: string }[] = []
    const regById = new Map(registry.map(r => [r.matrixId, r.id]))
    for (const p of projects) {
      const seen = new Set<string>()
      const candidates = [p.sheetMatrixId, p.linkedMatrix?.matrixId].filter(Boolean) as string[]
      for (const mid of candidates) {
        const regId = regById.get(mid)
        if (regId && !seen.has(regId)) {
          pairs.push({ projId: p.id, regId })
          seen.add(regId)
        }
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

  const sortedProjects = useMemo(() =>
    [...projects].sort((a, b) => {
      if (!a.date && !b.date) return 0
      if (!a.date) return 1
      if (!b.date) return -1
      return new Date(a.date).getTime() - new Date(b.date).getTime()
    }),
  [projects])

  const sortedRegistry = useMemo(() =>
    [...registry].sort((a, b) => {
      if (!a.date && !b.date) return 0
      if (!a.date) return 1
      if (!b.date) return -1
      return new Date(a.date as string).getTime() - new Date(b.date as string).getTime()
    }),
  [registry])

  const orderedProjects = useMemo(() => {
    const result: Project[] = []
    const placed = new Set<string>()
    // For each registry entry (in date order), place its connected projects (in date order)
    for (const r of sortedRegistry) {
      const connectedProjIds = new Set(matchPairs.filter(mp => mp.regId === r.id).map(mp => mp.projId))
      const group = sortedProjects.filter(p => connectedProjIds.has(p.id))
      for (const p of group) {
        if (!placed.has(p.id)) { result.push(p); placed.add(p.id) }
      }
    }
    // Unconnected projects after all groups, sorted by date
    for (const p of sortedProjects) {
      if (!placed.has(p.id)) result.push(p)
    }
    return result
  }, [sortedProjects, sortedRegistry, matchPairs])

  const orderedRegistry = useMemo(() => {
    const result: RegistryEntry[] = []
    const placed = new Set<string>()
    // Follow orderedProjects to pick registry rows in group order
    for (const p of orderedProjects) {
      const connectedRegIds = matchPairs.filter(mp => mp.projId === p.id).map(mp => mp.regId)
      for (const regId of connectedRegIds) {
        const r = registry.find(x => x.id === regId)
        if (r && !placed.has(r.id)) { result.push(r); placed.add(r.id) }
      }
    }
    // Unconnected registry rows last, sorted by date
    for (const r of sortedRegistry) {
      if (!placed.has(r.id)) result.push(r)
    }
    return result
  }, [orderedProjects, registry, sortedRegistry, matchPairs])

  // ── Measurement effect ────────────────────────────────────────────────────
  //
  // Single-pass approach (mirrors debug.html draw() exactly):
  //   1. Reset spacer heights to 0px directly in DOM (via spacerTdRefs)
  //   2. Measure project row CYs and regT0/regRowH (getBoundingClientRect forces layout)
  //   3. Compute spacers with computeRegPlacements
  //   4. Apply spacer heights directly in DOM (no React state — no re-render needed)
  //   5. Measure registry row CYs (getBoundingClientRect forces layout with new spacers)
  //   6. Build SVG line data and call setGroupLineData
  //
  // This eliminates the two-pass state-update lag that caused 66 px drift in production.

  useLayoutEffect(() => {
    if (!expanded) { setGroupLineData([]); return }
    if (!tablesRef.current || !regTbodyRef.current) return

    const measure = () => {
      if (!tablesRef.current || !gapDivRef.current || !regTbodyRef.current) return

      // Step 1: reset all spacers to 0 so layout is "natural"
      for (const el of Object.values(spacerTdRefs.current)) {
        if (el) el.style.height = '0px'
      }

      // Step 2: measure project row centers (layout forced by getBoundingClientRect)
      //
      // getBoundingClientRect() returns zoomed viewport coordinates.
      // el.style.height = 'Xpx' and SVG y attributes use CSS pixels (pre-zoom).
      // At browser zoom > 100% (or Windows display scaling) these differ by the
      // zoom factor, causing spacers to be applied at wrong sizes and SVG lines
      // to be drawn at wrong positions.
      //
      // Fix: compute zoomFactor = getBoundingClientRect().height / offsetHeight
      // for any rendered element, then divide all getBoundingClientRect values by
      // it so everything is in CSS pixels throughout.
      const cRect = tablesRef.current.getBoundingClientRect()  // kept for debug only
      const gapDivRect = gapDivRef.current.getBoundingClientRect()
      const origin = gapDivRect.top  // zoomed viewport coords

      // Detect zoom: getBoundingClientRect is in zoomed coords, offsetHeight is CSS px
      const anyRowEl = (orderedProjects[0] && projRowRefs.current[orderedProjects[0].id])
        ?? (orderedRegistry[0] && regRowRefs.current[orderedRegistry[0].id])
      const zoomFactor = (anyRowEl && anyRowEl.offsetHeight > 0)
        ? anyRowEl.getBoundingClientRect().height / anyRowEl.offsetHeight
        : 1

      const projCYs = new Map<string, number>()
      for (const p of orderedProjects) {
        const el = projRowRefs.current[p.id]
        if (el) {
          const r = el.getBoundingClientRect()
          projCYs.set(p.id, (r.top - origin + r.height / 2) / zoomFactor)
        }
      }

      const regT0 = (regTbodyRef.current.getBoundingClientRect().top - origin) / zoomFactor
      const firstRegId = orderedRegistry[0]?.id
      const firstRegEl = firstRegId ? regRowRefs.current[firstRegId] : null
      const firstProjEl = orderedProjects[0] ? projRowRefs.current[orderedProjects[0].id] : null
      const regRowHZoomed = firstRegEl?.getBoundingClientRect().height
        ?? firstProjEl?.getBoundingClientRect().height
        ?? 0
      const regRowH = regRowHZoomed / zoomFactor  // CSS pixels
      if (regRowH === 0) return

      // Step 3: compute spacers (all values now in CSS pixels)
      const placements = computeRegPlacements(
        orderedRegistry, orderedProjects, matchPairs, projCYs, regT0, regRowH,
      )

      // Step 4: apply spacer heights directly to DOM (values already in CSS pixels)
      for (const { id, spacerPx } of placements) {
        const el = spacerTdRefs.current[id]
        if (el) el.style.height = spacerPx + 'px'
      }

      // Step 5 + 6: measure registry row centers (getBoundingClientRect forces layout
      // with the new spacer heights), then build SVG line data
      const lines: GroupLine[] = []
      for (const { id: regId } of placements) {
        const connProjIds = matchPairs.filter(mp => mp.regId === regId).map(mp => mp.projId)
        if (connProjIds.length === 0) continue

        const regEl = regRowRefs.current[regId]
        if (!regEl) continue
        const regR = regEl.getBoundingClientRect()
        const regCY = (regR.top - origin + regR.height / 2) / zoomFactor

        const connProjCYs = connProjIds
          .map(id => projCYs.get(id))
          .filter((y): y is number => y !== undefined)
        if (connProjCYs.length === 0) continue

        const ci = groupColorMap.get(regId) ?? 0
        lines.push({ id: regId, projCYs: connProjCYs, regCY, color: GROUP_PALETTE[ci].line })
      }

      // ── DEBUG ────────────────────────────────────────────────────────────────
      console.group(`[ClientBlock "${client}"] measure()`)
      console.log('tablesRef.top =', cRect.top, '  gapDiv.top =', gapDivRect.top, '  diff =', (gapDivRect.top - cRect.top).toFixed(3))
      console.log('zoomFactor =', zoomFactor.toFixed(4), '  origin(gapDiv) =', origin, '  regT0(css) =', regT0, '  regRowH(css) =', regRowH)
      console.log('projCYs:', Object.fromEntries(projCYs))
      for (const pl of placements) {
        const el = spacerTdRefs.current[pl.id]
        const dataEl = regRowRefs.current[pl.id]
        const actualH = el?.getBoundingClientRect().height ?? null
        const dataCY = dataEl ? dataEl.getBoundingClientRect().top - origin + dataEl.getBoundingClientRect().height / 2 : null
        console.log(`  reg[${pl.id}] spacer=${pl.spacerPx.toFixed(2)}px  spacerActualH=${actualH}  dataCY=${dataCY?.toFixed(2)}`)
      }
      for (const gl of lines) {
        console.log(`  SVG line: projCYs=${gl.projCYs.map(y => y.toFixed(2)).join(',')}  regCY=${gl.regCY.toFixed(2)}  diff=${(gl.regCY - gl.projCYs.reduce((a,b)=>a+b,0)/gl.projCYs.length).toFixed(2)}`)
      }
      console.groupEnd()
      // ── END DEBUG ────────────────────────────────────────────────────────────

      setGroupLineData(lines)
    }

    measure()

    // Re-measure on window resize (text reflow can shift row heights/positions).
    // We use window instead of ResizeObserver on tablesRef to avoid a feedback loop:
    // applying spacers makes the registry table taller, which stretches the flex
    // container, which would re-fire a ResizeObserver on any child — infinite loop.
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [expanded, orderedProjects, orderedRegistry, matchPairs, groupColorMap])

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
            <div ref={gapDivRef} style={{ width: GAP, flexShrink: 0, position: 'relative', background: '#f8fafc' }}>
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
                    {orderedRegistry.map(r => {
                      const ci = groupColorMap.get(r.id)
                      const bg = ci !== undefined ? GROUP_PALETTE[ci].bg : '#fff'
                      return (
                        <Fragment key={r.id}>
                          {/* Spacer height controlled directly via DOM (spacerTdRefs) — no React state */}
                          <tr aria-hidden="true">
                            <td
                              colSpan={REG_COLS.length}
                              ref={el => { spacerTdRefs.current[r.id] = el }}
                              style={{ padding: 0, border: 'none', background: '#fff' }}
                            />
                          </tr>
                          <tr ref={el => { regRowRefs.current[r.id] = el }} style={{ background: bg }}>
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

    // Earliest date for each client (projects + registry)
    const earliestDate = (client: string): number => {
      const projDates = allProjects
        .filter(p => (p.client ?? '') === client && p.date)
        .map(p => new Date(p.date!).getTime())
      const regDates = registry
        .filter(r => (r.client ?? '') === client && r.date)
        .map(r => new Date(r.date!).getTime())
      const all = [...projDates, ...regDates]
      return all.length > 0 ? Math.min(...all) : Infinity
    }

    return Array.from(set).sort((a, b) => {
      if (!a) return 1
      if (!b) return -1
      const da = earliestDate(a)
      const db = earliestDate(b)
      if (da === db) return a.localeCompare(b, 'ru')
      return da - db
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
