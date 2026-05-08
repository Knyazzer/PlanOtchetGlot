# RULES.md — Правила разработки TV Shifts

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
| PATCH /work-items/:id | `work-items`, `work-item:{id}`, `projects` (если меняется status) |
| POST /work-items | `work-items`, `projects` |
| DELETE /work-items/:id | `work-items`, `projects` |
| PATCH /projects/:id | `projects`, `project:{id}` |
| PATCH /dept-wi-links/:id/substatus | `dept-board:{deptId}`, `work-item:{wiId}`, `work-items` |
| POST /work-items/:id/dept-links | `work-item:{id}`, `dept-board:{deptId}`, `work-items` |
| POST/DELETE /departments/:id/members | `departments`, `dept-detail:{id}` |
| POST/PATCH/DELETE /tasks | `tasks`, связанный `work-item:{wiId}` если wiId задан |

**Правило «всех родителей»:** если мутация меняет дочернюю сущность — инвалидируй и родительскую.
- WorkItem изменился → инвалидируй Project
- DeptWILink изменился → инвалидируй WorkItem + Department board
- Task изменился → инвалидируй WorkItem (если wiId есть)

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
- `WorkflowPage` — `/work-items` (несколько продюсеров работают одновременно)
- `DeptBoardPage` — `/departments/:id/board` (члены отдела двигают карточки)
- `CalendarPage` — любые смены/события
- `TasksPage` — задачи могут назначаться другими

**Где polling не нужен:**
- Страницы настроек (AdminDeptPage, DatabasePage) — данные меняются редко
- ProfilePage — личные данные одного пользователя

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
1. Иметь `preHandler: authenticate` или `preHandler: requirePermission('...')`
2. Валидировать body через Zod (`.safeParse`, не `.parse`)
3. Возвращать `reply.code(400)` при ошибке валидации — не бросать исключение
4. Проверять существование сущности перед операцией (`.findUnique` + 404)

**Raw SQL:**
```typescript
// ❌ НИКОГДА не делать — вызовет: operator does not exist: text = uuid
WHERE id = $1::uuid

// ✅ Все ID — тип TEXT, каст не нужен
WHERE id = $1
WHERE id = ANY($1::text[])  // для массивов

// ✅ Enum в raw SQL требует явного каста
SET source = 'separator'::"WorkItemSource"
```

**Separator rows:** всегда исключать из списочных запросов:
```typescript
where: { NOT: { source: 'separator' as any } }
```

---

## 5. НОВЫЙ РОУТ — чеклист

При добавлении любого нового API-роута:

- [ ] Файл в `apps/api/src/routes/`
- [ ] Зарегистрирован в `apps/api/src/server.ts` (`app.register(...)`)
- [ ] Все роуты защищены (`authenticate` или `requirePermission`)
- [ ] Новый permission (если нужен) → добавить в `permissions.ts` И в `seed.ts`
- [ ] Написан тест в `apps/api/src/routes/*.test.ts`
- [ ] Роут добавлен в таблицу API-роутов в `CLAUDE.md`

---

## 6. НОВАЯ СТРАНИЦА — чеклист

При добавлении любой новой страницы:

- [ ] Файл в `apps/web/src/pages/`
- [ ] `Page` type в `AppShell.tsx` дополнен новым значением
- [ ] Новое значение добавлено в массив `valid` в `useState<Page>()`
- [ ] Добавлен элемент в `navItems` с правильным `adminOnly` / `adminOrProducer`
- [ ] Добавлен `{page === 'newpage' && <NewPage />}` в блок `<main>`
- [ ] Страница добавлена в таблицу статусов в `CLAUDE.md`
- [ ] Все мутации на странице имеют `invalidateQueries` (правило 1)
- [ ] Критичные запросы имеют `refetchInterval` (правило 2)

---

## 7. ПЕРЕД КОММИТОМ — обязательный чеклист

```bash
pnpm --filter @tv-shifts/api build          # 0 TypeScript ошибок
pnpm --filter @tv-shifts/web exec tsc --noEmit  # 0 TypeScript ошибок
pnpm test                                   # 163/163 тестов (нужна запущенная БД)
```

Если тесты не прошли — коммит не делать, разобраться с причиной.

**Также перед коммитом:**
- Обновить `CLAUDE.md` если добавлены новые роуты, страницы или изменилась архитектура
- Обновить чекбоксы в `docs/dev-plan-v2.md` для выполненных задач

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
- Не оставлять TODO-комментарии в коде — задачи идут в `docs/dev-plan-v2.md`

**Стили:**
- Только inline styles — никаких CSS-файлов, никаких UI-библиотек
- Цветовая палитра: `#1e293b` (текст), `#2563eb` (primary), `#16a34a` (success), `#dc2626` (danger), `#f8fafc` (bg)

---

## 10. ЧТО НИКОГДА НЕ ДЕЛАТЬ

```
❌ Предлагать React Router — навигация через useState<Page>, это осознанное решение
❌ Предлагать Tailwind / shadcn / MUI — только inline styles
❌ Трогать /status-rows роут и statusRows.ts — legacy, живёт параллельно
❌ Использовать ::uuid в raw SQL — все ID это TEXT
❌ Коммитить с упавшими тестами
❌ Делать мутацию без invalidateQueries
❌ Добавлять роут без preHandler auth
❌ Добавлять новый permission без обновления seed.ts
```
