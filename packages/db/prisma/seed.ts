import { resolve } from 'path'
import { config } from 'dotenv'
config({ path: resolve(__dirname, '../../../.env') })

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // Placeholder users for local dev — auth is handled by Supabase.
  // admin@nexus.local — системный аккаунт (как nexus-admin в проде): только админка,
  // без рабочего пространства (isSystemAccount → AppShell.isSystem, свой набор вкладок).
  await prisma.user.upsert({
    where: { email: 'admin@nexus.local' },
    update: { isAdmin: true, isSystemAccount: true },
    create: { email: 'admin@nexus.local', name: 'Администратор', isAdmin: true, isSystemAccount: true },
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

  // ── Сэмпл оргструктуры + штата для DEV (после reset БД поднимается наполненной) ──────────────
  // Уровень выводится из структуры: director = Department.directorId, head = Division.headId, иначе member.
  const SAMPLE: Array<{ dept: string; color: string; divisions: Array<{ name: string; staff: Array<{ name: string; position: string; director?: boolean; head?: boolean }> }> }> = [
    { dept: 'Администрация', color: '#7B61FF', divisions: [{ name: 'Управление', staff: [
      { name: 'Иван Директоров',    position: 'Генеральный директор', director: true, head: true },
      { name: 'Ольга Ассистентова', position: 'Ассистент руководителя' },
    ] }] },
    { dept: 'Департамент персонала', color: '#0891b2', divisions: [{ name: 'Отдел кадров', staff: [
      { name: 'Мария Кадрова',  position: 'Руководитель HR', director: true, head: true },
      { name: 'Пётр Рекрутов',  position: 'Рекрутер' },
    ] }] },
    { dept: 'ТВ департамент', color: '#f0a63c', divisions: [{ name: 'Эфирная группа', staff: [
      { name: 'Анна Эфирова',       position: 'Руководитель эфира', director: true, head: true },
      { name: 'Сергей Операторов',  position: 'Оператор' },
      { name: 'Дмитрий Монтажёров', position: 'Монтажёр' },
    ] }] },
    { dept: 'Коммерческий департамент', color: '#f4497e', divisions: [{ name: 'Продажи', staff: [
      { name: 'Елена Продажина', position: 'Директор по продажам', director: true, head: true },
    ] }] },
    { dept: 'Дизайн департамент', color: '#46b884', divisions: [{ name: 'Дизайн-студия', staff: [
      { name: 'Артём Дизайнеров', position: 'Арт-директор', director: true, head: true },
    ] }] },
  ]
  let empN = 0, staffCount = 0
  for (const d of SAMPLE) {
    let dept = await prisma.department.findFirst({ where: { name: d.dept } })
    if (!dept) dept = await prisma.department.create({ data: { name: d.dept, color: d.color } })
    for (const dv of d.divisions) {
      let div = await prisma.division.findFirst({ where: { name: dv.name, deptId: dept.id } })
      if (!div) div = await prisma.division.create({ data: { name: dv.name, deptId: dept.id } })
      for (const s of dv.staff) {
        empN++
        const email = `staff${empN}@nexus.local`
        const u = await prisma.user.upsert({
          where: { email },
          update: { name: s.name, position: s.position, department: d.dept, canAccessPlatform: true, userType: 'staff' },
          create: { email, name: s.name, position: s.position, department: d.dept, canAccessPlatform: true, userType: 'staff', tabNumber: `S${String(empN).padStart(3, '0')}` },
        })
        await prisma.userDivision.upsert({
          where: { userId_divId: { userId: u.id, divId: div.id } },
          update: { position: s.position },
          create: { userId: u.id, divId: div.id, position: s.position },
        })
        if (s.head) await prisma.division.update({ where: { id: div.id }, data: { headId: u.id } })
        if (s.director) await prisma.department.update({ where: { id: dept.id }, data: { directorId: u.id } })
        staffCount++
      }
    }
  }
  // Тестовый пользователь — в платформу, рядовым сотрудником ТВ (для проверки не-админ поверхности)
  const testUser = await prisma.user.findUnique({ where: { email: 'user@nexus.local' } })
  const efirDiv = await prisma.division.findFirst({ where: { name: 'Эфирная группа' } })
  if (testUser && efirDiv) {
    await prisma.user.update({ where: { id: testUser.id }, data: { canAccessPlatform: true, department: 'ТВ департамент', position: 'Сотрудник', userType: 'staff' } })
    await prisma.userDivision.upsert({ where: { userId_divId: { userId: testUser.id, divId: efirDiv.id } }, update: {}, create: { userId: testUser.id, divId: efirDiv.id, position: 'Сотрудник' } })
  }
  console.log(`Sample structure: ${SAMPLE.length} depts, ${staffCount} staff`)

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
    { dept: 'Администрация',            moduleKey: 'adm.svod-company',      editLevel: 'member' },
    { dept: 'Администрация',            moduleKey: 'adm.analytics-company', editLevel: 'member' },
    { dept: 'Администрация',            moduleKey: 'adm.calendar-global',   editLevel: 'member' },
    { dept: 'Администрация',            moduleKey: 'adm.news',              editLevel: 'member' },
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
