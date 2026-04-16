import { google } from 'googleapis'

/**
 * Drive operations use OAuth2 refresh token (regular Google account with storage).
 * Sheets operations (registry append) use service account credentials.
 *
 * GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, GOOGLE_DRIVE_REFRESH_TOKEN
 * must be set in .env for Drive copy to work.
 */

function getDrive() {
  const clientId     = process.env.GOOGLE_DRIVE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Не настроены GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET / GOOGLE_DRIVE_REFRESH_TOKEN')
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret)
  oauth2.setCredentials({ refresh_token: refreshToken })
  return google.drive({ version: 'v3', auth: oauth2 })
}

/** Service account — for reading/writing registry sheet data */
function getSheets() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  return google.sheets({ version: 'v4', auth })
}

/** OAuth2 user account — for setting file permissions and sheet protections */
function getSheetsOAuth() {
  const clientId     = process.env.GOOGLE_DRIVE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) throw new Error('OAuth2 не настроен')
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret)
  oauth2.setCredentials({ refresh_token: refreshToken })
  return google.sheets({ version: 'v4', auth: oauth2 })
}

function extractFileId(url: string): string | null {
  const match = url.match(/\/(?:spreadsheets|file)\/d\/([a-zA-Z0-9-_]+)/)
  return match?.[1] ?? null
}

/** Accepts either a plain folder ID or a full Drive folder URL */
function extractFolderId(input: string): string {
  const match = input.match(/\/folders\/([a-zA-Z0-9-_]+)/)
  return match?.[1] ?? input.split('?')[0].trim()
}

/**
 * Returns true if the Google Drive file exists and is accessible via OAuth2 credentials.
 */
export async function checkSpreadsheetExists(spreadsheetId: string): Promise<boolean> {
  try {
    const drive = getDrive()
    const file = await drive.files.get({ fileId: spreadsheetId, fields: 'id,trashed', supportsAllDrives: true })
    // File in trash is considered deleted
    if (file.data.trashed) return false
    return true
  } catch (e: any) {
    const status = e?.response?.status ?? e?.code
    if (status === 404 || status === 403 || status === 410) return false
    throw e
  }
}

const PROTECTED_SHEET_NAMES = ['СВОД', '₽ СОТРУДНИКИ НА СМЕНАХ']

/**
 * Shares the spreadsheet with anyone (editor) and protects specific sheets
 * so only the service account and the owner can edit them.
 */
export async function setupMatrixPermissions(spreadsheetId: string): Promise<void> {
  const ownerEmail          = process.env.GOOGLE_DRIVE_OWNER_EMAIL
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL

  const drive  = getDrive()
  const sheets = getSheetsOAuth()

  // Share with anyone — employees can edit unprotected sheets directly
  await drive.permissions.create({
    fileId: spreadsheetId,
    supportsAllDrives: true,
    requestBody: { role: 'writer', type: 'anyone' },
  })

  // Get sheet metadata to find sheet IDs by name
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties(sheetId,title)',
  })

  const sheetsToProtect = (meta.data.sheets ?? [])
    .filter((s) => PROTECTED_SHEET_NAMES.includes(s.properties?.title ?? ''))
    .map((s) => s.properties?.sheetId)
    .filter((id): id is number => id != null)

  if (sheetsToProtect.length === 0) return

  const editors: string[] = []
  if (ownerEmail)          editors.push(ownerEmail)
  if (serviceAccountEmail) editors.push(serviceAccountEmail)

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: sheetsToProtect.map((sheetId) => ({
        addProtectedRange: {
          protectedRange: {
            range: { sheetId },
            description: 'Только для администраторов системы',
            editors: { users: editors },
          },
        },
      })),
    },
  })
}

/**
 * Copies a Google Sheets template to a Drive folder.
 * Uses OAuth2 credentials (regular Google account) so the file counts against
 * that account's storage quota, not the service account's (which has none).
 */
