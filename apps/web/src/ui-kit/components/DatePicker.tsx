import * as Popover from '@radix-ui/react-popover'
import { DayPicker, type DateRange } from 'react-day-picker'
import { ru } from 'date-fns/locale'
import { format } from 'date-fns'
import { CalendarDays } from 'lucide-react'
import { useState } from 'react'
import { cn } from '../lib/cn'
import { Button } from './primitives'

const fmt = (d?: Date) => (d ? format(d, 'd MMM yyyy', { locale: ru }) : '')

/**
 * Единый выбор даты. Один компонент — переключатель «Даты / Диапазон» (если allowRange).
 * Календарь кастомный (react-day-picker), одинаков во всех браузерах. Из tvshifts-brandbook.
 */
export function DatePicker({
  value,
  onChange,
  allowRange = false,
  defaultMode = 'single',
  placeholder = 'Выбрать дату',
  disabled = false,
  className,
}: {
  value?: DateRange
  onChange?: (v?: DateRange) => void
  allowRange?: boolean
  defaultMode?: 'single' | 'range'
  placeholder?: string
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'single' | 'range'>(allowRange ? defaultMode : 'single')

  const label =
    mode === 'single'
      ? value?.from ? fmt(value.from) : placeholder
      : value?.from && value?.to
        ? `${fmt(value.from)} — ${fmt(value.to)}`
        : value?.from ? `${fmt(value.from)} — …` : placeholder

  const FieldBox = ({ cap, d, active }: { cap: string; d?: Date; active?: boolean }) => (
    <div className={cn('flex-1 rounded-[var(--radius-sm)] border bg-[var(--surface-2)] px-3 py-1.5', active ? 'border-[var(--accent)]' : 'border-[var(--border)]')}>
      <div className="eyebrow">{cap}</div>
      <div className={cn('mono text-[14px]', d ? 'text-[var(--text)]' : 'text-[var(--muted)]')}>{d ? format(d, 'dd.MM.yyyy') : '—'}</div>
    </div>
  )

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        disabled={disabled}
        className={cn(
          'inline-flex h-9 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] px-3 text-[14px] outline-none transition-colors hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]',
          value?.from ? 'text-[var(--text)]' : 'text-[var(--muted)]',
          disabled && 'cursor-not-allowed opacity-60 hover:border-[var(--border)]',
          className,
        )}
      >
        <CalendarDays className="h-4 w-4 text-[var(--muted)]" />
        {label}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} collisionPadding={12} className="z-[1200] max-h-[85vh] overflow-y-auto rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] p-3 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.6)]">
          {/* переключатель Даты / Диапазон */}
          {allowRange && (
            <div className="mb-3 flex gap-1 rounded-[var(--radius-sm)] bg-[var(--surface-2)] p-1">
              {(['single', 'range'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={cn(
                    'flex-1 rounded-[6px] py-1.5 text-[13px] font-medium transition-colors',
                    mode === m ? 'bg-[var(--surface-3)] text-[var(--text)]' : 'text-[var(--muted)] hover:text-[var(--text)]',
                  )}
                >
                  {m === 'single' ? 'Дата' : 'Диапазон'}
                </button>
              ))}
            </div>
          )}

          {/* поля начала/конца */}
          {mode === 'range' ? (
            <div className="mb-3 flex items-center gap-2">
              <FieldBox cap="Начало" d={value?.from} active={!value?.from || !value?.to} />
              <span className="text-[var(--muted)]">→</span>
              <FieldBox cap="Конец" d={value?.to} active={!!value?.from && !value?.to} />
            </div>
          ) : (
            <div className="mb-3"><FieldBox cap="Дата" d={value?.from} active /></div>
          )}

          {mode === 'single' ? (
            <DayPicker
              mode="single"
              locale={ru}
              weekStartsOn={1}
              selected={value?.from}
              onSelect={(d) => onChange?.(d ? { from: d, to: undefined } : undefined)}
              showOutsideDays
            />
          ) : (
            <DayPicker
              mode="range"
              numberOfMonths={1}
              locale={ru}
              weekStartsOn={1}
              selected={value}
              onSelect={onChange}
              showOutsideDays
            />
          )}

          <div className="mt-1 flex justify-end gap-2 border-t border-[var(--border)] pt-2">
            <button onClick={() => onChange?.(undefined)} className="px-2 py-1 text-[13px] text-[var(--muted)] hover:text-[var(--text)]">Сбросить</button>
            <Button size="sm" variant="primary" onClick={() => setOpen(false)}>Готово</Button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/** Совместимость: диапазонный вариант — тот же компонент с включённым range. */
export function DateRangePicker(props: Omit<Parameters<typeof DatePicker>[0], 'allowRange' | 'defaultMode'>) {
  return <DatePicker {...props} allowRange defaultMode="range" />
}
