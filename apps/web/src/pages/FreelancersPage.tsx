import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

interface FreelancerRow {
  id: string
  project_id: string
  project_name: string
  project_date: string | null
  name: string
  position: string | null
  telegram_username: string | null
  payment_type: string | null
  payment_status: string
  payment_amount: string | null
}

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  cash: 'Наличные', card: 'Карта', sbp: 'СБП', invoice: 'Счёт',
}
const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid: 'Не оплачено', pending: 'Ожидает', paid: 'Оплачено',
}
const PAYMENT_STATUS_COLORS: Record<string, string> = {
  unpaid: '#ef4444', pending: '#f59e0b', paid: '#10b981',
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }) } catch { return d }
}

export function FreelancersPage() {
  const qc = useQueryClient()

  const [filterStatus, setFilterStatus] = useState('')
  const [filterMonth, setFilterMonth] = useState('')
  const [filterName, setFilterName] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const { data: rows = [], isLoading } = useQuery<FreelancerRow[]>({
    queryKey: ['freelancers', filterStatus, filterMonth],
    queryFn: () => {
      const params = new URLSearchParams({ freelancers: 'true' })
      if (filterStatus) params.set('status', filterStatus)
      if (filterMonth) params.set('month', filterMonth)
      return api.get(`/project-members?${params}`).then((r) => r.data)
    },
  })

  const filtered = useMemo(() => {
    if (!filterName) return rows
    const q = filterName.toLowerCase()
    return rows.filter((r) => r.name.toLowerCase().includes(q) || r.project_name?.toLowerCase().includes(q))
  }, [rows, filterName])

  const updateOne = useMutation({
    mutationFn: ({ id, paymentStatus }: { id: string; paymentStatus: string }) =>
      api.patch(`/project-members/${id}`, { paymentStatus }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['freelancers'] }),
  })

  const bulkUpdate = useMutation({
    mutationFn: ({ ids, paymentStatus }: { ids: string[]; paymentStatus: string }) =>
      api.post('/project-members/bulk-status', { ids, paymentStatus }).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['freelancers'] }); setSelected(new Set()) },
  })

  const toggleSelect = (id: string) =>
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) { next.delete(id) } else { next.add(id) }; return next })
  const toggleAll = () =>
    setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map((r) => r.id)))

  const pendingSelected = filtered.filter((r) => selected.has(r.id) && r.payment_status === 'pending')

  const thS: React.CSSProperties = {
    padding: '10px 12px', fontSize: 11, fontWeight: 700, color: '#64748b',
    textTransform: 'uppercase', letterSpacing: '0.04em',
    borderBottom: '2px solid #e2e8f0', background: '#f8fafc',
    textAlign: 'left', whiteSpace: 'nowrap',
  }
  const tdS: React.CSSProperties = { padding: '8px 12px', borderBottom: '1px solid #f1f5f9', fontSize: 13 }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1e293b' }}>Фрилансеры</h2>
        {selected.size > 0 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#64748b' }}>Выбрано: {selected.size}</span>
            {pendingSelected.length > 0 && (
              <button
                onClick={() => bulkUpdate.mutate({ ids: pendingSelected.map((r) => r.id), paymentStatus: 'paid' })}
                disabled={bulkUpdate.isPending}
                style={{ fontSize: 12, padding: '6px 14px', borderRadius: 6, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#166534', cursor: 'pointer', fontFamily: 'inherit' }}>
                Отметить оплаченными ({pendingSelected.length})
              </button>
            )}
            <button
              onClick={() => bulkUpdate.mutate({ ids: [...selected], paymentStatus: 'pending' })}
              disabled={bulkUpdate.isPending}
              style={{ fontSize: 12, padding: '6px 14px', borderRadius: 6, border: '1px solid #fde68a', background: '#fffbeb', color: '#92400e', cursor: 'pointer', fontFamily: 'inherit' }}>
              Запросить оплату
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px' }}>
        <input
          value={filterName} onChange={(e) => setFilterName(e.target.value)}
          placeholder="Поиск по имени или проекту..."
          style={{ fontSize: 13, padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, minWidth: 220, outline: 'none' }}
        />
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          style={{ fontSize: 13, padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff' }}>
          <option value="">Все статусы</option>
          {Object.entries(PAYMENT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}
          style={{ fontSize: 13, padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff' }}
        />
        {(filterStatus || filterMonth || filterName) && (
          <button onClick={() => { setFilterStatus(''); setFilterMonth(''); setFilterName('') }}
            style={{ fontSize: 12, padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', cursor: 'pointer', fontFamily: 'inherit' }}>
            Сбросить
          </button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8', alignSelf: 'center' }}>
          {filtered.length} записей
        </span>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Загрузка...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Нет фрилансеров</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ ...thS, width: 36 }}>
                    <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={toggleAll} style={{ cursor: 'pointer' }} />
                  </th>
                  <th style={{ ...thS, minWidth: 150 }}>ФИО</th>
                  <th style={{ ...thS, minWidth: 100 }}>Должность</th>
                  <th style={{ ...thS, minWidth: 100, fontFamily: 'monospace' }}>Telegram</th>
                  <th style={{ ...thS, minWidth: 180 }}>Проект</th>
                  <th style={{ ...thS, minWidth: 90 }}>Дата</th>
                  <th style={{ ...thS, minWidth: 90 }}>Способ</th>
                  <th style={{ ...thS, minWidth: 80, textAlign: 'right' }}>Сумма</th>
                  <th style={{ ...thS, minWidth: 130 }}>Статус</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} style={{ background: selected.has(row.id) ? '#f0f7ff' : '#fff' }}>
                    <td style={{ ...tdS, textAlign: 'center' }}>
                      <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelect(row.id)} style={{ cursor: 'pointer' }} />
                    </td>
                    <td style={{ ...tdS, fontWeight: 600, color: '#1e293b' }}>{row.name}</td>
                    <td style={{ ...tdS, color: '#64748b' }}>{row.position || '—'}</td>
                    <td style={{ ...tdS, fontFamily: 'monospace', fontSize: 12, color: '#0891b2' }}>
                      {row.telegram_username || '—'}
                    </td>
                    <td style={{ ...tdS, color: '#334155' }}>{row.project_name || '—'}</td>
                    <td style={{ ...tdS, color: '#64748b', whiteSpace: 'nowrap' }}>{fmtDate(row.project_date)}</td>
                    <td style={{ ...tdS, color: '#64748b' }}>
                      {row.payment_type ? PAYMENT_TYPE_LABELS[row.payment_type] ?? row.payment_type : '—'}
                    </td>
                    <td style={{ ...tdS, textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>
                      {row.payment_amount ? Number(row.payment_amount).toLocaleString('ru-RU') + ' ₽' : '—'}
                    </td>
                    <td style={tdS}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: PAYMENT_STATUS_COLORS[row.payment_status] ?? '#64748b' }}>
                          {PAYMENT_STATUS_LABELS[row.payment_status] ?? row.payment_status}
                        </span>
                        {row.payment_status === 'unpaid' && (
                          <button onClick={() => updateOne.mutate({ id: row.id, paymentStatus: 'pending' })}
                            style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, border: '1px solid #fde68a', background: '#fffbeb', color: '#92400e', cursor: 'pointer', fontFamily: 'inherit' }}>
                            Запросить
                          </button>
                        )}
                        {row.payment_status === 'pending' && (
                          <button onClick={() => updateOne.mutate({ id: row.id, paymentStatus: 'paid' })}
                            style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#166534', cursor: 'pointer', fontFamily: 'inherit' }}>
                            Оплачено
                          </button>
                        )}
                        {row.payment_status === 'paid' && (
                          <button onClick={() => updateOne.mutate({ id: row.id, paymentStatus: 'unpaid' })}
                            style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, border: '1px solid #e2e8f0', background: 'none', color: '#94a3b8', cursor: 'pointer', fontFamily: 'inherit' }}>
                            Сбросить
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
