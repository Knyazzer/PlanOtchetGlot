import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useMyWorkSchedule, expectedForDate } from '../lib/workSchedule'

// Вертикальная месячная сводка справа в «Мой кабинет»: строка на день, кубик = тип дня.
// Клик по дню делает кабинет дате-зависимым (задачи/план/события на выбранную дату,
// в т.ч. планирование на будущее). Навигация по месяцам — независимая от выбора.

type DayFormat = { key: string; label: string; isWork: boolean; score: number | null }
type DayEntry = { id: string; date: string; dayFormat: string; startTime: string | null; endTime: string | null; breakMin: number }

// Цвета типов дня (в форматах цвета нет — маппинг по ключу сида).
const FMT_COLOR: Record<string, string> = {
  office: '#43b2f2', remote: '#22d3ee', shift_air: '#FF6B35', shift_edit: '#f0a63c',
  shift_prep: '#8B5CF6', trip: '#7B61FF', vacation: '#a855f7', sick: '#E8194B',
  dayoff: '#64748b', unpaid: '#94a3b8',
}
const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const pad = (n: number) => String(n).padStart(2, '0')
const parseMin = (t?: string | null): number | null => (t && /^\d{2}:\d{2}$/.test(t) ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null)
const fmtHM = (mins: number) => { const h = Math.floor(Math.abs(mins) / 60), m = Math.abs(mins) % 60; return m ? `${h}ч ${m}м` : `${h}ч` }

const navBtn: React.CSSProperties = {
  width: 26, height: 26, borderRadius: 7, border: '1px solid var(--border)',
  background: 'var(--surface-2)', color: 'var(--text-2)', fontSize: 15, lineHeight: 1,
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'Inter,sans-serif',
}

