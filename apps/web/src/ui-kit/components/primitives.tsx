import { cva, type VariantProps } from 'class-variance-authority'
import { forwardRef } from 'react'
import { cn } from '../lib/cn'

/* ── Button ─────────────────────────────────────────────────────────────── */
const button = cva(
  'inline-flex items-center justify-center gap-2 rounded-[var(--radius-sm)] font-medium whitespace-nowrap transition-colors disabled:opacity-45 disabled:pointer-events-none select-none',
  {
    variants: {
      variant: {
        primary:
          'bg-[var(--accent)] text-[var(--accent-contrast)] hover:brightness-110 active:brightness-95',
        secondary:
          'bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border)] hover:bg-[var(--surface-3)] hover:border-[var(--border-strong)]',
        ghost:
          'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]',
        danger:
          'bg-[var(--danger)] text-white hover:brightness-110',
      },
      size: {
        sm: 'h-8 px-2.5 text-[13px]',
        md: 'h-9 px-3.5 text-[14px]',
        icon: 'h-8 w-8 p-0',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(button({ variant, size }), className)} {...props} />
  ),
)
Button.displayName = 'Button'

/* ── Input ──────────────────────────────────────────────────────────────── */
export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-9 w-full rounded-[var(--radius-sm)] bg-[var(--surface-2)] border border-[var(--border)] px-3 text-[14px] text-[var(--text)] placeholder:text-[var(--muted)] outline-none transition-colors',
        'hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'

/* ── Textarea (тот же стандарт поля, многострочный) ─────────────────────── */
export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, rows = 3, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        'w-full resize-y rounded-[var(--radius-sm)] bg-[var(--surface-2)] border border-[var(--border)] px-3 py-2 text-[14px] leading-relaxed text-[var(--text)] placeholder:text-[var(--muted)] outline-none transition-colors',
        'hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]',
        className,
      )}
      {...props}
    />
  ),
)
Textarea.displayName = 'Textarea'

/* ── Card (варианты default / glass / accent) ───────────────────────────── */
export type CardVariant = 'default' | 'glass' | 'accent'
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant
  /** цвет «сущности» для accent-варианта */
  accentColor?: string
  /** верхняя цветная полоска 3px (accent-вариант) */
  strip?: boolean
  active?: boolean
}

export function Card({
  variant = 'default',
  accentColor = 'var(--accent)',
  strip = false,
  active = false,
  className,
  style,
  children,
  ...props
}: CardProps) {
  // Мобилка (< lg): full-bleed — только верх/низ границы, без боковых и скругления (карточки
  // становятся секциями во всю ширину, не «карточка в карточке»). Десктоп — полная рамка + скругление.
  const base = 'relative border-y transition-colors lg:rounded-[var(--radius)] lg:border-x'
  if (variant === 'accent') {
    return (
      <div
        className={cn(base, 'overflow-hidden', className)}
        style={{
          borderColor: `color-mix(in srgb, ${accentColor} ${active ? 55 : 28}%, transparent)`,
          background: `color-mix(in srgb, ${accentColor} ${active ? 12 : 9}%, var(--surface))`,
          ...style,
        }}
        {...props}
      >
        {strip && <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${accentColor}, color-mix(in srgb, ${accentColor} 40%, transparent))` }} />}
        {children}
      </div>
    )
  }
  if (variant === 'glass') {
    return (
      <div
        className={cn(base, 'border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_88%,transparent)]', className)}
        style={style}
        {...props}
      >
        {children}
      </div>
    )
  }
  return (
    <div className={cn(base, 'bg-[var(--surface)] border-[var(--border)]', className)} style={style} {...props}>
      {children}
    </div>
  )
}

/* ── Badge (сигнальные статусы) ─────────────────────────────────────────── */
const TONES: Record<string, string> = {
  new: 'var(--new)',
  progress: 'var(--progress)',
  closed: 'var(--closed)',
  danger: 'var(--danger)',
  accent: 'var(--accent)',
  muted: 'var(--muted)',
}

export function Badge({
  tone = 'muted',
  dot = false,
  className,
  children,
}: {
  tone?: keyof typeof TONES
  dot?: boolean
  className?: string
  children: React.ReactNode
}) {
  const c = TONES[tone]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium',
        className,
      )}
      style={{
        color: c,
        background: `color-mix(in srgb, ${c} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${c} 30%, transparent)`,
      }}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />}
      {children}
    </span>
  )
}
