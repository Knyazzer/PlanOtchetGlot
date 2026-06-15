import { useState, useEffect, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { OrgChartTab } from '../components/OrgChart'
import { useCurrentUser } from '../hooks/useAuth'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PersonUser {
  id:        string
  name:  string
  email:     string | null
  tabNumber: string | null
  position:  string | null
  department:      string | null
  subDept:   string | null
  userType:  string
  role:      string
  isAdmin:   boolean
  isActive:  boolean
  authId:    string | null
  tempPassword: string | null
  mustChangePassword: boolean
  createdAt: string
}

const ROLE_LABELS: Record<string, string> = {
  user:    'Пользователь',
  manager: 'Менеджер',
  admin:   'Администратор',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const inp: React.CSSProperties = {
  background: 'var(--surface-2)', border: '1px solid var(--border)',
  borderRadius: 8, color: 'var(--text-1)', fontSize: 13, padding: '8px 12px',
  outline: 'none', width: '100%', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box',
}

// ─── Sub-tab button ───────────────────────────────────────────────────────────

function SubTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 13, fontWeight: active ? 600 : 500,
      padding: '6px 16px', borderRadius: 8,
      border: active ? '1px solid rgba(255,107,53,0.25)' : '1px solid transparent',
      background: active ? 'rgba(255,107,53,0.1)' : 'none',
      color: active ? 'var(--accent-s)' : 'var(--text-3)',
      cursor: 'pointer', fontFamily: 'Inter, sans-serif',
      transition: 'all 0.12s',
    }}>{label}</button>
  )
}

// ─── Column sorter ────────────────────────────────────────────────────────────

type SortDir = 'asc' | 'desc' | null

function useSortFilter<T>(rows: T[], columns: (keyof T)[]) {
  const [sortCol, setSortCol] = useState<keyof T | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)
  const [search,  setSearch]  = useState('')

  const toggleSort = (col: keyof T) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : d === 'desc' ? null : 'asc')
      if (sortDir === 'desc') setSortCol(null)
    } else {
      setSortCol(col); setSortDir('asc')
    }
  }

  const filtered = useMemo(() => {
    let r = rows
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      r = r.filter(row => columns.some(c => String(row[c] ?? '').toLowerCase().includes(q)))
    }
    if (sortCol && sortDir) {
      r = [...r].sort((a, b) => {
        const va = String(a[sortCol] ?? '').toLowerCase()
        const vb = String(b[sortCol] ?? '').toLowerCase()
        return sortDir === 'asc' ? va.localeCompare(vb, 'ru') : vb.localeCompare(va, 'ru')
      })
    }
    return r
  }, [rows, search, sortCol, sortDir, columns])

  return { filtered, search, setSearch, sortCol, sortDir, toggleSort }
}

// ─── Table cells ──────────────────────────────────────────────────────────────

function Th({ label, sortable, active, dir, onClick }: {
  label: string; sortable?: boolean; active?: boolean; dir?: SortDir; onClick?: () => void
}) {
  return (
    <th onClick={sortable ? onClick : undefined} style={{
      padding: '9px 14px', textAlign: 'left',
      fontWeight: 700, fontSize: 11, color: active ? 'var(--accent-s)' : 'var(--text-muted)',
      textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap',
      borderBottom: '1px solid var(--border)', position: 'sticky', top: 0,
      background: 'var(--surface-2)', cursor: sortable ? 'pointer' : 'default', userSelect: 'none',
    }}>
      {label}{active && dir ? (dir === 'asc' ? ' ↑' : ' ↓') : sortable ? ' ↕' : ''}
    </th>
  )
}

function Td({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <td style={{
      padding: '8px 14px', borderBottom: '1px solid var(--border)',
      fontSize: 13, color: muted ? 'var(--text-muted)' : 'var(--text-2)', whiteSpace: 'nowrap',
    }}>{children}</td>
  )
}

// ─── Create modal ─────────────────────────────────────────────────────────────

interface CreateModalProps {
  type: 'staff' | 'freelancer'
  onClose: () => void
  onCreated: () => void
}

