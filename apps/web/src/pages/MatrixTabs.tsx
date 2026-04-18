/**
 * Компоненты для вкладок матрицы: Диаграмма Ганта, Заметки, Документы.
 * Используются в RegistryDetailModal (SyncDataPage.tsx).
 */
import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, differenceInDays, parseISO, startOfDay } from 'date-fns'
import { ru } from 'date-fns/locale'
import { api } from '../lib/api'
import { useCurrentUser } from '../hooks/useAuth'

// ─── Types ────────────────────────────────────────────────────────────────────

interface GanttTask {
  id: string
  matrix_id: string
  name: string
  start_date: string | null
  deadline: string | null
  done: boolean
  order: number
}

interface MatrixNote {
  id: string
  matrix_id: string
  user_id: string
  author_name: string
  text: string
  created_at: string
}

interface MatrixDocument {
  id: string
  matrix_id: string
  name: string
  url: string
  created_at: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(raw: string | null | undefined): string {
  if (!raw) return '—'
  try { return format(new Date(raw), 'd MMM yyyy', { locale: ru }) } catch { return raw }
}

function lastUrlSegment(url: string): string {
  try {
    const decoded = decodeURIComponent(new URL(url).pathname)
    const parts = decoded.split('/').filter(Boolean)
    return parts[parts.length - 1] || url
  } catch { return url }
}

// ─── GanttTab ─────────────────────────────────────────────────────────────────

export function GanttTab({ matrixId }: { matrixId: string }) {
  const qc = useQueryClient()
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)

  const { data: tasks = [], isLoading } = useQuery<GanttTask[]>({
    queryKey: ['gantt-tasks', matrixId],
    queryFn: () => api.get(`/matrix-gantt?matrixId=${matrixId}`).then((r) => r.data),
    staleTime: 30_000,
  })

  const createTask = useMutation({
    mutationFn: () =>
      api.post('/matrix-gantt', { matrixId, name: newName.trim(), order: tasks.length }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gantt-tasks', matrixId] })
      setNewName(''); setAdding(false)
    },
  })