export async function copyTemplateToFolder(
  templateUrl: string,
  fileName: string,
  folderId: string,
): Promise<string> {
  const fileId = extractFileId(templateUrl)
  if (!fileId) throw new Error('Неверная ссылка на шаблон Google Sheets')

  const drive = getDrive()
  const response = await drive.files.copy({
    fileId,
    supportsAllDrives: true,
    requestBody: {
      name: fileName,
      parents: [extractFolderId(folderId)],
    },
    fields: 'id',
  })

  const newFileId = response.data.id
  if (!newFileId) throw new Error('Drive API не вернул ID нового файла')

  return `https://docs.google.com/spreadsheets/d/${newFileId}`
}

/**
 * Appends a row to the internal matrix registry Google Sheet.
 * Columns: A=Статус | B=Матрица (ссылка) | C=ID
 *
 * The sheet has a template row at the bottom with formulas.
 * Strategy: copy that template row one row below, then write data into it.
 * Uses service account credentials — the sheet must be shared with the SA as editor.
 */
export async function appendToInternalRegistry(
  registrySheetUrl: string,
  row: { matrixId: string; status: string | null; sheetUrl: string | null },
): Promise<void> {
  const spreadsheetId = extractFileId(registrySheetUrl)
  if (!spreadsheetId) throw new Error('Неверная ссылка на реестр матриц')

  const sheets = getSheets()

  // Get sheetId for batchUpdate (need numeric sheet id)
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties(sheetId,title)',
  })
  const sheetId = meta.data.sheets?.[0]?.properties?.sheetId ?? 0

  // Find last row to determine where the template row is
  const valResp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'A:C',
    valueRenderOption: 'FORMATTED_VALUE',
  })
  const values = valResp.data.values ?? []
  // values[0] = header row, last entry = template row with formulas
  const templateRowIndex = Math.max(values.length - 1, 1) // 0-based
  const templateRowNumber = templateRowIndex + 1          // 1-based

  // Copy template row → one row below (preserving formulas)
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        copyPaste: {
          source: {
            sheetId,
            startRowIndex: templateRowIndex,
            endRowIndex: templateRowIndex + 1,
            startColumnIndex: 0,
            endColumnIndex: 3,
          },
          destination: {
            sheetId,
            startRowIndex: templateRowIndex + 1,
            endRowIndex: templateRowIndex + 2,
            startColumnIndex: 0,
            endColumnIndex: 3,
          },
          pasteType: 'PASTE_NORMAL',
        },
      }],
    },
  })

  // Write data into the (now-duplicated) template row
  // Columns: A=Статус, B=Матрица (HYPERLINK chip), C=ID
  // USER_ENTERED so the =HYPERLINK() formula gets evaluated by Sheets
  const linkCell = row.sheetUrl
    ? `=ГИПЕРССЫЛКА("${row.sheetUrl}";"${row.matrixId}")`
    : ''
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `A${templateRowNumber}:C${templateRowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[row.status ?? '', linkCell, row.matrixId]],
    },
  })
}

/**
 * Writes the 10 project fields into the СВОД sheet of a newly created matrix.
 * Target: column C, rows C2:C11 (one field per row).
 * Uses OAuth2 credentials so the user account (owner) performs the write.
 */
export async function writeSvodData(
  spreadsheetUrl: string,
  data: {
    client: string | null
    projectName: string | null
    format: string | null
    date: string | null
    producerMM: string | null
    salesManager: string | null
    kpLink: string | null
    curator: string | null
    businessUnit: string | null
    brief: string | null
  },
): Promise<void> {
  const spreadsheetId = extractFileId(spreadsheetUrl)
  if (!spreadsheetId) throw new Error('Неверный URL матрицы для записи СВОД')

  const sheets = getSheetsOAuth()
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'СВОД!C2:C11',
    valueInputOption: 'RAW',
    requestBody: {
      values: [
        [data.client ?? ''],
        [data.projectName ?? ''],
        [data.format ?? ''],
        [data.date ?? ''],
        [data.producerMM ?? ''],
        [data.salesManager ?? ''],
        [data.kpLink ?? ''],
        [data.curator ?? ''],
        [data.businessUnit ?? ''],
        [data.brief ?? ''],
      ],
    },
  })
}

// ─── Internal matrix block write ─────────────────────────────────────────────
//
// Block structure (dynamic, not fixed rows):
//   Block header row : col A = project name, col B = date, col O-U = пн вт ср чт пт сб вс
//   Date-numbers row : col O-U = day numbers (formula, auto from col B date)
//   Employee rows    : col A = ФИО, col B = должность, other cols = formulas
//
// Blocks are identified by having a weekday abbreviation in col O (index 14).
// Row positions are discovered dynamically — never assumed fixed.

const SHIFTS_SHEET_KEYWORDS_WRITE = ['₽ смены', '₽ специалист', 'смены', 'специалист', 'сотрудник', 'фрилансер', 'реестр фрил']
const BLOCK_HEADER_DAYS = new Set(['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'])
const BLOCK_HEADER_ROWS = 2   // block header row + date-numbers row before first employee
const COPY_COL_COUNT    = 50  // columns to copy when duplicating rows/blocks

async function findShiftsSheet(spreadsheetId: string): Promise<string | null> {
  const sheets = getSheetsOAuth()
  const meta = await sheets.spreadsheets.get({ spreadsheetId, includeGridData: false })
  const titles = (meta.data.sheets ?? []).map((s) => (s.properties?.title ?? '') as string)
  console.log(`[matrix-block] sheets in ${spreadsheetId}:`, titles)

  // First pass: keyword match. Verify it actually has block headers (col O with weekday).
  const byKeyword = titles.find((t) => SHIFTS_SHEET_KEYWORDS_WRITE.some((k) => t.toLowerCase().includes(k))) ?? null
  if (byKeyword) {
    const { colO } = await readSheetColO(spreadsheetId, byKeyword)
    if (findBlockHeaders(colO).length > 0) {
      console.log(`[matrix-block] matched by keyword:`, byKeyword)
      return byKeyword
    }
    console.log(`[matrix-block] keyword match "${byKeyword}" has no block headers, scanning all sheets`)
  }

  // Fallback: content scan — find any sheet that has a weekday in col O
  for (const title of titles) {
    if (title === byKeyword) continue  // already verified above
    try {
      const { colO } = await readSheetColO(spreadsheetId, title)
      if (findBlockHeaders(colO).length > 0) {
        console.log(`[matrix-block] matched by content:`, title)
        return title
      }
    } catch (_) {}
  }

  console.log(`[matrix-block] no sheet with block headers found`)
  return null
}

/** Lightweight read: only col O, first 200 rows — used for sheet detection. */
async function readSheetColO(spreadsheetId: string, sheetTitle: string): Promise<{ colO: string[] }> {
  const sheets = getSheetsOAuth()
  const safe = sheetTitle.replace(/'/g, "\\'")
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${safe}'!O1:O200`,
    valueRenderOption: 'FORMATTED_VALUE',
  })
  const rows = (resp.data.values ?? []) as string[][]
  return { colO: rows.map((r) => (r[0] ?? '').trim()) }
}

