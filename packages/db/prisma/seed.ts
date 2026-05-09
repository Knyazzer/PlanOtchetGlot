import { resolve } from 'path'
import { config } from 'dotenv'
config({ path: resolve(__dirname, '../../../.env') })

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // ── Permissions ─────────────────────────────────────────────────────────────

  const ALL_PERMISSIONS = [
    { name: 'analytics:read',          description: 'Просмотр аналитики' },
    { name: 'sync:trigger',            description: 'Запуск синхронизации' },
    { name: 'sync:logs',               description: 'Просмотр логов синхронизации' },
    { name: 'sync:admin',              description: 'Управление синхронизацией (admin)' },
    { name: 'projects:write',          description: 'Создание и редактирование проектов' },
    { name: 'projects:config',         description: 'Настройка конфигурации проектов' },
    { name: 'deals:write',             description: 'Управление сделками' },
    { name: 'shifts:write',            description: 'Редактирование смен' },
    { name: 'tasks:write',             description: 'Управление задачами' },
    { name: 'matrix:write',            description: 'Редактирование матриц' },
    { name: 'matrix-templates:manage', description: 'Управление шаблонами матриц' },
    { name: 'internal-matrix:manage',  description: 'Управление внутренними матрицами' },
    { name: 'members:read',            description: 'Просмотр участников проекта' },
    { name: 'members:write',           description: 'Редактирование участников проекта' },
    { name: 'members:bulk',            description: 'Массовые операции с участниками' },
    { name: 'users:manage',            description: 'Управление пользователями' },
    { name: 'database:manage',         description: 'Доступ к панели БД' },
    { name: 'kanban:delete',           description: 'Удаление задач в Kanban' },
    { name: 'departments:manage',      description: 'Управление отделами (admin)' },
  ]

  for (const p of ALL_PERMISSIONS) {
    await prisma.appPermission.upsert({
      where:  { name: p.name },
      update: { description: p.description },
      create: p,
    })
  }

  // ── Roles + role-permission bindings ─────────────────────────────────────────

  const ROLE_PERMISSIONS: Record<string, string[]> = {
    admin: ALL_PERMISSIONS.map((p) => p.name),

    dept_director: [
      'analytics:read', 'sync:logs',
      'projects:write', 'tasks:write', 'shifts:write', 'kanban:delete',
      'members:read', 'members:write', 'members:bulk',
      'departments:manage', 'users:manage', 'database:manage',
    ],

    producer: [
      'analytics:read', 'sync:trigger', 'sync:logs',
      'projects:write', 'matrix:write',
      'members:read', 'members:bulk', 'kanban:delete',
    ],

    spec_projects: [
      'analytics:read', 'sync:trigger', 'sync:logs',
      'projects:write', 'matrix:write', 'internal-matrix:manage',
      'members:read', 'members:bulk',
      'shifts:write', 'tasks:write', 'kanban:delete',
    ],

    accountant: [
      'analytics:read', 'deals:write', 'members:read',
    ],

    hr_manager: [
      'analytics:read', 'users:manage', 'members:read', 'members:write', 'tasks:write',
    ],

    employee: [],
  }

  const roleMap: Record<string, string> = {}
  for (const [roleName, perms] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.appRole.upsert({
      where:  { name: roleName },
      update: {},
      create: { name: roleName, description: `Роль: ${roleName}` },
    })
    roleMap[roleName] = role.id

    // Delete old bindings so removed perms don't linger
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } })
    for (const perm of perms) {
      await prisma.rolePermission.create({ data: { roleId: role.id, permission: perm } })
    }
  }

  // ── Users ────────────────────────────────────────────────────────────────────

  const adminHash = await bcrypt.hash('admin123', 10)
  const userHash  = await bcrypt.hash('user123', 10)

  const admin = await prisma.user.upsert({
    where:  { email: 'admin@tvshifts.ru' },
    update: {},
    create: {
      fullName:     'Администратор Системы',
      email:        'admin@tvshifts.ru',
      passwordHash: adminHash,
      tabNumber:    '001',
      isStaff:      true,
    },
  })

  const director = await prisma.user.upsert({
    where:  { email: 'director@tvshifts.ru' },
    update: {},
    create: {
      fullName:     'Новиков Андрей Валерьевич',
      email:        'director@tvshifts.ru',
      passwordHash: userHash,
      tabNumber:    '010',
      isStaff:      true,
    },
  })

  const producer = await prisma.user.upsert({
    where:  { email: 'producer@tvshifts.ru' },
    update: {},
    create: {
      fullName:     'Козлова Мария Дмитриевна',
      email:        'producer@tvshifts.ru',
      passwordHash: userHash,
      isStaff:      false,
    },
  })

  const specUser = await prisma.user.upsert({
    where:  { email: 'spec@tvshifts.ru' },
    update: {},
    create: {
      fullName:     'Громов Сергей Александрович',
      email:        'spec@tvshifts.ru',
      passwordHash: userHash,
      tabNumber:    '020',
      isStaff:      true,
    },
  })

  const accountantUser = await prisma.user.upsert({
    where:  { email: 'accountant@tvshifts.ru' },
    update: {},
    create: {
      fullName:     'Фёдорова Елена Борисовна',
      email:        'accountant@tvshifts.ru',
      passwordHash: userHash,
      tabNumber:    '030',
      isStaff:      true,
    },
  })

  const hrUser = await prisma.user.upsert({
    where:  { email: 'hr@tvshifts.ru' },
    update: {},
    create: {
      fullName:     'Климова Ольга Николаевна',
      email:        'hr@tvshifts.ru',
      passwordHash: userHash,
      tabNumber:    '040',
      isStaff:      true,
    },
  })

  const [ivanov, petrov, sidorova] = await Promise.all([
    prisma.user.upsert({
      where:  { email: 'ivanov@tvshifts.ru' },
      update: {},
      create: {
        fullName:     'Иванов Иван Иванович',
        email:        'ivanov@tvshifts.ru',
        passwordHash: userHash,
        tabNumber:    '101',
        isStaff:      true,
      },
    }),
    prisma.user.upsert({
      where:  { email: 'petrov@tvshifts.ru' },
      update: {},
      create: {
        fullName:     'Петров Пётр Петрович',
        email:        'petrov@tvshifts.ru',
        passwordHash: userHash,
        tabNumber:    '102',
        isStaff:      true,
      },
    }),
    prisma.user.upsert({
      where:  { email: 'sidorova@tvshifts.ru' },
      update: {},
      create: {
        fullName:     'Сидорова Анна Сергеевна',
        email:        'sidorova@tvshifts.ru',
        passwordHash: userHash,
        tabNumber:    '103',
        isStaff:      true,
      },
    }),
  ])

  // ── RBAC user → role assignments ─────────────────────────────────────────────

  const userRoleAssignments: [string, string][] = [
    [admin.id,          'admin'],
    [director.id,       'dept_director'],
    [producer.id,       'producer'],
    [specUser.id,       'spec_projects'],
    [accountantUser.id, 'accountant'],
    [hrUser.id,         'hr_manager'],
    [ivanov.id,         'employee'],
    [petrov.id,         'employee'],
    [sidorova.id,       'employee'],
  ]

  for (const [userId, roleName] of userRoleAssignments) {
    // Remove old role bindings to avoid stale assignments
    await prisma.userAppRole.deleteMany({ where: { userId } })
    const roleId = roleMap[roleName]
    await prisma.userAppRole.create({ data: { userId, roleId } })
  }

  // ── Departments ───────────────────────────────────────────────────────────────

  const deptCenter = await prisma.department.upsert({
    where:  { name: 'Продюсерский центр' },
    update: {},
    create: { name: 'Продюсерский центр', type: 'production' },
  })

  const deptDefs: { name: string; type: 'production' | 'support' | 'internal'; parentId?: string }[] = [
    { name: 'ТВ',                   type: 'production', parentId: deptCenter.id },
    { name: 'Радио',                type: 'production', parentId: deptCenter.id },
    { name: 'Дизайн',               type: 'production', parentId: deptCenter.id },
    { name: 'Бренд медиа',          type: 'production', parentId: deptCenter.id },
    { name: 'Корпоративные медиа',  type: 'production', parentId: deptCenter.id },
    { name: 'Технический',          type: 'support' },
    { name: 'Спецпроекты',          type: 'support' },
    { name: 'Финансы',              type: 'internal' },
    { name: 'Персонал',             type: 'internal' },
    { name: 'Администрация',        type: 'internal' },
  ]

  const deptMap: Record<string, string> = { [deptCenter.name]: deptCenter.id }
  for (const d of deptDefs) {
    const dept = await prisma.department.upsert({
      where:  { name: d.name },
      update: { type: d.type, parentId: d.parentId ?? null },
      create: { name: d.name, type: d.type, parentId: d.parentId ?? null },
    })
    deptMap[d.name] = dept.id
  }

  // ── Dept memberships ──────────────────────────────────────────────────────────

  type DeptAssignment = { user: { id: string }; deptName: string; isHead: boolean }
  const deptAssignments: DeptAssignment[] = [
    { user: admin,          deptName: 'Администрация',  isHead: true },
    { user: director,       deptName: 'ТВ',             isHead: true },
    { user: producer,       deptName: 'ТВ',             isHead: false },
    { user: specUser,       deptName: 'Спецпроекты',    isHead: true },
    { user: accountantUser, deptName: 'Финансы',        isHead: false },
    { user: hrUser,         deptName: 'Персонал',       isHead: true },
    { user: ivanov,         deptName: 'ТВ',             isHead: false },
    { user: petrov,         deptName: 'ТВ',             isHead: false },
    { user: sidorova,       deptName: 'Радио',          isHead: false },
  ]

  for (const { user, deptName, isHead } of deptAssignments) {
    const deptId = deptMap[deptName]
    await prisma.deptMember.upsert({
      where:  { userId_deptId: { userId: user.id, deptId } },
      update: { isHead },
      create: { userId: user.id, deptId, isHead },
    })
  }

  // ── Sheet configs ─────────────────────────────────────────────────────────────

  const GOOGLE_API_KEY = 'AIzaSyB9YIdh1skYEYI4QOU7fbG-5VoGX8zB99A'
  const sheetConfigs = [
    { key: 'projects',          url: 'https://docs.google.com/spreadsheets/d/12u1oE_Y7790rRXEmcVPqv20Ua_-9HyJjFZVqA86RZ2o',             apiKey: GOOGLE_API_KEY },
    { key: 'registry',          url: 'https://docs.google.com/spreadsheets/d/1EHqw4K2XIcf5inzbicsMtG5xj9HEbrZoVI1vRnWSZQ8',             apiKey: GOOGLE_API_KEY },
    { key: 'employees_buffer',  url: 'https://docs.google.com/spreadsheets/d/1cRk7Z5vNaVuoDBRAVxKhjGn54MuXRltbCYeQ-93NcjA/edit?gid=0#gid=0', apiKey: GOOGLE_API_KEY },
    { key: 'freelancers',       url: 'https://docs.google.com/spreadsheets/d/16uuEhV2FFeMuyl_J8kJ88SB5Axw_gpouXLR6CU36qYU/edit?gid=0#gid=0', apiKey: GOOGLE_API_KEY },
    { key: 'kfpd',              url: 'https://docs.google.com/spreadsheets/d/1Jmw5LLrquIF3y6I51LOuLqyw7YzJsjSb0RHr-xpNl2M/edit?gid=0#gid=0', apiKey: GOOGLE_API_KEY },
    { key: 'internal_registry', url: 'https://docs.google.com/spreadsheets/d/1MFkHJ2KZYjDVDQ_K73HaPJ1gbCeVX1SRfdWfz5CVOMM/edit?gid=0#gid=0', apiKey: null },
    { key: 'drive_folder',      url: 'https://drive.google.com/drive/folders/1PumLOo6sycivMRLG3wYy4hDQYnfHeB03?usp=drive_link',          apiKey: null },
  ]

  for (const cfg of sheetConfigs) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO sheet_configs (id, table_key, sheet_url, api_key, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, NOW())
       ON CONFLICT (table_key) DO UPDATE SET sheet_url = $2, api_key = $3, updated_at = NOW()`,
      cfg.key, cfg.url, cfg.apiKey,
    )
  }

  // ── Test tasks ────────────────────────────────────────────────────────────────

  await prisma.task.upsert({
    where:  { id: '00000000-0000-0000-0000-000000000010' },
    update: {},
    create: {
      id:          '00000000-0000-0000-0000-000000000010',
      title:       'Проверить кабели перед эфиром РУСАЛ',
      description: 'Убедиться что все HDMI и XLR кабели в наличии и исправны',
      status:      'open',
      createdBy:   admin.id,
      deptId:      deptMap['Технический'],
    },
  })

  await prisma.task.upsert({
    where:  { id: '00000000-0000-0000-0000-000000000011' },
    update: {},
    create: {
      id:          '00000000-0000-0000-0000-000000000011',
      title:       'Обновить прошивку vmix-станции',
      description: 'Скачать последнюю версию vmix и обновить',
      status:      'open',
      createdBy:   admin.id,
      deptId:      deptMap['Технический'],
    },
  })

  console.log('\n✅ Seed complete!')
  console.log('─────────────────────────────────────────────────────────────')
  console.log('Роль               Email                       Пароль')
  console.log('─────────────────────────────────────────────────────────────')
  console.log('admin              admin@tvshifts.ru           admin123')
  console.log('dept_director      director@tvshifts.ru        user123')
  console.log('producer           producer@tvshifts.ru        user123')
  console.log('spec_projects      spec@tvshifts.ru            user123')
  console.log('accountant         accountant@tvshifts.ru      user123')
  console.log('hr_manager         hr@tvshifts.ru              user123')
  console.log('employee           ivanov@tvshifts.ru          user123')
  console.log('employee           petrov@tvshifts.ru          user123')
  console.log('employee           sidorova@tvshifts.ru        user123')
  console.log('─────────────────────────────────────────────────────────────')
  console.log(`Departments: ${Object.keys(deptMap).length}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