function CreateModal({ type, onClose, onCreated }: CreateModalProps) {
  const mdRef = useRef(false)
  const [name,  setFullName]  = useState('')
  const [position,  setPosition]  = useState('')
  const [department,      setDepartment]      = useState('')
  const [subDept,   setSubDept]   = useState('')
  const [tabNumber, setTabNumber] = useState('')

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const create = useMutation({
    mutationFn: () => {
      const url  = type === 'staff' ? '/users/staff' : '/users/freelancers'
      const data = type === 'staff'
        ? { name: name.trim(), position: position.trim() || undefined, department: department.trim() || undefined, subDept: subDept.trim() || undefined, tabNumber: tabNumber.trim() || undefined }
        : { name: name.trim(), position: position.trim() || undefined, tabNumber: tabNumber.trim() || undefined }
      return api.post(url, data)
    },
    onSuccess: () => { onCreated(); onClose() },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Ошибка создания'),
  })

  const isStaff = type === 'staff'
  const title   = isStaff ? 'Новый сотрудник' : 'Новый фрилансер'

  return (
    <>
      <div onMouseDown={() => { mdRef.current = true }} onMouseUp={() => { if (mdRef.current) onClose(); mdRef.current = false }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        background: 'var(--surface-1)', border: '1px solid var(--border)',
        borderRadius: 14, zIndex: 50, width: 440, maxWidth: '95vw',
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
      }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>
              ФИО *
            </label>
            <input value={name} onChange={e => setFullName(e.target.value)} placeholder="Фамилия Имя Отчество" style={inp} autoFocus />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>
              Должность
            </label>
            <input value={position} onChange={e => setPosition(e.target.value)} placeholder="Например: Оператор" style={inp} />
          </div>

          {isStaff ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>
                    Департамент
                  </label>
                  <input value={department} onChange={e => setDepartment(e.target.value)} placeholder="Напр.: Производство" style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>
                    Отдел
                  </label>
                  <input value={subDept} onChange={e => setSubDept(e.target.value)} placeholder="Напр.: Монтаж" style={inp} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>
                  Табельный номер
                </label>
                <input value={tabNumber} onChange={e => setTabNumber(e.target.value)} placeholder="Напр.: S160" style={inp} />
              </div>
            </>
          ) : (
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>
                Номер фрилансера
              </label>
              <input value={tabNumber} onChange={e => setTabNumber(e.target.value)} placeholder="Напр.: FL187" style={inp} />
            </div>
          )}

          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
            Логин будет сгенерирован автоматически из ФИО. Пароль по умолчанию: <strong style={{ color: 'var(--text-2)' }}>Tvshifts2026</strong>
          </p>
        </div>

        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            fontSize: 13, padding: '8px 18px', borderRadius: 8,
            border: '1px solid var(--border)', background: 'none',
            color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
          }}>Отмена</button>
          <button
            onClick={() => create.mutate()}
            disabled={!name.trim() || create.isPending}
            style={{
              fontSize: 13, padding: '8px 18px', borderRadius: 8, border: 'none',
              background: name.trim() ? 'linear-gradient(135deg,#FF6B35,#E8194B)' : 'rgba(255,255,255,0.07)',
              color: name.trim() ? '#fff' : 'var(--text-muted)',
              fontFamily: 'Inter, sans-serif', fontWeight: 600,
              cursor: name.trim() ? 'pointer' : 'default',
            }}
          >{create.isPending ? 'Создание...' : 'Создать'}</button>
        </div>
      </div>
    </>
  )
}

// ─── Person Drawer ────────────────────────────────────────────────────────────

interface DrawerProps {
  person:   PersonUser
  onClose:  () => void
  onImpersonate: (userId: string) => void
  impersonateCopied: boolean
}

