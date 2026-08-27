import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../lib/cn'

/**
 * Нижний лист (bottom sheet, iOS-стиль): выезжает снизу, скруглённый верх, «ручка».
 * Жесты по ручке/заголовку (контент при этом свободно скроллится):
 *  - тянешь ВВЕРХ → лист раскрывается на fullHeight (видно все разделы + скролл);
 *  - тянешь ВНИЗ из раскрытого → сворачивается к height (peek);
 *  - тянешь ВНИЗ из peek → закрывается (уезжает вниз);
 *  - клик по фону / Esc → тоже закрытие СЛАЙДОМ ВНИЗ (не мгновенное исчезновение).
 * Железное правило закрытия по фону — mousedown+mouseup на самом оверлее.
 */
export function Sheet({
  open,
  onClose,
  title,
  height = '72vh',
  fullHeight = '94vh',
  children,
  className,
}: {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  /** высота «peek» (первое открытие) */
  height?: string
  /** высота при раскрытии (тянем вверх) */
  fullHeight?: string
  children?: React.ReactNode
  className?: string
}) {
  const armed = useRef(false)
  const [shown, setShown] = useState(false)     // вошёл (slide-in)
  const [closing, setClosing] = useState(false) // уезжает вниз (slide-out)
  const [expanded, setExpanded] = useState(false)
  const [drag, setDrag] = useState(0)           // px вниз во время активного жеста (для визуала)
  const startY = useRef<number | null>(null)
  const lastY = useRef(0)                        // последняя Y жеста (решение по ref, не по state — устойчиво к батчингу)
  const dragging = drag !== 0 || startY.current != null

  const close = () => { if (closing) return; setClosing(true); window.setTimeout(onClose, 240) }

  useEffect(() => {
    if (!open) return
    setShown(false); setClosing(false); setExpanded(false); setDrag(0)
    const r = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(r)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  // Жест по «ручке»/заголовку (не по контенту — чтобы не мешать его скроллу).
  const onDown = (e: React.PointerEvent) => { startY.current = e.clientY; lastY.current = e.clientY; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId) }
  const onMove = (e: React.PointerEvent) => { if (startY.current == null) return; lastY.current = e.clientY; setDrag(Math.max(-160, e.clientY - startY.current)) }
  const onUp = () => {
    if (startY.current == null) return
    const dy = lastY.current - startY.current
    startY.current = null
    setDrag(0)
    const TH = 56
    if (!expanded) { if (dy < -TH) setExpanded(true); else if (dy > TH) close() }
    else if (dy > TH) setExpanded(false)
  }

  const translateY = closing || !shown ? '100%' : `${Math.max(0, drag)}px`

  return createPortal(
    <div
      className={cn('fixed inset-0 z-[95] flex items-end justify-center bg-black/50 transition-opacity duration-200', (closing || !shown) && 'opacity-0')}
      onMouseDown={(e) => { armed.current = e.target === e.currentTarget }}
      onMouseUp={(e) => { if (armed.current && e.target === e.currentTarget) close(); armed.current = false }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn('flex w-full max-w-2xl flex-col rounded-t-[20px] border-t border-[var(--border-strong)] bg-[var(--surface)] shadow-[0_-12px_50px_-10px_rgba(0,0,0,0.6)]', className)}
        style={{
          maxHeight: expanded ? fullHeight : height,
          transform: `translateY(${translateY})`,
          transition: dragging ? 'none' : 'transform .26s cubic-bezier(0.2,0.9,0.2,1), max-height .26s ease',
        }}
      >
        {/* «ручка» + заголовок — зона жеста */}
        <div className="shrink-0 cursor-grab touch-none select-none active:cursor-grabbing" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <div className="flex justify-center pt-2.5"><span className="h-1 w-10 rounded-full bg-[var(--border-strong)]" /></div>
          {title != null && <div className="px-5 pb-2 pt-2 text-[15px] font-semibold text-[var(--text)]">{title}</div>}
        </div>
        {/* В свёрнутом виде НЕ скроллим внутри — низ обрезан, чтобы поднять весь блок вверх (drag).
            Внутренний скролл включается только когда лист раскрыт (контент выше fullHeight). */}
        <div className={cn('flex-1 overscroll-contain px-5 pb-6 pt-1', expanded ? 'overflow-y-auto' : 'overflow-hidden')}>{children}</div>
      </div>
    </div>,
    document.body,
  )
}
