import type { TrackSummary } from './types'

// ── Helpers ───────────────────────────────────────────────────────────────────

export function trackProgress(track: TrackSummary) {
  const allTasks = [
    ...track.tasks,
    ...track.stages.flatMap(s => s.tasks),
  ]
  if (allTasks.length === 0) return null
  const done = allTasks.filter(t => t.status === 'done').length
  return { done, total: allTasks.length, pct: Math.round((done / allTasks.length) * 100) }
}

export function fmtMoney(v: string | null | undefined) {
  if (!v) return '—'
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(Number(v))
}