function PersonDrawer({ person, onClose, onImpersonate, impersonateCopied }: DrawerProps) {
  const mdRef = useRef(false)
  const qc = useQueryClient()
  const queryKey = person.userType === 'staff' ? ['staff'] : ['freelancers']

  const [name,  setFullName]  = useState(person.name)
  const [email,     setEmail]     = useState(person.email ?? '')
  const [tabNumber, setTabNumber] = useState(person.tabNumber ?? '')
  const [position,  setPosition]  = useState(person.position ?? '')
  const [department,      setDepartment]      = useState(person.department ?? '')
  const [subDept,   setSubDept]   = useState(person.subDept ?? '')
  const [role,      setRole]      = useState(person.role)
  const [isWorking, setIsWorking] = useState(person.isActive)  // занятость: активен/уволен
  const [saved,         setSaved]         = useState(false)
  const [tempPw,        setTempPw]        = useState<string | null>(null)

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const patch = useMutation({
    mutationFn: (data: object) => api.patch(`/users/${person.id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey, refetchType: 'all' })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Ошибка сохранения'),
  })

  const deactivate = useMutation({
    mutationFn: () => api.post(`/users/${person.id}/deactivate`),
    onSuccess: () => { qc.invalidateQueries({ queryKey, refetchType: 'all' }); onClose() },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Ошибка увольнения'),
  })

  const reactivate = useMutation({
    mutationFn: () => api.post(`/users/${person.id}/reactivate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey, refetchType: 'all' })
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Ошибка восстановления'),
  })

  const onboard = useMutation({
    mutationFn: () => api.post(`/auth/onboard/${person.id}`, { email: email.trim() }),
    onSuccess: (res: any) => {
      if (res.data?.linkedExisting) {
        setTempPw(null)
        alert('Доступ выдан. У сотрудника уже был аккаунт — он входит своим существующим паролем (как в другом приложении).')
      } else {
        setTempPw(res.data?.tempPassword ?? null)
      }
      qc.invalidateQueries({ queryKey, refetchType: 'all' })
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Не удалось выдать доступ'),
  })

  const resetPw = useMutation({
    mutationFn: () => api.post(`/users/${person.id}/reset-password`),
    onSuccess: (res: any) => {
      setTempPw(res.data?.tempPassword ?? null)
      qc.invalidateQueries({ queryKey, refetchType: 'all' })
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Не удалось сбросить пароль'),
  })

  const handleSave = () => {
    // Тоггл «Работает сейчас» сменил занятость → увольнение/восстановление
    if (isWorking !== person.isActive) {
      if (!isWorking) {
        if (!window.confirm('Уволить сотрудника? Доступ будет заблокирован во всех приложениях (обратимо).')) return
        deactivate.mutate()
      } else {
        reactivate.mutate()
      }
      return
    }
    // Обычное сохранение полей профиля
    patch.mutate({
      name:  name.trim()  || undefined,
      email:     email.trim()     || undefined,
      tabNumber: tabNumber.trim() || null,
      position:  position.trim()  || null,
      department:      person.userType === 'staff' ? (department.trim()    || null) : undefined,
      subDept:   person.userType === 'staff' ? (subDept.trim() || null) : undefined,
      role:      person.userType === 'staff' ? role : undefined,
    })
  }

  const isDirty = (
    name  !== person.name  ||
    email     !== (person.email ?? '')     ||
    position  !== (person.position ?? '') ||
    department      !== (person.department     ?? '') ||
    subDept   !== (person.subDept  ?? '') ||
    role      !== person.role ||
    isWorking !== person.isActive ||
    tabNumber.trim() !== (person.tabNumber ?? '')
  )

  const isStaff = person.userType === 'staff'
  const isAdminUser = person.isAdmin  // супер-админ: карточка read-only, роль только через БД

  return (
    <>
      <div onMouseDown={() => { mdRef.current = true }} onMouseUp={() => { if (mdRef.current) onClose(); mdRef.current = false }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 40 }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 400,
        background: 'var(--surface-1)', borderLeft: '1px solid var(--border)',
        zIndex: 50, display: 'flex', flexDirection: 'column',
        boxShadow: '-12px 0 40px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 8 }}>
              {person.name}
              {isAdminUser && <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: 'var(--accent, #2563eb)', borderRadius: 5, padding: '2px 6px' }}>АДМИН</span>}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {isStaff ? 'Штатный сотрудник' : 'Фрилансер'} · с {fmtDate(person.createdAt)}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer', padding: 4 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {isAdminUser && (
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--accent, #2563eb)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: 'var(--text-2)' }}>
              🔒 Супер-админ — карточка только для просмотра. Назначение/снятие прав админа и правки — только напрямую в БД.
            </div>
          )}

          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>ФИО</label>
          <input value={name} onChange={e => setFullName(e.target.value)} style={{ ...inp, marginTop: -8 }} />

          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Email</label>
          <input value={email} onChange={e => setEmail(e.target.value)} style={{ ...inp, marginTop: -8 }} />

          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Должность</label>
          <input value={position} onChange={e => setPosition(e.target.value)} style={{ ...inp, marginTop: -8 }} placeholder="—" />

          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Роль в системе</label>
          {isStaff ? (
            <select value={role} onChange={e => setRole(e.target.value)} style={{ ...inp, marginTop: -8 }}>
              <option value="user">Пользователь</option>
            </select>
          ) : (
            <div style={{ ...inp, marginTop: -8, color: 'var(--text-muted)', cursor: 'default' }}>
              Фрилансер
            </div>
          )}

          {isStaff && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: -8 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Департамент</label>
                <input value={department} onChange={e => setDepartment(e.target.value)} style={inp} placeholder="—" />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Отдел</label>
                <input value={subDept} onChange={e => setSubDept(e.target.value)} style={inp} placeholder="—" />
              </div>
            </div>
          )}

          {/* Занятость (штат и фрилансеры). Выкл + «Сохранить» = уволить (бан доступа) */}
          <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 500 }}>Работает сейчас</span>
              <button
                onClick={() => { if (!isAdminUser) setIsWorking(v => !v) }}
                disabled={isAdminUser}
                style={{
                  width: 42, height: 24, borderRadius: 12, border: 'none', cursor: isAdminUser ? 'default' : 'pointer',
                  background: isWorking ? 'var(--success)' : 'rgba(255,255,255,0.1)',
                  position: 'relative', transition: 'background 0.2s', flexShrink: 0, opacity: isAdminUser ? 0.5 : 1,
                }}
              >
                <span style={{
                  position: 'absolute', top: 3, left: isWorking ? 21 : 3,
                  width: 18, height: 18, borderRadius: '50%', background: '#fff',
                  transition: 'left 0.2s',
                }} />
              </button>
            </div>
            {!isWorking && (
              <span style={{ fontSize: 11, color: 'var(--danger)' }}>Выключение + «Сохранить» = уволить (доступ заблокируется во всех приложениях)</span>
            )}
            {isWorking && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>
                  Табельный номер
                </label>
                <input value={tabNumber} onChange={e => setTabNumber(e.target.value)} placeholder="Авто при создании" style={inp} />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleSave}
              disabled={!isDirty || patch.isPending || isAdminUser}
              style={{
                flex: 1, fontSize: 13, padding: '9px 0', borderRadius: 8, border: 'none',
                background: (isDirty && !isAdminUser) ? 'linear-gradient(135deg,#FF6B35,#E8194B)' : 'rgba(255,255,255,0.07)',
                color: (isDirty && !isAdminUser) ? '#fff' : 'var(--text-muted)',
                fontFamily: 'Inter, sans-serif', fontWeight: 600,
                cursor: (isDirty && !isAdminUser) ? 'pointer' : 'default',
              }}
            >{patch.isPending ? 'Сохраняю...' : saved ? '✓ Сохранено' : 'Сохранить'}</button>
            <button
              onClick={() => onImpersonate(person.id)}
              title="Скопировать ссылку для входа (10 мин)"
              style={{
                fontSize: 12, padding: '9px 14px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'none',
                color: impersonateCopied ? 'var(--success)' : 'var(--text-3)',
                cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap',
              }}
            >{impersonateCopied ? '✓ Скопировано' : '🔗 Войти как'}</button>
          </div>

          {tempPw ? (
            <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Доступ выдан. Передайте сотруднику:</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <code style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--text-1)', userSelect: 'all' }}>{tempPw}</code>
                <button onClick={() => navigator.clipboard?.writeText(tempPw)} style={{
                  fontSize: 11, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)',
                  background: 'none', color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                }}>Копировать</button>
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Логин: {email}</span>
            </div>
          ) : person.authId ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--success)', textAlign: 'center' }}>✓ Доступ в систему выдан</div>
              {person.tempPassword && (
                <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Временный пароль (до первой смены сотрудником):</span>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <code style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--text-1)', userSelect: 'all' }}>{person.tempPassword}</code>
                    <button onClick={() => navigator.clipboard?.writeText(person.tempPassword!)} style={{
                      fontSize: 11, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)',
                      background: 'none', color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                    }}>Копир.</button>
                  </div>
                </div>
              )}
              <button onClick={() => resetPw.mutate()} disabled={resetPw.isPending} style={{
                fontSize: 12, padding: '6px 0', borderRadius: 8, border: '1px solid var(--border)',
                background: 'none', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
              }}>{resetPw.isPending ? 'Сбрасываю...' : 'Сбросить пароль'}</button>
            </div>
          ) : (
            <button onClick={() => onboard.mutate()} disabled={onboard.isPending || !email.trim()} style={{
              fontSize: 12, padding: '7px 0', borderRadius: 8,
              border: '1px solid var(--accent, #2563eb)', background: 'none',
              color: 'var(--accent, #2563eb)', cursor: email.trim() ? 'pointer' : 'default',
              fontFamily: 'Inter, sans-serif',
            }}>{onboard.isPending ? 'Выдаю доступ...' : 'Выдать доступ в систему'}</button>
          )}

        </div>
      </div>
    </>
  )
}

