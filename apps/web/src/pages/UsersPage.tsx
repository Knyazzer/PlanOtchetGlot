import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useCurrentUser } from '../hooks/useAuth'
import { OrgChartTab } from './OrgChartTab'

interface UserRole { roleId: string; role: { name: string } }

interface User {
  id: string
  fullName: string
  email: string
  userRoles: UserRole[]
  tabNumber: string | null
  isStaff: boolean
  isActive: boolean
  createdAt: string
}

interface ImpersonateResult {
  token: string
  url: string
  targetName: string
}

interface BulkResult {
  created: number
  skipped: number
  password: string
  accounts: { fullName: string; email: string }[]
}

interface StaffRow {
  tabNumber: string
  name: string
  position: string
  dept: string
  subDept: string
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Администратор',
  dept_director: 'Руководитель',
  producer: 'Продюсер',
  spec_projects: 'Спецпроекты',
  accountant: 'Бухгалтер',
  hr_manager: 'HR',
  employee: 'Сотрудник',
}

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  admin:         { bg: '#ede9fe', color: '#7c3aed' },
  dept_director: { bg: '#fef3c7', color: '#b45309' },
  producer:      { bg: '#e0f2fe', color: '#0369a1' },
  spec_projects: { bg: '#fce7f3', color: '#be185d' },
  accountant:    { bg: '#ecfdf5', color: '#065f46' },
  hr_manager:    { bg: '#fff7ed', color: '#c2410c' },
  employee:      { bg: '#dcfce7', color: '#16a34a' },
}

function parseTabNumber(s: string): number {
  const m = s.match(/\d+$/)
  return m ? parseInt(m[0], 10) : Infinity
}

function sortStaffRows(rows: StaffRow[]): StaffRow[] {
  return [...rows].sort((a, b) => {
    const aHas = !!a.tabNumber
    const bHas = !!b.tabNumber
    if (aHas && !bHas) return -1
    if (!aHas && bHas) return 1
    if (aHas && bHas) return parseTabNumber(a.tabNumber) - parseTabNumber(b.tabNumber)
    return a.name.localeCompare(b.name, 'ru')
  })
}

