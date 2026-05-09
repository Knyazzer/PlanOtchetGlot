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
  }, [setUser, setLoading])
}

export function useCurrentUser() {
  return useAuthStore((s) => s.user)
}

export function useIsAdmin() {
  return useAuthStore((s) => s.user?.roles?.includes('admin') ?? s.user?.role === 'admin')
}

export function useIsProducer() {
  return useAuthStore((s) =>
    s.user?.roles?.some((r) => r === 'producer' || r === 'admin' || r === 'spec_projects') ??
    (s.user?.role === 'producer' || s.user?.role === 'admin')
  )
}

export function useIsDeptDirector() {
  return useAuthStore((s) => s.user?.roles?.includes('dept_director') ?? false)
}

export function useHasPermission(permission: string) {
  return useAuthStore((s) => s.user?.permissions?.includes(permission) ?? false)
}
