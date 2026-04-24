# GitHub — рабочий процесс

Инструкция по работе с ветками, CI и (в будущем) CD.

---

## Ветки

| Ветка | Назначение |
|-------|-----------|
| `master` | Стабильная версия. Только проверенный код. CI запускается при каждом пуше и PR. |
| `development` | Рабочая ветка. Пуши с любого компа, CI **не запускается**. |

---

## Обычная работа (каждый день)

```bash
git checkout development

# ... пишешь код ...

git add .
git commit -m "что-то сделал"
git push          # CI не запускается
```

**С другого компа** — подтянуть последние изменения:

```bash
git checkout development
git pull
```

---

## Перенос версии в master (через Pull Request)

1. Идёшь на GitHub → репо → вкладка **Pull requests**
2. Нажимаешь **New pull request**
   - `base: master` ← `compare: development`
3. Нажимаешь **Create pull request**
4. CI запускается автоматически (lint → tsc → test → build)
5. Когда все джобы зелёные — нажимаешь стрелку рядом с кнопкой merge и выбираешь **Squash and merge**
6. Все коммиты из `development` схлопываются в **один** коммит в `master`

После мержа подтянуть master в development:

```bash
git checkout development
git pull origin master
git push
```

---

## CI — Continuous Integration

**Что такое CI:** автоматическая проверка кода при каждом пуше в `master` или открытии PR. Запускается на GitHub, результат виден в интерфейсе PR.

**Когда запускается:** push в `master` или pull request → `master`.

**Джобы** (запускаются параллельно, `build` ждёт все три):

| Джоб | Команда | Что проверяет |
|------|---------|---------------|
| Lint | `pnpm --filter @tv-shifts/web exec eslint .` | Качество кода (ESLint) |
| TypeScript | `tsc --noEmit` (web) + `build` (api) | Типы без ошибок |
| Test | `pnpm test` | 163+ тестов, реальная PostgreSQL в Docker |
| Build | `pnpm build` | Продакшн-сборка компилируется |

**Файл конфигурации:** `.github/workflows/ci.yml`

**Запустить локально** (то же самое что делает CI):

```bash
# Линтинг
pnpm --filter @tv-shifts/web exec eslint .

# TypeScript
pnpm --filter @tv-shifts/web exec tsc --noEmit
pnpm --filter @tv-shifts/api build

# Тесты (нужна запущенная тест-БД)
docker compose -f docker-compose.dev.yml up -d
pnpm db:migrate:test
pnpm test

# Сборка
pnpm build
```

**Тест-база:** CI поднимает PostgreSQL как Docker-сервис автоматически. Локально нужен `postgres_test` на порту 5434 (`docker-compose.dev.yml` его уже содержит).

---

## CD — Continuous Deployment

> Будет описано после настройки автодеплоя на сервер.

Планируется: после успешного мержа в `master` — автоматический деплой на staging, затем ручное подтверждение для prod.
