# Внедрение ui-kit AppShell в Nexus (Этап 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) или superpowers:executing-plans — по задачам. Шаги — чекбоксы `- [ ]`.

**Goal:** Перевести каркас Nexus (левое меню, мини-профиль, шапки страниц) на единый ui-kit `AppShell` по модели copy-in, свести токены и перейти на шрифт Steppe — глобально, сохранив богатые фичи Nexus (правый чат-сайдбар, сворачивание, департамент-модули, ErrorBoundary).

**Architecture:** Copy-in китового `AppShell` + `tokens.css` (`sync`); токен-мост (алиасы имён Nexus → значения кита) — страницы не переписываем; недостающие фичи добавляем **пропами в сам кит** (rightPanel/collapsible) и синкаем; `components/AppShell.tsx` Nexus становится тонкой обёрткой-мапером.

**Tech Stack:** React 18 + Vite + Tailwind v4, ui-kit (`megapolis-platform/ui-kit`, copy-in), lucide-react, Steppe woff2.

**Спека:** [../specs/2026-08-01-uikit-appshell-foundation-design.md](../specs/2026-08-01-uikit-appshell-foundation-design.md)

## Global Constraints

- **Модель copy-in (RULES §8):** компоненты кита приносить `scripts/sync.mjs`, НЕ воссоздавать. Недостающий проп → дорабатывать кит в источнике `megapolis-platform/ui-kit`, затем `sync` (не форк). Перед завершением — `scripts/check.mjs` чист.
- **Тест-раннера для визуала нет.** Верификация каждой задачи = прямой `tsc` (`node "node_modules/typescript/bin/tsc" --noEmit -p apps/web/tsconfig.json`, 0 ошибок) + `pnpm --filter @nexus/web build` (успех) + **визуальная сверка в браузере** (RULES §11). Существующие web-тесты (4) — держать зелёными.
- **Акцент Nexus = фиолетовый логотипа** (`#3A0FA6→#4311AA`), для UI-читаемости на тёмном — светлее того же тона (ориентир `#7B61FF`, финально — на приёмке). Логотип-градиент не трогать.
- **НЕ трогать:** логику чат-панели/подсчёта непрочитанного, персист темы (`/auth/me/theme`), SSO, диагностический ErrorBoundary, содержимое страниц (кроме удаления верхнего title-блока), механику задач/канбана/календаря, чаты-по-сути, date/time-пикеры.
- **Git:** Nexus — ветка `knyazzer`; кит `megapolis-platform` — свой репо, перед правкой `git pull`, после — commit+push по его CONTRIBUTING. Коммиты по-русски, последняя строка: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Стейджить явные пути.
- **Nexus токены (3 вокабуляра):** `index.css` (`--bg/--surface-1..3/--text-1..3/--text-muted/--accent-s/-e/--border`), `styles/kit.css` (shadcn `--background/--card/--sidebar-*/--primary/--accent`), кит `tokens.css` (`--bg/--surface/-2/-3/--text/--muted/--accent/--accent-soft/-line/-contrast/--border-strong`, шрифт `--font-ui: Steppe`).

---

## Task 1: ui-kit config + sync tokens.css + шрифт Steppe

**Files:**
- Create: `apps/web/ui-kit.config.json`
- Create (sync): `apps/web/src/ui-kit/tokens.css`
- Create: `apps/web/public/fonts/steppe/*.woff2` (копия из `../../megapolis-platform/brand/fonts/steppe/`)
- Modify: `apps/web/src/index.css` (импорт tokens.css + @font-face Steppe)

**Interfaces:**
- Produces: доступны CSS-переменные кита (`--surface`, `--text`, `--accent-soft` и т.д.) и `--font-ui: 'Steppe'…`; шрифт Steppe грузится. Литеральный свап каркаса — позже (Task 4).

- [ ] **Step 1: `ui-kit.config.json`**

```json
{
  "source": "../../megapolis-platform/ui-kit",
  "dest": "src/ui-kit",
  "components": ["AppShell"],
  "tokens": true,
  "forked": []
}
```
(`AppShell` подтянет зависимости: Icon/Avatar/Sheet/ProfilePanel/Logo/navpieces/primitives. `tokens:true` — принесёт `tokens.css`.)

- [ ] **Step 2: Прогнать sync**

Run: `node ../../megapolis-platform/ui-kit/scripts/sync.mjs` (из `apps/web`). Ожидается: в `apps/web/src/ui-kit/` появились `tokens.css`, `AppShell.tsx` + зависимости.
> Если sync ругается на отсутствующие peer-deps (lucide-react и пр.) — доставить по README кита: `pnpm --filter @nexus/web add lucide-react` (уже есть) и др. недостающие.