  const updateTask = useMutation({
    mutationFn: ({ id, ...data }: Partial<GanttTask> & { id: string }) =>
      api.patch(`/matrix-gantt/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gantt-tasks', matrixId] }),
  })

  const deleteTask = useMutation({
    mutationFn: (id: string) => api.delete(`/matrix-gantt/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gantt-tasks', matrixId] }),
  })

  // Compute Gantt chart bounds
  const taskDates = tasks.flatMap((t) =>
    [t.start_date, t.deadline].filter(Boolean).map((d) => new Date(d!))
  )
  const minDate = taskDates.length > 0 ? startOfDay(new Date(Math.min(...taskDates.map((d) => d.getTime())))) : startOfDay(new Date())
  const maxDate = taskDates.length > 0 ? startOfDay(new Date(Math.max(...taskDates.map((d) => d.getTime())))) : startOfDay(new Date())
  const totalDays = Math.max(differenceInDays(maxDate, minDate) + 1, 14)

  const inputS: React.CSSProperties = {
    fontSize: 12, padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 5,
    color: '#1e293b', background: '#fff',
  }
  const thS: React.CSSProperties = {
    padding: '6px 10px', fontSize: 11, fontWeight: 600, color: '#94a3b8',
    textAlign: 'left', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap',
    position: 'sticky', top: 0, background: '#fff', zIndex: 1,
  }
  const tdS: React.CSSProperties = {
    padding: '5px 10px', fontSize: 13, borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle',
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left: task table */}
      <div style={{ width: 420, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {isLoading && <div style={{ padding: 20, color: '#94a3b8', fontSize: 13 }}>Загрузка...</div>}
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ ...thS, width: 24 }} />
                <th style={thS}>Задача</th>
                <th style={{ ...thS, width: 95 }}>Начало</th>
                <th style={{ ...thS, width: 95 }}>Дедлайн</th>
                <th style={{ ...thS, width: 28 }} />
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id} style={{ opacity: t.done ? 0.5 : 1 }}>
                  <td style={tdS}>
                    <input
                      type="checkbox"
                      checked={t.done}
                      onChange={(e) => updateTask.mutate({ id: t.id, done: e.target.checked })}
                      style={{ cursor: 'pointer', width: 14, height: 14 }}
                    />
                  </td>
                  <td style={tdS}>
                    <span style={{ textDecoration: t.done ? 'line-through' : 'none', color: t.done ? '#94a3b8' : '#1e293b' }}>
                      {t.name}
                    </span>
                  </td>
                  <td style={tdS}>
                    <input
                      type="date"
                      value={t.start_date ? t.start_date.slice(0, 10) : ''}
                      onChange={(e) =>
                        updateTask.mutate({ id: t.id, startDate: e.target.value ? new Date(e.target.value).toISOString() : null })
                      }
                      style={{ ...inputS, width: '100%' }}
                    />
                  </td>
                  <td style={tdS}>
                    <input
                      type="date"
                      value={t.deadline ? t.deadline.slice(0, 10) : ''}
                      onChange={(e) =>
                        updateTask.mutate({ id: t.id, deadline: e.target.value ? new Date(e.target.value).toISOString() : null })
                      }
                      style={{ ...inputS, width: '100%' }}
                    />
                  </td>
                  <td style={tdS}>
                    <button
                      onClick={() => deleteTask.mutate(t.id)}
                      style={{ fontSize: 13, color: '#cbd5e1', border: 'none', background: 'none', cursor: 'pointer', padding: '0 2px' }}
                      title="Удалить"
                    >×</button>
                  </td>
                </tr>
              ))}

              {adding && (
                <tr>
                  <td style={tdS} />
                  <td style={tdS} colSpan={3}>
                    <input
                      autoFocus
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newName.trim()) createTask.mutate()
                        if (e.key === 'Escape') { setAdding(false); setNewName('') }
                      }}
                      placeholder="Название задачи"
                      style={{ ...inputS, width: '100%' }}
                    />
                  </td>
                  <td style={tdS}>
                    <div style={{ display: 'flex', gap: 3 }}>
                      <button
                        onClick={() => { if (newName.trim()) createTask.mutate() }}
                        disabled={!newName.trim() || createTask.isPending}
                        style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}
                      >OK</button>
                      <button
                        onClick={() => { setAdding(false); setNewName('') }}
                        style={{ fontSize: 10, padding: '2px 4px', borderRadius: 4, border: '1px solid #e2e8f0', background: 'none', cursor: 'pointer', color: '#64748b' }}
                      >×</button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {!adding && (
          <div style={{ padding: '8px 12px', borderTop: '1px solid #f1f5f9' }}>
            <button
              onClick={() => setAdding(true)}
              style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: '1px dashed #cbd5e1', background: 'none', color: '#64748b', cursor: 'pointer' }}
            >
              + Добавить задачу
            </button>
          </div>
        )}
      </div>

      {/* Right: Gantt chart */}
      <div style={{ flex: 1, overflowX: 'auto', overflowY: 'auto' }}>
        {tasks.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: 13 }}>
            Добавьте задачи и укажите даты, чтобы увидеть диаграмму.
          </div>
        ) : (
          <GanttChart tasks={tasks} minDate={minDate} totalDays={totalDays} />
        )}
      </div>
    </div>
  )
}

