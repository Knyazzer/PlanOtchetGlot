import { google, sheets_v4 } from 'googleapis'
import { prisma } from '@tv-shifts/db'

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

// Considers a cell "highlighted" if its background is non-white
function isColored(cell: sheets_v4.Schema$CellData | null | undefined): boolean {
  const bg = cell?.userEnteredFormat?.backgroundColor
  if (!bg) return false
  const red = bg.red ?? 1
  const green = bg.green ?? 1
  const blue = bg.blue ?? 1
  return !(red >= 0.99 && green >= 0.99 && blue >= 0.99)
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

  const rows = res.data.sheets?.[0]?.data?.[0]?.rowData ?? []
  let upserted = 0
  const errors: string[] = []

  // Колонки (0-indexed):
  // A(0)=Статус B(1)=Клиент C(2)=Название D(3)=Исп.продюсер E(4)=Лайн-продюсер
  // F(5)=Аккаунт G(6)=Дата H(7)=Время I(8)=Формат J(9)=Локация K(10)=№ по матрице L(11)=Постпродакшн

  console.log(`[sync] Projects: всего строк (включая заголовок): ${rows.length}`)
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

    // Разделители месяцев: только колонка A заполнена, B–K пусты — сохраняем отдельно
    const hasDataBeyondA = [1,2,3,4,5,6,7,8,9,10].some((col) => cellStr(cells[col]) !== '')
    if (!hasDataBeyondA) {
      const separatorText = cellStr(cells[0])
      if (separatorText) {
        const existing = await prisma.project.findFirst({ where: { googleRowIndex } })
        if (existing) {
          await prisma.project.update({ where: { id: existing.id }, data: { name: separatorText, source: 'separator' } })
        } else {
          await prisma.project.create({ data: { name: separatorText, source: 'separator', googleRowIndex, status: 'request' } })
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

    // Подсвеченные ячейки → uncertainFields
    const fieldNames = ['status', 'client', 'name', 'execProducer', 'lineProducer', 'accountManager', 'date', 'time', 'format']
    const uncertainFields: string[] = []
    for (let col = 0; col < 9; col++) {
      if (isColored(cells[col])) uncertainFields.push(fieldNames[col])
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
      const existing = await prisma.project.findFirst({ where: { googleRowIndex } })
      if (existing) {
        await prisma.project.update({ where: { id: existing.id }, data })
      } else {
        await prisma.project.create({ data: { ...data, source: 'projects_table', googleRowIndex } })
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

  console.log(`[sync] Registry: всего строк: ${rowData.length}, данные начинаются с строки 3 (индекс 2)`)

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

    // B — ссылка на матрицу: берём hyperlink из ячейки, иначе текст
    const cellB = cells[1]
    const sheetUrlRaw = cellB?.hyperlink ?? cellStr(cellB)
    const sheetUrl = sheetUrlRaw.startsWith('http') ? sheetUrlRaw : null

    const dateRaw = cellStr(cells[8]) // I — Дата
    const date = dateRaw ? parseSheetDate(dateRaw) : null

    // Привязка к проекту по ID матрицы (sheetMatrixId в таблице проектов = matrixId здесь)
    let projectId: string | null = null
    const byMatrixId = await prisma.project.findFirst({
      where: { sheetMatrixId: matrixId } as any,
    })
    if (byMatrixId) {
      projectId = byMatrixId.id
    } else if (sheetUrl) {
      const sheetSpreadsheetId = extractSpreadsheetId(sheetUrl)
      if (sheetSpreadsheetId) {
        const linked = await prisma.project.findFirst({
          where: { matrixUrl: { contains: sheetSpreadsheetId } },
        })
        if (linked) projectId = linked.id
      }
    }

    const entry = {
      sheetUrl,
      status:   cellStr(cells[0])  || null,  // A
      unit:     cellStr(cells[4])  || null,  // E
      client:   cellStr(cells[5])  || null,  // F
      name:     cellStr(cells[6])  || null,  // G
      format:   cellStr(cells[7])  || null,  // H
      date,                                   // I
      producer: cellStr(cells[9])  || null,  // J
      manager:  cellStr(cells[10]) || null,  // K
      curator:  cellStr(cells[11]) || null,  // L
      projectId,
      lastSyncedAt: new Date(),
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
  sheets: sheets_v4.Sheets,
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

  // If not linked yet, try matching by spreadsheet ID in project.matrixUrl
  if (!projectId) {
    const linked = await prisma.project.findFirst({
      where: { matrixUrl: { contains: spreadsheetId } },
    })
    projectId = linked?.id ?? null
  }

  if (!projectId) {
    // No linked project — cannot create shifts without one
    errors.push(`Matrix ${registryEntry.matrixId}: no linked project found`)
    return { upserted, errors }
  }

  // ── Read ₽ СМЕНЫ sheet ───────────────────────────────────────────────────
  let shiftsRows: string[][]
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: '₽ СМЕНЫ!A1:P',
      valueRenderOption: 'FORMATTED_VALUE',
    })
    shiftsRows = (res.data.values ?? []) as string[][]
  } catch (e: any) {
    errors.push(`Matrix ${registryEntry.matrixId}: cannot read ₽ СМЕНЫ — ${e.message}`)
    return { upserted, errors }
  }

  // Row index 1 (row 2) contains dates in columns J–P (indices 9–15)
  const dateRow = shiftsRows[1] ?? []
  const shiftDates: (Date | null)[] = []
  for (let col = 9; col <= 15; col++) {
    const raw = (dateRow[col] ?? '').trim()
    shiftDates.push(raw ? parseSheetDate(raw) : null)
  }

  // Shift type by column position within J–P (0-indexed offset from J=0)
  const shiftTypeByOffset = (offset: number): 'zastroyka' | 'efir' | 'demontazh' => {
    if (offset < 3) return 'zastroyka' // J, K, L
    if (offset === 3) return 'efir'    // M
    return 'demontazh'                  // N, O, P
  }

  // Rows 4+ (index 3+) — staff
  for (let i = 3; i < shiftsRows.length; i++) {
    const row = shiftsRows[i]
    const fullName = (row[2] ?? '').trim() // Column C
    if (!fullName) continue

    const roleOnSite = (row[6] ?? '').trim() || null   // Column G
    const shiftFormat = (row[7] ?? '').trim() || null  // Column H
    const employmentRaw = (row[8] ?? '').trim()        // Column I
    const employmentType = parseEmploymentType(employmentRaw)
    const isStaff = isStaffType(employmentRaw)

    // Find user by exact full name match
    const user = await prisma.user.findFirst({
      where: { fullName: { equals: fullName, mode: 'insensitive' } },
    })

    if (!user) {
      // Notify about unmatched name (deduplicate by entityId + message content)
      const exists = await prisma.notification.findFirst({
        where: {
          type: 'unmatched_name',
          entityId: registryEntry.id,
          message: { contains: fullName },
        },
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

    // Upsert ProjectAssignment
    const assignmentData = {
      roleOnSite,
      shiftFormat,
      employmentType,
    }

    let assignment = await prisma.projectAssignment.findFirst({
      where: {
        projectId,
        ...(user ? { userId: user.id } : { unmatchedName: fullName }),
      },
    })

    if (assignment) {
      assignment = await prisma.projectAssignment.update({
        where: { id: assignment.id },
        data: assignmentData,
      })
    } else {
      assignment = await prisma.projectAssignment.create({
        data: {
          projectId,
          userId: user?.id ?? null,
          unmatchedName: user ? null : fullName,
          ...assignmentData,
        },
      })
    }

    // Create ShiftEntries only for staff employees with a matched user
    if (!isStaff || !user) continue

    for (let col = 9; col <= 15; col++) {
      const marker = (row[col] ?? '').trim()
      if (marker !== '1') continue

      const offset = col - 9
      const shiftDate = shiftDates[offset]
      if (!shiftDate) continue

      const shiftType = shiftTypeByOffset(offset)

      const existingShift = await prisma.shiftEntry.findFirst({
        where: {
          assignmentId: assignment.id,
          date: shiftDate,
          shiftType,
        },
      })

      if (!existingShift) {
        await prisma.shiftEntry.create({
          data: {
            assignmentId: assignment.id,
            userId: user.id,
            projectId,
            date: shiftDate,
            shiftType,
            source: 'matrix',
          },
        })
        upserted++
      }
    }
  }

  // Update lastSyncedAt on registry
  await prisma.matrixRegistry.update({
    where: { id: registryEntry.id },
    data: { lastSyncedAt: new Date() },
  })

  return { upserted, errors }
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
  const registryEntries = await prisma.matrixRegistry.findMany({
    where: { sheetUrl: { not: null } },
  })

  for (const entry of registryEntries) {
    if (!entry.sheetUrl?.startsWith('http')) continue

    const matrixLog = await prisma.syncLog.create({
      data: { type: 'matrix', targetId: entry.matrixId, status: 'running' },
    })

    try {
      const result = await syncMatrix(sheets, {
        id: entry.id,
        matrixId: entry.matrixId,
        sheetUrl: entry.sheetUrl,
        projectId: entry.projectId,
      })
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

    await delay(500) // between matrices
  }

  // ── Notification: no_matrix for projects without a linked matrix ───────
  const projectsWithoutMatrix = await prisma.project.findMany({
    where: {
      source: 'projects_table',
      matrixUrl: null,
      matrixRegistry: null,
    },
  })

  for (const project of projectsWithoutMatrix) {
    const exists = await prisma.notification.findFirst({
      where: { type: 'no_matrix', entityId: project.id },
    })
    if (!exists) {
      await prisma.notification.create({
        data: {
          type: 'no_matrix',
          entityType: 'project',
          entityId: project.id,
          message: `У проекта «${project.name}» не найдена матрица`,
          userId: null,
        },
      })
    }
  }

  return {
    projectsUpserted,
    registryUpserted,
    shiftsUpserted,
    errors: allErrors,
    durationMs: Date.now() - startedAt,
  }
}
