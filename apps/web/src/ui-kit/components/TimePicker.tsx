import * as Popover from '@radix-ui/react-popover'
import { Clock } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '../lib/cn'
import { Button } from './primitives'

const pad = (n: number) => String(n).padStart(2, '0')
const parse = (v?: string) => {
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(v ?? '')
  if (!m) return { h: 9, min: 0 }
  return { h: Math.min(23, +m[1]), min: Math.min(59, +m[2]) }
}

const ITEM = 36 // высота элемента колеса
const VISIBLE = 5 // видимых элементов (нечётное — центр по середине)
const PAD = ((VISIBLE - 1) / 2) * ITEM

/** Колесо с snap-центром: скролл всегда встаёт по центру, центр = выбранное. */
function Wheel({ list, value, onChange }: { list: number[]; value: number; onChange: (n: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const timer = useRef<number>(0)

  // индекс ближайшего к value элемента (value может быть не из шага — при ручном вводе)
  const nearest = (v: number) => {
    let best = 0, bd = Infinity
    list.forEach((n, i) => { const d = Math.abs(n - v); if (d < bd) { bd = d; best = i } })
    return best
  }

  // подкрутить к выбранному при монтировании/смене value извне
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = nearest(value) * ITEM
  }, [value, list])

  function onScroll() {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const el = ref.current!
      const i = Math.max(0, Math.min(list.length - 1, Math.round(el.scrollTop / ITEM)))
      if (list[i] !== value) onChange(list[i])
    }, 90)
  }

  return (
    <div className="relative" style={{ height: VISIBLE * ITEM, width: 64 }}>
      {/* центральная зона выбора */}
      <div className="pointer-events-none absolute inset-x-1 top-1/2 -translate-y-1/2 rounded-[8px] border border-[var(--accent-line)] bg-[var(--accent-soft)]" style={{ height: ITEM }} />
      <div
        ref={ref}
        onScroll={onScroll}
        className="no-scrollbar h-full snap-y snap-mandatory overflow-y-auto"
      >
        <div style={{ height: PAD }} />
        {list.map((n) => (
          <button
            key={n}
            onClick={() => onChange(n)}
            className={cn(
              'mono flex w-full snap-center items-center justify-center text-[16px] transition-colors',
              n === value ? 'font-semibold text-[var(--text)]' : 'text-[var(--muted)]',
            )}
            style={{ height: ITEM }}
          >
            {pad(n)}
          </button>
        ))}
        <div style={{ height: PAD }} />
      </div>
    </div>
  )
}

/**
 * Выбор времени: два snap-колеса (часы/минуты) без скроллбара + большой дисплей.
 * Драфт применяется по «Применить» (по стандарту диалогов). Перенос из tvshifts-brandbook.
 */
export function TimePicker({
  value,
  onChange,
  minuteStep = 5,
  placeholder = 'Время',
  className,
}: {
  value?: string
  onChange?: (v: string) => void
  minuteStep?: number
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const init = parse(value)
  const [h, setH] = useState(init.h)
  const [min, setMin] = useState(init.min)
  // сырой текст ячеек (что видно при ручном вводе; нормализуется на blur)
  const [ht, setHt] = useState(pad(init.h))
  const [mt, setMt] = useState(pad(init.min))

  useEffect(() => {
    if (open) { const p = parse(value); setH(p.h); setMin(p.min); setHt(pad(p.h)); setMt(pad(p.min)) }
  }, [open, value])

  const hours = Array.from({ length: 24 }, (_, i) => i)
  const minutes = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep)

  // колесо меняет значение → обновляем и число, и текст ячейки
  const applyH = (n: number) => { setH(n); setHt(pad(n)) }
  const applyMin = (n: number) => { setMin(n); setMt(pad(n)) }

  // ручной ввод в ячейку: только цифры, максимум 2; число обновляем, текст оставляем сырым
  const onHt = (v: string) => { const d = v.replace(/\D/g, '').slice(0, 2); setHt(d); if (d) setH(Math.min(23, +d)) }
  const onMt = (v: string) => { const d = v.replace(/\D/g, '').slice(0, 2); setMt(d); if (d) setMin(Math.min(59, +d)) }

  const apply = () => { onChange?.(`${pad(h)}:${pad(min)}`); setOpen(false) }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        className={cn(
          'inline-flex h-9 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] px-3 text-[14px] outline-none transition-colors hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]',
          value ? 'text-[var(--text)]' : 'text-[var(--muted)]',
          className,
        )}
      >
        <Clock className="h-4 w-4 text-[var(--muted)]" />
        {value || placeholder}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} onOpenAutoFocus={(e) => e.preventDefault()} className="z-[1200] w-[248px] rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] p-4 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.6)]">
          {/* две ячейки — как дисплей, но с ручным вводом (по 2 цифры) */}
          <div className="mb-3 flex items-center justify-center gap-2">
            <input
              value={ht}
              onChange={(e) => onHt(e.target.value)}
              onFocus={(e) => e.target.select()}
              onBlur={() => setHt(pad(h))}
              onKeyDown={(e) => { if (e.key === 'Enter') apply() }}
              inputMode="numeric"
              maxLength={2}
              aria-label="Часы"
              className="mono h-11 w-14 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] text-center text-[22px] font-bold text-[var(--text)] outline-none transition-colors focus:border-[var(--accent)]"
            />
            <span className="mono text-[20px] text-[var(--muted)]">:</span>
            <input
              value={mt}
              onChange={(e) => onMt(e.target.value)}
              onFocus={(e) => e.target.select()}
              onBlur={() => setMt(pad(min))}
              onKeyDown={(e) => { if (e.key === 'Enter') apply() }}
              inputMode="numeric"
              maxLength={2}
              aria-label="Минуты"
              className="mono h-11 w-14 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] text-center text-[22px] font-bold text-[var(--text)] outline-none transition-colors focus:border-[var(--accent)]"
            />
          </div>
          <div className="flex items-start justify-center gap-4">
            <div className="text-center">
              <div className="eyebrow mb-1">Часы</div>
              <Wheel list={hours} value={h} onChange={applyH} />
            </div>
            <div className="text-center">
              <div className="eyebrow mb-1">Минуты</div>
              <Wheel list={minutes} value={min} onChange={applyMin} />
            </div>
          </div>
          <div className="mt-3 flex justify-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>Отмена</Button>
            <Button variant="primary" size="sm" onClick={apply}>Применить</Button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
