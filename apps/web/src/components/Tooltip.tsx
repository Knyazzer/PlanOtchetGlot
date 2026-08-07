import { useState, useRef, useEffect, type ReactNode, type CSSProperties } from 'react'

// Фирменный тултип: оборачивает любой контент, показывает стилизованный пузырь при наведении
// (тот же вид, что у Hint — тёмная поверхность, рамка, тень). Позиционируется fixed, не обрезается.
export function Tooltip({ text, children, width, style }: { text: string; children: ReactNode; width?: number; style?: CSSProperties }) {
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const [coords, setCoords] = useState<{ top?: number; bottom?: number; left: number } | null>(null)

  function recalc() {
    if (!ref.current) return null
    const rect = ref.current.getBoundingClientRect()
    const w = width ?? Math.max(80, text.length * 8 + 22)
    const MARGIN = 10
    let left = rect.left + rect.width / 2 - w / 2
    if (left < MARGIN) left = MARGIN
    if (left + w > window.innerWidth - MARGIN) left = window.innerWidth - MARGIN - w
    const above = rect.top > 120
    return above ? { bottom: window.innerHeight - rect.top + 7, left } : { top: rect.bottom + 7, left }
  }
  useEffect(() => { setCoords(visible ? recalc() : null) }, [visible]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <span ref={ref} style={{ position: 'relative', ...style }}
      onMouseEnter={() => setVisible(true)} onMouseLeave={() => { setVisible(false); setCoords(null) }}>
      {children}
      {visible && coords && (
        <span style={{
          position: 'fixed', top: coords.top, bottom: coords.bottom, left: coords.left,
          width: width ?? Math.max(80, text.length * 8 + 22),
          background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 8,
          padding: '7px 11px', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', lineHeight: 1.4,
          zIndex: 9000, boxShadow: '0 8px 28px rgba(0,0,0,0.45)', pointerEvents: 'none', textAlign: 'center', whiteSpace: 'nowrap',
        }}>{text}</span>
      )}
    </span>
  )
}
