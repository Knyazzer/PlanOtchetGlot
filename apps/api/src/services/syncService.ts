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
  const v = cell?.userEnteredValue
  if (!v) return ''
  return String(v.stringValue ?? v.numberValue ?? v.boolValue ?? '').trim()
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

  // Логируем первые несколько значений колонки I для диагностики
  const sampleFormats = rows.slice(1, 6).map((r) => JSON.stringify(cellStr(r.values?.[8])))
  console.log('[sync] Колонка I (Формат), первые 5 строк:', sampleFormats.join(' | '))

  // Row 0 is the header — start from row 1 (1-indexed row 2)
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i].values ?? []

    // Фильтр: только строки где колонка I (индекс 8) = "ТВ"
    const formatRaw = cellStr(cells[8]).trim()
    const formatUpper = formatRaw.toUpperCase()
    if (formatUpper !== 'ТВ' && formatUpper !== 'TV') continue

    // Название — колонка C (индекс 2)
    const name = cellStr(cells[2])
    if (!name) continue

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

    const googleRowIndex = i + 1

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

  return { upserted, errors }
}

// ─── Sync: Matrix Registry ────────────────────────────────────────────────────

async function syncRegistry(sheets: sheets_v4.Sheets): Promise<{ upserted: number; errors: string[] }> {
  const spreadsheetId = process.env.GOOGLE_REGISTRY_SHEET_ID
  if (!spreadsheetId) throw new Error('GOOGLE_REGISTRY_SHEET_ID not set')

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'A1:L', // L покрывает A(0)..L(11), K(10)=формат
    valueRenderOption: 'FORMATTED_VALUE',
  })

  const rows = res.data.values ?? []
  let upserted = 0
  const errors: string[] = []

  for (let i = 1; i < rows.length; i++) {
    // Реестр матриц: A(0)=Статус B(1)=Матрица(URL) C(2)=ID D(3)=Инфо E(4)=Юнит
    // F(5)=Заказчик G(6)=Название H(7)=Формат I(8)=Дата J(9)=Продюсер K(10)=Менеджер L(11)=Куратор

    const row = rows[i]
    const matrixId = (row[2] ?? '').trim() // C — ID матрицы
    if (!matrixId) continue

    // Фильтр: Юнит (E, индекс 4) должен содержать "ТВ"
    // Юнит может содержать несколько значений: "ТВ;МАРКЕТИНГ" или "ТВ,РАДИО"
    const unitVal = (row[4] ?? '').trim().toUpperCase()
    if (!unitVal.includes('ТВ') && !unitVal.includes('TV')) continue

    const sheetUrlRaw = (row[1] ?? '').trim() // B — ссылка на матрицу
    const sheetUrl = sheetUrlRaw.startsWith('http') ? sheetUrlRaw : null

    const dateRaw = (row[8] ?? '').trim() // I — Дата
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
      status:   (row[0] ?? '').trim() || null,  // A
      unit:     (row[4] ?? '').trim() || null,  // E — Юнит (ТВ;МАРКЕТИНГ и т.д.)
      client:   (row[5] ?? '').trim() || null,  // F — Заказчик
      name:     (row[6] ?? '').trim() || null,  // G — Название
      format:   (row[7] ?? '').trim() || null,  // H — Формат
      date,                                      // I — Дата
      producer: (row[9] ?? '').trim() || null,  // J — Продюсер
      manager:  (row[10] ?? '').trim() || null, // K — Менеджер
      curator:  (row[11] ?? '').trim() || null, // L — Куратор
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
