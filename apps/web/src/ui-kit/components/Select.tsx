import * as RS from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '../lib/cn'

export interface SelectOption {
  value: string
  label: string
  tone?: string // цвет точки-статуса (опц.)
}

/**
 * Кастомный Select на Radix — выпадашка рисуется НАШИМ HTML+CSS,
 * поэтому одинакова во всех браузерах (в отличие от нативного <select>).
 */
export function Select({
  options,
  value,
  onChange,
  placeholder = 'Выберите…',
  size = 'md',
  disabled = false,
  className,
}: {
  options: SelectOption[]
  value?: string
  onChange?: (v: string) => void
  placeholder?: string
  size?: 'sm' | 'md'
  disabled?: boolean
  className?: string
}) {
  return (
    <RS.Root value={value} onValueChange={onChange} disabled={disabled}>
      <RS.Trigger
        className={cn(
          'inline-flex items-center justify-between gap-2 rounded-[var(--radius-sm)] bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] outline-none transition-colors',
          'hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] data-[placeholder]:text-[var(--muted)]',
          'disabled:opacity-60 disabled:pointer-events-none',
          size === 'sm' ? 'h-8 px-2.5 text-[13px]' : 'h-9 px-3 text-[14px]',
          className,
        )}
      >
        {/* значение в одну строку с троеточием (иначе длинный лейбл ломает высоту триггера) */}
        <span className="min-w-0 flex-1 truncate whitespace-nowrap text-left"><RS.Value placeholder={placeholder} /></span>
        <RS.Icon className="shrink-0">
          <ChevronDown className="h-4 w-4 text-[var(--muted)]" />
        </RS.Icon>
      </RS.Trigger>

      <RS.Portal>
        <RS.Content
          position="popper"
          sideOffset={6}
          className="z-[1000] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border-strong)] shadow-[0_12px_40px_-8px_rgba(0,0,0,0.6)] p-1"
        >
          <RS.Viewport className="max-h-72">
            {options.map((o) => (
              <RS.Item
                key={o.value}
                value={o.value}
                className="relative flex cursor-pointer select-none items-center gap-2 rounded-[var(--radius-sm)] py-1.5 pl-2.5 pr-8 text-[14px] text-[var(--text)] outline-none data-[highlighted]:bg-[var(--surface-2)] data-[state=checked]:text-[var(--accent)]"
              >
                {o.tone && (
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: o.tone }} />
                )}
                <RS.ItemText>{o.label}</RS.ItemText>
                <RS.ItemIndicator className="absolute right-2.5">
                  <Check className="h-4 w-4" />
                </RS.ItemIndicator>
              </RS.Item>
            ))}
          </RS.Viewport>
        </RS.Content>
      </RS.Portal>
    </RS.Root>
  )
}
