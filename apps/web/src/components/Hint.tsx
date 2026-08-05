import { useState, useRef, useEffect } from 'react'

interface HintProps {
  text: string
  width?: number
}

export function Hint({ text, width = 220 }: HintProps) {
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const [coords, setCoords] = useState<{
    top?: number; bottom?: number; left: number
  } | null>(null)

  function recalc() {
    if (!ref.current) return null
    const rect = ref.current.getBoundingClientRect()
    const MARGIN = 10
    let left = rect.left + rect.width / 2 - width / 2
    if (left < MARGIN) left = MARGIN
    if (left + width > window.innerWidth - MARGIN) left = window.innerWidth - MARGIN - width
    const above = rect.top > 120
    return above
      ? { bottom: window.innerHeight - rect.top + 7, left }
      : { top: rect.bottom + 7, left }
  }

  useEffect(() => {
    if (visible) setCoords(recalc())
    else setCoords(null)
  }, [visible])

  return (
    <span
      ref={ref}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => { setVisible(false); setCoords(null) }}
    >
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 14, height: 14, borderRadius: '50%',
          border: '1px solid var(--text-muted)',
          color: 'var(--text-muted)',
          fontSize: 12, fontWeight: 700, lineHeight: 1,
          cursor: 'default', userSelect: 'none',
          marginLeft: 4,
          opacity: 0.65,
          transition: 'opacity 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '0.65')}
      >
        i
      </span>

      {visible && coords && (
        <span
          style={{
            position: 'fixed',
            top: coords.top,
            bottom: coords.bottom,
            left: coords.left,
            width,
            background: 'var(--surface-1)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '8px 11px',
            fontSize: 12,
            color: 'var(--text-2)',
            lineHeight: 1.55,
            zIndex: 9000,
            boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
            pointerEvents: 'none',
            whiteSpace: 'normal',
          }}
        >
          {text}
        </span>
      )}
    </span>
  )
}