// ─── Staff tab ────────────────────────────────────────────────────────────────

function StaffTab() {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<PersonUser | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)

  const { data = [], isLoading } = useQuery<PersonUser[]>({
    queryKey: ['staff', showInactive],
    queryFn: () => api.get('/users/staff' + (showInactive ? '?includeInactive=1' : '')).then(r => r.data),
    staleTime: 0,
  })

  const { data: freelancerData = [] } = useQuery<PersonUser[]>({
    queryKey: ['freelancers'],
    queryFn: () => api.get('/users/freelancers').then(r => r.data),
    staleTime: 0,
  })

  // freelancers with a tab number (FL###) — real active freelancers, not just entries without number
  const freelancerNames = useMemo(
    () => new Set(freelancerData.filter(p => p.tabNumber).map(p => p.name.toLowerCase())),
    [freelancerData]
  )

  const { filtered: filteredRaw, search, setSearch, sortCol, sortDir, toggleSort } =
    useSortFilter(data, ['name', 'tabNumber', 'position', 'department', 'subDept'] as (keyof PersonUser)[])

  // working (has tabNumber) first, then non-working — unless user applied explicit sort
  const filtered = sortCol
    ? filteredRaw
    : [...filteredRaw].sort((a, b) => {
        const aw = a.tabNumber ? 0 : 1
        const bw = b.tabNumber ? 0 : 1
        return aw - bw
      })

  const impersonate = useMutation({
    mutationFn: (id: string) => api.post(`/users/impersonate/${id}`),
    onSuccess: (res, id) => {
      navigator.clipboard.writeText(res.data.link)
      setCopied(id)
      setTimeout(() => setCopied(v => v === id ? null : v), 3000)
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Ошибка'),
  })

  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null)
  const bulkOnboard = useMutation({
    mutationFn: () => api.post('/users/bulk-onboard').then(r => r.data as BulkResult),
    onSuccess: (d) => { setBulkResult(d); qc.invalidateQueries({ queryKey: ['staff'], refetchType: 'all' }) },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Ошибка массового онбординга'),
  })

  if (isLoading) return <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '48px 0', textAlign: 'center' }}>Загрузка...</div>

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%', minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flexShrink: 0 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск..." style={{
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            borderRadius: 8, color: 'var(--text-1)', fontSize: 13, padding: '7px 12px',
            outline: 'none', width: 220, fontFamily: 'Inter, sans-serif',
          }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{filtered.length} из {data.length}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 6 }}>
            <span style={{ color: 'var(--success)', fontWeight: 600 }}>{data.filter(p => p.isActive).length} активны</span>
            {showInactive && <><span>·</span><span style={{ color: 'var(--danger)' }}>{data.filter(p => !p.isActive).length} уволены</span></>}
          </span>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
            Показать уволенных
          </label>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => { if (window.confirm('Завести логины всем сотрудникам с корп-почтой (без аккаунта)? Будут созданы аккаунты с временными паролями — список покажется один раз.')) bulkOnboard.mutate() }}
            disabled={bulkOnboard.isPending}
            style={{
              fontSize: 12, padding: '7px 14px', borderRadius: 8,
              border: '1px solid var(--accent, #2563eb)', background: 'none',
              color: 'var(--accent, #2563eb)', fontFamily: 'Inter, sans-serif', fontWeight: 600,
              cursor: bulkOnboard.isPending ? 'default' : 'pointer',
            }}
          >{bulkOnboard.isPending ? 'Завожу доступ...' : 'Выдать доступ всем (с почтой)'}</button>
          <button onClick={() => setShowCreate(true)} style={{
            fontSize: 12, padding: '7px 16px', borderRadius: 8, border: 'none',
            background: 'linear-gradient(135deg,#FF6B35,#E8194B)',
            color: '#fff', fontFamily: 'Inter, sans-serif', fontWeight: 600, cursor: 'pointer',
          }}>+ Добавить сотрудника</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', borderRadius: 10, border: '1px solid var(--border)' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                <Th label="#" />
                <Th label="Таб. №"    sortable active={sortCol === 'tabNumber'} dir={sortDir} onClick={() => toggleSort('tabNumber')} />
                <Th label="ФИО"       sortable active={sortCol === 'name'}  dir={sortDir} onClick={() => toggleSort('name')} />
                <Th label="Должность" sortable active={sortCol === 'position'}  dir={sortDir} onClick={() => toggleSort('position')} />
                <Th label="Деп."      sortable active={sortCol === 'department'}      dir={sortDir} onClick={() => toggleSort('department')} />
                <Th label="Отдел"     sortable active={sortCol === 'subDept'}   dir={sortDir} onClick={() => toggleSort('subDept')} />
                <Th label="Роль" />
                <Th label="Email" />
                <Th label="" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={9} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  {data.length === 0 ? 'Сотрудников нет. Добавьте первого.' : 'Ничего не найдено'}
                </td></tr>
              )}
              {filtered.map((p, idx) => {
                const isSelected = selected?.id === p.id
                const isCopied   = copied === p.id
                const isDupFree  = freelancerNames.has(p.name.toLowerCase())
                return (
                  <tr key={p.id} onClick={() => setSelected(isSelected ? null : p)} style={{
                    background: isSelected ? 'rgba(255,107,53,0.08)' : 'transparent',
                    cursor: 'pointer',
                    outline: isSelected ? '1px solid rgba(255,107,53,0.3)' : 'none',
                  }}>
                    <td style={{ padding: '8px 10px 8px 14px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: 11, minWidth: 28 }}>{idx + 1}</td>
                    <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                      {p.tabNumber
                        ? <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-s)' }}>{p.tabNumber}</span>
                        : <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>—</span>}
                    </td>
                    <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                      <span style={{ color: 'var(--text-2)', fontSize: 13 }}>{p.name}</span>
                      {isDupFree && <DupBadge label="фрил" title="Такое же ФИО есть среди фрилансеров" color="rgba(60,100,200,0.85)" />}
                    </td>
                    <Td muted={!p.position}>{p.position || '—'}</Td>
                    <Td muted={!p.department}>{p.department || '—'}</Td>
                    <Td muted={!p.subDept}>{p.subDept || '—'}</Td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '2px 6px', background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)', letterSpacing: '0.3px' }}>
                        {ROLE_LABELS[p.role] ?? p.role}
                      </span>
                    </td>
                    <Td muted>{p.email}</Td>
                    <td style={{ padding: '4px 8px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', width: 32 }}>
                      <button
                        onClick={e => { e.stopPropagation(); impersonate.mutate(p.id) }}
                        disabled={impersonate.isPending}
                        title={isCopied ? 'Скопировано' : 'Войти как этот пользователь'}
                        style={{
                          fontSize: 14, padding: '3px 7px', borderRadius: 6,
                          border: '1px solid var(--border)', background: 'none',
                          color: isCopied ? 'var(--success)' : 'var(--text-3)',
                          cursor: 'pointer', lineHeight: 1,
                        }}
                      >{isCopied ? '✓' : '🔗'}</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <PersonDrawer
          person={selected}
          onClose={() => setSelected(null)}
          onImpersonate={id => impersonate.mutate(id)}
          impersonateCopied={copied === selected.id}
        />
      )}

      {showCreate && (
        <CreateModal
          type="staff"
          onClose={() => setShowCreate(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ['staff'], refetchType: 'all' })}
        />
      )}

      {bulkResult && <BulkOnboardResult result={bulkResult} onClose={() => setBulkResult(null)} />}
    </>
  )
}

