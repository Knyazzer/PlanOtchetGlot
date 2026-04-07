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

  // Тестовые проекты
  const project1 = await prisma.project.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      client: 'РУСАЛ',
      name: 'Прямая линия с ТОП-менеджментом',
      execProducer: 'Козлова М.Д.',
      date: new Date('2026-04-15'),
      dateConfirmed: true,
      format: 'Видеотрансляция',
      location: 'Офис РУСАЛ',
      status: 'negotiation',
      source: 'manual',
    },
  })

  const project2 = await prisma.project.upsert({
    where: { id: '00000000-0000-0000-0000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      client: 'INTERCOMM',
      name: 'Митап НАЭКК',
      execProducer: 'Козлова М.Д.',
      date: new Date('2026-04-20'),
      dateConfirmed: false,
      format: 'Оффлайн',
      location: 'Знаменка камин',
      status: 'request',
      source: 'projects_table',
      uncertainFields: ['date'],
    },
  })

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
