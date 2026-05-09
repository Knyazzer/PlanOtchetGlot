import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../stores/auth'
import { api } from '../lib/api'

const HR_LABELS: Record<string, string> = {
  vacation:      'Отпуск',
  sick:          'Больничный',
  remote:        'Удалёнка',
  business_trip: 'Командировка',
  day_off:       'Отгул',
}

const STATUS_COLORS: Record<string, string> = {
  pending:  '#f59e0b',
  approved: '#16a34a',
  rejected: '#dc2626',
}

const STATUS_LABELS: Record<string, string> = {
  pending:  'Ожидает',
  approved: 'Одобрен',
  rejected: 'Отклонён',
}

type Tab = 'mine' | 'all'

interface HRRecord {
  id: string
  type: string
  dateFrom: string
  dateTo: string
  status: string
  notes?: string
  user: { id: string; fullName: string }
  approver?: { fullName: string }
}

const emptyForm = { type: 'vacation', dateFrom: '', dateTo: '', notes: '' }

export default function HRPage() {
  const user    = useAuthStore((s) => s.user)
  const qc      = useQueryClient()
  const isAdmin = user?.roles?.includes('admin') || user?.permissions?.includes('users:manage')

  const [tab, setTab]           = useState<Tab>('mine')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState(emptyForm)

  const { data: records = [] } = useQuery<HRRecord[]>({
    queryKey: ['hr-statuses', tab],
    queryFn:  () => api.get('/hr-statuses').then((r) => r.data),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })

  const displayed = tab === 'mine'
    ? records.filter((r) => r.user.id === user?.id)
    : records

  const createMutation = useMutation({
    mutationFn: (body: typeof form) =>
      api.post('/hr-statuses', body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-statuses'] })
      setShowForm(false)
      setForm(emptyForm)
    },
  })

  const approveMutation = useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) =>
      api.patch(`/hr-statuses/${id}/approve`, { approved }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr-statuses'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/hr-statuses/${id}`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['hr-statuses'] }),
  })

  const fmt = (d: string) => new Date(d).toLocaleDateString('ru-RU')

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>HR-заявки</h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          style={{
            background: '#2563eb', color: '#fff', border: 'none',
            borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13,
          }}
        >
          + Подать заявку
        </button>
      </div>

      {isAdmin && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          {(['mine', 'all'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '5px 14px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                background: tab === t ? '#2563eb' : '#f1f5f9',
                color:      tab === t ? '#fff'    : '#374151',
              }}
            >
              {t === 'mine' ? 'Мои заявки' : 'Все заявки'}
            </button>
          ))}
        </div>
      )}

      {showForm && (
        <div style={{
          background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8,
          padding: 16, marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end',
        }}>
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
          >
            {Object.entries(HR_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <input
            type="date" value={form.dateFrom}
            onChange={(e) => setForm({ ...form, dateFrom: e.target.value })}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
          />
          <input
            type="date" value={form.dateTo}
            onChange={(e) => setForm({ ...form, dateTo: e.target.value })}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
          />
          <input
            placeholder="Примечание" value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            style={{
              padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db',
              fontSize: 13, flex: 1, minWidth: 160,
            }}
          />
          <button
            onClick={() => createMutation.mutate(form)}
            disabled={!form.dateFrom || !form.dateTo || createMutation.isPending}
            style={{
              background: '#16a34a', color: '#fff', border: 'none',
              borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13,
            }}
          >
            Отправить
          </button>
          <button
            onClick={() => setShowForm(false)}
            style={{
              background: '#f1f5f9', border: 'none', borderRadius: 6,
              padding: '6px 14px', cursor: 'pointer', fontSize: 13,
            }}
          >
            Отмена
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {displayed.length === 0 && (
          <div style={{ color: '#6b7280', fontSize: 14, paddingTop: 24 }}>Заявок нет</div>
        )}
        {displayed.map((r) => (
          <div
            key={r.id}
            style={{
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
              padding: '12px 16px', display: 'flex', alignItems: 'center',
              gap: 12, flexWrap: 'wrap',
            }}
          >
            <span style={{
              background: STATUS_COLORS[r.status] + '20',
              color: STATUS_COLORS[r.status],
              borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 600, flexShrink: 0,
            }}>
              {STATUS_LABELS[r.status] ?? r.status}
            </span>
            <span style={{ fontSize: 14, fontWeight: 500 }}>
              {HR_LABELS[r.type] ?? r.type}
            </span>
            <span style={{ fontSize: 13, color: '#6b7280' }}>
              {fmt(r.dateFrom)} — {fmt(r.dateTo)}
            </span>
            {tab === 'all' && (
              <span style={{ fontSize: 13, color: '#374151' }}>{r.user.fullName}</span>
            )}
            {r.notes && (
              <span style={{ fontSize: 12, color: '#9ca3af', flex: 1 }}>{r.notes}</span>
            )}

            {isAdmin && r.status === 'pending' && (
              <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                <button
                  onClick={() => approveMutation.mutate({ id: r.id, approved: true })}
                  disabled={approveMutation.isPending}
                  style={{
                    background: '#16a34a', color: '#fff', border: 'none',
                    borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontSize: 12,
                  }}
                >
                  Одобрить
                </button>
                <button
                  onClick={() => approveMutation.mutate({ id: r.id, approved: false })}
                  disabled={approveMutation.isPending}
                  style={{
                    background: '#dc2626', color: '#fff', border: 'none',
                    borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontSize: 12,
                  }}
                >
                  Отклонить
                </button>
              </div>
            )}

            {r.user.id === user?.id && r.status === 'pending' && !isAdmin && (
              <button
                onClick={() => deleteMutation.mutate(r.id)}
                disabled={deleteMutation.isPending}
                style={{
                  background: 'none', color: '#9ca3af', border: 'none',
                  cursor: 'pointer', fontSize: 12, marginLeft: 'auto', padding: 0,
                }}
              >
                Отменить
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
