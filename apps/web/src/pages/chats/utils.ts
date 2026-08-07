import { formatName } from '../../lib/utils'
import type { ChatItem } from './types'

// ── Helpers ────────────────────────────────────────────────────────────────────
export function fmtTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

export function chatName(chat: ChatItem, myId: string, isAdmin: boolean): string {
  if (chat.type === 'self') return 'Избранное'
  if (chat.type === 'group') return chat.name ?? 'Группа'
  if (chat.type === 'support') {
    if (isAdmin) {
      const user = chat.otherMembers.find(m => m.id !== myId)
      return user ? `🛠 ${formatName(user.name)}` : 'Техподдержка'
    }
    return 'Техподдержка'
  }
  return chat.otherMembers.map(m => formatName(m.name)).join(', ') || 'Чат'
}

// Детерминированный цвет по имени (как в Telegram/Slack)
export const AVATAR_COLORS = [
  '#F43F5E', '#FF6B35', '#F59E0B', '#10B981',
  '#06B6D4', '#3B82F6', '#8B5CF6', '#EC4899',
  '#14B8A6', '#F97316', '#6366F1', '#84CC16',
]
export function nameColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

export function nameInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('')
}

export const GROUP_COLORS = [
  '#F43F5E', '#FF6B35', '#F59E0B', '#10B981',
  '#06B6D4', '#3B82F6', '#8B5CF6', '#EC4899',
]

// ── Projects stub data ─────────────────────────────────────────────────────────
export const PROJECTS_TREE = [
  {
    client: 'РТВ Медиа', chats: [
      { id: 'p1', name: 'Весенняя кампания 2026' },
      { id: 'p2', name: 'Ребрендинг' },
    ],
  },
  {
    client: 'СТС', chats: [
      { id: 'p3', name: 'Новогодний спецпроект' },
    ],
  },
  {
    client: 'Первый канал', chats: [
      { id: 'p4', name: 'Документальный цикл' },
      { id: 'p5', name: 'Реклама Q2' },
    ],
  },
]