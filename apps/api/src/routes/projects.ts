import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../plugins/auth'
import { hasModule } from '../services/access'
import { prisma } from '@nexus/db'

const USER_SELECT = { select: { id: true, name: true } }

const DIVISION_SELECT = {
  select: {
    id: true, name: true,
    department: { select: { id: true, name: true, color: true } },
  },
}

const PROJECT_SELECT = {
  id: true, title: true, status: true, brief: true, kpLink: true,
  createdAt: true, updatedAt: true,
  client:   { select: { id: true, name: true } },
  producer: USER_SELECT,
  _count:   { select: { workItems: true } },
}

const WORK_ITEM_SELECT = {
  id: true, title: true, description: true, status: true,
  date: true, format: true, location: true, budget: true,
  createdAt: true, updatedAt: true,
  execProducer:   USER_SELECT,
  lineProducer:   USER_SELECT,
  accountManager: USER_SELECT,
  departments: { select: { division: DIVISION_SELECT } },
  _count: { select: { tracks: true, expenses: true } },
}

const EXPENSE_SELECT = {
  id: true, amount: true, category: true, description: true, date: true,
  createdAt: true, updatedAt: true,
  createdBy: USER_SELECT,
}

const createProjectSchema = z.object({
  title:      z.string().min(1),
  clientId:   z.string().optional(),
  producerId: z.string().optional(),
  brief:      z.string().optional(),
  kpLink:     z.string().optional(),
  status:     z.enum(['draft', 'active', 'done', 'cancelled']).optional(),
})

const updateProjectSchema = createProjectSchema.partial()

const createWorkItemSchema = z.object({
  title:           z.string().min(1),
  description:     z.string().optional(),
  date:            z.string().optional(),
  format:          z.string().optional(),
  location:        z.string().optional(),
  budget:          z.number().optional(),
  status:          z.enum(['request', 'active', 'done', 'rejected', 'cancelled']).optional(),
  execProducerId:  z.string().optional(),
  lineProducerId:  z.string().optional(),
  accountManagerId: z.string().optional(),
})

const updateWorkItemSchema = createWorkItemSchema.partial()

// ── Access-guards (docs/RBAC-MODEL.md §4.6) ───────────────────────────────────
// Плагин authenticate кладёт в request.user обогащённого юзера { id, isAdmin, … }.
type ReqUser = { id: string; isAdmin: boolean }
const reqUser = (req: unknown): ReqUser => (req as { user: ReqUser }).user
const forbid = (reply: { code: (n: number) => { send: (b: unknown) => unknown } }, module: string, need = 'edit') =>
  reply.code(403).send({ error: 'Forbidden', module, need })

type WIRoles = { execProducerId?: string | null; lineProducerId?: string | null; accountManagerId?: string | null }

/** Управление проектом: admin ∨ продюсер проекта ∨ com.projects:edit. */
async function canEditProject(u: ReqUser, producerId: string | null): Promise<boolean> {
  return u.isAdmin || producerId === u.id || hasModule(u.id, false, 'com.projects', 'edit')
}
/** Удаление проекта — ЕДИНАЯ точка политики (изолировано намеренно). Пока: только админ
 *  (удаление проекта сносит каскадом все WI/треки/расходы). Когда будем детально прорабатывать
 *  права и доступы — менять ТОЛЬКО здесь, поведение изменится во всей системе. */
