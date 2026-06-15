# Ротация секретов (плановая)

> **Зачем:** в истории git (приватный репо `Knyazzer/PlanOtchetGlot`) ранее были закоммичены реальные `JWT_SECRET` и пароль БД (`nexus_role`). Из текущих файлов вычищены (коммит `e2ffb77`), но в истории остаются. Репо приватный → не аврал, но секреты считать скомпрометированными и ротировать.
>
> **Важно:** ротация `JWT_SECRET` инвалидирует ВСЕ сессии (все перелогинятся) и затрагивает оба приложения (Nexus + Inventory) → согласовать окно с коллегой.

Все действия — на VDS (`ssh root@<VDS_IP>`). Реальные значения держать в `docs/CREDENTIALS.md` (gitignored).

---

## 1. Ротация `JWT_SECRET` (Supabase) — самое важное

`ANON_KEY` и `SERVICE_ROLE_KEY` — это JWT, **подписанные** `JWT_SECRET`. При смене секрета их надо перегенерировать.

```bash
# 1. Новый секрет (40+ символов)
openssl rand -base64 48 | tr -d '\n'; echo    # → новый JWT_SECRET

# 2. Перегенерировать ANON_KEY и SERVICE_ROLE_KEY новым секретом.
#    Payloads (как в Supabase): {"role":"anon","iss":"supabase","iat":...,"exp":...}
#    и {"role":"service_role",...}. Подписать HS256 новым JWT_SECRET.
#    Проще всего — скриптом supabase (self-hosted) или любым jwt-генератором.
```

**3. Обновить Supabase-стек** (папка docker-compose Supabase на сервере, обычно `~/supabase/docker` — уточнить):
```bash
cd <SUPABASE_DIR>
# в .env заменить: JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY (новые)
docker compose down && docker compose up -d   # рестарт kong/auth/rest/studio с новыми ключами
```

**4. Обновить Nexus** (`~/nexus/.env`):
```env
JWT_SECRET=<новый — должен совпадать с Supabase, иначе api не проверит токены>
SUPABASE_SERVICE_ROLE_KEY=<новый service_role>
```
Затем перезапустить api: `cd ~/nexus && docker compose -f docker-compose.prod.yml up -d --force-recreate api`.

**5. Обновить web-сборку** (анон-ключ вшивается в образ на build):
- GitHub → Settings → Secrets → `SUPABASE_ANON_KEY` = новый anon-ключ.
- Запушить любой коммит в `master` (или перезапустить CD) → пересоберётся `nexus-web` с новым ключом.

**6. Inventory (коллега):** обновить его `VITE_SUPABASE_ANON_KEY` (+ SERVICE_ROLE если используется) и пересобрать. Без этого его фронт перестанет ходить в Supabase.

**7. Проверка:**
```bash
# token-grant новым anon-ключом должен вернуть access_token
curl -s -X POST "https://auth.knzteam.ru/auth/v1/token?grant_type=password" \
  -H "apikey: <НОВЫЙ_ANON>" -H "Content-Type: application/json" \
  --data '{"email":"<admin>","password":"<pwd>"}' | head -c 80
# вход в nexus.knzteam.ru работает; старые токены/сессии отвалились
```

---

## 2. Ротация пароля роли `nexus_role`

Старый пароль (`REDACTED_DB_PASS`) был в истории. Сменить:
```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres -c \
  "ALTER ROLE nexus_role WITH PASSWORD '<НОВЫЙ_ПАРОЛЬ>';"
```
Обновить строки подключения, где используется `nexus_role` (в `docs/CREDENTIALS.md` и у кого они прописаны).
> Прод Nexus коннектится под ролью `postgres`, не `nexus_role` — на рантайм Nexus смена пароля nexus_role не влияет. Но роль с доступом к БД скомпрометирована → ротировать. При желании сменить и пароль `postgres` (тогда обновить `DATABASE_URL` в `~/nexus/.env` + рестарт api).

---

## 3. (Опционально) Чистка истории git

Секреты остаются в прошлых коммитах. Репо приватный → не критично. Если нужно вычистить:
```bash
# git-filter-repo (рекомендуется) — вычистить строки из всей истории
pip install git-filter-repo
git filter-repo --replace-text <(echo 'REDACTED_DB_PASS==>REDACTED'; echo 'REDACTED_JWT_SECRET==>REDACTED')
git push --force --all
```
> ⚠️ Перезаписывает историю → все коллабораторы должны заново склонировать. Делать осознанно и согласованно. После ротации (п.1-2) старые значения и так бесполезны.

---

## Чеклист
- [ ] Новый `JWT_SECRET` сгенерирован
- [ ] Новые `ANON_KEY` / `SERVICE_ROLE_KEY` (подписаны новым секретом)
- [ ] Supabase-стек перезапущен с новыми значениями
- [ ] `~/nexus/.env` обновлён (JWT_SECRET, SERVICE_ROLE_KEY) + api перезапущен
- [ ] GitHub secret `SUPABASE_ANON_KEY` обновлён → web пересобран (CD)
- [ ] Inventory обновил anon-ключ и пересобрался (коллега)
- [ ] Пароль `nexus_role` сменён, строки подключения обновлены
- [ ] Вход в оба приложения проверен; `docs/CREDENTIALS.md` обновлён
- [ ] (опц.) История git вычищена + force-push