- [ ] **Step 3: Скопировать шрифт Steppe + @font-face**

Скопировать 9 `.woff2` из `../../megapolis-platform/brand/fonts/steppe/` в `apps/web/public/fonts/steppe/`. В `apps/web/src/index.css` в самый верх добавить `@font-face` блоки (по эталону `brand/fonts/steppe/steppe.css`; `src: url('/fonts/steppe/<name>.woff2')`). Плюс импорт токенов кита ПОСЛЕ tailwind:
```css
@import './ui-kit/tokens.css';
```
(проверить фактический порядок: tailwind подключается в `index.css`/через Vite; tokens.css — после него.)

- [ ] **Step 4: Verify — build + шрифт**

Run: `pnpm --filter @nexus/web build` → успех. Запустить dev (`pnpm --filter @nexus/web dev`), открыть — приложение работает на старом каркасе, но в DevTools `getComputedStyle(document.body).fontFamily` содержит `Steppe`, а `--surface`/`--accent-soft` определены. (Старые страницы пока по своим токенам — мост в Task 2.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/ui-kit.config.json apps/web/src/ui-kit apps/web/public/fonts/steppe apps/web/src/index.css
git commit -m "ui-kit: sync tokens.css + шрифт Steppe (фундамент, без свапа каркаса)"
```

---

## Task 2: Токен-мост (страницы наследуют тему кита)

**Files:**
- Modify: `apps/web/src/index.css` (токен-блок `:root`/`[data-theme]`)
- Modify: `apps/web/src/styles/kit.css` (shadcn-токены)

**Interfaces:**
- Consumes: кит-токены из Task 1 (`--surface`, `--text`, `--muted`, `--accent`, …).
- Produces: имена токенов Nexus (`--surface-1/-2/-3`, `--text-1/-2/-3`, `--bg`, `--border`, `--accent-s`; shadcn `--background/--card/--sidebar-*/--primary`) резолвятся в значения кита. `[data-accent="nexus"]` задаёт фиолетовый акцент.

- [ ] **Step 1: Переписать токен-блок `index.css` в алиасы кита**

Заменить прямые значения в `:root, [data-theme="dark"]` и `[data-theme="light"]` на алиасы (значения даёт `tokens.css` кита):
```css
:root, [data-theme="dark"], [data-theme="light"] {
  /* мост: имена Nexus → значения кита (tokens.css). --bg/--border/--surface-2/-3 определяет кит. */
  --surface-1: var(--surface);
  --text-1: var(--text);
  --text-2: var(--muted);
  --text-3: var(--muted);
  --text-muted: var(--muted);
  --accent-s: var(--accent);
  --accent-e: var(--danger);   /* градиент-конец — берём danger кита или оставить #E8194B */
  --success: var(--closed, #29BF12);
  --warning: var(--new, #F59E0B);
  --danger: var(--danger);
}
```
Убрать из `index.css` прямые определения `--bg`, `--border`, `--surface-2`, `--surface-3` (их определяет `tokens.css` кита — избежать коллизии/двойного значения). `--accent-e` для градиента «акцент→красный» — оставить `#E8194B` если он используется как есть.

- [ ] **Step 2: Мост shadcn-слоя в `styles/kit.css`**

Значения shadcn-токенов заменить на алиасы кита (чтобы shadcn/Radix-компоненты тоже наследовали):
```css
--background: var(--bg);
--foreground: var(--text);
--card: var(--surface);
--card-foreground: var(--text);
--muted: var(--surface-2);
--muted-foreground: var(--muted-token, var(--muted));
--primary: var(--accent);
--primary-foreground: var(--accent-contrast);
--border: var(--border);
--radius: var(--radius);
/* сайдбар — тёмный канон кита: */
--sidebar-bg: var(--surface); --sidebar-border: var(--border);
--sidebar-foreground: var(--text); --sidebar-muted: var(--muted);
--sidebar-accent-foreground: var(--accent);
```
> Аккуратно с самоссылками (`--muted: var(--surface-2)` vs кит `--muted`): если имя совпадает, не создавать цикл — при коллизии переименовать локально. Проверить в браузере, что цвета применились, а не «сломались в чёрное».

- [ ] **Step 3: Акцент Nexus**

В `index.css` (или `kit.css`) добавить фиолетовый акцент Nexus поверх кита:
```css
:root { --accent: #7B61FF; }            /* фиолетовый тон логотипа Nexus, UI-читаемый на тёмном */
[data-theme="light"] { --accent: #5B3FE0; }
```
(`--accent-soft/-line/-contrast` в китовом tokens.css пересчитываются от `--accent` через `color-mix` — подхватят.)

- [ ] **Step 4: Verify — build + визуальная сверка темы**

Run: `pnpm --filter @nexus/web build` → успех. Dev: открыть 4-5 разных страниц (Задачи/Свод/Проекты/Настройки/Команда) в dark и light — фон/поверхности/текст/акцент когерентны (фиолетовый акцент, шрифт Steppe), ничего не «провалилось в чёрное/белое». Точечные шероховатости записать, править по факту (не в этой задаче, если не критично).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/index.css apps/web/src/styles/kit.css
git commit -m "ui-kit: токен-мост — страницы Nexus наследуют тему кита + фиолетовый акцент"
```

---

## Task 3: Доработка китового AppShell (rightPanel + collapsible) + sync

**Files:**
- Modify: `megapolis-platform/ui-kit/components/AppShell.tsx` (в репо кита)
- Modify: `megapolis-platform/ui-kit/VERSION`, `megapolis-platform/ui-kit/CHANGELOG.md`
- Re-sync: `apps/web/src/ui-kit/AppShell.tsx`

**Interfaces:**
- Produces: китовый `AppShell` получает 2 новых опциональных пропа:
  - `rightPanel?: React.ReactNode` — рендерится справа от `<main>` (десктоп), для правого чат-сайдбара.
  - `collapsible?: boolean` (default false) + внутреннее состояние сворачивания левого сайдбара (кнопка-стрелка в шапке сайдбара, ширина 60↔~14 rem).
  Существующие пропы не меняются (аддитивно, не ломает support-mediacenter).

- [ ] **Step 1: `git pull` в ките**

Run: `cd megapolis-platform && git pull` (правило CONTRIBUTING — перед правкой).

- [ ] **Step 2: Добавить `rightPanel` слот**

В `AppShell.tsx` (в блоке основной области, после `<main>` в `<div className="flex min-w-0 flex-1 flex-col">` — вынести `main` и `rightPanel` в горизонтальный флекс):
```tsx
// было: <main …>{children}</main>
// стало:
<div className="flex min-w-0 flex-1 overflow-hidden">
  <main className="flex-1 overflow-y-auto overflow-x-hidden pb-[…] md:pb-0">{children}</main>
  {rightPanel && <div className="hidden shrink-0 md:block">{rightPanel}</div>}
</div>
```
Добавить `rightPanel?: React.ReactNode` в пропы + JSDoc.

- [ ] **Step 3: Добавить `collapsible` сворачивание**

Добавить проп `collapsible?: boolean` и `const [collapsed, setCollapsed] = useState(false)`. У `<aside>` десктоп-сайдбара ширину сделать `collapsed ? 'w-14' : 'w-60'`, в шапке сайдбара — кнопку-тоггл (иконка `PanelLeftClose`/`PanelLeft` из lucide) видимую при `collapsible`. При `collapsed` прятать текст пунктов (только иконки), лого — компактный. Поведение при `!collapsible` — как раньше (фикс w-60).
> Держать чисто (не раздувать): свёрнутый режим — иконки-only, tooltip по `title`.

- [ ] **Step 4: Bump версии + CHANGELOG + sync**

Поднять patch/minor в `VERSION`, дописать строку в `CHANGELOG.md` («AppShell: rightPanel slot + collapsible»). Затем из `apps/web`: `node ../../megapolis-platform/ui-kit/scripts/sync.mjs` — обновит `apps/web/src/ui-kit/AppShell.tsx`.

- [ ] **Step 5: Verify**

Run: `node ../../megapolis-platform/ui-kit/scripts/check.mjs` (из apps/web) → скопированный AppShell совпадает с китом. `pnpm --filter @nexus/web build` → успех (новые пропы опциональны, старый Nexus-каркас ещё используется — сборка не падает).

- [ ] **Step 6: Commit (два репо)**

```bash
# кит
cd megapolis-platform && git add ui-kit/components/AppShell.tsx ui-kit/VERSION ui-kit/CHANGELOG.md && git commit -m "AppShell: rightPanel slot + collapsible (аддитивно)" && git push
# nexus
cd ../PlanOtchetGlot && git add apps/web/src/ui-kit/AppShell.tsx && git commit -m "ui-kit: re-sync AppShell (rightPanel + collapsible)"
```

---

## Task 4: Свап Nexus AppShell на китовый (мапинг props)

**Files:**
- Modify: `apps/web/src/components/AppShell.tsx` (переписать как обёртку над `src/ui-kit/AppShell`)

**Interfaces:**
- Consumes: китовый `AppShell` (Task 3) с `rightPanel`/`collapsible`; токен-мост (Task 2).
- Produces: рабочий каркас — все страницы доступны, левое меню/мини-профиль/шапка из кита, правый чат-сайдбар и департамент-модули сохранены.

- [ ] **Step 1: Собрать `nav: NavEntry[]` из Nexus-конфигов**

В `components/AppShell.tsx`: маппер `USER_NAV`/`ADMIN_NAV` (+ департамент-модули из access-грантов, чьи `page` не в USER_NAV) → массив `NavEntry {key:id, label, icon, badge?}`. Роли: системный аккаунт скрывает часть (как сейчас), admin-пункты только админу. Бейдж «Задачи» ← `unseenTasks`.

- [ ] **Step 2: Рендер китового AppShell с мапингом**

Заменить весь JSX-рендер старого каркаса на:
```tsx
import { AppShell as KitAppShell } from '../ui-kit/AppShell'
// …
return (
  <KitAppShell
    product={{ name: 'Nexus', markSrc: nexusLogoSrc, company: 'Megapolis' }}
    nav={navEntries}
    active={page}
    onNavigate={(k) => navigateTo(k as Page)}
    account={{ name: user.name, role: roleLabel, email: user.email }}
    theme={theme}
    onThemeChange={(t) => toggleTheme.mutate(t)}
    onLogout={handleLogout}
    onReturnToNexus={undefined}       /* Nexus сам себе Nexus — без кнопки */
    collapsible
    profileExtra={<NexusProfileExtra />}  /* инвентаризация и пр. продуктовое из старого ProfilePanel */
    rightPanel={<ChatRightPanel …/>}  /* существующий блок правого чат-сайдбара, логику не менять */
    subtitle={pageSubtitle}
    toolbar={pageToolbar}
  >
    <ErrorBoundary key={page} pageLabel={navLabel(page)}>
      {renderPage(page)}
    </ErrorBoundary>
  </KitAppShell>
)
```
Правый чат-сайдбар (`ChatRightPanel`) — вынести существующий JSX/логику (chatOpen, unread, ChatsPage compact) в локальный компонент как есть. `profileExtra` — перенести продуктовые пункты из Nexus `ProfilePanel` (инвентаризация/переходы); тему и «Выйти» даёт кит.

- [ ] **Step 3: Убрать мёртвое после свапа**

Удалить из `components/AppShell.tsx` старый рендер сайдбара/шапки/нижней навигации/`NavBtn`, ставшие ненужными после свапа (то, что теперь даёт кит). Старый `ProfilePanel` Nexus — если полностью замещён китовым (в китовом AppShell свой ProfilePanel) — убрать импорт/использование, продуктовое ушло в `profileExtra`.

- [ ] **Step 4: Verify — build + полный визуальный проход**

`tsc` (прямой) 0 ошибок + `pnpm --filter @nexus/web build` успех. Dev: пройти ВСЕ пункты меню (Главная/Кабинет/Календарь/Задачи/Свод/Аналитика/Проекты/Команда/Персонал/Списки/Настройки) — рендерятся; мини-профиль открывается (тема-тоггл, выход, продуктовые пункты); правый чат-сайдбар открывается/сворачивается, непрочитанное считается; сворачивание левого сайдбара работает; dark/light. Web-тесты 4/4.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/AppShell.tsx
git commit -m "ui-kit: свап каркаса Nexus на китовый AppShell (nav/профиль/тема/чат-панель/департамент-модули)"
```

---

## Task 5: Стандартизация шапок страниц

**Files:**
- Create: `apps/web/src/lib/pageChrome.tsx` (контекст toolbar/subtitle страницы)
- Modify: `apps/web/src/components/AppShell.tsx` (прокинуть toolbar/subtitle из контекста)
- Modify: страницы с верхним title-блоком: `AnalyticsPage`, `ListsPage`, `SettingsPage`, `SvodPage`, `TeamPage`, `PersonalCabinetPage` (+ проверить ProjectCard/Projects — там title может быть контентным)

**Interfaces:**
- Consumes: китовые `toolbar`/`subtitle` слоты (Task 4).
- Produces: единый механизм — страница объявляет заголовок раздела (уже есть в nav), опц. `subtitle` и `toolbar` (действия) через контекст `usePageChrome`; свой верхний title-блок больше не рисует.

- [ ] **Step 1: Контекст `pageChrome`**

Создать `lib/pageChrome.tsx`: `PageChromeProvider` со стейтом `{ subtitle?: ReactNode; toolbar?: ReactNode }` + хук `usePageChrome()` (сеттер) для страниц и `usePageChromeValue()` для AppShell. Провайдер оборачивает всё в `App.tsx`/AppShell.

- [ ] **Step 2: AppShell читает chrome**

В `components/AppShell.tsx` брать `subtitle`/`toolbar` из `usePageChromeValue()` и передавать в китовый AppShell. Сбрасывать при смене `page`.

- [ ] **Step 3: Убрать верхние title-блоки со страниц**

На каждой из перечисленных страниц удалить ВЕРХНИЙ блок заголовка раздела (`<Eyebrow>…</Eyebrow>` + `<h2 …>Название</h2>` в самом верху), т.к. заголовок теперь в шапке каркаса. **Осторожно:** не трогать внутриконтентные `<h2>` (заголовки секций/карточек) — только верхний page-title. Где у страницы есть действия-в-шапке (например кнопка «+» / переключатель) — перенести их в `usePageChrome({ toolbar: … })` в `useEffect`.
> Для страниц, где верхнего title-блока нет или он контентный (ProjectCard, ProjectsKanban, StructureTab) — НЕ трогать, только подтвердить, что их `<h2>` контентные.

- [ ] **Step 4: Verify**

`tsc` + build. Dev: на каждой странице шапка каркаса показывает имя раздела; дубля заголовка нет; где были действия-в-шапке — они в toolbar каркаса; контентные заголовки секций на месте.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/pageChrome.tsx apps/web/src/components/AppShell.tsx apps/web/src/pages
git commit -m "ui-kit: единые шапки страниц через китовый toolbar/subtitle (убраны дубль-заголовки)"
```

---

## Task 6: check.mjs + финальная визуальная приёмка

**Files:** (правки по факту приёмки — точечные)

- [ ] **Step 1: `check.mjs`** — из `apps/web`: `node ../../megapolis-platform/ui-kit/scripts/check.mjs` → все скопированные компоненты совпадают с китом (расхождение = кто-то правил копию — починить через доработку кита + sync).
- [ ] **Step 2: Полная визуальная приёмка** (RULES §11) — dark+light, все страницы меню; акцент-фиолетовый, Steppe, отступы шапок, мини-профиль, чат-панель. Список шероховатостей — записать.
- [ ] **Step 3: Точечные фиксы** визуальных шероховатостей от смены токенов/шрифта (например, где страница хардкодила старый hex вместо переменной — заменить на переменную; где отступ поехал — поправить). Каждый фикс — по факту, минимально.
- [ ] **Step 4: Verify** — `tsc` + build + web-тесты 4/4 зелёные.
- [ ] **Step 5: Commit** — `git commit -m "ui-kit: финальная визуальная приёмка каркаса — точечные фиксы"`.

---

## Self-Review

**Spec coverage:** §A токены+шрифт → Task 1+2 ✓ · §B AppShell copy-in+доработка → Task 3+4 ✓ · §C шапки → Task 5 ✓ · акцент-фиолетовый → Task 2 ✓ · сохранить чат/сворачивание/ErrorBoundary/дептмодули → Task 3+4 ✓ · check.mjs+приёмка → Task 6 ✓. Границы MVP (не переписываем страницы, мобилку не проектируем, чаты/календарь/задачи — отдельно) — соблюдены.

**Placeholder scan:** кода-заглушек нет; «подобрать оттенок на приёмке», «править шероховатости по факту» — осознанные пункты визуальной приёмки, не пробелы. Token-мост и мапинг-пропы даны конкретно; финальные значения токенов сверяются в браузере (природа задачи — визуальная).

**Type consistency:** `NavEntry{key,label,icon,badge}` (кит) ← `NavItem{id,label,icon}` (Nexus) — мапинг в Task 4; `rightPanel`/`collapsible` определены в Task 3, используются в Task 4; `usePageChrome`/`usePageChromeValue` — Task 5.

## Порядок выполнения

Task 1 (токены+шрифт) → 2 (мост) → 3 (доработка кита) → 4 (свап каркаса) → 5 (шапки) → 6 (приёмка). Каждая — отдельный коммит; проверка typecheck+build+визуал; кит-правки — с push в его репо.
