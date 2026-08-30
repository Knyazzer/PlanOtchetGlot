import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useDroppable } from '@dnd-kit/core'
import { api } from '../lib/api'
import { useMyWorkSchedule, expectedForDate } from '../lib/workSchedule'
import { dayTaskStats, type DayScopedTask } from '../lib/taskWindow'

// Вертикальная месячная сводка справа в «Мой кабинет»: строка на день, кубик = тип дня.
// Клик по дню делает кабинет дате-зависимым (задачи/план/события на выбранную дату,
// в т.ч. планирование на будущее). Навигация по месяцам — независимая от выбора.
//
// Критерий «закрытого дня» (день ≤ сегодня): РАБОЧИЙ день считается закрытым, только если он НАЧАТ
// (startTime) И ЗАВЕРШЁН (endTime) И в его окне нет незакрытых (inprogress) задач. НЕрабочий день
// (выходной/отпуск/больничный/отгул) не «закрывают» — начала/конца у него нет, поэтому зелёную
// галочку ему НЕ ставим (даже если на нём есть закрытая задача). Оранжевую точку «требуется действие»
// показываем: у рабочего дня — если он не закрыт как надо; у нерабочего — только если висят открытые задачи.

type DayFormat = { key: string; label: string; isWork: boolean; score: number | null }
type DayEntry = { id: string; date: string; dayFormat: string; place: string | null; startTime: string | null; endTime: string | null; breakMin: number }

// Цвета статусов и мест (в форматах цвета нет — маппинг по ключу).
const FMT_COLOR: Record<string, string> = {
  working: '#43b2f2', weekend: '#64748b',
  office: '#43b2f2', remote: '#22d3ee', project: '#6366f1', trip: '#7B61FF',
  vacation: '#a855f7', sick: '#F43F5E', dayoff: '#94a3b8',
}
const PLACE_LABEL: Record<string, string> = { office: 'Офис', remote: 'Удалёнка', project: 'Проект', trip: 'Командировка' }
const isPlace = (k?: string | null) => !!k && k in PLACE_LABEL
const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const pad = (n: number) => String(n).padStart(2, '0')
const parseMin = (t?: string | null): number | null => (t && /^\d{2}:\d{2}$/.test(t) ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null)
const fmtHM = (mins: number) => { const h = Math.floor(Math.abs(mins) / 60), m = Math.abs(mins) % 60; return m ? `${h}ч ${m}м` : `${h}ч` }

// Droppable-обёртка дня: цель drag'а задачи (grip в «Задачах на сегодня») на другой день —
// перенос/расширение окна дедлайна (правила — DashboardPage.onDropOnDay). Подсветка при наведении.
function DroppableDayButton({ id, style, children, ...rest }: { id: string; style: React.CSSProperties; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <button ref={setNodeRef} {...rest} style={{ ...style, ...(isOver ? { border: '1px solid var(--accent-s)', background: 'rgba(123,97,255,0.18)' } : {}) }}>
      {children}
    </button>
  )
}

const navBtn: React.CSSProperties = {
  width: 26, height: 26, borderRadius: 7, border: '1px solid var(--border)',
  background: 'var(--surface-2)', color: 'var(--text-2)', fontSize: 15, lineHeight: 1,
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'Inter,sans-serif',
}

