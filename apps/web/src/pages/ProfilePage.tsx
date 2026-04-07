import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns'
import { ru } from 'date-fns/locale'
import { api } from '../lib/api'
import { useCurrentUser, useIsAdmin } from '../hooks/useAuth'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShiftEntry {
  id: string
  date: string
  shiftType: 'zastroyka' | 'efir' | 'demontazh'
  confirmed: boolean
  project: { id: string; name: string; client: string | null }
}

interface MonthlySummary {
  userId: string
  year: number
  month: number
  totalShifts: number
  threshold: number | null
  overtimeShifts: number
  vacationDays: number
  workingDays?: number
}

const SHIFT_TYPE_LABELS: Record<string, string> = {
  zastroyka: 'Застройка',
  efir: 'Эфир',
  demontazh: 'Демонтаж',
}

const SHIFT_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  zastroyka: { bg: '#fef3c7', text: '#b45309' },
  efir: { bg: '#dcfce7', text: '#16a34a' },
  demontazh: { bg: '#e0f2fe', text: '#0369a1' },
}

// ─── ProfilePage ─────────────────────────────────────────────────────────────

export function ProfilePage() {
  const currentUser = useCurrentUser()
  const isAdmin = useIsAdmin()
  const [currentMonth, setCurrentMonth] = useState(new Date())

  // Для админа — возможность смотреть другого сотрудника
  const [viewUserId, setViewUserId] = useState<string | null>(null)
  const userId = (isAdmin && viewUserId) ? viewUserId : currentUser?.id

  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth() + 1
  const dateFrom = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
  const dateTo = format(endOfMonth(currentMonth), 'yyyy-MM-dd')

  const { data: shifts = [], isLoading: shiftsLoading } = useQuery<ShiftEntry[]>({
    queryKey: ['shifts', userId, dateFrom, dateTo],
    queryFn: () =>
      api.get('/shifts', { params: { userId, dateFrom, dateTo } }).then((r) => r.data),
    enabled: !!userId,
  })

  const { data: summary } = useQuery<MonthlySummary>({
    queryKey: ['monthly-summary', userId, year, month],
    queryFn: () =>
      api.get(`/shifts/monthly-summary/${userId}/${year}/${month}`).then((r) => r.data),
    enabled: !!userId,
  })

  const { data: users = [] } = useQuery<{ id: string; fullName: string }[]>({
    queryKey: ['users-short'],
    queryFn: () => api.get('/users').then((r) => r.data),
    enabled: isAdmin,
  })

  const displayUser = isAdmin && viewUserId
    ? users.find((u) => u.id === viewUserId)
    : currentUser

  // Группируем смены по дате
  const shiftsByDate = shifts.reduce<Record<string, ShiftEntry[]>>((acc, s) => {
    const key = s.date.split('T')[0]
    if (!acc[key]) acc[key] = []
    acc[key].push(s)
    return acc
  }, {})

  const sortedDates = Object.keys(shiftsByDate).sort()

  const overtime = summary && summary.threshold != null
    ? Math.max(0, summary.totalShifts - summary.threshold)
    : 0

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
          {isAdmin && viewUserId ? `Профиль: ${displayUser?.fullName ?? '...'}` : 'Мой профиль'}
        </h2>

        {isAdmin && (
          <select
            value={viewUserId ?? ''}
            onChange={(e) => setViewUserId(e.target.value || null)}
            style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
          >
            <option value="">Мой профиль</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.fullName}</option>
            ))}
          </select>
        )}
      </div>

      {/* Навигация по месяцам */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={() => setCurrentMonth((d) => subMonths(d, 1))} style={navBtn}>‹</button>
        <span style={{ fontSize: 16, fontWeight: 600, minWidth: 160, textAlign: 'center' }}>
          {format(currentMonth, 'LLLL yyyy', { locale: ru })}
        </span>
        <button onClick={() => setCurrentMonth((d) => addMonths(d, 1))} style={navBtn}>›</button>
        <button
          onClick={() => setCurrentMonth(new Date())}
          style={{ ...navBtn, fontSize: 12, padding: '5px 10px', color: '#64748b' }}
        >
          Сегодня
        </button>
      </div>

      {/* Счётчики */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        <StatCard label="Смен" value={summary?.totalShifts ?? shifts.length} color="#2563eb" />
        <StatCard
          label="Порог"
          value={summary?.threshold != null ? summary.threshold : '—'}
          color="#7c3aed"
          hint="ceil(раб.дн × 16/22)"
        />
        <StatCard label="Переработка" value={overtime} color={overtime > 0 ? '#dc2626' : '#16a34a'} />
        <StatCard label="Отпуск (дн)" value={summary?.vacationDays ?? 0} color="#0369a1" />
      </div>

      {/* Список смен */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
            Смены за месяц ({shifts.length})
          </span>
        </div>

        {shiftsLoading ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Загрузка...</div>
        ) : sortedDates.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
            Смен в этом месяце нет
          </div>
        ) : (
          sortedDates.map((dateKey) => {
            const dayShifts = shiftsByDate[dateKey]
            const d = new Date(dateKey)
            return (
              <div key={dateKey} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ padding: '8px 16px', background: '#fafafa', fontSize: 12, fontWeight: 600, color: '#64748b' }}>
                  {format(d, 'EEEE, d MMMM', { locale: ru })}
                </div>
                {dayShifts.map((s) => {
                  const c = SHIFT_TYPE_COLORS[s.shiftType]
                  return (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px 10px 24px' }}>
                      <div>
                        <span style={{ fontSize: 14, fontWeight: 500, color: '#1e293b' }}>
                          {s.project.client ? `${s.project.client} — ` : ''}{s.project.name}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: c.bg, color: c.text, fontWeight: 500 }}>
                          {SHIFT_TYPE_LABELS[s.shiftType]}
                        </span>
                        <span style={{ fontSize: 11, color: s.confirmed ? '#16a34a' : '#94a3b8' }}>
                          {s.confirmed ? '✓ подтверждено' : 'не подтверждено'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, color, hint }: { label: string; value: number | string; color: string; hint?: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', padding: '14px 16px' }}>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
        {hint && <span title={hint} style={{ marginLeft: 4, cursor: 'help' }}>ⓘ</span>}
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, color, marginTop: 4 }}>{value}</div>
    </div>
  )
}

const navBtn: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  padding: '5px 12px',
  cursor: 'pointer',
  fontSize: 16,
  color: '#374151',
}
