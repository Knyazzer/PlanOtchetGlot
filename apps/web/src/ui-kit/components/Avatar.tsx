import { cn } from '../lib/cn'

const SIZES = { sm: 20, md: 24, lg: 32 }

/**
 * Аватар с инициалами. Цвет — задаётся или стабильно выводится из имени.
 * nativeTitle=false отключает нативный `title` — когда подпись отдаётся
 * каноничному <Tooltip> (иначе всплывают два тултипа: системный и китовый).
 */
export function Avatar({
  name,
  color,
  size = 'md',
  px: pxOverride,
  className,
  nativeTitle = true,
}: {
  name: string
  color?: string
  size?: keyof typeof SIZES
  /** точный диаметр в px (переопределяет size) — для крупных аватаров в панели профиля */
  px?: number
  className?: string
  nativeTitle?: boolean
}) {
  const px = pxOverride ?? SIZES[size]
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
  const bg = color ?? PALETTE[hash(name) % PALETTE.length]
  return (
    <span
      className={cn('inline-grid shrink-0 place-items-center rounded-full font-bold text-white select-none', className)}
      // lineHeight:1 убирает наследуемую высоту строки; лёгкий paddingTop опускает капсы в
      // оптический центр (без него инициалы «залипают» вверху из-за пустого места под базовой линией).
      style={{ width: px, height: px, background: bg, fontSize: px * 0.4, lineHeight: 1, paddingTop: px * 0.045 }}
      {...(nativeTitle ? { title: name } : {})}
    >
      {initials}
    </span>
  )
}

const PALETTE = ['#5b8cff', '#22c3d6', '#f0a63c', '#f4497e', '#8b5cf6', '#46b884']
function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}
