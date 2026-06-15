import { resolve } from 'path'
import { config } from 'dotenv'
config({ path: resolve(__dirname, '../../../.env') })

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // Placeholder users for local dev — auth is handled by Supabase
  await prisma.user.upsert({
    where: { email: 'admin@nexus.local' },
    update: { isAdmin: true },
    create: { email: 'admin@nexus.local', name: 'Администратор', isAdmin: true },
  })

  await prisma.user.upsert({
    where: { email: 'user@nexus.local' },
    update: {},
    create: { email: 'user@nexus.local', name: 'Тестовый пользователь' },
  })

  // Форматы дня — стартовый набор донора (10 живых; gigashift не сидируется — 0 использований, В-6).
  // score=null — формат вне баллов (выходной). Изменения форматов = новая версия с effectiveFrom.
  const DAY_FORMATS_EPOCH = new Date('2026-01-01') // действует «с начала времён» для мигрированных данных
  const dayFormats: Array<{ key: string; label: string; isWork: boolean; score: number | null }> = [
    { key: 'office',     label: 'Офис',          isWork: true,  score: 0 },
    { key: 'remote',     label: 'Удалёнка',      isWork: true,  score: 0 },
    { key: 'shift_air',  label: 'Смена (эфир)',  isWork: true,  score: 1 },
    { key: 'shift_edit', label: 'Смена (монтаж)', isWork: true, score: 1 },
    { key: 'shift_prep', label: 'Подготовка',    isWork: true,  score: 0.5 },
    { key: 'trip',       label: 'Командировка',  isWork: true,  score: 1.5 },
    { key: 'vacation',   label: 'Отпуск',        isWork: false, score: 0.55 },
    { key: 'sick',       label: 'Больничный',    isWork: false, score: 0.55 },
    { key: 'dayoff',     label: 'Выходной',      isWork: false, score: null },
    { key: 'unpaid',     label: 'Без оплаты',    isWork: false, score: 0 },
  ]
  for (const f of dayFormats) {
    await prisma.dayFormatVersion.upsert({
      where: { key_effectiveFrom: { key: f.key, effectiveFrom: DAY_FORMATS_EPOCH } },
      update: { label: f.label, isWork: f.isWork, score: f.score },
      create: { ...f, effectiveFrom: DAY_FORMATS_EPOCH },
    })
  }
  console.log(`Day formats seeded: ${dayFormats.length}`)

  // Гранты департаментных модулей (КИТ 1, спека docs/RBAC-MODEL.md §3).
  // Матчинг по имени департамента (как у ETL); отсутствующие департаменты пропускаются.
  const MODULE_GRANTS: Array<{ dept: string; moduleKey: string; editLevel: 'member' | 'head' | 'director' }> = [
    { dept: 'Департамент персонала',    moduleKey: 'hr.absences',           editLevel: 'member' },
    { dept: 'Департамент персонала',    moduleKey: 'hr.orgstructure',       editLevel: 'head' },
    { dept: 'Финансовый департамент',   moduleKey: 'fin.expenses',          editLevel: 'member' },
    { dept: 'Финансовый департамент',   moduleKey: 'fin.budgets',           editLevel: 'head' },
    { dept: 'Финансовый департамент',   moduleKey: 'fin.company-finance',   editLevel: 'member' },
    { dept: 'Коммерческий департамент', moduleKey: 'com.clients',           editLevel: 'member' },
    { dept: 'Коммерческий департамент', moduleKey: 'com.projects',          editLevel: 'member' },
    { dept: 'Коммерческий департамент', moduleKey: 'com.workitems',         editLevel: 'head' },
    { dept: 'Технический департамент',  moduleKey: 'tech.platform',         editLevel: 'director' },
    { dept: 'Технический департамент',  moduleKey: 'tech.sheets',           editLevel: 'member' },
    { dept: 'Технический департамент',  moduleKey: 'tech.support',          editLevel: 'member' },
    { dept: 'Администрация',            moduleKey: 'adm.svod-company',      editLevel: 'member' },
    { dept: 'Администрация',            moduleKey: 'adm.analytics-company', editLevel: 'member' },
    { dept: 'Администрация',            moduleKey: 'adm.calendar-global',   editLevel: 'member' },
    // производственные департаменты — шаблонные модули
    { dept: 'ТВ департамент',           moduleKey: 'prod.board',            editLevel: 'member' },
    { dept: 'ТВ департамент',           moduleKey: 'prod.workitems',        editLevel: 'member' },
    { dept: 'Радио департамент',        moduleKey: 'prod.board',            editLevel: 'member' },
    { dept: 'Радио департамент',        moduleKey: 'prod.workitems',        editLevel: 'member' },
    { dept: 'Бренд медиа департамент',  moduleKey: 'prod.board',            editLevel: 'member' },
    { dept: 'Бренд медиа департамент',  moduleKey: 'prod.workitems',        editLevel: 'member' },
    { dept: 'Корп медиа департамент',   moduleKey: 'prod.board',            editLevel: 'member' },
    { dept: 'Корп медиа департамент',   moduleKey: 'prod.workitems',        editLevel: 'member' },
    { dept: 'Дизайн департамент',       moduleKey: 'prod.board',            editLevel: 'member' },
    { dept: 'Дизайн департамент',       moduleKey: 'prod.workitems',        editLevel: 'member' },
  ]
  let granted = 0
  for (const g of MODULE_GRANTS) {
    const dept = await prisma.department.findFirst({ where: { name: { equals: g.dept, mode: 'insensitive' } } })
    if (!dept) continue
    await prisma.departmentModule.upsert({
      where: { deptId_moduleKey: { deptId: dept.id, moduleKey: g.moduleKey } },
      update: { editLevel: g.editLevel },
      create: { deptId: dept.id, moduleKey: g.moduleKey, editLevel: g.editLevel },
    })
    granted++
  }
  console.log(`Department module grants seeded: ${granted}`)

  console.log('Seed complete.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
