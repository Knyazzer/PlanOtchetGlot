# Платформенный флаг `canAccessPlatform` — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Точечно впускать выбранных не-админов внутрь Nexus по флагу из карточки Персонала (как доступ к Инвентаризации); починить SSO-переход в Инвентаризацию из сайдбара AppShell.

**Architecture:** Новый булев `User.canAccessPlatform` (близнец `canAccessInventory`). Бэкенд: колонка + проброс в `/auth/me` и `PATCH /users/:id`. Фронт: гейт в `App.tsx` пускает админов и обладателей флага; тоггл в карточке Персонала; общий SSO-хелпер для внешних модулей.

**Tech Stack:** Prisma (PostgreSQL, мультисхема `nexus`), Fastify, Vitest, React + Zustand + TanStack Query, Supabase Auth.

**Спека:** [docs/superpowers/specs/2026-06-15-platform-access-flag-design.md](../specs/2026-06-15-platform-access-flag-design.md)

**Ветка:** работаем в `knyazzer` (не коммитим в `master`/`rebuild-v4`).

---

## Структура файлов

| Файл | Что меняется |
|------|--------------|
| `packages/db/prisma/schema.prisma` | +поле `canAccessPlatform` в модели `User` |
| `packages/db/prisma/migrations/<ts>_add_can_access_platform/` | новая миграция (создаётся Prisma) |
| `apps/api/src/plugins/auth.ts` | `canAccessPlatform` в `select` + `request.user` |
| `apps/api/src/routes/auth.ts` | `canAccessPlatform` в `select` `/auth/me` |
| `apps/api/src/routes/users.ts` | `USER_SELECT` + Zod-схема и `data` `PATCH /users/:id` |
| `apps/api/src/routes/users.test.ts` | **новый** — тест PATCH флага + гард |
| `apps/web/src/stores/auth.ts` | поле `canAccessPlatform` в `AuthUser` |
| `apps/web/src/App.tsx` | гейт: `isAdmin || canAccessPlatform` |
| `apps/web/src/lib/sso.ts` | +`openInventoryWithSession()` |
| `apps/web/src/pages/PersonalCabinetPage.tsx` | `goToInventory` → общий хелпер |
| `apps/web/src/components/AppShell.tsx` | клик по `ext.inventory` → SSO-переход |
| `apps/web/src/pages/PersonnelPage.tsx` | тоггл «Доступ в платформу (бета)» |

---

## Task 1: БД — колонка `can_access_platform` + миграция

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (модель `User`, рядом с `canAccessInventory`)

- [ ] **Step 1: Добавить поле в схему**

В модели `User`, сразу после строки `canAccessInventory Boolean @default(false) @map("can_access_inventory")`, добавить:

```prisma
  canAccessPlatform  Boolean  @default(false) @map("can_access_platform")
```

- [ ] **Step 2: Создать и применить миграцию (dev БД)**

Run: `pnpm --filter @nexus/db exec prisma migrate dev --name add_can_access_platform`
Expected: создаётся `packages/db/prisma/migrations/<timestamp>_add_can_access_platform/migration.sql` с `ALTER TABLE "nexus"."users" ADD COLUMN "can_access_platform" BOOLEAN NOT NULL DEFAULT false;`, клиент Prisma перегенерирован, вывод заканчивается `Your database is now in sync with your schema.`

- [ ] **Step 3: Применить миграцию на тестовую БД**

Run: `pnpm db:migrate:test`
Expected: миграция применяется к тест-БД (порт 5434), без ошибок.

- [ ] **Step 4: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations
git commit -m "feat(db): поле User.canAccessPlatform + миграция

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: API — проброс флага (TDD)

**Files:**
- Test: `apps/api/src/routes/users.test.ts` (создать)
- Modify: `apps/api/src/routes/users.ts`, `apps/api/src/plugins/auth.ts`, `apps/api/src/routes/auth.ts`

- [ ] **Step 1: Написать падающий тест**

