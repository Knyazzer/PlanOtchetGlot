/**
 * Integration tests for runFullSync() — real PostgreSQL for SyncLogs,
 * mocked Google API, and prisma.matrixRegistry.findMany mocked per-test
 * so pre-existing dev data never bleeds in.
 *
 * Each test awaits runFullSync() directly; the built-in 1 s delays mean
 * individual tests take ~2 s. That is intentional and within the per-test
 * 15 s timeout.
 */
import { vi, describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest'
import { prisma } from '@tv-shifts/db'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('./databaseService', () => ({
  findSheetConfig: vi.fn().mockResolvedValue(null),
}))

const mockSpreadsheetsGet      = vi.fn()
const mockSpreadsheetsValuesGet = vi.fn()

vi.mock('googleapis', () => ({
  google: {
    auth: {
      GoogleAuth: class MockGoogleAuth {
        constructor(_opts?: unknown) {}
      },
    },
    sheets: vi.fn(() => ({
      spreadsheets: {
        get: mockSpreadsheetsGet,
        values: { get: mockSpreadsheetsValuesGet },
      },
    })),
  },
}))

import { runFullSync, requestSyncAbort } from './syncService'

// ── Response helpers ──────────────────────────────────────────────────────────

/** Empty grid response (projects/registry): 0 upserted, 0 errors */
function emptyGridResponse() {
  return {
    data: {
      sheets: [{ conditionalFormats: [], data: [{ rowData: [] }] }],
    },
  }
}

/** Matrix meta with no matching shift-sheet title → fetchMatrixShifts returns null */
function matrixMetaNoMatch() {
  return {
    data: {
      sheets: [{ properties: { title: 'Бюджет', sheetId: 0 } }],
    },
  }
}

// ── Environment ───────────────────────────────────────────────────────────────

const savedEnv: Record<string, string | undefined> = {}

beforeAll(async () => {
  for (const k of ['GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_PRIVATE_KEY', 'GOOGLE_PROJECTS_SHEET_ID', 'GOOGLE_REGISTRY_SHEET_ID']) {
    savedEnv[k] = process.env[k]
  }
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ??= 'test@test.iam.gserviceaccount.com'
  process.env.GOOGLE_PRIVATE_KEY           ??= '-----BEGIN RSA PRIVATE KEY-----\nfakekey\n-----END RSA PRIVATE KEY-----'
  process.env.GOOGLE_PROJECTS_SHEET_ID     ??= 'projects-sheet-id'
  process.env.GOOGLE_REGISTRY_SHEET_ID     ??= 'registry-sheet-id'
  // Clean up any SyncLogs left by an interrupted previous run
  await prisma.syncLog.deleteMany().catch(() => {})
})

afterAll(async () => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  await prisma.$disconnect()
})

beforeEach(() => {
  vi.clearAllMocks()
  // Isolate from real dev data: no matrices processed by default
  vi.spyOn(prisma.matrixRegistry, 'findMany').mockResolvedValue([])
  // Default API responses
  mockSpreadsheetsGet.mockResolvedValue(emptyGridResponse())
  mockSpreadsheetsValuesGet.mockResolvedValue({ data: { values: [] } })
})