async function getNumericSheetId(spreadsheetId: string, sheetTitle: string): Promise<number> {
  const sheets = getSheetsOAuth()
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets(properties(sheetId,title))',
  })
  return (meta.data.sheets ?? []).find((s) => s.properties?.title === sheetTitle)?.properties?.sheetId ?? 0
}

// Read columns A and O to detect block headers and employee rows.
// Returns arrays indexed by 0-based row number.
async function readSheetAO(spreadsheetId: string, sheetTitle: string): Promise<{ colA: string[]; colO: string[] }> {
  const sheets = getSheetsOAuth()
  const safe = sheetTitle.replace(/'/g, "\\'")
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${safe}'!A:O`,
    valueRenderOption: 'FORMATTED_VALUE',
  })
  const rows = (resp.data.values ?? []) as string[][]
  const colA = rows.map((r) => (r[0]  ?? '').trim())
  const colO = rows.map((r) => (r[14] ?? '').trim())
  return { colA, colO }
}

// Returns 0-based row indices of all block header rows (col O has a weekday name).
function findBlockHeaders(colO: string[]): number[] {
  return colO.reduce<number[]>((acc, v, i) => {
    if (BLOCK_HEADER_DAYS.has(v.toLowerCase())) acc.push(i)
    return acc
  }, [])
}

