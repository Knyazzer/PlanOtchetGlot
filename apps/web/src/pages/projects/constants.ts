import type { ProjectStatus, WorkItemStatus, ExpenseCategory } from './types'

// ── Constants ─────────────────────────────────────────────────────────────────

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: 'Черновик', active: 'Активный', done: 'Завершён', cancelled: 'Отменён',
}
export const STATUS_COLOR: Record<ProjectStatus, string> = {
  draft: '#888', active: '#FF6B35', done: '#29BF12', cancelled: '#666',
}
export const WI_STATUS_LABEL: Record<WorkItemStatus, string> = {
  request: 'Заявка', active: 'В работе', done: 'Сдан', rejected: 'Отклонён', cancelled: 'Отменён',
}
export const WI_STATUS_COLOR: Record<WorkItemStatus, string> = {
  request: '#888', active: '#FF6B35', done: '#29BF12', rejected: '#E8194B', cancelled: '#666',
}
export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  equipment: 'Оборудование', transport: 'Транспорт', fees: 'Гонорары',
  postproduction: 'Постпродакшн', other: 'Прочее',
}

export const FORMATS = ['ТВ', 'Радио', 'Телерадио', 'Продакшн', 'Дизайн', 'Оффлайн', 'Виртуальный', 'Менеджмент']
export const LOCATIONS = ['Знаменка крыша', 'Знаменка чёрная', 'Знаменка камин', 'Романов', 'Выезд']

// ── Shared styles ─────────────────────────────────────────────────────────────

export const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4, marginTop: 12,
}
export const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '8px 10px',
  background: 'var(--bg)', border: '1px solid var(--border)',
  borderRadius: 8, color: 'var(--text-1)', fontSize: 13, fontFamily: 'Inter, sans-serif',
  outline: 'none',
}
export const cancelBtnStyle: React.CSSProperties = {
  background: 'none', border: '1px solid var(--border)', borderRadius: 8,
  color: 'var(--text-2)', fontSize: 13, padding: '8px 18px', cursor: 'pointer',
  fontFamily: 'Inter, sans-serif',
}
export const submitBtnStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg,#FF6B35,#E8194B)',
  border: 'none', borderRadius: 8, color: '#fff',
  fontSize: 13, fontWeight: 600, padding: '8px 20px', cursor: 'pointer',
  fontFamily: 'Inter, sans-serif',
}

// ── ProjectsKanban columns ──────────────────────────────────────────────────────

export const KANBAN_COLS: { status: ProjectStatus; label: string }[] = [
  { status: 'draft',     label: 'Черновик'  },
  { status: 'active',    label: 'В работе'  },
  { status: 'done',      label: 'Завершён'  },
  { status: 'cancelled', label: 'Отменён'   },
]

// ── miniSelectStyle ───────────────────────────────────────────────────────────

export const miniSelectStyle: React.CSSProperties = {
  fontSize: 12, padding: '3px 6px', borderRadius: 6,
  border: '1px solid var(--border)', background: 'var(--bg)',
  color: 'var(--text-2)', fontFamily: 'Inter, sans-serif', cursor: 'pointer',
}
