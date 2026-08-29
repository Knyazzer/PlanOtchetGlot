import { prisma } from '@nexus/db'
import { getOrgScope, OrgLevel } from './orgScope'

// Функциональная модель (КИТ 1, спека docs/RBAC-MODEL.md §3-4):
// реестр модулей фиксирован в коде, БД хранит только гранты (DepartmentModule).
// Уровень пользователя в департаменте определяет режим: ниже editLevel — view, иначе edit.

export type ModuleMode = 'view' | 'edit'

// Перегруппировка по областям — спека docs/RBAC-REDESIGN-2026-08-28.md §4 (2026-08-28).
// group = область матрицы «Роли и доступы», а не бывшая департаментская группа.
export const MODULE_REGISTRY: Record<string, { name: string; group: string; readonly?: boolean; page?: string }> = {
  // Область «Проекты» — всё гейтит routes/projects.ts, write-операции на странице «Проекты»
  'com.projects':          { name: 'Реестр проектов', group: 'Проекты', page: 'projects' },
  'prod.workitems':        { name: 'Заявки (Work Items)', group: 'Проекты', page: 'projects' },
  'fin.budgets':           { name: 'Бюджеты work-items', group: 'Проекты', page: 'projects' },
  'fin.expenses':          { name: 'Расходы work-items', group: 'Проекты', page: 'projects' },
  'fin.company-finance':   { name: 'Финансы проектов', group: 'Проекты', readonly: true, page: 'projects' },
  // Область «HR»
  'hr.orgstructure':       { name: 'Оргструктура', group: 'HR', page: 'personnel' },
  'hr.absences':           { name: 'Отсутствия сотрудников', group: 'HR', page: 'calendar' },
  // Область «Календарь»
  'adm.calendar-global':   { name: 'Общий календарь', group: 'Календарь', page: 'calendar' },
  // Область «Аналитика»
  'adm.analytics-company': { name: 'Аналитика · компания', group: 'Аналитика', readonly: true, page: 'analytics' },
  // Область «Пульс»
  'adm.news':              { name: 'Публикация в Пульс', group: 'Пульс' },
  // Область «Внешние»
  'ext.inventory':         { name: 'Инвентаризация', group: 'Внешние', readonly: true },
  // (2026-08-28) Удалены 4 рудиментных модуля (грант = 0 эффекта, в коде не потреблялись,
  //   спека RBAC-REDESIGN-2026-08-28 §4): prod.board (Доска производства), com.clients (Клиенты),
  //   com.workitems (Workflow заявок), adm.svod-company (Свод · компания).
  // (2026-07-11) Ранее так же убраны мёртвые модули группы «Платформа»: tech.sheets, tech.support,
  //   tech.platform. Орфан-гранты с удалёнными ключами в БД игнорируются (getUserAccess: `if (!meta) continue`).
}

const LEVEL_ORDER: Record<OrgLevel, number> = { member: 0, head: 1, director: 2 }

export type UserAccess = {
  level: OrgLevel
  departments: Array<{ id: string; name: string; level: OrgLevel }>
  modules: Array<{ key: string; name: string; group: string; mode: ModuleMode; page?: string }>
  divisionIds: string[]      // отделы, где пользователь состоит или руководит
  directorDeptIds: string[]  // департаменты, где пользователь — директор
}

/** Доступ пользователя: департаменты с уровнем + модули департаментов с режимом view/edit. */
export async function getUserAccess(userId: string, isAdmin: boolean): Promise<UserAccess> {
  const scope = await getOrgScope(userId)

  // департаменты пользователя: через отделы членства/руководства + директорство
  const divDepts = scope.divisionIds.length
    ? await prisma.division.findMany({
        where: { id: { in: scope.divisionIds } },
        select: { deptId: true },
      })
    : []
  const deptIds = [...new Set([...divDepts.map(d => d.deptId), ...scope.directorDeptIds])]
  const departments = deptIds.length
    ? await prisma.department.findMany({ where: { id: { in: deptIds } }, select: { id: true, name: true } })
    : []

  const deptLevel = (deptId: string): OrgLevel => {
    if (scope.directorDeptIds.includes(deptId)) return 'director'
    // head хотя бы одного отдела этого департамента
    return scope.headDivisionIds.length ? 'head' : 'member'
  }

  const grants = deptIds.length
    ? await prisma.departmentModule.findMany({ where: { deptId: { in: deptIds } } })
    : []

  const modules = new Map<string, ModuleMode>()
  for (const g of grants) {
    const meta = MODULE_REGISTRY[g.moduleKey]
    if (!meta) continue // грант на неизвестный модуль — игнор
    const level = deptLevel(g.deptId)
    const mode: ModuleMode =
      meta.readonly ? 'view' : LEVEL_ORDER[level] >= LEVEL_ORDER[g.editLevel as OrgLevel] ? 'edit' : 'view'
    // несколько департаментов: берём максимальный режим
    if (modules.get(g.moduleKey) !== 'edit') modules.set(g.moduleKey, mode)
  }
  // admin: все модули в edit (readonly остаются view)
  if (isAdmin) {
    for (const [key, meta] of Object.entries(MODULE_REGISTRY)) {
      modules.set(key, meta.readonly ? 'view' : 'edit')
    }
  }

  return {
    level: scope.level,
    departments: departments.map(d => ({ ...d, level: deptLevel(d.id) })),
    modules: [...modules.entries()].map(([key, mode]) => ({
      key, mode,
      name: MODULE_REGISTRY[key].name,
      group: MODULE_REGISTRY[key].group,
      page: MODULE_REGISTRY[key].page,
    })),
    divisionIds: scope.divisionIds,
    directorDeptIds: scope.directorDeptIds,
  }
}

/** true, если у пользователя есть модуль в нужном режиме (admin — всегда). */
export async function hasModule(userId: string, isAdmin: boolean, key: string, mode: ModuleMode = 'edit'): Promise<boolean> {
  if (isAdmin) return true
  const access = await getUserAccess(userId, false)
  const m = access.modules.find(x => x.key === key)
  if (!m) return false
  return mode === 'view' ? true : m.mode === 'edit'
}
