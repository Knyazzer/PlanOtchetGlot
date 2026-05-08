/**
 * Integration tests for PATCH /status-rows/:id.
 * Covers: change_log creation and raw-SQL update of matrixRegistryId / blockSlot.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@tv-shifts/db'
import { buildApp, getAccessToken } from '../test/helpers'
import {
  createTestUser,
  cleanupTestUser,
  createTestWorkItem,
  cleanupTestWorkItem,
} from '../test/factories'
import type { FastifyInstance } from 'fastify'

describe('PATCH /status-rows/:id', () => {
  let app: FastifyInstance
  let adminId: string
  let adminToken: string
  let rowId: string
  let matrixId: string   // MatrixRegistry.id for linkage test

  beforeAll(async () => {
    app = await buildApp()

    // Clean up any stale records left by interrupted previous runs
    await prisma.$executeRawUnsafe(`DELETE FROM matrix_registry WHERE matrix_id LIKE 'patch-test-matrix-%'`).catch(() => {})

    const admin = await createTestUser({ role: 'admin' })
    adminId = admin.id
    adminToken = await getAccessToken(app, admin.email, 'testpassword123')

    const row = await createTestWorkItem({ name: 'PATCH Test Project', status: 'draft' })
    rowId = row.id

    // Use raw SQL to avoid Prisma schema drift on the `unit` column (JSONB default [] ≠ String)
    const testMatrixId = `patch-test-matrix-${Date.now()}`
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO matrix_registry (id, matrix_id, last_synced_at, updated_at) VALUES (gen_random_uuid(), $1, NOW(), NOW()) RETURNING id::text`,
      testMatrixId,
    )
    matrixId = rows[0].id
  })

  afterAll(async () => {
    await prisma.changeLog.deleteMany({ where: { entityId: rowId } }).catch(() => {})
    if (matrixId) {
      await prisma.$executeRawUnsafe(`DELETE FROM matrix_registry WHERE id = $1::uuid`, matrixId).catch(() => {})
    }
    await cleanupTestWorkItem(rowId)
    await cleanupTestUser(adminId)
    await app.close()
    await prisma.$disconnect()
  })

  // ── change_logs ──────────────────────────────────────────────────────────────

  it('changing a field → entry appears in change_logs', async () => {
    // Delete any existing change_logs for this row to start clean
    await prisma.changeLog.deleteMany({ where: { entityId: rowId } })

    const res = await app.inject({
      method: 'PATCH',
      url: `/status-rows/${rowId}`,
      cookies: { access_token: adminToken },
      payload: { name: 'PATCH Test Project — изменено' },
    })

    expect(res.statusCode).toBe(200)

    const logs = await prisma.changeLog.findMany({
      where: { entityId: rowId, field: 'name' },
    })
    expect(logs).toHaveLength(1)
    expect(logs[0].entityType).toBe('status_row')
    expect(logs[0].oldValue).toBe('PATCH Test Project')
    expect(logs[0].newValue).toBe('PATCH Test Project — изменено')
    expect(logs[0].changedBy).toBe(adminId)
    expect(logs[0].source).toBe('manual')
  })

  it('changing the same field to the same value → no new change_log entry', async () => {
    // First, set the name to a known value
    await app.inject({
      method: 'PATCH',
      url: `/status-rows/${rowId}`,
      cookies: { access_token: adminToken },
      payload: { name: 'Stable Name' },
    })

    await prisma.changeLog.deleteMany({ where: { entityId: rowId } })

    // Patch with the same value
    const res = await app.inject({
      method: 'PATCH',
      url: `/status-rows/${rowId}`,
      cookies: { access_token: adminToken },
      payload: { name: 'Stable Name' },
    })

    expect(res.statusCode).toBe(200)
    const logs = await prisma.changeLog.findMany({ where: { entityId: rowId } })
    expect(logs).toHaveLength(0)
  })

  it('changing status → logged in change_logs with correct old/new values', async () => {
    // Set a known starting state
    await app.inject({
      method: 'PATCH',
      url: `/status-rows/${rowId}`,
      cookies: { access_token: adminToken },
      payload: { status: 'draft' },
    })
    await prisma.changeLog.deleteMany({ where: { entityId: rowId } })

    const res = await app.inject({
      method: 'PATCH',
      url: `/status-rows/${rowId}`,
      cookies: { access_token: adminToken },
      payload: { status: 'active' },
    })

    expect(res.statusCode).toBe(200)
    const log = await prisma.changeLog.findFirst({
      where: { entityId: rowId, field: 'status' },
    })
    expect(log).not.toBeNull()
    expect(log!.oldValue).toBe('draft')
    expect(log!.newValue).toBe('active')
  })

  // ── matrixRegistryId / blockSlot (raw SQL) ────────────────────────────────

  it('blockSlot is updated via raw SQL and reflected in DB', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/status-rows/${rowId}`,
      cookies: { access_token: adminToken },
      payload: { blockSlot: 3 },
    })

    expect(res.statusCode).toBe(200)

    // Verify directly in DB since Prisma client may not expose the column
    const rows = await prisma.$queryRawUnsafe<{ block_slot: number | null }[]>(
      `SELECT block_slot FROM work_items WHERE id = $1`,
      rowId,
    )
    expect(rows[0].block_slot).toBe(3)
  })

  it('matrixRegistryId is updated via raw SQL and reflected in DB', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/status-rows/${rowId}`,
      cookies: { access_token: adminToken },
      payload: { matrixRegistryId: matrixId },
    })

    expect(res.statusCode).toBe(200)

    const rows = await prisma.$queryRawUnsafe<{ matrix_registry_id: string | null }[]>(
      `SELECT matrix_registry_id FROM work_items WHERE id = $1`,
      rowId,
    )
    expect(rows[0].matrix_registry_id).toBe(matrixId)
  })

  it('matrixRegistryId can be set to null (unlink)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/status-rows/${rowId}`,
      cookies: { access_token: adminToken },
      payload: { matrixRegistryId: null },
    })

    expect(res.statusCode).toBe(200)

    const rows = await prisma.$queryRawUnsafe<{ matrix_registry_id: string | null }[]>(
      `SELECT matrix_registry_id FROM work_items WHERE id = $1`,
      rowId,
    )
    expect(rows[0].matrix_registry_id).toBeNull()
  })

  it('non-admin cannot PATCH status rows → 403', async () => {
    const emp = await createTestUser({ role: 'employee' })
    const empToken = await getAccessToken(app, emp.email, 'testpassword123')

    const res = await app.inject({
      method: 'PATCH',
      url: `/status-rows/${rowId}`,
      cookies: { access_token: empToken },
      payload: { name: 'Попытка изменения' },
    })

    expect(res.statusCode).toBe(403)

    await cleanupTestUser(emp.id)
  })

  it('PATCH on non-existent row → 404', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/status-rows/00000000-0000-0000-0000-000000000000',
      cookies: { access_token: adminToken },
      payload: { name: 'X' },
    })

    expect(res.statusCode).toBe(404)
  })
})
