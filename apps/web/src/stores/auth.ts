import { create } from 'zustand'

export type UserRole = 'employee' | 'admin' | 'producer' | 'dept_director' | 'spec_projects' | 'accountant' | 'hr_manager'

export interface UserDept {
  id: string
  name: string
  type: string
  isHead: boolean
}

export interface AuthUser {
  id: string
  email: string
  fullName: string
  role: UserRole          // legacy enum — kept for backward compat
  roles: string[]         // RBAC roles from new system
  permissions: string[]   // resolved permissions from RBAC
  depts: UserDept[]       // departments user belongs to
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
