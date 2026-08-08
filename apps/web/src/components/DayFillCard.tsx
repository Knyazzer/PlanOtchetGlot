import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useMyWorkSchedule, expectedForDate } from '../lib/workSchedule'
import { ROLE } from '../lib/roleColors'
import { TimePicker } from '../ui-kit/components/TimePicker'

// «Мой рабочий день»: одна кнопка Начать/Закончить (без живого таймера). Поля появляются по стадии —
// начали → «Начало» + «Перерыв»; закончили → добавляется «Конец» + итог «Отработано». Время правится
// китовым TimePicker, перерыв — степпером. Автосейв. Факт живёт в DayEntry.

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
  // отработано (мин): закрытый день — end−start−break; идёт — сейчас−start−break
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
  const s0 = parseMin(start)
  const worked = s0 == null ? 0
    : end != null ? Math.max(0, parseMin(end)! - s0 - breakMin)
    : isToday ? Math.max(0, nowMin - s0 - breakMin)
    : 0

  const isAbsentMarked = !!entry && !isWork   // нерабочий день (больничный/отпуск) — ставится в отдельном функционале
  const started = !!start
  const finished = !!start && !!end
  // Редактировать факт можно только в текущий день; прошлые/будущие — только просмотр.
  const canEdit = isToday

  const wrap: React.CSSProperties = { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', width: '100%', boxSizing: 'border-box' }

  return (
    <div style={wrap}>
      <Header date={date} isToday={isToday} type={fmt?.label ?? dayType} typeColor={isWork ? 'var(--accent-s)' : 'var(--text-muted)'} />

      {isAbsentMarked ? (
        // День отмечен как отсутствие — крупным статусом (управление — в разделе заявок/отсутствий)
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12 }}>
          <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-1)' }}>{fmt?.label ?? dayType}</span>
        </div>
      ) : (
        // Все элементы показаны всегда; активность зависит от стадии и от того, текущий ли день.
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, marginTop: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 18, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <Field label="Начало">
              <TimePicker value={start ?? ''} disabled={!canEdit} onChange={v => save.mutate({ startTime: v || null })} />
            </Field>
            <Field label="Конец">
              <TimePicker value={end ?? ''} disabled={!canEdit || !started} onChange={v => save.mutate({ endTime: v || null })} />
            </Field>
            <Field label="Перерыв, мин">
              <BreakStepper value={breakMin} disabled={!canEdit || !started} onChange={v => save.mutate({ breakMin: v })} />
            </Field>
            <Field label="Отработано">
              <div style={{ fontSize: 20, fontWeight: 800, color: worked > 0 ? 'var(--text-1)' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', lineHeight: '38px' }}>{worked > 0 ? fmtHM(worked) : '—'}</div>
            </Field>
          </div>

          {/* Кнопка действия — одинаковый размер во всех стадиях (стабильное выравнивание) */}
          {finished ? (
            <button disabled style={bigBtn('#8a8f98', true)}>Рабочий день завершён</button>
          ) : !started ? (
            <button disabled={!canEdit} onClick={() => save.mutate({ dayFormat: isWork ? dayType : 'office', startTime: nowHHMM(), endTime: null })}
              title={!canEdit ? 'Начать можно только в текущий день' : ''} style={bigBtn(ROLE.success, !canEdit)}>Начать рабочий день</button>
          ) : (
            <button disabled={!canEdit} onClick={() => save.mutate({ endTime: nowHHMM() })}
              title={!canEdit ? 'Завершить можно только в текущий день' : ''} style={bigBtn(ROLE.primary, !canEdit)}>Закончить рабочий день</button>
          )}
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

const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 6, display: 'block' }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={lbl}>{label}</label>{children}</div>
}

// Перерыв — степпер в дизайн-системе (не нативный number-spinner)
function BreakStepper({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const stepBtn: React.CSSProperties = { width: 34, height: 36, border: 'none', background: 'none', color: disabled ? 'var(--text-muted)' : 'var(--text-2)', fontSize: 20, lineHeight: 1, cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }
  const set = (n: number) => { if (!disabled) onChange(Math.max(0, n)) }
  return (
    <div style={{ display: 'flex', alignItems: 'center', height: 36, background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', opacity: disabled ? 0.5 : 1 }}>
      <button onClick={() => set(value - 5)} disabled={disabled} title="−5 мин" style={stepBtn}>−</button>
      <span style={{ minWidth: 40, textAlign: 'center', fontSize: 14, fontWeight: 600, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      <button onClick={() => set(value + 5)} disabled={disabled} title="+5 мин" style={stepBtn}>+</button>
    </div>
  )
}

function bigBtn(color: string, disabled?: boolean): React.CSSProperties {
  return {
    background: disabled ? 'var(--surface-3)' : color, color: disabled ? 'var(--text-muted)' : '#fff',
    border: disabled ? '1px solid var(--border)' : 'none', borderRadius: 10, padding: '11px 22px',
    fontFamily: 'Inter,sans-serif', fontSize: 15, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
    boxShadow: disabled ? 'none' : `0 6px 18px ${color}44`, opacity: disabled ? 0.7 : 1, whiteSpace: 'nowrap',
    minWidth: 230, textAlign: 'center',
  }
}