export function MonthStrip({ selected, today, onSelect }: { selected: string; today: string; onSelect: (d: string) => void }) {
  const [cursor, setCursor] = useState(() => { const [y, m] = selected.split('-').map(Number); return { y, m: m - 1 } })
  // при внешней смене месяца выбранной даты (например «Сегодня») — синхронизируем окно
  const monthKey = selected.slice(0, 7)
  useEffect(() => { const [y, m] = selected.split('-').map(Number); setCursor({ y, m: m - 1 }) }, [monthKey])

  const { y, m } = cursor
  const lastDay = new Date(y, m + 1, 0).getDate()
  const from = `${y}-${pad(m + 1)}-01`
  const to = `${y}-${pad(m + 1)}-${pad(lastDay)}`

  const { data: formats = [] } = useQuery<DayFormat[]>({
    queryKey: ['day-formats'],
    queryFn: () => api.get('/day-entries/formats').then(r => r.data),
    staleTime: 1000 * 60 * 60,
  })
  const { data: entries = [] } = useQuery<DayEntry[]>({
    queryKey: ['day-entries', from, to],
    queryFn: () => api.get(`/day-entries?from=${from}&to=${to}`).then(r => r.data),
  })
  const { data: schedule } = useMyWorkSchedule()
  const byDate = new Map(entries.map(e => [e.date.slice(0, 10), e]))
  const labelOf = (k: string) => formats.find(f => f.key === k)?.label ?? k

  const shift = (delta: number) => setCursor(c => { const d = new Date(c.y, c.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() } })

  const days = Array.from({ length: lastDay }, (_, i) => i + 1)

  // ── Сводка месяца (П3/П4): отработано / норма по сегодня / баланс ──
  const isWorkKey = (k?: string) => { const f = formats.find(x => x.key === k); return f ? f.isWork : false }
  const schedNorm = schedule ? (() => { const s = parseMin(schedule.workStart), e = parseMin(schedule.workEnd); return s != null && e != null ? Math.max(0, e - s - schedule.breakMin) : 0 })() : 0
  let workedMin = 0, normMin = 0, weekendCount = 0
  for (const dn of days) {
    const ds = `${y}-${pad(m + 1)}-${pad(dn)}`
    const dow = new Date(y, m, dn).getDay()
    const e = byDate.get(ds)
    if (e && e.startTime && e.endTime) { const s = parseMin(e.startTime), en = parseMin(e.endTime); if (s != null && en != null) workedMin += Math.max(0, en - s - (e.breakMin || 0)) }
    const exp = expectedForDate(ds, schedule)
    if (ds <= today && exp && isWorkKey(exp.format)) normMin += schedNorm // норма только за прошедшие рабочие дни
    if (exp ? exp.format === 'dayoff' : (dow === 0 || dow === 6)) weekendCount++
  }
  const balance = workedMin - normMin

  return (
    <div style={{ width: 300, flexShrink: 0, borderLeft: '1px solid var(--border)', background: 'var(--surface-1)', display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 14px 12px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
        <button onClick={() => shift(-1)} style={navBtn} title="Предыдущий месяц">‹</button>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{MONTHS[m]} {y}</div>
        <button onClick={() => shift(1)} style={navBtn} title="Следующий месяц">›</button>
      </div>

      {/* весь месяц по вертикали — строки распределяются по высоте, без скролла */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '6px 8px', display: 'flex', flexDirection: 'column' }}>
        {days.map(dn => {
          const ds = `${y}-${pad(m + 1)}-${pad(dn)}`
          const dow = new Date(y, m, dn).getDay()
          const weekend = dow === 0 || dow === 6
          const e = byDate.get(ds)
          const isSel = ds === selected
          const isToday = ds === today
          const color = e ? (FMT_COLOR[e.dayFormat] ?? 'var(--text-muted)') : null
          return (
            <button
              key={ds}
              onClick={() => onSelect(ds)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                flex: '1 1 0', minHeight: 22, padding: '0 10px', borderRadius: 8,
                border: `1px solid ${isSel ? 'var(--accent-s)' : 'transparent'}`,
                background: isSel ? 'rgba(255,107,53,0.12)' : 'none',
                cursor: 'pointer', fontFamily: 'Inter,sans-serif',
              }}
            >
              <span style={{ width: 22, flexShrink: 0, textAlign: 'right', fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: isSel ? 'var(--text-1)' : weekend ? 'var(--text-muted)' : 'var(--text-2)' }}>{dn}</span>
              <span style={{ width: 22, flexShrink: 0, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px', color: isToday ? 'var(--accent-s)' : 'var(--text-muted)' }}>{WD[dow]}</span>
              {e ? (
                <>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: color!, flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{labelOf(e.dayFormat)}</span>
                </>
              ) : (() => {
                // пустой день: ожидаемый тип из графика (полый кубик, бледно) либо «выходной/не заполнен»
                const exp = expectedForDate(ds, schedule)
                if (exp && exp.format !== 'dayoff') {
                  const ec = FMT_COLOR[exp.format] ?? 'var(--text-muted)'
                  return (
                    <>
                      <span style={{ width: 8, height: 8, borderRadius: 2, border: `1.5px solid ${ec}`, opacity: 0.6, flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--text-muted)', opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title="Ожидается по графику">{labelOf(exp.format)}</span>
                    </>
                  )
                }
                return <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--text-muted)', opacity: weekend ? 0.45 : 0.75, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{weekend || exp?.format === 'dayoff' ? 'выходной' : 'не заполнен'}</span>
              })()}
              {isToday && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-s)', flexShrink: 0 }} title="Сегодня" />}
            </button>
          )
        })}
      </div>

      {/* Сводка месяца: часы + баланс + выходные (П3/П4/П5) */}
      <div style={{ flexShrink: 0, borderTop: '1px solid var(--border)', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 5, fontFamily: 'Inter,sans-serif' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
          <span style={{ color: 'var(--text-muted)' }}>Отработано</span>
          <b style={{ color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>{fmtHM(workedMin)}</b>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
          <span style={{ color: 'var(--text-muted)' }}>Норма (по сегодня)</span>
          <span style={{ color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>{fmtHM(normMin)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
          <span style={{ color: 'var(--text-muted)' }}>Баланс</span>
          <b style={{ color: Math.abs(balance) < 1 ? '#29BF12' : balance > 0 ? '#43b2f2' : '#f59e0b', fontVariantNumeric: 'tabular-nums' }}>
            {Math.abs(balance) < 1 ? 'в норме' : `${balance > 0 ? '+' : '−'}${fmtHM(balance)}`}
          </b>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
          <span>Выходных в месяце</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{weekendCount}</span>
        </div>
      </div>
    </div>
  )
}