Создать `apps/api/src/routes/users.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import { prisma } from '@nexus/db'
import { usersRoutes } from './users'

// PATCH /users/:id — admin может менять canAccessPlatform; не-админ отбивается гардом.

const ADMIN_AUTH_ID = 'test-users-admin-auth'
const USER_AUTH_ID = 'test-users-nonadmin-auth'
const TARGET_AUTH_ID = 'test-users-target-auth'

let app: FastifyInstance
let adminToken: string
let userToken: string
let targetId: string

beforeAll(async () => {
  app = Fastify()
  await app.register(cookie)
  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
    cookie: { cookieName: 'access_token', signed: false },
  })
  await app.register(usersRoutes, { prefix: '/users' })
  await app.ready()

  const admin = await prisma.user.upsert({
    where: { authId: ADMIN_AUTH_ID },
    update: { isAdmin: true, isActive: true },
    create: { name: 'Test Users Admin', authId: ADMIN_AUTH_ID, isAdmin: true },
  })
  await prisma.user.upsert({
    where: { authId: USER_AUTH_ID },
    update: { isAdmin: false, isActive: true },
    create: { name: 'Test Users NonAdmin', authId: USER_AUTH_ID },
  })
  const target = await prisma.user.upsert({
    where: { authId: TARGET_AUTH_ID },
    update: { isActive: true, canAccessPlatform: false },
    create: { name: 'Test Platform Target', authId: TARGET_AUTH_ID, userType: 'staff' },
  })
  targetId = target.id
  adminToken = app.jwt.sign({ sub: ADMIN_AUTH_ID })
  userToken = app.jwt.sign({ sub: USER_AUTH_ID })  // не-админ → requireRole отобьёт 403
})

afterAll(async () => {
  await prisma.user.deleteMany({ where: { authId: { in: [ADMIN_AUTH_ID, USER_AUTH_ID, TARGET_AUTH_ID] } } })
  await app.close()
})

describe('PATCH /users/:id — canAccessPlatform', () => {
  it('admin включает флаг → 200 и canAccessPlatform=true в ответе', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${targetId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { canAccessPlatform: true },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().canAccessPlatform).toBe(true)
  })

  it('не-админ → 403', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${targetId}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { canAccessPlatform: false },
    })
    expect(res.statusCode).toBe(403)
  })
})
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `pnpm --filter @nexus/api exec vitest run src/routes/users.test.ts`
Expected: FAIL на первом кейсе — `res.json().canAccessPlatform` равен `undefined` (поля нет ни в Zod-схеме PATCH, ни в `USER_SELECT`).

- [ ] **Step 3: Добавить поле в `USER_SELECT`**

В `apps/api/src/routes/users.ts`, в объекте `USER_SELECT` (начинается ~строка 54), в строку с `canAccessInventory: true, authId: true, createdAt: true,` добавить `canAccessPlatform`:

```typescript
  canAccessInventory: true, canAccessPlatform: true, authId: true, createdAt: true,
```

- [ ] **Step 4: Добавить поле в Zod-схему и `data` PATCH**

В `apps/api/src/routes/users.ts`, в схеме `PATCH /:id`, после строки `canAccessInventory:  z.boolean().optional(),` добавить:

```typescript
      canAccessPlatform:   z.boolean().optional(),
```

И в объекте `data` обновления, после строки `...(d.canAccessInventory !== undefined && { canAccessInventory: d.canAccessInventory }),` добавить:

```typescript
          ...(d.canAccessPlatform  !== undefined && { canAccessPlatform:  d.canAccessPlatform }),
```

- [ ] **Step 5: Добавить поле в `select` плагина auth**

В `apps/api/src/plugins/auth.ts`, в `prisma.user.findUnique` `select` (строка ~35) добавить `canAccessPlatform: true`:

```typescript
      select: { id: true, email: true, name: true, isAdmin: true, canAccessInventory: true, canAccessPlatform: true, isActive: true },
```

И в сборку `request.user` (после `canAccessInventory: user.canAccessInventory,`) добавить:

```typescript
      canAccessPlatform: user.canAccessPlatform,
```

- [ ] **Step 6: Добавить поле в `select` `/auth/me`**

В `apps/api/src/routes/auth.ts`, в `select` `GET /me` (строка ~57) добавить `canAccessPlatform: true` рядом с `canAccessInventory: true`:

```typescript
        canAccessInventory: true, canAccessPlatform: true, mustChangePassword: true, theme: true, status: true, tabNumber: true,
