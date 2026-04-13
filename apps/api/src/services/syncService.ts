import { google, sheets_v4 } from 'googleapis'
import { randomUUID } from 'crypto'
import { prisma } from '@tv-shifts/db'
import { findSheetConfig } from './databaseService'
import {
  extractSpreadsheetId,
  bgHexOrNull,
  fgHexOrNull,
  getCellColor,
  getCellTextColor,
  evalConditionalColor,
  isColored,
  cellStr,
  serialToDate,
  parseSheetDate,
  parseProjectStatus,
  parseEmploymentType,
  isStaffType,
} from './syncHelpers'

// ─── Sync Abort ───────────────────────────────────────────────────────────────

let _abortRequested = false
export function requestSyncAbort() { _abortRequested = true }
let _syncActive = false
export function isSyncActive() { return _syncActive }

// ─── Google Sheets client ─────────────────────────────────────────────────────

function getSheets(apiKey?: string | null): sheets_v4.Sheets {
  if (apiKey) {
    return google.sheets({ version: 'v4', auth: apiKey })
  }
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  return google.sheets({ version: 'v4', auth })
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
            `UPDATE status_rows SET name = $1, source = 'separator'::"StatusRowSource", updated_at = NOW() WHERE id = $2`,
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
        await prisma.statusRow.update({ where: { id: existing.id }, data: { ...data, source: 'projects_table' as any } })
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
  const apiKey = (await findSheetConfig('registry'))?.api_key ?? null
  const sheetsApi = getSheets(apiKey)
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
  shifts: boolean[] // length = dates.length
}

export interface MatrixShiftsData {
  sheetTitle: string
  dates: string[]      // display values for day columns
  activeCols: number[] // 0-based indices into dates[] where at least one "1" exists
  rows: (ShiftRow | ShiftEmployee)[]
}

// Sheet name patterns to look for (case-insensitive)
const SHIFTS_SHEET_KEYWORDS = ['₽ смены', '₽ специалист', 'смены', 'специалист', 'сотрудник']

// v4.1 shift columns: O–U (0-based indices 14–20)
const V41_SHIFT_COLS = [14, 15, 16, 17, 18, 19, 20]

/**
 * Parse "Матрица v4.1" block-based format.
 * Structure:
 *   Row N:   "Блок № (Смена №)" | "<date label>" | ...  | <day names in O–U>
 *   Row N+1: (empty A/B)        | ...              | ...  | <day numbers in O–U>
 *   Rows N+2…: employee rows: A=ФИО, B=Функция, O–U = "1" shift markers
 *   (next block starts with another "Блок" row)
 */
function parseV41Shifts(rawRows: string[][], sheetTitle: string): MatrixShiftsData {
  // Collect block metadata in a first pass
  const blocks: Array<{
    label: string
    dates: string[]
    employees: Array<{ name: string; role: string | null; shifts: boolean[] }>
  }> = []

  let bi = -1
  for (let ri = 0; ri < rawRows.length; ri++) {
    const row = rawRows[ri] ?? []
    const cellA = (row[0] ?? '').trim()

    if (cellA.toLowerCase().startsWith('блок')) {
      // Block header row — collect date label from column B
      const label = (row[1] ?? '').trim()
      blocks.push({ label, dates: [], employees: [] })
      bi = blocks.length - 1

      // Next row has day numbers in O–U
      const dateRow = rawRows[ri + 1] ?? []
      blocks[bi].dates = V41_SHIFT_COLS.map((ci) => (dateRow[ci] ?? '').trim())
      ri++ // skip the date row
      continue
    }

    if (bi === -1) continue // rows before first block

    const name = cellA
    const role = (row[1] ?? '').trim()
    const shiftVals = V41_SHIFT_COLS.map((ci) => (row[ci] ?? '').trim())

    // Skip rows with no data (name, role, or any "1" shift)
    const hasData = name || role || shiftVals.some((v) => v === '1')
    if (!hasData) continue

    blocks[bi].employees.push({
      name,
      role: role || null,
      shifts: shiftVals.map((v) => v === '1'),
    })
  }

  // Build flat dates array and rows
  const dates: string[] = blocks.flatMap((b) => b.dates)
  const totalCols = dates.length
  const rows: (ShiftRow | ShiftEmployee)[] = []
  let colOffset = 0

  for (const block of blocks) {
    if (block.label) {
      rows.push({ isSeparator: true, text: block.label })
    }
    for (const emp of block.employees) {
      const fullShifts = new Array(totalCols).fill(false) as boolean[]
      emp.shifts.forEach((v, i) => { fullShifts[colOffset + i] = v })
      rows.push({
        isSeparator: false,
        name: emp.name,
        role: emp.role,
        employmentType: null,
        shifts: fullShifts,
      })
    }
    colOffset += block.dates.length
  }

  // Active columns: any column with at least one "1"
  const activeCols: number[] = []
  for (let ci = 0; ci < totalCols; ci++) {
    if (rows.some((r) => !r.isSeparator && (r as ShiftEmployee).shifts[ci])) {
      activeCols.push(ci)
    }
  }

  return { sheetTitle, dates, activeCols, rows }
}

