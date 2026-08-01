# Этап 1 — Каркас-фундамент: внедрение ui-kit AppShell в Nexus

> Дизайн-спека. Одобрена Владом 2026-08-01 (вариант **A** — copy-in кита + доработка; акцент = фиолетовый логотипа Nexus).
> Часть большого трека «Nexus на единый ui-kit». Это **Этап 1** (фундамент), следующие этапы — отдельными спеками:
> чаты→канон · календарь (date/time-пикеры) · задачи/треки (кнопки/отступы/меню). Проекты-функционал — отдельный трек.

## Цель

Привести каркас Nexus (левое меню, мини-профиль, шапки страниц) к единому **ui-kit** экосистемы
(`megapolis-platform/ui-kit`) по модели **copy-in** (RULES §8: «копируй, не воссоздавай»), сведя токены и
перейдя на канон-шрифт **Steppe** — глобально и без переписывания каждой страницы. Богатые фичи Nexus
(правый чат-сайдбар, сворачивание сайдбара, департамент-модули, ErrorBoundary) **сохранить**, добавив
недостающее пропами в сам кит (не форк).

## Контекст: текущее состояние

- `AppShell.tsx` (610 стр., `components/`) — ролевая навигация (`USER_NAV`/`ADMIN_NAV`, системный аккаунт),
  сворачиваемый левый сайдбар (56/220), департамент-модули (RBAC) как доп. nav-пункты, **правый чат-сайдбар**
  (сворачиваемый `ChatsPage compact`), бейдж непрочитанного (`/chats/unread`), тема (`data-theme` + персист
  `/auth/me/theme`), свой `ProfilePanel`, `ErrorBoundary key={page}` с `pageLabel` (диагностика постмортема).
- Страницы рисуют **свой** верхний заголовок (`Eyebrow` + `<h2>`), иногда с табами/действиями.
- **Три токен-вокабуляра** сейчас:
  1. `index.css`: `--bg`, `--surface-1/-2/-3`, `--text-1/-2/-3`, `--text-muted`, `--accent-s/-e`, `--border`,
     `--success/--danger/--warning` — ими живут страницы (inline-styles).
  2. `styles/kit.css`: shadcn — `--background`, `--foreground`, `--card`, `--sidebar-*`, `--primary`, `--accent`,
     `--radius-*` — ими живут shadcn/Radix-компоненты.
- Кит принесёт 4-й: `tokens.css` — `--bg`, `--surface/-2/-3`, `--text`, `--muted`, `--accent`, `--accent-soft`,
  `--accent-line`, `--accent-contrast`, `--border-strong`, `--radius/-sm`, шрифт **Steppe** (fallback Inter),
  dark/light. Акцент кита по умолчанию — синий `#5b8cff`.

## Что делаем

### A. Токены + шрифт (глобально)

1. **Copy-in китового `tokens.css`** через `sync` в `apps/web/src/ui-kit/tokens.css`. Он — источник значений
   темы (dark/light) и шрифта.
2. **Шрифт Steppe:** скопировать 9 `.woff2` из `megapolis-platform/brand/fonts/steppe/` в `apps/web/public/fonts/steppe/`
   + `@font-face` (эталон — `steppe.css` из бренда). `--font-ui` уже в китовом tokens.css.
3. **Токен-мост (ключевое):** свести три вокабуляра к значениям кита **без правки страниц**. В `index.css`:
   - Токены-коллизии (`--bg`, `--border`, `--surface-2`, `--surface-3`) — **отдать киту** (убрать их прямые
     значения из `index.css`; определяет `tokens.css`).
   - Псевдонимы Nexus → кит: `--surface-1: var(--surface)`, `--text-1: var(--text)`, `--text-2: var(--muted)`,
     `--text-3: var(--muted)`, `--text-muted: var(--muted)`, `--accent-s: var(--accent)`. `--accent-e`/`--success`/
     `--warning`/`--danger` — оставить (или взять из кита `--danger`/`--closed`/`--new`).
   - В `styles/kit.css` (shadcn-слой): `--background: var(--bg)`, `--card: var(--surface)`, `--foreground: var(--text)`,
     `--muted-foreground: var(--muted)`, `--primary: var(--accent)`, `--sidebar-bg/-border/-foreground/…` →
     производные кита, `--border: var(--border)`. Так shadcn-компоненты тоже наследуют тему.
   - Порядок импортов в `index.css`/`main`: `@import 'tailwindcss'` → `@import './ui-kit/tokens.css'` → мост.
4. **Акцент Nexus:** `[data-accent="nexus"]` (или `:root` Nexus) `--accent` = фиолетовый бренда Nexus
   (`logos/nexus.svg` = `#3A0FA6→#4311AA`); для UI-читаемости на тёмном фоне взять **тот же тон, светлее**
   (подобрать на визуальной приёмке, ориентир ~`#7B61FF`), логотип-градиент не трогать. `--accent-soft/-line/
   -contrast` пересчитываются от `--accent` (в китовом tokens.css они через `color-mix`).