```

- [ ] **Step 7: Запустить тест — убедиться, что проходит**

Run: `pnpm --filter @nexus/api exec vitest run src/routes/users.test.ts`
Expected: PASS оба кейса.

- [ ] **Step 8: Сборка API (0 ошибок типов)**

Run: `pnpm --filter @nexus/api build`
Expected: успешно, 0 ошибок TypeScript.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/routes/users.ts apps/api/src/routes/users.test.ts apps/api/src/plugins/auth.ts apps/api/src/routes/auth.ts
git commit -m "feat(api): canAccessPlatform в /auth/me и PATCH /users/:id + тест

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Фронт — поле в сторе

**Files:**
- Modify: `apps/web/src/stores/auth.ts`

- [ ] **Step 1: Добавить поле в `AuthUser`**

В `apps/web/src/stores/auth.ts`, в интерфейс `AuthUser`, после строки `canAccessInventory: boolean` добавить:

```typescript
  canAccessPlatform: boolean
```

(`useAuthInit` делает `setUser(res.data)` — значение придёт из `/auth/me` автоматически.)

- [ ] **Step 2: Проверка типов web**

Run: `pnpm --filter @nexus/web exec tsc --noEmit`
Expected: 0 ошибок.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/stores/auth.ts
git commit -m "feat(web): canAccessPlatform в AuthUser

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Фронт — гейт в App.tsx

**Files:**
- Modify: `apps/web/src/App.tsx:125-130`

- [ ] **Step 1: Изменить условие гейта**

В `apps/web/src/App.tsx` заменить блок:

```tsx
  // Visibility gate ВОССТАНОВЛЕН (прод): пока прод-БД не мигрирована под rebuild-v4,
  // не-админы видят только минимальный кабинет (должность + переход в Инвентаризацию),
  // чтобы не упираться в краши страниц, ожидающих новую схему/данные.
  // Полная механика — только админам. TODO: снять гейт после миграции БД.
  if (!user.isAdmin) return <PersonalCabinetPage user={user} />
  return <AppShell />
```

на:

```tsx
  // Visibility gate (прод): не-админ без бета-доступа видит минимальный кабинет.
  // canAccessPlatform — точечный rollout-флаг (выдаётся в Персонале), пускает внутрь AppShell.
  // TODO: при открытии платформы для всех убрать `&& !user.canAccessPlatform`
  //       и дропнуть колонку can_access_platform отдельной миграцией.
  if (!user.isAdmin && !user.canAccessPlatform) return <PersonalCabinetPage user={user} />
  return <AppShell />
```

- [ ] **Step 2: Проверка типов web**

Run: `pnpm --filter @nexus/web exec tsc --noEmit`
Expected: 0 ошибок.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "feat(web): гейт пускает в AppShell обладателей canAccessPlatform

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Фронт — общий SSO-хелпер для Инвентаризации

**Files:**
- Modify: `apps/web/src/lib/sso.ts`, `apps/web/src/pages/PersonalCabinetPage.tsx`

- [ ] **Step 1: Добавить хелпер в sso.ts**

В конец `apps/web/src/lib/sso.ts` добавить:

```typescript
const INVENTORY_URL = import.meta.env.VITE_INVENTORY_URL ?? ''

/**
 * Открывает Инвентаризацию в новой вкладке, передав текущую Supabase-сессию
 * через URL-хеш (#access_token=…&refresh_token=…). false, если нет URL или сессии.
 */
export async function openInventoryWithSession(): Promise<boolean> {
  if (!INVENTORY_URL) return false
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return false
  const params = new URLSearchParams({
    access_token: session.access_token,
    refresh_token: session.refresh_token ?? '',
  })
  window.open(`${INVENTORY_URL}/#${params.toString()}`, '_blank', 'noopener,noreferrer')
  return true
}
```

- [ ] **Step 2: Переиспользовать хелпер в PersonalCabinetPage**

В `apps/web/src/pages/PersonalCabinetPage.tsx`:

1. Добавить импорт `openInventoryWithSession` из `../lib/sso` (рядом с существующими импортами).
2. Заменить тело функции `goToInventory` (строки ~47-56) на:

```tsx
  function goToInventory() {
    openInventoryWithSession()
  }