export function UsersPage() {
  const qc = useQueryClient()
  const me = useCurrentUser()
  const isAdmin = (me?.roles ?? []).includes('admin')

  const [tab, setTab] = useState<'list' | 'freelancers' | 'structure'>('list')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [registerTarget, setRegisterTarget] = useState<StaffRow | null>(null)
  const [impersonateResult, setImpersonateResult] = useState<ImpersonateResult | null>(null)
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null)

  const [filterDept, setFilterDept]     = useState('')
  const [filterSubDept, setFilterSubDept] = useState('')
  const [filterWorking, setFilterWorking] = useState<'all' | 'working' | 'not-working'>('all')

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ['users', search],
    queryFn: () =>
      api.get('/users', { params: { search: search || undefined } }).then((r) => r.data),
  })

  const { data: importData, isLoading: importLoading } = useQuery<{ rows: StaffRow[]; lastSyncedAt: string | null }>({
    queryKey: ['staff-import'],
    queryFn: () => api.get('/users/staff-import').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const refresh = useMutation({
    mutationFn: () => api.post('/users/staff-import/refresh').then((r) => r.data),
    onSuccess: (data) => qc.setQueryData(['staff-import'], data),
  })

  const deactivate = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError: (e: any) => alert(e?.response?.data?.error ?? 'Ошибка деактивации'),
  })

  const bulkRegister = useMutation({
    mutationFn: () => api.post('/users/bulk-register').then(r => r.data),
    onSuccess: (data: BulkResult) => {
      setBulkResult(data)
      qc.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (e: any) => alert(e?.response?.data?.error ?? 'Ошибка регистрации'),
  })

  const bulkDeactivate = useMutation({
    mutationFn: () => api.delete('/users/bulk-deactivate').then(r => r.data),
    onSuccess: (data: { deactivated: number }) => {
      alert(`Деактивировано аккаунтов: ${data.deactivated}`)
      qc.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (e: any) => alert(e?.response?.data?.error ?? 'Ошибка'),
  })

  const impersonate = useMutation({
    mutationFn: (userId: string) => api.post(`/auth/impersonate/${userId}`).then(r => r.data),
    onSuccess: (data: ImpersonateResult) => setImpersonateResult(data),
    onError: (e: any) => alert(e?.response?.data?.error ?? 'Ошибка'),
  })

  const allRows   = importData?.rows ?? []
  const depts     = [...new Set(allRows.map(r => r.dept).filter(Boolean))].sort()
  const subDepts  = [...new Set(allRows.filter(r => !filterDept || r.dept === filterDept).map(r => r.subDept).filter(Boolean))].sort()

  const filteredRows = allRows.filter(r => {
    if (filterDept && r.dept !== filterDept) return false
    if (filterSubDept && r.subDept !== filterSubDept) return false
    if (filterWorking === 'working' && !r.tabNumber) return false
    if (filterWorking === 'not-working' && r.tabNumber) return false
    return true
  })

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Персонал</h2>
        {tab === 'list' && (
          <div style={{ display: 'flex', gap: 8 }}>
            {isAdmin && (
              <button
                onClick={() => {
                  if (confirm('Деактивировать все аккаунты кроме администраторов?')) bulkDeactivate.mutate()
                }}
                disabled={bulkDeactivate.isPending}
                style={{ background: '#fff', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
              >
                {bulkDeactivate.isPending ? '...' : 'Удалить все аккаунты'}
              </button>
            )}
            <button
              onClick={() => setShowForm(true)}
              style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontWeight: 500 }}
            >
              + Добавить
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '2px solid #e2e8f0', marginBottom: 20 }}>
        {([
          { id: 'list',        label: 'Штат' },
          { id: 'freelancers', label: 'Фрилансеры' },
          { id: 'structure',   label: 'Структура' },
        ] as const).map(t => (
          <div
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '7px 20px', fontSize: 14, fontWeight: 500, cursor: 'pointer',
              color: tab === t.id ? '#2563eb' : '#64748b',
              borderBottom: tab === t.id ? '2px solid #2563eb' : '2px solid transparent',
              marginBottom: -2,
            }}
          >
            {t.label}
          </div>
        ))}
      </div>

      {tab === 'structure' && <OrgChartTab />}
      {tab === 'freelancers' && <FreelancersImportTab />}

      {tab === 'list' && (
      <>
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Поиск по имени или email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, width: 300 }}
        />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Загрузка...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['ФИО', 'Email', 'Роли', 'Таб. №', 'Тип', 'Действия'].map((h) => (
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
                    {u.userRoles.length > 0 ? u.userRoles.map(ur => {
                      const c = ROLE_COLORS[ur.role.name] ?? { bg: '#f1f5f9', color: '#64748b' }
                      return (
                        <span key={ur.roleId} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, background: c.bg, color: c.color, marginRight: 4, display: 'inline-block' }}>
                          {ROLE_LABELS[ur.role.name] ?? ur.role.name}
                        </span>
                      )
                    }) : (
                      <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, background: '#f1f5f9', color: '#94a3b8' }}>—</span>
                    )}
                  </td>
                  <td style={{ ...td, color: '#64748b' }}>{u.tabNumber ?? '—'}</td>
                  <td style={td}>{u.isStaff ? 'Штат' : 'Фрилансер'}</td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {isAdmin && u.id !== me?.id && (
                        <button
                          onClick={() => impersonate.mutate(u.id)}
                          disabled={impersonate.isPending}
                          style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontSize: 12 }}
                        >
                          Войти как
                        </button>
                      )}
                      {isAdmin && u.id !== me?.id && (
                        <button
                          onClick={() => {
                            if (confirm(`Деактивировать ${u.fullName}?`)) deactivate.mutate(u.id)
                          }}
                          style={{ background: 'transparent', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontSize: 12 }}
                        >
                          Удалить
                        </button>
                      )}
                    </div>
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

      {/* ── Imported staff ── */}
      <div style={{ marginTop: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Импортированные сотрудники</h3>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>
            {importData?.lastSyncedAt
              ? `Обновлено: ${new Date(importData.lastSyncedAt).toLocaleString('ru-RU')}`
              : 'Данные не загружены'}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {isAdmin && allRows.length > 0 && (
              <button
                onClick={() => {
                  if (confirm(`Зарегистрировать всех сотрудников из списка (${allRows.length} чел.)?\n\nАвто-email: фамилия@tvshifts.ru\nПароль: Tvshifts2026`)) {
                    bulkRegister.mutate()
                  }
                }}
                disabled={bulkRegister.isPending}
                style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #bfdbfe', background: '#eff6ff', cursor: 'pointer', fontSize: 13, color: '#2563eb', fontWeight: 500 }}
              >
                {bulkRegister.isPending ? 'Регистрация...' : 'Зарегистрировать всех'}
              </button>
            )}
            <button
              onClick={() => refresh.mutate()}
              disabled={refresh.isPending}
              style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 13, color: '#475569' }}
            >
              {refresh.isPending ? 'Загрузка...' : '↻ Обновить из таблицы'}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <select
            value={filterDept}
            onChange={e => { setFilterDept(e.target.value); setFilterSubDept('') }}
            style={selectStyle}
          >
            <option value="">Все департаменты</option>
            {depts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select
            value={filterSubDept}
            onChange={e => setFilterSubDept(e.target.value)}
            style={selectStyle}
          >
            <option value="">Все отделы</option>
            {subDepts.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={filterWorking}
            onChange={e => setFilterWorking(e.target.value as typeof filterWorking)}
            style={selectStyle}
          >
            <option value="all">Все статусы</option>
            <option value="working">Работают (есть таб. №)</option>
            <option value="not-working">Не работают</option>
          </select>
          <span style={{ fontSize: 13, color: '#64748b', alignSelf: 'center' }}>
            {filteredRows.length} из {allRows.length}
          </span>
        </div>

        {/* Table */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          {importLoading ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Загрузка...</div>
          ) : allRows.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
              Нажмите «Обновить из таблицы» чтобы загрузить сотрудников из Google Sheets
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {['Таб. №', 'ФИО', 'Должность', 'Департамент', 'Отдел', 'Статус', ''].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#374151' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortStaffRows(filteredRows).map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ ...td, color: '#64748b', fontFamily: 'monospace' }}>{r.tabNumber || '—'}</td>
                    <td style={td}>{r.name}</td>
                    <td style={{ ...td, color: '#64748b' }}>{r.position || '—'}</td>
                    <td style={{ ...td, color: '#64748b' }}>{r.dept || '—'}</td>
                    <td style={{ ...td, color: '#64748b' }}>{r.subDept || '—'}</td>
                    <td style={td}>
                      <span style={{
                        fontSize: 12, padding: '2px 8px', borderRadius: 10,
                        background: r.tabNumber ? '#dcfce7' : '#f1f5f9',
                        color: r.tabNumber ? '#16a34a' : '#94a3b8',
                      }}>
                        {r.tabNumber ? 'Работает' : 'Не работает'}
                      </span>
                    </td>
                    <td style={td}>
                      <button
                        onClick={() => setRegisterTarget(r)}
                        style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#2563eb', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}
                      >
                        Зарегистрировать
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {registerTarget && (
        <RegisterModal
          staff={registerTarget}
          onClose={() => setRegisterTarget(null)}
          onSuccess={() => {
            setRegisterTarget(null)
            qc.invalidateQueries({ queryKey: ['users'] })
          }}
        />
      )}

      {impersonateResult && (
        <ImpersonationModal result={impersonateResult} onClose={() => setImpersonateResult(null)} />
      )}

      {bulkResult && (
        <BulkResultModal result={bulkResult} onClose={() => setBulkResult(null)} />
      )}
      </>
      )}
    </div>
  )
}