// Find the last 0-based row index that has any data in col A.
function lastDataRow(colA: string[]): number {
  for (let i = colA.length - 1; i >= 0; i--) {
    if (colA[i] !== '') return i
  }
  return 0
}

/**
 * Clear the shifts sheet down to exactly 1 block with 1 employee row.
 * Called once after copying a new matrix from template.
 */
export async function clearMatrixShiftsSheet(spreadsheetUrl: string): Promise<void> {
  const spreadsheetId = extractFileId(spreadsheetUrl)
  if (!spreadsheetId) return

  const title = await findShiftsSheet(spreadsheetId)
  if (!title) return

  const sheetId = await getNumericSheetId(spreadsheetId, title)
  const { colA, colO } = await readSheetAO(spreadsheetId, title)
  const headers = findBlockHeaders(colO)
  if (headers.length === 0) return

  const block0       = headers[0]
  const empStart     = block0 + BLOCK_HEADER_ROWS           // first employee row (0-based)
  // Use colA.length (total rows returned, including empty ones with formulas in other cols)
  // This correctly picks up trailing template rows that have formulas but empty col A
  const block0End    = headers.length > 1 ? headers[1] : colA.length
  const currentEmps  = block0End - empStart

  const sheets = getSheetsOAuth()
  const requests: object[] = []

  // 1. Delete all rows from block[1] onwards
  if (headers.length > 1) {
    const totalRows = lastDataRow(colA) + 1
    requests.push({ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: headers[1], endIndex: totalRows } } })
  }

  // 2. Keep only 1 employee row in block 0
  if (currentEmps > 1) {
    requests.push({ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: empStart + 1, endIndex: block0End } } })
  }

  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } })
  }

  // 3. Clear col A+B of block header and first employee row
  const safe      = title.replace(/'/g, "\\'")
  const hRow1     = block0    + 1   // 1-indexed
  const empRow1   = empStart  + 1
  await sheets.spreadsheets.values.batchClear({
    spreadsheetId,
    requestBody: { ranges: [`'${safe}'!A${hRow1}:B${hRow1}`, `'${safe}'!A${empRow1}:B${empRow1}`] },
  })
  console.log(`[matrix-block] clearMatrixShiftsSheet done for ${spreadsheetId}`)
}

/**
 * Write project name/date and team members into a specific block.
 * blockSlot is 1-indexed. Creates new blocks by copying block 0 if needed.
 * Employee rows are inserted/deleted dynamically, preserving formulas via PASTE_NORMAL.
 */
