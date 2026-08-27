import { useQuery } from '@tanstack/react-query'
import { api } from './api'

// График работы (HR) → «тип дня по умолчанию». Прогнозная подсказка, НЕ факт:
// показывается для незаполненных дней; отчёт считает только реальные day-entries.
export type WorkSchedule = {
  userId: string
  mon: string; tue: string; wed: string; thu: string; fri: string; sat: string; sun: string
  workStart: string; workEnd: string; breakMin: number
  updatedAt: string
}

const WD_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const // индекс = Date.getDay()

export function useMyWorkSchedule() {
  return useQuery<WorkSchedule | null>({
    queryKey: ['work-schedule', 'me'],
    queryFn: () => api.get('/work-schedule/me').then(r => r.data),
    staleTime: 1000 * 60 * 10,
  })
}

// Ожидаемый тип дня из графика на дату (YYYY-MM-DD). null — графика нет.
export function expectedForDate(ds: string, sched?: WorkSchedule | null): { format: string; workStart: string; workEnd: string; breakMin: number } | null {
  if (!sched) return null
  const dow = new Date(ds + 'T00:00:00').getDay()
  const format = sched[WD_KEYS[dow]]
  return { format, workStart: sched.workStart, workEnd: sched.workEnd, breakMin: sched.breakMin }
}