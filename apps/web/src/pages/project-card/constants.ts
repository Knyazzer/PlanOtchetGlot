import React from 'react'
import type { ProjectStatus, WorkItemStatus, ExpenseCategory } from './types'

// ── Constants ─────────────────────────────────────────────────────────────────

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: 'Черновик', active: 'В работе', done: 'Завершён', cancelled: 'Отменён',
}
export const STATUS_COLOR: Record<ProjectStatus, string> = {
  draft: '#8A8A9A', active: '#FF6B35', done: '#29BF12', cancelled: '#555',
}
export const WI_STATUS_LABEL: Record<WorkItemStatus, string> = {
  request: 'Заявка', active: 'В работе', done: 'Сдан', rejected: 'Отклонён', cancelled: 'Отменён',
}
export const WI_STATUS_COLOR: Record<WorkItemStatus, string> = {
  request: '#8A8A9A', active: '#FF6B35', done: '#29BF12', rejected: '#E8194B', cancelled: '#555',
}
export const EXPENSE_LABEL: Record<ExpenseCategory, string> = {
  equipment: 'Оборудование', transport: 'Транспорт', fees: 'Гонорары',
  postproduction: 'Постпродакшн', other: 'Прочее',
}
export const FORMATS = ['ТВ', 'Радио', 'Телерадио', 'Продакшн', 'Дизайн', 'Оффлайн', 'Виртуальный', 'Менеджмент']
export const LOCATIONS = ['Знаменка крыша', 'Знаменка чёрная', 'Знаменка камин', 'Романов', 'Выезд']

// ── Shared styles ─────────────────────────────────────────────────────────────

export const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '7px 10px',
  background: 'var(--bg)', border: '1px solid var(--border)',
  borderRadius: 7, color: 'var(--text-1)', fontSize: 12.5,
  fontFamily: 'Inter, sans-serif', outline: 'none',
}
export const miniSelectStyle: React.CSSProperties = {
  ...inputStyle, width: 'auto', padding: '4px 8px', fontSize: 12,
}
