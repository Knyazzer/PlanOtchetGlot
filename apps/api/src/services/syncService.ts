import { google, sheets_v4 } from 'googleapis'
import { randomUUID } from 'crypto'
import { prisma } from '@tv-shifts/db'

// ─── Sync Abort ───────────────────────────────────────────────────────────────

let _abortRequested = false
export function requestSyncAbort() { _abortRequested = true }
export function isSyncRunning() { return _abortRequested === false && _syncActive }
let _syncActive = false

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSheets(): sheets_v4.Sheets {
  // Если задан простой API ключ — используем его (таблицы должны быть открыты по ссылке)
  if (process.env.GOOGLE_API_KEY) {
    return google.sheets({ version: 'v4', auth: process.env.GOOGLE_API_KEY })
  }

  // Иначе — Service Account (для приватных таблиц)
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
  return google.sheets({ version: 'v4', auth })
}

function extractSpreadsheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return match?.[1] ?? null
}

function hexColor(r: number, g: number, b: number): string {
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

function bgHexOrNull(color: sheets_v4.Schema$Color | null | undefined): string | null {
  if (!color) return null
  const r = Math.round((color.red   ?? 1) * 255)
  const g = Math.round((color.green ?? 1) * 255)
  const b = Math.round((color.blue  ?? 1) * 255)
  if (r >= 252 && g >= 252 && b >= 252) return null
  return hexColor(r, g, b)
}

function fgHexOrNull(color: sheets_v4.Schema$Color | null | undefined): string | null {
  if (!color) return null
  const r = Math.round((color.red   ?? 0) * 255)
  const g = Math.round((color.green ?? 0) * 255)
  const b = Math.round((color.blue  ?? 0) * 255)
  if (r <= 30 && g <= 30 && b <= 30) return null
  return hexColor(r, g, b)
}

// Returns explicit cell background color (non-white), or null.
function getCellColor(cell: sheets_v4.Schema$CellData | null | undefined): string | null {
  return bgHexOrNull(cell?.userEnteredFormat?.backgroundColor ?? cell?.effectiveFormat?.backgroundColor)
}

// Returns explicit cell text color (non-black), or null.
function getCellTextColor(cell: sheets_v4.Schema$CellData | null | undefined): string | null {
  return fgHexOrNull(
    cell?.userEnteredFormat?.textFormat?.foregroundColor
    ?? cell?.effectiveFormat?.textFormat?.foregroundColor
  )
}

// Evaluates conditional formatting rules for a cell and returns the matching colors.
// Google Sheets API does not include conditional formatting in effectiveFormat —
// we must evaluate rules manually.
function evalConditionalColor(
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
      // CUSTOM_FORMULA requires formula evaluation — skip
    }

    if (!matches) continue

    const fmt = boolRule.format
    const bg = bgHexOrNull(fmt?.backgroundColor)
    const fg = fgHexOrNull(fmt?.textFormat?.foregroundColor)
    if (bg || fg) return { bg, fg }
  }
  return { bg: null, fg: null }
}

// Considers a cell "highlighted" if its background is non-white
function isColored(cell: sheets_v4.Schema$CellData | null | undefined): boolean {
  return getCellColor(cell) !== null
}

function cellStr(cell: sheets_v4.Schema$CellData | null | undefined): string {
  if (!cell) return ''
  // Для обычных ячеек — userEnteredValue
  const uv = cell.userEnteredValue
  if (uv) {
    if (uv.stringValue != null && uv.stringValue !== '') return uv.stringValue.trim()
    if (uv.numberValue != null) return String(uv.numberValue).trim()
    if (uv.boolValue != null) return String(uv.boolValue).trim()
  }
  // Для формульных ячеек (VLOOKUP, HYPERLINK и т.п.) — effectiveValue
  const ev = cell.effectiveValue
  if (ev) {
    if (ev.stringValue != null && ev.stringValue !== '') return ev.stringValue.trim()
    if (ev.numberValue != null) return String(ev.numberValue).trim()
    if (ev.boolValue != null) return String(ev.boolValue).trim()
  }
  return ''
}

// Google Sheets serial date → JS Date (epoch: Dec 30, 1899)
function serialToDate(serial: number): Date {
  const msPerDay = 86400000
  const epoch = new Date(1899, 11, 30).getTime()
  return new Date(epoch + serial * msPerDay)
}

