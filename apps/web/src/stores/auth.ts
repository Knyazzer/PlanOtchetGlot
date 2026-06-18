import { create } from 'zustand'

export interface AuthUserDivision {
  position: string
  division: { name: string; department: { name: string } }
}

export interface AccessModule {
  key: string
  name: string
  group: string
  mode: 'view' | 'edit'
  page?: string
}

export interface UserAccess {
  level: 'member' | 'head' | 'director'
  departments: Array<{ id: string; name: string; level: 'member' | 'head' | 'director' }>
  modules: AccessModule[]
}

export interface AuthUser {
  id: string
  email: string | null
  name: string
  isAdmin: boolean
  isSystemAccount: boolean
  canAccessInventory: boolean
  canAccessPlatform: boolean
  mustChangePassword?: boolean
  isActive: boolean
  theme: 'dark' | 'light'
  status?: string | null
  tabNumber?: string | null
  divMemberships?: AuthUserDivision[]
  access?: UserAccess
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
