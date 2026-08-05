import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import { getValidatedRedirect, redirectWithSession } from '../lib/sso'
import { NexusIcon } from '../components/NexusIcon'

export function LoginPage() {
  const setUser = useAuthStore((s) => s.setUser)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (import.meta.env.DEV) {
        // Локальная разработка: вход против локальной public.users без Supabase.
        // Пароль не проверяется — Supabase-аутентификация только в production-сборке.
        await api.post('/auth/dev-login', { email })
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
        if (authError) throw new Error(authError.message)

        // SSO-портал: пришли с ?redirect= на разрешённый домен — отдаём туда сессию
        const redirect = getValidatedRedirect()
        if (redirect && await redirectWithSession(redirect)) return  // уходим из Nexus
      }
      const res = await api.get('/auth/me')
      setUser(res.data)
    } catch {
      setError('Неверный email или пароль')
    } finally {
      setLoading(false)
    }
  }

  async function quickLogin(devEmail: string) {
    setError(null)
    setLoading(true)
    try {
      await api.post('/auth/dev-login', { email: devEmail })
      const res = await api.get('/auth/me')
      setUser(res.data)
    } catch {
      setError('Ошибка входа')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f4f5f7',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 12,
        padding: '40px 48px',
        width: 380,
        boxShadow: '0 2px 16px rgba(0,0,0,0.1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 32 }}>
          <NexusIcon size={52} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: '#111', letterSpacing: '-0.3px', lineHeight: 1.1 }}>
              Нексус
            </span>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#9090A8', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Мегаполис
            </span>
          </div>
        </div>

        {import.meta.env.DEV && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#9090A8', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
              Быстрый вход (dev)
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                disabled={loading}
                onClick={() => quickLogin('admin@nexus.local')}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#1d4ed8',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  textAlign: 'center',
                }}
              >
                🔑 Админ
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => quickLogin('user@nexus.local')}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#15803d',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  textAlign: 'center',
                }}
              >
                👤 Сотрудник
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '20px 0 4px' }}>
              <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
              <span style={{ fontSize: 12, color: '#9ca3af' }}>или вручную</span>
              <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={inputStyle}
              placeholder="user@nexus.local"
              autoComplete="email"
            />
          </div>

          {!import.meta.env.DEV && (
            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>Пароль</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={inputStyle}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
          )}

          {error && (
            <div style={{
              marginBottom: 16,
              padding: '10px 14px',
              background: '#fff0f0',
              border: '1px solid #fca5a5',
              borderRadius: 8,
              color: '#dc2626',
              fontSize: 14,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              background: loading ? '#94a3b8' : '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              marginTop: import.meta.env.DEV ? 8 : 0,
            }}
          >
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  fontSize: 14,
  fontWeight: 500,
  color: '#374151',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #d1d5db',
  borderRadius: 8,
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
}
