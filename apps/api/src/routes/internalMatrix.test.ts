/**
 * Integration tests for POST /internal-matrix.
 *
 * Drive service is mocked entirely — this tests the DB write logic,
 * not the Google Drive API integration.
 *
 * Two paths:
 *   1. No Drive config (no active template or no folder) → matrix created with sheetUrl=null
 *   2. Drive configured → copyTemplateToFolder is called, sheetUrl is set on the row
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi, beforeEach } from 'vitest'
import { prisma } from '@tv-shifts/db'
import { buildApp, getAccessToken } from '../test/helpers'
import { createTestUser, cleanupTestUser } from '../test/factories'
import type { FastifyInstance } from 'fastify'

// ─── Mock Drive and database config ────────────────────────────────────────────

const mockCopyTemplate   = vi.fn()
const mockSetupPerms     = vi.fn()
const mockWriteSvod      = vi.fn()
const mockAppendRegistry = vi.fn()

vi.mock('../services/driveService', () => ({
  copyTemplateToFolder:    (...args: unknown[]) => mockCopyTemplate(...args),
  setupMatrixPermissions:  (...args: unknown[]) => mockSetupPerms(...args),
  writeSvodData:           (...args: unknown[]) => mockWriteSvod(...args),
  appendToInternalRegistry:(...args: unknown[]) => mockAppendRegistry(...args),
  checkSpreadsheetExists:  vi.fn().mockResolvedValue(true),
}))

// findSheetConfig — default returns null (Drive skipped)
const mockFindSheetConfig = vi.fn().mockResolvedValue(null)
vi.mock('../services/databaseService', () => ({
  findSheetConfig: (...args: unknown[]) => mockFindSheetConfig(...args),
}))

// ─────────────────────────────────────────────────────────────────────────────

describe('POST /internal-matrix', () => {
  let app: FastifyInstance
  let adminId: string
  let adminToken: string
  const createdIds: string[] = []

  beforeAll(async () => {
    app = await buildApp()
    const admin = await createTestUser({ role: 'admin' })
    adminId = admin.id
    adminToken = await getAccessToken(app, admin.email, 'testpassword123')
  })

  beforeEach(() => {
    mockCopyTemplate.mockReset()
    mockSetupPerms.mockReset()
    mockWriteSvod.mockReset()
    mockAppendRegistry.mockReset()
    mockFindSheetConfig.mockResolvedValue(null)
  })

  afterEach(async () => {
    // Guard: remove any INT-* rows not tracked in createdIds (e.g., if test crashed before push)
    await prisma.$executeRawUnsafe(`DELETE FROM matrix_registry WHERE matrix_id LIKE 'INT-%'`).catch(() => {})
  })

  afterAll(async () => {
    // Belt-and-suspenders: also clean tracked IDs (in case afterEach didn't run)
    for (const id of createdIds) {
      await prisma.$executeRawUnsafe(`DELETE FROM matrix_registry WHERE id = $1`, id).catch(() => {})
    }
    await cleanupTestUser(adminId)
    await app.close()
    await prisma.$disconnect()
  })

  it('creates matrix in DB with source=internal', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal-matrix',
      cookies: { access_token: adminToken },
      payload: {
        projectName: 'Test Project',
        client: 'Test Client',
        unit: ['Unit A'],
        format: 'Live',
        status: 'preliminary',
      },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json()

    expect(body.id).toBeDefined()
    expect(body.source).toBe('internal')
    expect(body.sheet_url).toBeNull()
    expect(body.matrix_id).toMatch(/^INT-\d+$/)
    expect(body.client).toBe('Test Client')
    expect(body.project_name).toBe('Test Project')
    expect(mockCopyTemplate).not.toHaveBeenCalled()

    createdIds.push(body.id)
  })

  it('name is auto-generated from client + projectName', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal-matrix',
      cookies: { access_token: adminToken },
      payload: {
        client: 'Заказчик',
        projectName: 'Проект',
        date: '2025-06-15',
      },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.name).toContain('Заказчик')
    expect(body.name).toContain('Проект')

    createdIds.push(body.id)
  })

  it('POST creates matrix with sheet_url=null regardless of Drive config (Drive sync is manual via /sync-to-drive)', async () => {
    // Drive is configured but POST /internal-matrix no longer calls Drive directly
    mockFindSheetConfig.mockImplementation(async (key: string) => {
      if (key === 'drive_folder') return { sheet_url: 'fake-folder-id', table_key: 'drive_folder' }
      return null
    })

    const [tmplRow] = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO matrix_templates (id, name, sheet_url, is_active, created_at, updated_at)
       VALUES (gen_random_uuid(), 'Test Template', 'https://docs.google.com/spreadsheets/d/template-id/edit', true, NOW(), NOW())
       RETURNING id`
    )
    const tmplId = tmplRow.id

    try {
      const res = await app.inject({
        method: 'POST',
        url: '/internal-matrix',
        cookies: { access_token: adminToken },
        payload: { projectName: 'Drive Test', client: 'Client' },
      })

      expect(res.statusCode).toBe(201)
      const body = res.json()
      expect(body.id).toBeDefined()
      expect(body.source).toBe('internal')
      expect(body.sheet_url).toBeNull()
      expect(mockCopyTemplate).not.toHaveBeenCalled()

      createdIds.push(body.id)
    } finally {
      await prisma.$executeRawUnsafe(`DELETE FROM matrix_templates WHERE id = $1`, tmplId).catch(() => {})
    }
  })

  it('POST creates matrix even when unit is an array', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal-matrix',
      cookies: { access_token: adminToken },
      payload: { projectName: 'Unit Test', client: 'X', unit: ['ТВ', 'Дизайн'] },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.id).toBeDefined()
    expect(body.unit).toEqual(['ТВ', 'Дизайн'])

    createdIds.push(body.id)
  })

  it('non-admin cannot create internal matrix → 403', async () => {
    const emp = await createTestUser({ role: 'employee' })
    const empToken = await getAccessToken(app, emp.email, 'testpassword123')

    const res = await app.inject({
      method: 'POST',
      url: '/internal-matrix',
      cookies: { access_token: empToken },
      payload: { projectName: 'Forbidden', client: 'X' },
    })

    expect(res.statusCode).toBe(403)
    await cleanupTestUser(emp.id)
  })
})
