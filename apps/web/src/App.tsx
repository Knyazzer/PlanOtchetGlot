import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthInit, useCurrentUser } from './hooks/useAuth'
import { useAuthStore } from './stores/auth'
import { LoginPage } from './pages/LoginPage'
import { ChangePasswordPage } from './pages/ChangePasswordPage'
import { PersonalCabinetPage } from './pages/PersonalCabinetPage'
import { AppShell } from './components/AppShell'
import { api } from './lib/api'
import { supabase } from './lib/supabase'
import { getValidatedRedirect, redirectWithSession, isSsoRedirectLoop } from './lib/sso'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60,
    },
  },
})

// Consumes a one-time impersonation token from the URL, sets auth cookies, then reloads
function ImpersonateConsumer({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.post('/auth/impersonate/consume', { token })
      .then(() => {
        const params = new URLSearchParams(window.location.search)
        params.delete('impersonate')
        const rest = params.toString()
        window.history.replaceState({}, '', window.location.pathname + (rest ? '?' + rest : ''))
        window.location.reload()
      })
      .catch((e) => {
        const msg = e?.response?.data?.error ?? 'Неверная или истёкшая ссылка'
        setError(msg)
        const params = new URLSearchParams(window.location.search)
        params.delete('impersonate')
        window.history.replaceState({}, '', window.location.pathname + (params.toString() ? '?' + params.toString() : ''))
      })
  }, [token])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: '#374151', fontSize: 16 }}>
      {error ? (
        <>
          <div style={{ color: '#dc2626' }}>{error}</div>
          <a href="/" style={{ fontSize: 14, color: '#2563eb' }}>На главную</a>
        </>
      ) : (
        <div style={{ color: '#64748b' }}>Вход в систему...</div>
      )}
    </div>
  )
}

// Единый логаут (SSO): inventory редиректит сюда (?logout=1), чтобы погасить и сессию Nexus
function LogoutConsumer() {
  const setUser = useAuthStore((s) => s.setUser)
  useEffect(() => {
    (async () => {
      try { await supabase.auth.signOut({ scope: 'global' }) } catch { /* нет сессии — ок */ }
      try { await api.post('/auth/logout') } catch { /* очистка cookies */ }
      setUser(null)
      window.location.replace('/')  // чистый URL → форма входа Nexus
    })()
  }, [setUser])
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 16 }}>
      Выходим...
    </div>
  )
}

function AppContent() {
  useAuthInit()
  const user = useCurrentUser()
  const isLoading = useAuthStore((s) => s.isLoading)

  // SSO-портал: залогиненного пользователя с ?redirect= сразу отправляем в целевое приложение
  // (но не раньше обязательной смены пароля при первом входе)
  const ssoRedirect = !import.meta.env.DEV ? getValidatedRedirect() : null
  const [ssoLoop, setSsoLoop] = useState(false)
  useEffect(() => {
    if (user && !user.mustChangePassword && ssoRedirect) {
      if (isSsoRedirectLoop(ssoRedirect)) setSsoLoop(true)
      else redirectWithSession(ssoRedirect)
    }
  }, [user, ssoRedirect])

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: 16 }}>
        Загрузка...
      </div>
    )
  }

  if (!user) return <LoginPage />

  // Первый вход — обязательная смена временного пароля (до всего остального)
  if (user.mustChangePassword) return <ChangePasswordPage />

  if (ssoRedirect && ssoLoop) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: '#374151', fontSize: 15, padding: 24, textAlign: 'center' }}>
        <div style={{ color: '#dc2626', fontWeight: 600 }}>Приложение не принимает вход</div>
        <div style={{ color: '#64748b', maxWidth: 420 }}>
          Целевое приложение не приняло сессию (вероятно, его сторона SSO ещё не настроена — приём токенов из URL). Обратитесь к администратору приложения.
        </div>
        <a href="/" style={{ fontSize: 14, color: '#2563eb' }}>На главную Нексус</a>
      </div>
    )
  }

  if (ssoRedirect) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: 16 }}>
        Переход в приложение...
      </div>
    )
  }

  // Visibility gate (прод): не-админ без бета-доступа видит минимальный кабинет.
  // canAccessPlatform — точечный rollout-флаг (выдаётся в Персонале), пускает внутрь AppShell.
  // TODO: при открытии платформы для всех убрать `&& !user.canAccessPlatform`
  //       и дропнуть колонку can_access_platform отдельной миграцией.
  if (!user.isAdmin && !user.canAccessPlatform) return <PersonalCabinetPage user={user} />
  return <AppShell />
}

// Read impersonate param once at module level (before React renders)
const impersonateToken = new URLSearchParams(window.location.search).get('impersonate')
const logoutFlag = new URLSearchParams(window.location.search).get('logout')

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {impersonateToken ? <ImpersonateConsumer token={impersonateToken} />
        : logoutFlag ? <LogoutConsumer />
        : <AppContent />}
    </QueryClientProvider>
  )
}