import React, { useState, useRef, useEffect } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface GSEntry {
  date?: string
  timeFrom?: string
  timeTo?: string
  startTime?: string
  note?: string
}

interface SPGroup {
  id: string
  label: string
  color: string
  members: Array<{ id: string; name: string }>
}

export interface ShiftPlannerProps {
  projectId: string
  projectDate: string | null
  projectFormat: string | null
  groups: SPGroup[]
  groupSchedule: Record<string, GSEntry | null>
  onGroupScheduleUpdate: (patch: Record<string, GSEntry | null>) => void
}

interface PlanBlock {
  id: string
  label: string
  color: string
  absFrom: number
  absTo: number
}

interface TrackedEntry {
  blockId: string
  memberId: string
  memberName: string
  absFrom: number
  absTo: number
  track: number
}

interface PersonRow {
  type: 'person'
  name: string
  color: string
  entries: TrackedEntry[]
  numTracks: number
  rowH: number
}

interface SectionRow {
  type: 'section'
  label: string
  color: string
}

type PlanRow = PersonRow | SectionRow

// ─── Constants ────────────────────────────────────────────────────────────────

const STEP = 30
const BASE_PX = 2.2
const HANDLE_W = 8
const BAR_H = 16
const ROW_H_BASE = 40
const SECTION_H = 26
const DATE_ROW_H = 20
const BLOCK_TRACK_H = 28
const TICK_H = 22
const NAMES_W = 190

