import { useState } from 'react'
import { type AuthUser } from '../stores/auth'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import { useMutation } from '@tanstack/react-query'
import { formatName } from '../lib/utils'
import { openInventoryWithSession } from '../lib/sso'

interface Props {
  user: AuthUser
}

export function PersonalCabinetPage({ user }: Props) {
  const setUser = useAuthStore((s) => s.setUser)

  const logout = useMutation({
    mutationFn: async () => {
      await supabase.auth.signOut({ scope: 'global' })  // отзыв сессии на сервере → единый логаут (и inventory)
      await api.post('/auth/logout')
    },
    onSettled: () => setUser(null),
  })

  const [pwOpen, setPwOpen] = useState(false)
  const [pw, setPw]         = useState('')
  const [pwShow, setPwShow] = useState(false)
  const [pwMsg, setPwMsg]   = useState<string | null>(null)
  const [pwBusy, setPwBusy] = useState(false)
  async function changePassword() {
    setPwMsg(null)
    if (pw.length < 8) { setPwMsg('Минимум 8 символов'); return }
    setPwBusy(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: pw })
      if (error) throw new Error(error.message)
      await api.post('/auth/change-password')
      setPw(''); setPwOpen(false); setPwMsg('✓ Пароль изменён')
    } catch (e: any) {
      setPwMsg(e?.message ?? 'Не удалось сменить пароль')
    } finally {
      setPwBusy(false)
    }
  }

  function goToInventory() {
    openInventoryWithSession()
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg, #f4f5f7)',
      gap: 24,
      padding: 24,
    }}>
      <div style={{
        background: 'var(--bg-card, #fff)',
        borderRadius: 16,
        padding: '40px 48px',
        maxWidth: 480,
        width: '100%',
        boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
        textAlign: 'center',
      }}>
        <div style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: 'var(--accent, #2563eb)',
          color: '#fff',
          fontSize: 28,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px',
        }}>
          {user.name.charAt(0).toUpperCase()}
        </div>

        <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 700, color: 'var(--text, #111)' }}>
          {formatName(user.name)}
        </h2>

        {user.divMemberships?.[0] && (
          <p style={{ margin: '0 0 4px', fontSize: 14, color: 'var(--text-2, #6b7280)' }}>
            {user.divMemberships[0].position}
          </p>
        )}
        {user.divMemberships?.[0]?.division.department.name && (
          <p style={{ margin: '0 0 32px', fontSize: 14, color: 'var(--text-3, #9ca3af)' }}>
            {user.divMemberships[0].division.department.name}
          </p>
        )}
        {!user.divMemberships?.length && <div style={{ marginBottom: 32 }} />}

        {user.access?.modules?.some(m => m.key === 'ext.inventory') ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--text-2, #6b7280)' }}>
              У вас есть доступ к приложению:
            </p>
            <button
              onClick={goToInventory}
              style={{
                padding: '14px 24px',
                background: 'var(--accent, #2563eb)',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Перейти в Инвентаризацию
            </button>
          </div>
        ) : (
          <p style={{
            fontSize: 14,
            color: 'var(--text-2, #6b7280)',
            background: 'var(--bg-2, #f9fafb)',
            padding: '16px 20px',
            borderRadius: 10,
            lineHeight: 1.5,
          }}>
            Доступ к приложениям пока не назначен.
            <br />
            Обратитесь к администратору.
          </p>
        )}
      </div>

      <div style={{ width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        {!pwOpen ? (
          <button onClick={() => { setPwOpen(true); setPwMsg(null) }} style={{
            background: 'none', border: 'none', color: 'var(--accent, #2563eb)', fontSize: 14, cursor: 'pointer',
          }}>Сменить пароль</button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 280 }}>
            <div style={{ position: 'relative' }}>
              <input type={pwShow ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Новый пароль (мин. 8)" autoComplete="new-password" style={{
                width: '100%', padding: '10px 40px 10px 12px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', fontSize: 14, outline: 'none', boxSizing: 'border-box',
              }} />
              <button type="button" onClick={() => setPwShow((s) => !s)} title={pwShow ? 'Скрыть' : 'Показать'} style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 4, lineHeight: 1,
              }}>{pwShow ? '🙈' : '👁'}</button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={changePassword} disabled={pwBusy} style={{
                flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', background: 'var(--accent, #2563eb)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: pwBusy ? 'default' : 'pointer',
              }}>{pwBusy ? 'Сохраняю...' : 'Сохранить'}</button>
              <button onClick={() => { setPwOpen(false); setPw(''); setPwMsg(null) }} style={{
                padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border, #e5e7eb)', background: 'none', color: 'var(--text-3, #9ca3af)', fontSize: 14, cursor: 'pointer',
              }}>Отмена</button>
            </div>
          </div>
        )}
        {pwMsg && <span style={{ fontSize: 12, color: pwMsg.startsWith('✓') ? 'var(--success, #29BF12)' : '#dc2626' }}>{pwMsg}</span>}
      </div>

      <button
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
        style={{
          padding: '10px 24px',
          background: 'transparent',
          color: 'var(--text-3, #9ca3af)',
          border: '1px solid var(--border, #e5e7eb)',
          borderRadius: 8,
          fontSize: 14,
          cursor: logout.isPending ? 'not-allowed' : 'pointer',
        }}
      >
        {logout.isPending ? 'Выход...' : 'Выйти'}
      </button>
    </div>
  )
}