### B. AppShell — copy-in + доработка кита

1. **`sync` китового `AppShell.tsx`** и его зависимостей (Icon, Avatar, Sheet, ProfilePanel, Logo, navpieces,
   primitives) в `apps/web/src/ui-kit/` (через `ui-kit.config.json` + `scripts/sync.mjs`). Поставить зависимости
   кита (lucide-react и пр., см. ui-kit README).
2. **Доработка кита (в источнике `megapolis-platform/ui-kit`, затем `sync`; НЕ форк):** добавить в `AppShell`
   props под фичи Nexus, которых нет:
   - `rightPanel?: React.ReactNode` — слот справа от `main` (правый чат-сайдбар Nexus).
   - `collapsible?: boolean` + управление шириной сайдбара (десктоп) — сворачивание 56/220.
   - Обёртка контента в `ErrorBoundary` — либо принять `renderMain`/оставить ErrorBoundary на стороне Nexus
     (в `children`). **Решение:** ErrorBoundary остаётся в Nexus (оборачивает то, что кладём в `children`) —
     кит не завязываем на конкретный ErrorBoundary.
   Кит-версию поднять (`VERSION`/`CHANGELOG`), синкнуть.
3. **Мапинг Nexus → props кита** (в `AppShell.tsx` Nexus, который становится тонкой обёрткой над китовым):
   - `nav: NavEntry[]` ← `USER_NAV` (+ системный аккаунт скрывает часть) / `ADMIN_NAV` + департамент-модули
     (RBAC-гранты, чьи страницы не в USER_NAV) как доп. пункты. Иконки — lucide (уже используются).
   - `badge` пункта «Задачи» ← `unseenTasks`; чат-непрочитанное → бейдж на пункте/в правой панели (как сейчас).
   - `account` ← `{ name, role, email }` текущего юзера. `theme`/`onThemeChange` ← существующая мутация
     `/auth/me/theme` + `applyTheme`. `onReturnToNexus`/`onLogout` ← SSO (как сейчас).
   - `active` ← текущий `page` (`useState<Page>`, persist `localStorage('nexus:page')` — сохраняется).
   - `rightPanel` ← текущий блок правого чат-сайдбара (логику/подсчёт непрочитанного НЕ менять).
   - `toolbar`/`subtitle` ← действия/описание активной страницы (см. C).

### C. Шапки страниц

- Шапка каркаса (китовая) = название активного раздела (из `nav`) + опц. `subtitle` + слот `toolbar` (действия).
- Страницы **перестают** рисовать свой верхний заголовок (`Eyebrow`+`<h2>`). Действия страницы уходят в `toolbar`
  (через контекст/проп текущей страницы), внутристраничные контролы (табы/фильтры/подстраницы) **остаются в теле**.
- Механически: у каждой страницы убрать верхний title-блок; где есть действия шапки — прокинуть в `toolbar`.
  Табов внутри страниц (Задачи/Проекты) это не касается — они в контенте.

## Что НЕ трогаем (в этом этапе)

Логику чат-панели и подсчёта непрочитанного · персист темы · SSO · диагностический `ErrorBoundary` · содержимое
страниц (кроме удаления верхнего title-блока) · механику задач/канбана/календаря · чаты по сути (визуал-канон
чатов — **отдельный этап**) · date/time-пикеры календаря (**отдельный этап**).

## Границы MVP (YAGNI)

- Не переписываем страницы под токены кита — работает **мост** (алиасы). Точечные визуальные шероховатости от
  смены значений — правим по факту на приёмке, не заранее.
- Мобильную версию отдельно не проектируем — приходит из китового AppShell как есть.
- Проекты-функционал, чаты-канон, календарь-пикеры, задачи/треки-полировка — **следующие этапы**, не здесь.

## Проверка

- `node ui-kit/scripts/check.mjs` — скопированные компоненты совпадают с китом (после доработки+sync).
- typecheck (прямой `tsc -p apps/web`) + `pnpm --filter @nexus/web build` — зелёные.
- Визуальная приёмка (Влад): меню/мини-профиль/шапки/чат-панель/тема dark-light/акцент — на каждой странице
  (Главная, Задачи, Свод, Аналитика, Команда, Проекты, Настройки, Персонал, Календарь). Правило проекта RULES §11.

## Файлы (ориентир)

- `apps/web/ui-kit.config.json` (новый), `apps/web/src/ui-kit/*` (sync: tokens.css + AppShell + deps).
- `apps/web/src/index.css`, `apps/web/src/styles/kit.css` — токен-мост.
- `apps/web/public/fonts/steppe/*` + `@font-face`.
- `apps/web/src/components/AppShell.tsx` — тонкая обёртка над китовым AppShell (мапинг props).
- Страницы `apps/web/src/pages/*` — удаление верхнего title-блока + проброс `toolbar` (точечно).
- `megapolis-platform/ui-kit/components/AppShell.tsx` (+VERSION/CHANGELOG) — доработка (rightPanel/collapsible).