export function MonthStrip({ selected, today, onSelect, tasks, meId }: {
  selected: string; today: string; onSelect: (d: string) => void
  tasks: DayScopedTask[]; meId: string | undefined
}) {
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
  // Отображение дня: рабочий день → метка МЕСТА; иначе → метка статуса.
  const dayView = (status: string, place: string | null): { label: string; color: string } => {
    if (status === 'working') { const p = place ?? 'office'; return { label: PLACE_LABEL[p] ?? 'Рабочий день', color: FMT_COLOR[p] ?? '#43b2f2' } }
    return { label: labelOf(status), color: FMT_COLOR[status] ?? 'var(--text-muted)' }
  }

  const shift = (delta: number) => setCursor(c => { const d = new Date(c.y, c.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() } })

  const days = Array.from({ length: lastDay }, (_, i) => i + 1)

  // ── Сводка месяца (П3/П4): отработано / норма по сегодня / баланс ──
  const isWorkKey = (k?: string) => isPlace(k) || k === 'working' || (formats.find(x => x.key === k)?.isWork ?? false)
  const schedNorm = schedule ? (() => { const s = parseMin(schedule.workStart), e = parseMin(schedule.workEnd); return s != null && e != null ? Math.max(0, e - s - schedule.breakMin) : 0 })() : 0
  let workedMin = 0, normMin = 0, weekendCount = 0
  for (const dn of days) {
    const ds = `${y}-${pad(m + 1)}-${pad(dn)}`
    const dow = new Date(y, m, dn).getDay()
    const e = byDate.get(ds)
    if (e && e.startTime && e.endTime) { const s = parseMin(e.startTime), en = parseMin(e.endTime); if (s != null && en != null) workedMin += Math.max(0, en - s - (e.breakMin || 0)) }
    const exp = expectedForDate(ds, schedule)
    if (ds <= today && exp && isWorkKey(exp.format)) normMin += schedNorm // норма только за прошедшие рабочие дни
    if (exp ? exp.format === 'weekend' : (dow === 0 || dow === 6)) weekendCount++
  }
  const balance = workedMin - normMin

  return (
    <div style={{ width: 300, flexShrink: 0, borderLeft: '1px solid var(--border)', background: 'var(--surface-1)', display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 14px 12px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
        <button onClick={() => shift(-1)} style={navBtn} title="Предыдущий месяц">‹</button>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{MONTHS[m]} {y}</div>
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
          const view = e ? dayView(e.dayFormat, e.place) : null
          const exp = expectedForDate(ds, schedule)

          // Поставлено/выполнено на день + критерий «закрытого дня» (см. комментарий над компонентом)
          const stats = dayTaskStats(tasks, meId, ds)
          const effWorking = e ? e.dayFormat === 'working' : !!exp && isPlace(exp.format)
          const started = !!e?.startTime, ended = !!e?.endTime
          const past = ds <= today
          // Рабочий день закрыт = начат И завершён И все задачи закрыты. Нерабочий не «закрывают» —
          // зелёной галочки ему нет; оранжевая точка — только если висят открытые задачи.
          const workClosed = effWorking && started && ended && stats.open === 0
          const needsAction = past && (effWorking ? !workClosed : stats.open > 0)
          const notClosedReason = stats.open > 0
            ? `${stats.open} незакрытых задач — заверните их или перенесите на другой день`
            : effWorking && !started ? 'рабочий день не начат'
            : effWorking && !ended ? 'рабочий день не завершён' : 'день не закрыт'

          // Приглушаем ТОЛЬКО по-настоящему улаженные дни: закрытый рабочий день ИЛИ отсутствие
          // (отпуск/больничный/отгул) — там действий не требуется и не совершить. ВЫХОДНОЙ серым НЕ метим:
          // в нём можно записать работу (день остаётся действием), а серый читается как «закрыто» → путает.
          // Выходной и так тише за счёт muted-надписи «Выходной». Сегодня и выбранный — не тускнеют.
          const isAbsenceDay = !!e && ['vacation', 'sick', 'dayoff'].includes(e.dayFormat)
          const dim = !isToday && !isSel && (workClosed || isAbsenceDay)

          return (
            <DroppableDayButton
              key={ds}
              id={`day:${ds}`}
              onClick={() => onSelect(ds)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                flex: '1 1 0', minHeight: 22, padding: '0 10px', borderRadius: 8,
                border: `1px solid ${isSel ? 'var(--accent-s)' : 'transparent'}`,
                background: isSel ? 'rgba(123,97,255,0.12)' : 'none',
                opacity: dim ? 0.5 : 1,
                cursor: 'pointer', fontFamily: 'Inter,sans-serif',
              }}
            >
              {/* «Сегодня» = кружок вокруг числа (тот же стиль, что выделение выбранного дня, только круг);
                  при выборе сегодняшнего дня кружок исчезает — выделение берёт на себя строка (переходящий). */}
              <span style={{
                width: 22, height: 22, boxSizing: 'border-box', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%',
                border: `1px solid ${isToday && !isSel ? 'var(--accent-s)' : 'transparent'}`,
                background: isToday && !isSel ? 'rgba(123,97,255,0.12)' : 'transparent',
                fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                color: isSel ? 'var(--text-1)' : isToday ? 'var(--accent-s)' : weekend ? 'var(--text-muted)' : 'var(--text-2)',
              }}>{dn}</span>
              <span style={{ width: 22, flexShrink: 0, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px', color: isToday ? 'var(--accent-s)' : 'var(--text-muted)' }}>{WD[dow]}</span>
              {e ? (
                <>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: view!.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{view!.label}</span>
                </>
              ) : (() => {
                // пустой день: ожидаемое из графика. Будущее — насыщенно (сплошная точка + обычный текст,
                // как заполненный день); прошлое тускнеет само (opacity строки). Иначе «выходной/не заполнен».
                if (exp && exp.format !== 'weekend') {
                  const v = dayView(isPlace(exp.format) ? 'working' : exp.format, isPlace(exp.format) ? exp.format : null)
                  return (
                    <>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: v.color, flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title="Ожидается по графику">{v.label}</span>
                    </>
                  )
                }
                return <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--text-muted)', opacity: weekend ? 0.45 : 0.75, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{weekend || exp?.format === 'weekend' ? 'выходной' : 'не заполнен'}</span>
              })()}
              {/* Столбец чипа задач — фиксированная ширина, правое выравнивание: чипы всех дней друг под другом */}
              <div style={{ width: 38, flexShrink: 0, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                {stats.total > 0 && (
                  <span title={`Задачи дня: поставлено ${stats.total}, выполнено ${stats.done}`}
                    // фон-чип рисуем ТОЛЬКО если есть незакрытые задачи (привлечь внимание); всё закрыто → просто текст
                    style={{ fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: stats.open === 0 ? 'var(--text-muted)' : 'var(--text-2)', background: stats.open > 0 ? 'var(--surface-3)' : 'transparent', borderRadius: 8, padding: '1px 6px' }}>
                    {stats.done}/{stats.total}
                  </span>
                )}
              </div>
              {/* Столбец статуса — фиксированная ширина по центру: ✓ (закрыт) / • (не закрыт) / пусто (выходной) */}
              <div style={{ width: 14, flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                {past && workClosed
                  ? <span title="День закрыт" style={{ display: 'flex' }}><Check size={13} strokeWidth={2.5} style={{ color: '#22C55E' }} /></span>
                  : needsAction
                    ? <span title={`День не закрыт: ${notClosedReason}`} style={{ width: 6, height: 6, borderRadius: '50%', background: '#F59E0B' }} />
                    : null}
              </div>
            </DroppableDayButton>
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
          <b style={{ color: Math.abs(balance) < 1 ? '#22C55E' : balance > 0 ? '#43b2f2' : '#f59e0b', fontVariantNumeric: 'tabular-nums' }}>
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