function GanttChart({ tasks, minDate, totalDays }: { tasks: GanttTask[]; minDate: Date; totalDays: number }) {
  const DAY_W = 28
  const ROW_H = 33
  const MONTH_H = 20

  const days = Array.from({ length: totalDays }, (_, i) => {
    const d = new Date(minDate)
    d.setDate(d.getDate() + i)
    return d
  })

  // Group days into month spans for the month header row
  const monthGroups: { label: string; count: number }[] = []
  for (const d of days) {
    const label = format(d, 'LLL yyyy', { locale: ru })
    if (monthGroups.length === 0 || monthGroups[monthGroups.length - 1].label !== label) {
      monthGroups.push({ label, count: 1 })
    } else {
      monthGroups[monthGroups.length - 1].count++
    }
  }

  const todayOffset = differenceInDays(startOfDay(new Date()), minDate)
  const showToday = todayOffset >= 0 && todayOffset < totalDays

  return (
    <div style={{ minWidth: totalDays * DAY_W + 1, position: 'relative' }}>
      {/* Month header */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, background: '#f8fafc', zIndex: 2 }}>
        {monthGroups.map(({ label, count }, i) => (
          <div key={i} style={{
            width: count * DAY_W, flexShrink: 0, fontSize: 10, fontWeight: 700,
            color: '#475569', padding: '3px 6px', textAlign: 'left',
            borderLeft: i > 0 ? '1px solid #e2e8f0' : 'none',
            overflow: 'hidden', whiteSpace: 'nowrap', height: MONTH_H, boxSizing: 'border-box',
          }}>
            {label}
          </div>
        ))}
      </div>

      {/* Day header */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: MONTH_H, background: '#fff', zIndex: 1 }}>
        {days.map((d, i) => {
          const isMonday = d.getDay() === 1
          const isToday = i === todayOffset
          return (
            <div key={i} style={{
              width: DAY_W, flexShrink: 0, textAlign: 'center', fontSize: 10,
              color: isToday ? '#ef4444' : '#94a3b8', fontWeight: isToday ? 700 : 400,
              padding: '4px 0', borderLeft: isMonday ? '1px solid #e2e8f0' : '1px solid #f8fafc',
              background: isToday ? '#fef2f2' : (d.getDay() === 0 || d.getDay() === 6 ? '#f8fafc' : '#fff'),
            }}>
              {format(d, 'd', { locale: ru })}
            </div>
          )
        })}
      </div>

      {/* Task rows + today line */}
      <div style={{ position: 'relative' }}>
        {showToday && (
          <div style={{
            position: 'absolute', left: todayOffset * DAY_W + Math.floor(DAY_W / 2) - 1,
            top: 0, bottom: 0, width: 2, background: 'rgba(239,68,68,0.4)', zIndex: 1, pointerEvents: 'none',
          }} />
        )}
        {tasks.map((t) => {
          const start = t.start_date ? differenceInDays(startOfDay(parseISO(t.start_date)), minDate) : null
          const end   = t.deadline   ? differenceInDays(startOfDay(parseISO(t.deadline)),   minDate) : null
          const left  = start != null ? Math.max(0, start) * DAY_W : null
          const width = start != null && end != null ? Math.max(1, end - start + 1) * DAY_W : null

          return (
            <div key={t.id} style={{ height: ROW_H, position: 'relative', display: 'flex', alignItems: 'center', borderBottom: '1px solid #f1f5f9' }}>
              {days.map((d, i) => (
                (d.getDay() === 0 || d.getDay() === 6) && (
                  <div key={i} style={{ position: 'absolute', left: i * DAY_W, width: DAY_W, height: '100%', background: '#f8fafc' }} />
                )
              ))}
              {left != null && width != null && (
                <div
                  title={`${t.name}: ${fmtDate(t.start_date)} – ${fmtDate(t.deadline)}`}
                  style={{
                    position: 'absolute', left: left + 2, width: width - 4,
                    height: 18, borderRadius: 4,
                    background: t.done ? '#bbf7d0' : '#bfdbfe',
                    border: `1px solid ${t.done ? '#22c55e' : '#3b82f6'}`,
                    opacity: t.done ? 0.7 : 1,
                    zIndex: 1,
                  }}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── NotesTab ─────────────────────────────────────────────────────────────────

export function NotesTab({ matrixId }: { matrixId: string }) {
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const currentUser = useCurrentUser()

  const { data: notes = [], isLoading } = useQuery<MatrixNote[]>({
    queryKey: ['matrix-notes', matrixId],
    queryFn: () => api.get(`/matrix-notes?matrixId=${matrixId}`).then((r) => r.data),
    staleTime: 30_000,
  })

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [notes.length])

  const addNote = useMutation({
    mutationFn: () => api.post('/matrix-notes', { matrixId, text: text.trim() }).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['matrix-notes', matrixId] }); setText('') },
  })

  const deleteNote = useMutation({
    mutationFn: (id: string) => api.delete(`/matrix-notes/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['matrix-notes', matrixId] }),
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {isLoading && <div style={{ color: '#94a3b8', fontSize: 13 }}>Загрузка...</div>}
        {!isLoading && notes.length === 0 && (
          <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, marginTop: 32 }}>
            Нет заметок. Напишите первую.
          </div>
        )}
        {notes.map((n) => {
          const isOwn = currentUser?.id === n.user_id
          return (
            <div key={n.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <div
                style={{
                  width: 30, height: 30, borderRadius: '50%', background: '#dbeafe', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, color: '#2563eb',
                }}
              >
                {n.author_name.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{n.author_name}</span>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>
                    {format(new Date(n.created_at), 'd MMM, HH:mm', { locale: ru })}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {n.text}
                </div>
              </div>
              {isOwn && (
                <button
                  onClick={() => deleteNote.mutate(n.id)}
                  style={{ fontSize: 12, color: '#cbd5e1', border: 'none', background: 'none', cursor: 'pointer', padding: '4px', flexShrink: 0 }}
                  title="Удалить"
                >×</button>
              )}
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '10px 16px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 8 }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && text.trim()) addNote.mutate()
          }}
          placeholder="Написать заметку... (Ctrl+Enter для отправки)"
          rows={2}
          style={{
            flex: 1, fontSize: 13, padding: '7px 10px', border: '1px solid #e2e8f0',
            borderRadius: 8, resize: 'none', color: '#1e293b', background: '#fff', outline: 'none',
          }}
        />
        <button
          onClick={() => { if (text.trim()) addNote.mutate() }}
          disabled={!text.trim() || addNote.isPending}
          style={{
            fontSize: 12, padding: '0 14px', borderRadius: 8, border: 'none',
            background: '#2563eb', color: '#fff', cursor: 'pointer', flexShrink: 0, fontWeight: 500,
          }}
        >
          {addNote.isPending ? '...' : 'Отправить'}
        </button>
      </div>
    </div>
  )
}

// ─── DocumentsTab ─────────────────────────────────────────────────────────────

export function DocumentsTab({ matrixId }: { matrixId: string }) {
  const qc = useQueryClient()
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)

  const { data: docs = [], isLoading } = useQuery<MatrixDocument[]>({
    queryKey: ['matrix-documents', matrixId],
    queryFn: () => api.get(`/matrix-documents?matrixId=${matrixId}`).then((r) => r.data),
    staleTime: 30_000,
  })

  const addDoc = useMutation({
    mutationFn: () =>
      api.post('/matrix-documents', {
        matrixId,
        url: url.trim(),
        name: name.trim() || lastUrlSegment(url.trim()),
      }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['matrix-documents', matrixId] })
      setUrl(''); setName(''); setAdding(false)
    },
  })

  const deleteDoc = useMutation({
    mutationFn: (id: string) => api.delete(`/matrix-documents/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['matrix-documents', matrixId] }),
  })

  const inputS: React.CSSProperties = {
    fontSize: 13, padding: '7px 10px', border: '1px solid #e2e8f0',
    borderRadius: 6, color: '#1e293b', background: '#fff', width: '100%', boxSizing: 'border-box',
  }

  function docIcon(url: string): string {
    if (url.includes('docs.google.com/document')) return '📝'
    if (url.includes('docs.google.com/spreadsheets') || url.includes('sheets.google.com')) return '📊'
    if (url.includes('docs.google.com/presentation')) return '📌'
    if (url.match(/\.(pdf)$/i)) return '📄'
    if (url.match(/\.(png|jpg|jpeg|gif|webp)$/i)) return '🖼️'
    return '🔗'
  }

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, height: '100%', overflow: 'auto' }}>
      {isLoading && <div style={{ color: '#94a3b8', fontSize: 13 }}>Загрузка...</div>}

      {!isLoading && docs.length === 0 && !adding && (
        <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, marginTop: 32 }}>
          Нет прикреплённых документов.
        </div>
      )}

      {docs.map((d) => (
        <div
          key={d.id}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
            border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff',
          }}
        >
          <span style={{ fontSize: 18, flexShrink: 0 }}>{docIcon(d.url)}</span>
          <a
            href={d.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ flex: 1, fontSize: 13, color: '#2563eb', textDecoration: 'none', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            title={d.url}
          >
            {d.name}
          </a>
          <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>
            {format(new Date(d.created_at), 'd MMM yyyy', { locale: ru })}
          </span>
          <button
            onClick={() => deleteDoc.mutate(d.id)}
            style={{ fontSize: 13, color: '#cbd5e1', border: 'none', background: 'none', cursor: 'pointer', padding: '0 4px', flexShrink: 0 }}
            title="Удалить"
          >×</button>
        </div>
      ))}

      {adding && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Ссылка *</div>
            <input
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              style={inputS}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Название (необязательно)</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={url ? lastUrlSegment(url) : 'Название документа'}
              style={inputS}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => { if (url.trim()) addDoc.mutate() }}
              disabled={!url.trim() || addDoc.isPending}
              style={{ fontSize: 12, padding: '6px 14px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}
            >{addDoc.isPending ? '...' : 'Добавить'}</button>
            <button
              onClick={() => { setAdding(false); setUrl(''); setName('') }}
              style={{ fontSize: 12, padding: '6px 12px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'none', cursor: 'pointer', color: '#475569' }}
            >Отмена</button>
          </div>
          {addDoc.isError && (
            <div style={{ fontSize: 12, color: '#ef4444' }}>
              {(addDoc.error as any)?.response?.data?.error ?? 'Ошибка'}
            </div>
          )}
        </div>
      )}

      {!adding && (
        <button
          onClick={() => setAdding(true)}
          style={{ alignSelf: 'flex-start', fontSize: 12, padding: '6px 14px', borderRadius: 6, border: '1px dashed #cbd5e1', background: 'none', color: '#64748b', cursor: 'pointer' }}
        >
          + Прикрепить документ
        </button>
      )}
    </div>
  )
}
