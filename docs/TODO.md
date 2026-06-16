# TODO — план разработки Nexus

> Приоритизированный план. Источник: аудит 2026-06-11 (`docs/AUDIT-2026-06-11.md`) + текущие планы.
> Градация: 🔴 критично · 🟠 важно · 🟡 желательно · ⚪ пожелание.
> Выполненное переносить в `docs/DONE.md`.

---

## 🔴 Критично

_(по аудиту 2026-06-11 критичных багов не найдено — прод стабилен)_

---

## 🟠 Важно — безопасность и корректность API

- [x] 🟠 ~~structure.ts: закрыть admin-гардом~~ — сделано в rebuild-v4 (`dec4ad3`): мутации под `requireRole('admin')` + Zod `.safeParse`, GET — всем аутентифицированным; тест `structure.test.ts` (5 кейсов).
- [x] 🟠 ~~`.parse` → `.safeParse`~~ — сделано в rebuild-v4 (`afa3d81`): projects.ts (4 места) + clients.ts (2 места), 400 + details.
- [x] 🟠 ~~databaseService: seedSheetConfigsFromEnv перезаписывала настройки~~ — функция удалена вместе с Google-модулем (`7be9de9`).
- [x] 🟠 ~~Убрать захардкоженный Google API-ключ из databaseService.ts~~ — Google-модуль удалён (`7be9de9`), файл чист.
- [ ] 🟠 **events.ts: синхронизировать задачи-спутники при PATCH участников** — добавленному участнику создавать задачу, у удалённого убирать. Сейчас синкается только время/название.

## 🟠 Важно — функциональность и интеграция

- [ ] 🟠 **Этап 2 интеграции (сторона inventory)**: `inventory.profiles` → VIEW над `public.users` + `inventory.user_roles` — миграция в `INTEGRATION.md` §A. Со стороны Nexus предусловия выполнены.
- [ ] 🟠 **API увольнения Nexus↔inventory** (Этап 2 жизненного цикла): запрос «можно ли освободить сотрудника» (незданное оборудование) + ручной аппрув. Контракт — в `megapolis-platform/api/`.
- [x] 🟠 ~~Снятие visibility gate~~ — сделано в rebuild-v4 (`ad955a4`): AppShell всем, дефолт «Главная»; блокеры закрыты: structure-гарды (`dec4ad3`), RBAC-охват scope=team через getOrgScope (`d30cffe`), polling Projects/Calendar.
- [ ] 🟠 **Перенос ПланОтчета** — по `docs/IMPLEMENTATION-PLAN.md` (Этап 0: схема, дом-кит, стенд донора, ETL-скелет). Ветка `design` уже содержит дом-кит (Tailwind v4 + shadcn-токены).

## 🟠 Важно — тесты (восстановление покрытия)

