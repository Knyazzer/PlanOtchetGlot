import { createContext, useContext, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'

// Правый слот китовой шапки (проп toolbar AppShell). Страницы телепортируют сюда свои контролы
// через <HeaderPortal> — состояние и хэндлеры остаются в странице, вверх уходит только разметка.
// Кит не трогаем: цель просто кладётся в существующий toolbar-слот.

type Ctx = { el: HTMLElement | null; setEl: (node: HTMLElement | null) => void }
const HeaderSlotContext = createContext<Ctx>({ el: null, setEl: () => {} })

export function PageHeaderProvider({ children }: { children: React.ReactNode }) {
  // callback-ref через state → перерендер, когда <div> шапки смонтирован/размонтирован
  const [el, setElState] = useState<HTMLElement | null>(null)
  const setEl = useCallback((node: HTMLElement | null) => setElState(node), [])
  return <HeaderSlotContext.Provider value={{ el, setEl }}>{children}</HeaderSlotContext.Provider>
}

/** Контейнер-цель для правого слота китовой шапки. Рендерится внутри toolbar AppShell. */
export function HeaderSlotTarget() {
  const { setEl } = useContext(HeaderSlotContext)
  return <div ref={setEl} className="flex items-center gap-2" />
}

/** Телепортирует контролы страницы в правый слот китовой шапки (null, пока цель не смонтирована). */
export function HeaderPortal({ children }: { children: React.ReactNode }) {
  const { el } = useContext(HeaderSlotContext)
  return el ? createPortal(children, el) : null
}