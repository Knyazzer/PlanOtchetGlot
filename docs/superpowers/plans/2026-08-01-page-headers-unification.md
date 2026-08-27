# Единые шапки страниц (ui-kit Задача 5) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перенести контролы страниц (навигация/вкладки/поиск/фильтры) в китовую шапку AppShell через портал и убрать дублирующие внутристраничные шапки.

**Architecture:** Nexus кладёт DOM-цель в китовый проп `toolbar`; страницы телепортируют свои контролы в неё через `HeaderPortal` (контекст + `createPortal`). Кит НЕ трогаем. Состояние остаётся в странице. Подключается по странице за раз.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind v4, ui-kit AppShell (copy-in).

## Global Constraints

- Ветка `knyazzer`, локально. **Не пушить.** Коммиты по-русски, в конце `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Кит (`megapolis-platform/ui-kit`, `src/ui-kit/*`) в этой задаче НЕ меняем — только `apps/web/src/**`.
- Проверка каждого шага: `node "node_modules/typescript/bin/tsc" --noEmit -p apps/web/tsconfig.json` (0 ошибок) + `pnpm --filter @nexus/web build` (успех). Юнит-тестов на страницы в проекте нет — верификация визуальная в браузере (правило проекта).
- Железное правило попапов: закрытие по «клику вне» только если И `mousedown`, И `mouseup` на оверлее; Esc; ✕. Никогда `onClick={close}` на оверлее.
- Стейджить только явные пути своих файлов (в дереве возможен WIP параллельной сессии) — не `git add -A`.

---

### Task 1: Инфраструктура HeaderPortal

**Files:**
- Create: `apps/web/src/components/HeaderPortal.tsx`
- Modify: `apps/web/src/components/AppShell.tsx` (обёртка провайдера + цель в `toolbar`)

**Interfaces:**
- Produces:
  - `PageHeaderProvider` — React-провайдер; хранит DOM-цель шапки в state.
  - `HeaderSlotTarget` — компонент `<div>` с callback-ref, кладётся в китовый `toolbar`.
  - `HeaderPortal: ({ children }: { children: React.ReactNode }) => JSX.Element | null` — портал контролов в цель; `null`, пока цель не смонтирована.

- [ ] **Step 1: Создать `HeaderPortal.tsx`**

```tsx
import { createContext, useContext, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'

// Цель — правый слот китовой шапки (проп toolbar AppShell). Страницы телепортируют
// сюда свои контролы через <HeaderPortal>. Состояние/хэндлеры остаются в странице.
const HeaderSlotContext = createContext<HTMLElement | null>(null)

export function PageHeaderProvider({ children }: { children: React.ReactNode }) {
  // callback-ref через state → перерендер, когда <div> шапки смонтирован
  const [el, setEl] = useState<HTMLElement | null>(null)
  const setRef = useCallback((node: HTMLElement | null) => setEl(node), [])
  return (
    <HeaderSlotContext.Provider value={el}>
      {/* цель отдаётся наружу через контекст-функцию setRef на HeaderSlotTarget */}
      <SetRefContext.Provider value={setRef}>{children}</SetRefContext.Provider>
    </HeaderSlotContext.Provider>
  )
}

const SetRefContext = createContext<(node: HTMLElement | null) => void>(() => {})

/** Контейнер-цель для правого слота китовой шапки. Рендерится внутри toolbar AppShell. */
export function HeaderSlotTarget() {
  const setRef = useContext(SetRefContext)
  return <div ref={setRef} className="flex items-center gap-2" />
}

