// Демо-сид «прожитого месяца» для тестового пользователя (user@nexus.local).
// Цель: текущий месяц выглядит прожитым — рабочие дни ПРАВИЛЬНО закрыты (начат+завершён, задачи done),
// выходные помечены, КРОМЕ предыдущей (grace) недели — она оставлена НЕзакрытой (день начат, но не
// завершён + висит открытая задача), чтобы увидеть индикатор «нужно закрыть неделю».
// Запуск: pnpm exec tsx packages/db/prisma/seed-august-demo.ts   (dev-БД :5433)
// Идемпотентно: переписывает дни и [demo]-задачи теста за текущий месяц.
// ВАЖНО: даты строятся в UTC-полночь (Date.UTC) — так их хранит всё приложение (day-entries route:
// new Date('YYYY-MM-DD') = UTC). Локальная полночь на UTC+N уехала бы на −1 день (были грабли).
import { resolve } from 'path'
import { config } from 'dotenv'
config({ path: resolve(__dirname, '../../../.env') })
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const ymd = (y: number, m: number, dn: number) => new Date(Date.UTC(y, m, dn))
const iso = (d: Date) => d.toISOString().slice(0, 10)
function mondayOfUTC(d: Date) { const x = new Date(d); const dow = x.getUTCDay(); x.setUTCDate(x.getUTCDate() - (dow === 0 ? 6 : dow - 1)); return x }

const TASK_POOL = [
  'Свести отчёт по эфиру', 'Обработать материал со съёмки', 'Планёрка отдела', 'Подготовить сетку',
  'Проверить архив записей', 'Смонтировать анонс', 'Согласовать график смен', 'Разобрать заявки',
]

async function main() {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth()
  const todayUTC = ymd(y, m, now.getDate()) // локальный «сегодня» как UTC-полночь

  const testUser = await prisma.user.findUnique({ where: { email: 'user@nexus.local' } })
  const admin = await prisma.user.findFirst({ where: { email: 'admin@nexus.local' } })
  if (!testUser || !admin) throw new Error('Нет user@nexus.local / admin@nexus.local — прогони pnpm db:seed')
  const uid = testUser.id
  const ud = await prisma.userDivision.findFirst({ where: { userId: uid }, select: { divId: true } })
  const divisionId = ud?.divId ?? null

  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  // ДОСТИЖИМОЕ состояние под дневной цепочкой: нельзя закрыть поздний день, не закрыв ранние.
  // Значит «пачки дырок» быть не может — максимум ОДИН незакрытый день. Оставляем незакрытым
  // последний рабочий день (Пн–Пт) строго до сегодня — как БРОШЕННЫЙ активный (начат, не завершён):
  // это и есть «требуется действие», закрывается обычным «Завершить». Всё раньше — закрыто.
  const pending = new Date(todayUTC)
  do { pending.setUTCDate(pending.getUTCDate() - 1) } while (pending.getUTCDay() === 0 || pending.getUTCDay() === 6)
  const pendingStr = iso(pending)

  // Идемпотентность: снести прежние дни месяца и demo-задачи теста за этот месяц
  await prisma.dayEntry.deleteMany({ where: { userId: uid, date: { gte: ymd(y, m, 1), lte: ymd(y, m, lastDay) } } })
  await prisma.task.deleteMany({ where: { assigneeId: uid, startDate: { gte: ymd(y, m, 1), lt: ymd(y, m, lastDay + 1) }, title: { startsWith: '[demo]' } } })

  let closedDays = 0, weekendDays = 0, doneTasks = 0

  for (let dn = 1; dn <= lastDay; dn++) {
    const dateObj = ymd(y, m, dn)
    if (dateObj > todayUTC) break // будущее не трогаем
    const dow = dateObj.getUTCDay()

    if (dow === 0 || dow === 6) { // выходной
      await prisma.dayEntry.create({ data: { userId: uid, divisionId, date: dateObj, dayFormat: 'weekend', place: null } })
      weekendDays++; continue
    }

    if (iso(dateObj) === pendingStr) {
      // БРОШЕННЫЙ активный день: начат 10:00, НЕ завершён, без взятых задач → «требуется действие»
      await prisma.dayEntry.create({ data: { userId: uid, divisionId, date: dateObj, dayFormat: 'working', place: 'office', startTime: '10:00', endTime: null, breakMin: 0 } })
      continue
    }

    // рабочий день ПРАВИЛЬНО закрыт: начат+завершён, 1–2 закрытые задачи
    await prisma.dayEntry.create({ data: { userId: uid, divisionId, date: dateObj, dayFormat: 'working', place: 'office', startTime: '10:00', endTime: '19:00', breakMin: 60 } })
    const n = 1 + (dn % 2)
    for (let i = 0; i < n; i++) {
      await prisma.task.create({ data: { title: `[demo] ${TASK_POOL[(dn + i) % TASK_POOL.length]}`, assignedById: admin.id, assigneeId: uid, divisionId, startDate: dateObj, status: 'done', doneAt: new Date(Date.UTC(y, m, dn, 15, 0, 0)), type: 'task', plannedMinutes: 60, actualMinutes: 60 } })
      doneTasks++
    }
    closedDays++
  }

  console.log(`Готово для ${testUser.email}:`)
  console.log(`  закрытых раб. дней: ${closedDays}, выходных: ${weekendDays}, задач done: ${doneTasks}`)
  console.log(`  НЕзакрытый (брошенный активный) день: ${pendingStr} — «требуется действие»`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