export async function fetchMatrixShifts(spreadsheetUrl: string): Promise<MatrixShiftsData | null> {
  const apiKey = (await findSheetConfig('registry'))?.api_key ?? null
  const sheetsApi = getSheets(apiKey)
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
        range: `'${safeTitle}'!A1:U200`,
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

  // ── Detect format ─────────────────────────────────────────────────────────
  // v4.1 internal template: block-based, shifts in columns O–U (indices 14–20),
  // identified by a row where column A starts with "Блок".
  // Legacy external format: single header at row 3, shifts in columns J–P (9–15).
  const isV41 = rawRows.slice(0, 10).some(
    (r) => (r[0] ?? '').trim().toLowerCase().startsWith('блок'),
  )

  if (isV41) {
    return parseV41Shifts(rawRows, sheetTitle)
  }

  // ── Legacy format ─────────────────────────────────────────────────────────
  // Row 3 (index 2) — day numbers in columns J–P (0-based indices 9–15)
  const dateRow = rawRows[2] ?? []
  const dates: string[] = Array.from({ length: 7 }, (_, i) => (dateRow[9 + i] ?? '').trim())

  // Determine which columns (0–6) have at least one "1" in rows 4+ (index 3+)
  const activeCols: number[] = []
  for (let ci = 0; ci < 7; ci++) {
    const hasShift = rawRows.slice(3).some((row) => (row[9 + ci] ?? '').trim() === '1')
    if (hasShift) activeCols.push(ci)
  }

  // Parse employee rows from row 4+ (index 3+)
  const rows: (ShiftRow | ShiftEmployee)[] = []
  for (let ri = 3; ri < rawRows.length; ri++) {
    const row = rawRows[ri]
    const name           = (row[2]  ?? '').trim() // C
    const role           = (row[6]  ?? '').trim() // G
    const employmentType = (row[8]  ?? '').trim() // I
    const shiftVals      = Array.from({ length: 7 }, (_, ci) => (row[9 + ci] ?? '').trim())

    // Skip rows with no meaningful data in C, G, I, J–P
    // J–P only counts if value is exactly "1"; numbers like "13"/"Итог" are totals rows
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
  if (_syncActive) {
    console.warn('[sync] Already running — skipping')
    return { projectsUpserted: 0, registryUpserted: 0, shiftsUpserted: 0, errors: ['Sync already in progress'], durationMs: 0 }
  }
  _abortRequested = false
  _syncActive = true
  const startedAt = Date.now()
  const allErrors: string[] = []
  let projectsUpserted = 0
  let registryUpserted = 0
  let shiftsUpserted = 0

  // Load per-table API keys from DB (override env defaults)
  const [projectsCfg, registryCfg] = await Promise.all([
    findSheetConfig('projects'),
    findSheetConfig('registry'),
  ])

  const projectsSheets = getSheets(projectsCfg?.api_key)
  const registrySheets = getSheets(registryCfg?.api_key) // used for registry sheet read

  const hasCredentials =
    projectsCfg?.api_key || registryCfg?.api_key ||
    process.env.GOOGLE_API_KEY ||
    (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY)

  if (!hasCredentials) {
    console.warn('[sync] Google credentials not set — skipping sync')
    return { projectsUpserted: 0, registryUpserted: 0, shiftsUpserted: 0, errors: ['Google credentials not configured'], durationMs: 0 }
  }

  // ── 1. Sync projects table ─────────────────────────────────────────────
  const projectsLog = await prisma.syncLog.create({
    data: { type: 'projects', status: 'running' },
  })

  try {
    const result = await syncProjects(projectsSheets)
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
    const result = await syncRegistry(registrySheets)
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
      const result = await syncMatrix(entry)
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
