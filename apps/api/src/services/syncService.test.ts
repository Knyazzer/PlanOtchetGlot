/**
 * Unit tests for fetchMatrixShifts — pure parsing logic with stubbed Google API responses.
 *
 * googleapis and databaseService are mocked so no real network/DB calls happen.
 *
 * Column layout (legacy format, 0-based):
 *   C(2)=name  G(6)=role  I(8)=employmentType
 *   J(9)=shift0  K(10)=shift1  L(11)=shift2  M(12)=shift3  N(13)=shift4  O(14)=shift5  P(15)=shift6
 *
 * The shifts[] boolean array index maps to shift type in syncMatrix:
 *   index 0-2 (J,K,L) → zastroyka
 *   index 3   (M)     → efir
 *   index 4-6 (N,O,P) → demontazh
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock databaseService before importing anything from syncService
vi.mock('./databaseService', () => ({
  findSheetConfig: vi.fn().mockResolvedValue(null),
}))

// Mutable references set up inside the vi.mock factory
const mockSpreadsheetsGet    = vi.fn()
const mockSpreadsheetsValuesGet = vi.fn()

vi.mock('googleapis', () => ({
  google: {
    auth: {
      // Must be a real class so `new google.auth.GoogleAuth(...)` works
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

import { fetchMatrixShifts } from './syncService'

// ── Helpers ───────────────────────────────────────────────────────────────────

const FAKE_URL = 'https://docs.google.com/spreadsheets/d/test-sheet-id/edit'
const SHIFTS_SHEET = '₽ СМЕНЫ'

/** Build a spreadsheets.get response with a single sheet named title */
function metaResponse(title: string = SHIFTS_SHEET) {
  return {
    data: {
      properties: { title: 'Test Matrix' },
      sheets: [{ properties: { title, sheetId: 0 } }],
    },
  }
}

/**
 * Build a raw 2D values array in the legacy matrix format.
 * Row indices:
 *   0-1: header rows (ignored)
 *   2:   date row — cols 9-15 have day numbers
 *   3+:  employee rows
 *
 * employeeRows is an array of { name, role?, employmentType?, shifts }
 * shifts is up to 7 booleans (J, K, L, M, N, O, P)
 */