// ── Modals ────────────────────────────────────────────────────────────────────

function ImpersonationModal({ result, onClose }: { result: ImpersonateResult; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 500, boxShadow: '0 8px 32px rgba(0,0,0,.15)' }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 600 }}>Войти как: {result.targetName}</h3>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b' }}>
          Ссылка действует 5 минут. Откройте в режиме инкогнито (Ctrl+Shift+N).
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20 }}>
          <input
            readOnly
            value={result.url}
            onClick={e => (e.target as HTMLInputElement).select()}
            style={{ flex: 1, padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, fontFamily: 'monospace', color: '#374151', background: '#f8fafc' }}
          />
          <button
            onClick={() => {
              navigator.clipboard.writeText(result.url)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            }}
            style={{
              padding: '8px 14px', borderRadius: 6, border: '1px solid #d1d5db',
              background: copied ? '#dcfce7' : '#fff', cursor: 'pointer', fontSize: 13,
              color: copied ? '#16a34a' : '#374151', whiteSpace: 'nowrap', transition: 'all .15s',
            }}
          >
            {copied ? '✓ Скопировано' : 'Копировать'}
          </button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}

function BulkResultModal({ result, onClose }: { result: BulkResult; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 500, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,.15)' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 600 }}>Результаты регистрации</h3>
        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
          <div style={{ flex: 1, textAlign: 'center', padding: '14px 20px', background: '#dcfce7', borderRadius: 10 }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#16a34a' }}>{result.created}</div>
            <div style={{ fontSize: 12, color: '#16a34a', marginTop: 2 }}>Зарегистрировано</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center', padding: '14px 20px', background: '#f1f5f9', borderRadius: 10 }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#64748b' }}>{result.skipped}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Пропущено (уже есть)</div>
          </div>
        </div>
        <div style={{ marginBottom: 16, padding: '10px 14px', background: '#eff6ff', borderRadius: 8, fontSize: 13, color: '#1e40af' }}>
          Пароль для всех: <strong style={{ fontFamily: 'monospace' }}>{result.password}</strong>
        </div>
        {result.accounts.length > 0 && (
          <div style={{ flex: 1, overflowY: 'auto', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#374151' }}>
              Созданные аккаунты ({result.accounts.length}):
            </div>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
              {result.accounts.map((a, i) => (
                <div key={i} style={{ padding: '7px 12px', borderBottom: i < result.accounts.length - 1 ? '1px solid #f1f5f9' : 'none', fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <span>{a.fullName}</span>
                  <span style={{ color: '#64748b', fontFamily: 'monospace', fontSize: 12, flexShrink: 0 }}>{a.email}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 20px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontWeight: 500 }}>
            Готово
          </button>
        </div>
      </div>
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
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
            {Object.entries(ROLE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
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

const selectStyle: React.CSSProperties = {
  padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 7,
  fontSize: 13, background: '#fff', color: '#374151', cursor: 'pointer',
}

function RegisterModal({ staff, onClose, onSuccess }: {
  staff: StaffRow
  onClose: () => void
  onSuccess: () => void
}) {
  const [form, setForm] = useState({ email: '', password: '', role: 'employee' })
  const [error, setError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () => api.post('/users', {
      fullName: staff.name,
      email: form.email,
      password: form.password,
      role: form.role,
      tabNumber: staff.tabNumber || undefined,
      isStaff: true,
    }),
    onSuccess,
    onError: (e: any) => setError(e.response?.data?.error ?? 'Ошибка'),
  })

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 400, boxShadow: '0 8px 32px rgba(0,0,0,.15)' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 600 }}>Зарегистрировать сотрудника</h3>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: '#64748b' }}>{staff.name} · {staff.position}</p>

        <div style={{ marginBottom: 14 }}>
          <label style={labelSt}>Email</label>
          <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={inputSt} placeholder="example@company.ru" />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelSt}>Пароль</label>
          <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} style={inputSt} placeholder="Минимум 6 символов" />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={labelSt}>Роль</label>
          <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} style={{ ...inputSt, cursor: 'pointer' }}>
            {Object.entries(ROLE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>

        {error && <div style={{ marginBottom: 14, color: '#dc2626', fontSize: 13 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}>
            Отмена
          </button>
          <button onClick={() => create.mutate()} disabled={create.isPending} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontWeight: 500 }}>
            {create.isPending ? 'Создание...' : 'Зарегистрировать'}
          </button>
        </div>
      </div>
    </div>
  )
}

const labelSt: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4, color: '#374151' }
const inputSt: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }

// ── Freelancers import tab ────────────────────────────────────────────────────
interface FreelancerRow { number: string; name: string; position: string }

function sortFreelancerRows(rows: FreelancerRow[]): FreelancerRow[] {
  return [...rows].sort((a, b) => {
    const aHas = !!a.number
    const bHas = !!b.number
    if (aHas && !bHas) return -1
    if (!aHas && bHas) return 1
    if (aHas && bHas) {
      const aNum = parseInt(a.number.replace(/\D/g, ''), 10)
      const bNum = parseInt(b.number.replace(/\D/g, ''), 10)
      return aNum - bNum
    }
    return a.name.localeCompare(b.name, 'ru')
  })
}

function FreelancersImportTab() {
  const qc = useQueryClient()
  const [filterPosition, setFilterPosition] = useState('')
  const [search, setSearch] = useState('')

  const { data: importData, isLoading } = useQuery<{ rows: FreelancerRow[]; lastSyncedAt: string | null }>({
    queryKey: ['freelancers-import'],
    queryFn: () => api.get('/users/freelancers-import').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const refresh = useMutation({
    mutationFn: () => api.post('/users/freelancers-import/refresh').then(r => r.data),
    onSuccess: (data) => qc.setQueryData(['freelancers-import'], data),
  })

  const allRows  = importData?.rows ?? []
  const positions = [...new Set(allRows.map(r => r.position).filter(Boolean))].sort()

  const filtered = allRows.filter(r => {
    if (filterPosition && r.position !== filterPosition) return false
    if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>
          {importData?.lastSyncedAt
            ? `Обновлено: ${new Date(importData.lastSyncedAt).toLocaleString('ru-RU')}`
            : 'Данные не загружены'}
        </span>
        <button
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
          style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 13, color: '#475569' }}
        >
          {refresh.isPending ? 'Загрузка...' : '↻ Обновить из таблицы'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          placeholder="Поиск по имени..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, width: 220 }}
        />
        <select value={filterPosition} onChange={e => setFilterPosition(e.target.value)} style={selectStyle}>
          <option value="">Все должности</option>
          {positions.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <span style={{ fontSize: 13, color: '#64748b', alignSelf: 'center' }}>
          {filtered.length} из {allRows.length}
        </span>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Загрузка...</div>
        ) : allRows.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
            Нажмите «Обновить из таблицы» чтобы загрузить реестр фрилансеров
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['№', 'ФИО', 'Должность'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#374151' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortFreelancerRows(filtered).map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ ...td, color: '#64748b', fontFamily: 'monospace' }}>{r.number || '—'}</td>
                  <td style={td}>{r.name}</td>
                  <td style={{ ...td, color: '#64748b' }}>{r.position || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