const TV_PRESET: Record<string, { dayOffset: number; timeFrom: string; timeTo: string }> = {
  sbor:      { dayOffset: -1, timeFrom: '07:00', timeTo: '10:00' },
  zavoz:     { dayOffset: -1, timeFrom: '08:00', timeTo: '12:00' },
  montazh:   { dayOffset: -1, timeFrom: '10:00', timeTo: '20:00' },
  efir:      { dayOffset:  0, timeFrom: '18:00', timeTo: '22:00' },
  demontazh: { dayOffset:  0, timeFrom: '22:00', timeTo: '02:00' },
  vyvoz:     { dayOffset:  1, timeFrom: '09:00', timeTo: '13:00' },
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function timeToMins(t: string): number {
  const [h, m] = (t || '00:00').split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function minsToTime(m: number): string {
  const v = ((m % 1440) + 1440) % 1440
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`
}

function dayOf(m: number): number {
  return Math.floor(m / 1440)
}

function getAnchor(projectDate: string | null): Date {
  if (projectDate) {
    try { const d = new Date(projectDate); if (!isNaN(d.getTime())) return d } catch {}
  }
  return new Date()
}

function dayOffsetFrom(anchor: Date, dateStr: string): number {
  const anchorMid = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())
  const d = new Date(dateStr)
  const dMid = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.round((dMid.getTime() - anchorMid.getTime()) / 86400000)
}

function dateLabel(anchor: Date, absMins: number): string {
  const d = new Date(anchor); d.setDate(d.getDate() + dayOf(absMins))
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

function dateFull(anchor: Date, absMins: number): string {
  const d = new Date(anchor); d.setDate(d.getDate() + dayOf(absMins))
  return d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' })
}

function absToDateStr(anchor: Date, absMins: number): string {
  const d = new Date(anchor); d.setDate(d.getDate() + dayOf(absMins))
  return d.toISOString().slice(0, 10)
}

function buildBlocks(groups: SPGroup[], gs: Record<string, GSEntry | null>, anchor: Date): PlanBlock[] {
  const out: PlanBlock[] = []
  for (const g of groups) {
    if (g.id === 'ungrouped' || g.id === 'default') continue
    const e = gs[g.id]
    if (!e?.date || !e?.timeFrom || !e?.timeTo) continue
    const offset = dayOffsetFrom(anchor, e.date)
    const from = timeToMins(e.timeFrom)
    let to = timeToMins(e.timeTo)
    if (to <= from) to += 1440
    out.push({ id: g.id, label: g.label, color: g.color, absFrom: offset * 1440 + from, absTo: offset * 1440 + to })
  }
  return out
}

function assignTracks<T extends { absFrom: number; absTo: number }>(
  entries: T[]
): { result: Array<T & { track: number }>; numTracks: number } {
  const sorted = [...entries].sort((a, b) => a.absFrom - b.absFrom)
  const trackEnds: number[] = []
  const result: Array<T & { track: number }> = []
  for (const e of sorted) {
    let placed = false
    for (let t = 0; t < trackEnds.length; t++) {
      if (trackEnds[t] <= e.absFrom) { result.push({ ...e, track: t }); trackEnds[t] = e.absTo; placed = true; break }
    }
    if (!placed) { result.push({ ...e, track: trackEnds.length }); trackEnds.push(e.absTo) }
  }
  return { result, numTracks: Math.max(1, trackEnds.length) }
}

function buildRows(groups: SPGroup[], blocks: PlanBlock[]): PlanRow[] {
  const blockMap = new Map(blocks.map(b => [b.id, b]))
  const rows: PlanRow[] = []
  for (const g of groups) {
    if (g.id === 'ungrouped' || g.id === 'default') continue
    const block = blockMap.get(g.id)
    const visibleMembers = block ? g.members : []
    if (visibleMembers.length === 0 && !block) continue
    rows.push({ type: 'section', label: g.label, color: g.color })
    for (const m of g.members) {
      const rawEntries = block ? [{
        blockId: g.id, memberId: m.id, memberName: m.name,
        absFrom: block.absFrom, absTo: block.absTo,
      }] : []
      const { result, numTracks } = assignTracks(rawEntries)
      const rowH = Math.max(ROW_H_BASE, numTracks * (BAR_H + 8) + 10)
      rows.push({ type: 'person', name: m.name, color: g.color, entries: result, numTracks, rowH })
    }
  }
  return rows
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ShiftPlanner({ projectId, projectDate, projectFormat, groups, groupSchedule, onGroupScheduleUpdate }: ShiftPlannerProps) {
  // Mutable refs — direct DOM updates during drag, React state only for UI triggers
  const blocksRef = useRef<PlanBlock[]>([])
  const rowsRef = useRef<PlanRow[]>([])
  const zoomRef = useRef(1.0)
  const anchorRef = useRef<Date>(getAnchor(projectDate))

  // Layout cache
  const rangeRef = useRef({ start: 0, end: 1440 })
  const blockTracksRef = useRef<Record<string, number>>({})
  const numBlockTracksRef = useRef(1)
  const headerHRef = useRef(DATE_ROW_H + BLOCK_TRACK_H + TICK_H)

  // DOM refs
  const plannerRef = useRef<HTMLDivElement>(null)
  const cornerRef = useRef<HTMLDivElement>(null)
  const headerScrollRef = useRef<HTMLDivElement>(null)
  const headerInnerRef = useRef<HTMLDivElement>(null)
  const namesScrollRef = useRef<HTMLDivElement>(null)
  const namesInnerRef = useRef<HTMLDivElement>(null)
  const tracksScrollRef = useRef<HTMLDivElement>(null)
  const tracksInnerRef = useRef<HTMLDivElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)

  const [zoomPct, setZoomPct] = useState(100)
  const [popup, setPopup] = useState<{ bid: string; x: number; y: number } | null>(null)
  const [hasBlocks, setHasBlocks] = useState(false)
  const presetApplied = useRef(false)
  const initialScrollDone = useRef(false)

  // ── Layout math ─────────────────────────────────────────────────────────────

  function ppm() { return BASE_PX * zoomRef.current }
  function minToPx(m: number) { return (m - rangeRef.current.start) * ppm() }
  function totalW() { return (rangeRef.current.end - rangeRef.current.start) * ppm() }

  function computeAll(keepRange = false) {
    const blocks = blocksRef.current
    if (blocks.length === 0) {
      if (!keepRange) rangeRef.current = { start: 0, end: 1440 }
      blockTracksRef.current = {}
      numBlockTracksRef.current = 1
    } else {
      if (!keepRange) {
        const mins = blocks.flatMap(b => [b.absFrom, b.absTo])
        rangeRef.current = {
          start: Math.floor((Math.min(...mins) - 90) / STEP) * STEP,
          end: Math.ceil((Math.max(...mins) + 90) / STEP) * STEP,
        }
      }
      const sorted = [...blocks].sort((a, b) => a.absFrom - b.absFrom)
      const trackEnds: number[] = []
      const tracks: Record<string, number> = {}
      for (const b of sorted) {
        let placed = false
        for (let t = 0; t < trackEnds.length; t++) {
          if (trackEnds[t] <= b.absFrom) { tracks[b.id] = t; trackEnds[t] = b.absTo; placed = true; break }
        }
        if (!placed) { tracks[b.id] = trackEnds.length; trackEnds.push(b.absTo) }
      }
      blockTracksRef.current = tracks
      numBlockTracksRef.current = Math.max(1, trackEnds.length)
    }
    headerHRef.current = DATE_ROW_H + numBlockTracksRef.current * BLOCK_TRACK_H + TICK_H
  }

  function totalH() {
    return rowsRef.current.reduce((s, r) => s + (r.type === 'section' ? SECTION_H : (r as PersonRow).rowH), 0)
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  function render(preserveScroll = true, keepRange = false) {
    computeAll(keepRange)
    const W = totalW(), H = totalH(), hh = headerHRef.current
    if (plannerRef.current) plannerRef.current.style.gridTemplateRows = `${hh}px 1fr`
    if (cornerRef.current) cornerRef.current.style.height = `${hh}px`
    if (headerScrollRef.current) headerScrollRef.current.style.height = `${hh}px`
    const savedL = tracksScrollRef.current?.scrollLeft ?? 0
    const savedT = tracksScrollRef.current?.scrollTop ?? 0
    renderHeader(W, hh)
    renderNames(H)
    renderTracks(W, H)
    if (preserveScroll) {
      if (tracksScrollRef.current) { tracksScrollRef.current.scrollLeft = savedL; tracksScrollRef.current.scrollTop = savedT }
      if (headerScrollRef.current) headerScrollRef.current.scrollLeft = savedL
      if (namesScrollRef.current) namesScrollRef.current.scrollTop = savedT
    }
  }

  function renderHeader(W: number, hh: number) {
    const el = headerInnerRef.current; if (!el) return
    el.style.width = `${W}px`; el.style.height = `${hh}px`
    const blocks = blocksRef.current, range = rangeRef.current, anchor = anchorRef.current
    let html = ''

    for (let day = dayOf(range.start) - 1; day <= dayOf(range.end) + 1; day++) {
      const absS = day * 1440, absE = (day + 1) * 1440
      const visS = Math.max(absS, range.start), visE = Math.min(absE, range.end)
      if (visS >= visE) continue
      const x = minToPx(visS), w = minToPx(visE) - x
      html += `<div style="position:absolute;top:0;left:${x}px;width:${w}px;height:${DATE_ROW_H}px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:#64748b;border-right:1px solid #e2e8f0;">${dateFull(anchor, absS + 720)}</div>`
      if (absS > range.start && absS < range.end)
        html += `<div style="position:absolute;top:${DATE_ROW_H}px;left:${minToPx(absS)}px;width:2px;height:${hh - DATE_ROW_H}px;background:#dde2ea;pointer-events:none;z-index:5;"></div>`
    }

    for (const b of blocks) {
      const track = blockTracksRef.current[b.id] ?? 0
      const by2 = DATE_ROW_H + track * BLOCK_TRACK_H + 3, bh = BLOCK_TRACK_H - 6
      const x = minToPx(b.absFrom), w = (b.absTo - b.absFrom) * ppm()
      html += `<div id="hbar-${b.id}" style="position:absolute;top:${by2}px;left:${x}px;width:${w}px;height:${bh}px;background:${b.color}28;border:1.5px solid ${b.color}99;border-radius:6px;overflow:visible;user-select:none;z-index:2;">
        <div class="blk-move" data-bid="${b.id}" style="position:absolute;inset:0;cursor:grab;border-radius:6px;z-index:1;"></div>
        <div class="blk-resize" data-bid="${b.id}" data-side="absFrom" style="position:absolute;left:-6px;top:0;width:14px;height:100%;cursor:ew-resize;z-index:3;display:flex;align-items:center;justify-content:center;"><div style="width:4px;height:${bh - 4}px;background:${b.color};border-radius:2px;opacity:.7;pointer-events:none;"></div></div>
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;gap:4px;overflow:hidden;padding:0 14px;">
          <span style="font-size:11px;font-weight:600;color:${b.color};white-space:nowrap;">${b.label}</span>
          <span class="blk-time" style="font-size:10px;color:${b.color};opacity:.7;white-space:nowrap;">${minsToTime(b.absFrom)}–${minsToTime(b.absTo)}</span>
          <span class="blk-date" style="font-size:10px;color:${b.color};opacity:.45;white-space:nowrap;">${dateLabel(anchor, b.absFrom)}</span>
        </div>
        <div class="blk-resize" data-bid="${b.id}" data-side="absTo" style="position:absolute;right:-6px;top:0;width:14px;height:100%;cursor:ew-resize;z-index:3;display:flex;align-items:center;justify-content:center;"><div style="width:4px;height:${bh - 4}px;background:${b.color};border-radius:2px;opacity:.7;pointer-events:none;"></div></div>
      </div>`
    }

    const tickY = DATE_ROW_H + numBlockTracksRef.current * BLOCK_TRACK_H
    for (let t = range.start; t <= range.end; t += STEP) {
      const x = minToPx(t), isH = t % 60 === 0
      if (((t % 1440) + 1440) % 1440 === 0 && t !== range.start) continue
      html += `<div style="position:absolute;top:${tickY}px;left:${x}px;transform:translateX(-50%);">
        <div style="height:${isH ? 10 : 5}px;width:1px;background:${isH ? '#94a3b8' : '#cbd5e1'};margin:0 auto;"></div>
        ${isH ? `<div style="font-size:10px;color:#94a3b8;text-align:center;white-space:nowrap;">${minsToTime(t)}</div>` : ''}
      </div>`
    }

    el.innerHTML = html
    el.querySelectorAll<HTMLElement>('.blk-move').forEach(d => d.addEventListener('pointerdown', onBlockMoveDown))
    el.querySelectorAll<HTMLElement>('.blk-resize').forEach(d => d.addEventListener('pointerdown', onBlockResizeDown))
  }

  function renderNames(H: number) {
    const el = namesInnerRef.current; if (!el) return
    el.style.height = `${H}px`
    let html = ''
    for (const row of rowsRef.current) {
      if (row.type === 'section') {
        html += `<div style="height:${SECTION_H}px;display:flex;align-items:center;padding:0 14px;font-size:10px;color:${row.color};background:#f8fafc;border-bottom:1px solid #e2e8f0;text-transform:uppercase;letter-spacing:.06em;font-weight:600;gap:6px;">
          <div style="width:3px;height:12px;background:${row.color};border-radius:2px;flex-shrink:0;"></div>${row.label}</div>`
      } else {
        const pr = row as PersonRow
        html += `<div data-name="${pr.name.replace(/"/g, '&quot;')}" style="height:${pr.rowH}px;display:flex;align-items:center;padding:0 10px 0 0;font-size:12px;color:#334155;border-bottom:1px solid #f1f5f9;white-space:nowrap;overflow:hidden;cursor:pointer;" title="Двойной клик — подогнать под блок">
          <div style="width:4px;flex-shrink:0;align-self:stretch;background:${pr.color}55;margin-right:8px;"></div>
          <span style="overflow:hidden;text-overflow:ellipsis;">${pr.name}</span>
        </div>`
      }
    }
    el.innerHTML = html
    el.querySelectorAll<HTMLElement>('[data-name]').forEach(r => r.addEventListener('dblclick', () => snapPerson(r.dataset.name!)))
  }

  function renderTracks(W: number, H: number) {
    const el = tracksInnerRef.current; if (!el) return
    el.style.width = `${W}px`; el.style.height = `${H}px`
    const blocks = blocksRef.current, range = rangeRef.current
    let html = ''

    for (let t = range.start; t <= range.end; t += STEP) {
      const x = minToPx(t), isH = t % 60 === 0
      const isMid = ((t % 1440) + 1440) % 1440 === 0
      html += `<div style="position:absolute;top:0;left:${x}px;width:${isMid ? 2 : 1}px;height:100%;background:${isMid ? '#cbd5e1' : isH ? '#e2e8f0' : '#f8fafc'};pointer-events:none;"></div>`
    }

    for (const b of blocks) {
      const x = minToPx(b.absFrom), w = (b.absTo - b.absFrom) * ppm()
      html += `<div id="tbg-${b.id}" style="position:absolute;top:0;left:${x}px;width:${w}px;height:100%;background:${b.color}0a;border-left:1px solid ${b.color}33;pointer-events:none;"></div>`
    }

    let y = 0
    for (const row of rowsRef.current) {
      if (row.type === 'section') {
        html += `<div style="position:absolute;top:${y}px;left:0;width:100%;height:${SECTION_H}px;background:#f8fafc88;border-bottom:1px solid #e2e8f0;pointer-events:none;"></div>`
        y += SECTION_H; continue
      }
      const pr = row as PersonRow
      const trackPitch = pr.numTracks === 1 ? pr.rowH : Math.floor((pr.rowH - 8) / pr.numTracks)
      html += `<div style="position:absolute;top:${y}px;left:0;width:4px;height:${pr.rowH}px;background:${pr.color}44;pointer-events:none;"></div>`

      if (pr.entries.length > 1) {
        const sorted = [...pr.entries].sort((a, b) => a.absFrom - b.absFrom)
        const lx = minToPx(sorted[0].absFrom), rx = minToPx(sorted[sorted.length - 1].absTo)
        html += `<div style="position:absolute;top:${y + pr.rowH / 2}px;left:${lx}px;width:${rx - lx}px;height:1px;background:#94a3b8;pointer-events:none;"></div>`
        for (const e of sorted) {
          const ex = minToPx(e.absFrom), ew = (e.absTo - e.absFrom) * ppm()
          html += `<div style="position:absolute;top:${y + pr.rowH / 2 - 2.5}px;left:${ex - 2.5}px;width:5px;height:5px;border-radius:50%;background:#94a3b8;pointer-events:none;"></div>`
          html += `<div style="position:absolute;top:${y + pr.rowH / 2 - 2.5}px;left:${ex + ew - 2.5}px;width:5px;height:5px;border-radius:50%;background:#94a3b8;pointer-events:none;"></div>`
        }
      }

      for (const te of pr.entries) {
        const barCY = pr.numTracks === 1 ? y + pr.rowH / 2 : y + 4 + te.track * trackPitch + trackPitch / 2
        const by2 = barCY - BAR_H / 2, bx = minToPx(te.absFrom), bw = (te.absTo - te.absFrom) * ppm()
        const block = blocks.find(b => b.id === te.blockId); if (!block) continue
        html += `<div id="mbar-${te.memberId}-${te.blockId}" style="position:absolute;top:${by2}px;left:${bx}px;width:${bw}px;height:${BAR_H}px;background:${block.color};border-radius:4px;opacity:.9;user-select:none;overflow:visible;">
          <div class="mresize" data-mid="${te.memberId}" data-bid="${te.blockId}" data-side="absFrom" style="position:absolute;left:0;top:0;width:${HANDLE_W}px;height:100%;cursor:ew-resize;background:rgba(0,0,0,.25);border-radius:4px 0 0 4px;z-index:2;"></div>
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:space-between;padding:0 ${HANDLE_W + 2}px;pointer-events:none;overflow:hidden;">
            <span class="mbar-from" style="font-size:9px;color:#fff;opacity:.9;">${minsToTime(te.absFrom)}</span>
            <span style="font-size:9px;color:#fff;font-weight:600;opacity:.6;white-space:nowrap;">${block.label}</span>
            <span class="mbar-to" style="font-size:9px;color:#fff;opacity:.9;">${minsToTime(te.absTo)}</span>
          </div>
          <div class="mresize" data-mid="${te.memberId}" data-bid="${te.blockId}" data-side="absTo" style="position:absolute;right:0;top:0;width:${HANDLE_W}px;height:100%;cursor:ew-resize;background:rgba(0,0,0,.25);border-radius:0 4px 4px 0;z-index:2;"></div>
        </div>`
      }
      html += `<div style="position:absolute;top:${y + pr.rowH - 1}px;left:0;width:100%;height:1px;background:#e2e8f0;pointer-events:none;"></div>`
      y += pr.rowH
    }

    el.innerHTML = html
    el.querySelectorAll<HTMLElement>('.mresize').forEach(h => h.addEventListener('pointerdown', onMemberResizeDown))
  }

  // ── DOM helpers ──────────────────────────────────────────────────────────────

  function updateHbarDOM(b: PlanBlock) {
    const el = document.getElementById(`hbar-${b.id}`); if (!el) return
    el.style.left = `${minToPx(b.absFrom)}px`; el.style.width = `${(b.absTo - b.absFrom) * ppm()}px`
    const t = el.querySelector<HTMLElement>('.blk-time'), d = el.querySelector<HTMLElement>('.blk-date')
    if (t) t.textContent = `${minsToTime(b.absFrom)}–${minsToTime(b.absTo)}`
    if (d) d.textContent = dateLabel(anchorRef.current, b.absFrom)
  }
  function updateTbgDOM(b: PlanBlock) {
    const el = document.getElementById(`tbg-${b.id}`); if (!el) return
    el.style.left = `${minToPx(b.absFrom)}px`; el.style.width = `${(b.absTo - b.absFrom) * ppm()}px`
  }
  function updateMbarDOM(mid: string, bid: string, from: number, to: number) {
    const el = document.getElementById(`mbar-${mid}-${bid}`); if (!el) return
    el.style.left = `${minToPx(from)}px`; el.style.width = `${(to - from) * ppm()}px`
    const f = el.querySelector<HTMLElement>('.mbar-from'), t = el.querySelector<HTMLElement>('.mbar-to')
    if (f) f.textContent = minsToTime(from); if (t) t.textContent = minsToTime(to)
  }
  function showTip(e: PointerEvent, txt: string) {
    const tip = tipRef.current; if (!tip) return
    tip.textContent = txt; tip.style.display = 'block'
    tip.style.left = `${e.clientX + 14}px`; tip.style.top = `${e.clientY - 10}px`
  }
  function hideTip() { if (tipRef.current) tipRef.current.style.display = 'none' }

  // ── Drag handlers ─────────────────────────────────────────────────────────

  function onBlockMoveDown(e: Event) {
    const pe = e as PointerEvent; pe.preventDefault(); pe.stopPropagation()
    const bid = (pe.currentTarget as HTMLElement).dataset.bid!
    const block = blocksRef.current.find(b => b.id === bid); if (!block) return
    const startX = pe.clientX, origFrom = block.absFrom, origTo = block.absTo
    let moved = false
    const snapEntries = rowsRef.current.flatMap(r =>
      r.type === 'person' ? r.entries.filter(e => e.blockId === bid).map(e => ({ ...e, of: e.absFrom, ot: e.absTo, entryRef: e })) : []
    )
    function onMove(ev: PointerEvent) {
      const dx = ev.clientX - startX
      if (!moved && Math.abs(dx) > 5) { moved = true; document.body.style.cursor = 'grabbing' }
      if (!moved) return
      const shift = Math.round(dx / ppm() / STEP) * STEP
      block.absFrom = origFrom + shift; block.absTo = origTo + shift
      snapEntries.forEach(se => { se.entryRef.absFrom = se.of + shift; se.entryRef.absTo = se.ot + shift; updateMbarDOM(se.memberId, se.blockId, se.of + shift, se.ot + shift) })
      updateHbarDOM(block); updateTbgDOM(block)
      showTip(ev, `${dateLabel(anchorRef.current, block.absFrom)}  ${minsToTime(block.absFrom)} – ${minsToTime(block.absTo)}`)
    }
    function onUp(ev: PointerEvent) {
      document.body.style.cursor = ''; document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); hideTip()
      if (moved) {
        render()
        const existing = groupSchedule[block.id] ?? {}
        onGroupScheduleUpdate({ [block.id]: { ...existing, date: absToDateStr(anchorRef.current, block.absFrom), timeFrom: minsToTime(block.absFrom), timeTo: minsToTime(block.absTo) } })
      } else { setPopup({ bid, x: ev.clientX, y: ev.clientY }) }
    }
    document.addEventListener('pointermove', onMove); document.addEventListener('pointerup', onUp)
  }

  function onBlockResizeDown(e: Event) {
    const pe = e as PointerEvent; pe.preventDefault(); pe.stopPropagation()
    const el = pe.currentTarget as HTMLElement
    const bid = el.dataset.bid!, side = el.dataset.side as 'absFrom' | 'absTo'
    const block = blocksRef.current.find(b => b.id === bid); if (!block) return
    const startX = pe.clientX, origVal = block[side]
    function onMove(ev: PointerEvent) {
      const dx = ev.clientX - startX
      let v = Math.round((origVal + dx / ppm()) / STEP) * STEP
      if (side === 'absFrom') v = Math.max(block.absTo - 20 * 60, Math.min(v, block.absTo - STEP))
      else v = Math.max(block.absFrom + STEP, Math.min(v, block.absFrom + 20 * 60))
      block[side] = v; updateHbarDOM(block); updateTbgDOM(block); showTip(ev, minsToTime(v))
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); hideTip()
      rowsRef.current.forEach(r => {
        if (r.type !== 'person') return
        r.entries.filter(e => e.blockId === bid).forEach(e => {
          e.absFrom = Math.max(block.absFrom, Math.min(e.absFrom, block.absTo - STEP))
          e.absTo = Math.max(e.absFrom + STEP, Math.min(e.absTo, block.absTo))
        })
      })
      render()
      const existing = groupSchedule[block.id] ?? {}
      onGroupScheduleUpdate({ [block.id]: { ...existing, date: absToDateStr(anchorRef.current, block.absFrom), timeFrom: minsToTime(block.absFrom), timeTo: minsToTime(block.absTo) } })
    }
    document.addEventListener('pointermove', onMove); document.addEventListener('pointerup', onUp)
  }

  function onMemberResizeDown(e: Event) {
    const pe = e as PointerEvent; pe.preventDefault(); pe.stopPropagation()
    const el = pe.currentTarget as HTMLElement
    const mid = el.dataset.mid!, bid = el.dataset.bid!, side = el.dataset.side as 'absFrom' | 'absTo'
    const block = blocksRef.current.find(b => b.id === bid); if (!block) return
    let entry: TrackedEntry | undefined
    for (const r of rowsRef.current) { if (r.type !== 'person') continue; entry = r.entries.find(e => e.memberId === mid && e.blockId === bid); if (entry) break }
    if (!entry) return
    const startX = pe.clientX, origVal = entry[side]
    function onMove(ev: PointerEvent) {
      const dx = ev.clientX - startX
      let v = Math.round((origVal + dx / ppm()) / STEP) * STEP
      if (side === 'absFrom') v = Math.max(block!.absFrom, Math.min(v, entry!.absTo - STEP))
      else v = Math.max(entry!.absFrom + STEP, Math.min(v, block!.absTo))
      entry![side] = v; updateMbarDOM(mid, bid, entry!.absFrom, entry!.absTo); showTip(ev, minsToTime(v))
    }
    function onUp() { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); hideTip(); render() }
    document.addEventListener('pointermove', onMove); document.addEventListener('pointerup', onUp)
  }

  function snapPerson(name: string) {
    for (const r of rowsRef.current) {
      if (r.type !== 'person' || r.name !== name) continue
      r.entries.forEach(e => { const b = blocksRef.current.find(x => x.id === e.blockId); if (b) { e.absFrom = b.absFrom; e.absTo = b.absTo } })
    }
    render()
  }

  // ── Popup ────────────────────────────────────────────────────────────────────

  function changeDay(delta: number) {
    if (!popup) return
    const block = blocksRef.current.find(b => b.id === popup.bid); if (!block) return
    const shift = delta * 1440
    block.absFrom += shift; block.absTo += shift
    rowsRef.current.forEach(r => { if (r.type !== 'person') return; r.entries.filter(e => e.blockId === popup.bid).forEach(e => { e.absFrom += shift; e.absTo += shift }) })
    render()
    setPopup(p => p ? { ...p } : null)
    const existing = groupSchedule[block.id] ?? {}
    onGroupScheduleUpdate({ [block.id]: { ...existing, date: absToDateStr(anchorRef.current, block.absFrom), timeFrom: minsToTime(block.absFrom), timeTo: minsToTime(block.absTo) } })
  }

  // ── Zoom ─────────────────────────────────────────────────────────────────────

  function applyZoom(newZ: number, targetLeft?: number) {
    const el = tracksScrollRef.current; if (!el) return
    const prevW = totalW()
    const centerRatio = targetLeft === undefined ? (el.scrollLeft + el.clientWidth / 2) / prevW : undefined
    zoomRef.current = Math.max(0.18, Math.min(6, newZ))
    render(false)
    const newL = targetLeft !== undefined ? targetLeft : (centerRatio! * totalW() - el.clientWidth / 2)
    el.scrollLeft = Math.max(0, newL)
    if (headerScrollRef.current) headerScrollRef.current.scrollLeft = el.scrollLeft
    setZoomPct(Math.round(zoomRef.current * 100))
  }

  // ── Effects ──────────────────────────────────────────────────────────────────

  // Rebuild from groupSchedule on prop change
  useEffect(() => {
    anchorRef.current = getAnchor(projectDate)
    const newBlocks = buildBlocks(groups, groupSchedule, anchorRef.current)
    blocksRef.current = newBlocks
    rowsRef.current = buildRows(groups, newBlocks)
    const empty = newBlocks.length === 0
    if (empty) initialScrollDone.current = false
    setHasBlocks(!empty)
    if (!empty) {
      // requestAnimationFrame ensures React has committed the grid DOM before we write into it
      requestAnimationFrame(() => {
        const prevRangeStart = rangeRef.current.start
        render()
        if (!initialScrollDone.current) {
          // Первый показ блоков — скролим к левому краю
          initialScrollDone.current = true
          const x = Math.max(0, minToPx(Math.min(...blocksRef.current.map(b => b.absFrom))) - 80)
          if (tracksScrollRef.current) tracksScrollRef.current.scrollLeft = x
          if (headerScrollRef.current) headerScrollRef.current.scrollLeft = x
        } else {
          // Блоки уже были видны — компенсируем скрол при изменении диапазона
          const rangeShiftPx = (rangeRef.current.start - prevRangeStart) * ppm()
          if (rangeShiftPx !== 0 && tracksScrollRef.current) {
            const adj = Math.max(0, tracksScrollRef.current.scrollLeft - rangeShiftPx)
            tracksScrollRef.current.scrollLeft = adj
            if (headerScrollRef.current) headerScrollRef.current.scrollLeft = adj
          }
        }
      })
    }
  }, [JSON.stringify(groupSchedule), JSON.stringify(groups.map(g => g.id)), projectDate])

  // Apply TV preset once when planner opens for a fresh ТВ/Телерадио project
  useEffect(() => {
    if (presetApplied.current) return
    const isTv = projectFormat === 'ТВ' || projectFormat === 'Телерадио'
    if (!isTv || !projectDate) return
    const hasSchedule = groups.some(g => g.id !== 'ungrouped' && g.id !== 'default' && groupSchedule[g.id]?.timeFrom)
    if (hasSchedule) { presetApplied.current = true; return }
    presetApplied.current = true
    const anchor = getAnchor(projectDate)
    const patch: Record<string, GSEntry> = {}
    for (const g of groups) {
      if (g.id === 'ungrouped' || g.id === 'default') continue
      const p = TV_PRESET[g.id]; if (!p) continue
      const d = new Date(anchor); d.setDate(d.getDate() + p.dayOffset)
      const existing = groupSchedule[g.id] ?? {}
      patch[g.id] = { ...existing, date: d.toISOString().slice(0, 10), timeFrom: p.timeFrom, timeTo: p.timeTo }
    }
    if (Object.keys(patch).length > 0) onGroupScheduleUpdate(patch)
  }, [projectId])

  // Scroll sync
  useEffect(() => {
    const tracks = tracksScrollRef.current, header = headerScrollRef.current, names = namesScrollRef.current
    if (!tracks || !header || !names) return
    const onScroll = () => { header.scrollLeft = tracks.scrollLeft; names.scrollTop = tracks.scrollTop }
    tracks.addEventListener('scroll', onScroll, { passive: true })
    return () => tracks.removeEventListener('scroll', onScroll)
  }, [])

  // Ctrl+wheel zoom
  useEffect(() => {
    const el = tracksScrollRef.current; if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const ratio = (e.clientX - rect.left + el.scrollLeft) / totalW()
      const newZ = Math.max(0.18, Math.min(6, zoomRef.current * (e.deltaY < 0 ? 1.15 : 1 / 1.15)))
      applyZoom(newZ, ratio * totalW() - (e.clientX - rect.left))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const popupBlock = popup ? blocksRef.current.find(b => b.id === popup.bid) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Topbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderBottom: '1px solid #e2e8f0', flexShrink: 0, background: '#fafbfc' }}>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>Перетащите блок, чтобы изменить время. Клик по блоку — сменить дату.</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => applyZoom(zoomRef.current / 1.3)} style={{ width: 26, height: 26, borderRadius: 5, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 15, color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
        <span style={{ fontSize: 12, color: '#64748b', minWidth: 38, textAlign: 'center' }}>{zoomPct}%</span>
        <button onClick={() => applyZoom(zoomRef.current * 1.3)} style={{ width: 26, height: 26, borderRadius: 5, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 15, color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
      </div>

      {/* Empty state overlay — shown when no blocks, grid always mounted so refs are available */}
      {!hasBlocks && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>
          Укажите время блоков во вкладке «Команда», чтобы увидеть таймлайн
        </div>
      )}

      <div ref={plannerRef} style={{ flex: 1, display: 'grid', gridTemplateColumns: `${NAMES_W}px 1fr`, gridTemplateRows: `${headerHRef.current}px 1fr`, overflow: 'hidden', visibility: hasBlocks ? 'visible' : 'hidden', height: hasBlocks ? undefined : 0 }}>
        <div ref={cornerRef} style={{ borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'flex-end', padding: '0 14px 8px', fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em', background: '#fafbfc' }}>Специалист</div>
        <div ref={headerScrollRef} style={{ overflow: 'hidden', borderBottom: '1px solid #e2e8f0', background: '#fafbfc' }}>
          <div ref={headerInnerRef} style={{ position: 'relative' }} />
        </div>
        <div ref={namesScrollRef} style={{ overflow: 'hidden', borderRight: '1px solid #e2e8f0', background: '#fafbfc' }}>
          <div ref={namesInnerRef} />
        </div>
        <div ref={tracksScrollRef} style={{ overflow: 'auto', background: '#fff' }}>
          <div ref={tracksInnerRef} style={{ position: 'relative' }} />
        </div>
      </div>

      {/* Drag tooltip */}
      <div ref={tipRef} style={{ position: 'fixed', background: '#1e293b', border: '1px solid #475569', borderRadius: 6, padding: '4px 10px', fontSize: 12, color: '#e2e8f0', pointerEvents: 'none', display: 'none', zIndex: 1000 }} />

      {/* Block date popup */}
      {popup && popupBlock && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 299 }} onClick={() => setPopup(null)} />
          <div style={{ position: 'fixed', zIndex: 300, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px', minWidth: 200, boxShadow: '0 8px 32px rgba(0,0,0,.15)', left: Math.max(8, Math.min(popup.x - 100, window.innerWidth - 220)), top: Math.max(8, Math.min(popup.y + 10, window.innerHeight - 160)) }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: popupBlock.color, marginBottom: 10 }}>{popupBlock.label}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <button onClick={() => changeDay(-1)} style={{ background: '#f1f5f9', border: 'none', color: '#475569', width: 26, height: 26, borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>◄</button>
              <span style={{ fontSize: 13, color: '#334155', flex: 1, textAlign: 'center' }}>{dateFull(anchorRef.current, popupBlock.absFrom)}</span>
              <button onClick={() => changeDay(+1)} style={{ background: '#f1f5f9', border: 'none', color: '#475569', width: 26, height: 26, borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>►</button>
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>{minsToTime(popupBlock.absFrom)} – {minsToTime(popupBlock.absTo)}</div>
            <button onClick={() => setPopup(null)} style={{ background: '#f1f5f9', border: 'none', color: '#64748b', borderRadius: 6, padding: '5px 14px', cursor: 'pointer', fontSize: 12, width: '100%' }}>Закрыть</button>
          </div>
        </>
      )}
    </div>
  )
}
