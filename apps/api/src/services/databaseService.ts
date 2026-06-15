import { prisma } from '@nexus/db'

// ─── Table definitions ────────────────────────────────────────────────────────

export const TABLE_KEYS = ['employees_buffer', 'freelancers', 'kfpd'] as const
export type TableKey = (typeof TABLE_KEYS)[number]

export const TABLE_META: Record<TableKey, { label: string; description: string }> = {
  employees_buffer: {
    label: 'Буфер сотрудников',
    description: 'Лист «MAIN 2»: A табельный №, B ФИО, C должность, D департамент, E отдел, AA корп-email.',
  },
  freelancers: {
    label: 'Реестр фрилансеров',
    description: 'Столбцы A3:C — номер фрилансера, ФИО и должность.',
  },
  kfpd: {
    label: 'К/Ф/П/Д',
    description: 'Столбцы A–I, первая строка — названия столбцов.',
  },
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

export async function getSheetConfig(tableKey: string) {
  return prisma.sheetConfig.findUnique({ where: { tableKey } })
}

export async function getAllSheetConfigs() {
  return prisma.sheetConfig.findMany()
}