async function canDeleteProject(u: ReqUser): Promise<boolean> {
  return u.isAdmin
}
/** Правка WI: admin ∨ одна из трёх ролей WI ∨ com.projects:edit ∨ prod.workitems:edit. */
async function canEditWorkItem(u: ReqUser, wi: WIRoles): Promise<boolean> {
  if (u.isAdmin) return true
  if (wi.execProducerId === u.id || wi.lineProducerId === u.id || wi.accountManagerId === u.id) return true
  return (await hasModule(u.id, false, 'com.projects', 'edit')) || hasModule(u.id, false, 'prod.workitems', 'edit')
}
/** Создание WI (ролей ещё нет): admin ∨ com.projects:edit ∨ prod.workitems:edit. */
async function canCreateWorkItem(u: ReqUser): Promise<boolean> {
  return u.isAdmin || (await hasModule(u.id, false, 'com.projects', 'edit')) || hasModule(u.id, false, 'prod.workitems', 'edit')
}
/** Бюджет WI — отдельный модуль: admin ∨ fin.budgets:edit. */
async function canEditBudget(u: ReqUser): Promise<boolean> {
  return u.isAdmin || hasModule(u.id, false, 'fin.budgets', 'edit')
}
/** Расходы WI: admin ∨ lineProducer этого WI ∨ fin.expenses:edit. */
async function canEditExpense(u: ReqUser, wi: WIRoles): Promise<boolean> {
  return u.isAdmin || wi.lineProducerId === u.id || hasModule(u.id, false, 'fin.expenses', 'edit')
}
/** Видимость финансовых полей (budget/expenses) в выдачах: admin ∨ любой fin.*. */
async function canSeeFinance(u: ReqUser): Promise<boolean> {
  if (u.isAdmin) return true
  return (await hasModule(u.id, false, 'fin.company-finance', 'view'))
      || (await hasModule(u.id, false, 'fin.budgets', 'view'))
      || (await hasModule(u.id, false, 'fin.expenses', 'view'))
}
/** Срез финансовых полей (budget, expenses[]) у пользователя без fin.*. */
function stripFinanceWI<T extends Record<string, unknown>>(wi: T, show: boolean): T {
  if (show || wi == null) return wi
  const clone: Record<string, unknown> = { ...wi }
  delete clone.budget
  delete clone.expenses
  return clone as T
}

export async function projectsRoutes(app: FastifyInstance) {

  // ── Projects ──────────────────────────────────────────────────────────────

  // GET /projects
  app.get('/', { preHandler: authenticate }, async (req) => {
    const { status, clientId, search } = req.query as Record<string, string>
    return prisma.project.findMany({
      where: {
        ...(status   ? { status: status as any } : {}),
        ...(clientId ? { clientId } : {}),
        ...(search   ? { title: { contains: search, mode: 'insensitive' } } : {}),
      },
      select: PROJECT_SELECT,
      orderBy: { updatedAt: 'desc' },
    })
  })

  // GET /projects/:id
  app.get('/:id', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const project = await prisma.project.findUnique({
      where: { id },
      select: { ...PROJECT_SELECT, workItems: { select: WORK_ITEM_SELECT, orderBy: { createdAt: 'asc' } } },
    })
    if (!project) return reply.code(404).send({ error: 'Проект не найден' })
    const show = await canSeeFinance(reqUser(req))
    return { ...project, workItems: (project.workItems as any[]).map(w => stripFinanceWI(w, show)) }
  })

  // POST /projects
  app.post('/', { preHandler: authenticate }, async (req, reply) => {
    const u = reqUser(req)
    if (!(await canEditProject(u, null))) return forbid(reply, 'com.projects')
    const parsed = createProjectSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'validation', details: parsed.error.flatten() })
    return prisma.project.create({ data: parsed.data, select: PROJECT_SELECT })
  })

  // PATCH /projects/:id
  app.patch('/:id', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const parsed = updateProjectSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'validation', details: parsed.error.flatten() })
    const project = await prisma.project.findUnique({ where: { id } })
    if (!project) return reply.code(404).send({ error: 'Проект не найден' })
    if (!(await canEditProject(reqUser(req), project.producerId))) return forbid(reply, 'com.projects')
    return prisma.project.update({ where: { id }, data: parsed.data, select: PROJECT_SELECT })
  })

  // DELETE /projects/:id — политика в canDeleteProject (единая точка изменения)
  app.delete('/:id', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const project = await prisma.project.findUnique({ where: { id } })
    if (!project) return reply.code(404).send({ error: 'Проект не найден' })
    if (!(await canDeleteProject(reqUser(req)))) return reply.code(403).send({ error: 'Недостаточно прав для удаления проекта' })
    await prisma.project.delete({ where: { id } })
    return { ok: true }
  })

  // ── Work Items (nested) ───────────────────────────────────────────────────

  // GET /projects/:id/work-items
  app.get('/:id/work-items', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const project = await prisma.project.findUnique({ where: { id } })
    if (!project) return reply.code(404).send({ error: 'Проект не найден' })
    const items = await prisma.workItem.findMany({
      where: { projectId: id },
      select: WORK_ITEM_SELECT,
      orderBy: { createdAt: 'asc' },
    })
    const show = await canSeeFinance(reqUser(req))
    return items.map(w => stripFinanceWI(w as any, show))
  })

  // POST /projects/:id/work-items
  app.post('/:id/work-items', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const u = reqUser(req)
    if (!(await canCreateWorkItem(u))) return forbid(reply, 'prod.workitems')
    const project = await prisma.project.findUnique({ where: { id } })
    if (!project) return reply.code(404).send({ error: 'Проект не найден' })
    const parsed = createWorkItemSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'validation', details: parsed.error.flatten() })
    if (parsed.data.budget != null && !(await canEditBudget(u))) return forbid(reply, 'fin.budgets')
    return prisma.workItem.create({
      data: { ...parsed.data, projectId: id },
      select: WORK_ITEM_SELECT,
    })
  })
}

