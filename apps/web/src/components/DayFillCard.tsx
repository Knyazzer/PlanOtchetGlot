import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

// Инлайн-карточка «Заполнить сегодня» (ядро донора: формат + время + итог).
// Attention-подсветка незаполненного; конец дня подсвечивается после 18:00 МСК (golden 11 §1).

type DayFormat = { key: string; label: string; isWork: boolean; score: number | null }
type DayEntry = {
  id: string; date: string; dayFormat: string
  startTime: string | null; endTime: string | null; breakMin: number
  updatedAt: string
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}
function moscowHour(): number {
  const f = new Intl.DateTimeFormat('ru-RU', { hour: 'numeric', hour12: false, timeZone: 'Europe/Moscow' })
  return Number(f.format(new Date()))
}
function parseMin(t?: string | null): number | null {
  if (!t || !/^\d{2}:\d{2}$/.test(t)) return null
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
function fmtHours(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}ч ${m}м` : `${h}ч`
}

const NON_WORK_PERIOD_FORMATS = new Set(['vacation', 'sick', 'trip', 'unpaid'])

export function DayFillCard({ date = todayStr() }: { date?: string } = {}) {
  const { data: formats = [] } = useQuery<DayFormat[]>({
    queryKey: ['day-formats'],
    queryFn: () => api.get('/day-entries/formats').then(r => r.data),
    staleTime: 1000 * 60 * 60,
  })
  const { data: entries, isLoading } = useQuery<DayEntry[]>({
    queryKey: ['day-entries', date],
    queryFn: () => api.get(`/day-entries?from=${date}&to=${date}`).then(r => r.data),
  })
  const entry = entries?.[0] ?? null

  if (isLoading) return null
  // key-remount: при изменении записи форма пересоздаётся со свежими значениями
  return <DayFillForm key={entry ? `${entry.id}:${entry.updatedAt}` : `empty:${date}`} date={date} entry={entry} formats={formats} />
}

function DayFillForm({ date, entry, formats }: { date: string; entry: DayEntry | null; formats: DayFormat[] }) {
  const isToday = date === todayStr()
  const qc = useQueryClient()
  const [dayFormat, setDayFormat] = useState(entry?.dayFormat ?? '')
  const [startTime, setStartTime] = useState(entry?.startTime ?? '')
  const [endTime, setEndTime] = useState(entry?.endTime ?? '')
  const [breakMin, setBreakMin] = useState(entry?.breakMin ?? 0)
  const [dirty, setDirty] = useState(false)
  // период для нерабочих форматов (отпуск/командировка/больничный)
  const [periodTo, setPeriodTo] = useState('')
  const [keepFilled, setKeepFilled] = useState(true)

  const save = useMutation({
    mutationFn: async () => {
      if (periodTo && NON_WORK_PERIOD_FORMATS.has(dayFormat)) {
        return api.post('/day-entries/apply-period', { from: date, to: periodTo, dayFormat, keepFilled })
      }
      return api.put('/day-entries', {
        date, dayFormat,
        startTime: startTime || null,
        endTime: endTime || null,
        breakMin: Number(breakMin) || 0,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['day-entries'] })
      qc.invalidateQueries({ queryKey: ['svod'] })
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } } }
      alert(e?.response?.data?.error ?? 'Ошибка сервера')
    },
  })

  const fmt = formats.find(f => f.key === dayFormat)
  const isWork = fmt?.isWork ?? false
  const s = parseMin(startTime)
  const e = parseMin(endTime)
  const total = s != null && e != null ? Math.max(0, e - s - (Number(breakMin) || 0)) : 0

  // attention-подсветка (механика донора): формат пуст; для рабочих — пустое начало;
  // пустой конец подсвечиваем только после 18:00 МСК
  const lateNow = moscowHour() >= 18
  const needFormat = !dayFormat
  const needStart = isWork && !startTime
  const needEnd = isWork && !!startTime && !endTime && lateNow && isToday

  const attention: React.CSSProperties = { border: '1px solid #f59e0b', boxShadow: '0 0 0 3px rgba(245,158,11,0.15)' }
  const inp: React.CSSProperties = {
    background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 8,
    padding: '8px 10px', color: 'var(--text-1)', fontFamily: 'Inter,sans-serif', fontSize: 13,
    outline: 'none', boxSizing: 'border-box',
  }
  const lbl: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 6, display: 'block',
  }

  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>
          {isToday ? 'Заполнить сегодня' : 'Заполнить день'}
          <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>
            {new Date(date + 'T00:00:00').toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>
        </div>
        {entry && !dirty && (
          <span style={{ fontSize: 12, color: '#29BF12', fontWeight: 600 }}>✓ Заполнено</span>
        )}
        {dirty && (
          <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600 }}>Не забудь сохранить</span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ minWidth: 180 }}>
          <label style={lbl}>Статус</label>
          <select
            value={dayFormat}
            onChange={ev => { setDayFormat(ev.target.value); setDirty(true) }}
            style={{ ...inp, width: '100%', ...(needFormat ? attention : {}) }}
          >
            <option value="">— выбрать —</option>
            {formats.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </div>

        {isWork && (
          <>
            <div>
              <label style={lbl}>Начало</label>
              <input type="time" value={startTime} onChange={ev => { setStartTime(ev.target.value); setDirty(true) }}
                style={{ ...inp, ...(needStart ? attention : {}) }} />
            </div>
            <div>
              <label style={lbl}>Конец</label>
              <input type="time" value={endTime} onChange={ev => { setEndTime(ev.target.value); setDirty(true) }}
                style={{ ...inp, ...(needEnd ? attention : {}) }} />
            </div>
            <div>
              <label style={lbl}>Перерыв, мин</label>
              <input type="number" min={0} step={15} value={breakMin}
                onChange={ev => { setBreakMin(Number(ev.target.value)); setDirty(true) }}
                style={{ ...inp, width: 90 }} />
            </div>
            <div style={{ paddingBottom: 8, fontSize: 13, color: 'var(--text-2)' }}>
              Итого: <b style={{ color: 'var(--text-1)', fontFamily: 'monospace' }}>{total ? fmtHours(total) : '—'}</b>
            </div>
          </>
        )}

        {!isWork && dayFormat && NON_WORK_PERIOD_FORMATS.has(dayFormat) && (
          <>
            <div>
              <label style={lbl}>По дату (период)</label>
              <input type="date" value={periodTo} min={date}
                onChange={ev => { setPeriodTo(ev.target.value); setDirty(true) }} style={inp} />
            </div>
            {periodTo && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 8, fontSize: 12, color: 'var(--text-2)', cursor: 'pointer' }}>
                <input type="checkbox" checked={keepFilled} onChange={ev => setKeepFilled(ev.target.checked)} />
                Не трогать заполненные
              </label>
            )}
          </>
        )}

        <button
          onClick={() => save.mutate()}
          disabled={save.isPending || !dayFormat}
          style={{
            background: dayFormat ? 'var(--accent, #2563eb)' : 'var(--surface-3)',
            color: dayFormat ? '#fff' : 'var(--text-muted)',
            border: 'none', borderRadius: 8, padding: '9px 18px',
            fontFamily: 'Inter,sans-serif', fontSize: 13, fontWeight: 700,
            cursor: dayFormat ? 'pointer' : 'default',
          }}
        >
          {save.isPending ? 'Сохранение…' : 'Сохранить'}
        </button>
      </div>
    </div>
  )
}
