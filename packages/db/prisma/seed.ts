import { resolve } from 'path'
import { config } from 'dotenv'
config({ path: resolve(__dirname, '../../../.env') })

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  const adminHash = await bcrypt.hash('admin123', 10)
  const userHash = await bcrypt.hash('user123', 10)

  const admin = await prisma.user.upsert({
    where: { email: 'admin@tvshifts.ru' },
    update: {},
    create: {
      fullName: 'Администратор Системы',
      email: 'admin@tvshifts.ru',
      passwordHash: adminHash,
      role: 'admin',
      tabNumber: '001',
      isStaff: true,
    },
  })

  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: 'ivanov@tvshifts.ru' },
      update: {},
      create: {
        fullName: 'Иванов Иван Иванович',
        email: 'ivanov@tvshifts.ru',
        passwordHash: userHash,
        role: 'employee',
        tabNumber: '101',
        isStaff: true,
      },
    }),
    prisma.user.upsert({
      where: { email: 'petrov@tvshifts.ru' },
      update: {},
      create: {
        fullName: 'Петров Пётр Петрович',
        email: 'petrov@tvshifts.ru',
        passwordHash: userHash,
        role: 'employee',
        tabNumber: '102',
        isStaff: true,
      },
    }),
    prisma.user.upsert({
      where: { email: 'sidorova@tvshifts.ru' },
      update: {},
      create: {
        fullName: 'Сидорова Анна Сергеевна',
        email: 'sidorova@tvshifts.ru',
        passwordHash: userHash,
        role: 'employee',
        tabNumber: '103',
        isStaff: true,
      },
    }),
    prisma.user.upsert({
      where: { email: 'producer@tvshifts.ru' },
      update: {},
      create: {
        fullName: 'Козлова Мария Дмитриевна',
        email: 'producer@tvshifts.ru',
        passwordHash: userHash,
        role: 'producer',
        isStaff: false,
      },
    }),
  ])

  // Sheet configs
  const GOOGLE_API_KEY = 'AIzaSyB9YIdh1skYEYI4QOU7fbG-5VoGX8zB99A'
  const sheetConfigs: { key: string; url: string; apiKey: string | null }[] = [
    {
      key: 'projects',
      url: 'https://docs.google.com/spreadsheets/d/12u1oE_Y7790rRXEmcVPqv20Ua_-9HyJjFZVqA86RZ2o',
      apiKey: GOOGLE_API_KEY,
    },
    {
      key: 'registry',
      url: 'https://docs.google.com/spreadsheets/d/1EHqw4K2XIcf5inzbicsMtG5xj9HEbrZoVI1vRnWSZQ8',
      apiKey: GOOGLE_API_KEY,
    },
    {
      key: 'employees_buffer',
      url: 'https://docs.google.com/spreadsheets/d/1cRk7Z5vNaVuoDBRAVxKhjGn54MuXRltbCYeQ-93NcjA/edit?gid=0#gid=0',
      apiKey: GOOGLE_API_KEY,
    },
    {
      key: 'freelancers',
      url: 'https://docs.google.com/spreadsheets/d/16uuEhV2FFeMuyl_J8kJ88SB5Axw_gpouXLR6CU36qYU/edit?gid=0#gid=0',
      apiKey: GOOGLE_API_KEY,
    },
    {
      key: 'kfpd',
      url: 'https://docs.google.com/spreadsheets/d/1Jmw5LLrquIF3y6I51LOuLqyw7YzJsjSb0RHr-xpNl2M/edit?gid=0#gid=0',
      apiKey: GOOGLE_API_KEY,
    },
    {
      key: 'internal_registry',
      url: 'https://docs.google.com/spreadsheets/d/1MFkHJ2KZYjDVDQ_K73HaPJ1gbCeVX1SRfdWfz5CVOMM/edit?gid=0#gid=0',
      apiKey: null,
    },
    {
      key: 'drive_folder',
      url: 'https://drive.google.com/drive/folders/1PumLOo6sycivMRLG3wYy4hDQYnfHeB03?usp=drive_link',
      apiKey: null,
    },
  ]

  for (const cfg of sheetConfigs) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO sheet_configs (id, table_key, sheet_url, api_key, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, NOW())
       ON CONFLICT (table_key) DO UPDATE SET sheet_url = $2, api_key = $3, updated_at = NOW()`,
      cfg.key, cfg.url, cfg.apiKey
    )
  }

  // Тестовые задачи
  await prisma.task.upsert({
    where: { id: '00000000-0000-0000-0000-000000000010' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000010',
      title: 'Проверить кабели перед эфиром РУСАЛ',
      description: 'Убедиться что все HDMI и XLR кабели в наличии и исправны',
      status: 'open',
      createdBy: admin.id,
    },
  })

  await prisma.task.upsert({
    where: { id: '00000000-0000-0000-0000-000000000011' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000011',
      title: 'Обновить прошивку vmix-станции',
      description: 'Скачать последнюю версию vmix и обновить',
      status: 'open',
      createdBy: admin.id,
    },
  })

  console.log('Seed complete!')
  console.log(`Admin: admin@tvshifts.ru / admin123`)
  console.log(`Users: ivanov@tvshifts.ru, petrov@tvshifts.ru, sidorova@tvshifts.ru / user123`)
  console.log(`Producer: producer@tvshifts.ru / user123`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
