import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { api } from '../lib/api'
import { useCurrentUser, useIsAdmin } from '../hooks/useAuth'

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserProfile {
  id: string
  fullName: string
  email: string
  tabNumber: string | null
  isStaff: boolean
  isActive: boolean
  userRoles: { role: { name: string } }[]
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

interface ShiftEntry {
  id: string
  date: string
  shiftType: 'zastroyka' | 'efir' | 'demontazh'
  confirmed: boolean
  confirmedAt: string | null
  workItem: { id: string; name: string; client: string | null }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SHIFT_LABELS: Record<string, string> = {
  zastroyka: 'Застройка',
  efir: 'Эфир',
  demontazh: 'Демонтаж',
}

const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']

const ROLE_LABELS: Record<string, string> = {
  admin:    'Администратор',
  producer: 'Продюсер',
  employee: 'Сотрудник',
}

function userRoleLabel(profile: UserProfile) {
  const names = profile.userRoles?.map((r) => r.role.name) ?? []
  return names.map((n) => ROLE_LABELS[n] ?? n).join(', ') || 'Сотрудник'
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProfilePage() {
  const me = useCurrentUser()
  const isAdmin = useIsAdmin()
  const qc = useQueryClient()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)

  const viewUserId = isAdmin && selectedUserId ? selectedUserId : me?.id

  // User list for admin
  const { data: users = [] } = useQuery<UserProfile[]>({
    queryKey: ['users-list'],
    queryFn: () => api.get('/users').then(r => r.data),
    enabled: isAdmin,
    staleTime: 60_000,
  })

  // Profile data
  const { data: profile } = useQuery<UserProfile>({
    queryKey: ['user-profile', viewUserId],
    queryFn: () => api.get(`/users/${viewUserId}`).then(r => r.data),
    enabled: !!viewUserId,
    staleTime: 60_000,
  })

  // Monthly summary
  const { data: summary } = useQuery<MonthlySummary>({
    queryKey: ['monthly-summary', viewUserId, year, month],
    queryFn: () => api.get(`/shifts/monthly-summary/${viewUserId}/${year}/${month}`).then(r => r.data),
    enabled: !!viewUserId,
    staleTime: 30_000,
  })

  // Shifts for current month
  const dateFrom = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const dateTo = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const { data: shifts = [] } = useQuery<ShiftEntry[]>({
    queryKey: ['shifts-profile', viewUserId, year, month],
    queryFn: () => api.get(`/shifts?userId=${viewUserId}&dateFrom=${dateFrom}&dateTo=${dateTo}`).then(r => r.data),
    enabled: !!viewUserId,
    staleTime: 30_000,
  })

  // Confirm shift (admin only)
  const confirmShift = useMutation({
    mutationFn: (id: string) => api.patch(`/shifts/${id}/confirm`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shifts-profile', viewUserId, year, month] })
      qc.invalidateQueries({ queryKey: ['monthly-summary', viewUserId, year, month] })
    },
  })

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) } else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1) } else setMonth(m => m + 1)
  }

  const unconfirmedCount = shifts.filter(s => !s.confirmed).length

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Admin: user selector */}
      {isAdmin && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 18px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>Просмотр профиля</div>
          <select
            value={selectedUserId ?? ''}
            onChange={e => setSelectedUserId(e.target.value || null)}
            style={{ width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, color: '#1e293b', background: '#fff', fontFamily: 'inherit' }}
          >
            <option value="">Мой профиль</option>
            {users.filter(u => u.id !== me?.id).map(u => (
              <option key={u.id} value={u.id}>{u.fullName} ({userRoleLabel(u)})</option>
            ))}
          </select>
        </div>
      )}

      {/* Profile card */}
      {profile && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '18px 22px', display: 'flex', gap: 20, alignItems: 'center' }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
            {profile.fullName.charAt(0)}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>{profile.fullName}</div>
            <div style={{ fontSize: 13, color: '#64748b', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <span>{userRoleLabel(profile)}</span>
              <span style={{ color: '#cbd5e1' }}>·</span>
              <span>{profile.email}</span>
              {profile.tabNumber && <><span style={{ color: '#cbd5e1' }}>·</span><span>Таб. №{profile.tabNumber}</span></>}
            </div>
          </div>
          {!profile.isActive && (
            <div style={{ fontSize: 11, padding: '3px 8px', background: '#fee2e2', color: '#ef4444', borderRadius: 5, fontWeight: 600 }}>Неактивен</div>
          )}
        </div>
      )}

      {/* Month navigator + summary */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '18px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <button onClick={prevMonth} style={{ background: '#f1f5f9', border: 'none', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', fontSize: 13, color: '#475569' }}>◄</button>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', minWidth: 140, textAlign: 'center' }}>{MONTH_NAMES[month - 1]} {year}</div>
          <button onClick={nextMonth} style={{ background: '#f1f5f9', border: 'none', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', fontSize: 13, color: '#475569' }}>►</button>
        </div>

        {summary ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
            <StatCard label="Смен" value={summary.totalShifts} />
            {summary.threshold != null && <StatCard label="Норма" value={summary.threshold} />}
            {summary.threshold != null && (
              <StatCard
                label="Переработка"
                value={Math.max(0, summary.totalShifts - summary.threshold)}
                color={summary.totalShifts > summary.threshold ? '#10b981' : '#94a3b8'}
              />
            )}
            {summary.vacationDays > 0 && <StatCard label="Отпуск (дн.)" value={summary.vacationDays} color="#7c3aed" />}
          </div>
        ) : (
          <div style={{ color: '#94a3b8', fontSize: 13 }}>Нет данных за этот месяц</div>
        )}
      </div>

      {/* Shifts list */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>Смены</div>
          {isAdmin && unconfirmedCount > 0 && (
            <div style={{ fontSize: 11, padding: '2px 7px', background: '#fff7ed', color: '#ea580c', borderRadius: 10, fontWeight: 600 }}>
              {unconfirmedCount} не подтверждено
            </div>
          )}
        </div>

        {shifts.length === 0 ? (
          <div style={{ padding: '20px 18px', color: '#94a3b8', fontSize: 13 }}>Нет смен за этот месяц</div>
        ) : (
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ padding: '8px 18px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.03em', borderBottom: '1px solid #e2e8f0' }}>Дата</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.03em', borderBottom: '1px solid #e2e8f0' }}>Проект</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.03em', borderBottom: '1px solid #e2e8f0' }}>Тип</th>
                <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.03em', borderBottom: '1px solid #e2e8f0' }}>Статус</th>
                {isAdmin && <th style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0' }} />}
              </tr>
            </thead>
            <tbody>
              {shifts.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '9px 18px', color: '#475569', whiteSpace: 'nowrap' }}>
                    {format(new Date(s.date), 'd MMM', { locale: ru })}
                  </td>
                  <td style={{ padding: '9px 12px', color: '#1e293b' }}>
                    <div style={{ fontWeight: 500 }}>{s.workItem.name}</div>
                    {s.workItem.client && <div style={{ fontSize: 11, color: '#94a3b8' }}>{s.workItem.client}</div>}
                  </td>
                  <td style={{ padding: '9px 12px', color: '#475569' }}>
                    {SHIFT_LABELS[s.shiftType] ?? s.shiftType}
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                    {s.confirmed ? (
                      <span style={{ fontSize: 11, padding: '2px 8px', background: '#dcfce7', color: '#16a34a', borderRadius: 10, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        Подтверждено {s.confirmedAt ? format(new Date(s.confirmedAt), 'd MMM', { locale: ru }) : ''}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, padding: '2px 8px', background: '#f1f5f9', color: '#94a3b8', borderRadius: 10, fontWeight: 600 }}>
                        Ожидает
                      </span>
                    )}
                  </td>
                  {isAdmin && (
                    <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                      {!s.confirmed && (
                        <button
                          onClick={() => confirmShift.mutate(s.id)}
                          disabled={confirmShift.isPending}
                          style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#16a34a', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                        >
                          Подтвердить
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

    </div>
  )
}

function StatCard({ label, value, color = '#1e293b' }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ background: '#f8fafc', borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color, marginBottom: 2 }}>{value}</div>
      <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
    </div>
  )
}
