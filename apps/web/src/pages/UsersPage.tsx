import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

interface User {
  id: string
  fullName: string
  email: string
  role: 'employee' | 'admin' | 'producer'
  tabNumber: string | null
  isStaff: boolean
  isActive: boolean
  createdAt: string
}

export function UsersPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ['users', search],
    queryFn: () =>
      api.get('/users', { params: { search: search || undefined } }).then((r) => r.data),
  })

  const deactivate = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })

  const roleLabel = (role: string) => {
    if (role === 'admin') return 'Администратор'
    if (role === 'producer') return 'Продюсер'
    return 'Сотрудник'
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Сотрудники</h2>
        <button
          onClick={() => setShowForm(true)}
          style={{
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '8px 16px',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          + Добавить
        </button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Поиск по имени или email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: '8px 12px',
            border: '1px solid #d1d5db',
            borderRadius: 8,
            fontSize: 14,
            width: 300,
          }}
        />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Загрузка...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['ФИО', 'Email', 'Роль', 'Таб. №', 'Тип', 'Действия'].map((h) => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#374151' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={td}>{u.fullName}</td>
                  <td style={{ ...td, color: '#64748b' }}>{u.email}</td>
                  <td style={td}>
                    <span style={{
                      fontSize: 12,
                      padding: '2px 8px',
                      borderRadius: 10,
                      background: u.role === 'admin' ? '#ede9fe' : u.role === 'producer' ? '#e0f2fe' : '#dcfce7',
                      color: u.role === 'admin' ? '#7c3aed' : u.role === 'producer' ? '#0369a1' : '#16a34a',
                    }}>
                      {roleLabel(u.role)}
                    </span>
                  </td>
                  <td style={{ ...td, color: '#64748b' }}>{u.tabNumber ?? '—'}</td>
                  <td style={td}>{u.isStaff ? 'Штат' : 'Фрилансер'}</td>
                  <td style={td}>
                    <button
                      onClick={() => {
                        if (confirm(`Деактивировать ${u.fullName}?`)) deactivate.mutate(u.id)
                      }}
                      style={{
                        background: 'transparent',
                        border: '1px solid #fca5a5',
                        color: '#dc2626',
                        borderRadius: 6,
                        padding: '3px 10px',
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
                    Сотрудники не найдены
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {showForm && <CreateUserModal onClose={() => setShowForm(false)} />}
    </div>
  )
}

function CreateUserModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    role: 'employee',
    tabNumber: '',
    isStaff: true,
  })
  const [error, setError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: (data: typeof form) => api.post('/users', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      onClose()
    },
    onError: (e: any) => setError(e.response?.data?.error ?? 'Ошибка'),
  })

  const field = (label: string, key: keyof typeof form, type = 'text') => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4, color: '#374151' }}>
        {label}
      </label>
      <input
        type={type}
        value={form[key] as string}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
      />
    </div>
  )

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
        <h3 style={{ margin: '0 0 20px', fontSize: 17, fontWeight: 600 }}>Новый сотрудник</h3>

        {field('ФИО', 'fullName')}
        {field('Email', 'email', 'email')}
        {field('Пароль', 'password', 'password')}
        {field('Табельный номер', 'tabNumber')}

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4, color: '#374151' }}>Роль</label>
          <select
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}
          >
            <option value="employee">Сотрудник</option>
            <option value="admin">Администратор</option>
            <option value="producer">Продюсер</option>
          </select>
        </div>

        {error && <div style={{ marginBottom: 14, color: '#dc2626', fontSize: 13 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}>
            Отмена
          </button>
          <button
            onClick={() => create.mutate(form)}
            disabled={create.isPending}
            style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontWeight: 500 }}
          >
            {create.isPending ? 'Создание...' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  )
}

const td: React.CSSProperties = { padding: '10px 16px', fontSize: 14 }