function parseSheetDate(raw: string): Date | null {
  if (!raw) return null

  // Pure integer → Google Sheets serial date (days since 1899-12-30)
  // Serial numbers for modern dates are roughly 40000–60000
  if (/^\d+$/.test(raw.trim())) {
    const serial = Number(raw)
    if (serial > 1000) return serialToDate(serial)
    return null
  }

  // Russian format DD.MM.YYYY
  const ruMatch = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (ruMatch) {
    const d = new Date(Number(ruMatch[3]), Number(ruMatch[2]) - 1, Number(ruMatch[1]))
    return isNaN(d.getTime()) ? null : d
  }

  // ISO or other string formats
  const parsed = new Date(raw)
  return isNaN(parsed.getTime()) ? null : parsed
}

// Маппинг статусов из Google Sheets → enum
function parseProjectStatus(raw: string): string {
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

function parseEmploymentType(raw: string): 'staff' | 'ip_7' | 'ip_8' | 'ip_10' | 'szt' {
  const s = raw.trim().toUpperCase()
  if (s === 'ШТАТ' || s === 'SHTAT') return 'staff'
  if (s.includes('7')) return 'ip_7'
  if (s.includes('8')) return 'ip_8'
  if (s.includes('10')) return 'ip_10'
  if (s.includes('СЗТ') || s.includes('SZT')) return 'szt'
  return 'staff'
}

function isStaffType(raw: string): boolean {
  return raw.trim().toUpperCase() === 'ШТАТ'
}

async function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// ─── Sync: Projects Table ────────────────────────────────────────────────────

async function syncProjects(sheets: sheets_v4.Sheets): Promise<{ upserted: number; errors: string[] }> {
  const spreadsheetId = process.env.GOOGLE_PROJECTS_SHEET_ID
  if (!spreadsheetId) throw new Error('GOOGLE_PROJECTS_SHEET_ID not set')

  // Read with formatting to detect cell colors (columns A–AK = indices 0–36)
  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    includeGridData: true,
    ranges: ['A1:AK'],
  })

  const sheet = res.data.sheets?.[0]
  const rows = sheet?.data?.[0]?.rowData ?? []
  const conditionalFormats = sheet?.conditionalFormats ?? []
