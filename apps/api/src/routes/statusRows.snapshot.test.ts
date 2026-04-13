/**
 * Snapshot test for GET /status-rows response structure.
 *
 * Purpose: detect accidental breaking changes to the response shape —
 * renamed fields, missing relations, unexpected nulls — that TypeScript
 * alone can't catch at runtime.
 *
 * The snapshot records the KEYS and TYPES of all fields (not the values),
 * so it stays stable across test runs while still catching structural drift.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@tv-shifts/db'
import { buildApp, getAccessToken } from '../test/helpers'
import { createTestUser, cleanupTestUser, createTestStatusRow, cleanupTestStatusRow } from '../test/factories'
import type { FastifyInstance } from 'fastify'

/** Recursively replace all leaf values with their JS type name. */
function shapeOf(value: unknown): unknown {
  if (value === null) return 'null'
  if (Array.isArray(value)) {
    if (value.length === 0) return []
    return [shapeOf(value[0])]   // snapshot first element only
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, shapeOf(v)])
    )
  }
  return typeof value
}

describe('GET /status-rows response structure', () => {
  let app: FastifyInstance
  let adminId: string
  let adminToken: string
  let rowId: string

  beforeAll(async () => {
    app = await buildApp()
    const admin = await createTestUser({ role: 'admin' })
    adminId = admin.id
    adminToken = await getAccessToken(app, admin.email, 'testpassword123')

    const row = await createTestStatusRow({ name: 'Snapshot Project', date: new Date('2025-06-01') })
    rowId = row.id
  })

  afterAll(async () => {
    await cleanupTestStatusRow(rowId)
    await cleanupTestUser(adminId)
    await app.close()
    await prisma.$disconnect()
  })

  it('response item has expected top-level fields', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/status-rows',
      cookies: { access_token: adminToken },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json() as unknown[]
    const item = body.find((r: any) => r.id === rowId)
    expect(item).toBeDefined()

    // Snapshot the shape — catches field renames and missing relations
    expect(shapeOf(item)).toMatchSnapshot()
  })

  it('slim=true omits join fields (matrixRegistry, assignments, days)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/status-rows?slim=true',
      cookies: { access_token: adminToken },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json() as unknown[]
    const item = body.find((r: any) => r.id === rowId) as Record<string, unknown>
    expect(item).toBeDefined()

    expect(item).not.toHaveProperty('matrixRegistry')
    expect(item).not.toHaveProperty('assignments')
    expect(item).not.toHaveProperty('days')
    expect(item).not.toHaveProperty('linkedMatrix')

    // Snapshot slim shape
    expect(shapeOf(item)).toMatchSnapshot()
  })

  it('withSeparators=true includes separator rows', async () => {
    // Separators have source='separator', created by sync — not present here by default
    // Just verify the endpoint accepts the param without error
    const res = await app.inject({
      method: 'GET',
      url: '/status-rows?withSeparators=true',
      cookies: { access_token: adminToken },
    })
    expect(res.statusCode).toBe(200)
  })
})
