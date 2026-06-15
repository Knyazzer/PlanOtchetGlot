# RULES.md — Правила разработки Nexus

Обязательны для каждой новой фичи, каждого коммита, каждого ревью.
Эти правила существуют потому что нарушение любого из них приводит к конкретному багу или регрессии.

---

## 1. РЕАКТИВНОСТЬ ДАННЫХ — приоритет №1

**Правило: каждый `useMutation` ОБЯЗАН инвалидировать все затронутые запросы.**

Если пользователь что-то изменил — это должно отобразиться везде немедленно, без ручного обновления страницы.

```typescript
// ❌ НАРУШЕНИЕ — данные устареют везде кроме этого компонента
const update = useMutation({
  mutationFn: (data) => api.patch(`/work-items/${id}`, data),
})

// ✅ ПРАВИЛЬНО — все компоненты, использующие эти данные, обновятся сами
const update = useMutation({
  mutationFn: (data) => api.patch(`/work-items/${id}`, data),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ['work-items'] })
    qc.invalidateQueries({ queryKey: ['work-item', id] })
    qc.invalidateQueries({ queryKey: ['projects'] })       // если WI влияет на Project
  },
})
```

**Таблица инвалидации — что чистить при мутации:**

| Мутация | Обязательно инвалидировать |
|---------|---------------------------|
| PATCH/DELETE /work-items/:id | `work-items`, `work-item:{id}`, `projects`, `project:{projectId}` |
| POST /projects/:id/work-items | `work-items`, `projects`, `project:{id}` |
| PATCH /projects/:id | `projects`, `project:{id}` |
| POST/PATCH/DELETE /work-items/:id/expenses | `work-item:{id}`, `work-items` |
| PUT /work-items/:id/departments | `work-item:{id}`, `work-items` |
| POST/PATCH/DELETE /tasks | `tasks`, `track:{trackId}` и `tracks` если trackId задан, `work-item:{id}` если трек привязан к WI |
| PATCH/PUT /tracks/:id (+members/stages) | `tracks`, `track:{id}`, `work-item:{workItemId}` если привязан |
| мутации /structure | `structure`, `staff` |
| мутации /users (lifecycle, PATCH) | `staff` / `freelancers`, `members` |
| мутации /events, /calendar-entries | ключи календаря + `tasks` (события порождают задачи) |

**Правило «всех родителей»:** если мутация меняет дочернюю сущность — инвалидируй и родительскую.
- WorkItem изменился → инвалидируй Project
- Task изменился → инвалидируй Track (и WorkItem, если трек привязан)
- Событие изменилось → инвалидируй задачи (авто-задачи участников)

---

## 2. ЖИВЫЕ ДАННЫЕ — polling для многопользовательского режима

Критичные страницы должны автоматически обновляться, пока пользователь на них находится.
Это нужно чтобы изменения одного пользователя видели другие — без перезагрузки.

```typescript
// ✅ ПРАВИЛЬНО для страниц, где работают несколько человек одновременно
const { data } = useQuery({
  queryKey: ['work-items'],
  queryFn: fetchWorkItems,
  refetchInterval: 30_000,        // каждые 30 секунд
  refetchIntervalInBackground: false,  // только когда вкладка активна
})
```

**Где обязателен polling:**
- `ProjectsPage` (вкл. Workflow) — `/work-items` (несколько продюсеров работают одновременно) — ⚠️ ещё не сделано, см. TODO
- `CalendarPage` — события и общие записи — ⚠️ ещё не сделано, см. TODO
- `TasksPage` — задачи могут назначаться другими (✅ 30s)
- Бейджи AppShell (`/chats/unread`, `/tasks/unseen-count`) — ✅ 15s; список чатов — ✅ 10s

**Где polling не нужен:**
- Страницы настроек (PersonnelPage, DatabasePage) — данные меняются редко
- PersonalCabinetPage — личные данные одного пользователя

---

## 3. СОСТОЯНИЯ UI — нет "молчащих" операций

Каждое действие пользователя должно иметь видимую обратную связь.

