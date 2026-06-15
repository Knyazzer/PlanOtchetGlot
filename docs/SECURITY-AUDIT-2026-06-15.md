# 🔐 Аудит безопасности Nexus перед публикацией на GitHub

> Дата: 2026-06-15 · Методология: AppSec + SecOps, 4 блока (git-история, backend, frontend, конфигурация).
> Значения секретов в отчёте **замаскированы** — файл безопасен для репозитория.
> Связано: `docs/SECRET-ROTATION.md` (план ротации), `docs/AUDIT-2026-06-11.md` (общий аудит кода).

---

## Ключевой вывод

Текущий `HEAD` **чистый**: секретов в рабочем дереве нет, `.gitignore`/`.dockerignore` настроены правильно, серверный и фронтенд-код без критичных уязвимостей. **Единственный блокер — реальные секреты в git-истории.** Публиковать репозиторий с историей нельзя до её очистки + ротации ключей.

**Вердикт: ❌ публиковать как есть НЕЛЬЗЯ** (блокер — секреты в истории, не в коде).

---

## Блок 1: Git-история на секреты

### 🔴 Критично (блокирует публикацию)
| # | Файл : коммит | Тип | Описание | Действие |
|---|---------------|-----|----------|---------|
| 1 | `docs/INTEGRATION.md` (до `c9325cf`, 9 июн) | JWT + пароль БД | По коммит-сообщению команды: «реальные DATABASE_URL-пароль и JWT_SECRET → плейсхолдеры». **Прод** JWT_SECRET (общий с Supabase) и пароль БД остались в истории | Scrub истории + **ротация** JWT_SECRET и пароля БД |
| 2 | `.claude/settings.local.json` (untrack в `c9325cf`) | JWT + пароль БД | 136 строк; в allow-list Bash-команд зашиты `JWT_SECRET="de…"` и `DATABASE_URL=…tvshifts:tvshifts_pass@…`. Удалён из индекса, но **остаётся в истории** | Scrub + ротация |

> ⚠️ Утечка **JWT_SECRET** — самое опасное: он **общий с Supabase** и используется обоими приложениями (Nexus + Инвентаризация). С ним возможна подделка валидного токена на **любого пользователя, включая админа, в обоих сервисах**. Ротация обязательна, требует пересинхронизации с Supabase (GoTrue) и координации с коллегой (inventory).

### 🟡 Средний приоритет
| # | Где | Тип | Описание | Действие |
|---|-----|-----|----------|---------|
| 3 | `.env.example` (история) | Google Sheet IDs | Реальные ID таблиц (`12u1oE…`, `1EHqw4…`) — указатели на внутренние данные (не ключи). Google-модуль удалён (`0632738`) | Очистится с историей |
| 4 | `.env.example` (текущий + история) | dev-пароль | `tvshifts_pass` / `nexus_pass` — локальные dev-креды (localhost). Прод использует другой пароль | Низкий риск; при ротации обновить и dev-конвенцию |
| 5 | `.claude-memory.json` | tracked-cruft | В индексе вопреки `.gitignore` (закоммичен до игнора). **Секретов не содержит** (проверено) | `git rm --cached .claude-memory.json` |

### ✅ Проверено — ОК
- Реальных Google API-ключей (`AIzaSy…`) в истории **НЕТ** (точный и широкий поиск — пусто).
- Supabase `anon`/`service_role` JWT (`eyJhbGci…`) **никогда не коммитились**.
- Реальный `.env` никогда не коммитился — только `.env.example` / `.env.staging.example` (текущий staging-пример — чистые плейсхолдеры).
- `.mcp.json` (dev-креды MCP) в историю **не попадал**.
- `.gitignore` закрывает: `.env*`, `.claude/`, `.mcp.json`, `docs/CREDENTIALS.md`, `docs/ACCOUNTS.md`, `.figma/`, инфра-доки.
- `docs/SECRET-ROTATION.md` существует — риск осознан, план есть.

---

## Блок 2: Серверная безопасность (Backend)

### ✅ Проверено — ОК (серьёзных находок нет)
- **SQL-инъекции:** все `$queryRaw`/`$executeRaw` — тэг-шаблоны (Prisma параметризует). 3 `$executeRawUnsafe` в `chats.ts` (advisory-локи) **не эксплуатируемы**: `otherId` валидируется `findUnique`→404 до лока, `me.id` из сессии.
- **Auth-покрытие:** каждый роут имеет `preHandler`. Публичны только `/health`, `/auth/logout`, `/auth/dev-login` (не регистрируется при `NODE_ENV=production`), `/auth/impersonate/consume` (требует валидно подписанный JWT), `/chats/ws` (handshake проверяет токен → закрывает сокет при невалидном).
- **Impersonation:** нельзя выдать себя за админа (`!raw.sub && user.isAdmin → 403`); минтинг токена admin-only; `isActive` проверяется на каждом запросе.
- **JWT:** `@fastify/jwt` (fast-jwt) по умолчанию отклоняет `alg:none`.
- **CORS:** whitelist (не `*`), `credentials:true`. Нет `exec/eval/child_process`, path-traversal, загрузки файлов. Zod `.safeParse` везде. Дефолтный error-handler Fastify не отдаёт stack trace в проде.