```

3. Удалить ставшую неиспользуемой строку `const INVENTORY_URL = import.meta.env.VITE_INVENTORY_URL ?? ''` (строка ~13) — её больше нет потребителей в файле.

- [ ] **Step 3: Проверка типов web**

Run: `pnpm --filter @nexus/web exec tsc --noEmit`
Expected: 0 ошибок (если `INVENTORY_URL` где-то ещё используется в файле — оставить константу; tsc покажет).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/sso.ts apps/web/src/pages/PersonalCabinetPage.tsx
git commit -m "refactor(web): общий openInventoryWithSession в sso.ts

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Фронт — живой клик по `ext.inventory` в сайдбаре

**Files:**
- Modify: `apps/web/src/components/AppShell.tsx:243-262`

- [ ] **Step 1: Импортировать хелпер**

В `apps/web/src/components/AppShell.tsx` добавить импорт `openInventoryWithSession` из `../lib/sso` (рядом с прочими импортами `lib/*`).

- [ ] **Step 2: Сделать клик по внешнему модулю рабочим**

В блоке департаментных модулей заменить кнопку (строки ~244-261):

```tsx
                      <button
                        key={m.key}
                        onClick={() => { if (m.page) navigateTo(m.page as Page) }}
                        title={m.mode === 'view' ? `${m.name} — только просмотр` : m.name}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                          padding: '7px 12px', borderRadius: 8, border: 'none',
                          background: 'transparent', cursor: m.page ? 'pointer' : 'default',
                          color: SB.text, fontFamily: 'inherit', fontSize: 12, textAlign: 'left',
                        }}
                      >
```

на:

```tsx
                      <button
                        key={m.key}
                        onClick={() => {
                          if (m.page) navigateTo(m.page as Page)
                          else if (m.key === 'ext.inventory') openInventoryWithSession()
                        }}
                        title={m.mode === 'view' ? `${m.name} — только просмотр` : m.name}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                          padding: '7px 12px', borderRadius: 8, border: 'none',
                          background: 'transparent',
                          cursor: (m.page || m.key === 'ext.inventory') ? 'pointer' : 'default',
                          color: SB.text, fontFamily: 'inherit', fontSize: 12, textAlign: 'left',
                        }}
                      >
```

- [ ] **Step 3: Проверка типов web**

Run: `pnpm --filter @nexus/web exec tsc --noEmit`
Expected: 0 ошибок.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/AppShell.tsx
git commit -m "fix(web): клик по ext.inventory в сайдбаре делает SSO-переход

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Фронт — тоггл «Доступ в платформу (бета)» в карточке Персонала

**Files:**
- Modify: `apps/web/src/pages/PersonnelPage.tsx`

- [ ] **Step 1: Добавить поле в тип `PersonUser`**

В `apps/web/src/pages/PersonnelPage.tsx`, в интерфейс `PersonUser` (строки 9-25), после `isAdmin: boolean` добавить:

```typescript
  canAccessPlatform: boolean
```

(Значение приходит со списками `/staff` и `/freelancers` — они отдают `USER_SELECT`, куда поле добавлено в Task 2.)

- [ ] **Step 2: Локальное состояние + мутация в `PersonDrawer`**

В компоненте `PersonDrawer`, после строки `const [tempPw, setTempPw] = useState<string | null>(null)` (строка ~275) добавить:

```tsx
  const [platformAccess, setPlatformAccess] = useState(person.canAccessPlatform)
  useEffect(() => { setPlatformAccess(person.canAccessPlatform) }, [person.canAccessPlatform])

  const togglePlatform = useMutation({
    mutationFn: (value: boolean) => api.patch(`/users/${person.id}`, { canAccessPlatform: value }),
    onSuccess: () => qc.invalidateQueries({ queryKey, refetchType: 'all' }),
    onError: (err: any) => {
      setPlatformAccess(person.canAccessPlatform)  // откат оптимистичного переключения
      alert(err?.response?.data?.error ?? 'Не удалось изменить доступ в платформу')
    },
  })
```

- [ ] **Step 3: Добавить тоггл в тело карточки**

В `apps/web/src/pages/PersonnelPage.tsx`, сразу после закрывающего `</div>` блока «Занятость» (после строки ~465, перед `{/* Footer */}`), добавить блок. Виден только для онбордённого не-админа:

```tsx
          {/* Доступ в платформу (бета): пускает не-админа внутрь AppShell вместо заглушки-кабинета */}
          {person.authId && !isAdminUser && (
            <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 500 }}>Доступ в платформу (бета)</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Пускает внутрь Nexus вместо кабинета</span>
              </div>
              <button
                onClick={() => { const next = !platformAccess; setPlatformAccess(next); togglePlatform.mutate(next) }}
                disabled={togglePlatform.isPending}
                style={{
                  width: 42, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: platformAccess ? 'var(--success)' : 'rgba(255,255,255,0.1)',
                  position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                }}
              >
                <span style={{
                  position: 'absolute', top: 3, left: platformAccess ? 21 : 3,
                  width: 18, height: 18, borderRadius: '50%', background: '#fff',
                  transition: 'left 0.2s',
                }} />
              </button>
            </div>
          )}
