/**
 * Unit tests for useAuthInit hook.
 *
 * Behaviour:
 *   - Calls GET /auth/me on mount
 *   - Success → calls setUser(user), setLoading(false)
 *   - Any error → calls setUser(null), setLoading(false)
 *
 * The store is mocked so these tests exercise the hook's async logic in
 * isolation — no dependency on zustand's React binding or the real auth state.
 *
 * Note: /auth/me starts with /auth/, so the axios 401 interceptor does NOT
 * attempt a token refresh for this route — errors propagate directly to .catch().
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../test/msw-server'
import { useAuthInit } from './useAuth'
import { useAuthStore } from '../stores/auth'

const BASE = 'http://localhost:4000'

// Mock the store module so useAuthStore() returns plain functions (no React hooks inside)
vi.mock('../stores/auth', () => ({
  useAuthStore: vi.fn(),
}))

describe('useAuthInit', () => {
  let setUser: ReturnType<typeof vi.fn>
  let setLoading: ReturnType<typeof vi.fn>

  beforeEach(() => {
    setUser = vi.fn()
    setLoading = vi.fn()
    vi.mocked(useAuthStore).mockReturnValue({ setUser, setLoading } as ReturnType<typeof useAuthStore>)
  })

  it('/auth/me 200 → setUser called with response data, setLoading(false)', async () => {
    const mockUser = {
      id: 'abc-123',
      email: 'admin@tvshifts.ru',
      fullName: 'Admin User',
      role: 'admin' as const,
      isStaff: true,
    }

    server.use(
      http.get(`${BASE}/auth/me`, () => HttpResponse.json(mockUser)),
    )

    renderHook(() => useAuthInit())

    await waitFor(() => expect(setLoading).toHaveBeenCalledWith(false))

    expect(setUser).toHaveBeenCalledWith(mockUser)
    expect(setUser).not.toHaveBeenCalledWith(null)
  })

  it('/auth/me 401 → setUser(null) called, setLoading(false)', async () => {
    server.use(
      http.get(`${BASE}/auth/me`, () => new HttpResponse(null, { status: 401 })),
    )

    renderHook(() => useAuthInit())

    await waitFor(() => expect(setLoading).toHaveBeenCalledWith(false))

    expect(setUser).toHaveBeenCalledWith(null)
  })

  it('/auth/me 500 → setUser(null) called, setLoading(false)', async () => {
    server.use(
      http.get(`${BASE}/auth/me`, () => new HttpResponse(null, { status: 500 })),
    )

    renderHook(() => useAuthInit())

    await waitFor(() => expect(setLoading).toHaveBeenCalledWith(false))

    expect(setUser).toHaveBeenCalledWith(null)
  })

  it('network error → setUser(null) called, setLoading(false)', async () => {
    server.use(
      http.get(`${BASE}/auth/me`, () => HttpResponse.error()),
    )

    renderHook(() => useAuthInit())

    await waitFor(() => expect(setLoading).toHaveBeenCalledWith(false))

    expect(setUser).toHaveBeenCalledWith(null)
  })
})
