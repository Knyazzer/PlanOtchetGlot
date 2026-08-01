import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '../lib/cn'

/**
 * Боковая панель (drawer). Железное правило закрытия: клик-вне закрывает только
 * если и mousedown, и mouseup на оверлее. Esc закрывает, ✕ обязателен.
 * На мобилке — на всю ширину.
 */
export function Drawer({
  open,
  onClose,
  side = 'right',
  title,
  width = 360,
  dark = false,
  children,
}: {
  open: boolean
  onClose: () => void
  side?: 'right' | 'left'
  title?: React.ReactNode
  width?: number
  /** всегда тёмная панель (для меню-каркаса) — не зависит от темы */
  dark?: boolean
  children?: React.ReactNode
}) {
  const armed = useRef(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[95] bg-black/50"
      onMouseDown={(e) => { armed.current = e.target === e.currentTarget }}
      onMouseUp={(e) => { if (armed.current && e.target === e.currentTarget) onClose(); armed.current = false }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'absolute top-0 flex h-full max-w-full flex-col border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)] shadow-[0_0_60px_-10px_rgba(0,0,0,0.7)]',
          dark && 'sidebar-dark',
          side === 'right' ? 'right-0 border-l' : 'left-0 border-r',
        )}
        style={{ width, animation: `${side === 'right' ? 'drawerR' : 'drawerL'} 0.2s cubic-bezier(0.2,0.8,0.2,1)` }}
      >
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3.5">
          <div className="text-[15px] font-semibold text-[var(--text)]">{title}</div>
          <button onClick={onClose} className="ml-auto text-[var(--muted)] hover:text-[var(--text)]" aria-label="Закрыть"><X className="h-[18px] w-[18px]" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
