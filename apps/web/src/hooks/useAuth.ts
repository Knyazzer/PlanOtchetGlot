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
  }, [])
}

export function useCurrentUser() {
  return useAuthStore((s) => s.user)
}

export function useIsAdmin() {
  return useAuthStore((s) => s.user?.role === 'admin')
}

export function useIsProducer() {
  return useAuthStore((s) => s.user?.role === 'producer' || s.user?.role === 'admin')
}
