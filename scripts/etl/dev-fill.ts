/**
 * Dev-настройка тестового стенда (не для прода): дозаполняет данные, которых нет в ETL-снапшотах.
 * - Сотрудникам (legacyEmpId) генерит почту по имени (как онбординг в проде) и заполняет
 *   плоские department/subDept/position из реляционной структуры (UserDivision → Division → Department),
 *   чтобы таблица «Персонала» показывала департамент/отдел/должность.
 * - Создаёт 6 синтетических фрилансеров (userType=freelancer) с почтами и специализациями.
 * Реальные почты живут в проде (Supabase) — здесь имитация.
 *
 * Запуск (из packages/db): pnpm exec dotenv -e ../../.env -- tsx ../../scripts/etl/dev-fill.ts
 */
import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../../.env') })

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const TRANSLIT: Record<string, string> = {
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',
  м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',
  щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',
}
const translit = (s: string) => s.split('').map(c => TRANSLIT[c] ?? c).join('')
function baseEmail(name: string, freelancer = false): string {
  const parts = name.trim().toLowerCase().split(/\s+/)
  const last  = translit(parts[0] ?? 'user')
  const first = translit(parts[1] ?? '')
  const base  = first ? `${last}.${first}` : last
  return `${freelancer ? 'fl.' : ''}${base}@nexus.local`
}

const FREELANCERS: Array<{ name: string; position: string }> = [
  { name: 'Смирнов Артём Игоревич',     position: 'Видеомонтажёр' },
  { name: 'Кузнецова Дарья Павловна',   position: 'Графический дизайнер' },
  { name: 'Попов Максим Сергеевич',     position: 'Оператор' },
  { name: 'Соколова Анна Дмитриевна',   position: 'Копирайтер' },
  { name: 'Морозов Илья Андреевич',     position: 'Моушн-дизайнер' },
  { name: 'Новикова Елена Викторовна',  position: 'Фотограф' },
]

async function main() {
  const existing = await prisma.user.findMany({ select: { email: true } })
  const used = new Set(existing.map(e => e.email).filter(Boolean) as string[])
  const uniqueEmail = (name: string, freelancer = false): string => {
    const e = baseEmail(name, freelancer)
    if (!used.has(e)) { used.add(e); return e }
    const [lp, dp] = e.split('@'); let i = 2
    while (used.has(`${lp}${i}@${dp}`)) i++
    const r = `${lp}${i}@${dp}`; used.add(r); return r
  }

  // 1. Сотрудники: почта + плоские department/subDept/position из реляционной структуры
  const staff = await prisma.user.findMany({
    where: { legacyEmpId: { not: null } },
    select: {
      id: true, name: true, email: true,
      divMemberships: { select: { division: { select: { name: true, department: { select: { name: true } } } } } },
    },
  })
  let filledEmail = 0, filledDept = 0
  for (const u of staff) {
    const div = u.divMemberships[0]?.division
    const data: Record<string, unknown> = { position: 'Сотрудник' }
    if (div) { data.subDept = div.name; data.department = div.department.name; filledDept++ }
    if (!u.email) { data.email = uniqueEmail(u.name); filledEmail++ }
    await prisma.user.update({ where: { id: u.id }, data })
  }

  // 2. Синтетические фрилансеры
  const fls = await prisma.user.findMany({ where: { userType: 'freelancer' }, select: { tabNumber: true } })
  let maxFl = 0
  for (const f of fls) { const m = f.tabNumber?.match(/^FL(\d+)$/); if (m) maxFl = Math.max(maxFl, parseInt(m[1], 10)) }
  let created = 0
  for (const fr of FREELANCERS) {
    const exists = await prisma.user.findFirst({ where: { name: fr.name, userType: 'freelancer' } })
    if (exists) continue
    maxFl++
    await prisma.user.create({
      data: {
        name: fr.name, email: uniqueEmail(fr.name, true), userType: 'freelancer',
        role: 'freelancer', position: fr.position, tabNumber: `FL${maxFl}`,
      },
    })
    created++
  }

  console.log(`Сотрудники: почта=${filledEmail}, департамент/отдел=${filledDept}. Фрилансеры создано: ${created}.`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