let upserted = 0
  const errors: string[] = []

  // Колонки (0-indexed):
  // A(0)=Статус B(1)=Клиент C(2)=Название D(3)=Исп.продюсер E(4)=Лайн-продюсер
  // F(5)=Аккаунт G(6)=Дата H(7)=Время I(8)=Формат J(9)=Локация K(10)=№ по матрице L(11)=Постпродакшн


  // Диагностика первых 15 строк — показываем A, B, C чтобы понять структуру
  for (let di = 1; di <= Math.min(15, rows.length - 1); di++) {
    const dc = rows[di].values ?? []
    console.log(`[sync] Projects row ${di + 1}: A="${cellStr(dc[0])}" B="${cellStr(dc[1])}" C="${cellStr(dc[2])}" I="${cellStr(dc[8])}"`)
  }

  // Row 0 is the header — start from row 1 (1-indexed row 2)
  let skippedEmpty = 0
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i].values ?? []

    // Пропускаем полностью пустые строки
    const hasAnyData = [0,1,2,3,4,5,6,7,8,9,10].some((col) => cellStr(cells[col]) !== '')
    if (!hasAnyData) { skippedEmpty++; continue }

    const googleRowIndex = i + 1

    // Разделители месяцев: только колонка A заполнена, B–K пусты
    // Сохраняем через raw SQL, чтобы обойти устаревший Prisma-клиент (не знает 'separator')
    const hasDataBeyondA = [1,2,3,4,5,6,7,8,9,10].some((col) => cellStr(cells[col]) !== '')
    if (!hasDataBeyondA) {
      const separatorText = cellStr(cells[0])
      if (separatorText) {
        const existing = await prisma.$queryRawUnsafe<{ id: string }[]>(
          `SELECT id FROM status_rows WHERE google_row_index = $1 LIMIT 1`,
          googleRowIndex,
        )
        if (existing.length > 0) {
          await prisma.$executeRawUnsafe(
            `UPDATE status_rows SET name = $1, updated_at = NOW() WHERE id = $2`,
            separatorText, existing[0].id,
          )
        } else {
          await prisma.$executeRawUnsafe(
            `INSERT INTO status_rows (id, name, source, google_row_index, status, date_confirmed, created_at, updated_at, uncertain_fields)
             VALUES ($1, $2, 'separator'::"StatusRowSource", $3, 'request'::"StatusRowStatus", false, NOW(), NOW(), ARRAY[]::text[])`,
            randomUUID(), separatorText, googleRowIndex,
          )
        }
      }
      skippedEmpty++
      continue
    }

    const formatRaw = cellStr(cells[8]).trim()

    // Название — колонка C, fallback на клиента (B) если пусто
    const name = cellStr(cells[2]) || cellStr(cells[1]) || '—'

    // Статус из колонки A (индекс 0)
    const statusRaw = cellStr(cells[0])
    const status = parseProjectStatus(statusRaw) as any

    // Цвета ячеек → uncertainFields (формат "fieldName:#bgColor" или "fieldName:#bgColor|#fgColor" или "fieldName:|#fgColor")
    // Колонки 0 (status), 8 (format), 9 (location) — цвета задаются фронтом через маппинг, не читаем из таблицы
    const fieldNames = ['status', 'client', 'name', 'execProducer', 'lineProducer', 'accountManager', 'date', 'time', 'format', 'location', 'sheetMatrixId']
    const skipColorCols = new Set([0, 8, 9])
    const uncertainFields: string[] = []
    for (let col = 0; col < 11; col++) {
      if (skipColorCols.has(col)) continue
      const cell = cells[col]
      let bg = getCellColor(cell)
      let fg = getCellTextColor(cell)
      if (!bg && !fg) {
        const cond = evalConditionalColor(cellStr(cell), i, col, conditionalFormats)
        bg = cond.bg
        fg = cond.fg
      }
      if (bg || fg) {
        uncertainFields.push(`${fieldNames[col]}:${bg ?? ''}${fg ? `|${fg}` : ''}`)
      }
    }

    // Дата — колонка G (индекс 6)
    const dateRaw = cellStr(cells[6])
    let date: Date | null = null
    let dateApproximate: string | null = null
    if (dateRaw) {
      const parsed = parseSheetDate(dateRaw)
      if (parsed) date = parsed
      else dateApproximate = dateRaw
    }

    // ID матрицы — колонка K (индекс 10)
    const sheetMatrixId = cellStr(cells[10]) || null

    const data = {
      name,
      client:         cellStr(cells[1]) || null,  // B
      execProducer:   cellStr(cells[3]) || null,  // D
      lineProducer:   cellStr(cells[4]) || null,  // E
      accountManager: cellStr(cells[5]) || null,  // F
      date,
      dateApproximate,
      time:           cellStr(cells[7]) || null,  // H
      format:         formatRaw || null,           // I
      location:       cellStr(cells[9]) || null,  // J
      status,
      uncertainFields,
      sheetMatrixId,
    }

    try {
      const existing = await prisma.statusRow.findFirst({ where: { googleRowIndex } })
      if (existing) {
        await prisma.statusRow.update({ where: { id: existing.id }, data })
      } else {
        await prisma.statusRow.create({ data: { ...data, source: 'projects_table', googleRowIndex } })
      }
      upserted++
    } catch (e: any) {
      errors.push(`Projects row ${googleRowIndex}: ${e.message}`)
    }
  }

  console.log(`[sync] Projects: импортировано ${upserted}, пропущено пустых строк/разделителей: ${skippedEmpty}`)
  return { upserted, errors }
}

// ─── Sync: Matrix Registry ────────────────────────────────────────────────────

