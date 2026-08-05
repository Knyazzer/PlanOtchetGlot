import { useState, useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Sun, Moon } from 'lucide-react'
import { useCurrentUser } from '../hooks/useAuth'
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
  const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '8px 12px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-1)', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none' }
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
          style={{ textAlign: 'left', padding: '8px 12px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-2)', fontSize: 13, fontFamily: 'Inter, sans-serif', cursor: 'pointer' }}>
          Изменить пароль
        </button>
        {msg && <div style={{ fontSize: 12, color: msg.startsWith('✓') ? '#29BF12' : '#E8194B' }}>{msg}</div>}
      </>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Новый пароль (мин. 8)" autoComplete="new-password"
        onKeyDown={e => { if (e.key === 'Enter' && !busy) submit() }} autoFocus style={inp} />
      {msg && <div style={{ fontSize: 12, color: msg.startsWith('✓') ? '#29BF12' : '#E8194B' }}>{msg}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => { setOpen(false); setPw(''); setMsg(null) }} disabled={busy}
          style={{ flex: 1, padding: '8px 0', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-3)', fontSize: 13, fontFamily: 'Inter, sans-serif', cursor: 'pointer' }}>Отмена</button>
        <button onClick={submit} disabled={busy}
          style={{ flex: 1, padding: '8px 0', background: 'var(--accent, #2563eb)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'Inter, sans-serif', cursor: 'pointer', opacity: busy ? 0.7 : 1 }}>{busy ? '…' : 'Сохранить'}</button>
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

  const [status, setStatus] = useState(user?.status ?? '')
  const inputRef = useRef<HTMLInputElement>(null)
  const mdRef    = useRef(false)

  useEffect(() => { setStatus(user?.status ?? '') }, [user?.status])

  const saveStatus = useMutation({
    mutationFn: (val: string) => api.patch('/auth/me/profile', { status: val || null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  })

  const primaryDiv = user?.divMemberships?.[0]
  const position   = primaryDiv?.position ?? null
  // Если нет членства в отделе — показываем департамент из access (напр. директор без UserDivision)
  const dept = primaryDiv
    ? `${primaryDiv.division.department.name} · ${primaryDiv.division.name}`
    : ((user?.access as any)?.departments ?? []).map((d: { name: string; level: string }) => {
        const lvl: Record<string, string> = { director: 'Директор', head: 'Руководитель', member: 'Сотрудник' }
        return `${d.name} · ${lvl[d.level] ?? d.level}`
      }).join(', ') || null

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
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
            <Avatar name={user?.name ?? ''} />
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-1)' }}>{user ? formatName(user.name) : ''}</div>
              {position && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{position}</div>}
              {dept     && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{dept}</div>}
            </div>
          </div>

          {/* Status */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
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
                  borderRadius: 8, color: 'var(--text-1)', fontSize: 13,
                  fontFamily: 'Inter, sans-serif', outline: 'none',
                }}
              />
              <button
                onClick={() => saveStatus.mutate(status)}
                disabled={saveStatus.isPending}
                style={{
                  padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: 'var(--accent-s)', color: '#fff', fontSize: 13, fontWeight: 600,
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
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                Тема
              </label>
              <button
                onClick={onToggleTheme}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  borderRadius: 8, color: 'var(--text-1)', fontSize: 13,
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
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              Email
            </label>
            <div style={{ fontSize: 13, color: 'var(--text-2)', padding: '8px 0' }}>{user?.email}</div>
          </div>

          {/* Password */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              Пароль
            </label>
            <PasswordChange />
          </div>
        </div>
      </aside>
    </>
  )
}
