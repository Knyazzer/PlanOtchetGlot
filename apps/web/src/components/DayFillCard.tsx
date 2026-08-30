import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '../lib/toast'
import { api } from '../lib/api'
import { useMyWorkSchedule, expectedForDate } from '../lib/workSchedule'
import { ROLE } from '../lib/roleColors'
import { TimePicker } from '../ui-kit/components/TimePicker'
import { Tooltip } from './Tooltip'

// «Мой рабочий день»: одна кнопка Начать/Закончить (без живого таймера). Поля появляются по стадии —
// начали → «Начало» + «Перерыв»; закончили → добавляется «Конец» + итог «Отработано». Время правится
// китовым TimePicker, перерыв — степпером. Автосейв. Факт живёт в DayEntry.

type DayFormat = { key: string; label: string; isWork: boolean; score: number | null }
type DayEntry = {
  id: string; date: string; dayFormat: string; place: string | null
  startTime: string | null; endTime: string | null; breakMin: number
  updatedAt: string
}
const PLACE_KEYS = ['office', 'remote', 'project', 'trip']
// Русские метки статусов дня — фолбэк, если статуса нет в настраиваемых форматах (напр. новый 'working')
const STATUS_LABEL: Record<string, string> = { working: 'Рабочий', weekend: 'Выходной', vacation: 'Отпуск', sick: 'Больничный', dayoff: 'Отгул' }

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
function taskWord(n: number): string {
  const mod10 = n % 10, mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'незавершённая задача'
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'незавершённые задачи'
  return 'незавершённых задач'
}

// openTasksCount — сколько МОИХ задач сегодняшнего дня всё ещё inprogress (см. DashboardPage,
// модель «окно» в lib/taskWindow). Правило «нельзя закрыть с незакрытыми — перенести»: пока их
// больше нуля, кнопка «Закончить рабочий день» заблокирована (перенос — drag на MonthStrip справа).
export function DayFillCard({ date = todayStr(), openTasksCount = 0 }: { date?: string; openTasksCount?: number } = {}) {
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
  return <WorkDayCard key={entry ? `${entry.id}:${entry.updatedAt}` : `empty:${date}`} date={date} entry={entry} formats={formats} schedule={schedule ?? null} openTasksCount={openTasksCount} />
}

