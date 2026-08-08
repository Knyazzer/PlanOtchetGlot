import { useState, useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Sun, Moon } from 'lucide-react'
import { useCurrentUser } from '../hooks/useAuth'
import { useAuthStore } from '../stores/auth'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'
import { formatName } from '../lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  theme?: 'dark' | 'light'
  onToggleTheme?: () => void
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('')
}

// Смена пароля: supabase.auth.updateUser → чистка временного пароля (как на PersonalCabinet).
// В dev без Supabase-сессии вернёт ошибку — работает в проде.
function PasswordChange() {
  const [open, setOpen] = useState(false)
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '8px 12px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-1)', fontSize: 14, fontFamily: 'Inter, sans-serif', outline: 'none' }
  async function submit() {
    setMsg(null)
    if (pw.length < 8) { setMsg('Минимум 8 символов'); return }
    setBusy(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: pw })
      if (error) throw new Error(error.message)
      await api.post('/auth/change-password')
      setPw(''); setOpen(false); setMsg('✓ Пароль изменён')
    } catch (e: any) {
      setMsg(e?.message ?? 'Не удалось сменить пароль')
    } finally { setBusy(false) }
  }
  if (!open) {
    return (
      <>
        <button onClick={() => { setOpen(true); setMsg(null) }}
          style={{ textAlign: 'left', padding: '8px 12px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-2)', fontSize: 14, fontFamily: 'Inter, sans-serif', cursor: 'pointer' }}>
          Изменить пароль
        </button>
        {msg && <div style={{ fontSize: 12, color: msg.startsWith('✓') ? '#22C55E' : '#F43F5E' }}>{msg}</div>}
      </>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Новый пароль (мин. 8)" autoComplete="new-password"
        onKeyDown={e => { if (e.key === 'Enter' && !busy) submit() }} autoFocus style={inp} />
      {msg && <div style={{ fontSize: 12, color: msg.startsWith('✓') ? '#22C55E' : '#F43F5E' }}>{msg}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => { setOpen(false); setPw(''); setMsg(null) }} disabled={busy}
          style={{ flex: 1, padding: '8px 0', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-3)', fontSize: 14, fontFamily: 'Inter, sans-serif', cursor: 'pointer' }}>Отмена</button>
        <button onClick={submit} disabled={busy}
          style={{ flex: 1, padding: '8px 0', background: 'var(--accent, #2563eb)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: 'Inter, sans-serif', cursor: 'pointer', opacity: busy ? 0.7 : 1 }}>{busy ? '…' : 'Сохранить'}</button>
      </div>
    </div>
  )
}

function Avatar({ name }: { name: string }) {
  const ini = initials(name)
  return (
    <svg width={72} height={72} viewBox="0 0 72 72" style={{ flexShrink: 0 }}>
      <circle cx={36} cy={36} r={36} fill="var(--surface-3)" />
      <text
        x={36} y={36}
        dominantBaseline="central" textAnchor="middle"
        fontSize={26} fontWeight={700} fontFamily="Inter, sans-serif"
        fill="var(--text-2)"
      >
        {ini}
      </text>
    </svg>
  )
}

export function ProfilePanel({ open, onClose, theme = 'dark', onToggleTheme }: Props) {
  const user = useCurrentUser()
  const qc   = useQueryClient()

  const setUser = useAuthStore(s => s.setUser)
  const [status, setStatus] = useState(user?.status ?? '')
  const inputRef = useRef<HTMLInputElement>(null)
  const mdRef    = useRef(false)

  useEffect(() => { setStatus(user?.status ?? '') }, [user?.status])

  // При каждом открытии панели тянем свежий профиль — должности/роли могли измениться в оргструктуре в этой же сессии.
  useEffect(() => {
    if (!open) return
    api.get('/auth/me').then(r => setUser(r.data)).catch(() => {})
  }, [open, setUser])

  const saveStatus = useMutation({
    mutationFn: (val: string) => api.patch('/auth/me/profile', { status: val || null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  })

  // Должности сотрудника из оргструктуры (может быть несколько — штатно). Тип строго: Директор/Руководитель/Сотрудник.
  const ROLE_LABEL: Record<string, string> = { director: 'Директор', head: 'Руководитель', member: 'Сотрудник' }
  const positions = user?.positions ?? []

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        onMouseDown={() => { mdRef.current = true }}
        onMouseUp={() => { if (mdRef.current) onClose(); mdRef.current = false }}
        style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.35)' }}
      />

      {/* Panel */}
      <aside style={{
        position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 91,
        width: 300,
        background: 'var(--surface-1)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        boxShadow: '4px 0 24px rgba(0,0,0,0.35)',
      }}>
        {/* Header */}
        <div style={{ height: 64, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 20px', borderBottom: '1px solid var(--border)', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>Профиль</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 18, lineHeight: 1, padding: 4 }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Avatar + name */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <Avatar name={user?.name ?? ''} />
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-1)', textAlign: 'center' }}>{user ? formatName(user.name) : ''}</div>
          </div>

          {/* Должности — мини-таблица: Тип · Отдел · Департамент (штатно их может быть несколько) */}
          {positions.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: -8 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                {positions.length > 1 ? 'Должности' : 'Должность'}
              </label>
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8,
                  padding: '6px 10px', background: 'var(--surface-2)',
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                }}>
                  <span>Тип</span><span>Отдел</span><span>Департамент</span>
                </div>
                {positions.map((p, i) => (
                  <div key={i} style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8,
                    padding: '8px 10px', fontSize: 12, alignItems: 'center',
                    borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                  }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-2)' }}>{ROLE_LABEL[p.role] ?? p.role}</span>
                    <span style={{ color: 'var(--text-3)' }}>{p.division ?? '—'}</span>
                    <span style={{ color: 'var(--text-3)' }}>{p.dept}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Status */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              Статус
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                ref={inputRef}
                value={status}
                onChange={e => setStatus(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveStatus.mutate(status)
                  if (e.key === 'Escape') { setStatus(user?.status ?? ''); inputRef.current?.blur() }
                }}
                placeholder="Напишите статус…"
                maxLength={200}
                style={{
                  flex: 1, padding: '8px 12px',
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  borderRadius: 8, color: 'var(--text-1)', fontSize: 14,
                  fontFamily: 'Inter, sans-serif', outline: 'none',
                }}
              />
              <button
                onClick={() => saveStatus.mutate(status)}
                disabled={saveStatus.isPending}
                style={{
                  padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: 'var(--accent-s)', color: '#fff', fontSize: 14, fontWeight: 600,
                  fontFamily: 'Inter, sans-serif', opacity: saveStatus.isPending ? 0.6 : 1,
                }}
              >
                {saveStatus.isPending ? '…' : '✓'}
              </button>
            </div>
          </div>

          {/* Theme toggle */}
          {onToggleTheme && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                Тема
              </label>
              <button
                onClick={onToggleTheme}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  borderRadius: 8, color: 'var(--text-1)', fontSize: 14,
                  fontFamily: 'Inter, sans-serif', cursor: 'pointer', textAlign: 'left',
                }}
              >
                {theme === 'dark'
                  ? <><Sun size={15} style={{ color: '#F59E0B' }} /> Светлая тема</>
                  : <><Moon size={15} style={{ color: '#818CF8' }} /> Тёмная тема</>}
              </button>
            </div>
          )}

          {/* Divider */}
          <div style={{ borderTop: '1px solid var(--border)' }} />

          {/* Email (stub) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              Email
            </label>
            <div style={{ fontSize: 14, color: 'var(--text-2)', padding: '8px 0' }}>{user?.email}</div>
          </div>

          {/* Password */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              Пароль
            </label>
            <PasswordChange />
          </div>
        </div>
      </aside>
    </>
  )
}