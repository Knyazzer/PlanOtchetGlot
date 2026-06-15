import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { api } from '../lib/api'
import { useCurrentUser } from '../hooks/useAuth'
import { formatName } from '../lib/utils'

// Аналитика (Этап 2): KPI-ряд + вкладки Сотрудники/Эффективность/Проекты,
// CSV-экспорт (UTF-8 BOM, разделитель «;» — формат донора, аудит §6).

type EmployeeRow = {
  userId: string; name: string; divName: string; deptName: string
  workDays: number; filledDays: number; hours: number; taskHours: number
  totalTasks: number; doneTasks: number; overdue: number; score: number
  loadPct: number | null
}
type ProjectRow = {
  name: string; count: number; done: number; hours: number
  employeeCount: number; progressPct: number; sharePct: number
}
type AnalyticsData = {
  period: { from: string; to: string; businessDays: number }
  kpi: {
    employees: number; hours: number; taskHours: number; fillPct: number
    score: number; tasksDone: number; tasksTotal: number; overdue: number
  }
  employees: EmployeeRow[]
  projects: ProjectRow[]
}

type Tab = 'employees' | 'efficiency' | 'projects'
type Scope = 'self' | 'team' | 'company'

function monthRange(d: Date): [string, string] {
  const from = new Date(d.getFullYear(), d.getMonth(), 1)
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  const f = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  return [f(from), f(to)]
}
function shiftMonth(from: string, delta: number): Date {
  const [y, m] = from.split('-').map(Number)
  return new Date(y, m - 1 + delta, 1)
}
function monthTitle(from: string): string {
  const [y, m] = from.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
}

function loadTone(pct: number | null): string {
  if (pct == null) return 'var(--text-muted)'
  if (pct >= 100) return '#E8194B'
  if (pct >= 80) return '#29BF12'
  if (pct >= 50) return '#F59E0B'
  return '#64748b'
}

