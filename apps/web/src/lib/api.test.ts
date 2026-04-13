/**
 * Unit tests for the axios interceptor in api.ts.
 *
 * The interceptor catches 401 responses and:
 *   1. Calls POST /auth/refresh
 *   2. Retries the original request
 *   3. If refresh also fails — propagates the error unchanged
 *   4. Routes under /auth/* are never retried (prevents loops)
 */
import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../test/msw-server'
import { api } from './api'

const BASE = 'http://localhost:4000'

describe('axios 401 interceptor', () => {
  it('401 → calls /auth/refresh → retries original request → returns 200', async () => {
    let originalCallCount = 0
    let refreshCallCount = 0

    server.use(
      http.get(`${BASE}/data`, () => {
        originalCallCount++
        if (originalCallCount === 1) return new HttpResponse(null, { status: 401 })
        return HttpResponse.json({ ok: true })
      }),
      http.post(`${BASE}/auth/refresh`, () => {
        refreshCallCount++
        return HttpResponse.json({})
      }),
    )

    const res = await api.get('/data')

    expect(res.status).toBe(200)
    expect(res.data).toEqual({ ok: true })
    expect(refreshCallCount).toBe(1)
    expect(originalCallCount).toBe(2)
  })

  it('refresh also 401 → original error is propagated, no infinite loop', async () => {
    server.use(
      http.get(`${BASE}/data`, () => new HttpResponse(null, { status: 401 })),
      http.post(`${BASE}/auth/refresh`, () => new HttpResponse(null, { status: 401 })),
    )

    await expect(api.get('/data')).rejects.toMatchObject({
      response: { status: 401 },
    })
  })

  it('/auth/* routes are not retried on 401 — no refresh call, no loop', async () => {
    let loginCallCount = 0
    let refreshCallCount = 0

    server.use(
      http.post(`${BASE}/auth/login`, () => {
        loginCallCount++
        return new HttpResponse(null, { status: 401 })
      }),
      http.post(`${BASE}/auth/refresh`, () => {
        refreshCallCount++
        return HttpResponse.json({})
      }),
    )

    await expect(api.post('/auth/login', {})).rejects.toMatchObject({
      response: { status: 401 },
    })

    expect(loginCallCount).toBe(1)
    expect(refreshCallCount).toBe(0)
  })

  it('parallel 401s → refresh is called twice (known: no queuing in current implementation)', async () => {
    // This test documents that the current interceptor has no deduplication for
    // concurrent 401 responses. Both requests independently call /auth/refresh.
    let dataCallCount = 0
    let refreshCallCount = 0

    server.use(
      http.get(`${BASE}/parallel`, () => {
        dataCallCount++
        // First two calls (initial) → 401; subsequent calls (retries) → 200
        if (dataCallCount <= 2) return new HttpResponse(null, { status: 401 })
        return HttpResponse.json({ ok: true })
      }),
      http.post(`${BASE}/auth/refresh`, () => {
        refreshCallCount++
        return HttpResponse.json({})
      }),
    )

    const [res1, res2] = await Promise.all([api.get('/parallel'), api.get('/parallel')])

    expect(res1.data).toEqual({ ok: true })
    expect(res2.data).toEqual({ ok: true })
    // No queuing — both interceptors fired independently
    expect(refreshCallCount).toBe(2)
  })

  it('non-401 errors are passed through unchanged', async () => {
    server.use(
      http.get(`${BASE}/not-found`, () => new HttpResponse(null, { status: 404 })),
    )

    await expect(api.get('/not-found')).rejects.toMatchObject({
      response: { status: 404 },
    })
  })
})
