import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay } from 'date-fns'
import { ru } from 'date-fns/locale'
import { api } from '../lib/api'
import { useCurrentUser } from '../hooks/useAuth'

type CalendarEvent = {
  id: string
  title: string
  date: string
  timeFrom: string | null
  timeTo: string | null
  deptId: string | null
  isGlobal: boolean
  creatorId: string
  creator: { id: string; fullName: string }
  participants: { userId: string; user: { id: string; fullName: string } }[]
}

interface CreateForm {
  title: string
  date: string
  timeFrom: string
  timeTo: string
  isGlobal: boolean
  participantIds: string[]
}

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

function mondayIndex(date: Date) {
  const d = getDay(date)
  return d === 0 ? 6 : d - 1
}

export function EventCalendar({ deptId }: { deptId: string }) {
  const user = useCurrentUser()
  const qc = useQueryClient()
  const [month, setMonth] = useState(() => new Date())
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<CreateForm>({
    title: '', date: '', timeFrom: '', timeTo: '', isGlobal: false, participantIds: [],
  })

  const from = format(startOfMonth(month), 'yyyy-MM-dd')
  const to   = format(endOfMonth(month),   'yyyy-MM-dd')

  const { data: events = [] } = useQuery<CalendarEvent[]>({
    queryKey: ['calendar-events', deptId, from, to],
    queryFn: () => api.get(`/calendar/events?deptId=${deptId}&from=${from}&to=${to}`).then((r) => r.data),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })

  const { data: members = [] } = useQuery<{ id: string; user: { id: string; fullName: string } }[]>({
    queryKey: ['dept-members', deptId],
    queryFn: () => api.get(`/departments/${deptId}/members`).then((r) => r.data),
  })

  const createEvent = useMutation({
    mutationFn: (data: Partial<CreateForm> & { date: string; title: string }) =>
      api.post('/calendar/events', { ...data, deptId }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar-events', deptId] })
      setShowCreate(false)
      setForm({ title: '', date: '', timeFrom: '', timeTo: '', isGlobal: false, participantIds: [] })
    },
  })

  const deleteEvent = useMutation({
    mutationFn: (id: string) => api.delete(`/calendar/events/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar-events', deptId] }),
  })

  const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) })
  const firstOffset = mondayIndex(days[0])

  const eventsByDay = new Map<string, CalendarEvent[]>()
  for (const ev of events) {
    const key = ev.date.slice(0, 10)
    if (!eventsByDay.has(key)) eventsByDay.set(key, [])
    eventsByDay.get(key)!.push(ev)
  }

  const selectedEvents = selectedDay
    ? (eventsByDay.get(format(selectedDay, 'yyyy-MM-dd')) ?? [])
    : []

  function prevMonth() { setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1)) }
  function nextMonth() { setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1)) }

  function openCreate(day: Date) {
    setForm((f) => ({ ...f, date: format(day, 'yyyy-MM-dd') }))
    setShowCreate(true)
  }

  return (
    <div style={{ padding: 24, display: 'flex', gap: 24, height: '100%', boxSizing: 'border-box' }}>
      {/* Month grid */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <button onClick={prevMonth} style={{ border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', width: 32, height: 32, cursor: 'pointer', fontSize: 16 }}>‹</button>
          <span style={{ fontWeight: 700, fontSize: 18, color: '#1e293b', minWidth: 180, textAlign: 'center' }}>
            {format(month, 'LLLL yyyy', { locale: ru })}
          </span>
          <button onClick={nextMonth} style={{ border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', width: 32, height: 32, cursor: 'pointer', fontSize: 16 }}>›</button>
          <button
            onClick={() => { setSelectedDay(null); setShowCreate(true); setForm((f) => ({ ...f, date: format(new Date(), 'yyyy-MM-dd') })) }}
            style={{ marginLeft: 'auto', padding: '6px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            + Событие
          </button>
        </div>

        {/* Weekday labels */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
          {WEEKDAYS.map((d) => (
            <div key={d} style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#94a3b8', padding: '4px 0' }}>{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
          {Array.from({ length: firstOffset }).map((_, i) => (
            <div key={`off-${i}`} />
          ))}
          {days.map((day) => {
            const key  = format(day, 'yyyy-MM-dd')
            const evs  = eventsByDay.get(key) ?? []
            const isSelected = selectedDay ? isSameDay(day, selectedDay) : false
            const isToday = isSameDay(day, new Date())

            return (
              <div
                key={key}
                onClick={() => setSelectedDay(isSelected ? null : day)}
                style={{
                  minHeight: 72, border: `1px solid ${isSelected ? '#2563eb' : '#e2e8f0'}`,
                  borderRadius: 6, padding: '4px 6px', cursor: 'pointer',
                  background: isSelected ? '#eff6ff' : '#fff',
                  boxShadow: isSelected ? '0 0 0 2px #bfdbfe' : 'none',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: isToday ? 700 : 400, color: isToday ? '#2563eb' : '#374151', marginBottom: 4 }}>
                  {day.getDate()}
                </div>
                {evs.slice(0, 3).map((ev) => (
                  <div key={ev.id} style={{
                    fontSize: 11, background: ev.isGlobal ? '#fef9c3' : '#dbeafe',
                    color: ev.isGlobal ? '#854d0e' : '#1e40af',
                    borderRadius: 3, padding: '1px 4px', marginBottom: 2,
                    overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                  }}>
                    {ev.title}
                  </div>
                ))}
                {evs.length > 3 && (
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>+{evs.length - 3}</div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Side panel */}
      <div style={{ width: 280, flexShrink: 0 }}>
        {showCreate ? (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, color: '#1e293b' }}>Новое событие</div>
            <input
              placeholder="Название"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14, marginBottom: 10, boxSizing: 'border-box' }}
            />
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14, marginBottom: 10, boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input type="time" value={form.timeFrom} onChange={(e) => setForm((f) => ({ ...f, timeFrom: e.target.value }))}
                placeholder="С" style={{ flex: 1, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14 }} />
              <input type="time" value={form.timeTo} onChange={(e) => setForm((f) => ({ ...f, timeTo: e.target.value }))}
                placeholder="До" style={{ flex: 1, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14 }} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Участники</div>
              <div style={{ maxHeight: 120, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6, padding: 6 }}>
                {members.map((m) => (
                  <label key={m.user.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0', cursor: 'pointer', fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={form.participantIds.includes(m.user.id)}
                      onChange={(e) => setForm((f) => ({
                        ...f,
                        participantIds: e.target.checked
                          ? [...f.participantIds, m.user.id]
                          : f.participantIds.filter((id) => id !== m.user.id),
                      }))}
                    />
                    {m.user.fullName}
                  </label>
                ))}
                {members.length === 0 && <div style={{ color: '#94a3b8', fontSize: 12 }}>Нет участников</div>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => createEvent.mutate({ title: form.title, date: form.date, timeFrom: form.timeFrom || undefined, timeTo: form.timeTo || undefined, isGlobal: form.isGlobal, participantIds: form.participantIds })}
                disabled={!form.title || !form.date || createEvent.isPending}
                style={{ flex: 1, padding: '8px 0', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
              >
                Создать
              </button>
              <button
                onClick={() => setShowCreate(false)}
                style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 13 }}
              >
                Отмена
              </button>
            </div>
          </div>
        ) : selectedDay ? (
          <div>
            <div style={{ fontWeight: 600, fontSize: 15, color: '#1e293b', marginBottom: 12 }}>
              {format(selectedDay, 'd MMMM', { locale: ru })}
            </div>
            {selectedEvents.length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: 13 }}>Нет событий</div>
            ) : (
              selectedEvents.map((ev) => (
                <div key={ev.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px', marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b', marginBottom: 4 }}>{ev.title}</div>
                  {(ev.timeFrom || ev.timeTo) && (
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                      {ev.timeFrom}{ev.timeTo ? ` — ${ev.timeTo}` : ''}
                    </div>
                  )}
                  {ev.isGlobal && (
                    <span style={{ fontSize: 11, background: '#fef9c3', color: '#854d0e', borderRadius: 4, padding: '2px 6px', marginBottom: 6, display: 'inline-block' }}>
                      Глобальное
                    </span>
                  )}
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
                    {ev.creator.fullName}
                  </div>
                  {ev.participants.length > 0 && (
                    <div style={{ fontSize: 12, color: '#475569' }}>
                      {ev.participants.map((p) => p.user.fullName).join(', ')}
                    </div>
                  )}
                  {ev.creatorId === user?.id && (
                    <button
                      onClick={() => deleteEvent.mutate(ev.id)}
                      disabled={deleteEvent.isPending}
                      style={{ marginTop: 8, fontSize: 11, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      Удалить
                    </button>
                  )}
                </div>
              ))
            )}
            <button
              onClick={() => openCreate(selectedDay)}
              style={{ marginTop: 8, width: '100%', padding: '8px 0', border: '1px dashed #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#64748b', fontSize: 13 }}
            >
              + Добавить событие
            </button>
          </div>
        ) : (
          <div style={{ color: '#94a3b8', fontSize: 13, paddingTop: 8 }}>
            Выберите день для просмотра событий
          </div>
        )}
      </div>
    </div>
  )
}
