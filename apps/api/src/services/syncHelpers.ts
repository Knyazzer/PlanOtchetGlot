import type { sheets_v4 } from 'googleapis'

// ─── URL / ID ─────────────────────────────────────────────────────────────────

export function extractSpreadsheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return match?.[1] ?? null
}

// ─── Color helpers ────────────────────────────────────────────────────────────

function hexColor(r: number, g: number, b: number): string {
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

/** Returns hex background color, or null for white/near-white/missing. */
export function bgHexOrNull(color: sheets_v4.Schema$Color | null | undefined): string | null {
  if (!color) return null
  const r = Math.round((color.red   ?? 1) * 255)
  const g = Math.round((color.green ?? 1) * 255)
  const b = Math.round((color.blue  ?? 1) * 255)
  if (r >= 252 && g >= 252 && b >= 252) return null
  return hexColor(r, g, b)
}

/** Returns hex foreground color, or null for black/near-black/missing. */
export function fgHexOrNull(color: sheets_v4.Schema$Color | null | undefined): string | null {
  if (!color) return null
  const r = Math.round((color.red   ?? 0) * 255)
  const g = Math.round((color.green ?? 0) * 255)
  const b = Math.round((color.blue  ?? 0) * 255)
  if (r <= 30 && g <= 30 && b <= 30) return null
  return hexColor(r, g, b)
}

/** Returns non-white background hex from userEnteredFormat or effectiveFormat. */
export function getCellColor(cell: sheets_v4.Schema$CellData | null | undefined): string | null {
  return bgHexOrNull(cell?.userEnteredFormat?.backgroundColor ?? cell?.effectiveFormat?.backgroundColor)
}

/** Returns non-black foreground hex from userEnteredFormat or effectiveFormat. */
export function getCellTextColor(cell: sheets_v4.Schema$CellData | null | undefined): string | null {
  return fgHexOrNull(
    cell?.userEnteredFormat?.textFormat?.foregroundColor
    ?? cell?.effectiveFormat?.textFormat?.foregroundColor
  )
}

/**
 * Manually evaluates conditional formatting rules for a cell.
 * Google Sheets API does not apply conditional formats to effectiveFormat —
 * we must evaluate booleanRule conditions ourselves.
 */
export function evalConditionalColor(
  cellValue: string,
  rowIndex: number,
  colIndex: number,
  conditionalFormats: sheets_v4.Schema$ConditionalFormatRule[]
): { bg: string | null; fg: string | null } {
  for (const rule of conditionalFormats) {
    const inRange = rule.ranges?.some((r) =>
      rowIndex >= (r.startRowIndex ?? 0) &&
      (r.endRowIndex   == null || rowIndex < r.endRowIndex) &&
      colIndex >= (r.startColumnIndex ?? 0) &&
      (r.endColumnIndex == null || colIndex < r.endColumnIndex)
    ) ?? false
    if (!inRange) continue

    const boolRule = rule.booleanRule
    if (!boolRule?.condition) continue

    const { type, values } = boolRule.condition
    const v0 = values?.[0]?.userEnteredValue ?? ''
    let matches = false

    switch (type) {
      case 'TEXT_EQ':           matches = cellValue.trim() === v0; break
      case 'TEXT_CONTAINS':     matches = cellValue.includes(v0); break
      case 'TEXT_NOT_CONTAINS': matches = !cellValue.includes(v0); break
      case 'TEXT_STARTS_WITH':  matches = cellValue.startsWith(v0); break
      case 'TEXT_ENDS_WITH':    matches = cellValue.endsWith(v0); break
      case 'NOT_BLANK':         matches = cellValue !== ''; break
      case 'BLANK':             matches = cellValue === ''; break
    }

    if (!matches) continue

    const fmt = boolRule.format
    const bg = bgHexOrNull(fmt?.backgroundColor)
    const fg = fgHexOrNull(fmt?.textFormat?.foregroundColor)
    if (bg || fg) return { bg, fg }
  }
  return { bg: null, fg: null }
}

/** True if the cell has a non-white background. */
export function isColored(cell: sheets_v4.Schema$CellData | null | undefined): boolean {
  return getCellColor(cell) !== null
}

// ─── Cell value ───────────────────────────────────────────────────────────────

/**
 * Extracts string value from a cell. Prefers userEnteredValue; falls back to
 * effectiveValue for formula cells (VLOOKUP, HYPERLINK, etc.).
 */
export function cellStr(cell: sheets_v4.Schema$CellData | null | undefined): string {
  if (!cell) return ''
  const uv = cell.userEnteredValue
  if (uv) {
    if (uv.stringValue != null && uv.stringValue !== '') return uv.stringValue.trim()
    if (uv.numberValue != null) return String(uv.numberValue).trim()
    if (uv.boolValue   != null) return String(uv.boolValue).trim()
  }
  const ev = cell.effectiveValue
  if (ev) {
    if (ev.stringValue != null && ev.stringValue !== '') return ev.stringValue.trim()
    if (ev.numberValue != null) return String(ev.numberValue).trim()
    if (ev.boolValue   != null) return String(ev.boolValue).trim()
  }
  return ''
}

// ─── Date parsing ─────────────────────────────────────────────────────────────

/** Converts a Google Sheets serial date number to a JS Date (epoch: Dec 30, 1899). */
export function serialToDate(serial: number): Date {
  const msPerDay = 86400000
  const epoch = new Date(1899, 11, 30).getTime()
  return new Date(epoch + serial * msPerDay)
}

/**
 * Parses a raw cell value into a Date. Handles:
 *   - Google Sheets serial integers (> 1000)
 *   - Russian format DD.MM.YYYY
 *   - ISO / standard date strings
 * Returns null for empty, garbage, or small serial values (≤ 1000).
 */
export function parseSheetDate(raw: string): Date | null {
  if (!raw) return null

  if (/^\d+$/.test(raw.trim())) {
    const serial = Number(raw)
    if (serial > 1000) return serialToDate(serial)
    return null
  }

  const ruMatch = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (ruMatch) {
    const d = new Date(Number(ruMatch[3]), Number(ruMatch[2]) - 1, Number(ruMatch[1]))
    return isNaN(d.getTime()) ? null : d
  }

  const parsed = new Date(raw)
  return isNaN(parsed.getTime()) ? null : parsed
}

// ─── Domain mappings ──────────────────────────────────────────────────────────

/** Maps Russian status string from Google Sheets to StatusRowStatus enum value. */
export function parseProjectStatus(raw: string): string {
  switch (raw.trim()) {
    case 'Запрос':          return 'request'
    case 'На согласовании': return 'negotiation'
    case 'Препродакшн':     return 'preproduction'
    case 'Продакшн':        return 'production'
    case 'Постпродакшн':    return 'postproduction'
    case 'Сдан':            return 'delivered'
    case 'Не согласован':   return 'rejected'
    case 'Отменён':         return 'cancelled'
    default:                return 'request'
  }
}

/** Maps employment type string from matrix sheet to EmploymentType enum value. */
export function parseEmploymentType(raw: string): 'staff' | 'ip_7' | 'ip_8' | 'ip_10' | 'szt' {
  const s = raw.trim().toUpperCase()
  if (s === 'ШТАТ' || s === 'SHTAT') return 'staff'
  if (s.includes('7'))                return 'ip_7'
  if (s.includes('8'))                return 'ip_8'
  if (s.includes('10'))               return 'ip_10'
  if (s.includes('СЗТ') || s.includes('SZT')) return 'szt'
  return 'staff'
}

/** True only for ШТАТ (staff), false for all freelance types (ИП/СЗТ). */
export function isStaffType(raw: string): boolean {
  return raw.trim().toUpperCase() === 'ШТАТ'
}
