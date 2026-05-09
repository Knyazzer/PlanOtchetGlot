import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthInit, useCurrentUser } from './hooks/useAuth'
import { useAuthStore } from './stores/auth'
import { LoginPage } from './pages/LoginPage'
import { AppShell } from './components/AppShell'
import { api } from './lib/api'

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

function AppContent() {
  useAuthInit()
  const user = useCurrentUser()
  const isLoading = useAuthStore((s) => s.isLoading)

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: 16 }}>
        Загрузка...
      </div>
    )
  }

  if (!user) return <LoginPage />

  return <AppShell />
}

// Read impersonate param once at module level (before React renders)
const impersonateToken = new URLSearchParams(window.location.search).get('impersonate')

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {impersonateToken ? <ImpersonateConsumer token={impersonateToken} /> : <AppContent />}
    </QueryClientProvider>
  )
}
