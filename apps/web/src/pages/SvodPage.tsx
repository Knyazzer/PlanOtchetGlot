import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useCurrentUser } from '../hooks/useAuth'
import { useIsMobile } from '../hooks/useIsMobile'
import { formatName } from '../lib/utils'
import { DayModal } from '../components/DayModal'

// Свод (План/Отчёт): месячная сетка день × сотрудник подразделения. ТОЛЬКО ДАННЫЕ (read-only,
// решение docs/DECISION-2026-08-09): без редактирования дня и без «баллов». Рядовой сотрудник видит
// только себя; отдел — руководитель/директор/админ. Встраивается в «Аналитику» (общий месяц через props).

type Department = {
  id: string; name: string
  divisions: Array<{ id: string; name: string }>
}
type SvodCell = { dayFormat: string | null; workMinutes: number; taskCount: number; taskMinutes: number; tasksDone: number }
type SvodRow = {
  user: { id: string; name: string; position: string }
  cells: Record<string, SvodCell>
  totals: { workMinutes: number; hours: number; score: number; tasksDone: number; tasksTotal: number; filledDays: number }
}
type SvodData = {
  division: { id: string; name: string }
  month: string
  daysInMonth: number
  formats: Array<{ key: string; label: string; isWork: boolean; score: number | null }>
  rows: SvodRow[]
}

const FORMAT_COLORS: Record<string, string> = {
  office: '#3b82f6', remote: '#8b5cf6', shift_air: '#ef4444', shift_edit: '#f97316',
  shift_prep: '#eab308', trip: '#14b8a6', vacation: '#22c55e', sick: '#f43f5e',
  dayoff: '#64748b', unpaid: '#94a3b8',
}

function monthStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function shiftMonth(m: string, delta: number): string {
  const [y, mo] = m.split('-').map(Number)
  return monthStr(new Date(y, mo - 1 + delta, 1))
}
function monthTitle(m: string): string {
  const [y, mo] = m.split('-').map(Number)
  return new Date(y, mo - 1, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
}

export function SvodPage({ month: monthProp, onMonthChange, embedded = false }: { month?: string; onMonthChange?: (m: string) => void; embedded?: boolean } = {}) {
  const user = useCurrentUser()
  const [monthState, setMonthState] = useState(() => monthStr(new Date()))
  const month = monthProp ?? monthState
  const setMonthBy = (delta: number) => { const nm = shiftMonth(month, delta); onMonthChange ? onMonthChange(nm) : setMonthState(nm) }
  const [divisionId, setDivisionId] = useState('')
  const [viewDay, setViewDay] = useState<{ userId: string; userName: string; date: string } | null>(null) // просмотр задач дня (read-only)
  const isMobile = useIsMobile()

  const isAdmin = !!user?.isAdmin
  const directorDeptIds: string[] = (user?.access as any)?.directorDeptIds ?? []
  const userDivisionIds: string[] = (user?.access as any)?.divisionIds ?? []
  // Рядовой сотрудник (level=member) видит только СЕБЯ; отдел — руководитель/директор/админ.
  const selfOnly = !isAdmin && (user?.access?.level ?? 'member') === 'member'
  // Директор видит dropdown с отделами своих департаментов; head — свой отдел; member — без dropdown (только он сам)
  const showDropdown = !selfOnly && (isAdmin || directorDeptIds.length > 0)

  const { data: structure = [] } = useQuery<Department[]>({
    queryKey: ['structure'],
    queryFn: () => api.get('/structure').then(r => r.data),
    staleTime: 1000 * 60 * 5,
  })
  const divisions = useMemo(() => {
    const all = structure.flatMap(d => d.divisions.map(v => ({ ...v, deptName: d.name, deptId: d.id })))
    if (isAdmin) return all
    if (directorDeptIds.length > 0) return all.filter(v => directorDeptIds.includes(v.deptId))
    // member / head — только свои отделы
    return all.filter(v => userDivisionIds.includes(v.id))
  }, [structure, isAdmin, directorDeptIds, userDivisionIds])

  const effectiveDivId = divisionId || divisions[0]?.id || ''

  const { data: svod, isLoading, isError, error } = useQuery<SvodData>({
    queryKey: ['svod', effectiveDivId, month],
    queryFn: () => api.get(`/svod?divisionId=${effectiveDivId}&month=${month}`).then(r => r.data),
    enabled: !!effectiveDivId,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    retry: false,
  })

  const today = new Date().toISOString().slice(0, 10)
  const days = useMemo(() => {
    if (!svod) return []
    return Array.from({ length: svod.daysInMonth }, (_, i) => {
      const key = `${svod.month}-${String(i + 1).padStart(2, '0')}`
      const date = new Date(key)
      const wd = date.getDay()
      return { key, day: i + 1, weekend: wd === 0 || wd === 6, isToday: key === today }
    })
  }, [svod, today])

  // Рядовому — только его строка; руководителю/директору/админу — весь отдел
  const rows = useMemo(() => {
    if (!svod) return []
    return selfOnly ? svod.rows.filter(r => r.user.id === user?.id) : svod.rows
  }, [svod, selfOnly, user?.id])

  const fmtLabel = (key: string | null) =>
    key ? (svod?.formats.find(f => f.key === key)?.label ?? key) : ''

  const th: React.CSSProperties = {
    padding: '6px 4px', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center',
    borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--surface-2)', zIndex: 2,
  }

  return (
    <div style={embedded ? { display: 'flex', flexDirection: 'column' } : { padding: '20px 24px', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header — во встроенном режиме заголовок и навигацию месяца даёт родитель; тут только выбор отдела (руководителю) */}
      {(!embedded || showDropdown) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          {!embedded && <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-1)' }}>Свод · План/Отчёт</h1>}
          {showDropdown ? (
            <select
              value={effectiveDivId}
              onChange={e => setDivisionId(e.target.value)}
              style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', color: 'var(--text-1)', fontFamily: 'Inter,sans-serif', fontSize: 14 }}
            >
              {divisions.map(d => <option key={d.id} value={d.id}>{(d as any).deptName} · {d.name}</option>)}
            </select>
          ) : !embedded && divisions[0] ? (
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', padding: '4px 0' }}>
              {(divisions[0] as any).deptName} · {divisions[0].name}
            </span>
          ) : null}
          {!embedded && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={() => setMonthBy(-1)} style={navBtn}>‹</button>
              <span style={{ minWidth: 130, textAlign: 'center', fontSize: 14, fontWeight: 700, color: 'var(--text-1)', textTransform: 'capitalize' }}>{monthTitle(month)}</span>
              <button onClick={() => setMonthBy(1)} style={navBtn}>›</button>
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      {svod && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          {svod.formats.map(f => (
            <span key={f.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-2)' }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: FORMAT_COLORS[f.key] ?? '#888' }} />
              {f.label}
            </span>
          ))}
        </div>
      )}

      {isLoading && <div style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>Загрузка…</div>}
      {isError && (
        <div style={{ color: '#dc2626', padding: 40, textAlign: 'center' }}>
          {(error as any)?.response?.status === 403
            ? 'Нет доступа к своду этого подразделения'
            : 'Ошибка загрузки свода'}
        </div>
      )}
      {svod && !rows.length && !isLoading && (
        <div style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>В подразделении нет активных сотрудников</div>
      )}

      {/* Мобайл: сетка непригодна — персональная лента «мои дни» (полная сетка на десктопе), read-only */}
      {isMobile && svod && rows.length > 0 && (() => {
        const myRow = rows.find(r => r.user.id === user?.id) ?? rows[0]
        return (
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>
              {myRow.user.id === user?.id ? 'Мои дни' : formatName(myRow.user.name)} · итого {myRow.totals.hours}ч · задачи {myRow.totals.tasksDone}/{myRow.totals.tasksTotal}
            </div>
            {days.map(d => {
              const c = myRow.cells[d.key]
              const color = c?.dayFormat ? FORMAT_COLORS[c.dayFormat] ?? '#888' : null
              return (
                <div key={d.key}
                  onClick={() => setViewDay({ userId: myRow.user.id, userName: formatName(myRow.user.name), date: d.key })}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                    borderRadius: 10, border: `1px solid ${d.isToday ? 'var(--accent-s)' : 'var(--border)'}`,
                    background: 'var(--surface-2)', fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer',
                    opacity: d.weekend && !c?.dayFormat ? 0.55 : 1,
                  }}>
                  <span style={{ width: 34, fontFamily: 'monospace', fontSize: 12, fontWeight: d.isToday ? 800 : 500, color: d.isToday ? 'var(--accent-s)' : d.weekend ? '#f43f5e' : 'var(--text-3)', flexShrink: 0 }}>{d.day}</span>
                  {color ? (
                    <>
                      <span style={{ width: 9, height: 9, borderRadius: 3, background: color, flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 14, color: 'var(--text-1)' }}>{fmtLabel(c!.dayFormat)}</span>
                      {(c!.taskMinutes > 0 || c!.workMinutes > 0) && (
                        <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-3)' }}>
                          {Math.round(((c!.taskMinutes || c!.workMinutes) / 6)) / 10}ч
                        </span>
                      )}
                      {c!.taskCount > 0 && (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{c!.tasksDone}/{c!.taskCount}</span>
                      )}
                    </>
                  ) : (
                    <span style={{ flex: 1, fontSize: 12, color: 'var(--text-muted)' }}>{d.weekend ? 'выходной' : 'не заполнено'}</span>
                  )}
                </div>
              )
            })}
          </div>
        )
      })()}

      {!isMobile && svod && rows.length > 0 && (
        <div style={{ flex: 1, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface-2)' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left', left: 0, zIndex: 3, minWidth: 170, position: 'sticky' }}>Сотрудник</th>
                {days.map(d => (
                  <th key={d.key} style={{ ...th, minWidth: 30, color: d.isToday ? 'var(--accent, #2563eb)' : d.weekend ? '#f43f5e' : 'var(--text-muted)' }}>
                    {d.day}
                  </th>
                ))}
                <th style={{ ...th, minWidth: 56 }}>Часы</th>
                <th style={{ ...th, minWidth: 60 }}>Задачи</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.user.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '7px 10px', fontSize: 14, color: row.user.id === user?.id ? 'var(--accent, #2563eb)' : 'var(--text-1)', fontWeight: row.user.id === user?.id ? 700 : 500, position: 'sticky', left: 0, background: 'var(--surface-2)', zIndex: 1, whiteSpace: 'nowrap' }}>
                    {formatName(row.user.name)}
                    {row.user.position && <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>{row.user.position}</div>}
                  </td>
                  {days.map(d => {
                    const c = row.cells[d.key]
                    const color = c?.dayFormat ? FORMAT_COLORS[c.dayFormat] ?? '#888' : null
                    return (
                      <td
                        key={d.key}
                        onClick={() => setViewDay({ userId: row.user.id, userName: formatName(row.user.name), date: d.key })}
                        title={c?.dayFormat ? `${fmtLabel(c.dayFormat)}${c.workMinutes ? ` · ${Math.round(c.workMinutes / 6) / 10}ч` : ''}${c.taskCount ? ` · задач: ${c.taskCount} (${c.tasksDone} ✓)` : ''} — открыть` : 'Открыть день'}
                        style={{
                          padding: 2, textAlign: 'center', height: 34, cursor: 'pointer',
                          background: d.weekend ? 'rgba(244,63,94,0.04)' : undefined,
                        }}
                      >
                        {color && (
                          <div style={{
                            borderRadius: 6, background: `${color}22`, border: `1px solid ${color}55`,
                            fontSize: 12, fontFamily: 'monospace', color: 'var(--text-1)',
                            padding: '3px 1px', lineHeight: 1.25, minWidth: 26,
                          }}>
                            <div style={{ width: '100%', height: 3, borderRadius: 2, background: color, marginBottom: 2 }} />
                            {c.taskMinutes > 0 ? `${Math.round(c.taskMinutes / 6) / 10}ч` : c.workMinutes > 0 ? `${Math.round(c.workMinutes / 6) / 10}ч` : '·'}
                            {c.taskCount > 0 && <div style={{ color: 'var(--text-muted)' }}>{c.tasksDone}/{c.taskCount}</div>}
                          </div>
                        )}
                      </td>
                    )
                  })}
                  <td style={tdTotal}>{row.totals.hours}</td>
                  <td style={tdTotal}>{row.totals.tasksDone}/{row.totals.tasksTotal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Просмотр дня — задачи и тип дня БЕЗ правки (isOwn=false ⇒ read-only) */}
      {viewDay && (
        <DayModal
          userId={viewDay.userId}
          userName={viewDay.userName}
          date={viewDay.date}
          isOwn={false}
          onClose={() => setViewDay(null)}
        />
      )}
    </div>
  )
}

const navBtn: React.CSSProperties = {
  background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 8,
  width: 30, height: 30, color: 'var(--text-1)', fontSize: 16, cursor: 'pointer',
}
const tdTotal: React.CSSProperties = {
  padding: '4px 8px', textAlign: 'center', fontFamily: 'monospace', fontSize: 12,
  fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap',
}