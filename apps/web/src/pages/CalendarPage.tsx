import { useState, useRef } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import ruLocale from '@fullcalendar/core/locales/ru'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth, addMonths } from 'date-fns'
import { ru } from 'date-fns/locale'
import { api } from '../lib/api'
import { useIsAdmin, useIsProducer } from '../hooks/useAuth'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Project {
  id: string
  client: string | null
  name: string
  execProducer: string | null
  lineProducer: string | null
  accountManager: string | null
  date: string | null
  dateConfirmed: boolean
  dateApproximate: string | null
  time: string | null
  format: string | null
  location: string | null
  status: 'preliminary' | 'ready' | 'completed' | 'manual'
  source: 'projects_table' | 'manual'
  matrixUrl: string | null
  uncertainFields: string[]
  assignments: {
    id: string
    roleOnSite: string | null
    user: { id: string; fullName: string; role: string } | null
    unmatchedName: string | null
  }[]
}

interface ConflictEntry {
  date: string
  user: { id: string; fullName: string }
  shifts: { shiftId: string; shiftType: string; project: { id: string; name: string; client: string | null } }[]
}

interface ChangeLogEntry {
  id: string
  field: string | null
  oldValue: string | null
  newValue: string | null
  changedAt: string
  source: string
  user: { id: string; fullName: string } | null
}

const STATUS_COLORS: Record<string, string> = {
  preliminary: '#f59e0b',
  ready: '#10b981',
  completed: '#6b7280',
  manual: '#3b82f6',
}

const STATUS_LABELS: Record<string, string> = {
  preliminary: 'Предварительно',
  ready: 'Готов',
  completed: 'Завершён',
  manual: 'Ручной',
}

// ─── CalendarPage ─────────────────────────────────────────────────────────────

