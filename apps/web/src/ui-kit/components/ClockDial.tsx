import { useRef, useState } from 'react'

const SIZE = 340
const C = SIZE / 2
const R_ARC = 118
const R_TICK_IN = 130
const R_TICK_OUT = 140
const R_LABEL = 154
const STEP = 30 // шаг снапа, мин

const pad = (n: number) => String(n).padStart(2, '0')
const toStr = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`
const parse = (v?: string, def = 0) => {
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(v ?? '')
  return m ? Math.min(23, +m[1]) * 60 + Math.min(59, +m[2]) : def
}
// Полдень (12:00) сверху, полночь снизу, по часовой (смещение −720 мин = 180°) — «читается как часы».
const angle = (min: number) => ((min - 720) / 1440) * 2 * Math.PI - Math.PI / 2
const pt = (min: number, r: number) => [C + r * Math.cos(angle(min)), C + r * Math.sin(angle(min))]

/**
 * Круговой выбор диапазона времени (0–24ч). Тяни точки начала/конца или саму дугу;
 * в центре — интервал и длительность. Цвета — CSS fill/stroke (реактивны к теме).
 */
export function ClockDial({
  value,
  onChange,
  workHours,
}: {
  value?: { start: string; end: string }
  onChange?: (v: { start: string; end: string }) => void
  /** рабочие часы — подсвечиваются лёгкой дугой поверх трека (напр. {start:'10:00', end:'18:30'}) */
  workHours?: { start: string; end: string }
}) {
  const start = parse(value?.start, 14 * 60)
  const end = parse(value?.end, 6 * 60)
  const svgRef = useRef<SVGSVGElement>(null)
  const mode = useRef<null | 'start' | 'end' | 'arc'>(null)
  const anchor = useRef({ start: 0, end: 0, downMin: 0 }) // значения на момент нажатия

  const dur = (end - start + 1440) % 1440 || 1440

  function minFromEvent(e: PointerEvent | React.PointerEvent) {
    const rect = svgRef.current!.getBoundingClientRect()
    const scale = SIZE / rect.width
    const x = (e.clientX - rect.left) * scale - C
    const y = (e.clientY - rect.top) * scale - C
    let a = Math.atan2(y, x) + Math.PI / 2
    if (a < 0) a += 2 * Math.PI
    return (Math.round((a / (2 * Math.PI)) * 1440 / STEP) * STEP) % 1440
  }
  function onMove(e: PointerEvent) {
    if (!mode.current) return
    const m = minFromEvent(e)
    const a = anchor.current
    if (mode.current === 'start') onChange?.({ start: toStr(m), end: toStr(a.end) })
    else if (mode.current === 'end') onChange?.({ start: toStr(a.start), end: toStr(m) })
    else {
      const d = m - a.downMin
      onChange?.({ start: toStr((a.start + d + 1440) % 1440), end: toStr((a.end + d + 1440) % 1440) })
    }
  }
  function onUp() {
    mode.current = null
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }
  function onDown(which: 'start' | 'end' | 'arc', e: React.PointerEvent) {
    e.preventDefault()
    mode.current = which
    anchor.current = { start, end, downMin: minFromEvent(e) }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const [sx, sy] = pt(start, R_ARC)
  const [ex, ey] = pt(end, R_ARC)
  const largeArc = dur > 720 ? 1 : 0
  const arcPath = `M ${sx} ${sy} A ${R_ARC} ${R_ARC} 0 ${largeArc} 1 ${ex} ${ey}`

  return (
    <svg ref={svgRef} viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-[300px] touch-none select-none" style={{ overflow: 'visible' }}>
      {/* трек */}
      <circle cx={C} cy={C} r={R_ARC} fill="none" strokeWidth={16} className="stroke-[var(--surface-3)]" />

      {/* подсветка рабочих часов — лёгкая акцентная дуга поверх трека */}
      {workHours && (() => {
        const ws = parse(workHours.start, 600)
        const we = parse(workHours.end, 1110)
        const wdur = (we - ws + 1440) % 1440 || 1440
        const [wsx, wsy] = pt(ws, R_ARC)
        const [wex, wey] = pt(we, R_ARC)
        return <path d={`M ${wsx} ${wsy} A ${R_ARC} ${R_ARC} 0 ${wdur > 720 ? 1 : 0} 1 ${wex} ${wey}`} fill="none" strokeWidth={16} strokeLinecap="round" className="stroke-[var(--accent-soft)]" />
      })()}

      {/* риски + подписи часов */}
      {Array.from({ length: 24 }, (_, hLbl) => {
        const [tx1, ty1] = pt(hLbl * 60, R_TICK_IN)
        const [tx2, ty2] = pt(hLbl * 60, R_TICK_OUT)
        const [lx, ly] = pt(hLbl * 60, R_LABEL)
        return (
          <g key={hLbl}>
            <line x1={tx1} y1={ty1} x2={tx2} y2={ty2} strokeWidth={hLbl % 6 === 0 ? 2 : 1} className="stroke-[var(--border-strong)]" />
            {hLbl % 3 === 0 && (
              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" className="mono fill-[var(--muted)]" fontSize="12">{pad(hLbl)}:00</text>
            )}
          </g>
        )
      })}

      {/* дуга диапазона */}
      <path d={arcPath} fill="none" strokeWidth={16} strokeLinecap="round" className="cursor-grab stroke-[var(--accent)]" onPointerDown={(e) => onDown('arc', e)} />

      {/* центр */}
      <text x={C} y={C - 6} textAnchor="middle" className="mono fill-[var(--text)]" fontSize="23" fontWeight="700" letterSpacing="-0.5">{toStr(start)} – {toStr(end)}</text>
      <text x={C} y={C + 18} textAnchor="middle" className="fill-[var(--muted)]" fontSize="12.5">{Math.floor(dur / 60)} ч {dur % 60 ? `${dur % 60} мин` : ''}</text>

      {/* ручки */}
      {([['start', sx, sy], ['end', ex, ey]] as const).map(([id, hx, hy]) => (
        <circle key={id} cx={hx} cy={hy} r={11} strokeWidth={2.5} className="cursor-grab fill-[var(--accent)] stroke-white" onPointerDown={(e) => onDown(id, e)} />
      ))}
    </svg>
  )
}
