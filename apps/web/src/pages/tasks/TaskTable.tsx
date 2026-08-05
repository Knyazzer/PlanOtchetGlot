import React, { useState } from 'react'
import { taskTypeMeta, fmtMinutes } from '../../lib/taskMeta'
import type { Task, SortKey } from './types'
import { toDateStr, fmtD } from './utils'

// ── Таблица задач (скелет Figma v2 TableView; наполнение — канон) ─────────────
export function TaskTable({ tasks, onEdit }: { tasks: Task[]; onEdit: (t: Task) => void }) {
  const [sortKey, setSortKey] = useState<SortKey>('startDate')
  const [sortDir, setSortDir] = useState<1 | -1>(-1)

  const sortVal = (t: Task, k: SortKey): string | number => {
    switch (k) {
      case 'title': return t.title.toLowerCase()
      case 'status': return t.status
      case 'client': return t.client ?? ''
      case 'project': return t.project?.title ?? ''
      case 'type': return t.type
      case 'minutes': return t.actualMinutes ?? t.plannedMinutes ?? -1
      case 'startDate': return t.startDate
      case 'deadline': return t.deadline ?? ''
    }
  }
  const sorted = [...tasks].sort((a, b) => {
    const va = sortVal(a, sortKey)
    const vb = sortVal(b, sortKey)
    return (va < vb ? -1 : va > vb ? 1 : 0) * sortDir
  })
  const clickSort = (k: SortKey) => {
    if (k === sortKey) setSortDir(d => (d === 1 ? -1 : 1))
    else { setSortKey(k); setSortDir(1) }
  }

  const TT_STATUS_LABEL: Record<string, string> = { backlog: 'Бэклог', inprogress: 'В работе', done: 'Готово' }
  const TT_STATUS_COLOR: Record<string, string> = { backlog: '#64748b', inprogress: '#0EA5E9', done: '#29BF12' }

  const th = (k: SortKey, label: string, right = false): React.ReactNode => (
    <th key={k} onClick={() => clickSort(k)} style={{
      padding: '8px 12px', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)',
      textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: right ? 'right' : 'left',
      borderBottom: '1px solid var(--border)', cursor: 'pointer', userSelect: 'none',
      position: 'sticky', top: 0, background: 'var(--surface-2)', whiteSpace: 'nowrap',
    }}>
      {label}{sortKey === k ? (sortDir === 1 ? ' ↑' : ' ↓') : ''}
    </th>
  )
  const td: React.CSSProperties = { padding: '8px 12px', fontSize: 14, color: 'var(--text-1)', borderBottom: '1px solid var(--border)' }

  return (
    <div style={{ flex: 1, overflow: 'auto', margin: '16px 28px 24px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface-2)' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr>
          {th('title', 'Задача')}
          {th('status', 'Статус')}
          {th('client', 'Клиент')}
          {th('project', 'Проект')}
          {th('type', 'Тип')}
          {th('minutes', 'Минуты', true)}
          {th('startDate', 'Дата')}
          {th('deadline', 'Дедлайн')}
        </tr></thead>
        <tbody>
          {sorted.length === 0 && (
            <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 28 }}>Нет задач</td></tr>
          )}
          {sorted.map(t => {
            const tm = taskTypeMeta(t.type)
            return (
              <tr key={t.id} onClick={() => onEdit(t)} style={{ cursor: 'pointer' }}
                onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(127,127,127,0.06)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent' }}>
                <td style={{ ...td, fontWeight: 500 }}>
                  {(t.repeatRule || t.recurringParentId) && <span title="Серия" style={{ marginRight: 5, color: 'var(--text-muted)' }}>↻</span>}
                  <span style={{ textDecoration: t.status === 'done' ? 'line-through' : 'none', opacity: t.status === 'done' ? 0.65 : 1 }}>{t.title}</span>
                </td>
                <td style={td}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: TT_STATUS_COLOR[t.status] }}>{TT_STATUS_LABEL[t.status] ?? t.status}</span>
                </td>
                <td style={{ ...td, color: 'var(--text-2)' }}>{t.client ?? '—'}</td>
                <td style={{ ...td, color: 'var(--text-2)' }}>{t.project?.title ?? '—'}</td>
                <td style={td}>
                  {tm && t.type !== 'task'
                    ? <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: tm.color + '22', color: tm.color }}>{tm.label}</span>
                    : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Задача</span>}
                </td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>
                  {(t.actualMinutes ?? t.plannedMinutes) != null ? fmtMinutes((t.actualMinutes ?? t.plannedMinutes)!) : '—'}
                </td>
                <td style={{ ...td, fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap' }}>{toDateStr(t.startDate)}</td>
                <td style={{ ...td, fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap', color: t.deadline && t.status !== 'done' && toDateStr(t.deadline) < fmtD(new Date()) ? '#E8194B' : 'var(--text-2)' }}>
                  {t.deadline ? toDateStr(t.deadline) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