/** Телепортирует контролы страницы в правый слот китовой шапки. */
export function HeaderPortal({ children }: { children: React.ReactNode }) {
  const el = useContext(HeaderSlotContext)
  return el ? createPortal(children, el) : null
}
```

- [ ] **Step 2: Подключить провайдер и цель в `AppShell.tsx`**

В `AppShell.tsx`:
1. Импорт: `import { PageHeaderProvider, HeaderSlotTarget, HeaderPortal } from './HeaderPortal'`.
2. Обернуть весь возвращаемый `<KitAppShell>...</KitAppShell>` (в `return (<>...`) в `<PageHeaderProvider>`. Проще: обернуть содержимое `<main>`-детей И передать `toolbar` — оба под провайдером. Практично — обернуть весь фрагмент: `return (<PageHeaderProvider><>{/* KitAppShell + NotificationsPanel */}</></PageHeaderProvider>)`.
3. Передать в `KitAppShell` проп `toolbar={<HeaderSlotTarget />}` (рядом с `headerActions`).

- [ ] **Step 3: Проверить сборку**

Run: `node "node_modules/typescript/bin/tsc" --noEmit -p apps/web/tsconfig.json` → 0 ошибок.
Run: `pnpm --filter @nexus/web build` → успех.
Ожидаемо: правый слот шапки пуст (страницы ещё не портятся), приложение работает как раньше.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/HeaderPortal.tsx apps/web/src/components/AppShell.tsx
git commit -m "feat(header): инфраструктура HeaderPortal — контролы страниц в китовую шапку

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Команда — департамент + поиск в шапку

**Files:**
- Modify: `apps/web/src/pages/TeamPage.tsx` (убрать `<h1>Команда</h1>`, обернуть дропдаун департамента и поиск в `HeaderPortal`)

**Interfaces:**
- Consumes: `HeaderPortal` из Task 1.

- [ ] **Step 1: Найти шапку TeamPage**

Открыть `TeamPage.tsx` (~строки 640–700): там `<h1 ...>Команда</h1>`, дропдаун смены департамента и `<input placeholder="Поиск сотрудника…">`.

- [ ] **Step 2: Обернуть контролы в HeaderPortal, убрать h1**

- Импорт: `import { HeaderPortal } from '../components/HeaderPortal'`.
- Удалить строку `<h1 ...>Команда</h1>` (заголовок «Команда» даёт китовая шапка через `activeTop.label`).
- Дропдаун департамента + поиск сотрудника завернуть: `<HeaderPortal><div className="flex items-center gap-2">{/* департамент dropdown */}{/* search input */}</div></HeaderPortal>`.
- Удалить обёртку-полоску старой внутристраничной шапки, если после выноса она пустая. Стили контролов подогнать под тёмную шапку (компактная высота ~36px, `text-[13px]`), не менять логику `search`/`setSearch` и смены департамента.

- [ ] **Step 3: Проверить**

Run: `node "node_modules/typescript/bin/tsc" --noEmit -p apps/web/tsconfig.json` → 0.
Run: `pnpm --filter @nexus/web build` → успех.
Визуально: на «Команда» в шапке — название/дропдаун департамента + поиск; заголовок «Команда» из кита; дублирующей шапки нет; поиск подсвечивает, смена департамента работает.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/TeamPage.tsx
git commit -m "ui(team): департамент и поиск сотрудника — в китовую шапку; убран дубль-заголовок

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Задачи — вкладки Задачи/Треки в шапку

**Files:**
- Modify: `apps/web/src/pages/TasksPage.tsx` (перенести ряд вкладок Задачи/Треки в `HeaderPortal`; вид Доска/Таблица/Гант и группировка канбана остаются в контенте)

**Interfaces:**
- Consumes: `HeaderPortal` из Task 1.

- [ ] **Step 1: Найти контролы TasksPage**

`TasksPage.tsx` ~строки 108–123: переключатель вкладок `t` (`'tasks'|'tracks'`, рендерит «Задачи»/«Треки», строка ~113) и `SegmentedControl` вида (`view`: Доска/Таблица/Гант, ~строка 122) + группировка канбана (~123).

- [ ] **Step 2: Вынести только вкладки Задачи/Треки в шапку**

- Импорт `HeaderPortal`.
- Ряд-переключатель `[Задачи · Треки]` завернуть в `<HeaderPortal>…</HeaderPortal>` (стиль — компактный сегмент под тёмную шапку, `text-[13px]`). Логику смены `t` не менять.
- `SegmentedControl` (Доска/Таблица/Гант) и группировку канбана ОСТАВИТЬ в контенте страницы, как есть.
- Убрать пустую полоску старой шапки, если после выноса вкладок она осталась пустой.

- [ ] **Step 3: Проверить**

Run: `node "node_modules/typescript/bin/tsc" --noEmit -p apps/web/tsconfig.json` → 0.
Run: `pnpm --filter @nexus/web build` → успех.
Визуально: на «Задачи» в шапке — переключатель Задачи/Треки; в контенте — Доска/Таблица/Гант + группировка; заголовок «Задачи» из кита; всё переключается.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/TasksPage.tsx
git commit -m "ui(tasks): вкладки Задачи/Треки — в китовую шапку; вид/группировка остаются в контенте

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Слияние Аналитика + Свод

**Files:**
- Modify: `apps/web/src/pages/AnalyticsPage.tsx` (внутренние вкладки `[Аналитика | Свод]`, рендер `SvodPage` под «Свод», переключатель в `HeaderPortal`)
- Modify: `apps/web/src/components/AppShell.tsx` (убрать `svod` из `USER_NAV`, `type Page`, ветки рендера)

**Interfaces:**
- Consumes: `HeaderPortal` из Task 1; существующий `SvodPage` (default export) из `../pages/SvodPage`.
- Produces: единый пункт меню `analytics`, вкладка Свод внутри.

- [ ] **Step 1: Внутренние вкладки в AnalyticsPage**

В `AnalyticsPage.tsx`:
- Импорт: `import SvodPage from './SvodPage'` и `import { HeaderPortal } from '../components/HeaderPortal'`.
- Добавить state: `const [subTab, setSubTab] = useState<'analytics'|'svod'>(() => (localStorage.getItem('nexus:analytics-tab') as 'analytics'|'svod') || 'analytics')`. При смене — писать в `localStorage`.
- В `HeaderPortal` — переключатель `[Аналитика · Свод]` (компактный сегмент под тёмную шапку).
- Рендер: `{subTab === 'analytics' ? (/* существующий контент аналитики */) : <SvodPage />}`. Существующий JSX аналитики обернуть в условие/фрагмент, не меняя его логики.

- [ ] **Step 2: Убрать пункт «Свод» из меню и роутинга**

В `AppShell.tsx`:
- Удалить `{ id: 'svod', label: 'Свод', icon: … }` из `USER_NAV`.
- Убрать `'svod'` из `type Page`.
- Удалить ветку `{page === 'svod' && <SvodPage />}` из рендера `<main>` (Свод теперь внутри Analytics). Убрать теперь-неиспользуемый импорт `SvodPage` в AppShell, если он был.

- [ ] **Step 3: Проверить**

Run: `node "node_modules/typescript/bin/tsc" --noEmit -p apps/web/tsconfig.json` → 0.
Run: `pnpm --filter @nexus/web build` → успех.
Визуально: в меню один пункт «Аналитика» (без «Свод»); внутри — переключатель Аналитика/Свод в шапке; обе вкладки работают; выбор вкладки переживает F5.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/AnalyticsPage.tsx apps/web/src/components/AppShell.tsx
git commit -m "ui(analytics): слияние Свод в Аналитику как внутреннюю вкладку; переключатель в шапке

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Календарь — контролы в шапку + поповер «Календари»

**Files:**
- Modify: `apps/web/src/pages/CalendarPage.tsx` (нав/вид/«Сегодня» → `HeaderPortal`; левый сайдбар категорий → поповер «Календари»)
- Create: `apps/web/src/pages/calendar/CalendarsPopover.tsx` (поповер-чеклист вкл/выкл)

**Interfaces:**
- Consumes: `HeaderPortal` из Task 1; существующие `visible`, `toggleCat`, `MY_CATS`, `HR_CATS`, `SidebarSection` из CalendarPage.
- Produces: `CalendarsPopover` — панель-чеклист, принимает `{ groups, visible, onToggle, onSetAll }`.

- [ ] **Step 1: Вынести нав/вид/«Сегодня» в шапку**

В `CalendarPage.tsx` (~строки 200–225: `Сегодня`, стрелки навигации, кнопки вида месяц/неделя/день, заголовок периода):
- Импорт `HeaderPortal`.
- Завернуть в `<HeaderPortal>`: `[Сегодня]`, стрелки `[‹ ›]`, заголовок текущего периода (`monthLabel`/аналог), сегмент вида `[Месяц·Неделя·День]`, и кнопку `[Календари ▾]` (Step 3). Стиль компактный под тёмную шапку.
- Логику `view`/`cursor`/`setView`/навигации не менять.

- [ ] **Step 2: Создать `CalendarsPopover.tsx`**

```tsx
import { useState, useRef } from 'react'

type Cat = { id: string; label: string; color: string }
type Group = { label: string; cats: Cat[] }

export function CalendarsPopover({
  groups, visible, onToggle, onSetAll, onClose,
}: {
  groups: Group[]
  visible: Record<string, boolean>
  onToggle: (id: string) => void
  onSetAll: (on: boolean) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  // Железное правило попапов: закрытие только если mousedown И mouseup на оверлее.
  const downOnOverlay = useRef(false)
  const ql = q.trim().toLowerCase()
  return (
    <div
      onMouseDown={(e) => { downOnOverlay.current = e.target === e.currentTarget }}
      onMouseUp={(e) => { if (downOnOverlay.current && e.target === e.currentTarget) onClose(); downOnOverlay.current = false }}
      className="fixed inset-0 z-50"
    >
      <div className="absolute right-4 top-14 w-72 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-2 shadow-xl">
        <div className="mb-2 flex items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск календаря…"
            className="flex-1 rounded-[var(--radius-sm)] bg-[var(--surface-2)] px-2 py-1.5 text-[13px] outline-none" />
          <button onClick={onClose} aria-label="Закрыть" className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-[var(--muted)] hover:bg-[var(--surface-2)]">✕</button>
        </div>
        <div className="mb-1 flex gap-2 px-1 text-[11px]">
          <button onClick={() => onSetAll(true)} className="text-[var(--accent)]">Выбрать все</button>
          <button onClick={() => onSetAll(false)} className="text-[var(--muted)]">Снять все</button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {groups.map((g) => {
            const cats = g.cats.filter((c) => c.label.toLowerCase().includes(ql))
            if (!cats.length) return null
            return (
              <div key={g.label} className="mb-2">
                <div className="eyebrow px-1 pb-1">{g.label}</div>
                {cats.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-[13px] hover:bg-[var(--surface-2)]">
                    <input type="checkbox" checked={!!visible[c.id]} onChange={() => onToggle(c.id)} />
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                    <span className="flex-1 truncate">{c.label}</span>
                  </label>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

> ✕ — временный текст-глиф; при желании заменить на lucide `X` через китовый `Icon` (правило кита — только SVG). Не блокер для этой задачи.

- [ ] **Step 3: Подключить поповер, удалить левый сайдбар**

В `CalendarPage.tsx`:
- state: `const [calsOpen, setCalsOpen] = useState(false)`.
- В `HeaderPortal` добавить кнопку `[Календари ▾]` → `onClick={() => setCalsOpen(v => !v)}`.
- Рендерить `{calsOpen && <CalendarsPopover groups={[{label:'Мои календари', cats: MY_CATS}, {label:'HR статусы', cats: HR_CATS}]} visible={visible} onToggle={toggleCat} onSetAll={(on) => /* массово выставить visible для всех cat.id */} onClose={() => setCalsOpen(false)} />}`. Реализовать `onSetAll`, проставляя `visible` для всех id из `MY_CATS`+`HR_CATS`.
- Удалить левый `<aside>` с `SidebarSection` (МОИ КАЛЕНДАРИ / HR СТАТУСЫ); сетка (`MonthView`/`WeekView`/`DayView`) занимает всю ширину. Если `SidebarSection` больше нигде не используется — удалить компонент.

- [ ] **Step 4: Проверить**

Run: `node "node_modules/typescript/bin/tsc" --noEmit -p apps/web/tsconfig.json` → 0.
Run: `pnpm --filter @nexus/web build` → успех.
Визуально: на «Календарь» в шапке — Сегодня/навигация/период/вид/Календари; сетка на всю ширину; поповер «Календари» вкл/выкл категорий работает; закрывается по клику-вне (mousedown+mouseup на оверлее), Esc не обязателен, ✕ работает; левого сайдбара нет.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/CalendarPage.tsx apps/web/src/pages/calendar/CalendarsPopover.tsx
git commit -m "ui(calendar): контролы вида/навигации — в шапку; сайдбар категорий → поповер «Календари»

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

- **Покрытие спеки:** механизм (Task 1) ✓; Команда (2) ✓; Задачи (3) ✓; Аналитика+Свод (4) ✓; Календарь+поповер (5) ✓; Главная/Кабинет/Проекты — вне скоупа, не трогаем ✓.
- **Плейсхолдеры:** конкретный код у HeaderPortal и CalendarsPopover; для страниц — перенос существующих контролов (референс по строкам), т.к. переписывать логику нельзя, только релокация в портал.
- **Согласованность типов:** `HeaderPortal`/`HeaderSlotTarget`/`PageHeaderProvider` из Task 1 используются во 2–5 под теми же именами; `SvodPage` — default export.
- **Esc в поповере:** опционален (правило требует mousedown+mouseup на оверлее + ✕; Esc — плюсом, можно добавить `useEffect` на keydown при желании, не блокер).
