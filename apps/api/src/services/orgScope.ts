import { prisma } from '@nexus/db'

// Орг-уровень — производная от оргструктуры, справочника ролей нет (спека research/20 §1):
// member — есть запись UserDivision; head — Division.headId; director — Department.directorId.
// admin (User.isAdmin) — суперфлаг вне шкалы, обрабатывается вызывающим кодом.
export type OrgLevel = 'member' | 'head' | 'director'

export type OrgScope = {
  level: OrgLevel
  /** отделы, где пользователь состоит или руководит */
  divisionIds: string[]
  /** отделы, где пользователь — руководитель */
  headDivisionIds: string[]
  /** департаменты, где пользователь — директор */
  directorDeptIds: string[]
  /** кого видит в надзорных модулях: self → отдел (head) → департамент (director) */
  visibleUserIds: string[]
}

export async function getOrgScope(userId: string): Promise<OrgScope> {
  const [memberships, headDivisions, directorDepts] = await Promise.all([
    prisma.userDivision.findMany({ where: { userId }, select: { divId: true } }),
    prisma.division.findMany({ where: { headId: userId }, select: { id: true, deptId: true } }),
    prisma.department.findMany({ where: { directorId: userId }, select: { id: true } }),
  ])

  const headDivisionIds = headDivisions.map(d => d.id)
  const directorDeptIds = directorDepts.map(d => d.id)
  const level: OrgLevel = directorDeptIds.length ? 'director' : headDivisionIds.length ? 'head' : 'member'

  const divisionIds = [...new Set([...memberships.map(m => m.divId), ...headDivisionIds])]

  // Охват видимости: директор — все отделы своих департаментов; руководитель — свои отделы.
  const scopeDivIds = new Set<string>(headDivisionIds)
  if (directorDeptIds.length) {
    const deptDivisions = await prisma.division.findMany({
      where: { deptId: { in: directorDeptIds } },
      select: { id: true },
    })
    for (const d of deptDivisions) scopeDivIds.add(d.id)
  }

  const visible = new Set<string>([userId])
  if (scopeDivIds.size) {
    const members = await prisma.userDivision.findMany({
      where: { divId: { in: [...scopeDivIds] } },
      select: { userId: true },
    })
    for (const m of members) visible.add(m.userId)
    // руководители подведомственных отделов тоже в охвате
    const heads = await prisma.division.findMany({
      where: { id: { in: [...scopeDivIds] }, headId: { not: null } },
      select: { headId: true },
    })
    for (const h of heads) if (h.headId) visible.add(h.headId)
  }

  return { level, divisionIds, headDivisionIds, directorDeptIds, visibleUserIds: [...visible] }
}
