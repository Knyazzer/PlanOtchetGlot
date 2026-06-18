# Дизайн: флаг `canAccessPlatform` — точечный бета-доступ в Nexus

> Дата: 2026-06-15 · Ветка разработки: `knyazzer` · Статус: спека на ревью

## Проблема

Сейчас в проде стоит visibility gate ([apps/web/src/App.tsx:129](../../../apps/web/src/App.tsx)):
не-админ → заглушка `PersonalCabinetPage`, только админ → полноценный `AppShell`.
Гейт держим, пока прод-БД не домигрирована/не насеяна (форматы дня, RBAC-гранты, оргструктура).

Нужно **точечно** впускать выбранных не-админов внутрь платформы — управляемо из админки (таблица Персонала), по аналогии с тем, как выдаётся доступ к Инвентаризации. Это **временный rollout-механизм**: когда прод будет готов, гейт снимаем для всех, а флаг удаляем.

## Решение (выбранный подход)

Новый булев флаг `User.canAccessPlatform` — близнец существующего `canAccessInventory`. Админ переключает его в карточке сотрудника. Гейт пускает в `AppShell` админов **и** обладателей флага.

Рассмотренные альтернативы и почему отклонены:
- **Гейт по наличию RBAC-грантов** (`user.access.modules.length > 0`) — гранты в проде не насеяны (это и есть причина гейта), нельзя точечно «впусти именно этих». Плохой фит.
- **Хардкод-allowlist** (env/константа email) — не управляется из админки, требует редеплоя на каждое изменение. Противоречит требованию «тоггл в таблице персонала».

## Семантика

- **Админ** (`isAdmin`) — всегда внутри платформы (как сейчас).
- **Не-админ с `canAccessPlatform=true`** — внутри платформы: видит `USER_NAV` + свои департаментные модули слева (включая Инвентаризацию, если выдана грантом).
- **Остальные** — заглушка `PersonalCabinetPage`, как сейчас.
- Флаг — **поверх** обычной auth-проверки. Увольнение (бан `auth.users`) по-прежнему блокирует вход везде, независимо от флага.
- Новый юзер: `canAccessPlatform=false` по умолчанию (доступ выдаётся точечно).

## Объём работ

### Ядро

**1. Данные** — [packages/db/prisma/schema.prisma](../../../packages/db/prisma/schema.prisma), модель `User` (схема `nexus`):
```prisma
canAccessPlatform Boolean @default(false) @map("can_access_platform")
```
+ Prisma-миграция. На прод применяется **автоматически** при деплое (`prisma migrate deploy` в CMD api-контейнера) — ручных шагов в БД нет.

**2. API** — добавить `canAccessPlatform`:
- [apps/api/src/plugins/auth.ts](../../../apps/api/src/plugins/auth.ts) — в `select` при резолве `request.user`.
- [apps/api/src/routes/auth.ts](../../../apps/api/src/routes/auth.ts) — в `select` и ответ `GET /auth/me`.
- [apps/api/src/routes/users.ts](../../../apps/api/src/routes/users.ts) — в `USER_SELECT` (используется списками **и** PATCH), в Zod-схему `PATCH /users/:id` и в `data` апдейта. Гард `requireRole('admin')` уже есть — отдельной защиты не нужно.

**3. Стор** — [apps/web/src/stores/auth.ts](../../../apps/web/src/stores/auth.ts): поле `canAccessPlatform: boolean` в `AuthUser`.

**4. Гейт** — [apps/web/src/App.tsx](../../../apps/web/src/App.tsx):
```tsx
if (!user.isAdmin && !user.canAccessPlatform) return <PersonalCabinetPage user={user} />
return <AppShell />
```
Рядом — комментарий-TODO: «при открытии для всех убрать `&& !user.canAccessPlatform` и дропнуть колонку отдельной миграцией».

**5. UI-тоггл** — [apps/web/src/pages/PersonnelPage.tsx](../../../apps/web/src/pages/PersonnelPage.tsx):
- Свитч «Доступ в платформу (бета)» в карточке сотрудника, в футере рядом с управлением доступом.
- Виден только если `person.authId` задан (юзер онбордён — иначе войти всё равно не может) **и** не супер-админ (`!person.isAdmin` — у админа доступ и так есть).
- Стиль — как свитч «Работает сейчас» ([строки 437-451](../../../apps/web/src/pages/PersonnelPage.tsx)).
- `onChange` → `patch.mutate({ canAccessPlatform: <new> })`. Инвалидация запросов в `patch` уже настроена.
- В тип `Person` и в выборку списка добавить `canAccessPlatform` (через `USER_SELECT` на бэке).

**6. Починка клика по внешнему модулю в сайдбаре** — [apps/web/src/components/AppShell.tsx](../../../apps/web/src/components/AppShell.tsx):
- Сейчас кнопка департаментного модуля: `onClick={() => { if (m.page) navigateTo(m.page) }}` — для внешнего `ext.inventory` (без `page`) клик мёртвый.
- Вынести SSO-логику `goToInventory` из `PersonalCabinetPage` в общий хелпер в [apps/web/src/lib/sso.ts](../../../apps/web/src/lib/sso.ts) (напр. `openInventoryWithSession()`: берёт текущую сессию Supabase, строит `#access_token=…&refresh_token=…`, открывает `VITE_INVENTORY_URL` в новой вкладке). Это закрывает и пункт TODO про дубль `goToInventory`.
- В AppShell: для модуля с ключом `ext.inventory` (page-less внешний) клик → `openInventoryWithSession()`. Переиспользовать тот же хелпер в `PersonalCabinetPage`.
- Бета-юзер с грантом инвентаризации получает рабочий переход из сайдбара.

**7. Тесты** (правило CLAUDE.md §1 — новые фичи с тестами):
- API: `PATCH /users/:id` принимает и сохраняет `canAccessPlatform` (admin); не-админ получает отказ гардом.
- Web (по возможности): логика гейта — `isAdmin || canAccessPlatform` пускает в `AppShell`, иначе кабинет.

### Отложено в TODO (не в этой фиче)

- Смена пароля в настройках профиля (`ProfilePanel` внутри AppShell) — сейчас self-service смена есть только в заглушке-кабинете (`supabase.auth.updateUser`). Восстановление забытого пароля через почту — отдельно (SMTP, Этап 3). Оба пункта уже в [docs/TODO.md](../../TODO.md).

## Зависимости и риски

- **Прод не насеян.** Не-админы никогда не рендерили эти страницы в проде — гейт их не пускал. Прод-БД без форматов дня / RBAC-грантов / оргструктуры → впущенные могут увидеть пустые/кривые страницы. Per-page `ErrorBoundary` спасает от белого экрана. **Митигация:** rollout начинаем с 1-2 тестовых пользователей и смотрим.
- **Грант инвентаризации доходит до юзера только через членство в отделе** департамента (`getUserAccess` → `getOrgScope`). Если оргструктура/членства в проде не насеяны — модуль не появится ни в кабинете, ни в сайдбаре. Это часть той же «насеянности прода».
- Миграция аддитивная (новая колонка с дефолтом) — без риска для существующих данных.

## Откат

Когда платформу открываем всем:
1. Убрать `&& !user.canAccessPlatform` из гейта в `App.tsx` (или весь гейт).
2. Дропнуть колонку `can_access_platform` отдельной миграцией.
3. Убрать тоггл из `PersonnelPage` и поле из стора/селектов.

Починка клика по внешнему модулю (п.6) и тесты — остаются (не временные).