// ─── Массовый онбординг: результат со списком временных паролей ──────────────────

type BulkResult = {
  total: number
  onboarded: number
  results: { email: string; name: string; tempPassword?: string; status: string }[]
}

function BulkOnboardResult({ result, onClose }: { result: BulkResult; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const ok     = result.results.filter(r => r.status === 'ok')
  const linked = result.results.filter(r => r.status === 'linked')
  const errors = result.results.filter(r => r.status !== 'ok' && r.status !== 'linked')
  const text   = ok.map(r => `${r.email}\t${r.tempPassword}`).join('\n')

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 60 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 580, maxWidth: '92vw', maxHeight: '85vh', overflow: 'auto',
        background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 12,
        zIndex: 61, padding: 22, display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>Массовый онбординг</div>
        <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
          Заведено <b style={{ color: 'var(--success)' }}>{result.onboarded}</b> из {result.total}. Ошибок: {errors.length}.
        </div>
        {ok.length > 0 && (
          <>
            <div style={{ fontSize: 12, color: 'var(--warning, #F59E0B)' }}>
              ⚠️ Пароли показываются один раз — скопируй и раздай сотрудникам.
            </div>
            <textarea readOnly value={text} style={{
              width: '100%', height: 220, fontFamily: 'monospace', fontSize: 12,
              background: 'var(--surface-2)', color: 'var(--text-1)',
              border: '1px solid var(--border)', borderRadius: 8, padding: 10, resize: 'vertical',
            }} />
            <button onClick={() => { navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }} style={{
              alignSelf: 'flex-start', fontSize: 12, padding: '7px 14px', borderRadius: 8, border: 'none',
              background: 'var(--accent, #2563eb)', color: '#fff', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
            }}>{copied ? '✓ Скопировано' : 'Копировать список'}</button>
          </>
        )}
        {linked.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
            Привязаны существующие аккаунты ({linked.length}) — входят своим паролем (как в другом приложении).
          </div>
        )}
        {errors.length > 0 && (
          <div style={{ fontSize: 12 }}>
            <div style={{ color: 'var(--danger)', marginBottom: 4 }}>Не удалось ({errors.length}):</div>
            {errors.slice(0, 40).map((r, i) => (
              <div key={i} style={{ color: 'var(--text-muted)' }}>{r.email} — {r.status}</div>
            ))}
          </div>
        )}
        <button onClick={onClose} style={{
          alignSelf: 'flex-end', fontSize: 12, padding: '7px 16px', borderRadius: 8,
          border: '1px solid var(--border)', background: 'none', color: 'var(--text-2)',
          cursor: 'pointer', fontFamily: 'Inter, sans-serif',
        }}>Закрыть</button>
      </div>
    </>
  )
}

