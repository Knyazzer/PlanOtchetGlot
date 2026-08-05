// Производственный календарь РФ — перенос боевого модуля донора (В-3, golden 10).
// Праздники + правительственные переносы + авторасчёт переноса праздника с выходного.
// Без него метрика «заполненность» (раб.дни/ожидаемые) врёт в месяцы с праздниками.

const RF_PUBLIC_HOLIDAYS: Array<{ md: string; label: string }> = [
  { md: '01-01', label: 'Новый год' },
  { md: '01-02', label: 'Новогодние каникулы' },
  { md: '01-03', label: 'Новогодние каникулы' },
  { md: '01-04', label: 'Новогодние каникулы' },
  { md: '01-05', label: 'Новогодние каникулы' },
  { md: '01-06', label: 'Новогодние каникулы' },
  { md: '01-07', label: 'Рождество Христово' },
  { md: '01-08', label: 'Новогодние каникулы' },
  { md: '02-23', label: 'День защитника Отечества' },
  { md: '03-08', label: 'Международный женский день' },
  { md: '05-01', label: 'Праздник Весны и Труда' },
  { md: '05-09', label: 'День Победы' },
  { md: '06-12', label: 'День России' },
  { md: '11-04', label: 'День народного единства' },
]

// Правительственные переносы (дополняются по постановлениям; v2 — внешнее API)
const RF_GOV_DAY_OFF_TRANSFERS: Record<number, string[]> = {
  2026: ['2026-01-09', '2026-12-31'],
}

const toDateStr = (d: Date) => d.toISOString().slice(0, 10)
const isWeekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6

/** Все нерабочие даты года (кроме сб/вс): праздники + переносы (включая авторасчёт). */
export function nonWorkingDatesForYear(year: number): Set<string> {
  const dates = new Set<string>()
  for (const h of RF_PUBLIC_HOLIDAYS) dates.add(`${year}-${h.md}`)
  for (const t of RF_GOV_DAY_OFF_TRANSFERS[year] ?? []) dates.add(t)

  // авторасчёт: праздник (кроме янв. каникул) попал на выходной → переносится
  // на следующий рабочий день, не занятый другим праздником/переносом
  for (const h of RF_PUBLIC_HOLIDAYS) {
    const [month, day] = h.md.split('-').map(Number)
    if (month === 1 && day <= 8) continue
    const holiday = new Date(Date.UTC(year, month - 1, day))
    if (!isWeekend(holiday)) continue
    const target = new Date(holiday)
    for (;;) {
      target.setUTCDate(target.getUTCDate() + 1)
      const key = toDateStr(target)
      if (!isWeekend(target) && !dates.has(key)) { dates.add(key); break }
    }
  }
  return dates
}

const yearCache = new Map<number, Set<string>>()
function nonWorking(year: number): Set<string> {
  let s = yearCache.get(year)
  if (!s) { s = nonWorkingDatesForYear(year); yearCache.set(year, s) }
  return s
}

export function isWorkingDay(d: Date): boolean {
  if (isWeekend(d)) return false
  return !nonWorking(d.getUTCFullYear()).has(toDateStr(d))
}

/** Рабочие дни в диапазоне включительно — по производственному календарю РФ. */
export function businessDays(from: Date, to: Date): number {
  let count = 0
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()))
  while (d <= end) {
    if (isWorkingDay(d)) count++
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return count
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** Праздники/нерабочие (кроме сб/вс) в месяце с подписями. month0 — 0-based. */
export function holidaysInMonth(year: number, month0: number): Array<{ date: string; label: string }> {
  const nw = nonWorking(year)
  const labelByMd = new Map(RF_PUBLIC_HOLIDAYS.map(h => [h.md, h.label]))
  const last = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate()
  const res: Array<{ date: string; label: string }> = []
  for (let d = 1; d <= last; d++) {
    const md = `${pad2(month0 + 1)}-${pad2(d)}`
    const ds = `${year}-${md}`
    if (nw.has(ds)) res.push({ date: ds, label: labelByMd.get(md) ?? 'Перенос выходного' })
  }
  return res
}

/** Производственная сводка месяца: рабочие дни, выходные, праздники, норма часов (8ч/день). */
export function monthProduction(year: number, month0: number) {
  const first = new Date(Date.UTC(year, month0, 1))
  const last = new Date(Date.UTC(year, month0 + 1, 0))
  const daysInMonth = last.getUTCDate()
  const workingDays = businessDays(first, last)
  let weekendDays = 0
  for (let d = 1; d <= daysInMonth; d++) { const dt = new Date(Date.UTC(year, month0, d)); if (dt.getUTCDay() === 0 || dt.getUTCDay() === 6) weekendDays++ }
  const holidays = holidaysInMonth(year, month0)
  return { year, month: month0 + 1, daysInMonth, workingDays, weekendDays, holidays, workingHours: workingDays * 8 }
}