```typescript
// ❌ НАРУШЕНИЕ — пользователь не знает что происходит
<button onClick={() => save.mutate(data)}>Сохранить</button>

// ✅ ПРАВИЛЬНО
<button
  onClick={() => save.mutate(data)}
  disabled={save.isPending}
>
  {save.isPending ? 'Сохранение...' : 'Сохранить'}
</button>

// ✅ И обязательно показать ошибку если мутация упала
const save = useMutation({
  mutationFn: ...,
  onSuccess: () => qc.invalidateQueries(...),
  onError: (err: any) => alert(err?.response?.data?.error ?? 'Ошибка сервера'),
})
```

**Обязательные состояния для каждого запроса/мутации:**
- `isLoading` / `isPending` → показать спиннер или disabled-кнопку
- `isError` → показать сообщение об ошибке (не молчать)
- Пустой результат → показать «Нет данных», не пустой экран

---

## 4. API — стандарты роутов

**HTTP-коды:**
```
GET    → 200
POST   → 201 (создание)
PATCH  → 200
DELETE → 204 (без тела)
Ошибка валидации → 400 + { error, details }
Не найдено → 404 + { error: 'X not found' }
Нет прав → 403 + { error: 'Forbidden' }
Не авторизован → 401 + { error: 'Unauthorized' }
```

**Каждый роут обязан:**
1. Иметь `preHandler: authenticate` или `preHandler: requireRole('admin')`
2. Валидировать body через Zod (`.safeParse`, не `.parse`)
3. Возвращать `reply.code(400)` при ошибке валидации — не бросать исключение
4. Проверять существование сущности перед операцией (`.findUnique` + 404)

> ⚠️ `requireRole` сейчас понимает только `'admin'` — другие роли молча пропускают всех (см. `plugins/auth.ts`). Перед вводом гардов producer/freelancer — доработать плагин.

**Raw SQL — ID по схемам:**
```typescript
// nexus.* — все ID тип TEXT, каст не нужен:
WHERE id = $1
WHERE id = ANY($1::text[])  // для массивов

// public.users / auth.users — id тип uuid, каст ОБЯЗАТЕЛЕН:
UPDATE public.users SET is_active = false WHERE id = ${authId}::uuid
SELECT id::text AS id FROM auth.users WHERE email = ${email}
```

---

## 5. НОВЫЙ РОУТ — чеклист

При добавлении любого нового API-роута:

- [ ] Файл в `apps/api/src/routes/`
- [ ] Зарегистрирован в `apps/api/src/server.ts` (`app.register(...)`)
- [ ] Все роуты защищены (`authenticate` или `requireRole('admin')`)
- [ ] Написан тест в `apps/api/src/routes/*.test.ts`
- [ ] Роут добавлен в таблицу API-роутов в `CLAUDE.md`

---

## 6. НОВАЯ СТРАНИЦА — чеклист

При добавлении любой новой страницы:

- [ ] Файл в `apps/web/src/pages/`
- [ ] `Page` type в `AppShell.tsx` дополнен новым значением (`AdminPage` / `UserPage`)
- [ ] Добавлен пункт в `USER_NAV` или `ADMIN_NAV`
- [ ] Добавлен `{page === 'newpage' && <NewPage />}` в блок `<main>` (для админских — с `&& isAdmin`)
- [ ] Страница добавлена в таблицу статусов в `CLAUDE.md`
- [ ] Все мутации на странице имеют `invalidateQueries` (правило 1)
- [ ] Критичные запросы имеют `refetchInterval` (правило 2)

---

## 7. ПЕРЕД КОММИТОМ — обязательный чеклист

```bash
pnpm --filter @nexus/api build          # 0 TypeScript ошибок
pnpm --filter @nexus/web exec tsc --noEmit  # 0 TypeScript ошибок
pnpm test                                   # все существующие тесты зелёные (нужна запущенная БД)
```

Если тесты не прошли — коммит не делать, разобраться с причиной.

> Покрытие восстанавливается после reset до скелета (см. `docs/TODO.md`) — каждая новая фича снова сопровождается тестом.

⚠️ **Push в `master` = автодеплой на прод** (CD). Коммитить в master только проверенное; фичи — в ветках.

**Также перед коммитом:**
- Обновить `CLAUDE.md` если добавлены новые роуты, страницы или изменилась архитектура
- Обновить таблицы роутов и страниц в `CLAUDE.md`

---

## 8. TYPESCRIPT — строгость