export async function workItemsRoutes(app: FastifyInstance) {

  // GET /work-items — all work items across all projects (workflow view)
  app.get('/', { preHandler: authenticate }, async (req) => {
    const { status, projectId, producerId, search } = req.query as Record<string, string>
    const items = await prisma.workItem.findMany({
      where: {
        ...(status    ? { status: status as any } : {}),
        ...(projectId ? { projectId } : {}),
        ...(producerId ? {
          OR: [
            { execProducerId: producerId },
            { lineProducerId: producerId },
            { accountManagerId: producerId },
          ],
        } : {}),
        ...(search ? { title: { contains: search, mode: 'insensitive' } } : {}),
      },
      select: {
        ...WORK_ITEM_SELECT,
        project: { select: { id: true, title: true, client: { select: { id: true, name: true } } } },
      },
      orderBy: [{ status: 'asc' }, { date: 'asc' }, { createdAt: 'desc' }],
    })
    const show = await canSeeFinance(reqUser(req))
    return items.map(w => stripFinanceWI(w as any, show))
  })

  // GET /work-items/:id
  app.get('/:id', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const item = await prisma.workItem.findUnique({
      where: { id },
      select: {
        ...WORK_ITEM_SELECT,
        project: { select: { id: true, title: true } },
        tracks: {
          select: {
            id: true, title: true, status: true, workItemId: true,
            leader: USER_SELECT,
            tasks: { select: { status: true } },
            stages: { select: { tasks: { select: { status: true } } } },
          },
        },
        expenses: {
          select: EXPENSE_SELECT,
          orderBy: { createdAt: 'desc' },
        },
      },
    })
    if (!item) return reply.code(404).send({ error: 'Work Item не найден' })
    const show = await canSeeFinance(reqUser(req))
    return stripFinanceWI(item as any, show)
  })

  // PATCH /work-items/:id
  app.patch('/:id', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const u = reqUser(req)
    const parsed = updateWorkItemSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'validation', details: parsed.error.flatten() })
    const item = await prisma.workItem.findUnique({ where: { id } })
    if (!item) return reply.code(404).send({ error: 'Work Item не найден' })
    if (!(await canEditWorkItem(u, item))) return forbid(reply, 'prod.workitems')
    // Бюджет — отдельный модуль fin.budgets
    if (parsed.data.budget !== undefined && !(await canEditBudget(u))) return forbid(reply, 'fin.budgets')
    return prisma.workItem.update({ where: { id }, data: parsed.data, select: WORK_ITEM_SELECT })
  })

  // DELETE /work-items/:id
  app.delete('/:id', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const item = await prisma.workItem.findUnique({ where: { id } })
    if (!item) return reply.code(404).send({ error: 'Work Item не найден' })
    if (!(await canEditWorkItem(reqUser(req), item))) return forbid(reply, 'prod.workitems')
    await prisma.workItem.delete({ where: { id } })
    return { ok: true }
  })

  // PUT /work-items/:id/departments — replace full department list
  app.put('/:id/departments', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const schema = z.object({ divisionIds: z.array(z.string()) })
    const body = schema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message })

    const item = await prisma.workItem.findUnique({ where: { id } })
    if (!item) return reply.code(404).send({ error: 'Work Item не найден' })
    if (!(await canEditWorkItem(reqUser(req), item))) return forbid(reply, 'prod.workitems')

    await prisma.$transaction([
      prisma.workItemDivision.deleteMany({ where: { workItemId: id } }),
      prisma.workItemDivision.createMany({
        data: body.data.divisionIds.map(divisionId => ({ workItemId: id, divisionId })),
        skipDuplicates: true,
      }),
    ])

    return prisma.workItem.findUnique({ where: { id }, select: WORK_ITEM_SELECT })
  })

  // GET /work-items/:id/expenses
  app.get('/:id/expenses', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string }
    if (!(await canSeeFinance(reqUser(req)))) return forbid(reply, 'fin.expenses', 'view')
    const item = await prisma.workItem.findUnique({ where: { id } })
    if (!item) return reply.code(404).send({ error: 'Work Item не найден' })
    return prisma.expense.findMany({
      where: { workItemId: id },
      select: EXPENSE_SELECT,
      orderBy: { createdAt: 'desc' },
    })
  })

  // POST /work-items/:id/expenses
  app.post('/:id/expenses', { preHandler: authenticate }, async (req, reply) => {
    const u = reqUser(req)
    const { id } = req.params as { id: string }

    const schema = z.object({
      amount:      z.number().positive(),
      category:    z.enum(['equipment', 'transport', 'fees', 'postproduction', 'other']).default('other'),
      description: z.string().default(''),
      date:        z.string().optional(),
    })
    const body = schema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message })

    const item = await prisma.workItem.findUnique({ where: { id } })
    if (!item) return reply.code(404).send({ error: 'Work Item не найден' })
    if (!(await canEditExpense(u, item))) return forbid(reply, 'fin.expenses')

    return reply.code(201).send(
      await prisma.expense.create({
        data: { ...body.data, workItemId: id, createdById: u.id },
        select: EXPENSE_SELECT,
      })
    )
  })

  // PATCH /work-items/:id/expenses/:expId
  app.patch('/:id/expenses/:expId', { preHandler: authenticate }, async (req, reply) => {
    const { id, expId } = req.params as { id: string; expId: string }

    const schema = z.object({
      amount:      z.number().positive().optional(),
      category:    z.enum(['equipment', 'transport', 'fees', 'postproduction', 'other']).optional(),
      description: z.string().optional(),
      date:        z.string().nullable().optional(),
    })
    const body = schema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message })

    const exp = await prisma.expense.findUnique({ where: { id: expId } })
    if (!exp || exp.workItemId !== id) return reply.code(404).send({ error: 'Расход не найден' })
    const item = await prisma.workItem.findUnique({ where: { id } })
    if (!item) return reply.code(404).send({ error: 'Work Item не найден' })
    if (!(await canEditExpense(reqUser(req), item))) return forbid(reply, 'fin.expenses')

    return prisma.expense.update({
      where: { id: expId },
      data: body.data,
      select: EXPENSE_SELECT,
    })
  })

  // DELETE /work-items/:id/expenses/:expId
  app.delete('/:id/expenses/:expId', { preHandler: authenticate }, async (req, reply) => {
    const { id, expId } = req.params as { id: string; expId: string }
    const exp = await prisma.expense.findUnique({ where: { id: expId } })
    if (!exp || exp.workItemId !== id) return reply.code(404).send({ error: 'Расход не найден' })
    const item = await prisma.workItem.findUnique({ where: { id } })
    if (!item) return reply.code(404).send({ error: 'Work Item не найден' })
    if (!(await canEditExpense(reqUser(req), item))) return forbid(reply, 'fin.expenses')
    await prisma.expense.delete({ where: { id: expId } })
    return reply.code(204).send()
  })
}
