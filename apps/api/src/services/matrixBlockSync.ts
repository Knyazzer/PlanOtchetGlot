import { prisma } from '@tv-shifts/db'
import { syncMatrixBlock, deleteMatrixBlock } from './driveService'

// Debounce map: projectId → pending timeout handle.
// Prevents burst of Sheets API reads when members are edited rapidly (e.g. clicking
// multiple checkboxes). Waits DEBOUNCE_MS after the last change before syncing.
const _pendingSyncs = new Map<string, ReturnType<typeof setTimeout>>()
const DEBOUNCE_MS = 3_000

/**
 * Reads project data + team members from DB and writes them into the
 * corresponding block of the linked internal matrix sheet.
 * No-op if the project has no internal matrix linked, or blockSlot is not set.
 * Calls are debounced per projectId to avoid Google Sheets quota exhaustion.
 */
export async function syncProjectBlock(projectId: string): Promise<void> {
  // Cancel any already-pending sync for this project and reschedule
  const existing = _pendingSyncs.get(projectId)
  if (existing) clearTimeout(existing)
  _pendingSyncs.set(
    projectId,
    setTimeout(() => {
      _pendingSyncs.delete(projectId)
      _doSyncProjectBlock(projectId).catch((e: unknown) =>
        console.error('[matrix-block] POST sync failed:', (e as any)?.message ?? e),
      )
    }, DEBOUNCE_MS),
  )
}

/** Synchronous version — no debounce. Use for manual/batch sync. */
export async function syncProjectBlockNow(projectId: string): Promise<void> {
  return _doSyncProjectBlock(projectId)
}

async function _doSyncProjectBlock(projectId: string): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<{
    name: string
    date: Date | null
    dateApproximate: string | null
    matrixRegistryId: string | null
    blockSlot: number | null
  }[]>(
    `SELECT name, date, date_approximate AS "dateApproximate",
            matrix_registry_id AS "matrixRegistryId", block_slot AS "blockSlot"
     FROM status_rows WHERE id = $1`,
    projectId,
  )
  const row = rows[0]
  if (!row?.matrixRegistryId || row?.blockSlot == null) return

  const matrixRows = await prisma.$queryRawUnsafe<{ sheet_url: string | null }[]>(
    `SELECT sheet_url FROM matrix_registry WHERE id = $1 AND source = 'internal'`,
    row.matrixRegistryId,
  )
  const sheetUrl = matrixRows[0]?.sheet_url
  if (!sheetUrl) return

  const members = await prisma.projectMember.findMany({
    where: { projectId },
    orderBy: { createdAt: 'asc' },
  })

  const dateStr = row.date
    ? new Date(row.date).toLocaleDateString('ru-RU')
    : (row.dateApproximate ?? '')

  await syncMatrixBlock(
    sheetUrl,
    row.blockSlot,
    row.name,
    dateStr,
    members.map((m) => ({ name: m.name, position: m.position })),
  )
}


/**
 * Returns the next available blockSlot for a given matrix.
 * Takes max of current slots and adds 1. Returns 1 if matrix has no linked projects.
 */
export async function nextBlockSlot(matrixRegistryId: string, excludeProjectId?: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ next: number }[]>(
    `SELECT COALESCE(MAX(block_slot), 0) + 1 AS next
     FROM status_rows
     WHERE matrix_registry_id = $1
       AND block_slot IS NOT NULL
       ${excludeProjectId ? 'AND id != $2' : ''}`,
    ...(excludeProjectId ? [matrixRegistryId, excludeProjectId] : [matrixRegistryId]),
  )
  return Number(rows[0]?.next ?? 1)
}

/**
 * Deletes the block for a project from the Google Sheet and shifts down the blockSlot
 * of all other projects in the same matrix that had a higher slot number.
 * Fire-and-forget for the sheet operation — DB slots are always updated.
 */
export async function unlinkAndShiftBlocks(
  projectId: string,
  matrixRegistryId: string,
  blockSlot: number,
): Promise<void> {
  // 1. Delete block rows from Google Sheet (non-fatal)
  const matrixRows = await prisma.$queryRawUnsafe<{ sheet_url: string | null }[]>(
    `SELECT sheet_url FROM matrix_registry WHERE id = $1`,
    matrixRegistryId,
  )
  const sheetUrl = matrixRows[0]?.sheet_url
  if (sheetUrl) {
    await deleteMatrixBlock(sheetUrl, blockSlot).catch((e: unknown) =>
      console.error('[matrix-block] deleteMatrixBlock failed:', (e as any)?.message ?? e),
    )
  }

  // 2. Shift down blockSlot for all projects above the deleted one in the same matrix
  await prisma.$executeRawUnsafe(
    `UPDATE status_rows
     SET block_slot = block_slot - 1, updated_at = NOW()
     WHERE matrix_registry_id = $1 AND block_slot > $2 AND id != $3`,
    matrixRegistryId, blockSlot, projectId,
  )
}
