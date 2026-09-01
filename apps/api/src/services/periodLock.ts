// Фиксация периодов (Period-Lock) — server-side. Правило (обновлено 2026-09-01): РОЛЛИНГ по неделям,
// БЕЗ привязки к календарному месяцу. неделя = Пн–Вс; open = текущая неделя (редактируется);
// grace = предыдущая неделя (редактируется + напоминание «закрой»); locked = старше предыдущей недели.
// Убрана «месячная доминация» (был баг: 1-го числа весь прошлый месяц лочился целиком, включая ВЧЕРА —
// вчерашний день нельзя было закрыть, и он не блокировал сегодня в дневной цепочке; см. 2026-08-29-спеку).
// Так текущая неделя редактируема ЧЕРЕЗ стык месяцев (напр. 31 авг = Пн недели с 1 сен → open), а старое
// замерзает роллингом за ~2 недели. Override: только мастер-админ (isAdmin) — гейты зовут lockState для не-админов.
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
