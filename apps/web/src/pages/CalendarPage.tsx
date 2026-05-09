import { useState, useRef, useCallback } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventInput, DateClickArg, EventClickArg, DatesSetArg } from '@fullcalendar/core'
import ruLocale from '@fullcalendar/core/locales/ru'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { api } from '../lib/api'
import { useCurrentUser, usePrimaryDept } from '../hooks/useAuth'

// ─── Типы ─────────────────────────────────────────────────────────────────────

interface CalEvent {
  id: string; title: string; date: string
  timeFrom: string | null; timeTo: string | null
  deptId: string | null; isGlobal: boolean
  creator: { id: string; fullName: string }
  participants: { userId: string; user: { fullName: string } }[]
}

interface HRRecord {
  id: string; type: string; dateFrom: string; dateTo: string
  status: string; notes?: string
  user: { id: string; fullName: string }
}

interface StudioBooking {
  id: string; studio: string; title: string; date: string
  timeFrom?: string; timeTo?: string; status: string
  creator: { id: string; fullName: string }
}

interface SimpleUser { id: string; fullName: string }

// ─── Константы ────────────────────────────────────────────────────────────────

const STUDIOS = [
  { key: 'znamyanka_kamin',  label: 'Знаменка Камин',  color: '#0891b2' },
  { key: 'znamyanka_black',  label: 'Знаменка Чёрная', color: '#4f46e5' },
  { key: 'znamyanka_kupol',  label: 'Знаменка Купол',  color: '#7c3aed' },
  { key: 'romanov',          label: 'Романов',          color: '#db2777' },
] as const

type StudioKey = typeof STUDIOS[number]['key']

const HR_COLORS: Record<string, string> = {
  vacation:      '#f59e0b',
  sick:          '#ef4444',
  remote:        '#10b981',
  business_trip: '#6366f1',
  day_off:       '#64748b',
}
const HR_LABELS: Record<string, string> = {
  vacation: 'Отпуск', sick: 'Больничный', remote: 'Удалёнка',
  business_trip: 'Командировка', day_off: 'Отгул',
}

type LayerId = 'meetings' | 'hr' | StudioKey

const ALL_LAYERS: { id: LayerId; label: string; color: string }[] = [
  { id: 'meetings',          label: 'Встречи',           color: '#2563eb' },
  { id: 'hr',                label: 'HR-статусы',        color: '#f59e0b' },
  { id: 'znamyanka_kamin',   label: 'Знаменка Камин',    color: '#0891b2' },
  { id: 'znamyanka_black',   label: 'Знаменка Чёрная',   color: '#4f46e5' },
  { id: 'znamyanka_kupol',   label: 'Знаменка Купол',    color: '#7c3aed' },
  { id: 'romanov',           label: 'Романов',            color: '#db2777' },
]

type CreateType = 'meeting' | 'studio' | 'vacation' | 'sick' | 'remote' | 'business_trip' | 'day_off'

const CREATE_OPTIONS: { id: CreateType; label: string; icon: string }[] = [
  { id: 'meeting',       label: 'Встреча',        icon: '📅' },
  { id: 'studio',        label: 'Студия',          icon: '🎬' },
  { id: 'vacation',      label: 'Отпуск',          icon: '🏖️' },
  { id: 'sick',          label: 'Больничный',      icon: '🤒' },
  { id: 'remote',        label: 'Удалёнка',        icon: '🏠' },
  { id: 'business_trip', label: 'Командировка',    icon: '✈️' },
  { id: 'day_off',       label: 'Отгул',           icon: '💤' },
]

// ─── Вспомогательные ──────────────────────────────────────────────────────────

function dateTimeToISO(date: string, time: string | null) {
  if (!time) return date
  return `${date}T${time}`
}

function pill(color: string, label: string) {
  return (
    <span style={{
      display: 'inline-block', padding: '1px 8px', borderRadius: 10, fontSize: 11,
      background: color + '22', color, fontWeight: 600,
    }}>
      {label}
    </span>
  )
}