async function syncRegistry(sheets: sheets_v4.Sheets): Promise<{ upserted: number; errors: string[] }> {
  const spreadsheetId = process.env.GOOGLE_REGISTRY_SHEET_ID
  if (!spreadsheetId) throw new Error('GOOGLE_REGISTRY_SHEET_ID not set')

  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    includeGridData: true,
    ranges: ['A1:L'],
  })

  const rowData = res.data.sheets?.[0]?.data?.[0]?.rowData ?? []
  let upserted = 0
  const errors: string[] = []



  // Строки 1-2 (индексы 0-1) — заголовки, пропускаем
  // Колонка D (индекс 3) — игнорируем
  // Реестр матриц: A(0)=Статус B(1)=Матрица(URL) C(2)=ID E(4)=Юнит
  // F(5)=Заказчик G(6)=Название H(7)=Формат I(8)=Дата J(9)=Продюсер K(10)=Менеджер L(11)=Куратор
  const seenMatrixIds = new Set<string>()
  for (let i = 2; i < rowData.length; i++) {
    const cells = rowData[i].values ?? []

    // Пропускаем строки где нет данных ни в одном значимом столбце (кроме D)
    const MEANINGFUL_COLS = [0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11]
    const hasAnyData = MEANINGFUL_COLS.some((col) => cellStr(cells[col]) !== '')
    if (!hasAnyData) continue

    const matrixIdRaw = cellStr(cells[2]) // C — ID матрицы

    // Если ID дублируется в таблице — добавляем номер строки, чтобы сохранить обе записи
    let matrixId = matrixIdRaw || `row_${i + 1}`
    if (matrixIdRaw && seenMatrixIds.has(matrixIdRaw)) {
      matrixId = `${matrixIdRaw}_row_${i + 1}`
    }
    if (matrixIdRaw) seenMatrixIds.add(matrixIdRaw)

    // B — ссылка на матрицу (Smart Chip / hyperlink / HYPERLINK formula / plain text)
    const cellB = cells[1]
    // 1. Smart Chip (chipRuns[].chip.richLinkProperties.uri) — новый формат Google Sheets
    let sheetUrlRaw = ''
    const chipRuns = (cellB as any)?.chipRuns ?? []
    for (const cr of chipRuns) {
      const uri = cr?.chip?.richLinkProperties?.uri
      if (uri) { sheetUrlRaw = uri; break }
    }
    // 2. Поле hyperlink (Insert > Link или API)
    if (!sheetUrlRaw) sheetUrlRaw = cellB?.hyperlink ?? ''
    // 3. Формула =HYPERLINK("url","текст")
    if (!sheetUrlRaw) {
      const formula = cellB?.userEnteredValue?.formulaValue ?? ''
      const m = formula.match(/=HYPERLINK\s*\(\s*"([^"]+)"/i)
      if (m) sheetUrlRaw = m[1]
    }
    // 4. Rich text link (textFormatRuns[*].format.link.uri)
    if (!sheetUrlRaw) {
      const runs = cellB?.textFormatRuns ?? []
      for (const run of runs) {
        const uri = (run as any).format?.link?.uri
        if (uri) { sheetUrlRaw = uri; break }
      }
    }
    // 5. Просто текст URL/название в ячейке
    if (!sheetUrlRaw) sheetUrlRaw = cellStr(cellB)
    const sheetUrl = sheetUrlRaw || null

    const dateRaw = cellStr(cells[8]) // I — Дата
    const date = dateRaw ? parseSheetDate(dateRaw) : null

    // Привязка к проекту по ID матрицы (sheetMatrixId в таблице проектов = matrixId здесь)
    let projectId: string | null = null
    const byMatrixId = await prisma.statusRow.findFirst({
      where: { sheetMatrixId: matrixId } as any,
    })
    if (byMatrixId) {
      projectId = byMatrixId.id
    } else if (sheetUrl) {
      const sheetSpreadsheetId = extractSpreadsheetId(sheetUrl)
      if (sheetSpreadsheetId) {
        const linked = await prisma.statusRow.findFirst({
          where: { matrixUrl: { contains: sheetSpreadsheetId } },
        })
        if (linked) projectId = linked.id
      }
    }

    const entry = {
      sheetUrl,
      status:        cellStr(cells[0])  || null,  // A
      unit:          cellStr(cells[4])  || null,  // E
      client:        cellStr(cells[5])  || null,  // F
      name:          cellStr(cells[6])  || null,  // G
      format:        cellStr(cells[7])  || null,  // H
      date,                                        // I
      producer:      cellStr(cells[9])  || null,  // J
      manager:       cellStr(cells[10]) || null,  // K
      curator:       cellStr(cells[11]) || null,  // L
      projectId,
      googleRowIndex: i + 1,
      lastSyncedAt:  new Date(),
    }

    try {
      await prisma.matrixRegistry.upsert({
        where: { matrixId },
        create: { matrixId, ...entry },
        update: entry,
      })
      upserted++
    } catch (e: any) {
      errors.push(`Registry matrixId ${matrixId}: ${e.message}`)
    }
  }

  console.log(`[sync] Registry: импортировано ${upserted}`)
  return { upserted, errors }
}

// ─── Sync: Individual Matrix ─────────────────────────────────────────────────

