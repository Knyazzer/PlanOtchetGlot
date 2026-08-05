import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import { NexusIcon } from '../components/NexusIcon'

const PW_CHARS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function genPassword(len = 10): string {
  const arr = new Uint8Array(len)
  crypto.getRandomValues(arr)
  let s = ''
  for (let i = 0; i < len; i++) s += PW_CHARS[arr[i] % PW_CHARS.length]
  return s
}

// Экран обязательной смены пароля при первом входе (mustChangePassword)
export function ChangePasswordPage() {
  const setUser = useAuthStore((s) => s.setUser)
  const [pw, setPw]       = useState('')
  const [pw2, setPw2]     = useState('')
  const [show, setShow]   = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (pw.length < 8) { setError('Пароль минимум 8 символов'); return }
    if (pw !== pw2)    { setError('Пароли не совпадают'); return }
    setLoading(true)
    try {
      const { error: e1 } = await supabase.auth.updateUser({ password: pw })
      if (e1) throw new Error(e1.message)
      await api.post('/auth/change-password')
      const res = await api.get('/auth/me')
      setUser(res.data) // mustChangePassword=false → App пропустит дальше
    } catch (err: any) {
      setError(err?.message ?? 'Не удалось сменить пароль')
    } finally {
      setLoading(false)
    }
  }

  function generate() {
    const g = genPassword()
    setPw(g); setPw2(g); setShow(true) // показываем сгенерированный, чтобы можно было записать
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f5f7' }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: '40px 48px', width: 380, boxShadow: '0 2px 16px rgba(0,0,0,0.1)' }}>
        <div style={{ marginBottom: 16 }}>
          <NexusIcon size={48} />
        </div>
        <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700, color: '#111' }}>Смените пароль</h1>
        <p style={{ margin: '0 0 24px', color: '#666', fontSize: 14 }}>
          Это первый вход — задайте свой постоянный пароль.
        </p>
        <form onSubmit={submit}>
          <label style={labelStyle}>Новый пароль</label>
          <div style={{ position: 'relative' }}>
            <input type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} required autoComplete="new-password" style={{ ...inputStyle, paddingRight: 40 }} placeholder="Минимум 8 символов" />
            <button type="button" onClick={() => setShow((s) => !s)} title={show ? 'Скрыть' : 'Показать'} style={eyeStyle}>{show ? '🙈' : '👁'}</button>
          </div>

          <label style={{ ...labelStyle, marginTop: 16 }}>Повторите пароль</label>
          <div style={{ position: 'relative' }}>
            <input type={show ? 'text' : 'password'} value={pw2} onChange={(e) => setPw2(e.target.value)} required autoComplete="new-password" style={{ ...inputStyle, paddingRight: 40 }} />
            <button type="button" onClick={() => setShow((s) => !s)} title={show ? 'Скрыть' : 'Показать'} style={eyeStyle}>{show ? '🙈' : '👁'}</button>
          </div>

          <button type="button" onClick={generate} style={{ marginTop: 10, fontSize: 12, background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 0 }}>
            Сгенерировать пароль
          </button>

          {error && (
            <div style={{ marginTop: 16, padding: '10px 14px', background: '#fff0f0', border: '1px solid #fca5a5', borderRadius: 8, color: '#dc2626', fontSize: 14 }}>{error}</div>
          )}

          <button type="submit" disabled={loading} style={{ marginTop: 24, width: '100%', padding: '12px 0', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontSize: 15, fontWeight: 600, cursor: loading ? 'default' : 'pointer' }}>
            {loading ? 'Сохраняю...' : 'Сохранить и войти'}
          </button>
        </form>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 6 }
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box', outline: 'none' }
const eyeStyle: React.CSSProperties = { position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, padding: 4, lineHeight: 1 }
