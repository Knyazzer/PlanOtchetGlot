import type { LucideIcon } from 'lucide-react'

/**
 * Единая обёртка иконок кита. ТОЛЬКО SVG (lucide) — рендерятся идентично во всех
 * браузерах/ОС. Эмодзи и юникод-глифы (✓ ✕ → ☀) в UI запрещены контрактом.
 * Стандартные размеры и толщина линии, цвет — currentColor (красится токеном).
 */
const SIZES = { xs: 14, sm: 16, md: 18, lg: 20, xl: 24 } as const

export function Icon({
  icon: Glyph,
  size = 'md',
  strokeWidth = 2,
  className,
}: {
  icon: LucideIcon
  size?: keyof typeof SIZES | number
  strokeWidth?: number
  className?: string
}) {
  const px = typeof size === 'number' ? size : SIZES[size]
  return <Glyph size={px} strokeWidth={strokeWidth} className={className} aria-hidden />
}