async function syncMatrix(
  _sheets: sheets_v4.Sheets,
  registryEntry: { id: string; matrixId: string; sheetUrl: string | null; projectId: string | null }
): Promise<{ upserted: number; errors: string[] }> {
  if (!registryEntry.sheetUrl) return { upserted: 0, errors: [] }

  const spreadsheetId = extractSpreadsheetId(registryEntry.sheetUrl)
  if (!spreadsheetId) {
    return { upserted: 0, errors: [`Invalid matrix URL: ${registryEntry.sheetUrl}`] }
  }

  let upserted = 0
  const errors: string[] = []

  // ── Find the linked project ──────────────────────────────────────────────
  let projectId = registryEntry.projectId
  if (!projectId) {
    const linked = await prisma.statusRow.findFirst({
      where: { matrixUrl: { contains: spreadsheetId } },
    })
    projectId = linked?.id ?? null
  }
  // ── Parse shifts using shared fetchMatrixShifts ──────────────────────────
  // fetchMatrixShifts finds the sheet by keyword, applies correct row filtering,
  // and returns parsed rows — same logic as the preview endpoint.
  let shiftsData: Awaited<ReturnType<typeof fetchMatrixShifts>>
  try {
    shiftsData = await fetchMatrixShifts(registryEntry.sheetUrl)
  } catch (e: any) {
    errors.push(`Matrix ${registryEntry.matrixId}: ${e.message}`)
    return { upserted, errors }
  }
  if (!shiftsData) {
    // No shifts sheet found — mark as no shifts data
    await prisma.$executeRawUnsafe(
      `UPDATE matrix_registry SET last_synced_at = NOW(), has_shifts_data = false WHERE id = $1`,
      registryEntry.id,
    )
    return { upserted, errors }
  }

  // Save hasShiftsData + cache immediately so frontend can show it even before processing employees
  await prisma.$executeRawUnsafe(
    `UPDATE matrix_registry SET has_shifts_data = $1, shifts_cache = $2::jsonb WHERE id = $3`,
    shiftsData.activeCols.length > 0,
    JSON.stringify(shiftsData),
    registryEntry.id,
  )

  if (!projectId) {
    await prisma.$executeRawUnsafe(
      `UPDATE matrix_registry SET last_synced_at = NOW() WHERE id = $1`,
      registryEntry.id,
    )
    return { upserted, errors }
  }

  // ── Resolve actual dates from day numbers ────────────────────────────────
  // dates[] in shiftsData are formatted day strings (e.g. "25", "26").
  // We need real Date objects. Use MatrixRegistry.date as the month anchor,
  // falling back to the current month.
  const anchorEntry = await prisma.matrixRegistry.findFirst({ where: { id: registryEntry.id } })
  const anchorDate = anchorEntry?.date ?? new Date()
  const anchorYear = anchorDate.getFullYear()
  const anchorMonth = anchorDate.getMonth() // 0-based

  const shiftDates: (Date | null)[] = shiftsData.dates.map((dayStr) => {
    const day = parseInt(dayStr, 10)
    if (!day || isNaN(day)) return null
    return new Date(anchorYear, anchorMonth, day)
  })

  // Shift type by column position within J–P (0-indexed within activeCols source)
  const shiftTypeByOffset = (colOffset: number): 'zastroyka' | 'efir' | 'demontazh' => {
    if (colOffset < 3) return 'zastroyka' // J, K, L
    if (colOffset === 3) return 'efir'    // M
    return 'demontazh'                    // N, O, P
  }

  // ── Process employee rows ────────────────────────────────────────────────
  for (const row of shiftsData.rows) {
    if (row.isSeparator) continue

    const fullName = row.name.trim()
    const roleOnSite      = row.role ?? null
    const employmentRaw   = row.employmentType ?? ''
    const employmentType  = parseEmploymentType(employmentRaw)
    const isStaff         = isStaffType(employmentRaw)

    // Only create assignments/shifts for rows with a name
    if (!fullName) continue

    const user = await prisma.user.findFirst({
      where: { fullName: { equals: fullName, mode: 'insensitive' } },
    })

    if (!user) {
      const exists = await prisma.notification.findFirst({
        where: { type: 'unmatched_name', entityId: registryEntry.id, message: { contains: fullName } },
      })
      if (!exists) {
        await prisma.notification.create({
          data: {
            type: 'unmatched_name',
            entityType: 'matrix',
            entityId: registryEntry.id,
            message: `Сотрудник не найден в системе: «${fullName}» (матрица ${registryEntry.matrixId})`,
            userId: null,
          },
        })
      }
    }

    let assignment = await prisma.projectAssignment.findFirst({
      where: { projectId, ...(user ? { userId: user.id } : { unmatchedName: fullName }) },
    })
    if (assignment) {
      assignment = await prisma.projectAssignment.update({
        where: { id: assignment.id },
        data: { roleOnSite, employmentType },
      })
    } else {
      assignment = await prisma.projectAssignment.create({
        data: { projectId, userId: user?.id ?? null, unmatchedName: user ? null : fullName, roleOnSite, employmentType },
      })
    }

    if (!isStaff || !user) continue

    // Create ShiftEntries for active columns that have a "1"
    for (const ci of shiftsData.activeCols) {
      if (!row.shifts[ci]) continue
      const shiftDate = shiftDates[ci]
      if (!shiftDate) continue
      const shiftType = shiftTypeByOffset(ci)

      const exists = await prisma.shiftEntry.findFirst({
        where: { assignmentId: assignment.id, date: shiftDate, shiftType },
      })
      if (!exists) {
        await prisma.shiftEntry.create({
          data: { assignmentId: assignment.id, userId: user.id, projectId, date: shiftDate, shiftType, source: 'matrix' },
        })
        upserted++
      }
    }
  }

  await prisma.$executeRawUnsafe(
    `UPDATE matrix_registry SET last_synced_at = NOW() WHERE id = $1`,
    registryEntry.id,
  )

  return { upserted, errors }
}

