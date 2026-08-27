import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

// Бейдж колокола: свежие записи ленты (новее localStorage-метки) + непрочитанные чаты.
// Отдельный модуль от панели — react-refresh требует компонентных файлов без хук-экспортов.

type NotifItem = { id: string; kind: 'task' | 'calendar' | 'request' | 'track'; text: string; at: string }
type NotifData = { tasks: NotifItem[]; events: NotifItem[]; requests?: NotifItem[]; tracks?: NotifItem[] }

export const NOTIF_SEEN_LS_KEY = 'nexus:notifications-seen-at'

export function useNotificationsBadge(unreadChats: number): number {
  const { data } = useQuery<NotifData>({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications').then(r => r.data),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })
  const seenAt = localStorage.getItem(NOTIF_SEEN_LS_KEY) ?? ''
  const fresh = [...(data?.tasks ?? []), ...(data?.requests ?? []), ...(data?.tracks ?? [])].filter(t => t.at > seenAt).length
  return fresh + unreadChats
}