// ─── CalendarPage ─────────────────────────────────────────────────────────────

export function CalendarPage() {
  const qc = useQueryClient()
  const user = useCurrentUser()
  const primaryDept = usePrimaryDept()
  const calRef = useRef<FullCalendar>(null)

  const [activeLayers, setActiveLayers] = useState<Set<LayerId>>(
    new Set(['meetings', 'hr'])
  )
  const [dateRange, setDateRange] = useState({ from: '', to: '' })

  // Создание события
  const [createInfo, setCreateInfo] = useState<{ date: string; time?: string } | null>(null)
  const [createType, setCreateType] = useState<CreateType>('meeting')

  // Просмотр события
  const [detailEvent, setDetailEvent] = useState<{
    type: 'meeting' | 'hr' | 'studio'
    data: CalEvent | HRRecord | StudioBooking
  } | null>(null)

  function toggleLayer(id: LayerId) {
    setActiveLayers((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Данные ────────────────────────────────────────────────────────────────

  const { data: meetings = [] } = useQuery<CalEvent[]>({
    queryKey: ['cal-events', primaryDept?.id, dateRange.from, dateRange.to],
    queryFn: () => api.get('/calendar/events', {
      params: { deptId: primaryDept?.id, from: dateRange.from, to: dateRange.to },
    }).then((r) => r.data),
    enabled: !!dateRange.from && activeLayers.has('meetings'),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })

  const { data: hrRecords = [] } = useQuery<HRRecord[]>({
    queryKey: ['hr-cal', dateRange.from, dateRange.to],
    queryFn: () => api.get('/hr-statuses', {
      params: { from: dateRange.from, to: dateRange.to },
    }).then((r) => r.data),
    enabled: !!dateRange.from && activeLayers.has('hr'),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })

  const studioQueries = STUDIOS.map((s) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useQuery<StudioBooking[]>({
      queryKey: ['studio-cal', s.key, dateRange.from, dateRange.to],
      queryFn: () => api.get('/studios/slots', {
        params: { studio: s.key, from: dateRange.from, to: dateRange.to },
      }).then((r) => r.data),
      enabled: !!dateRange.from && activeLayers.has(s.key),
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
    })
  )

  // ── Маппинг событий для FullCalendar ──────────────────────────────────────

  const fcEvents: EventInput[] = [
    ...(activeLayers.has('meetings')
      ? meetings.map((e) => ({
          id: `meeting-${e.id}`,
          title: e.title,
          start: dateTimeToISO(e.date, e.timeFrom),
          end: e.timeTo ? dateTimeToISO(e.date, e.timeTo) : undefined,
          color: '#2563eb',
          extendedProps: { type: 'meeting', data: e },
        }))
      : []),

    ...(activeLayers.has('hr')
      ? hrRecords.map((r) => ({
          id: `hr-${r.id}`,
          title: `${HR_LABELS[r.type] ?? r.type} — ${r.user.fullName}`,
          start: r.dateFrom.slice(0, 10),
          end: r.dateTo ? (() => {
            const d = new Date(r.dateTo); d.setDate(d.getDate() + 1)
            return d.toISOString().slice(0, 10)
          })() : undefined,
          color: HR_COLORS[r.type] ?? '#64748b',
          allDay: true,
          extendedProps: { type: 'hr', data: r },
        }))
      : []),

    ...STUDIOS.flatMap((s, i) =>
      activeLayers.has(s.key)
        ? (studioQueries[i].data ?? []).map((b) => ({
            id: `studio-${b.id}`,
            title: `${s.label}: ${b.title}`,
            start: dateTimeToISO(b.date, b.timeFrom ?? null),
            end: b.timeTo ? dateTimeToISO(b.date, b.timeTo) : undefined,
            color: s.color,
            extendedProps: { type: 'studio', data: b },
          }))
        : []
    ),
  ]

  // ── Обработчики ──────────────────────────────────────────────────────────

  const handleDatesSet = useCallback((arg: DatesSetArg) => {
    setDateRange({
      from: format(arg.start, 'yyyy-MM-dd'),
      to:   format(arg.end,   'yyyy-MM-dd'),
    })
  }, [])

  const handleDateClick = useCallback((arg: DateClickArg) => {
    const time = arg.allDay ? undefined : format(arg.date, 'HH:mm')
    setCreateInfo({ date: format(arg.date, 'yyyy-MM-dd'), time })
    setCreateType('meeting')
  }, [])

  const handleEventClick = useCallback((arg: EventClickArg) => {
    const { type, data } = arg.event.extendedProps as { type: 'meeting' | 'hr' | 'studio'; data: any }
    setDetailEvent({ type, data })
  }, [])

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ['cal-events'] })
    qc.invalidateQueries({ queryKey: ['hr-cal'] })
    STUDIOS.forEach((s) => qc.invalidateQueries({ queryKey: ['studio-cal', s.key] }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: '#fff' }}>
      {/* Панель слоёв */}
      <div style={{
        padding: '8px 20px', borderBottom: '1px solid #e2e8f0',
        display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, color: '#94a3b8', marginRight: 4 }}>Показать:</span>
        {ALL_LAYERS.map((l) => {
          const active = activeLayers.has(l.id)
          return (
            <button
              key={l.id}
              onClick={() => toggleLayer(l.id)}
              style={{
                padding: '4px 12px', borderRadius: 20, border: `1.5px solid ${l.color}`,
                background: active ? l.color : 'transparent',
                color: active ? '#fff' : l.color,
                fontSize: 12, cursor: 'pointer', fontWeight: 500,
                transition: 'all 0.15s',
              }}
            >
              {l.label}
            </button>
          )
        })}
      </div>

      {/* Сетка FullCalendar */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 8px 8px' }}>
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          locale={ruLocale}
          headerToolbar={{
            left:   'prev,next today',
            center: 'title',
            right:  'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          buttonText={{ today: 'Сегодня', month: 'Месяц', week: 'Неделя', day: 'День' }}
          events={fcEvents}
          datesSet={handleDatesSet}
          dateClick={handleDateClick}
          eventClick={handleEventClick}
          selectable
          height="auto"
          slotMinTime="07:00:00"
          slotMaxTime="23:00:00"
          allDayText="Весь день"
          nowIndicator
          eventDisplay="block"
        />
      </div>

      {/* Модал создания */}
      {createInfo && (
        <CreateModal
          date={createInfo.date}
          time={createInfo.time}
          type={createType}
          onTypeChange={setCreateType}
          primaryDeptId={primaryDept?.id ?? null}
          onClose={() => setCreateInfo(null)}
          onSuccess={() => { setCreateInfo(null); invalidateAll() }}
        />
      )}

      {/* Модал просмотра */}
      {detailEvent && (
        <DetailModal
          type={detailEvent.type}
          data={detailEvent.data}
          currentUserId={user?.id ?? ''}
          onClose={() => setDetailEvent(null)}
          onDelete={() => { setDetailEvent(null); invalidateAll() }}
        />
      )}
    </div>
  )
}

// ─── CreateModal ──────────────────────────────────────────────────────────────

function CreateModal({
  date, time, type, onTypeChange, primaryDeptId, onClose, onSuccess,
}: {
  date: string; time?: string; type: CreateType
  onTypeChange: (t: CreateType) => void
  primaryDeptId: string | null
  onClose: () => void; onSuccess: () => void
}) {
  const qc = useQueryClient()

  const { data: users = [] } = useQuery<SimpleUser[]>({
    queryKey: ['users-list'],
    queryFn: () => api.get('/users').then((r) => r.data),
  })

  const isHR = ['vacation', 'sick', 'remote', 'business_trip', 'day_off'].includes(type)

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onMouseDown={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 12, width: 480, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '18px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: '#0f172a' }}>
            Новое событие — {date}{time ? ` в ${time}` : ''}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: '#94a3b8', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* Тип события */}
        <div style={{ padding: '14px 20px 0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {CREATE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => onTypeChange(opt.id)}
              style={{
                padding: '6px 12px', borderRadius: 8, border: '1.5px solid',
                borderColor: type === opt.id ? '#2563eb' : '#e2e8f0',
                background: type === opt.id ? '#eff6ff' : '#fff',
                color: type === opt.id ? '#2563eb' : '#64748b',
                fontSize: 12, cursor: 'pointer', fontWeight: type === opt.id ? 600 : 400,
              }}
            >
              {opt.icon} {opt.label}
            </button>
          ))}
        </div>

        <div style={{ padding: '16px 20px 20px' }}>
          {type === 'meeting' && (
            <MeetingForm
              date={date} time={time ?? ''} deptId={primaryDeptId}
              users={users} onSuccess={onSuccess}
            />
          )}
          {type === 'studio' && (
            <StudioForm date={date} time={time ?? ''} onSuccess={onSuccess} />
          )}
          {isHR && (
            <HRForm type={type as any} dateFrom={date} onSuccess={onSuccess} />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── MeetingForm ──────────────────────────────────────────────────────────────

function MeetingForm({ date, time, deptId, users, onSuccess }: {
  date: string; time: string; deptId: string | null
  users: SimpleUser[]; onSuccess: () => void
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    title: '', date, timeFrom: time, timeTo: '',
    isGlobal: false, participantIds: [] as string[],
  })
  const [err, setErr] = useState('')

  const save = useMutation({
    mutationFn: () => api.post('/calendar/events', {
      ...form,
      deptId: form.isGlobal ? undefined : deptId,
    }).then((r) => r.data),
    onSuccess,
    onError: (e: any) => setErr(e?.response?.data?.error ?? 'Ошибка'),
  })

  const toggleParticipant = (id: string) => {
    setForm((f) => ({
      ...f,
      participantIds: f.participantIds.includes(id)
        ? f.participantIds.filter((x) => x !== id)
        : [...f.participantIds, id],
    }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Field label="Название *">
        <input
          value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Название встречи" autoFocus
          style={inputStyle}
        />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Начало">
          <input type="time" value={form.timeFrom} onChange={(e) => setForm({ ...form, timeFrom: e.target.value })} style={inputStyle} />
        </Field>
        <Field label="Конец">
          <input type="time" value={form.timeTo} onChange={(e) => setForm({ ...form, timeTo: e.target.value })} style={inputStyle} />
        </Field>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151', cursor: 'pointer' }}>
        <input type="checkbox" checked={form.isGlobal} onChange={(e) => setForm({ ...form, isGlobal: e.target.checked })} />
        Глобальное событие (все отделы)
      </label>
      {users.length > 0 && (
        <Field label="Участники">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 120, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6, padding: 8 }}>
            {users.map((u) => {
              const selected = form.participantIds.includes(u.id)
              return (
                <button key={u.id} onClick={() => toggleParticipant(u.id)} style={{
                  padding: '3px 10px', borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 12,
                  background: selected ? '#2563eb' : '#f1f5f9',
                  color: selected ? '#fff' : '#374151',
                }}>
                  {u.fullName}
                </button>
              )
            })}
          </div>
        </Field>
      )}
      {err && <div style={{ color: '#dc2626', fontSize: 13 }}>{err}</div>}
      <button
        onClick={() => save.mutate()}
        disabled={!form.title.trim() || save.isPending}
        style={{ ...btnStyle, opacity: !form.title.trim() ? 0.5 : 1 }}
      >
        {save.isPending ? 'Сохранение...' : 'Создать встречу'}
      </button>
    </div>
  )
}

// ─── StudioForm ───────────────────────────────────────────────────────────────

function StudioForm({ date, time, onSuccess }: { date: string; time: string; onSuccess: () => void }) {
  const [form, setForm] = useState({
    studio: 'znamyanka_kamin' as StudioKey,
    title: '', date, timeFrom: time, timeTo: '',
  })
  const [err, setErr] = useState('')

  const save = useMutation({
    mutationFn: () => api.post('/studios/book', form).then((r) => r.data),
    onSuccess,
    onError: (e: any) => setErr(e?.response?.data?.error ?? 'Ошибка бронирования'),
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Field label="Студия *">
        <select value={form.studio} onChange={(e) => setForm({ ...form, studio: e.target.value as StudioKey })} style={inputStyle}>
          {STUDIOS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </Field>
      <Field label="Название / цель *">
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Съёмка, репетиция..." style={inputStyle} autoFocus />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Начало *">
          <input type="time" value={form.timeFrom} onChange={(e) => setForm({ ...form, timeFrom: e.target.value })} style={inputStyle} />
        </Field>
        <Field label="Конец">
          <input type="time" value={form.timeTo} onChange={(e) => setForm({ ...form, timeTo: e.target.value })} style={inputStyle} />
        </Field>
      </div>
      {err && <div style={{ color: '#dc2626', fontSize: 13 }}>{err}</div>}
      <button
        onClick={() => save.mutate()}
        disabled={!form.title.trim() || !form.timeFrom || save.isPending}
        style={{ ...btnStyle, opacity: (!form.title.trim() || !form.timeFrom) ? 0.5 : 1 }}
      >
        {save.isPending ? 'Бронирование...' : 'Забронировать'}
      </button>
    </div>
  )
}

// ─── HRForm ───────────────────────────────────────────────────────────────────

function HRForm({ type, dateFrom, onSuccess }: {
  type: 'vacation' | 'sick' | 'remote' | 'business_trip' | 'day_off'
  dateFrom: string; onSuccess: () => void
}) {
  const [form, setForm] = useState({ type, dateFrom, dateTo: dateFrom, notes: '' })
  const [err, setErr] = useState('')

  const save = useMutation({
    mutationFn: () => api.post('/hr-statuses', form).then((r) => r.data),
    onSuccess,
    onError: (e: any) => setErr(e?.response?.data?.error ?? 'Ошибка'),
  })

  const label = HR_LABELS[type] ?? type

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ padding: '10px 14px', background: '#fef3c7', borderRadius: 8, fontSize: 13, color: '#92400e' }}>
        Запрос: <strong>{label}</strong>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="С">
          <input type="date" value={form.dateFrom} onChange={(e) => setForm({ ...form, dateFrom: e.target.value })} style={inputStyle} />
        </Field>
        <Field label="По">
          <input type="date" value={form.dateTo} onChange={(e) => setForm({ ...form, dateTo: e.target.value })} style={inputStyle} />
        </Field>
      </div>
      <Field label="Комментарий">
        <textarea
          value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Необязательно" rows={2}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </Field>
      {err && <div style={{ color: '#dc2626', fontSize: 13 }}>{err}</div>}
      <button onClick={() => save.mutate()} disabled={save.isPending} style={btnStyle}>
        {save.isPending ? 'Отправка...' : `Подать заявку — ${label}`}
      </button>
    </div>
  )
}

// ─── DetailModal ──────────────────────────────────────────────────────────────

function DetailModal({ type, data, currentUserId, onClose, onDelete }: {
  type: 'meeting' | 'hr' | 'studio'
  data: CalEvent | HRRecord | StudioBooking
  currentUserId: string
  onClose: () => void; onDelete: () => void
}) {
  const deleteMut = useMutation({
    mutationFn: () => {
      if (type === 'meeting') return api.delete(`/calendar/events/${data.id}`)
      if (type === 'hr')      return api.delete(`/hr-statuses/${data.id}`)
      return api.delete(`/studios/${(data as StudioBooking).studio}/bookings/${data.id}`)
    },
    onSuccess: onDelete,
  })

  const isOwner = type === 'meeting'
    ? (data as CalEvent).creator.id === currentUserId
    : type === 'hr'
      ? (data as HRRecord).user.id === currentUserId
      : (data as StudioBooking).creator.id === currentUserId

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onMouseDown={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 12, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>
            {type === 'meeting' ? '📅 Встреча' : type === 'hr' ? '📋 HR-заявка' : '🎬 Студия'}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: '#94a3b8', cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {type === 'meeting' && (() => {
            const e = data as CalEvent
            return <>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#1e293b' }}>{e.title}</div>
              <div style={{ fontSize: 13, color: '#64748b' }}>
                {e.date}{e.timeFrom ? ` · ${e.timeFrom}${e.timeTo ? `–${e.timeTo}` : ''}` : ''}
              </div>
              <div style={{ fontSize: 13, color: '#374151' }}>Организатор: {e.creator.fullName}</div>
              {e.participants.length > 0 && (
                <div style={{ fontSize: 13, color: '#374151' }}>
                  Участники: {e.participants.map((p) => p.user.fullName).join(', ')}
                </div>
              )}
              {e.isGlobal && <div style={{ fontSize: 12, color: '#64748b' }}>Глобальное событие</div>}
            </>
          })()}

          {type === 'hr' && (() => {
            const r = data as HRRecord
            return <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 15, color: '#1e293b' }}>{HR_LABELS[r.type]}</span>
                {pill(r.status === 'approved' ? '#16a34a' : r.status === 'rejected' ? '#dc2626' : '#f59e0b',
                  r.status === 'approved' ? 'Одобрен' : r.status === 'rejected' ? 'Отклонён' : 'Ожидает')}
              </div>
              <div style={{ fontSize: 13, color: '#64748b' }}>
                {r.dateFrom.slice(0, 10)} — {r.dateTo.slice(0, 10)}
              </div>
              <div style={{ fontSize: 13, color: '#374151' }}>{r.user.fullName}</div>
              {r.notes && <div style={{ fontSize: 13, color: '#64748b' }}>{r.notes}</div>}
            </>
          })()}

          {type === 'studio' && (() => {
            const b = data as StudioBooking
            const studio = STUDIOS.find((s) => s.key === b.studio)
            return <>
              <div style={{ fontWeight: 600, fontSize: 15, color: '#1e293b' }}>{b.title}</div>
              <div style={{ fontSize: 13, color: '#64748b' }}>
                {studio?.label ?? b.studio} · {b.date}{b.timeFrom ? ` · ${b.timeFrom}${b.timeTo ? `–${b.timeTo}` : ''}` : ''}
              </div>
              <div style={{ fontSize: 13, color: '#374151' }}>{b.creator.fullName}</div>
              {pill(b.status === 'confirmed' ? '#16a34a' : b.status === 'blocked' ? '#dc2626' : '#f59e0b',
                b.status === 'confirmed' ? 'Подтверждено' : b.status === 'blocked' ? 'Заблокировано' : 'Предварительно')}
            </>
          })()}

          {isOwner && (
            <button
              onClick={() => deleteMut.mutate()}
              disabled={deleteMut.isPending}
              style={{ marginTop: 8, padding: '8px 0', border: 'none', borderRadius: 6, background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
            >
              {deleteMut.isPending ? 'Удаление...' : 'Удалить'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Утилиты UI ───────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6,
  fontSize: 13, color: '#1e293b', background: '#fff', width: '100%', boxSizing: 'border-box',
}

const btnStyle: React.CSSProperties = {
  padding: '9px 0', border: 'none', borderRadius: 6,
  background: '#2563eb', color: '#fff', cursor: 'pointer',
  fontSize: 14, fontWeight: 600, width: '100%',
}
