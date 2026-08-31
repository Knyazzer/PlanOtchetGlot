import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

// Бейдж колокола: свежие записи ленты (новее localStorage-метки) + непрочитанные чаты.
// Отдельный модуль от панели — react-refresh требует компонентных файлов без хук-экспортов.

type NotifItem = { id: string; kind: 'task' | 'calendar' | 'request' | 'track'; text: string; at: string; unseen?: boolean }
type NotifData = { tasks: NotifItem[]; events: NotifItem[]; requests?: NotifItem[]; tracks?: NotifItem[] }

export const NOTIF_SEEN_LS_KEY = 'nexus:notifications-seen-at'
// Пер-элементная прочитанность: id уведомлений, прочитанных по одному (клик по уведомлению = «посмотрел
// причину» → прочитано, даже логовые вроде переименования, где нет серверного seenAt). Общий для панели и бейджа.
export const NOTIF_READ_IDS_KEY = 'nexus:notifications-read-ids'
export function getReadNotifIds(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(NOTIF_READ_IDS_KEY) ?? '[]') as string[]) } catch { return new Set() }
}
export function markNotifRead(id: string): void {
  const s = getReadNotifIds(); s.add(id)
  localStorage.setItem(NOTIF_READ_IDS_KEY, JSON.stringify([...s].slice(-300))) // прунинг, чтобы не рос бесконечно
}

export function useNotificationsBadge(unreadChats: number): number {
  const { data } = useQuery<NotifData>({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications').then(r => r.data),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })
  const seenAt = localStorage.getItem(NOTIF_SEEN_LS_KEY) ?? ''
  const readIds = getReadNotifIds()
  const fresh = [...(data?.tasks ?? []), ...(data?.requests ?? []), ...(data?.tracks ?? [])]
    .filter(t => !readIds.has(t.id) && (t.unseen || t.at > seenAt)).length
  return fresh + unreadChats
}