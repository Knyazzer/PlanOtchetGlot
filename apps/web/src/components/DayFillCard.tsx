import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useMyWorkSchedule, expectedForDate } from '../lib/workSchedule'

// «Мой рабочий день» (A3/3, правки П2/П3): тип дня из графика (руками не выбираем),
// большая кнопка Начать/Закончить + живой таймер, автосейв (без кнопки «Сохранить»),
// баланс к норме дня (недо/переработка). Факт живёт в DayEntry.

type DayFormat = { key: string; label: string; isWork: boolean; score: number | null }
type DayEntry = {
  id: string; date: string; dayFormat: string
  startTime: string | null; endTime: string | null; breakMin: number
  updatedAt: string
}

function todayStr() { return new Date().toISOString().slice(0, 10) }
function pad(n: number) { return String(n).padStart(2, '0') }
function nowHHMM() { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
function parseMin(t?: string | null): number | null {
  if (!t || !/^\d{2}:\d{2}$/.test(t)) return null
  const [h, m] = t.split(':').map(Number); return h * 60 + m
}
function fmtHM(mins: number): string {
  const h = Math.floor(Math.abs(mins) / 60), m = Math.abs(mins) % 60
  return m ? `${h}ч ${m}м` : `${h}ч`
}

export function DayFillCard({ date = todayStr() }: { date?: string } = {}) {
  const { data: formats = [] } = useQuery<DayFormat[]>({
    queryKey: ['day-formats'],
    queryFn: () => api.get('/day-entries/formats').then(r => r.data),
    staleTime: 1000 * 60 * 60,
  })
  const { data: schedule } = useMyWorkSchedule()
  const { data: entries, isLoading } = useQuery<DayEntry[]>({
    queryKey: ['day-entries', date],
    queryFn: () => api.get(`/day-entries?from=${date}&to=${date}`).then(r => r.data),
  })
  const entry = entries?.[0] ?? null
  if (isLoading) return null
  return <WorkDayCard key={entry ? `${entry.id}:${entry.updatedAt}` : `empty:${date}`} date={date} entry={entry} formats={formats} schedule={schedule ?? null} />
}

function WorkDayCard({ date, entry, formats, schedule }: {
  date: string; entry: DayEntry | null; formats: DayFormat[]
  schedule: import('../lib/workSchedule').WorkSchedule | null
}) {
  const qc = useQueryClient()
  const isToday = date === todayStr()
  const expected = expectedForDate(date, schedule)
  const dayType = entry?.dayFormat ?? expected?.format ?? 'office'
  const fmt = formats.find(f => f.key === dayType)
  const isWork = fmt?.isWork ?? true
  const start = entry?.startTime ?? null
  const end = entry?.endTime ?? null
  const breakMin = entry?.breakMin ?? schedule?.breakMin ?? 0

  // норма дня из графика (для баланса)
  const normMin = schedule ? (() => {
    const s = parseMin(schedule.workStart), e = parseMin(schedule.workEnd)
    return s != null && e != null ? Math.max(0, e - s - schedule.breakMin) : null
  })() : null

  // живой таймер: тикаем, пока день начат и не закончен (только сегодня)
  const [, setTick] = useState(0)
  const running = !!start && !end && isToday
  useEffect(() => {
    if (!running) return
    const i = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(i)
  }, [running])

  const save = useMutation({
    mutationFn: (patch: Partial<{ dayFormat: string; startTime: string | null; endTime: string | null; breakMin: number }>) =>
      api.put('/day-entries', {
        date,
        dayFormat: patch.dayFormat ?? dayType,
        startTime: patch.startTime !== undefined ? patch.startTime : start,
        endTime: patch.endTime !== undefined ? patch.endTime : end,
        breakMin: patch.breakMin ?? breakMin,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['day-entries'] })
      qc.invalidateQueries({ queryKey: ['svod'] })
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } } }
      alert(e?.response?.data?.error ?? 'Ошибка сохранения')
    },
  })
  // снять статус/очистить день (вернуть к типу из графика)
  const deleteDay = useMutation({
    mutationFn: () => api.delete(`/day-entries/${date}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['day-entries'] }); qc.invalidateQueries({ queryKey: ['svod'] }) },
  })

  // отработано (мин): закрытый день — end−start−break; идёт — сейчас−start−break
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
  const s0 = parseMin(start)
  const worked = s0 == null ? 0
    : end != null ? Math.max(0, parseMin(end)! - s0 - breakMin)
    : isToday ? Math.max(0, nowMin - s0 - breakMin)
    : 0
  const delta = normMin != null && (end || (start && isToday)) ? worked - normMin : null

  // строка большого таймера
  const timerText = (() => {
    if (start && !end && isToday) {
      const startDt = new Date(`${date}T${start}:00`)
      const secs = Math.max(0, Math.floor((Date.now() - startDt.getTime()) / 1000))
      return `${pad(Math.floor(secs / 3600))}:${pad(Math.floor(secs / 60) % 60)}:${pad(secs % 60)}`
    }
    if (start && end) return fmtHM(worked)
    return '00:00:00'
  })()

  const wrap: React.CSSProperties = { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', width: '100%', boxSizing: 'border-box' }

  const isAbsentMarked = !!entry && !isWork   // явно отмечен нерабочий день (больничный/отпуск/выходной)
  const started = !!start
  const finished = !!start && !!end
  const startDisabled = !isToday || isAbsentMarked
  const stopDisabled = !isToday

  return (
    <div style={wrap}>
      <Header date={date} isToday={isToday} type={fmt?.label ?? dayType} typeColor={isWork ? 'var(--accent-s)' : 'var(--text-muted)'} />

      {isAbsentMarked ? (
        // Отмечено отсутствие — крупным статусом
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12 }}>
          <span style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-1)' }}>{fmt?.label ?? dayType}</span>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 12, flexWrap: 'wrap' }}>
            {/* Крупный таймер */}
            <div style={{ fontFamily: 'monospace', fontSize: 40, fontWeight: 700, letterSpacing: '1px', color: running ? 'var(--accent-s)' : 'var(--text-1)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {timerText}
            </div>
            {/* Большая кнопка — всегда видна, дизейбл когда нельзя */}
            {finished ? (
              <button disabled style={bigBtn('#8a8f98', true)}>✓ Рабочий день завершён</button>
            ) : !started ? (
              <button disabled={startDisabled} onClick={() => save.mutate({ dayFormat: isWork ? dayType : 'office', startTime: nowHHMM(), endTime: null })}
                title={startDisabled ? 'Начать можно только в текущий день' : ''} style={bigBtn('#29BF12', startDisabled)}>▶ Начать рабочий день</button>
            ) : (
              <button disabled={stopDisabled} onClick={() => save.mutate({ endTime: nowHHMM() })}
                title={stopDisabled ? 'Завершить можно только в текущий день' : ''} style={bigBtn('#E8194B', stopDisabled)}>■ Закончить рабочий день</button>
            )}
            {finished && delta != null && <BalanceBadge delta={delta} />}
          </div>

          {/* Времена (правятся вручную; автосейв) + перерыв */}
          {(started || !isToday) && (
            <div style={{ display: 'flex', gap: 16, marginTop: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <TimeField label="Начало" value={start ?? ''} onChange={v => save.mutate({ startTime: v || null })} />
              <TimeField label="Конец" value={end ?? ''} onChange={v => save.mutate({ endTime: v || null })} />
              <BreakField value={breakMin} onChange={v => save.mutate({ breakMin: v })} />
              <div style={{ paddingBottom: 6, fontSize: 13, color: 'var(--text-2)' }}>
                Отработано: <b style={{ color: 'var(--text-1)', fontFamily: 'monospace' }}>{worked ? fmtHM(worked) : '—'}</b>
                {normMin != null && <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>/ норма {fmtHM(normMin)}</span>}
              </div>
            </div>
          )}
        </>
      )}

      {/* Самостоятельный статус (§3): сотрудник сам ставит больничный/отпуск (сегодня) */}
      {isToday && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Отметить отсутствие:</span>
          {(['sick', 'vacation'] as const).map(k => {
            const label = formats.find(f => f.key === k)?.label ?? k
            const active = isAbsentMarked && dayType === k
            return (
              <button key={k}
                onClick={() => active ? deleteDay.mutate() : save.mutate({ dayFormat: k, startTime: null, endTime: null })}
                style={{ padding: '5px 12px', borderRadius: 20, border: `1px solid ${active ? '#f59e0b' : 'var(--border)'}`, background: active ? 'rgba(245,158,11,0.15)' : 'none', color: active ? '#f59e0b' : 'var(--text-3)', fontSize: 12, fontWeight: active ? 700 : 400, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                {label}{active ? ' ✕' : ''}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Header({ date, isToday, type, typeColor }: { date: string; isToday: boolean; type: string; typeColor: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>
        {isToday ? 'Мой рабочий день' : 'Рабочий день'}
        <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>
          {new Date(date + 'T00:00:00').toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: typeColor + '22', color: typeColor }}>{type}</span>
    </div>
  )
}

function BalanceBadge({ delta }: { delta: number }) {
  if (Math.abs(delta) < 1) return <span style={{ fontSize: 12, fontWeight: 700, color: '#29BF12' }}>✓ норма</span>
  const over = delta > 0
  const c = over ? '#43b2f2' : '#f59e0b'
  return (
    <span style={{ fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: c + '22', color: c }}>
      {over ? 'переработка +' : 'недоработка −'}{fmtHM(Math.abs(delta))}
    </span>
  )
}

const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 6, display: 'block' }
const inp: React.CSSProperties = { background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', color: 'var(--text-1)', fontFamily: 'Inter,sans-serif', fontSize: 13, outline: 'none', colorScheme: 'dark' }

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [v, setV] = useState(value)
  useEffect(() => { setV(value) }, [value])
  return (
    <div>
      <label style={lbl}>{label}</label>
      <input type="time" value={v} onChange={e => setV(e.target.value)} onBlur={() => { if (v !== value) onChange(v) }} style={inp} />
    </div>
  )
}
function BreakField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [v, setV] = useState(String(value))
  useEffect(() => { setV(String(value)) }, [value])
  return (
    <div>
      <label style={lbl}>Перерыв, мин</label>
      <input type="number" min={0} step={15} value={v} onChange={e => setV(e.target.value)} onBlur={() => { const n = Number(v) || 0; if (n !== value) onChange(n) }} style={{ ...inp, width: 90 }} />
    </div>
  )
}

function bigBtn(color: string, disabled?: boolean): React.CSSProperties {
  return {
    background: disabled ? 'var(--surface-3)' : color, color: disabled ? 'var(--text-muted)' : '#fff',
    border: disabled ? '1px solid var(--border)' : 'none', borderRadius: 12, padding: '14px 22px',
    fontFamily: 'Inter,sans-serif', fontSize: 15, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
    boxShadow: disabled ? 'none' : `0 6px 18px ${color}44`, opacity: disabled ? 0.7 : 1,
  }
}
