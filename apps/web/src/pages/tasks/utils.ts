import React from 'react'
import type { TaskStatus, TaskLogEntry, HistoryGroup } from './types'

// ── Constants ──────────────────────────────────────────────────────────────────
export const COLS: { id: TaskStatus; label: string; color: string }[] = [
  { id: 'backlog',    label: 'Бэклог',   color: '#464658' },
  { id: 'inprogress', label: 'В работе', color: '#0EA5E9' },
  { id: 'done',       label: 'Готово',   color: '#29BF12' },
]

export const TASK_COLORS: Record<string, string> = {}
export const COLOR_PALETTE = ['#8B5CF6','#0EA5E9','#FF6B35','#E8194B','#F59E0B','#29BF12']
export function taskColor(id: string) {
  if (!TASK_COLORS[id]) {
    const idx = Object.keys(TASK_COLORS).length % COLOR_PALETTE.length
    TASK_COLORS[id] = COLOR_PALETTE[idx]
  }
  return TASK_COLORS[id]
}

export const DAY_W   = 40
export const ROW_H   = 48
export const TOTAL_D = 30
export const WEEKEND = [0, 6]
export const WDAYS_RU = ['вс','пн','вт','ср','чт','пт','сб']
export const MONTHS_S = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек']

// ── Helpers ────────────────────────────────────────────────────────────────────
export function toDateStr(iso: string | null | undefined): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

export function fmtD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate()+n); return r }
export function parseD(s: string) { const [y,m,d] = s.split('-').map(Number); return new Date(y,m-1,d) }
export function fmtDisp(d: Date) { return `${d.getDate()} ${MONTHS_S[d.getMonth()]} ${d.getFullYear()}` }
export function daysBetween(a: Date, b: Date) { return Math.round((b.getTime()-a.getTime())/86400000) }

export const inputStyle: React.CSSProperties = {
  background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:8,
  color:'var(--text-1)', fontSize:13, padding:'8px 10px', outline:'none', width:'100%', boxSizing:'border-box',
}

// ── Date Picker ───────────────────────────────────────────────────────────────
export const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
export const DAYS_RU   = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']

// ── Task history ──────────────────────────────────────────────────────────────
export const ACTION_LABELS: Record<string, (meta: Record<string, string | null>) => string> = {
  created:             m => `Задача создана → ${m.assigneeName ?? ''}${m.deadline ? `, дедлайн ${m.deadline}` : ''}`,
  status_changed:      m => `Статус: ${m.from} → ${m.to}`,
  assignee_changed:    m => `Исполнитель: ${m.from} → ${m.to}`,
  start_changed:       m => `Начало: ${m.from} → ${m.to}`,
  deadline_changed:    m => m.to ? `Дедлайн: ${m.from ?? 'не задан'} → ${m.to}` : `Дедлайн снят (был ${m.from ?? '—'})`,
  title_changed:       m => `Название изменено → «${m.title}»`,
  description_changed: () => `Описание обновлено`,
}

export function fmtTs(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getDate()} ${MONTHS_S[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function groupEntries(entries: TaskLogEntry[]): HistoryGroup[] {
  const groups: HistoryGroup[] = []
  for (const e of entries) {
    const last = groups[groups.length - 1]
    if (last && last.action === e.action) {
      last.entries.push(e)
    } else {
      groups.push({ action: e.action, entries: [e] })
    }
  }
  return groups
}

// ── Gantt chart ────────────────────────────────────────────────────────────────
export const navBtn: React.CSSProperties = {
  width:32, height:32, background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:8,
  color:'var(--text-3)', fontSize:14, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
}

// ── Calendar event modal (opened from Kanban/Gantt for calendar tasks) ─────────
export const CAL_LOCS = [
  { id: 'kaminoka', label: 'Знаменка Каминка' },
  { id: 'chernaya', label: 'Знаменка Чёрная'  },
  { id: 'kupol',    label: 'Знаменка Купол'   },
  { id: 'zoom',     label: 'Zoom'              },
  { id: 'office',   label: 'Офис'             },
  { id: 'vyezd',    label: 'Выезд'            },
]
export const CAL_LOC_IDS = new Set(CAL_LOCS.map(l => l.id))
export const CAL_TYPE_COLOR: Record<string, string> = {
  meeting: '#8B5CF6', task: '#FF6B35', personal: '#29BF12',
}
export const CAL_TYPES = [
  { value: 'meeting',  label: 'Встреча' },
  { value: 'task',     label: 'Задача'  },
  { value: 'personal', label: 'Личное'  },
]