function WorkDayCard({ date, entry, formats, schedule, openTasksCount }: {
  date: string; entry: DayEntry | null; formats: DayFormat[]
  schedule: import('../lib/workSchedule').WorkSchedule | null
  openTasksCount: number
}) {
  const qc = useQueryClient()
  const isToday = date === todayStr()
  // Серверный вердикт: день ещё редактируем (не залочен / админ). Под дневную модель незалоченный
  // прошлый день (напр. брошенный активный) обязан закрываться/правиться — не только сегодняшний.
  const { data: policy } = useQuery<{ canEditDay: boolean }>({
    queryKey: ['day-policy', date], queryFn: () => api.get('/day-entries/policy', { params: { date } }).then(r => r.data), staleTime: 20_000,
  })
  const expected = expectedForDate(date, schedule)
  const expectedFormat = expected?.format ?? 'office'                        // план: место (office/remote) или 'weekend'
  const expectedStatus = PLACE_KEYS.includes(expectedFormat) ? 'working' : expectedFormat
  const expectedPlace = PLACE_KEYS.includes(expectedFormat) ? expectedFormat : null
  const dayType = entry?.dayFormat ?? expectedStatus                         // СТАТУС дня
  const place = entry?.place ?? expectedPlace                               // где работает
  const fmt = formats.find(f => f.key === dayType)
  const isWork = fmt?.isWork ?? true
  const start = entry?.startTime ?? null
  const end = entry?.endTime ?? null
  const breakMin = entry?.breakMin ?? schedule?.breakMin ?? 0

  const save = useMutation({
    mutationFn: (patch: Partial<{ dayFormat: string; place: string | null; startTime: string | null; endTime: string | null; breakMin: number }>) =>
      api.put('/day-entries', {
        date,
        dayFormat: patch.dayFormat ?? dayType,
        place: patch.place !== undefined ? patch.place : place,
        startTime: patch.startTime !== undefined ? patch.startTime : start,
        endTime: patch.endTime !== undefined ? patch.endTime : end,
        breakMin: patch.breakMin ?? breakMin,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['day-entries'] })
      qc.invalidateQueries({ queryKey: ['svod'] })
      // старт/финиш дня меняет canAddTask — обновляем вердикт немедленно (иначе кнопка +/🔒 «залипала»)
      qc.invalidateQueries({ queryKey: ['day-policy'] })
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } } }
      toast(e?.response?.data?.error ?? 'Ошибка сохранения', 'info')
    },
  })
  // Сброс к расписанию: удалить override-запись дня (вернуться к плану из графика)
  const deleteDay = useMutation({
    mutationFn: () => api.delete(`/day-entries/${date}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['day-entries'] }); qc.invalidateQueries({ queryKey: ['svod'] }); qc.invalidateQueries({ queryKey: ['day-policy'] }) },
  })

  // отработано (мин): закрытый день — end−start−break; идёт — сейчас−start−break
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
  const s0 = parseMin(start)
  const e0 = parseMin(end)
  const worked = s0 == null ? 0
    : e0 != null ? Math.max(0, (e0 < s0 ? e0 + 24 * 60 : e0) - s0 - breakMin) // ночная смена: конец < начала → +сутки
    : isToday ? Math.max(0, nowMin - s0 - breakMin)
    : 0

  const started = !!start
  const finished = !!start && !!end
  // Дневная модель: править день (место/время/закрыть) можно на любом НЕзалоченном дне (сервер canEditDay),
  // не только сегодня — иначе не закрыть брошенный прошлый день. Живой старт/финиш КНОПКАМИ — только сегодня;
  // прошлый день закрывается вводом времени начала+конца прямо в поля.
  const notLocked = policy?.canEditDay ?? isToday
  // Календарный выходной (weekend) — рабочий (можно начать). Отпуск/больничный/отгул — статус-метка.
  // TODO: «работать во время отпуска/больничного» без потери статуса требует отдельного поля места (схема).
  const isAbsence = ['vacation', 'sick', 'dayoff'].includes(dayType)
  // Контролы дня отображаются ВСЕГДА (вёрстка не скачет), но на отпуске/больничном/отгуле и в залоченном — неактивны.
  const interactive = notLocked && !isAbsence
  // План (расписание) vs факт (override). Статус/место можно вернуть к расписанию.
  const placeOverridden = dayType !== expectedStatus || place !== expectedPlace
  const resetToSchedule = () => { if (started) save.mutate({ dayFormat: expectedStatus, place: expectedPlace }); else deleteDay.mutate() }
  // Подсказки: залочено → «зафиксировано»; иначе по стадии (прошлый день — время правится прямо в полях).
  const lockHint = 'Период зафиксирован — редактирование закрыто'
  const startHint = !notLocked ? lockHint : !started ? (isToday ? 'Начните рабочий день кнопкой' : 'Укажите начало') : ''
  const endHint = !notLocked ? lockHint : isToday ? (!finished ? 'Завершите рабочий день кнопкой' : '') : (!started ? 'Сначала укажите начало' : '')
  const breakHint = !notLocked ? lockHint : !started ? 'Сначала начните рабочий день' : ''

  const wrap: React.CSSProperties = { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', width: '100%', boxSizing: 'border-box' }

  return (
    <div style={wrap}>
      <Header date={date} isToday={isToday} type={fmt?.label ?? STATUS_LABEL[dayType] ?? dayType} typeColor={isWork ? 'var(--accent-s)' : 'var(--text-muted)'} />

      {/* Контролы всегда на месте (вёрстка не скачет); на отпуске/больничном/отгуле — неактивны */}
      <>
          {/* Место работы — где сотрудник работает (базово из графика; можно сменить). Детализация офисов — позже. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 2 }}>Место:</span>
            {PLACES.map(p => {
              const sel = place === p.key
              // Выбор места = где работает. В выходной выбор места = «я работал» → день становится рабочим
              // и СРАЗУ стартует (входит в цепочку, закрываешь «Завершить»). Так на выходном нет отдельной
              // зелёной «Начать»: сам выбор места — и есть запись работы. Уже начатому дню место не сбрасывает старт.
              return (
                <button key={p.key} disabled={!interactive} onClick={() => save.mutate({ place: p.key, ...(dayType === 'weekend' ? { dayFormat: 'working', ...(start ? {} : { startTime: isToday ? nowHHMM() : (schedule?.workStart ?? '10:00') }) } : {}) })}
                  title={isAbsence ? `${fmt?.label ?? dayType} — рабочий день не отмечается` : !notLocked ? lockHint : ''}
                  style={{ padding: '4px 12px', borderRadius: 20, border: `1px solid ${sel ? ROLE.primary : 'var(--border)'}`, background: sel ? ROLE.primary + '1f' : 'none', color: sel ? ROLE.primary : 'var(--text-2)', fontSize: 12, fontWeight: sel ? 700 : 500, cursor: interactive ? 'pointer' : 'not-allowed', opacity: interactive ? 1 : 0.55, fontFamily: 'Inter,sans-serif' }}>{p.label}</button>
              )
            })}
            {interactive && placeOverridden
              ? <button onClick={resetToSchedule} title="Вернуть к расписанию (план)"
                  style={{ marginLeft: 4, padding: '4px 10px', borderRadius: 20, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>↺ По расписанию</button>
              : !placeOverridden && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>по расписанию</span>}
          </div>

          {/* Фиксированная сетка — поля всегда на своих местах; активность по стадии/дате (подсказка при наведении). */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, marginTop: 14, flexWrap: 'wrap' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '96px 96px 118px 96px', gap: 18, alignItems: 'end' }}>
              <Field label="Начало" hint={startHint}>
                {/* прошлый незалоченный день — начало правится напрямую; сегодня — после кнопки «Начать» */}
                <TimePicker className="w-full" value={start ?? ''} disabled={!interactive || (isToday && !started)} onChange={v => save.mutate({ startTime: v || null })} />
              </Field>
              <Field label="Конец" hint={endHint}>
                {/* сегодня — конец после «Завершить»; прошлый день — сразу после указания начала (ввод конца закрывает день) */}
                <TimePicker className="w-full" value={end ?? ''} disabled={!interactive || (isToday ? !finished : !started)} onChange={v => save.mutate({ endTime: v || null })} />
              </Field>
              <Field label="Перерыв, мин" hint={breakHint}>
                <BreakStepper value={breakMin} disabled={!interactive || (isToday && !started)} onChange={v => save.mutate({ breakMin: v })} />
              </Field>
              <Field label="Отработано">
                <div style={{ fontSize: 20, fontWeight: 800, color: worked > 0 ? 'var(--text-1)' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', lineHeight: '38px' }}>{worked > 0 ? fmtHM(worked) : '—'}</div>
              </Field>
            </div>

            {/* Кнопки «Начать/Завершить» — ПЕРЕХОДЯЩИЕ: работают и на прошлом незакрытом РАБОЧЕМ дне
                (ретроактивное дозаполнение), не только сегодня. Порядок дней держит сервер (дневная цепочка):
                начать более поздний день, пока не закрыт ранний, он не даст. Сегодня: время = сейчас;
                прошлый день: время по графику (дальше правится в полях). Выходной задним числом — сначала
                выбери место (станет рабочим), затем «Начать». */}
            {finished ? (
              <button disabled style={bigBtn('#8a8f98', true)}>Рабочий день завершён</button>
            ) : !started ? (
              // «Начать» — только на будни/сегодня. На ЧИСТОМ выходном кнопки нет (день отдыха): запись
              // работы в выходной начинается выбором места (см. выше) — оно и стартует рабочий день.
              (isToday || dayType === 'working') ? (
                <button disabled={!interactive || (!place && dayType !== 'weekend')}
                  onClick={() => save.mutate({ startTime: isToday ? nowHHMM() : (schedule?.workStart ?? '10:00'), endTime: null, ...(dayType === 'weekend' ? { dayFormat: 'working' } : {}) })}
                  title={isAbsence ? `${fmt?.label ?? dayType} — рабочий день не отмечается` : (!place && dayType !== 'weekend') ? 'Укажите место работы, чтобы начать' : ''}
                  style={bigBtn(ROLE.success, !interactive || (!place && dayType !== 'weekend'))}>Начать рабочий день</button>
              ) : null
            ) : (
              <button disabled={!interactive}
                onClick={() => { if (openTasksCount > 0) { toast(`Нельзя закрыть день: ${openTasksCount} ${taskWord(openTasksCount)} — заверните или перенесите`, 'info'); return } save.mutate({ endTime: isToday ? nowHHMM() : (schedule?.workEnd ?? '18:30') }) }}
                style={bigBtn(ROLE.primary, !interactive)}>Закончить рабочий день</button>
            )}
          </div>

      </>
    </div>
  )
}

// Места работы (базовые). Детализация офисов (3 шт.) и «на проекте» из назначения — отдельным заходом.
const PLACES = [{ key: 'office', label: 'Офис' }, { key: 'remote', label: 'Удалёнка' }, { key: 'project', label: 'Проект' }]

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

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  // Подпись поля с нашим Tooltip (не нативный title) — объясняет, почему поле неактивно
  const lab = <label style={{ ...lbl, cursor: hint ? 'help' : 'default' }}>{label}</label>
  return <div>{hint ? <Tooltip text={hint}>{lab}</Tooltip> : lab}{children}</div>
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
