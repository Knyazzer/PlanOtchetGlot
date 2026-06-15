import { useEffect } from 'react'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'

export function useAuthInit() {
  const { setUser, setLoading } = useAuthStore()

  useEffect(() => {
    api
      .get('/auth/me')
      .then((res) => setUser(res.data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [setUser, setLoading])
}

export function useCurrentUser() {
  return useAuthStore((s) => s.user)
}

export function useIsAdmin() {
  return useAuthStore((s) => s.user?.isAdmin ?? false)
}
