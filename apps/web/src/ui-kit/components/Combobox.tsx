import * as Popover from '@radix-ui/react-popover'
import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { cn } from '../lib/cn'

// SelectOption инлайн (kit-Select тянет @radix-ui/react-select, которого в web нет; Combobox же на radix-popover).
export interface SelectOption { value: string; label: string; tone?: string; group?: string; icon?: ReactNode }

/**
 * Combobox = выпадающий список с поиском (Radix Popover + фильтруемый список). Copy-in из ui-kit.
 * Клавиатура: ↑/↓ активная опция, Enter — выбор, Esc — закрыть.
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Выберите…',
  searchPlaceholder = 'Поиск…',
  className,
}: {
  options: SelectOption[]
  value?: string
  onChange?: (v: string) => void
  placeholder?: string
  searchPlaceholder?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)

  const filtered = useMemo(
    () => options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())),
    [options, q],
  )
  const selected = options.find((o) => o.value === value)

  function pick(v: string) {
    onChange?.(v)
    setOpen(false)
    setQ('')
  }

  return (
    <Popover.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ('') }}>
      <Popover.Trigger
        className={cn(
          'inline-flex h-9 items-center justify-between gap-2 rounded-[var(--radius-sm)] bg-[var(--surface-2)] border border-[var(--border)] px-3 text-[14px] outline-none transition-colors',
          'hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]',
          selected ? 'text-[var(--text)]' : 'text-[var(--muted)]',
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5 truncate">{selected?.icon}<span className="truncate">{selected ? selected.label : placeholder}</span></span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-[var(--muted)]" />
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-[1000] w-max min-w-[var(--radix-popover-trigger-width)] max-w-[min(460px,92vw)] overflow-hidden rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border-strong)] shadow-[0_12px_40px_-8px_rgba(0,0,0,0.6)]"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
            if (e.key === 'Enter' && filtered[active]) { e.preventDefault(); pick(filtered[active].value) }
          }}
        >
          <div className="flex items-center gap-2 border-b border-[var(--border)] px-2.5">
            <Search className="h-4 w-4 text-[var(--muted)]" />
            <input
              autoFocus
              value={q}
              onChange={(e) => { setQ(e.target.value); setActive(0) }}
              placeholder={searchPlaceholder}
              className="h-9 w-full bg-transparent text-[14px] text-[var(--text)] placeholder:text-[var(--muted)] outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {filtered.length === 0 && (
              <div className="px-2.5 py-6 text-center text-[13px] text-[var(--muted)]">Ничего не найдено</div>
            )}
            {filtered.map((o, i) => {
              // Заголовок секции — когда группа опции отличается от предыдущей (группы опциональны)
              const showHeader = !!o.group && (i === 0 || filtered[i - 1].group !== o.group)
              return (
                <div key={o.value}>
                  {showHeader && (
                    <div className="px-2.5 pt-2 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">{o.group}</div>
                  )}
                  <button
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(o.value)}
                    className={cn(
                      'flex w-full items-start gap-2 rounded-[var(--radius-sm)] py-1.5 px-2.5 text-left text-[14px] leading-5 outline-none',
                      i === active ? 'bg-[var(--surface-2)]' : '',
                      o.value === value ? 'text-[var(--accent)]' : 'text-[var(--text)]',
                    )}
                  >
                    {o.tone && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: o.tone }} />}
                    {o.icon}
                    <span className="min-w-0 whitespace-normal break-words">{o.label}</span>
                    {o.value === value && <Check className="ml-auto h-4 w-4 shrink-0" />}
                  </button>
                </div>
              )
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
