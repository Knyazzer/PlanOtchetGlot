import { useState, useRef } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import ruLocale from '@fullcalendar/core/locales/ru'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth, addMonths } from 'date-fns'
import { ru } from 'date-fns/locale'
import { api } from '../lib/api'
import { useIsAdmin } from '../hooks/useAuth'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProjectDay {
  id?: string
  date: string
  type: 'zastroyka' | 'efir'
  startTime?: string | null
}

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
  status: string
  source: 'projects_table' | 'manual'
  matrixUrl: string | null
  sheetMatrixId: string | null
  googleRowIndex: number | null
  uncertainFields: string[]
  days: ProjectDay[]
  matrixRegistry: { sheetUrl: string | null; matrixId: string } | null
  assignments: {
    id: string
    roleOnSite: string | null
    user: { id: string; fullName: string; role: string } | null
    unmatchedName: string | null
  }[]
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

const DAY_TYPE_LABELS: Record<string, string> = { zastroyka: 'Застройка', efir: 'Эфир' }
const DAY_TYPE_COLORS: Record<string, string> = { zastroyka: '#f59e0b', efir: '#10b981' }

const EVENT_COLOR = '#3b82f6'

// ─── CalendarPage ─────────────────────────────────────────────────────────────

export function CalendarPage() {
  const qc = useQueryClient()
  const calendarRef = useRef<FullCalendar>(null)
  const isAdmin = useIsAdmin()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)

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

  // Форматирование даты без потери дня из-за UTC offset
  function dateStrAddDay(dateStr: string): string {
    const [y, m, d] = dateStr.split('-').map(Number)
    const dt = new Date(y, m - 1, d + 1)
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
  }

  function isoToDateStr(iso: string): string {
    return iso.slice(0, 10)
  }

  // Генерация событий из дней проекта
  const projectEvents: any[] = []
  for (const p of projects) {
    const title = p.client ? `${p.client} — ${p.name}` : p.name

    if (p.days && p.days.length > 0) {
      const sorted = [...p.days]
        .map((d) => ({ ...d, dateStr: isoToDateStr(d.date) }))
        .sort((a, b) => a.dateStr.localeCompare(b.dateStr))

      const ranges: { start: string; end: string }[] = []
      let rangeStart = sorted[0].dateStr
      let rangeEnd = rangeStart

      for (let i = 1; i < sorted.length; i++) {
        const [py, pm, pd] = rangeEnd.split('-').map(Number)
        const [cy, cm, cd] = sorted[i].dateStr.split('-').map(Number)
        const prevMs = new Date(py, pm - 1, pd).getTime()
        const currMs = new Date(cy, cm - 1, cd).getTime()
        const diffDays = Math.round((currMs - prevMs) / 86400000)
        if (diffDays <= 1) {
          rangeEnd = sorted[i].dateStr
        } else {
          ranges.push({ start: rangeStart, end: rangeEnd })
          rangeStart = sorted[i].dateStr
          rangeEnd = rangeStart
        }
      }
      ranges.push({ start: rangeStart, end: rangeEnd })

      ranges.forEach((r, idx) => {
        projectEvents.push({
          id: `${p.id}-${idx}`,
          title,
          start: r.start,
          end: dateStrAddDay(r.end),
          backgroundColor: EVENT_COLOR,
          borderColor: EVENT_COLOR,
          extendedProps: { project: p },
        })
      })
    } else if (p.date) {
      projectEvents.push({
        id: p.id,
        title,
        date: p.date.split('T')[0],
        backgroundColor: EVENT_COLOR,
        borderColor: EVENT_COLOR,
        extendedProps: { project: p },
      })
    }
  }

  function handleEventClick(info: any) {
    setSelectedProject(info.event.extendedProps.project)
  }

  function handleDatesSet(info: any) {
    setCurrentDate(info.view.currentStart)
  }

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      {/* Calendar */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>Производственный календарь</h2>
        </div>

        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '12px 8px' }}>
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Загрузка...</div>
          ) : (
            <div>
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
                events={projectEvents}
                eventClick={handleEventClick}
                datesSet={handleDatesSet}
                eventDisplay="block"
                displayEventTime={false}
                eventContent={(arg) => {
                  const p: Project | undefined = arg.event.extendedProps.project
                  if (!p) return null
                  return (
                    <div style={{
                      padding: '1px 4px',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                      fontSize: '0.75rem',
                      lineHeight: 1.4,
                    }}>
                      {p.client && (
                        <span style={{ fontWeight: 600 }}>{p.client}</span>
                      )}
                      {p.client && ' — '}
                      <span>{p.name}</span>
                    </div>
                  )
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Правая панель */}
      <div style={{ width: 260, flexShrink: 0 }}>
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
                borderLeft: `3px solid ${EVENT_COLOR}`,
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
  const [editing, setEditing] = useState(false)

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

  if (editing) {
    return (
      <EditProjectModal
        project={project}
        onClose={() => setEditing(false)}
        onSaved={() => { setEditing(false); onClose() }}
      />
    )
  }

  const rows: [string, string | null | undefined][] = [
    ['Клиент', project.client],
    ['Исп. продюсер', project.execProducer],
    ['Лайн-продюсер', project.lineProducer],
    ['Аккаунт', project.accountManager],
    ['Дата', project.date ? format(new Date(project.date), 'd MMMM yyyy', { locale: ru }) : project.dateApproximate ? `≈ ${project.dateApproximate}` : null],
    ['Время', project.time],
    ['Формат', project.format],
    ['Локация', project.location],
  ]

  const matrixSheetUrl = project.matrixRegistry?.sheetUrl ?? project.matrixUrl

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: '#fff', borderRadius: 12, padding: 32, width: 600, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>{project.name}</h3>
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

            {/* Источники данных */}
            <div style={{ marginBottom: 20, padding: '12px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Источник данных</div>
              {project.source === 'manual' ? (
                <div style={{ fontSize: 14, color: '#64748b' }}>Ручной ввод</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#94a3b8', minWidth: 90 }}>Таблица проектов</span>
                    <span style={{ fontSize: 13, color: '#374151' }}>Google Sheets · строка {project.googleRowIndex ?? '—'}</span>
                  </div>
                  {project.sheetMatrixId && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: '#94a3b8', minWidth: 90 }}>ID матрицы</span>
                      <span style={{ fontSize: 13, color: '#374151', fontFamily: 'monospace' }}>{project.sheetMatrixId}</span>
                    </div>
                  )}
                  {matrixSheetUrl && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: '#94a3b8', minWidth: 90 }}>Матрица смен</span>
                      <a href={matrixSheetUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#2563eb', textDecoration: 'none' }}>
                        Открыть в Google Sheets ↗
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Дни проекта */}
            {project.days?.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: '#374151' }}>Дни проекта</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {project.days.map((d, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 6, background: '#f8fafc', border: `1px solid ${DAY_TYPE_COLORS[d.type]}44` }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: DAY_TYPE_COLORS[d.type], minWidth: 70 }}>
                        {DAY_TYPE_LABELS[d.type]}
                      </span>
                      <span style={{ fontSize: 14, color: '#1e293b' }}>
                        {format(new Date(d.date), 'd MMMM yyyy', { locale: ru })}
                      </span>
                      {d.startTime && (
                        <span style={{ fontSize: 13, color: '#64748b' }}>{d.type === 'efir' ? '▶ ' : ''}{d.startTime}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

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
          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              onClick={() => setEditing(true)}
              style={{ padding: '8px 18px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 500 }}
            >
              Редактировать
            </button>
            <button
              onClick={() => {
                if (confirm(`Удалить проект «${project.name}»?`)) deleteMutation.mutate()
              }}
              disabled={deleteMutation.isPending}
              style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid #fca5a5', background: 'transparent', color: '#dc2626', cursor: 'pointer', fontSize: 14 }}
            >
              Удалить
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── EditProjectModal ─────────────────────────────────────────────────────────

function EditProjectModal({
  project,
  onClose,
  onSaved,
}: {
  project: Project
  onClose: () => void
  onSaved: () => void
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: project.name,
    client: project.client ?? '',
    execProducer: project.execProducer ?? '',
    lineProducer: project.lineProducer ?? '',
    accountManager: project.accountManager ?? '',
    date: project.date ? project.date.split('T')[0] : '',
    dateApproximate: project.dateApproximate ?? '',
    time: project.time ?? '',
    format: project.format ?? '',
    location: project.location ?? '',
  })
  const [days, setDays] = useState<ProjectDay[]>(
    project.days?.map((d) => ({ ...d, date: d.date.split('T')[0] })) ?? []
  )
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/projects/${project.id}`, {
        name: form.name,
        client: form.client || null,
        execProducer: form.execProducer || null,
        lineProducer: form.lineProducer || null,
        accountManager: form.accountManager || null,
        date: form.date ? new Date(form.date).toISOString() : null,
        dateApproximate: form.dateApproximate || null,
        time: form.time || null,
        format: form.format || null,
        location: form.location || null,
        days: days
          .filter((d) => d.date)
          .map((d) => ({
            date: new Date(d.date).toISOString(),
            type: d.type,
            startTime: d.startTime || null,
          })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['projects-unconfirmed'] })
      onSaved()
    },
    onError: (e: any) => setError(e.response?.data?.error ?? 'Ошибка сохранения'),
  })

  function addDay() {
    setDays((d) => [...d, { date: '', type: 'zastroyka', startTime: '' }])
  }

  function updateDay(i: number, patch: Partial<ProjectDay>) {
    setDays((d) => d.map((day, idx) => (idx === i ? { ...day, ...patch } : day)))
  }

  function removeDay(i: number) {
    setDays((d) => d.filter((_, idx) => idx !== i))
  }

  const inp = (style?: object) => ({
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: 14,
    boxSizing: 'border-box' as const,
    width: '100%',
    ...style,
  })

  const fieldRow = (label: string, key: keyof typeof form, type = 'text', placeholder?: string) => (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 3, color: '#374151' }}>{label}</label>
      <input
        type={type}
        value={form[key]}
        placeholder={placeholder}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        style={inp()}
      />
    </div>
  )

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 620, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 12px 48px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Редактировать проект</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>×</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <div style={{ gridColumn: '1 / -1' }}>{fieldRow('Название *', 'name')}</div>
          {fieldRow('Клиент', 'client')}
          {fieldRow('Исп. продюсер', 'execProducer')}
          {fieldRow('Лайн-продюсер', 'lineProducer')}
          {fieldRow('Аккаунт', 'accountManager')}
          {fieldRow('Формат', 'format')}
          {fieldRow('Локация', 'location')}
        </div>

        {/* Дни проекта */}
        <div style={{ marginTop: 20, borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#374151' }}>Дни проекта</span>
            <button
              onClick={addDay}
              style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 12px', fontSize: 13, cursor: 'pointer', color: '#374151', fontWeight: 500 }}
            >
              + Добавить день
            </button>
          </div>

          {days.length === 0 && (
            <div style={{ fontSize: 13, color: '#94a3b8', padding: '8px 0' }}>Дни не добавлены</div>
          )}

          {days.map((day, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 100px auto', gap: 8, alignItems: 'end', marginBottom: 8, background: '#f8fafc', borderRadius: 8, padding: '10px 12px', border: `1px solid ${DAY_TYPE_COLORS[day.type]}33` }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 3 }}>Дата</label>
                <input
                  type="date"
                  value={day.date}
                  onChange={(e) => updateDay(i, { date: e.target.value })}
                  style={inp()}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 3 }}>Тип</label>
                <select
                  value={day.type}
                  onChange={(e) => updateDay(i, { type: e.target.value as any })}
                  style={inp({ background: DAY_TYPE_COLORS[day.type] + '18' })}
                >
                  <option value="zastroyka">Застройка</option>
                  <option value="efir">Эфир</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 3 }}>
                  {day.type === 'efir' ? 'Начало эфира' : 'Время'}
                </label>
                <input
                  type="time"
                  value={day.startTime ?? ''}
                  onChange={(e) => updateDay(i, { startTime: e.target.value })}
                  style={inp()}
                />
              </div>
              <button
                onClick={() => removeDay(i)}
                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 18, padding: '0 4px', alignSelf: 'center', marginTop: 18 }}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {error && <div style={{ marginTop: 12, color: '#dc2626', fontSize: 13 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 15 }}>
            Отмена
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending || !form.name}
            style={{ padding: '10px 24px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 15, opacity: !form.name ? 0.5 : 1 }}
          >
            {save.isPending ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  )
}
