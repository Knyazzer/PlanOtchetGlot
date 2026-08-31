import { create } from 'zustand'

// Глобальные тосты — микро-уведомления сверху по центру для успешных/неочевидных действий.
// Вызов из любого места: toast('Сохранено') / toast('Задача отправлена: Иван', 'sent').
export type ToastTone = 'success' | 'info' | 'sent'
export interface ToastItem { id: number; message: string; tone: ToastTone }

interface ToastState {
  toasts: ToastItem[]
  push: (message: string, tone?: ToastTone, ttl?: number) => void
  remove: (id: number) => void
}

let seq = 0
const TTL = 2600

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (message, tone = 'success', ttl = TTL) => {
    const id = ++seq
    set(s => ({ toasts: [...s.toasts, { id, message, tone }] }))
    setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), ttl)
  },
  remove: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}))

/** Показать тост из любого места (без React-хука). ttl — время жизни в мс (по умолчанию 2600). */
export const toast = (message: string, tone?: ToastTone, ttl?: number) => useToastStore.getState().push(message, tone, ttl)
