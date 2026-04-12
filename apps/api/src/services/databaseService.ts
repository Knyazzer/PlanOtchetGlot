import { google, sheets_v4 } from 'googleapis'
import { prisma } from '@tv-shifts/db'

// ─── Google Sheets client (mirrors syncService) ───────────────────────────────

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

function extractSpreadsheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return match?.[1] ?? null
}

// ─── Raw DB helpers (SheetConfig) ─────────────────────────────────────────────

export interface SheetConfigRow {
  id: string
  table_key: string
  sheet_url: string | null
  api_key: string | null
  cached_data: unknown
  last_synced_at: Date | null
  updated_at: Date
}

export async function findSheetConfig(tableKey: string): Promise<SheetConfigRow | null> {
  const rows = await prisma.$queryRawUnsafe<SheetConfigRow[]>(
    `SELECT * FROM sheet_configs WHERE table_key = $1`,
    tableKey
  )
  return rows[0] ?? null
}

export async function allSheetConfigs(): Promise<SheetConfigRow[]> {
  return prisma.$queryRawUnsafe<SheetConfigRow[]>(`SELECT * FROM sheet_configs`)
}

export async function upsertSheetUrl(tableKey: string, sheetUrl: string | null): Promise<void> {
  await upsertConfig(tableKey, { sheetUrl })
}

export async function upsertConfig(
  tableKey: string,
  data: { sheetUrl?: string | null; apiKey?: string | null },
): Promise<void> {
  // Ensure row exists
  await prisma.$executeRawUnsafe(
    `INSERT INTO sheet_configs (id, table_key, updated_at)
     VALUES (gen_random_uuid(), $1, NOW())
     ON CONFLICT (table_key) DO NOTHING`,
    tableKey,
  )
  if ('sheetUrl' in data) {
    await prisma.$executeRawUnsafe(
      `UPDATE sheet_configs SET sheet_url = $1, updated_at = NOW() WHERE table_key = $2`,
      data.sheetUrl ?? null,
      tableKey,
    )
  }
  if ('apiKey' in data) {
    await prisma.$executeRawUnsafe(
      `UPDATE sheet_configs SET api_key = $1, updated_at = NOW() WHERE table_key = $2`,
      data.apiKey ?? null,
      tableKey,
    )
  }
}

async function saveCachedData(tableKey: string, data: object): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO sheet_configs (id, table_key, cached_data, last_synced_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2::jsonb, NOW(), NOW())
     ON CONFLICT (table_key) DO UPDATE SET cached_data = $2::jsonb, last_synced_at = NOW(), updated_at = NOW()`,
    tableKey,
    JSON.stringify(data)
  )
}

// ─── Table definitions ────────────────────────────────────────────────────────

export const TABLE_KEYS = ['employees_buffer', 'freelancers', 'kfpd'] as const
export type TableKey = (typeof TABLE_KEYS)[number]

// All keys that can be stored/updated in sheet_configs
export const ALL_CONFIG_KEYS = ['projects', 'registry', 'internal_registry', 'employees_buffer', 'freelancers', 'kfpd'] as const
export type AllConfigKey = (typeof ALL_CONFIG_KEYS)[number]

export const TABLE_META: Record<string, { label: string; description: string; editable: boolean }> = {
  projects: {
    label: 'Таблица проектов',
    description: 'Основная таблица производственного плана. Синхронизируется автоматически каждые 30 минут.',
    editable: false,
  },
  registry: {
    label: 'Реестр матриц',
    description: 'Реестр матриц съёмок. Синхронизируется автоматически каждые 30 минут.',
    editable: false,
  },
  employees_buffer: {
    label: 'Буфер Сотрудники',
    description: 'Лист MAIN, столбцы A:B — ФИО и должность. Строки, где обе ячейки заполнены.',
    editable: true,
  },
  freelancers: {
    label: 'Реестр фрилансеров',
    description: 'Столбцы B3:C — ФИО и должность. Пропускаются строки, где обе ячейки пусты.',
    editable: true,
  },
  kfpd: {
    label: 'К/Ф/П/Д',
    description: 'Столбцы A–D. Первая строка — названия столбцов.',
    editable: true,
  },
}

// ─── Fetch & cache ────────────────────────────────────────────────────────────

export async function refreshSheetData(key: TableKey): Promise<void> {
  const config = await findSheetConfig(key)
  if (!config?.sheet_url) throw new Error('URL таблицы не настроен')

  const spreadsheetId = extractSpreadsheetId(config.sheet_url)
  if (!spreadsheetId) throw new Error('Неверная ссылка на Google Sheets')

  const sheets = getSheets(config.api_key)

  if (key === 'employees_buffer') {
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'MAIN!A:B',
      valueRenderOption: 'FORMATTED_VALUE',
    })
    const rawRows = resp.data.values ?? []
    const rows: { name: string; position: string }[] = []
    for (const row of rawRows) {
      const name = (row[0] ?? '').toString().trim()
      const position = (row[1] ?? '').toString().trim()
      if (name && position) rows.push({ name, position })
    }
    await saveCachedData(key, { rows })

  } else if (key === 'freelancers') {
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'B3:C',
      valueRenderOption: 'FORMATTED_VALUE',
    })
    const rawRows = resp.data.values ?? []
    const rows: { name: string; position: string | null }[] = []
    for (const row of rawRows) {
      const name = (row[0] ?? '').toString().trim()
      const position = (row[1] ?? '').toString().trim() || null
      if (!name && !position) continue
      rows.push({ name, position })
    }
    await saveCachedData(key, { rows })

  } else {
    // kfpd
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'A:D',
      valueRenderOption: 'FORMATTED_VALUE',
    })
    const rawRows = resp.data.values ?? []
    const columns = (rawRows[0] ?? []).map((c) => (c ?? '').toString().trim())
    const rows: string[][] = rawRows
      .slice(1)
      .map((row) => columns.map((_, i) => (row[i] ?? '').toString().trim()))
    await saveCachedData(key, { columns, rows })
  }
}
