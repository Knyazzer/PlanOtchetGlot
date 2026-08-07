import type { CSSProperties } from 'react'

// Семантические роли цвета (КАНОН DESIGN.md §Семантические роли, вариант A — утв. 2026-08-06).
// Цвет закреплён за ФУНКЦИЕЙ действия, не за экраном. Держать в синхроне с --role-* в kit.css.
export const ROLE = {
  primary:   '#7B61FF', // главная CTA экрана / активная вкладка
  success:   '#22C55E', // добавить / начать / положительное
  danger:    '#F43F5E', // только деструктив (удалить/уволить)
  info:      '#0EA5E9', // события / инфо-метки / нейтральный акцент
  warning:   '#F59E0B', // дедлайны / предупреждения
  highlight: '#F97316', // «сейчас/сегодня» / выделение
} as const

export type Role = keyof typeof ROLE

// Текст для tonal — у info делаем светлее для читаемости на тёмном.
const TONAL_TEXT: Partial<Record<Role, string>> = { info: '#38BDF8' }

const BASE: CSSProperties = {
  borderRadius: 9, padding: '9px 16px', fontFamily: 'Inter,sans-serif', fontSize: 14, fontWeight: 600,
  cursor: 'pointer', whiteSpace: 'nowrap',
}

/** Заливка (главная CTA / положительное). */
export function filled(role: Role): CSSProperties {
  return { ...BASE, fontWeight: 700, background: ROLE[role], color: '#fff', border: 'none' }
}
/** Тональная (info/danger/warning, вторичные акценты): мягкий фон + цветной текст + рамка. */
export function tonal(role: Role): CSSProperties {
  const c = ROLE[role]
  return { ...BASE, background: c + '1f', color: TONAL_TEXT[role] ?? c, border: `1px solid ${c}55` }
}
/** Нейтральный контур (правка/отмена/вторичное). */
export function outline(): CSSProperties {
  return { ...BASE, background: 'none', color: 'var(--text-2)', border: '1px solid var(--border)' }
}
/** Чип-метка роли (дедлайн/статус). */
export function chip(role: Role): CSSProperties {
  const c = ROLE[role]
  return { fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: c + '22', color: TONAL_TEXT[role] ?? c }
}
