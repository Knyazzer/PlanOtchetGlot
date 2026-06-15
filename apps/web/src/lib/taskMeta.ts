// Метаданные задач — типы донора (94% заполняемости) и форматирование минут.
// Отдельный модуль: react-refresh требует, чтобы файлы компонентов экспортировали только компоненты.

export const TASK_TYPE_OPTIONS: Array<{ value: string; label: string; color: string }> = [
  { value: 'task',            label: 'Задача',      color: '#64748b' },
  { value: 'zoom',            label: 'Zoom',        color: '#0EA5E9' },
  { value: 'meeting_offline', label: 'Встреча',     color: '#8B5CF6' },
  { value: 'air',             label: 'Эфир',        color: '#E8194B' },
  { value: 'build',           label: 'Застройка',   color: '#F59E0B' },
  { value: 'event',           label: 'Мероприятие', color: '#29BF12' },
]

export const taskTypeMeta = (t: string) => TASK_TYPE_OPTIONS.find(o => o.value === t)

export function fmtMinutes(m: number): string {
  if (m < 60) return `${m}м`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h}ч ${r}м` : `${h}ч`
}
