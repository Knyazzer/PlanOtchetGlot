import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatName } from '../../lib/utils'
import type { WorkItem, WorkItemStatus } from './types'
import { WI_STATUS_LABEL, WI_STATUS_COLOR, inputStyle } from './constants'
import { fmtMoney } from './utils'

// ── WorkflowTab ───────────────────────────────────────────────────────────────

export function WorkflowTab() {
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')

  const { data: items = [], isLoading } = useQuery<WorkItem[]>({
    queryKey: ['workflow', statusFilter, search],
    queryFn: () => {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (search) params.set('search', search)
      return api.get(`/work-items?${params}`).then(r => r.data)
    },
    staleTime: 30_000,
  })

  const total = items.length
  const byStatus = Object.fromEntries(
    (Object.keys(WI_STATUS_LABEL) as WorkItemStatus[]).map(s => [s, items.filter(i => i.status === s).length])
  )

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div style={{
        padding: '10px 20px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap',
      }}>
        <input
          placeholder="Поиск по названию..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, width: 200, padding: '6px 10px', fontSize: 12 }}
        />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ ...inputStyle, width: 140, padding: '6px 8px', fontSize: 12 }}>
          <option value="">Все статусы</option>
          {(Object.entries(WI_STATUS_LABEL) as [WorkItemStatus, string][]).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>

        {/* Summary chips */}
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          {(Object.entries(WI_STATUS_LABEL) as [WorkItemStatus, string][]).map(([s, l]) =>
            byStatus[s] > 0 ? (
              <span key={s} style={{
                fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 5,
                background: `${WI_STATUS_COLOR[s]}18`, color: WI_STATUS_COLOR[s],
              }}>{l}: {byStatus[s]}</span>
            ) : null
          )}
          <span style={{ fontSize: 12, color: 'var(--text-muted)', padding: '2px 8px' }}>
            Всего: {total}
          </span>
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 16px' }}>
        {isLoading && (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>Загрузка...</div>
        )}
        {!isLoading && items.length === 0 && (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
            Нет work items
          </div>
        )}
        {items.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['Статус', 'Название', 'Проект', 'Дата', 'Треки', 'Бюджет'].map(h => (
                  <th key={h} style={{
                    padding: '8px 14px', textAlign: 'left',
                    borderBottom: '1px solid var(--border)',
                    fontWeight: 700, fontSize: 12, color: 'var(--text-muted)',
                    textTransform: 'uppercase', letterSpacing: '0.5px',
                    position: 'sticky', top: 0, background: 'var(--bg)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((wi, i) => (
                <tr key={wi.id} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                    <span style={{
                      fontSize: 12, fontWeight: 700,
                      color: WI_STATUS_COLOR[wi.status], background: `${WI_STATUS_COLOR[wi.status]}18`,
                      borderRadius: 4, padding: '1px 6px', textTransform: 'uppercase', letterSpacing: '0.4px',
                    }}>{WI_STATUS_LABEL[wi.status]}</span>
                  </td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', fontWeight: 600, color: 'var(--text-1)' }}>
                    {wi.title}
                    {wi.execProducer && (
                      <div style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginTop: 1 }}>
                        {formatName(wi.execProducer.name)}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                    {wi.project?.title ?? '—'}
                    {wi.project?.client && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>{wi.project.client.name}</div>
                    )}
                  </td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {wi.date ?? '—'}
                  </td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', textAlign: 'center' }}>
                    {wi._count.tracks > 0 ? wi._count.tracks : '—'}
                  </td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                    {fmtMoney(wi.budget)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}