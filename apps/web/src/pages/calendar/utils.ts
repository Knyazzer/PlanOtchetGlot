import type { CalView, CalEvent } from './types'

export function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
export function parseYMD(s: string) {
  const [y,m,d] = s.split('-').map(Number)
  return new Date(y, m-1, d)
}
export function timeToMin(t: string) { const [h,m] = t.split(':').map(Number); return h*60+m }
export function minToTime(min: number) {
  min = Math.max(0, Math.min(1439, min))
  return `${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}`
}
export function snapTo15(min: number) { return Math.round(min / 15) * 15 }

export function getWeekStart(d: Date) {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const s = new Date(d)
  s.setDate(d.getDate() + diff)
  s.setHours(0,0,0,0)
  return s
}

export function computeRange(view: CalView, cursor: Date): [string, string] {
  if (view === 'month') {
    const year = cursor.getFullYear(), month = cursor.getMonth()
    const start = getWeekStart(new Date(year, month, 1))
    const lastDay = new Date(year, month+1, 0)
    const end = getWeekStart(lastDay)
    end.setDate(end.getDate() + 6)
    return [toYMD(start), toYMD(end)]
  }
  if (view === 'week') {
    const ws = getWeekStart(cursor)
    const we = new Date(ws); we.setDate(we.getDate() + 6)
    return [toYMD(ws), toYMD(we)]
  }
  return [toYMD(cursor), toYMD(cursor)]
}

// Overlap layout — updated to use string keys
export function layoutEvents(events: CalEvent[]): Map<string, { col: number; total: number }> {
  if (!events.length) return new Map()
  const sorted = [...events].sort((a,b) => timeToMin(a.start) - timeToMin(b.start))
  const result = new Map<string, { col: number; total: number }>()
  const overlaps = (a: CalEvent, b: CalEvent) =>
    timeToMin(a.start) < timeToMin(b.end) && timeToMin(b.start) < timeToMin(a.end)
  const clusters: CalEvent[][] = []
  sorted.forEach(evt => {
    let added = false
    for (const cluster of clusters) {
      if (cluster.some(e => overlaps(e, evt))) { cluster.push(evt); added = true; break }
    }
    if (!added) clusters.push([evt])
  })
  clusters.forEach(cluster => {
    const cols: number[] = []
    cluster.forEach(evt => {
      const startMin = timeToMin(evt.start), endMin = timeToMin(evt.end)
      let placed = false
      for (let i = 0; i < cols.length; i++) {
        if (cols[i] <= startMin) { cols[i] = endMin; result.set(evt.id, { col: i, total: 0 }); placed = true; break }
      }
      if (!placed) { result.set(evt.id, { col: cols.length, total: 0 }); cols.push(endMin) }
    })
    cluster.forEach(evt => { result.get(evt.id)!.total = cols.length })
  })
  return result
}