// ─── Matrix Preview ──────────────────────────────────────────────────────────

export interface MatrixCell {
  value: string
  bg: string | null
  fg: string | null
  bold: boolean
  italic: boolean
  colSpan?: number
  rowSpan?: number
  hidden?: boolean // covered by a merge
}

export interface MatrixSheetData {
  title: string
  rows: MatrixCell[][]
  colWidths: number[] // pixel widths per column
}

export interface MatrixPreview {
  spreadsheetTitle: string
  spreadsheetUrl: string
  sheets: { title: string; sheetId: number }[]
  data: MatrixSheetData | null
}

export async function fetchMatrixPreview(
  spreadsheetUrl: string,
  sheetTitle?: string,
): Promise<MatrixPreview> {
  const sheetsApi = getSheets()
  const spreadsheetId = extractSpreadsheetId(spreadsheetUrl)
  if (!spreadsheetId) throw new Error('Invalid matrix URL')

  // Step 1 — get sheet list without grid data (fast)
  const meta = await sheetsApi.spreadsheets.get({ spreadsheetId, includeGridData: false })
  const allSheetsMeta = meta.data.sheets ?? []
  const sheetList = allSheetsMeta.map((s) => ({
    title: s.properties?.title ?? '',
    sheetId: s.properties?.sheetId ?? 0,
  }))

  const spreadsheetTitle = meta.data.properties?.title ?? ''
  const targetTitle = sheetTitle ?? sheetList[0]?.title ?? ''
  if (!targetTitle) return { spreadsheetTitle, spreadsheetUrl, sheets: sheetList, data: null }

  // Step 2 — get grid data (colors, merges, widths) + formatted values in parallel
  const safeTitle = targetTitle.replace(/'/g, "\\'")
  const rangeStr = `'${safeTitle}'!A1:AZ300`

  const [res, fmtRes] = await Promise.all([
    sheetsApi.spreadsheets.get({
      spreadsheetId,
      includeGridData: true,
      ranges: [rangeStr],
    }),
    sheetsApi.spreadsheets.values.get({
      spreadsheetId,
      range: rangeStr,
      valueRenderOption: 'FORMATTED_VALUE',
    }),
  ])

  const fmtValues: string[][] = (fmtRes.data.values ?? []) as string[][]

  const targetSheet = res.data.sheets?.[0]
  if (!targetSheet) return { spreadsheetTitle, spreadsheetUrl, sheets: sheetList, data: null }

  const gridData = targetSheet.data?.[0]
  const rowData  = gridData?.rowData ?? []

  // Determine number of columns from the data
  const colCount = rowData.reduce((max, row) => Math.max(max, row.values?.length ?? 0), 0)

  // Column widths (px) from metadata, fallback 100px
  const colMeta = gridData?.columnMetadata ?? []
  const colWidths: number[] = Array.from({ length: colCount }, (_, ci) => {
    const px = colMeta[ci]?.pixelSize
    return px && px > 0 ? px : 100
  })

  // Build merge lookup: for each (row, col) → { rowSpan, colSpan } or hidden
  type MergeInfo = { rowSpan: number; colSpan: number } | 'hidden'
  const mergeMap = new Map<string, MergeInfo>()
  for (const m of targetSheet.merges ?? []) {
    const r0 = m.startRowIndex ?? 0
    const r1 = m.endRowIndex   ?? r0 + 1
    const c0 = m.startColumnIndex ?? 0
    const c1 = m.endColumnIndex   ?? c0 + 1
    mergeMap.set(`${r0}_${c0}`, { rowSpan: r1 - r0, colSpan: c1 - c0 })
    for (let r = r0; r < r1; r++) {
      for (let c = c0; c < c1; c++) {
        if (r === r0 && c === c0) continue
        mergeMap.set(`${r}_${c}`, 'hidden')
      }
    }
  }

  const rows: MatrixCell[][] = rowData.map((row, ri) => {
    const cells = row.values ?? []
    return Array.from({ length: colCount }, (_, ci) => {
      const cell = cells[ci]
      const mergeInfo = mergeMap.get(`${ri}_${ci}`)
      if (mergeInfo === 'hidden') return { value: '', bg: null, fg: null, bold: false, italic: false, hidden: true }
      // FORMATTED_VALUE from values.get = exactly what Google Sheets displays
      const value = fmtValues[ri]?.[ci] ?? cell?.formattedValue ?? ''
      const mc: MatrixCell = {
        value,
        bg:     getCellColor(cell),
        fg:     getCellTextColor(cell),
        bold:   cell?.userEnteredFormat?.textFormat?.bold   ?? false,
        italic: cell?.userEnteredFormat?.textFormat?.italic ?? false,
      }
      if (mergeInfo) { mc.rowSpan = mergeInfo.rowSpan; mc.colSpan = mergeInfo.colSpan }
      return mc
    })
  })

  return {
    spreadsheetTitle,
    spreadsheetUrl,
    sheets: sheetList,
    data: { title: targetTitle, rows, colWidths },
  }
}

// ─── Matrix Shifts ───────────────────────────────────────────────────────────

export interface ShiftRow {
  isSeparator: true
  text: string
}

export interface ShiftEmployee {
  isSeparator: false
  name: string
  role: string | null
  employmentType: string | null
  shifts: boolean[] // length = 7, indices 0–6 → columns J–P
}

export interface MatrixShiftsData {
  sheetTitle: string
  dates: string[]    // display values for columns J–P (7 items)
  activeCols: number[] // 0-based indices (0–6) where at least one "1" exists
  rows: (ShiftRow | ShiftEmployee)[]
}

// Sheet name patterns to look for (case-insensitive)
const SHIFTS_SHEET_KEYWORDS = ['₽ смены', '₽ специалист', 'смены', 'специалист', 'сотрудник']

export async function fetchMatrixShifts(spreadsheetUrl: string): Promise<MatrixShiftsData | null> {
  const sheetsApi = getSheets()
  const spreadsheetId = extractSpreadsheetId(spreadsheetUrl)
  if (!spreadsheetId) return null

  // Step 1 — find the right sheet name
  const meta = await sheetsApi.spreadsheets.get({ spreadsheetId, includeGridData: false })
  const allTitles = (meta.data.sheets ?? []).map((s) => s.properties?.title ?? '')

  console.log(`[matrix-shifts] Available sheets: ${JSON.stringify(allTitles)}`)

  const sheetTitle = allTitles.find((t) =>
    SHIFTS_SHEET_KEYWORDS.some((k) => t.toLowerCase().includes(k))
  )
  console.log(`[matrix-shifts] Matched sheet: ${sheetTitle ?? 'none'}`)
  if (!sheetTitle) return null

  // Step 2 — fetch FORMATTED_VALUE for A1:P200 (retry once on rate-limit)
  const safeTitle = sheetTitle.replace(/'/g, "\\'")
  let res
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      res = await sheetsApi.spreadsheets.values.get({
        spreadsheetId,
        range: `'${safeTitle}'!A1:P200`,
        valueRenderOption: 'FORMATTED_VALUE',
      })
      break
    } catch (e: any) {
      const status = e?.response?.status ?? e?.code
      if ((status === 429 || status === 503) && attempt < 2) {
        console.warn(`[matrix-shifts] Rate limit hit, retrying in ${(attempt + 1) * 3}s...`)
        await delay((attempt + 1) * 3000)
        continue
      }
      throw e
    }
  }
  if (!res) throw new Error('Failed to fetch matrix shifts after retries')

  const rawRows = (res.data.values ?? []) as string[][]

  // Row 3 (index 2) — day numbers in columns J–P (0-based indices 9–15)
  const dateRow = rawRows[2] ?? []
  const dates: string[] = Array.from({ length: 7 }, (_, i) => (dateRow[9 + i] ?? '').trim())

  // Determine which columns (0–6) have at least one "1" in rows 4+ (index 3+)
  const activeCols: number[] = []
  for (let ci = 0; ci < 7; ci++) {
    const hasShift = rawRows.slice(3).some((row) => (row[9 + ci] ?? '').trim() === '1')
    if (hasShift) activeCols.push(ci)
  }

  // Parse employee rows and separators from row 4+ (index 3+)
  const rows: (ShiftRow | ShiftEmployee)[] = []
  for (let ri = 3; ri < rawRows.length; ri++) {
    const row = rawRows[ri]
    const name           = (row[2]  ?? '').trim() // C
    const role           = (row[6]  ?? '').trim() // G
    const employmentType = (row[8]  ?? '').trim() // I
    const shiftVals      = Array.from({ length: 7 }, (_, ci) => (row[9 + ci] ?? '').trim())

    // Skip rows with no meaningful data in C, G, I, J–P
    // J–P only counts if value is exactly "1" (shift marker); numbers like "13"/"Итог" are totals rows
    const hasData = name || role || employmentType || shiftVals.some((v) => v === '1')
    if (!hasData) continue

    rows.push({
      isSeparator: false,
      name,
      role: role || null,
      employmentType: employmentType || null,
      shifts: shiftVals.map((v) => v === '1'),
    })
  }

  return { sheetTitle, dates, activeCols, rows }
}