// CSV: UTF-8 BOM + «;» (формат донора)
function downloadCsv(filename: string, header: string[], rows: (string | number | null)[][]) {
  const esc = (v: string | number | null) => {
    const s = v == null ? '' : String(v)
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = '﻿' + [header, ...rows].map(r => r.map(esc).join(';')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

export function AnalyticsPage() {
  const user = useCurrentUser()
  const [[from, to], setRange] = useState<[string, string]>(() => monthRange(new Date()))
  const [tab, setTab] = useState<Tab>('employees')
  const canCompany = !!user?.isAdmin || !!user?.access?.modules.some(m => m.key === 'adm.analytics-company')
  const [scope, setScope] = useState<Scope>('team')

  const { data, isLoading, isError } = useQuery<AnalyticsData>({
    queryKey: ['analytics', from, to, scope],
    queryFn: () => api.get(`/analytics?from=${from}&to=${to}&scope=${scope}`).then(r => r.data),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: false,
  })

  const chartData = useMemo(
    () => (data?.employees ?? []).filter(e => e.hours > 0).slice(0, 20).map(e => ({
      name: e.name.split(' ')[0] + ' ' + (e.name.split(' ')[1]?.[0] ?? '') + '.',
      Часы: e.hours,
      'Часы задач': e.taskHours,
    })),
    [data],
  )

  function exportCsv() {
    if (!data) return
    if (tab === 'projects') {
      downloadCsv(`analytics-projects-${from}.csv`,
        ['Проект', 'Задач', 'Выполнено', 'Часов', 'Сотрудников', 'Прогресс %', 'Доля %'],
        data.projects.map(p => [p.name, p.count, p.done, p.hours, p.employeeCount, p.progressPct, p.sharePct]))
    } else if (tab === 'efficiency') {
      downloadCsv(`analytics-efficiency-${from}.csv`,
        ['Сотрудник', 'Департамент', 'Отдел', 'Рабочих дней', 'План часов', 'Задачи часов', 'Нагрузка %'],
        data.employees.map(e => [e.name, e.deptName, e.divName, e.workDays, e.hours, e.taskHours, e.loadPct ?? '']))
    } else {
      downloadCsv(`analytics-employees-${from}.csv`,
        ['Сотрудник', 'Департамент', 'Отдел', 'Рабочих дней', 'Часов', 'Баллы', 'Задач', 'Выполнено'],
        data.employees.map(e => [e.name, e.deptName, e.divName, e.workDays, e.hours, e.score, e.totalTasks, e.doneTasks]))
    }
  }

  const kpiCards = data ? [
    { label: 'Сотрудников', value: data.kpi.employees, hint: 'в скоупе' },
    { label: 'Часов работы', value: `${data.kpi.hours}ч`, hint: `план задач ${data.kpi.taskHours}ч` },
    { label: 'Заполненность', value: `${data.kpi.fillPct}%`, hint: `${data.period.businessDays} раб. дней (календарь РФ)` },
    { label: 'Баллы', value: data.kpi.score, hint: 'Σ score форматов' },
    { label: 'Задачи', value: `${data.kpi.tasksDone}/${data.kpi.tasksTotal}`, hint: 'выполнено / всего' },
    { label: 'Просрочено', value: data.kpi.overdue, hint: 'открытых задач' },
  ] : []

  const th: React.CSSProperties = {
    padding: '8px 12px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'left',
    borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--surface-2)',
  }
  const td: React.CSSProperties = { padding: '8px 12px', fontSize: 13, color: 'var(--text-1)', borderBottom: '1px solid var(--border)' }
  const tdNum: React.CSSProperties = { ...td, fontFamily: 'monospace', textAlign: 'right' }

  return (
    <div style={{ padding: '20px 24px', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', gap: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--text-1)' }}>Аналитика</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => setRange(monthRange(shiftMonth(from, -1)))} style={navBtn}>‹</button>
          <span style={{ minWidth: 130, textAlign: 'center', fontSize: 14, fontWeight: 700, color: 'var(--text-1)', textTransform: 'capitalize' }}>{monthTitle(from)}</span>
          <button onClick={() => setRange(monthRange(shiftMonth(from, 1)))} style={navBtn}>›</button>
        </div>
        <div style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 8, padding: 3, gap: 2 }}>
          {([['self', 'Я'], ['team', 'Команда'], ...(canCompany ? [['company', 'Компания']] : [])] as [Scope, string][]).map(([v, label]) => (
            <button key={v} onClick={() => setScope(v)} style={{
              padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: scope === v ? 'var(--surface-1)' : 'none',
              color: scope === v ? 'var(--text-1)' : 'var(--text-muted)',
              fontFamily: 'inherit', fontSize: 12, fontWeight: scope === v ? 600 : 400,
            }}>{label}</button>
          ))}
        </div>
        <button onClick={exportCsv} disabled={!data} style={{ marginLeft: 'auto', padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          ⬇ CSV
        </button>
      </div>

      {isLoading && <div style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>Загрузка…</div>}
      {isError && <div style={{ color: '#dc2626', padding: 40, textAlign: 'center' }}>Нет доступа или ошибка загрузки</div>}

      {data && (
        <>
          {/* KPI */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            {kpiCards.map(k => (
              <div key={k.label} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{k.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'monospace', color: 'var(--text-1)' }}>{k.value}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{k.hint}</div>
              </div>
            ))}
          </div>

          {/* Chart */}
          {chartData.length > 0 && (
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px 6px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 8 }}>Часы по сотрудникам (план дня vs задачи)</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData} margin={{ left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} interval={0} angle={-25} height={46} textAnchor="end" />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="Часы" fill="#2563eb" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Часы задач" fill="#29BF12" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 8, padding: 3, gap: 2, width: 'fit-content' }}>
            {([['employees', 'Сотрудники'], ['efficiency', 'Эффективность'], ['projects', 'Проекты']] as [Tab, string][]).map(([v, label]) => (
              <button key={v} onClick={() => setTab(v)} style={{
                padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: tab === v ? 'var(--surface-1)' : 'none',
                color: tab === v ? 'var(--text-1)' : 'var(--text-muted)',
                fontFamily: 'inherit', fontSize: 12, fontWeight: tab === v ? 600 : 400,
              }}>{label}</button>
            ))}
          </div>

          {/* Tables */}
          <div style={{ flex: 1, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface-2)' }}>
            {tab === 'employees' && (
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead><tr>
                  <th style={th}>Сотрудник</th><th style={th}>Отдел</th>
                  <th style={{ ...th, textAlign: 'right' }}>Раб. дней</th>
                  <th style={{ ...th, textAlign: 'right' }}>Часов</th>
                  <th style={{ ...th, textAlign: 'right' }}>Баллы</th>
                  <th style={{ ...th, textAlign: 'right' }}>Задач</th>
                  <th style={{ ...th, textAlign: 'right' }}>Выполнено</th>
                  <th style={{ ...th, textAlign: 'right' }}>Просрочено</th>
                </tr></thead>
                <tbody>
                  {data.employees.map(e => (
                    <tr key={e.userId}>
                      <td style={td}>{formatName(e.name)}<div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{e.deptName}</div></td>
                      <td style={td}>{e.divName}</td>
                      <td style={tdNum}>{e.workDays}</td>
                      <td style={tdNum}>{e.hours}</td>
                      <td style={tdNum}>{e.score}</td>
                      <td style={tdNum}>{e.totalTasks}</td>
                      <td style={tdNum}>{e.doneTasks}</td>
                      <td style={{ ...tdNum, color: e.overdue ? '#E8194B' : 'var(--text-muted)' }}>{e.overdue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {tab === 'efficiency' && (
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead><tr>
                  <th style={th}>Сотрудник</th><th style={th}>Отдел</th>
                  <th style={{ ...th, textAlign: 'right' }}>План часов</th>
                  <th style={{ ...th, textAlign: 'right' }}>Задачи часов</th>
                  <th style={th}>Нагрузка</th>
                </tr></thead>
                <tbody>
                  {data.employees.map(e => (
                    <tr key={e.userId}>
                      <td style={td}>{formatName(e.name)}</td>
                      <td style={td}>{e.divName}</td>
                      <td style={tdNum}>{e.hours}</td>
                      <td style={tdNum}>{e.taskHours}</td>
                      <td style={{ ...td, minWidth: 160 }}>
                        {e.loadPct == null ? (
                          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>нет плана</span>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, height: 6, background: 'var(--surface-3)', borderRadius: 3 }}>
                              <div style={{ height: '100%', width: `${Math.min(e.loadPct, 100)}%`, background: loadTone(e.loadPct), borderRadius: 3 }} />
                            </div>
                            <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: loadTone(e.loadPct), minWidth: 40, textAlign: 'right' }}>{e.loadPct}%</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {tab === 'projects' && (
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead><tr>
                  <th style={th}>Проект</th>
                  <th style={{ ...th, textAlign: 'right' }}>Задач</th>
                  <th style={{ ...th, textAlign: 'right' }}>Выполнено</th>
                  <th style={{ ...th, textAlign: 'right' }}>Часов</th>
                  <th style={{ ...th, textAlign: 'right' }}>Сотрудников</th>
                  <th style={th}>Прогресс</th>
                  <th style={{ ...th, textAlign: 'right' }}>Доля</th>
                </tr></thead>
                <tbody>
                  {data.projects.map(p => (
                    <tr key={p.name}>
                      <td style={td}>{p.name}</td>
                      <td style={tdNum}>{p.count}</td>
                      <td style={tdNum}>{p.done}</td>
                      <td style={tdNum}>{p.hours}</td>
                      <td style={tdNum}>{p.employeeCount}</td>
                      <td style={{ ...td, minWidth: 140 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 6, background: 'var(--surface-3)', borderRadius: 3 }}>
                            <div style={{ height: '100%', width: `${p.progressPct}%`, background: '#2563eb', borderRadius: 3 }} />
                          </div>
                          <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-2)', minWidth: 36, textAlign: 'right' }}>{p.progressPct}%</span>
                        </div>
                      </td>
                      <td style={tdNum}>{p.sharePct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}

const navBtn: React.CSSProperties = {
  background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 8,
  width: 30, height: 30, color: 'var(--text-1)', fontSize: 16, cursor: 'pointer',
}