```typescript
// ❌ НАРУШЕНИЕ — any без причины
const data: any = response.data
function handler(req: any, reply: any) { ... }

// ✅ Определить тип явно
type WorkItem = { id: string; name: string; status: WIStatus; ... }
const data: WorkItem = response.data
```

**Правила:**
- `any` разрешён только с комментарием почему иначе нельзя
- Типы API-ответов определять локально в компоненте (не копировать Prisma-типы на фронт)
- Enum-значения на фронте — строковые литералы (`'draft' | 'active' | 'done'`), не импортировать из Prisma

---

## 9. СТРУКТУРА КОДА

**Компоненты:**
- Одна страница = один файл в `apps/web/src/pages/`
- Переиспользуемые мелкие компоненты → `apps/web/src/components/`
- Не создавать абстракции "на будущее" — только то, что нужно сейчас
- Не выносить хелперы если функция используется в одном месте

**Комментарии в коде:**
- Только если WHY неочевидно (скрытое ограничение, обходной путь)
- Не комментировать что делает код — имена переменных/функций должны говорить сами
- Не оставлять TODO-комментарии в коде — задачи идут в `docs/TODO.md`

**Стили:**
- UI-кит: Tailwind + shadcn/ui (Radix) + recharts (графики) + lucide (иконки). Прежнее «только inline styles, без UI-библиотек» отменено 2026-06-09 (рудимент)
- Цвета — **только из `docs/DESIGN.md`** (единый источник палитры)

---

## 10. ЧТО НИКОГДА НЕ ДЕЛАТЬ

```
❌ Предлагать React Router — навигация через useState<Page>, это осознанное решение
❌ Тащить случайные UI-библиотеки вне дом-кита (Tailwind + shadcn/ui/Radix + recharts + lucide)
❌ ::uuid на ID nexus-схемы (там TEXT); на public.users/auth.users каст НУЖЕН
❌ Коммитить с упавшими тестами
❌ Делать мутацию без invalidateQueries
❌ Добавлять роут без preHandler auth
❌ Zod .parse в роутах — только .safeParse + 400
❌ Пушить непроверенное в master — это автодеплой на прод
```

---

## 11. ПЕРЕНОС HTML-ПРОТОТИПА В REACT

Каждый перенос выполняется по этому протоколу. Отступление от него — причина #1 потери механик и визуала.

**Правило №0:** перед тем как считать задачу выполненной — открыть HTML-прототип и React-страницу рядом в браузере и сверить визуально. Расхождений быть не должно.

### CSS

- Все inline styles из прототипа переносятся **as-is** — не упрощать, не сокращать
- Цвета — **только из `docs/DESIGN.md`** — никаких новых значений
- `className` вместо inline — только если стиль повторяется 3+ раз и не содержит динамических значений
- Не менять размеры, отступы и border-radius «чтобы было удобнее»

### JS-механики → React hooks

- Перед переносом выписать чеклист механик из `docs/ui-prototypes/SPECS.md`
- Механика считается перенесённой только после ручной проверки в браузере
- **DOM-манипуляции** (canvas, drag, `getBoundingClientRect`, `scrollTop`) — оставлять в `useEffect` / `useRef`, не пытаться «реактифицировать» через state если это ломает механику
- Координаты при drag — всегда учитывать scroll-offset контейнера (см. `getColMinutes` в calendar-прототипе)
- Алгоритмы (overlap layout, cluster) — переносить точно, без упрощений

### Порядок переноса одного компонента

1. Скопировать HTML/CSS структуру → JSX (сохранить все inline styles)
2. Открыть прототип рядом → сверить визуал → **0 расхождений** перед следующим шагом
3. Перенести JS-логику в hooks (`useState`, `useRef`, `useEffect`)
4. Пройти чеклист механик из SPECS.md вручную в браузере
5. Подключить реальные данные из API (заменить захардкоженные массивы)
6. Ещё раз сверить визуал с прототипом

### Запрещено

```
❌ Считать перенос завершённым без визуальной сверки с HTML-прототипом
❌ Менять layout/отступы/размеры «для удобства React»
❌ Упрощать алгоритмы (overlap, drag) — они написаны так не случайно
❌ Добавлять анимации или стили которых нет в прототипе
❌ Использовать цвета не из DESIGN.md
```
