# Ранбук: проверка БД перед деплоем (2026-08-27)

> Цель: после выполнения этого плана деплой `knyazzer → master` можно накатывать на прод безопасно.
> Родитель — [../CLAUDE.md](../CLAUDE.md) (раздел Production). Основание — аудит готовности к деплою (18 миграций, 224 коммита впереди прода).

## Контекст риска (почему это нужно)

- Прод (`master`) отстаёт на **224 коммита / 18 миграций**. Это смена поколения приложения, не инкремент.
- Миграции катятся **автоматически** при старте контейнера: `apps/api/Dockerfile` → `prisma migrate deploy && node server.js`. Если хоть одна миграция падает — **API не стартует, прод ложится**, а БД остаётся частично мигрированной.
- **Бэкапа перед миграцией в пайплайне НЕТ.** Его снимаем руками (Фаза 1).

## Принцип плана — два слоя защиты

1. **Read-only проверки на живом проде** (Фаза 2) — быстро ловят блокеры (дубли, FK, состояние истории миграций). На проде только `SELECT`, ничего не меняем.
2. **Генеральная репетиция на КЛОНЕ прод-БД** (Фаза 3) — прогоняем реальный `migrate deploy` на точной копии. Если все 18 миграций лягут на клон и API поднимется — боевой деплой безопасен. **Это главный предохранитель.**

## Пре-реквизиты

- Строка подключения к прод-БД — из `docs/CREDENTIALS.md` (gitignored). **Не коммитить и не цитировать.** Дальше в командах — плейсхолдер `<PROD_URL>`.
- Доступ к проду: SSH на VDS или `docker exec` в контейнер Postgres (psql внутри).
- `pg_dump`/`pg_restore` версии, совместимой с прод-Postgres.
- Пустая БД под клон: staging (`docker-compose.staging.yml`) или локальный Postgres — плейсхолдер `<CLONE_URL>`.
- ⛔ До Фазы 4 на проде выполняем **только `SELECT`**.

---

## Фаза 0 — Зафиксировать исходное состояние

На проде (сохранить вывод — сверим после деплоя):
```sql
SELECT count(*) AS users     FROM nexus.users;
SELECT count(*) AS tasks     FROM nexus.tasks;
SELECT count(*) AS day_ent   FROM nexus.day_entries;
SELECT count(*) AS chats     FROM nexus.chats;
SELECT count(*) AS pub_users FROM public.users;
```
Записать git-SHA текущего прод-образа (для отката).

---

## Фаза 1 — Бэкап прода (ОБЯЗАТЕЛЬНО)

```bash
pg_dump --format=custom --no-owner --no-privileges \
  --schema=public --schema=nexus --schema=auth \
  "<PROD_URL>" -f nexus-prod-20260827.dump
```
- Схему `auth` включаем, чтобы клон был точной копией для проверки FK на `public.users`.
- Убедиться в успехе и вменяемом размере. Хранить **вне репозитория**.
- Этот дамп — И артефакт отката, И источник клона для Фазы 3.

---

## Фаза 2 — Read-only проверки на проде

### 2.1 🔴 Дубли табельных (блокер: `add_user_tabnumber_unique`)
```sql
SELECT "tabNumber", count(*)
FROM nexus.users
WHERE "tabNumber" IS NOT NULL
GROUP BY "tabNumber" HAVING count(*) > 1;
```
- **Ожидание: 0 строк.**
- Если есть дубли → `CREATE UNIQUE INDEX` упадёт, прод не поднимется. Развести дубли до деплоя (перевыдать табельный или обнулить у лишних: `UPDATE nexus.users SET "tabNumber"=NULL WHERE id='...'`). NULL-ы конфликта не дают.

### 2.2 🔴 Входящие FK на `public.users(id)` (блокер: `add_posts_pulse`)
Миграция делает `ALTER COLUMN "id" SET DATA TYPE TEXT` на PK `public.users`. Если на эту колонку ссылается внешний FK — ALTER упадёт.
```sql
SELECT conname, conrelid::regclass AS from_table
FROM pg_constraint
WHERE confrelid = 'public.users'::regclass AND contype = 'f';
```
- **Ожидание: 0 строк** (тогда смена типа пройдёт).
- Если строки есть → миграцию #2 надо дорабатывать (drop/recreate FK) — это выявит и Фаза 3.

Заодно — не применён ли тип уже (следствие возможной divergence):
```sql
SELECT data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name='users' AND column_name='id';
```
- `uuid` → миграция сработает штатно. `text` → миграция #2 уже применялась вне истории (сверить в 2.3).

### 2.3 🔴 История миграций / sso-divergence
Прод хранит sso-миграцию под **старым** именем `20260609_sso_multischema`; в релизе она переименована в `20260609100000_sso_multischema`.
```sql
-- Незавершённые/провальные миграции заблокируют deploy:
SELECT migration_name, started_at, finished_at, rolled_back_at
FROM "_prisma_migrations"
WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL;

-- Проверка имён sso:
SELECT migration_name, finished_at FROM "_prisma_migrations"
WHERE migration_name LIKE '%sso_multischema%';
```
- **Ожидание:** первый запрос — пусто (нет застрявших миграций). Второй — есть `20260609_sso_multischema`, нет `20260609100000_…`.
- Если есть застрявшая (failed) миграция → прод в состоянии, где `migrate deploy` откажется; нужен `prisma migrate resolve` (решать отдельно).
- Divergence по имени сама по себе безопасна (новую тело-миграцию guard превратит в no-op), но **это должна подтвердить Фаза 3** — там `migrate deploy` реально отработает на клоне.