```

- [ ] **Step 4: Проверка типов web**

Run: `pnpm --filter @nexus/web exec tsc --noEmit`
Expected: 0 ошибок (`useEffect`, `useMutation` уже импортированы в файле).

- [ ] **Step 5: Lint web**

Run: `pnpm --filter @nexus/web lint`
Expected: без новых ошибок.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/PersonnelPage.tsx
git commit -m "feat(web): тоггл «Доступ в платформу (бета)» в карточке Персонала

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Финальная верификация

**Files:** —

- [ ] **Step 1: Полная проверка типов и сборки**

Run: `pnpm --filter @nexus/api build`
Expected: 0 ошибок.

Run: `pnpm --filter @nexus/web exec tsc --noEmit`
Expected: 0 ошибок.

- [ ] **Step 2: Тесты (нужна запущенная тест-БД :5434)**

Run: `pnpm --filter @nexus/api test`
Expected: зелёные, включая `src/routes/users.test.ts`.

Run: `pnpm --filter @nexus/web test`
Expected: зелёные.

- [ ] **Step 3: Ручная проверка в браузере (dev)**

Запустить `pnpm dev`. Под админом:
1. Персонал → карточка онбордённого не-админа → видно тоггл «Доступ в платформу (бета)».
2. Включить тоггл → подтвердить, что запрос прошёл (нет alert-ошибки).
3. «Войти как» этим юзером (импersonation) → должен открыться **AppShell** (не заглушка-кабинет).
4. Выключить тоггл у того же юзера → «Войти как» → снова **заглушка-кабинет**.
5. Если у юзера есть грант `ext.inventory` (Настройки → Роли и доступы) → в сайдбаре AppShell пункт «Инвентаризация» → клик открывает Инвентаризацию в новой вкладке.

Expected: все пять пунктов как описано. `ErrorBoundary` ловит падения отдельных страниц (белого экрана нет).

- [ ] **Step 4: Отметить выполнение в TODO/спеке (если нужно)**

Если всё зелёное — фича готова к ревью/мерджу в `dev` через PR.

---

## Заметки для исполнителя

- **Откат фичи** (когда платформу открываем всем): убрать `&& !user.canAccessPlatform` из гейта в `App.tsx`, дропнуть колонку `can_access_platform` отдельной миграцией, снять тоггл и поле из стора. Починка клика по `ext.inventory` (Task 6) и тесты — остаются.
- **Прод-БД**: миграция применится автоматически при деплое (`prisma migrate deploy` в CMD api-контейнера). Rollout начинаем с 1-2 тестовых пользователей — прод может быть не насеян (форматы дня, RBAC-гранты, оргструктура), страницы могут быть пустыми.
- **Грант инвентаризации** доходит до юзера только через членство в отделе департамента (`getUserAccess`). Без насеянной оргструктуры модуль не появится.
