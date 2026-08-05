import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { fmtMinutes } from '../lib/taskMeta'
import { Hint } from './Hint'

// Карточка дня из Свода: свой день — редактирование (формат+время), чужой — просмотр.
// Задачи дня — по Task.startDate = дата (В-1: диапазонов нет).

type DayFormat = { key: string; label: string; isWork: boolean; score: number | null }
type DayEntry = {
  id: string; date: string; dayFormat: string
  startTime: string | null; endTime: string | null; breakMin: number; updatedAt: string
}
type DayTask = {
  id: string; title: string; status: string; client: string | null
  plannedMinutes: number | null; actualMinutes: number | null
  project: { id: string; title: string } | null
}
type DayEvent = { id: string; title: string; type: string; startTime: string; endTime: string }

function parseMin(t?: string | null): number | null {
  if (!t || !/^\d{2}:\d{2}$/.test(t)) return null
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function DayModal({ userId, userName, date, isOwn, onClose }: {
  userId: string
  userName: string
  date: string // YYYY-MM-DD
  isOwn: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()

  const { data: formats = [] } = useQuery<DayFormat[]>({
    queryKey: ['day-formats'],
    queryFn: () => api.get('/day-entries/formats').then(r => r.data),
    staleTime: 1000 * 60 * 60,
  })
  const { data: entries, isLoading: entryLoading } = useQuery<DayEntry[]>({
    queryKey: ['day-entries', userId, date],
    queryFn: () => api.get(`/day-entries?from=${date}&to=${date}&userId=${userId}`).then(r => r.data),
  })
  const { data: tasks = [], isLoading: tasksLoading } = useQuery<DayTask[]>({
    queryKey: ['day-tasks', userId, date],
    queryFn: () => api.get(`/tasks?scope=team&userId=${userId}&date=${date}`).then(r => r.data),
  })
  // встречи дня — только для своего дня (Q-CAL-1, календарь-в-Свод; /events отдаёт только свои)
  const { data: events = [] } = useQuery<DayEvent[]>({
    queryKey: ['day-events', date],
    queryFn: () => api.get(`/events?from=${date}&to=${date}`).then(r => r.data),
    enabled: isOwn,
  })
  const entry = entries?.[0] ?? null

  const dateTitle = new Date(date).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 16, padding: '24px 26px', width: '100%', maxWidth: 520, maxHeight: 'calc(100vh - 48px)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', textTransform: 'capitalize' }}>{dateTitle}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{userName}{isOwn ? ' (вы)' : ''}</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', color: 'var(--text-muted)', fontSize: 16, cursor: 'pointer' }}>✕</button>
        </div>

        {entryLoading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Загрузка…</div>
        ) : (
          <DayEntryBlock key={entry ? `${entry.id}:${entry.updatedAt}` : 'empty'} entry={entry} formats={formats} date={date} isOwn={isOwn} qcInvalidate={() => {
            qc.invalidateQueries({ queryKey: ['day-entries'] })
            qc.invalidateQueries({ queryKey: ['svod'] })
          }} />
        )}

        {isOwn && events.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>
              Встречи дня · {events.length}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {events.map(ev => (
                <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-3)', flexShrink: 0 }}>{ev.startTime}–{ev.endTime}</span>
                  <span style={{ flex: 1, fontSize: 12, color: 'var(--text-1)' }}>{ev.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>
            Задачи дня {tasks.length > 0 && `· ${tasks.length}`}
          </div>
          {tasksLoading && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Загрузка…</div>}
          {!tasksLoading && tasks.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Нет задач на этот день</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {tasks.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: t.status === 'done' ? '#29BF12' : t.status === 'inprogress' ? '#0EA5E9' : '#64748b' }} />
                <span style={{ flex: 1, fontSize: 12, color: 'var(--text-1)', textDecoration: t.status === 'done' ? 'line-through' : 'none', opacity: t.status === 'done' ? 0.65 : 1 }}>
                  {t.title}
                  {(t.client || t.project) && (
                    <span style={{ color: 'var(--text-muted)', marginLeft: 6, fontSize: 12 }}>
                      {t.client}{t.client && t.project ? ' · ' : ''}{t.project?.title ?? ''}
                    </span>
                  )}
                </span>
                {(t.actualMinutes ?? t.plannedMinutes) != null && (
                  <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-3)', flexShrink: 0 }}>
                    {fmtMinutes((t.actualMinutes ?? t.plannedMinutes)!)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function DayEntryBlock({ entry, formats, date, isOwn, qcInvalidate }: {
  entry: DayEntry | null
  formats: DayFormat[]
  date: string
  isOwn: boolean
  qcInvalidate: () => void
}) {
  const [dayFormat, setDayFormat] = useState(entry?.dayFormat ?? '')
  const [startTime, setStartTime] = useState(entry?.startTime ?? '')
  const [endTime, setEndTime] = useState(entry?.endTime ?? '')
  const [breakMin, setBreakMin] = useState(entry?.breakMin ?? 0)

  const save = useMutation({
    mutationFn: () => api.put('/day-entries', {
      date, dayFormat,
      startTime: startTime || null, endTime: endTime || null,
      breakMin: Number(breakMin) || 0,
    }),
    onSuccess: qcInvalidate,
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

  const inp: React.CSSProperties = {
    background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 8,
    padding: '7px 9px', color: 'var(--text-1)', fontFamily: 'Inter,sans-serif', fontSize: 14, outline: 'none', boxSizing: 'border-box',
  }
  const lbl: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 5, display: 'block',
  }

  if (!isOwn) {
    // чужой день — просмотр
    const label = entry ? (formats.find(f => f.key === entry.dayFormat)?.label ?? entry.dayFormat) : null
    return (
      <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 14, color: 'var(--text-1)' }}>
        {entry ? (
          <>
            <b>{label}</b>
            {entry.startTime && entry.endTime && (
              <span style={{ color: 'var(--text-2)' }}> · {entry.startTime}–{entry.endTime}
                {entry.breakMin ? ` (перерыв ${entry.breakMin}м)` : ''} · итого {fmtMinutes(Math.max(0, (parseMin(entry.endTime) ?? 0) - (parseMin(entry.startTime) ?? 0) - entry.breakMin))}
              </span>
            )}
          </>
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>День не заполнен</span>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <div style={{ minWidth: 150 }}>
        <label style={{ ...lbl, display: 'flex', alignItems: 'center' }}>Статус <Hint text="Тип рабочего дня. Определяет балл, который суммируется за месяц и влияет на KPI в Аналитике." /></label>
        <select value={dayFormat} onChange={ev => setDayFormat(ev.target.value)} style={{ ...inp, width: '100%' }}>
          <option value="">— выбрать —</option>
          {formats.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
      </div>
      {isWork && (
        <>
          <div>
            <label style={lbl}>Начало</label>
            <input type="time" value={startTime} onChange={ev => setStartTime(ev.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Конец</label>
            <input type="time" value={endTime} onChange={ev => setEndTime(ev.target.value)} style={inp} />
          </div>
          <div>
            <label style={{ ...lbl, display: 'flex', alignItems: 'center' }}>Перерыв <Hint text="Длительность перерыва в минутах. Вычитается из рабочего времени при расчёте часов." /></label>
            <input type="number" min={0} step={15} value={breakMin} onChange={ev => setBreakMin(Number(ev.target.value))} style={{ ...inp, width: 76 }} />
          </div>
          <div style={{ paddingBottom: 7, fontSize: 12, color: 'var(--text-2)' }}>
            = <b style={{ fontFamily: 'monospace', color: 'var(--text-1)' }}>{total ? fmtMinutes(total) : '—'}</b>
          </div>
        </>
      )}
      <button
        onClick={() => save.mutate()}
        disabled={save.isPending || !dayFormat}
        style={{
          background: dayFormat ? 'var(--accent, #2563eb)' : 'var(--surface-3)',
          color: dayFormat ? '#fff' : 'var(--text-muted)',
          border: 'none', borderRadius: 8, padding: '8px 16px',
          fontFamily: 'Inter,sans-serif', fontSize: 12, fontWeight: 700,
          cursor: dayFormat ? 'pointer' : 'default',
        }}
      >{save.isPending ? '…' : 'Сохранить'}</button>
    </div>
  )
}
