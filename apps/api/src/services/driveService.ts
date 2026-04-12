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
 * Columns: ID | Статус | Ссылка на матрицу
 * Uses service account credentials — the sheet must be shared with the SA as editor.
 */
export async function appendToInternalRegistry(
  registrySheetUrl: string,
  row: { matrixId: string; status: string | null; sheetUrl: string | null },
): Promise<void> {
  const spreadsheetId = extractFileId(registrySheetUrl)
  if (!spreadsheetId) throw new Error('Неверная ссылка на реестр матриц')

  const sheets = getSheets()
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'A:C',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[row.matrixId, row.status ?? '', row.sheetUrl ?? '']],
    },
  })
}