export async function syncMatrixBlock(
  spreadsheetUrl: string,
  blockSlot: number,
  projectName: string | null,
  projectDate: string | null,
  members: { name: string; position: string | null }[],
): Promise<void> {
  const spreadsheetId = extractFileId(spreadsheetUrl)
  if (!spreadsheetId) return

  const title = await findShiftsSheet(spreadsheetId)
  if (!title) return

  const sheetId = await getNumericSheetId(spreadsheetId, title)
  const sheets  = getSheetsOAuth()
  const safe    = title.replace(/'/g, "\\'")
  const blockIndex = blockSlot - 1  // 0-based

  // ── Step 1: ensure enough blocks exist ──────────────────────────────────────
  let { colA, colO } = await readSheetAO(spreadsheetId, title)
  let headers = findBlockHeaders(colO)

  if (headers.length === 0) {
    throw new Error(`Sheet "${title}" has no block structure (no row with weekday name пн/вт/… in column O). Check the template.`)
  }

  while (headers.length <= blockIndex) {
    const block0      = headers[0]
    const lastHeader  = headers[headers.length - 1]
    // Use colA.length: after the current block's sync trims excess rows, this is accurate
    // Also guard against the case where lastDataRow underestimates (empty colA)
    const appendAt    = Math.max(colA.length, lastHeader + BLOCK_HEADER_ROWS + 1)

    // Insert 3 empty rows at end, then copy block 0 structure (PASTE_NORMAL = formulas + formatting + merges)
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          { insertDimension: { range: { sheetId, dimension: 'ROWS', startIndex: appendAt, endIndex: appendAt + 3 }, inheritFromBefore: true } },
          { copyPaste: {
            source:      { sheetId, startRowIndex: block0, endRowIndex: block0 + 3, startColumnIndex: 0, endColumnIndex: COPY_COL_COUNT },
            destination: { sheetId, startRowIndex: appendAt, endRowIndex: appendAt + 3, startColumnIndex: 0, endColumnIndex: COPY_COL_COUNT },
            pasteType: 'PASTE_NORMAL',
          }},
        ],
      },
    })
    // Clear the copied name/date so the new block starts empty
    const newHRow1 = appendAt + 1
    await sheets.spreadsheets.values.batchClear({
      spreadsheetId,
      requestBody: { ranges: [`'${safe}'!A${newHRow1}:B${newHRow1}`, `'${safe}'!A${newHRow1 + 2}:B${newHRow1 + 2}`] },
    })

    // Refresh state
    ;({ colA, colO } = await readSheetAO(spreadsheetId, title))
    headers = findBlockHeaders(colO)
    console.log(`[matrix-block] created block ${headers.length}, now have ${headers.length} blocks`)
  }

  // ── Step 2: locate this block's row range ────────────────────────────────────
  const blockHeaderRow = headers[blockIndex]                        // 0-based
  const nextHeader     = headers[blockIndex + 1] ?? null
  const empStart       = blockHeaderRow + BLOCK_HEADER_ROWS         // 0-based first employee row
  // Use colA.length for the last block: includes trailing template rows with formulas in other cols
  const blockEnd       = nextHeader ?? colA.length  // exclusive end

  // ── Step 3: sync employee row count ─────────────────────────────────────────
  const neededEmps  = Math.max(members.length, 1)
  const currentEmps = blockEnd - empStart

  if (neededEmps > currentEmps) {
    const insertCount = neededEmps - currentEmps
    const insertAt    = blockEnd  // insert before next block (or at end)

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          { insertDimension: { range: { sheetId, dimension: 'ROWS', startIndex: insertAt, endIndex: insertAt + insertCount }, inheritFromBefore: true } },
          // Copy the first employee row for each new row (formulas + formatting)
          ...Array.from({ length: insertCount }, (_, i) => ({
            copyPaste: {
              source:      { sheetId, startRowIndex: empStart, endRowIndex: empStart + 1, startColumnIndex: 0, endColumnIndex: COPY_COL_COUNT },
              destination: { sheetId, startRowIndex: insertAt + i, endRowIndex: insertAt + i + 1, startColumnIndex: 0, endColumnIndex: COPY_COL_COUNT },
              pasteType: 'PASTE_NORMAL',
            },
          })),
        ],
      },
    })
  } else if (neededEmps < currentEmps) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: empStart + neededEmps, endIndex: empStart + currentEmps } } }],
      },
    })
  }

  // ── Step 4: write project name/date and employee data ───────────────────────
  const headerRow1 = blockHeaderRow + 1       // 1-indexed for values API
  const empRow1    = empStart + 1

  const empValues: string[][] = members.length > 0
    ? members.map((m) => [m.name, m.position ?? ''])
    : [['', '']]

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data: [
        { range: `'${safe}'!A${headerRow1}:B${headerRow1}`, values: [[projectName ?? '', projectDate ?? '']] },
        { range: `'${safe}'!A${empRow1}:B${empRow1 + empValues.length - 1}`, values: empValues },
      ],
    },
  })
  console.log(`[matrix-block] syncMatrixBlock done: blockSlot=${blockSlot}, members=${members.length}`)
}