export function CalendarPage() {
  const qc = useQueryClient()
  const calendarRef = useRef<FullCalendar>(null)
  const isAdmin = useIsAdmin()
  const isProducer = useIsProducer()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)

  const dateFrom = format(startOfMonth(addMonths(currentDate, -1)), 'yyyy-MM-dd')
  const dateTo = format(endOfMonth(addMonths(currentDate, 1)), 'yyyy-MM-dd')

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ['projects', dateFrom, dateTo],
    queryFn: () =>
      api.get('/projects', { params: { dateFrom, dateTo } }).then((r) => r.data),
  })

  // Проекты без даты — в правую панель
  const { data: unconfirmedProjects = [] } = useQuery<Project[]>({
    queryKey: ['projects-unconfirmed'],
    queryFn: () =>
      api.get('/projects').then((r) =>
        (r.data as Project[]).filter((p) => !p.date)
      ),
  })

  // Конфликты (только для admin/producer)
  const { data: conflicts = [] } = useQuery<ConflictEntry[]>({
    queryKey: ['conflicts', dateFrom, dateTo],
    queryFn: () =>
      api.get('/projects/conflicts', { params: { dateFrom, dateTo } }).then((r) => r.data),
    enabled: isAdmin || isProducer,
  })

  // Даты с конфликтами для подсветки на календаре
  const conflictDates = new Set(conflicts.map((c) => c.date.split('T')[0]))

  const events = [
    ...projects
      .filter((p) => p.date)
      .map((p) => ({
        id: p.id,
        title: p.client ? `${p.client} — ${p.name}` : p.name,
        date: p.date!.split('T')[0],
        backgroundColor: STATUS_COLORS[p.status] ?? '#3b82f6',
        borderColor: STATUS_COLORS[p.status] ?? '#3b82f6',
        extendedProps: { project: p },
      })),
    // Фоновые маркеры конфликтных дат
    ...[...conflictDates].map((date) => ({
      id: `conflict-${date}`,
      start: date,
      display: 'background' as const,
      backgroundColor: 'rgba(239,68,68,0.15)',
      borderColor: 'transparent',
      extendedProps: { isConflict: true },
    })),
  ]

  function handleEventClick(info: any) {
    setSelectedProject(info.event.extendedProps.project)
  }

  function handleDatesSet(info: any) {
    setCurrentDate(info.view.currentStart)
  }

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
      {/* Calendar */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>Производственный календарь</h2>
          {(isAdmin || isProducer) && (
            <button
              onClick={() => setShowCreateForm(true)}
              style={{
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '10px 20px',
                cursor: 'pointer',
                fontWeight: 500,
                fontSize: 16,
              }}
            >
              + Проект
            </button>
          )}
        </div>

        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Загрузка...</div>
          ) : (
            <FullCalendar
              ref={calendarRef}
              plugins={[dayGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              locale={ruLocale}
              firstDay={1}
              height="auto"
              headerToolbar={{
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,dayGridWeek',
              }}
              buttonText={{ today: 'Сегодня', month: 'Месяц', week: 'Неделя' }}
              events={events}
              eventClick={handleEventClick}
              datesSet={handleDatesSet}
              eventDisplay="block"
              eventTimeFormat={{ hour: undefined, minute: undefined }}
              displayEventTime={false}
            />
          )}
        </div>

        {/* Легенда */}
        <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 14, height: 14, borderRadius: 3, background: STATUS_COLORS[key] }} />
              <span style={{ fontSize: 14, color: '#64748b' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Правая панель */}
      <div style={{ width: 340, flexShrink: 0 }}>

        {/* Конфликты */}
        {conflicts.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 600, color: '#dc2626' }}>
              ⚠ Конфликты ({conflicts.length})
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {conflicts.map((c, i) => (
                <div key={i} style={{ background: '#fff5f5', borderRadius: 8, border: '1px solid #fecaca', padding: '8px 10px', borderLeft: '3px solid #ef4444' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#dc2626', marginBottom: 3 }}>
                    {format(new Date(c.date), 'd MMM', { locale: ru })} · {c.user.fullName}
                  </div>
                  {c.shifts.map((s) => (
                    <div key={s.shiftId} style={{ fontSize: 13, color: '#64748b' }}>
                      {s.project.client ? `${s.project.client} — ` : ''}{s.project.name}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
        <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600, color: '#374151' }}>
          Без даты ({unconfirmedProjects.length})
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {unconfirmedProjects.length === 0 && (
            <div style={{ fontSize: 14, color: '#94a3b8', padding: '12px 0' }}>Все проекты имеют дату</div>
          )}
          {unconfirmedProjects.map((p) => (
            <div
              key={p.id}
              onClick={() => setSelectedProject(p)}
              style={{
                background: '#fff',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                padding: '12px 14px',
                cursor: 'pointer',
                borderLeft: `3px solid ${STATUS_COLORS[p.status]}`,
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 500, color: '#1e293b', marginBottom: 3 }}>
                {p.name}
              </div>
              {p.client && (
                <div style={{ fontSize: 13, color: '#64748b' }}>{p.client}</div>
              )}
              {p.dateApproximate && (
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>≈ {p.dateApproximate}</div>
              )}
              <div style={{ marginTop: 4 }}>
                <StatusBadge status={p.status} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Модалка проекта */}
      {selectedProject && (
        <ProjectModal
          project={selectedProject}
          onClose={() => setSelectedProject(null)}
          onDeleted={() => {
            setSelectedProject(null)
            qc.invalidateQueries({ queryKey: ['projects'] })
            qc.invalidateQueries({ queryKey: ['projects-unconfirmed'] })
          }}
          canEdit={isAdmin}
        />
      )}

      {/* Форма создания */}
      {showCreateForm && (
        <CreateProjectModal
          onClose={() => setShowCreateForm(false)}
          onCreated={() => {
            setShowCreateForm(false)
            qc.invalidateQueries({ queryKey: ['projects'] })
            qc.invalidateQueries({ queryKey: ['projects-unconfirmed'] })
          }}
        />
      )}
    </div>
  )
}

// ─── ProjectModal ─────────────────────────────────────────────────────────────

function ProjectModal({
  project,
  onClose,
  onDeleted,
  canEdit,
}: {
  project: Project
  onClose: () => void
  onDeleted: () => void
  canEdit: boolean
}) {
  const [tab, setTab] = useState<'info' | 'log'>('info')

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/projects/${project.id}`),
    onSuccess: onDeleted,
  })

  const { data: changeLogs = [] } = useQuery<ChangeLogEntry[]>({
    queryKey: ['change-logs', 'project', project.id],
    queryFn: () =>
      api.get('/change-logs', { params: { entityType: 'project', entityId: project.id } }).then((r) => r.data),
    enabled: tab === 'log',
  })

  const rows: [string, string | null | undefined][] = [
    ['Клиент', project.client],
    ['Исп. продюсер', project.execProducer],
    ['Лайн-продюсер', project.lineProducer],
    ['Аккаунт', project.accountManager],
    ['Дата', project.date ? format(new Date(project.date), 'd MMMM yyyy', { locale: ru }) : project.dateApproximate ? `≈ ${project.dateApproximate}` : null],
    ['Время', project.time],
    ['Формат', project.format],
    ['Локация', project.location],
    ['Источник', project.source === 'manual' ? 'Ручной ввод' : 'Google Sheets'],
  ]

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: '#fff', borderRadius: 12, padding: 32, width: 600, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 600 }}>{project.name}</h3>
            <StatusBadge status={project.status} />
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8', padding: 4 }}>×</button>
        </div>

        {/* Вкладки */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #e2e8f0' }}>
          {(['info', 'log'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: 'none', border: 'none', padding: '6px 14px', cursor: 'pointer',
              fontSize: 15, fontWeight: tab === t ? 600 : 400,
              color: tab === t ? '#2563eb' : '#64748b',
              borderBottom: tab === t ? '2px solid #2563eb' : '2px solid transparent',
              marginBottom: -1,
            }}>
              {t === 'info' ? 'Информация' : 'История изменений'}
            </button>
          ))}
        </div>

        {tab === 'info' && (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
              <tbody>
                {rows.map(([label, value]) =>
                  value ? (
                    <tr key={label} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 0', fontSize: 15, color: '#64748b', width: 160 }}>{label}</td>
                      <td style={{ padding: '8px 0', fontSize: 15, color: '#1e293b' }}>{value}</td>
                    </tr>
                  ) : null
                )}
              </tbody>
            </table>

            {/* Состав */}
            {project.assignments.length > 0 && (
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10, color: '#374151' }}>Состав команды</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {project.assignments.map((a) => (
                    <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, padding: '6px 0', borderBottom: '1px solid #f8fafc' }}>
                      <span style={{ color: '#1e293b' }}>
                        {a.user?.fullName ?? <span style={{ color: '#ef4444' }}>{a.unmatchedName} (не найден)</span>}
                      </span>
                      {a.roleOnSite && <span style={{ color: '#64748b' }}>{a.roleOnSite}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'log' && (
          <div>
            {changeLogs.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                Изменений не зафиксировано
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {changeLogs.map((entry) => (
                  <div key={entry.id} style={{ fontSize: 14, padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ fontWeight: 500, color: '#374151' }}>{entry.field}</span>
                      <span style={{ color: '#94a3b8' }}>
                        {format(new Date(entry.changedAt), 'd MMM yyyy HH:mm', { locale: ru })}
                        {entry.user && ` · ${entry.user.fullName}`}
                      </span>
                    </div>
                    <div style={{ color: '#64748b' }}>
                      <span style={{ color: '#dc2626', textDecoration: 'line-through' }}>{entry.oldValue ?? '—'}</span>
                      {' → '}
                      <span style={{ color: '#16a34a' }}>{entry.newValue ?? '—'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {canEdit && (
          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => {
                if (confirm(`Удалить проект «${project.name}»?`)) deleteMutation.mutate()
              }}
              disabled={deleteMutation.isPending}
              style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid #fca5a5', background: 'transparent', color: '#dc2626', cursor: 'pointer', fontSize: 13 }}
            >
              Удалить проект
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── CreateProjectModal ───────────────────────────────────────────────────────

function CreateProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    name: '',
    client: '',
    execProducer: '',
    date: '',
    dateApproximate: '',
    time: '',
    format: '',
    location: '',
  })
  const [error, setError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () =>
      api.post('/projects', {
        ...form,
        date: form.date ? new Date(form.date).toISOString() : undefined,
        client: form.client || undefined,
        execProducer: form.execProducer || undefined,
        dateApproximate: form.dateApproximate || undefined,
        time: form.time || undefined,
        format: form.format || undefined,
        location: form.location || undefined,
      }),
    onSuccess: onCreated,
    onError: (e: any) => setError(e.response?.data?.error ?? 'Ошибка'),
  })

  const field = (label: string, key: keyof typeof form, type = 'text', placeholder?: string) => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4, color: '#374151' }}>{label}</label>
      <input
        type={type}
        value={form[key]}
        placeholder={placeholder}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 15, boxSizing: 'border-box' }}
      />
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 32, width: 500, boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
        <h3 style={{ margin: '0 0 20px', fontSize: 20, fontWeight: 600 }}>Новый проект</h3>

        {field('Название *', 'name')}
        {field('Клиент', 'client')}
        {field('Исп. продюсер', 'execProducer')}
        {field('Дата', 'date', 'date')}
        {field('Приблизительная дата', 'dateApproximate', 'text', 'например: апрель 2026')}
        {field('Время', 'time', 'text', '10:00')}
        {field('Формат', 'format')}
        {field('Локация', 'location')}

        {error && <div style={{ marginBottom: 12, color: '#dc2626', fontSize: 13 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 15 }}>
            Отмена
          </button>
          <button
            onClick={() => create.mutate()}
            disabled={create.isPending || !form.name}
            style={{ padding: '10px 20px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontWeight: 500, fontSize: 15, opacity: !form.name ? 0.5 : 1 }}
          >
            {create.isPending ? 'Создание...' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  return (
    <span style={{
      display: 'inline-block',
      fontSize: 13,
      padding: '3px 9px',
      borderRadius: 10,
      background: STATUS_COLORS[status] + '22',
      color: STATUS_COLORS[status],
      fontWeight: 500,
    }}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}
