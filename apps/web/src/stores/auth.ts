import { create } from 'zustand'

export type UserRole = 'employee' | 'admin' | 'producer'

export interface AuthUser {
  id: string
  email: string
  fullName: string
  role: UserRole
  tabNumber?: string | null
  isStaff: boolean
}

interface AuthState {
  user: AuthUser | null
  isLoading: boolean
  setUser: (user: AuthUser | null) => void
  setLoading: (loading: boolean) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  setUser: (user) => set({ user }),
  setLoading: (isLoading) => set({ isLoading }),
}))
