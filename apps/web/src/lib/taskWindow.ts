// Модель «окно» [startDate, deadline] (решения по «окну», 2026-08): задача видна КАЖДЫЙ день
// внутри окна; закрытая — зачёркнута до дня закрытия (doneAt), дальше не показывается (окно не
// тянется само вперёд за дедлайн — тянет пользователь через drag/смену дедлайна).
export interface WindowTask {
  status: 'backlog' | 'inprogress' | 'done'
  startDate: string
  deadline: string | null
  doneAt: string | null
}

const toDay = (d: string) => d.slice(0, 10)

export function taskWindow(t: WindowTask): { start: string; end: string } {
  const start = toDay(t.startDate)
  if (t.status === 'done') return { start, end: t.doneAt ? toDay(t.doneAt) : start }
  return { start, end: t.deadline ? toDay(t.deadline) : start }
}

export function inTaskWindow(t: WindowTask, day: string) {
  const { start, end } = taskWindow(t)
  return day >= start && day <= end
}

// «Мои задачи этого дня» — тот же фильтр, что и таблица «Задачи на сегодня» (DashboardPage):
// свои, статус inprogress/done, день внутри окна.
export interface DayScopedTask extends WindowTask { assignee: { id: string } }

export function tasksForDay<T extends DayScopedTask>(tasks: T[], meId: string | undefined, day: string): T[] {
  return tasks.filter(t => t.assignee.id === meId && (t.status === 'inprogress' || t.status === 'done') && inTaskWindow(t, day))
}

export interface DayTaskStats { total: number; done: number; open: number }

/** Поставлено/выполнено на день — для информативности календаря (MonthStrip) и критерия «закрытого дня». */
export function dayTaskStats<T extends DayScopedTask>(tasks: T[], meId: string | undefined, day: string): DayTaskStats {
  const list = tasksForDay(tasks, meId, day)
  const done = list.filter(t => t.status === 'done').length
  return { total: list.length, done, open: list.length - done }
}