afterEach(async () => {
  vi.restoreAllMocks()
  await prisma.syncLog.deleteMany().catch(() => {})
  // Guard: remove any matrix_registry rows accidentally created by the sync
  // (shouldn't happen when mocks are correct, but protects dev DB from test pollution)
  await prisma.$executeRawUnsafe(`
    DELETE FROM matrix_registry
    WHERE matrix_id LIKE 'int-test%'
       OR matrix_id LIKE 'test-integration%'
       OR matrix_id LIKE 'test-err-%'
       OR matrix_id LIKE 'INT-%'
  `).catch(() => {})
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('runFullSync() — orchestration', () => {
  it('creates SyncLog records for projects and registry with status "success"', async () => {
    const result = await runFullSync()

    expect(result.errors).toHaveLength(0)

    const logs = await prisma.syncLog.findMany({ orderBy: { startedAt: 'asc' } })
    const projectsLog = logs.find((l) => l.type === 'projects')
    const registryLog = logs.find((l) => l.type === 'registry')

    expect(projectsLog).toBeDefined()
    expect(projectsLog!.status).toBe('success')
    expect(projectsLog!.finishedAt).not.toBeNull()

    expect(registryLog).toBeDefined()
    expect(registryLog!.status).toBe('success')
    expect(registryLog!.finishedAt).not.toBeNull()
  }, 15_000)

  it('creates a matrix SyncLog for each entry returned by findMany', async () => {
    const matrixId = `int-test-${Date.now()}`

    // Return one fake entry — the actual DB row is not needed for SyncLog creation
    vi.spyOn(prisma.matrixRegistry, 'findMany').mockResolvedValue([
      { id: 'fake-id', matrixId, sheetUrl: 'https://docs.google.com/spreadsheets/d/test-matrix-id/edit', projectId: null } as any,
    ])

    // Matrix meta: no matching sheet → fetchMatrixShifts returns null
    mockSpreadsheetsGet.mockImplementation(async (params: any) => {
      if (params.includeGridData === false) return matrixMetaNoMatch()
      return emptyGridResponse()
    })

    await runFullSync()

    const matrixLog = await prisma.syncLog.findFirst({
      where: { type: 'matrix', targetId: matrixId },
    })
    expect(matrixLog).toBeDefined()
    expect(matrixLog!.status).toBe('success')
  }, 15_000)

  it('skips entries with no sheetUrl — no matrix SyncLog is created', async () => {
    const matrixId = `int-test-no-url-${Date.now()}`

    vi.spyOn(prisma.matrixRegistry, 'findMany').mockResolvedValue([
      { id: 'fake-id-no-url', matrixId, sheetUrl: null, projectId: null } as any,
    ])

    await runFullSync()

    const matrixLog = await prisma.syncLog.findFirst({
      where: { type: 'matrix', targetId: matrixId },
    })
    expect(matrixLog).toBeNull()
  }, 15_000)

  it('error on one matrix → that matrix SyncLog is "error", other matrix SyncLog is "success"', async () => {
    const idA = `int-test-err-A-${Date.now()}`
    const idB = `int-test-err-B-${Date.now()}`

    vi.spyOn(prisma.matrixRegistry, 'findMany').mockResolvedValue([
      { id: 'fake-a', matrixId: idA, sheetUrl: 'https://docs.google.com/spreadsheets/d/err-a/edit', projectId: null } as any,
      { id: 'fake-b', matrixId: idB, sheetUrl: 'https://docs.google.com/spreadsheets/d/err-b/edit', projectId: null } as any,
    ])

    let callCount = 0
    mockSpreadsheetsGet.mockImplementation(async (params: any) => {
      if (params.includeGridData === false) {
        callCount++
        if (callCount === 1) throw new Error('Simulated API error for matrix A')
        return matrixMetaNoMatch()
      }
      return emptyGridResponse()
    })

    const result = await runFullSync()

    expect(result.errors.some((e) => e.includes('Simulated API error for matrix A'))).toBe(true)

    const logA = await prisma.syncLog.findFirst({ where: { targetId: idA } })
    expect(logA).toBeDefined()
    expect(logA!.status).toBe('error')

    // Matrix B was processed despite A's error
    const logB = await prisma.syncLog.findFirst({ where: { targetId: idB } })
    expect(logB).toBeDefined()
    expect(logB!.status).toBe('success')
  }, 20_000)

  it('requestSyncAbort() stops the matrix loop — no matrix SyncLogs are created', async () => {
    const idC = `int-test-abort-C-${Date.now()}`
    const idD = `int-test-abort-D-${Date.now()}`

    vi.spyOn(prisma.matrixRegistry, 'findMany').mockResolvedValue([
      { id: 'fake-c', matrixId: idC, sheetUrl: 'https://docs.google.com/spreadsheets/d/abort-c/edit', projectId: null } as any,
      { id: 'fake-d', matrixId: idD, sheetUrl: 'https://docs.google.com/spreadsheets/d/abort-d/edit', projectId: null } as any,
    ])

    // Two 1000 ms delays elapse before the matrix loop.
    // Trigger abort at 500 ms — checked at ~2000 ms when the loop starts.
    const abortTimer = setTimeout(() => requestSyncAbort(), 500)
    const result = await runFullSync()
    clearTimeout(abortTimer)

    expect(result.errors).toHaveLength(0)

    const logC = await prisma.syncLog.findFirst({ where: { targetId: idC } })
    const logD = await prisma.syncLog.findFirst({ where: { targetId: idD } })
    expect(logC).toBeNull()
    expect(logD).toBeNull()
  }, 15_000)

  it('new runFullSync() resets _abortRequested — run proceeds normally after an abort', async () => {
    requestSyncAbort() // Simulate a previous abort

    const result = await runFullSync()

    // Must NOT return early with "Sync already in progress"
    expect(result.errors).not.toContain('Sync already in progress')

    const logs = await prisma.syncLog.findMany()
    expect(logs.length).toBeGreaterThanOrEqual(2)  // at least projects + registry
  }, 15_000)

  it('separator row (only col A filled) → StatusRow with source "separator" is created', async () => {
    const separatorLabel = `Тест-разделитель-${Date.now()}`

    const headerRow = { values: Array.from({ length: 11 }, () => ({ userEnteredValue: {} })) }
    const separatorRow = {
      values: [
        { userEnteredValue: { stringValue: separatorLabel }, effectiveValue: { stringValue: separatorLabel } },
        ...Array.from({ length: 10 }, () => ({ userEnteredValue: {} })),
      ],
    }

    mockSpreadsheetsGet.mockResolvedValue({
      data: {
        sheets: [
          { conditionalFormats: [], data: [{ rowData: [headerRow, separatorRow] }] },
        ],
      },
    })

    await runFullSync()

    const separators = await prisma.$queryRawUnsafe<{ name: string; source: string }[]>(
      `SELECT name, source FROM work_items WHERE source = 'separator' AND name = $1`,
      separatorLabel,
    )
    expect(separators.length).toBeGreaterThanOrEqual(1)
    expect(separators[0].source).toBe('separator')

    await prisma.$executeRawUnsafe(
      `DELETE FROM work_items WHERE source = 'separator' AND name = $1`,
      separatorLabel,
    )
  }, 15_000)
})