// ─── Duplicate badge ──────────────────────────────────────────────────────────

function DupBadge({ label, title, color }: { label: string; title: string; color: string }) {
  return (
    <span title={title} style={{
      fontSize: 9, fontWeight: 800, letterSpacing: '0.3px', padding: '2px 5px',
      borderRadius: 4, background: color, color: '#fff',
      marginLeft: 6, verticalAlign: 'middle', flexShrink: 0,
    }}>{label}</span>
  )
}

// ─── Freelancers tab ──────────────────────────────────────────────────────────

function FreelancersTab() {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<PersonUser | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)

  const { data = [], isLoading } = useQuery<PersonUser[]>({
    queryKey: ['freelancers', showInactive],
    queryFn: () => api.get('/users/freelancers' + (showInactive ? '?includeInactive=1' : '')).then(r => r.data),
    staleTime: 0,
  })

  const { data: staffData = [] } = useQuery<PersonUser[]>({
    queryKey: ['staff'],
    queryFn: () => api.get('/users/staff').then(r => r.data),
    staleTime: 0,
  })

  // names that appear more than once among freelancers
  const freeDupNames = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of data) counts.set(p.name.toLowerCase(), (counts.get(p.name.toLowerCase()) ?? 0) + 1)
    return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k))
  }, [data])

  // names that exist in staff AND have a tab number (actively working)
  const staffNames = useMemo(
    () => new Set(staffData.filter(p => p.tabNumber).map(p => p.name.toLowerCase())),
    [staffData]
  )

  const { filtered, search, setSearch, sortCol, sortDir, toggleSort } =
    useSortFilter(data, ['name', 'tabNumber', 'position'] as (keyof PersonUser)[])

  const impersonate = useMutation({
    mutationFn: (id: string) => api.post(`/users/impersonate/${id}`),
    onSuccess: (res, id) => {
      navigator.clipboard.writeText(res.data.link)
      setCopied(id)
      setTimeout(() => setCopied(v => v === id ? null : v), 3000)
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Ошибка'),
  })

  if (isLoading) return <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '48px 0', textAlign: 'center' }}>Загрузка...</div>

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%', minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск..." style={{
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            borderRadius: 8, color: 'var(--text-1)', fontSize: 13, padding: '7px 12px',
            outline: 'none', width: 220, fontFamily: 'Inter, sans-serif',
          }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{filtered.length} из {data.length}</span>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
            Показать уволенных
          </label>
          <div style={{ flex: 1 }} />
          <button onClick={() => setShowCreate(true)} style={{
            fontSize: 12, padding: '7px 16px', borderRadius: 8, border: 'none',
            background: 'linear-gradient(135deg,#FF6B35,#E8194B)',
            color: '#fff', fontFamily: 'Inter, sans-serif', fontWeight: 600, cursor: 'pointer',
          }}>+ Добавить фрилансера</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', borderRadius: 10, border: '1px solid var(--border)' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                <Th label="#" />
                <Th label="Таб. №"    sortable active={sortCol === 'tabNumber'} dir={sortDir} onClick={() => toggleSort('tabNumber')} />
                <Th label="ФИО"       sortable active={sortCol === 'name'}  dir={sortDir} onClick={() => toggleSort('name')} />
                <Th label="Должность" sortable active={sortCol === 'position'}  dir={sortDir} onClick={() => toggleSort('position')} />
                <Th label="Email" />
                <Th label="" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  {data.length === 0 ? 'Фрилансеров нет. Добавьте первого.' : 'Ничего не найдено'}
                </td></tr>
              )}
              {filtered.map((p, idx) => {
                const isSelected  = selected?.id === p.id
                const isCopied    = copied === p.id
                const nameKey     = p.name.toLowerCase()
                const isDupInFree = freeDupNames.has(nameKey)
                const isDupStaff  = staffNames.has(nameKey)
                return (
                  <tr key={p.id} onClick={() => setSelected(isSelected ? null : p)} style={{
                    background: isSelected ? 'rgba(255,107,53,0.08)' : 'transparent',
                    cursor: 'pointer',
                    outline: isSelected ? '1px solid rgba(255,107,53,0.3)' : 'none',
                  }}>
                    <td style={{ padding: '8px 10px 8px 14px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: 11, minWidth: 28 }}>{idx + 1}</td>
                    <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                      {p.tabNumber
                        ? <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-s)' }}>{p.tabNumber}</span>
                        : <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>—</span>}
                    </td>
                    <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                      <span style={{ color: 'var(--text-2)', fontSize: 13 }}>{p.name}</span>
                      {isDupInFree && <DupBadge label="2×" title="Два аккаунта среди фрилансеров" color="rgba(180,90,20,0.85)" />}
                      {isDupStaff  && <DupBadge label="штат" title="Такое же ФИО есть в штатных сотрудниках" color="rgba(60,100,200,0.85)" />}
                    </td>
                    <Td muted={!p.position}>{p.position || '—'}</Td>
                    <Td muted>{p.email}</Td>
                    <td style={{ padding: '4px 8px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', width: 32 }}>
                      <button
                        onClick={e => { e.stopPropagation(); impersonate.mutate(p.id) }}
                        disabled={impersonate.isPending}
                        title={isCopied ? 'Скопировано' : 'Войти как этот пользователь'}
                        style={{
                          fontSize: 14, padding: '3px 7px', borderRadius: 6,
                          border: '1px solid var(--border)', background: 'none',
                          color: isCopied ? 'var(--success)' : 'var(--text-3)',
                          cursor: 'pointer', lineHeight: 1,
                        }}
                      >{isCopied ? '✓' : '🔗'}</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <PersonDrawer
          person={selected}
          onClose={() => setSelected(null)}
          onImpersonate={id => impersonate.mutate(id)}
          impersonateCopied={copied === selected.id}
        />
      )}

      {showCreate && (
        <CreateModal
          type="freelancer"
          onClose={() => setShowCreate(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ['freelancers'], refetchType: 'all' })}
        />
      )}
    </>
  )
}