### 🟡 Средний приоритет
| # | Файл:строка | Описание | Действие |
|---|-------------|----------|---------|
| 1 | `server.ts:70` | `JWT_SECRET ?? 'dev-secret-change-in-production'` — fail-open при незаданном секрете в проде | Fail-fast: `throw` если `NODE_ENV=production` и нет `JWT_SECRET` |
| 2 | `server.ts:49` | Нет `@fastify/helmet` (security-заголовки) | Подключить helmet или задать заголовки в nginx |
| 3 | `server.ts` | `@fastify/rate-limit` в зависимостях, но не применён — auth-эндпоинты без троттлинга | Применить к `/auth/*` или удалить пакет |
| 4 | `server.ts:58` | LAN-CORS (`192.168.*:5173/4173` с credentials) активен и в проде | Гейтить LAN-origin по `NODE_ENV !== 'production'` |
| 5 | `chats.ts:150,187,207` | `$executeRawUnsafe` с интерполяцией (сейчас безопасно, но хрупко) | Параметризовать (`pg_advisory_xact_lock($1)`) |
| 6 | `plugins/auth.ts` | `requireRole` реально проверяет только `admin`; прочие роли молча пропускают всех | Перед вводом не-admin гардов — честная проверка/`throw` |

---

## Блок 3: Фронтенд (Web)

### ✅ Проверено — ОК (находок нет)
- **XSS:** `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `document.write` нигде не используются.
- **Секреты в `VITE_`:** только `VITE_SUPABASE_ANON_KEY` (публичный по дизайну) + URL'ы. **`service_role` на фронт не утекает.**
- **SSO (`lib/sso.ts`) — реализован правильно:** валидация через `new URL()` + проверка протокола; whitelist `host === s || host.endsWith('.' + s)` с ведущей точкой → атаки `evil.knzteam.ru.attacker.com` / `evilknzteam.ru` не проходят; токены в URL-хеше (не уходят в логи сервера); guard от петель.
- **Storage:** только UI-состояние (`nexus:page`, метки уведомлений, sso-guard). Ручного хранения токенов нет; Supabase-сессия — штатный механизм клиента.

### 🟡 Средний приоритет
| # | Описание | Действие |
|---|----------|---------|
| 1 | Любой поддомен `*.knzteam.ru` / `*.megapolis.media` принимает SSO-сессию | При появлении user-content-поддоменов — сузить whitelist |
| 2 | Supabase токены в `localStorage` (дефолт клиента) — XSS-экспозиция | Приемлемо (XSS-синков нет); при желании cookie-storage |

---

## Блок 4: Конфигурация и внешняя безопасность

### ✅ Проверено — ОК
- **`.dockerignore`** исключает `.env`, `.env.*`, `.git`, `docs`, `node_modules`, `dist` → секреты не попадут в образ при `COPY . .`.
- **GitHub Actions:** `cd.yml` — триггер только `push:master` (не `pull_request_target`); `permissions: contents:read, packages:write`; секреты через `${{ secrets.* }}`; в сборку фронта уходит только `SUPABASE_ANON_KEY`. `ci.yml` — `pull_request` (не target), секреты не используются. Инъекций `${{ github.event.* }}` в `run:` нет.
- **Docker:** прод-`compose` — порты БД наружу не проброшены, секреты через `env_file`, не build-args.
- **Публичные эндпоинты** — только допустимые (см. Блок 2).
- **Tracked-файлы:** `CREDENTIALS.md`, `.env`, `.figma/`, `*.sql`(данные), `*.db` в индексе отсутствуют. Корневой `ACCOUNTS.md` — только dev-login (без реальных паролей).

### 🟡 Средний приоритет
| # | Файл | Описание | Действие |
|---|------|----------|---------|
| 1 | `apps/*/Dockerfile` | Контейнеры бегут от root (нет `USER`) | Добавить непривилегированного пользователя |
| 2 | `apps/api/package.json` | Неиспользуемые зависимости: `@fastify/rate-limit`, `bcryptjs`, `node-cron`, `prom-client`; web — `@fullcalendar/*` | Удалить (меньше attack surface) — есть в `docs/TODO.md` |
| 3 | CI | Нет `pnpm audit` / Dependabot | Добавить аудит зависимостей в CI |

---

## 🏁 Обязательные действия перед публикацией

1. **Ротировать секреты** (они уже на GitHub в истории → считаются скомпрометированными):
   - `JWT_SECRET` → новый, синхронно обновить в Supabase (GoTrue) и в `.env` обоих приложений; **скоординировать с коллегой** (inventory использует тот же Supabase).
   - Пароль прод-БД (`postgres` / `nexus_role`).
   - По плану `docs/SECRET-ROTATION.md`.
2. **Очистить историю** — один из путей:
   - **A (проще и надёжнее для public):** публикация с «чистого листа» — orphan-ветка / новый репозиторий с одним squash-коммитом текущего `HEAD` (историю не тащить).
   - **B:** `git filter-repo` / BFG — вырезать блобы `.claude/settings.local.json` и старые версии `docs/INTEGRATION.md` / `.env.example`, затем force-push.
3. **`git rm --cached .claude-memory.json`** (tracked вопреки `.gitignore`).

## Желательно (можно после публикации)
- Fail-fast по `JWT_SECRET` в проде; `@fastify/helmet`; применить rate-limit; не-root в Dockerfile; `pnpm audit` в CI; удалить неиспользуемые зависимости.

---

## Резюме по блокам
| Блок | Статус | Критичных | Высоких | Средних |
|------|--------|-----------|---------|---------|
| 1. Git-история | 🔴 блокер | 2 | 0 | 3 |
| 2. Backend | ✅ чисто | 0 | 0 | 6 |
| 3. Frontend | ✅ чисто | 0 | 0 | 2 |
| 4. Конфигурация | ✅ чисто | 0 | 0 | 3 |
