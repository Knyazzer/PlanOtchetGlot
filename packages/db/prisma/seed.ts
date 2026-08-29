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
  // Базовый набор (6) — без «донорских» смен (эфир/монтаж/подготовка) и «без оплаты».
  // Дополнительные типы (отгул, отпуск за свой счёт и пр.) HR добавляет через справочник форматов.
  const dayFormats: Array<{ key: string; label: string; isWork: boolean; score: number | null }> = [
    // Форматы дня = СТАТУСЫ (место работы вынесено в DayEntry.place). score — редактируем, логика по времени.
    { key: 'working',  label: 'Рабочий день', isWork: true,  score: 0 },
    { key: 'weekend',  label: 'Выходной',     isWork: false, score: null },  // календарный выходной (работать можно)
    { key: 'vacation', label: 'Отпуск',       isWork: false, score: 0.55 },
    { key: 'sick',     label: 'Больничный',   isWork: false, score: 0.55 },
    { key: 'dayoff',   label: 'Отгул',        isWork: false, score: null },
  ]
  for (const f of dayFormats) {
    await prisma.dayFormatVersion.upsert({
      where: { key_effectiveFrom: { key: f.key, effectiveFrom: DAY_FORMATS_EPOCH } },
      update: { label: f.label, isWork: f.isWork, score: f.score },
      create: { ...f, effectiveFrom: DAY_FORMATS_EPOCH },
    })
  }
  // Убрать снятые типы: удалить если не используются в днях, иначе retire (active=false, история цела)
  // office/remote/project/trip больше не форматы, а места (DayEntry.place) — снимаем из справочника форматов
  const REMOVED_FORMATS = ['shift_air', 'shift_edit', 'shift_prep', 'unpaid', 'office', 'remote', 'project', 'trip']
  for (const key of REMOVED_FORMATS) {
    const used = await prisma.dayEntry.count({ where: { dayFormat: key } })
    if (used === 0) await prisma.dayFormatVersion.deleteMany({ where: { key } })
    else await prisma.dayFormatVersion.updateMany({ where: { key }, data: { active: false } })
  }
  console.log(`Day formats seeded: ${dayFormats.length} (removed: ${REMOVED_FORMATS.join(', ')})`)

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
    { dept: 'Коммерческий департамент', moduleKey: 'com.projects',          editLevel: 'member' },
    { dept: 'Администрация',            moduleKey: 'adm.analytics-company', editLevel: 'member' },
    { dept: 'Администрация',            moduleKey: 'adm.calendar-global',   editLevel: 'member' },
    { dept: 'Администрация',            moduleKey: 'adm.news',              editLevel: 'member' },
    // производственные департаменты — шаблонный модуль
    // (2026-08-28) prod.board удалён из реестра (RBAC-REDESIGN §4) — гранты убраны.
    { dept: 'ТВ департамент',           moduleKey: 'prod.workitems',        editLevel: 'member' },
    { dept: 'Радио департамент',        moduleKey: 'prod.workitems',        editLevel: 'member' },
    { dept: 'Бренд медиа департамент',  moduleKey: 'prod.workitems',        editLevel: 'member' },
    { dept: 'Корп медиа департамент',   moduleKey: 'prod.workitems',        editLevel: 'member' },
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

  // ── Сэмпл-контент для Пульса/блоков (только если пусто — идемпотентно) ──────────────
  if ((await prisma.post.count()) === 0) {
    const author = await prisma.user.findFirst({ where: { email: 'staff1@nexus.local' } }) // Иван Директоров, Администрация (право adm.news)
    if (author) {
      // Новость = только текст (+ опц. изображения markdown). Без заголовка/закрепа. createdAt задаём явно — новые сверху.
      const nowMs = Date.now()
      const ago = (min: number) => new Date(nowMs - min * 60_000)
      await prisma.post.createMany({ data: [
        { authorId: author.id, createdAt: ago(3), body: 'В пятницу в 16:00 — общий сбор в зале «Каминка». Явка всех отделов.' },
        { authorId: author.id, createdAt: ago(95), body: 'Переоснастили площадку к новому сезону — вот как теперь выглядит сцена:\n\n![](https://picsum.photos/seed/nexus-stage/1200/675)' },
        { authorId: author.id, createdAt: ago(260), body: 'Итоги месяца: команда отработала отлично — спасибо всем за эфиры и проекты. Пара кадров с последних съёмок:\n\n![](https://picsum.photos/seed/nexus-a/800/600) ![](https://picsum.photos/seed/nexus-b/800/600) ![](https://picsum.photos/seed/nexus-c/800/600) ![](https://picsum.photos/seed/nexus-d/800/600)' },
        { authorId: author.id, createdAt: ago(1440), body: 'Запустили единую рабочую систему компании: задачи, календарь, отчётность и этот Пульс с новостями. Осваивайтесь!' },
      ] })
    }
  }
  if ((await prisma.task.count()) === 0) {
    const assignee = await prisma.user.findFirst({ where: { email: 'staff5@nexus.local' } }) // Сергей Операторов (ТВ)
    const admin = await prisma.user.findFirst({ where: { email: 'admin@nexus.local' } })
    if (assignee && admin) {
      const soon = (days: number) => { const x = new Date(); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() + days); return x }
      await prisma.task.createMany({ data: [
        { title: 'Согласовать сетку эфира на неделю', assignedById: admin.id, assigneeId: assignee.id, startDate: new Date(), deadline: soon(2) },
        { title: 'Подготовить отчёт по итогам месяца',  assignedById: admin.id, assigneeId: assignee.id, startDate: new Date(), deadline: soon(5) },
        { title: 'Обновить корпоративный шаблон заставки', assignedById: admin.id, assigneeId: assignee.id, startDate: new Date() },
      ] })
    }
  }

  // ── Дефолт-графики работы (office 5/2) сэмпл-штату — кабинет показывает «тип дня по умолчанию» ──
  const staffUsers = await prisma.user.findMany({ where: { userType: 'staff', canAccessPlatform: true }, select: { id: true } })
  for (const u of staffUsers) {
    await prisma.workSchedule.upsert({
      where: { userId: u.id },
      update: {},
      create: { userId: u.id }, // дефолты схемы: пн–пт office, сб/вс dayoff, 10:00–18:30
    })
  }
  console.log(`Work schedules seeded: ${staffUsers.length}`)

  // ── Демо общего календаря для недельной витрины Пульса (global CalendarEntry текущей недели) ──
  if ((await prisma.calendarEntry.count({ where: { type: 'global' } })) === 0) {
    const admin = await prisma.user.findFirst({ where: { email: 'admin@nexus.local' } })
    if (admin) {
      const mon = new Date(); const wd = (mon.getDay() + 6) % 7; mon.setDate(mon.getDate() - wd); mon.setHours(12, 0, 0, 0) // понедельник этой недели
      const day = (off: number) => { const d = new Date(mon); d.setDate(mon.getDate() + off); return d }
      await prisma.calendarEntry.createMany({ data: [
        { type: 'global', title: 'Планёрка команды',        date: day(0), startTime: '10:00', endTime: '10:30', createdById: admin.id },
        { type: 'global', title: 'Общий сбор · Каминка',     date: day(2), startTime: '16:00', endTime: '17:00', createdById: admin.id },
        { type: 'global', title: 'Проект: Съёмка Знаменка',  date: day(2), startTime: '11:00', endTime: '15:00', createdById: admin.id },
        { type: 'global', title: 'Проект: Монтаж ролика',    date: day(3), startTime: '12:00', endTime: '18:00', createdById: admin.id },
        { type: 'global', title: 'Ретро спринта',            date: day(4), startTime: '17:00', endTime: '18:00', createdById: admin.id },
      ] })
      console.log('Demo global calendar entries seeded: 5 (текущая неделя)')
    }
  }

  console.log('Seed complete.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
