import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthInit, useCurrentUser } from './hooks/useAuth'
import { useAuthStore } from './stores/auth'
import { LoginPage } from './pages/LoginPage'
import { AppShell } from './components/AppShell'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60,
    },
  },
})

function AppContent() {
  useAuthInit()
  const user = useCurrentUser()
  const isLoading = useAuthStore((s) => s.isLoading)

  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#666',
        fontSize: 16,
      }}>
        Загрузка...
      </div>
    )
  }

  if (!user) return <LoginPage />

  return <AppShell />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  )
}
