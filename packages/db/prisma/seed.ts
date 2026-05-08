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
    producer: [
      'analytics:read', 'sync:trigger', 'sync:logs', 'matrix:write',
      'members:read', 'members:bulk', 'kanban:delete',
    ],
    employee: [],
  }

  const roleMap: Record<string, string> = {}
  for (const [roleName, perms] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.appRole.upsert({
      where:  { name: roleName },
      update: {},
      create: { name: roleName, description: `Стандартная роль: ${roleName}` },
    })
    roleMap[roleName] = role.id

    for (const perm of perms) {
      await prisma.rolePermission.upsert({
        where:  { roleId_permission: { roleId: role.id, permission: perm } },
        update: {},
        create: { roleId: role.id, permission: perm },
      })
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
    [admin.id,    'admin'],
    [producer.id, 'producer'],
    [ivanov.id,   'employee'],
    [petrov.id,   'employee'],
    [sidorova.id, 'employee'],
  ]

  for (const [userId, roleName] of userRoleAssignments) {
    const roleId = roleMap[roleName]
    await prisma.userAppRole.upsert({
      where:  { userId_roleId: { userId, roleId } },
      update: {},
      create: { userId, roleId },
    })
  }

  // ── Departments ───────────────────────────────────────────────────────────────
  // Структура: Продюсерский центр (production)
  //   ├── ТВ
  //   ├── Радио
  //   ├── Дизайн
  //   ├── Бренд медиа
  //   └── Корпоративные медиа
  // Технический (support)
  // Спецпроекты (support)
  // Финансы / Персонал / Администрация (internal)

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

  // Admin → member of Администрация (head)
  await prisma.deptMember.upsert({
    where:  { userId_deptId: { userId: admin.id, deptId: deptMap['Администрация'] } },
    update: {},
    create: { userId: admin.id, deptId: deptMap['Администрация'], isHead: true },
  })

  // Producer → member of ТВ (head)
  await prisma.deptMember.upsert({
    where:  { userId_deptId: { userId: producer.id, deptId: deptMap['ТВ'] } },
    update: {},
    create: { userId: producer.id, deptId: deptMap['ТВ'], isHead: true },
  })

  // Employees → members of ТВ
  for (const u of [ivanov, petrov, sidorova]) {
    await prisma.deptMember.upsert({
      where:  { userId_deptId: { userId: u.id, deptId: deptMap['ТВ'] } },
      update: {},
      create: { userId: u.id, deptId: deptMap['ТВ'], isHead: false },
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
  console.log('─────────────────────────────────────────')
  console.log('Admin:    admin@tvshifts.ru    / admin123')
  console.log('Producer: producer@tvshifts.ru / user123')
  console.log('Users:    ivanov / petrov / sidorova @tvshifts.ru / user123')
  console.log('─────────────────────────────────────────')
  console.log(`Departments: ${Object.keys(deptMap).length}`)
  console.log(`Roles: admin, producer, employee`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
