import { prisma } from '@tv-shifts/db'
import { syncMatrixBlock } from './driveService'

/**
 * Reads project data + team members from DB and writes them into the
 * corresponding block of the linked internal matrix sheet.
 * No-op if the project has no internal matrix linked, or blockSlot is not set.
 */
export async function syncProjectBlock(projectId: string): Promise<void> {
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
