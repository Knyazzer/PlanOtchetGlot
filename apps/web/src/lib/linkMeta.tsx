import { Route, Target, Briefcase } from 'lucide-react'
import type { ReactNode } from 'react'

// Типы связи задачи и их визуальные метки (иконка + группа) — общие для карточки и таблицы Обзора.
export type LinkType = 'track' | 'goal' | 'project'

export const LINK_META: Record<LinkType, { label: string; group: string; color: string }> = {
  track:   { label: 'Трек',                group: 'Треки',                 color: 'var(--accent)' },
  goal:    { label: 'Стратегическая цель', group: 'Стратегические задачи', color: 'var(--role-warning)' },
  project: { label: 'Проект',              group: 'Проекты',               color: 'var(--role-info)' },
}

/** Иконка типа связи (по ней видно тип, не читая текст). */
export function linkIcon(type: LinkType): ReactNode {
  const style = { color: LINK_META[type].color }
  const cls = 'h-3.5 w-3.5 shrink-0'
  if (type === 'track') return <Route className={cls} style={style} />
  if (type === 'goal') return <Target className={cls} style={style} />
  return <Briefcase className={cls} style={style} />
}