function valuesResponse(
  employeeRows: Array<{
    name: string
    role?: string
    employmentType?: string
    shifts?: (boolean | string)[]  // true/"1" or false/"0"/""
  }>,
  dates: string[] = ['25', '26', '27', '28', '29', '30', '31'],
) {
  // Row 0 + Row 1 = empty headers
  const header0 = new Array(16).fill('')
  const header1 = new Array(16).fill('')

  // Row 2 = date row (cols 9-15)
  const dateRow = new Array(16).fill('')
  dates.forEach((d, i) => { dateRow[9 + i] = d })

  // Employee rows
  const rows = employeeRows.map(({ name, role = '', employmentType = '', shifts = [] }) => {
    const row = new Array(16).fill('')
    row[2] = name
    row[6] = role
    row[8] = employmentType
    for (let i = 0; i < 7; i++) {
      const v = shifts[i]
      row[9 + i] = v === true || v === '1' ? '1' : (v === false || v === '0' || v === undefined ? '' : String(v))
    }
    return row
  })

  return { data: { values: [header0, header1, dateRow, ...rows] } }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('fetchMatrixShifts — legacy format', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default meta: one matching sheet
    mockSpreadsheetsGet.mockResolvedValue(metaResponse())
  })

  it('returns null when no sheet matches the keywords', async () => {
    mockSpreadsheetsGet.mockResolvedValue(metaResponse('Другой лист'))
    const result = await fetchMatrixShifts(FAKE_URL)
    expect(result).toBeNull()
  })

  it('returns null for an invalid (non-extractable) URL', async () => {
    const result = await fetchMatrixShifts('not-a-url')
    expect(result).toBeNull()
  })

  it('"1" in column J (shift index 0) → shifts[0] = true (застройка)', async () => {
    mockSpreadsheetsValuesGet.mockResolvedValue(
      valuesResponse([{ name: 'Иванов', role: 'Оператор', employmentType: 'ШТАТ', shifts: [true] }]),
    )
    const result = await fetchMatrixShifts(FAKE_URL)
    expect(result).not.toBeNull()
    const row = result!.rows.find((r) => !r.isSeparator && (r as any).name === 'Иванов') as any
    expect(row).toBeDefined()
    expect(row.shifts[0]).toBe(true)   // J
    expect(row.shifts[1]).toBe(false)  // K
  })

  it('"1" in column M (shift index 3) → shifts[3] = true (эфир)', async () => {
    mockSpreadsheetsValuesGet.mockResolvedValue(
      valuesResponse([
        { name: 'Петров', role: 'Режиссёр', employmentType: 'ШТАТ', shifts: [false, false, false, true] },
      ]),
    )
    const result = await fetchMatrixShifts(FAKE_URL)
    const row = result!.rows.find((r) => !r.isSeparator && (r as any).name === 'Петров') as any
    expect(row.shifts[3]).toBe(true)   // M → efir
    expect(row.shifts[0]).toBe(false)  // J
    expect(row.shifts[2]).toBe(false)  // L
  })

  it('"1" in columns N, O, P (shift indices 4-6) → shifts[4-6] = true (демонтаж)', async () => {
    mockSpreadsheetsValuesGet.mockResolvedValue(
      valuesResponse([
        { name: 'Сидоров', employmentType: 'ШТАТ', shifts: [false, false, false, false, true, true, true] },
      ]),
    )
    const result = await fetchMatrixShifts(FAKE_URL)
    const row = result!.rows.find((r) => !r.isSeparator && (r as any).name === 'Сидоров') as any
    expect(row.shifts[4]).toBe(true)
    expect(row.shifts[5]).toBe(true)
    expect(row.shifts[6]).toBe(true)
    expect(row.shifts[3]).toBe(false) // M (efir) not set
  })

  it('row with totals like "13" in shift columns (not "1") → all shifts false', async () => {
    // Simulates "Итог:" row where the shift cells contain totals, not "1"
    mockSpreadsheetsValuesGet.mockResolvedValue(
      valuesResponse([
        { name: 'Итог:', shifts: [false, false, false, false, false, false, false] },
      ]),
    )
    // Override: put "13" in col J manually
    const raw = valuesResponse([{ name: 'Итог:', shifts: [] }])
    raw.data.values[3][9] = '13'  // J has total "13", not "1"
    mockSpreadsheetsValuesGet.mockResolvedValue(raw)

    const result = await fetchMatrixShifts(FAKE_URL)
    const row = result!.rows.find((r) => !r.isSeparator && (r as any).name === 'Итог:') as any
    expect(row).toBeDefined()
    // All shifts are false because "13" !== "1"
    expect(row.shifts.every((v: boolean) => !v)).toBe(true)
  })

  it('completely empty row (no name, no role, no employment, no shifts) → skipped', async () => {
    mockSpreadsheetsValuesGet.mockResolvedValue(
      valuesResponse([
        { name: 'Реальный сотрудник', employmentType: 'ШТАТ', shifts: [true] },
        { name: '' },   // empty row — should be skipped
      ]),
    )
    const result = await fetchMatrixShifts(FAKE_URL)
    const allRows = result!.rows.filter((r) => !r.isSeparator)
    expect(allRows).toHaveLength(1)
    expect((allRows[0] as any).name).toBe('Реальный сотрудник')
  })

  it('employmentType is preserved in the output row', async () => {
    mockSpreadsheetsValuesGet.mockResolvedValue(
      valuesResponse([
        { name: 'Козлов', role: 'Ассистент', employmentType: 'ИП 7%', shifts: [true] },
        { name: 'Морозов', role: 'Звукорежиссёр', employmentType: 'СЗТ', shifts: [false, true] },
      ]),
    )
    const result = await fetchMatrixShifts(FAKE_URL)
    const kozlov = result!.rows.find((r) => !r.isSeparator && (r as any).name === 'Козлов') as any
    const morozov = result!.rows.find((r) => !r.isSeparator && (r as any).name === 'Морозов') as any

    expect(kozlov.employmentType).toBe('ИП 7%')
    expect(morozov.employmentType).toBe('СЗТ')
  })

  it('dates array is correctly populated from row 2 (cols J-P)', async () => {
    mockSpreadsheetsValuesGet.mockResolvedValue(
      valuesResponse([{ name: 'Работник', shifts: [true] }], ['5', '6', '7', '8', '9', '10', '11']),
    )
    const result = await fetchMatrixShifts(FAKE_URL)
    expect(result!.dates).toEqual(['5', '6', '7', '8', '9', '10', '11'])
  })

  it('activeCols contains only columns that have at least one "1"', async () => {
    mockSpreadsheetsValuesGet.mockResolvedValue(
      valuesResponse([
        { name: 'А', shifts: [true, false, false, false, false, false, false] },
        { name: 'Б', shifts: [false, false, false, true, false, false, false] },
      ]),
    )
    const result = await fetchMatrixShifts(FAKE_URL)
    expect(result!.activeCols).toContain(0)
    expect(result!.activeCols).toContain(3)
    expect(result!.activeCols).not.toContain(1)
    expect(result!.activeCols).not.toContain(2)
  })

  it('sheet title is included in the result', async () => {
    mockSpreadsheetsValuesGet.mockResolvedValue(valuesResponse([]))
    const result = await fetchMatrixShifts(FAKE_URL)
    expect(result!.sheetTitle).toBe(SHIFTS_SHEET)
  })

  it('matches sheet by partial keyword "смены" (case-insensitive)', async () => {
    mockSpreadsheetsGet.mockResolvedValue(metaResponse('СМЕНЫ БРИГАДЫ'))
    mockSpreadsheetsValuesGet.mockResolvedValue(valuesResponse([]))
    const result = await fetchMatrixShifts(FAKE_URL)
    expect(result).not.toBeNull()
    expect(result!.sheetTitle).toBe('СМЕНЫ БРИГАДЫ')
  })
})
