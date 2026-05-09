import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, eachDayOfInterval, isSameDay } from 'date-fns'
import { ru } from 'date-fns/locale'
import { useAuthStore } from '../stores/auth'
import { api } from '../lib/api'

const STUDIOS = [
  { key: 'znamyanka_kamin',  label: 'Знаменка Камин' },
  { key: 'znamyanka_black',  label: 'Знаменка Чёрная' },
  { key: 'znamyanka_kupol',  label: 'Знаменка Купол' },
  { key: 'romanov',          label: 'Романов' },
] as const

type StudioKey = typeof STUDIOS[number]['key']

const STATUS_COLORS: Record<string, string> = {
  preliminary: '#f59e0b',
  confirmed:   '#16a34a',
  blocked:     '#dc2626',
}

const STATUS_LABELS: Record<string, string> = {
  preliminary: 'Предварительно',
  confirmed:   'Подтверждено',
  blocked:     'Заблокировано',
}

interface Booking {
  id: string
  studio: string
  title: string
  date: string
  timeFrom?: string
  timeTo?: string
  status: string
  creator: { id: string; fullName: string }
}

const emptyForm = { title: '', date: '', timeFrom: '', timeTo: '' }

export default function StudioCalendar() {
  const user    = useAuthStore((s) => s.user)
  const qc      = useQueryClient()
  const isAdmin = user?.roles?.includes('admin') || user?.permissions?.includes('departments:manage')

  const [studio, setStudio]       = useState<StudioKey>('znamyanka_kamin')
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [showForm, setShowForm]   = useState(false)
  const [form, setForm]           = useState(emptyForm)

  const from = format(weekStart, 'yyyy-MM-dd')
  const to   = format(endOfWeek(weekStart, { weekStartsOn: 1 }), 'yyyy-MM-dd')

  const { data: bookings = [] } = useQuery<Booking[]>({
    queryKey: ['studio-slots', studio, from, to],
    queryFn:  () => api.get(`/studios/slots?studio=${studio}&from=${from}&to=${to}`).then((r) => r.data),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })

  const createMutation = useMutation({
    mutationFn: (body: typeof form & { studio: StudioKey }) =>
      api.post('/studios/book', body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['studio-slots', studio] })
      setShowForm(false)
      setForm(emptyForm)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/studios/bookings/${id}`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['studio-slots', studio] }),
  })

  const blockMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      api.patch(`/studios/bookings/${id}/block`, { reason }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['studio-slots', studio] }),
  })

  const days = eachDayOfInterval({
    start: weekStart,
    end:   endOfWeek(weekStart, { weekStartsOn: 1 }),
  })

  const bookingsForDay = (day: Date) =>
    bookings.filter((b) => isSameDay(new Date(b.date), day))

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Студии</h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          style={{
            background: '#2563eb', color: '#fff', border: 'none',
            borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13,
          }}
        >
          + Забронировать
        </button>
      </div>

      {/* Studio tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {STUDIOS.map((s) => (
          <button
            key={s.key}
            onClick={() => setStudio(s.key)}
            style={{
              padding: '5px 14px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13,
              background: studio === s.key ? '#2563eb' : '#f1f5f9',
              color:      studio === s.key ? '#fff'    : '#374151',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Week navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button
          onClick={() => setWeekStart((d) => subWeeks(d, 1))}
          style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 14 }}
        >
          ‹
        </button>
        <span style={{ fontSize: 14, fontWeight: 500 }}>
          {format(weekStart, 'd MMM', { locale: ru })} — {format(endOfWeek(weekStart, { weekStartsOn: 1 }), 'd MMM yyyy', { locale: ru })}
        </span>
        <button
          onClick={() => setWeekStart((d) => addWeeks(d, 1))}
          style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 14 }}
        >
          ›
        </button>
        <button
          onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
          style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12, color: '#6b7280' }}
        >
          Сегодня
        </button>
      </div>

      {/* Booking form */}
      {showForm && (
        <div style={{
          background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8,
          padding: 16, marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Цель</label>
            <input
              placeholder="Название встречи" value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, minWidth: 200 }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Дата</label>
            <input
              type="date" value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Начало</label>
            <input
              type="time" value={form.timeFrom}
              onChange={(e) => setForm({ ...form, timeFrom: e.target.value })}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Конец</label>
            <input
              type="time" value={form.timeTo}
              onChange={(e) => setForm({ ...form, timeTo: e.target.value })}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
            />
          </div>
          <button
            onClick={() => createMutation.mutate({ ...form, studio })}
            disabled={!form.title || !form.date || createMutation.isPending}
            style={{
              background: '#16a34a', color: '#fff', border: 'none',
              borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13,
            }}
          >
            Забронировать
          </button>
          <button
            onClick={() => setShowForm(false)}
            style={{
              background: '#f1f5f9', border: 'none', borderRadius: 6,
              padding: '6px 14px', cursor: 'pointer', fontSize: 13,
            }}
          >
            Отмена
          </button>
        </div>
      )}

      {/* Week grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
        {days.map((day) => {
          const dayBookings = bookingsForDay(day)
          const isToday = isSameDay(day, new Date())
          return (
            <div key={day.toISOString()} style={{ minHeight: 120 }}>
              <div style={{
                fontSize: 12, marginBottom: 6, textAlign: 'center',
                color:      isToday ? '#2563eb' : '#6b7280',
                fontWeight: isToday ? 700 : 400,
              }}>
                {format(day, 'EEE d', { locale: ru })}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {dayBookings.map((b) => (
                  <div
                    key={b.id}
                    style={{
                      background: STATUS_COLORS[b.status] + '15',
                      borderLeft: `3px solid ${STATUS_COLORS[b.status]}`,
                      borderRadius: 4, padding: '4px 6px', fontSize: 11,
                    }}
                  >
                    <div style={{ fontWeight: 600, color: '#1f2937', marginBottom: 1 }}>
                      {b.title}
                    </div>
                    {(b.timeFrom || b.timeTo) && (
                      <div style={{ color: '#6b7280' }}>
                        {b.timeFrom}{b.timeTo ? ` – ${b.timeTo}` : ''}
                      </div>
                    )}
                    <div style={{ color: '#9ca3af', marginTop: 1 }}>{b.creator.fullName}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      {b.creator.id === user?.id && b.status !== 'blocked' && (
                        <button
                          onClick={() => deleteMutation.mutate(b.id)}
                          style={{
                            background: 'none', color: '#dc2626', border: 'none',
                            cursor: 'pointer', fontSize: 10, padding: 0,
                          }}
                        >
                          Отменить
                        </button>
                      )}
                      {isAdmin && b.status !== 'blocked' && (
                        <button
                          onClick={() => blockMutation.mutate({ id: b.id })}
                          style={{
                            background: 'none', color: '#9ca3af', border: 'none',
                            cursor: 'pointer', fontSize: 10, padding: 0,
                          }}
                        >
                          Заблокировать
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 20, flexWrap: 'wrap' }}>
        {Object.entries(STATUS_LABELS).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6b7280' }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: STATUS_COLORS[k] }} />
            {v}
          </div>
        ))}
      </div>
    </div>
  )
}
