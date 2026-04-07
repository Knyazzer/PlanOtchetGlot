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

  const events = projects
    .filter((p) => p.date)
    .map((p) => ({
      id: p.id,
      title: p.client ? `${p.client} — ${p.name}` : p.name,
      date: p.date!.split('T')[0],
      backgroundColor: STATUS_COLORS[p.status] ?? '#3b82f6',
      borderColor: STATUS_COLORS[p.status] ?? '#3b82f6',
      extendedProps: { project: p },
    }))

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
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Производственный календарь</h2>
          {(isAdmin || isProducer) && (
            <button
              onClick={() => setShowCreateForm(true)}
              style={{
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '8px 16px',
                cursor: 'pointer',
                fontWeight: 500,
                fontSize: 14,
              }}
            >
              + Проект
            </button>
          )}
        </div>

        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 16 }}>
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
              <div style={{ width: 12, height: 12, borderRadius: 3, background: STATUS_COLORS[key] }} />
              <span style={{ fontSize: 12, color: '#64748b' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Правая панель — без даты */}
      <div style={{ width: 280, flexShrink: 0 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#374151' }}>
          Без даты ({unconfirmedProjects.length})
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {unconfirmedProjects.length === 0 && (
            <div style={{ fontSize: 13, color: '#94a3b8', padding: '12px 0' }}>Все проекты имеют дату</div>
          )}
          {unconfirmedProjects.map((p) => (
            <div
              key={p.id}
              onClick={() => setSelectedProject(p)}
              style={{
                background: '#fff',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                padding: '10px 12px',
                cursor: 'pointer',
                borderLeft: `3px solid ${STATUS_COLORS[p.status]}`,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b', marginBottom: 2 }}>
                {p.name}
              </div>
              {p.client && (
                <div style={{ fontSize: 12, color: '#64748b' }}>{p.client}</div>
              )}
              {p.dateApproximate && (
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>≈ {p.dateApproximate}</div>
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
  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/projects/${project.id}`),
    onSuccess: onDeleted,
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
      <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 520, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 600 }}>{project.name}</h3>
            <StatusBadge status={project.status} />
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8', padding: 4 }}>×</button>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
          <tbody>
            {rows.map(([label, value]) =>
              value ? (
                <tr key={label} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '6px 0', fontSize: 13, color: '#64748b', width: 140 }}>{label}</td>
                  <td style={{ padding: '6px 0', fontSize: 13, color: '#1e293b' }}>{value}</td>
                </tr>
              ) : null
            )}
          </tbody>
        </table>

        {/* Состав */}
        {project.assignments.length > 0 && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#374151' }}>Состав команды</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {project.assignments.map((a) => (
                <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: '1px solid #f8fafc' }}>
                  <span style={{ color: '#1e293b' }}>
                    {a.user?.fullName ?? <span style={{ color: '#ef4444' }}>{a.unmatchedName} (не найден)</span>}
                  </span>
                  {a.roleOnSite && <span style={{ color: '#64748b' }}>{a.roleOnSite}</span>}
                </div>
              ))}
            </div>
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
      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 3, color: '#374151' }}>{label}</label>
      <input
        type={type}
        value={form[key]}
        placeholder={placeholder}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
      />
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 440, boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
        <h3 style={{ margin: '0 0 18px', fontSize: 17, fontWeight: 600 }}>Новый проект</h3>

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
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 13 }}>
            Отмена
          </button>
          <button
            onClick={() => create.mutate()}
            disabled={create.isPending || !form.name}
            style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontWeight: 500, fontSize: 13, opacity: !form.name ? 0.5 : 1 }}
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
      fontSize: 11,
      padding: '2px 7px',
      borderRadius: 10,
      background: STATUS_COLORS[status] + '22',
      color: STATUS_COLORS[status],
      fontWeight: 500,
    }}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}
