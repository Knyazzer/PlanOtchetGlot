# Корпоративная SSO-архитектура Megapolis

## Принцип

Один аккаунт на всю компанию. Каждое приложение управляет своими правами независимо.

**Identity Provider:** Supabase Auth (self-hosted, офисный сервер)  
**Точка входа для сотрудника:** `nexus.knzteam.ru` (Nexus). Домен `megapolis.media` — будущее, подключим позже сменой env.

---

## Субдомены

Сейчас зона `knzteam.ru` (прод), `megapolis.media` — будущее (только смена env):

```
nexus.knzteam.ru        → Nexus — операции, задачи, чат, HR
inventory.knzteam.ru    → Инвентаризация — учёт оборудования
cloud.knzteam.ru        → Облако — файловое хранилище
db.knzteam.ru           → Supabase Studio (только офисная сеть / VPN)
auth.knzteam.ru         → Supabase Auth API (GoTrue через Kong) — это API, не страница входа
```

---

## Как работает авторизация

```
1. Сотрудник логинится в Nexus (nexus.knzteam.ru)
         ↓
2. Supabase Auth выдаёт JWT-токен
         ↓
3. Токен путешествует с пользователем
         ↓
4. Inventory / Cloud принимают тот же токен
         ↓
5. Каждое приложение видит ФИО и должность из public.users
   и назначает свои внутренние права через своего админа
```

**Как валидируется токен:**
- **Nexus** валидирует токен сам — по подписи (`request.jwtVerify`, общий `JWT_SECRET` с Supabase). Юзер резолвится по `auth_id` (= JWT `sub`); права админа — по `nexus.users.isAdmin`. См. `apps/api/src/plugins/auth.ts`.
- **Inventory / Cloud** валидируют через `supabase.auth.getUser(token)` — это сценарий Этапа 2 (на стороне inventory, ещё не сделано).

---

## Источник истины — `public.users`

Справочник сотрудников компании. Только идентификация — никаких прав приложений.

```sql
CREATE TABLE public.users (
  id          uuid PRIMARY KEY,  -- = auth.users.id из Supabase Auth
  email       text UNIQUE NOT NULL,
  name        text NOT NULL,
  position    text,              -- должность: 'видеооператор', 'HR' и т.д.
  department  text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

- Пишет **только Nexus**
- Читают все приложения
- `id` всегда равен `auth.users.id` — жёсткое правило

---

## Ролевые модели — полная изоляция

Nexus не знает какие роли есть в Inventory. Inventory не знает какие роли есть в Nexus.

```
public.users          →  только ФИО, должность, отдел
                               ↓                    ↓
                           Nexus              Inventory
                        свои роли            свои роли
                        свои права           свои права
                        свой админ           свой админ
```

Сотрудник приходит в приложение → приложение видит его ФИО и должность → **админ этого приложения** назначает ему роль и права внутри.

---

## Управление пользователями

- **Онбординг** — только через Nexus, **вручную админом**: `POST /auth/onboard/:id` создаёт аккаунт в Supabase Auth сразу с **временным паролем** (`genTempPassword`), который возвращается админу (передаёт сотруднику лично). Саморегистрации нет; magic link / `resetPasswordForEmail` не используется.
- **Права в каждом приложении** — назначает мастер-админ этого приложения независимо
- **Бан в одном приложении** не влияет на доступ к другим

---

## Текущее состояние

| | Сейчас | Цель (Этап 2) |
|--|--------|----------------|
| Nexus auth | Supabase Auth ✅ | Supabase Auth ✅ |
| Inventory auth | Supabase Auth ✅ | Supabase Auth ✅ |
| Общий `public.users` | создан и заполнен на проде ✅ (v.gerwald, m.gurtsev) | заполнен реальными данными ✅ |
| Единый токен | реализован и задеплоен ✅ (SSO-портал) | да |

### Что нужно сделать (до Этапа 2)
- [x] Мигрировать авторизацию Nexus с `@fastify/jwt` на Supabase Auth (миграция `20260609_sso_multischema`, `passwordHash` удалён)
- [x] Задеплоить Nexus на VDS (`nexus.knzteam.ru`)
- [ ] Задеплоить Инвентаризацию на VDS (`inventory.knzteam.ru`)
- [x] Заполнить `public.users` после деплоя Nexus