// ─── Full Sync Orchestration ─────────────────────────────────────────────────

export interface SyncResult {
  projectsUpserted: number
  registryUpserted: number
  shiftsUpserted: number
  errors: string[]
  durationMs: number
}

export async function runFullSync(): Promise<SyncResult> {
  _abortRequested = false
  _syncActive = true
  const startedAt = Date.now()
  const allErrors: string[] = []
  let projectsUpserted = 0
  let registryUpserted = 0
  let shiftsUpserted = 0

  const hasCredentials =
    process.env.GOOGLE_API_KEY ||
    (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY)

  if (!hasCredentials) {
    console.warn('[sync] Google credentials not set — skipping sync')
    return { projectsUpserted: 0, registryUpserted: 0, shiftsUpserted: 0, errors: ['Google credentials not configured'], durationMs: 0 }
  }

  const sheets = getSheets()

  // ── 1. Sync projects table ─────────────────────────────────────────────
  const projectsLog = await prisma.syncLog.create({
    data: { type: 'projects', status: 'running' },
  })

  try {
    const result = await syncProjects(sheets)
    projectsUpserted = result.upserted
    allErrors.push(...result.errors)
    await prisma.syncLog.update({
      where: { id: projectsLog.id },
      data: {
        status: result.errors.length > 0 ? 'error' : 'success',
        changesCount: result.upserted,
        errors: result.errors,
        finishedAt: new Date(),
      },
    })
  } catch (e: any) {
    allErrors.push(`Projects sync failed: ${e.message}`)
    await prisma.syncLog.update({
      where: { id: projectsLog.id },
      data: { status: 'error', errors: [e.message], finishedAt: new Date() },
    })
  }

  await delay(1000) // rate limiting pause

  // ── 2. Sync registry ───────────────────────────────────────────────────
  const registryLog = await prisma.syncLog.create({
    data: { type: 'registry', status: 'running' },
  })

  try {
    const result = await syncRegistry(sheets)
    registryUpserted = result.upserted
    allErrors.push(...result.errors)
    await prisma.syncLog.update({
      where: { id: registryLog.id },
      data: {
        status: result.errors.length > 0 ? 'error' : 'success',
        changesCount: result.upserted,
        errors: result.errors,
        finishedAt: new Date(),
      },
    })
  } catch (e: any) {
    allErrors.push(`Registry sync failed: ${e.message}`)
    await prisma.syncLog.update({
      where: { id: registryLog.id },
      data: { status: 'error', errors: [e.message], finishedAt: new Date() },
    })
  }

  await delay(1000)

  // ── 3. Sync individual matrices ────────────────────────────────────────
  const allEntries = await prisma.matrixRegistry.findMany({
    select: { id: true, matrixId: true, sheetUrl: true, projectId: true },
  })

  for (const entry of allEntries) {
    if (_abortRequested) {
      console.log('[sync] Abort requested — stopping matrix sync')
      break
    }
    if (!entry.sheetUrl) continue
    const matrixLog = await prisma.syncLog.create({
      data: { type: 'matrix', targetId: entry.matrixId, status: 'running' },
    })
    try {
      const result = await syncMatrix(sheets, entry)
      shiftsUpserted += result.upserted
      allErrors.push(...result.errors)
      await prisma.syncLog.update({
        where: { id: matrixLog.id },
        data: {
          status: result.errors.length > 0 ? 'error' : 'success',
          changesCount: result.upserted,
          errors: result.errors,
          finishedAt: new Date(),
        },
      })
    } catch (e: any) {
      allErrors.push(`Matrix ${entry.matrixId} sync failed: ${e.message}`)
      await prisma.syncLog.update({
        where: { id: matrixLog.id },
        data: { status: 'error', errors: [e.message], finishedAt: new Date() },
      })
    }
    await delay(1500) // rate limiting between matrices (~2 req each → ~80 req/min, well under 300 limit)
  }

  _syncActive = false
  return {
    projectsUpserted,
    registryUpserted,
    shiftsUpserted,
    errors: allErrors,
    durationMs: Date.now() - startedAt,
  }
}