// ─── PersonnelPage ────────────────────────────────────────────────────────────

type SubPage = 'staff' | 'freelancers' | 'structure'

export function PersonnelPage() {
  const me = useCurrentUser()
  const isAdmin = !!me?.isAdmin
  const [sub, setSub] = useState<SubPage>(isAdmin ? 'staff' : 'structure')
  const isCanvas = sub === 'structure'

  // Non-admins are locked to structure tab
  useEffect(() => {
    if (me && !isAdmin) setSub('structure')
  }, [me, isAdmin])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '24px 36px 0', flexShrink: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', marginBottom: 4 }}>Персонал</div>
        <div style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 16 }}>
          {isAdmin ? 'Штат и фрилансеры. Добавляйте, редактируйте, управляйте доступом.' : 'Структура организации.'}
        </div>
        <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
          {isAdmin && <SubTab label="Штат"        active={sub === 'staff'}        onClick={() => setSub('staff')} />}
          {isAdmin && <SubTab label="Фрилансеры"  active={sub === 'freelancers'}  onClick={() => setSub('freelancers')} />}
          <SubTab label="Структура"   active={sub === 'structure'}    onClick={() => setSub('structure')} />
        </div>
      </div>

      {!isCanvas && (
        <div style={{ padding: '24px 36px', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          {sub === 'staff'       && <StaffTab />}
          {sub === 'freelancers' && <FreelancersTab />}
        </div>
      )}
      {sub === 'structure' && <OrgChartTab />}
    </div>
  )
}
