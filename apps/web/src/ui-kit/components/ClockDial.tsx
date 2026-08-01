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

/**
 * Круговой выбор диапазона времени с тумблером 12ч / 24ч внизу.
 * 24ч: весь круг = сутки, полдень сверху. 12ч: настенный циферблат (12 сверху); у ручек
 * авто-AM/PM — протаскивание через «12» переводит время между утром и вечером (непрерывной
 * дельтой). Тяни точки начала/конца или дугу; в центре — интервал и длительность (всегда 24ч).
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
  const [is12, setIs12] = useState(false)
  const start = parse(value?.start, 14 * 60)
  const end = parse(value?.end, 6 * 60)
  const dur = (end - start + 1440) % 1440 || 1440

  const svgRef = useRef<SVGSVGElement>(null)
  const mode = useRef<null | 'start' | 'end' | 'arc'>(null)
  const anchor = useRef({ start: 0, end: 0, downMin: 0, last12: 0 })

  // угол точки min (абсолютные минуты 0-1439). 24ч: полдень сверху (−720). 12ч: 12 сверху (min mod 720).
  const angle = (min: number) =>
    is12 ? ((min % 720) / 720) * 2 * Math.PI - Math.PI / 2 : ((min - 720) / 1440) * 2 * Math.PI - Math.PI / 2
  const pt = (min: number, r: number): [number, number] => [C + r * Math.cos(angle(min)), C + r * Math.sin(angle(min))]

  // дуга от fromMin до toMin по часовой; largeArc с учётом 12/24-цикла
  const arcPath = (fromMin: number, toMin: number) => {
    const [ax, ay] = pt(fromMin, R_ARC)
    const [bx, by] = pt(toMin, R_ARC)
    const d = (toMin - fromMin + 1440) % 1440 || 1440
    const large = (is12 ? d % 720 : d) > (is12 ? 360 : 720) ? 1 : 0
    return `M ${ax} ${ay} A ${R_ARC} ${R_ARC} 0 ${large} 1 ${bx} ${by}`
  }

  function rawAngle(e: PointerEvent | React.PointerEvent) {
    const rect = svgRef.current!.getBoundingClientRect()
    const scale = SIZE / rect.width
    const x = (e.clientX - rect.left) * scale - C
    const y = (e.clientY - rect.top) * scale - C
    let a = Math.atan2(y, x) + Math.PI / 2
    if (a < 0) a += 2 * Math.PI
    return a
  }
  // курсор → абсолютная минута (24ч, полдень сверху = +720) / позиция в 12ч-полукруге (0-719)
  const absMin = (a: number) => (Math.round((a / (2 * Math.PI)) * 1440 / STEP) * STEP + 720) % 1440
  const cyc12 = (a: number) => (Math.round((a / (2 * Math.PI)) * 720 / STEP) * STEP) % 720

  function onMove(e: PointerEvent) {
    if (!mode.current) return
    const a = anchor.current
    if (!is12) {
      // 24ч — абсолютное отображение курсор→время
      const m = absMin(rawAngle(e))
      if (mode.current === 'start') onChange?.({ start: toStr(m), end: toStr(a.end) })
      else if (mode.current === 'end') onChange?.({ start: toStr(a.start), end: toStr(m) })
      else {
        const d = m - a.downMin
        onChange?.({ start: toStr((a.start + d + 1440) % 1440), end: toStr((a.end + d + 1440) % 1440) })
      }
      return
    }
    // 12ч — непрерывная дельта (авто-AM/PM при переходе через 12); anchor обновляется каждый кадр
    const cm = cyc12(rawAngle(e))
    let delta = cm - a.last12
    if (delta > 360) delta -= 720
    if (delta < -360) delta += 720
    let ns = a.start, ne = a.end
    if (mode.current === 'start') ns = (a.start + delta + 1440) % 1440
    else if (mode.current === 'end') ne = (a.end + delta + 1440) % 1440
    else { ns = (a.start + delta + 1440) % 1440; ne = (a.end + delta + 1440) % 1440 }
    anchor.current = { start: ns, end: ne, downMin: a.downMin, last12: cm }
    onChange?.({ start: toStr(ns), end: toStr(ne) })
  }
  function onUp() {
    mode.current = null
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }
  function onDown(which: 'start' | 'end' | 'arc', e: React.PointerEvent) {
    e.preventDefault()
    mode.current = which
    const ra = rawAngle(e)
    anchor.current = { start, end, downMin: absMin(ra), last12: cyc12(ra) }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const [sx, sy] = pt(start, R_ARC)
  const [ex, ey] = pt(end, R_ARC)
  const ticks = is12 ? 12 : 24

  return (
    <div className="flex flex-col items-center">
      <svg ref={svgRef} viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-[300px] touch-none select-none" style={{ overflow: 'visible' }}>
        {/* трек */}
        <circle cx={C} cy={C} r={R_ARC} fill="none" strokeWidth={16} className="stroke-[var(--surface-3)]" />

        {/* подсветка рабочих часов — лёгкая акцентная дуга поверх трека */}
        {workHours && (() => {
          const ws = parse(workHours.start, 600)
          const we = parse(workHours.end, 1110)
          return <path d={arcPath(ws, we)} fill="none" strokeWidth={16} strokeLinecap="round" className="stroke-[var(--accent-soft)]" />
        })()}

        {/* риски + подписи часов */}
        {Array.from({ length: ticks }, (_, i) => {
          const min = i * 60
          const [tx1, ty1] = pt(min, R_TICK_IN)
          const [tx2, ty2] = pt(min, R_TICK_OUT)
          const [lx, ly] = pt(min, R_LABEL)
          const major = i % (is12 ? 3 : 6) === 0
          return (
            <g key={i}>
              <line x1={tx1} y1={ty1} x2={tx2} y2={ty2} strokeWidth={major ? 2 : 1} className="stroke-[var(--border-strong)]" />
              {i % 3 === 0 && (
                <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" className="mono fill-[var(--muted)]" fontSize="12">
                  {is12 ? `${i === 0 ? 12 : i}:00` : `${pad(i)}:00`}
                </text>
              )}
            </g>
          )
        })}

        {/* дуга диапазона */}
        <path d={arcPath(start, end)} fill="none" strokeWidth={16} strokeLinecap="round" className="cursor-grab stroke-[var(--accent)]" onPointerDown={(e) => onDown('arc', e)} />

        {/* центр */}
        <text x={C} y={C - 6} textAnchor="middle" className="mono fill-[var(--text)]" fontSize="23" fontWeight="700" letterSpacing="-0.5">{toStr(start)} – {toStr(end)}</text>
        <text x={C} y={C + 18} textAnchor="middle" className="fill-[var(--muted)]" fontSize="12.5">{Math.floor(dur / 60)} ч {dur % 60 ? `${dur % 60} мин` : ''}</text>

        {/* ручки */}
        {([['start', sx, sy], ['end', ex, ey]] as const).map(([id, hx, hy]) => (
          <circle key={id} cx={hx} cy={hy} r={11} strokeWidth={2.5} className="cursor-grab fill-[var(--accent)] stroke-white" onPointerDown={(e) => onDown(id, e)} />
        ))}
      </svg>

      {/* тумблер 12ч / 24ч */}
      <div className="mt-2 flex gap-1 rounded-[var(--radius-sm)] bg-[var(--surface-2)] p-1">
        {([[false, '24 ч'], [true, '12 ч']] as const).map(([v, label]) => (
          <button
            key={label}
            type="button"
            onClick={() => setIs12(v)}
            className={`rounded-[6px] px-4 py-1 text-[13px] font-medium transition-colors ${is12 === v ? 'bg-[var(--surface-3)] text-[var(--text)]' : 'text-[var(--muted)] hover:text-[var(--text)]'}`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
