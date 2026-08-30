// Фиксация периодов (Period-Lock) — server-side. Правила согласованы с Владом (2026-08-29):
// неделя = Пн–Вс; open = текущая неделя (редактируется); grace = предыдущая неделя (редактируется +
// напоминание «закрой»); locked = старше предыдущей недели ИЛИ завершившийся месяц. Конец месяца
// ДОМИНИРУЕТ: как только месяц закончился, весь месяц зафиксирован (даже если grace не вышел).
// Override: только мастер-админ (isAdmin) обходит лок — гейты вызывают lockState только для НЕ-админов.
// Спека: docs/PERIOD-LOCK-2026-08-29.md

export type LockState = 'open' | 'grace' | 'locked'

function atMidnight(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }

/** Понедельник недели, в которой лежит дата (локальное время сервера). */
function mondayOf(d: Date): Date {
  const x = atMidnight(d)
  const dow = x.getDay()                 // 0=Вс..6=Сб
  x.setDate(x.getDate() - (dow === 0 ? 6 : dow - 1))
  return x
}

function toDate(day: Date | string): Date {
  return typeof day === 'string' ? new Date(day + 'T00:00:00') : new Date(day)
}

export function lockState(day: Date | string, now: Date = new Date()): LockState {
  const d = atMidnight(toDate(day))
  const n = atMidnight(now)

  // Завершившийся (прошлый) месяц — залочен целиком. Доминирует над недельным grace.
  if (d.getFullYear() < n.getFullYear() ||
      (d.getFullYear() === n.getFullYear() && d.getMonth() < n.getMonth())) {
    return 'locked'
  }

  const curWeek = mondayOf(n)
  const dayWeek = mondayOf(d)
  if (dayWeek.getTime() >= curWeek.getTime()) return 'open'        // текущая или будущая неделя

  const prevWeek = new Date(curWeek); prevWeek.setDate(prevWeek.getDate() - 7)
  if (dayWeek.getTime() === prevWeek.getTime()) return 'grace'     // предыдущая неделя (месяц не прошлый — проверено выше)

  return 'locked'                                                  // старше предыдущей недели в текущем месяце
}

export function isLocked(day: Date | string, now?: Date): boolean {
  return lockState(day, now) === 'locked'
}
