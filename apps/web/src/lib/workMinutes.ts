// Отработанные минуты за день — ЕДИНЫЙ фронтовый расчёт, зеркалит серверный workMinutes()
// (apps/api/src/routes/day-entries.ts). Учитывает ночную смену: если конец < начала — это переход
// через полночь, добавляем сутки. Без этого MonthStrip/DayModal показывали 0 при 22:00→02:00, тогда как
// Свод/Аналитика (сервер) считали верно — расхождение фронт↔сервер (аудит 2026-08-30, #2).

export const parseHHMM = (t?: string | null): number | null =>
  t && /^\d{2}:\d{2}$/.test(t) ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null

/** Минуты работы: end−start−break; ночная смена (end<start) → end += 24ч. Неполные данные → 0. */
export function workedMinutes(startTime?: string | null, endTime?: string | null, breakMin: number = 0): number {
  const s = parseHHMM(startTime)
  let e = parseHHMM(endTime)
  if (s == null || e == null) return 0
  if (e < s) e += 24 * 60
  return Math.max(0, e - s - (breakMin || 0))
}