### 2.4 Распределение `day_format` (инфо: `dayentry_place_split`)
```sql
SELECT day_format, count(*) FROM nexus.day_entries GROUP BY day_format ORDER BY 2 DESC;
```
- Значения `office/remote/project/trip` переедут в `place`, статус станет `working`; `weekend/vacation/sick/dayoff` останутся. Неожиданные значения не теряются (остаются как есть) — просто знать, что они есть.

### 2.5 Guard sso сработает
```sql
SELECT to_regclass('nexus.users');   -- НЕ NULL → guard делает RETURN (no-op). Ожидается имя таблицы.
```

### Про `manual_order` (потеря данных, не блокер)
Миграция `task_day_order` делает `DROP COLUMN nexus.tasks.manual_order` без backfill. Прод колонку имеет — пользовательский порядок задач сбросится (заменяется per-day порядком в новой таблице). Осознанно принять; отдельная проверка не нужна.

---

## Фаза 3 — Генеральная репетиция на клоне (главный предохранитель)

1. Создать пустую БД и восстановить дамп:
```bash
createdb nexus_clone   # или через контейнер staging
pg_restore --no-owner --no-privileges -d "<CLONE_URL>" nexus-prod-20260827.dump
```

2. Прогнать **ту же команду, что в контейнере** прода:
```bash
DATABASE_URL="<CLONE_URL>" pnpm --filter @nexus/db exec prisma migrate deploy
```
- **Ожидание:** все 18 миграций применяются без ошибок. Любая ошибка здесь = точная копия того, что случится на проде → чинить до боевого пуша.

3. Проверить итог:
```bash
DATABASE_URL="<CLONE_URL>" pnpm --filter @nexus/db exec prisma migrate status
```
- Ожидание: «Database schema is up to date».
- Сверить счётчики строк с Фазой 0 (данные на месте, ничего лишнего не удалено).

4. Поднять API против клона и smoke-тест:
```bash
DATABASE_URL="<CLONE_URL>" pnpm --filter @nexus/api dev
```
- Логин (dev-login), `/health` = 200, открыть Задачи / Календарь / Стратегию / Свод — ответы 200, не 500.

5. (Опц., максимально боевой сценарий) собрать прод-образ api и прогнать его CMD против клона — проверяет и `migrate deploy`, и старт `node dist/server.js` в одном флоу.

---

## Фаза 4 — Критерий GO и деплой

**Деплоим только если ВСЕ пункты закрыты:**
- [ ] Бэкап снят и проверен (Фаза 1).
- [ ] Дубли `tabNumber` = 0 (или разведены) — 2.1.
- [ ] FK на `public.users` отсутствуют / миграция #2 прошла на клоне — 2.2 + 3.2.
- [ ] `_prisma_migrations` без застрявших миграций; на клоне `migrate deploy` прошёл — 2.3 + 3.2.
- [ ] На клоне легли все 18, `migrate status` = up to date, API поднялся, smoke зелёный — Фаза 3.
- [ ] Прод `.env` содержит все новые обязательные переменные, которые ждёт код (Supabase/VITE-*).

**Деплой:**
- `knyazzer → dev → PR → master` (аппрув Влада; push в master = автодеплой CD).
- Окно низкой нагрузки (миграции блокируют старт API).
- Бэкап держать под рукой.

---

## Фаза 5 — Пост-деплой (сразу после старта)

```bash
# на проде
pnpm --filter @nexus/db exec prisma migrate status   # up to date
```
- `/health` = 200; ключевые страницы (Задачи/Календарь/Стратегия/Свод/Аналитика) = 200.
- Счётчики строк ≈ значениям Фазы 0 (миграции ничего лишнего не удалили).
- Мониторинг ошибок (Grafana Alloy / логи api) 10–15 минут.

## Откат (если API не встал)

1. Прод-БД частично мигрирована → восстановить из бэкапа Фазы 1:
   ```bash
   pg_restore --clean --if-exists --no-owner -d "<PROD_URL>" nexus-prod-20260827.dump
   ```
2. Откатить прод-образ на предыдущий master-SHA (Фаза 0).
3. Разобрать, какая миграция упала (лог контейнера), починить на клоне, повторить план.

---

## Сводка блокеров (из аудита)

| # | Миграция | Тип | Проверка |
|---|---|---|---|
| 1 | `add_user_tabnumber_unique` | упадёт при дублях | 2.1 |
| 2 | `add_posts_pulse` (PK `public.users` uuid→TEXT, tz-обрезка) | упадёт при FK | 2.2 + 3 |
| 3 | `add_posts_pulse` history / `sso` rename | divergence | 2.3 + 3 |
| 4 | `task_day_order` (`DROP manual_order`) | потеря порядка (не блокер) | — |
| 5 | `dayentry_place_split` | трансформация данных (обратима) | 2.4 |

12 из 18 миграций — чистый additive, риска не несут. Главный предохранитель против всего перечисленного — **Фаза 3 (репетиция на клоне)**.