Инфраструктура есть (vitest, MSW, тест-БД :5434), тестов нет — все удалены при reset до скелета (55efc8e).
- [ ] 🟠 `plugins/auth.ts`: verify/enrich, блок impersonate-админа, 401 на неактивном
- [ ] 🟠 `users.ts` lifecycle: deactivate (бан+public.users+табельный), reactivate, onboard link-if-exists, nextTabNumber (S###/FL#)
- [ ] 🟠 `chats.ts`: идемпотентность self/support/direct (advisory lock), права group-admin
- [ ] 🟡 `events.ts`: авто-задачи (создание/синк/удаление)
- [ ] 🟡 `projects.ts`: CRUD + 400 на невалидный ввод (после фикса .parse)
- [ ] 🟡 web: ветки LoginPage (dev/prod), гейты App.tsx (mustChangePassword, не-админ → кабинет)

---

## Мёртвый код / рудименты — к удалению

- [ ] 🟡 `POST /users/bulk-register` (users.ts:400) — легаси-редирект, вызовов нет
- [ ] 🟡 `isOnline()` (wsHub.ts:29), `useIsAdmin()` (hooks/useAuth.ts:21), поле `NavItem.adminOnly` (AppShell.tsx:31)
- [ ] 🟡 Зависимости без импортов: api — `bcryptjs`+`@types/bcryptjs`, `node-cron`+types, `prom-client`, `@fastify/rate-limit`; web — `@fullcalendar/*` (5 пакетов). (`lucide-react`, `class-variance-authority`, `tslib` оставить — под дом-кит.)
- [ ] 🟡 `Track.clientName/projectName/type` — убрать из Zod-схем и SELECT (vestigial; UI уже не показывает). Миграцию полей можно отложить.
- [ ] 🟡 `isActive` из схемы PATCH /users/:id — обход deactivate/reactivate (не банит auth, не синкает public.users)
- [ ] ⚪ `git stash@{0}` времён rebuild-v3 — посмотреть и выбросить
- [ ] ⏸ Импорт из Google Sheets (staff/freelancers/migrate-from-sheets) — рудимент по USER-LIFECYCLE.md, **отключаем после стабилизации справочника** (по отмашке)

---

## 🟡 Желательно — надёжность и качество

- [ ] 🟡 `deactivate`: не глотать ошибку бана GoTrue (`.catch(() => {})`) — проверять `res.ok`, возвращать предупреждение «вход не заблокирован» в ответе
- [ ] 🟡 `tabNumber`: unique-констрейнт в схеме (`@@unique([tabNumber])` или `[userType, tabNumber]`) — закрыть гонку `nextTabNumber`
- [ ] 🟡 `generateEmail`: коллизия тёзок в штате блокирует создание (409) — добавить суффикс или поле email в POST /staff
- [ ] 🟡 `GET /chats/unread`: N+1 count-запросов каждые 15s с клиента → один groupBy
- [ ] 🟡 Polling по RULES §2: ProjectsPage (work-items), CalendarPage (events + calendar-entries)
- [ ] 🟡 Advisory locks: `$executeRawUnsafe` с интерполяцией → параметризованный `$queryRaw` (chats.ts:150,187,207)
- [ ] 🟡 Права: DELETE /work-items/:id — выровнять с DELETE /projects (admin only?); PATCH/DELETE expenses/stages — проверять принадлежность родителю из URL
- [ ] 🟡 Дубли: `genTempPassword`/`PW_CHARS` (auth.ts+users.ts) → общий модуль; `goToInventory` (PersonalCabinetPage) → `redirectWithSession` из sso.ts
- [ ] 🟡 `requireRole`: честная проверка ролей или throw на неизвестной роли (сейчас не-admin роли молча пропускают всех) — обязательно до ввода producer/freelancer-гардов
- [ ] 🟡 Линтер на api-пакет (сейчас только web)

---

## ⚪ Пожелания (бэклог)

- [ ] ⚪ Rate limiting на auth-эндпоинты (`@fastify/rate-limit` уже в зависимостях — или удалить, или применить)
- [ ] ⚪ Таймауты на fetch к Supabase admin API (onboard/bulk-onboard/reset-password/deactivate)
- [ ] ⚪ Fail-fast в production при отсутствии `JWT_SECRET` (сейчас fallback 'dev-secret…')
- [ ] ⚪ POST/DELETE /events: событие + задачи-спутники в одной транзакции
- [ ] ⚪ Отзыв активных сессий при увольнении (`DELETE /admin/users/:id/sessions` GoTrue) — закрыть окно TTL access-токена в inventory
- [ ] ⚪ Смета/маржа/графики в финансах WI (PROJECTS.md Итерация 3), экспорт CSV
- [ ] ⚪ Авто-создание трека при подключении отдела к WI (PROJECTS.md §4)
- [ ] ⚪ Итерация 4 проектов: импорт WI из реестра матриц, шаблоны проектов, уведомления о дедлайнах
- [ ] ⚪ Смена пароля в настройках профиля (ProfilePanel внутри AppShell, по клику на ФИО) — сейчас self-service смена есть только в заглушке-кабинете (`PersonalCabinetPage`, через `supabase.auth.updateUser`); при доступе в платформу её там нет. Перенести/добавить в профиль. (Восстановление забытого пароля через почту — отдельно, см. SMTP ниже.)
- [ ] ⚪ Клик по внешнему департаментному модулю в сайдбаре AppShell (напр. `ext.inventory`) ничего не делает — `onClick` навигирует только при `m.page`; для внешних модулей нужен SSO-переход (логика `goToInventory` сейчас только в `PersonalCabinetPage`)
- [ ] ⚪ `public.users.id` тип dev↔prod: `PublicUser.id String @id` без `@db.Uuid` → Prisma создаёт колонку `text`, а прод (Supabase) — `uuid`. Локально ломает `deactivate`/`reactivate`/onboard для онбордённых юзеров (`text = uuid`, 42883). Локально пофикшено разовым `ALTER` (не переживёт migrate reset). Постоянно: добавить `@db.Uuid` в `PublicUser.id` + миграция (в проде no-op, но проверить `migrate deploy` на shared `public.users`). Отдельной веткой, не в PR canAccessPlatform.
- [ ] ⚪ SMTP в Supabase (восстановление пароля) — Этап 3 интеграции
- [ ] ⚪ Ротация секретов + миграция домена `knzteam.ru → megapolis.media` — Этап 3, по `SECRET-ROTATION.md`/`INTEGRATION.md`
- [ ] ⚪ Переименование проекта в коде (пакеты `@nexus/*` уже ок; докер/заголовки/домены) — задача из шапки CLAUDE.md
- [ ] ⚪ Дробление god-файлов фронта (TasksPage 1621 стр., ChatsPage 1375, ProjectsPage 1170) — естественно делать при переносе на дом-кит

---

## Обсудить (не решено)

- `GET /tasks?scope=team` — все задачи видны любому сотруднику: осознанная прозрачность или ограничить ролью?
- Физическое удаление групповых чатов (DELETE /chats/:id) при политике soft-delete сообщений — ок или переводить в архив?
- `tempPassword` открытым текстом в БД/админ-списках — принятый компромисс (раздача лично), зафиксировать в CLAUDE.md как осознанный.



