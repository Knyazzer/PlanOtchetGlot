// Модель дневной цепочки (2026-08-30): задача = ОБЫЧНАЯ задача одного дня (startDate). Показывается
// ТОЛЬКО в свой день, независимо от статуса, doneAt и дедлайна. Дедлайн — это «до какого числа надо
// успеть» (метаданные для карточки «Дедлайны» + флаг «просрочено»), а НЕ диапазон показа: задача НЕ
// размазывается по дням до дедлайна. Не успел — перекидываешь на другой день (drag/смена startDate);
// дедлайн прошёл, а задача не done → «просрочена» (deadline < today, детект в DeadlinesInfoCard).
export interface WindowTask {
  status: 'backlog' | 'inprogress' | 'done'
  startDate: string
  deadline: string | null
  doneAt: string | null
}

const toDay = (d: string) => d.slice(0, 10)

export function taskWindow(t: WindowTask): { start: string; end: string } {
  const start = toDay(t.startDate)
  return { start, end: start } // всегда один день — свой (дедлайн не растягивает)
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
