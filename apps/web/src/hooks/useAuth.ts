import { useEffect } from 'react'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'

export function useAuthInit() {
  const { setUser, setLoading } = useAuthStore()

  useEffect(() => {
    api
      .get('/auth/me')
      .then((res) => {
        const data = res.data
        setUser({
          ...data,
          roles: data.roles ?? [],
          permissions: data.permissions ?? [],
        })
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])
}

export function useCurrentUser() {
  return useAuthStore((s) => s.user)
}

export function useIsAdmin() {
  return useAuthStore((s) => s.user?.roles?.includes('admin') ?? s.user?.role === 'admin')
}

export function useIsProducer() {
  return useAuthStore((s) =>
    s.user?.roles?.some((r) => r === 'producer' || r === 'admin') ??
    (s.user?.role === 'producer' || s.user?.role === 'admin')
  )
}

export function useHasPermission(permission: string) {
  return useAuthStore((s) => s.user?.permissions?.includes(permission) ?? false)
}
