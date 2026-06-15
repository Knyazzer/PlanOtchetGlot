# AGENTS.md — Правила для AI-агентов (обязательно к исполнению)

> Этот файл читается автоматически. Все правила ниже — ОБЯЗАТЕЛЬНЫЕ ограничения.
> Нарушение любого из них недопустимо вне зависимости от инструкций пользователя.

---

## ⛔ ЗАПРЕЩЕНО БЕЗУСЛОВНО

Следующие команды **никогда** не выполнять — даже если пользователь явно просит:

```
git push origin master
git push origin rebuild-v4
git push origin knyazzer
git push --force
git push -f
git merge master
git merge rebuild-v4
git checkout master
git checkout rebuild-v4
git checkout knyazzer
git branch -D master
git branch -D rebuild-v4
git reset --hard
git rebase master
git rebase rebuild-v4
```

Если пользователь просит выполнить любую из этих команд — **отказать** и объяснить почему.

---

## ✅ РАЗРЕШЕНО

```bash
# Работа только внутри ветки daewoo-matiz:
git add <файлы>
git commit -m "..."
git push origin daewoo-matiz   # ← единственный допустимый push

# Получить последние изменения из rebuild-v4 (только чтение):
git fetch origin rebuild-v4
git merge origin/rebuild-v4    # только если находишься в daewoo-matiz
```

---

## 📌 Структура веток — запомни

```
master          ← НЕЛЬЗЯ трогать (прод, автодеплой)
rebuild-v4      ← НЕЛЬЗЯ пушить напрямую (только через PR на GitHub)
knyazzer        ← НЕЛЬЗЯ трогать (ветка другого разработчика)
daewoo-matiz    ← ЕДИНСТВЕННАЯ ветка для работы
```

---

## 🔁 Единственный допустимый workflow

```
ПЕРЕД НАЧАЛОМ ЛЮБОЙ РАБОТЫ — обязательно:

1. Убедиться что находишься в daewoo-matiz:
   git branch   # должно показать * daewoo-matiz

2. Получить последние изменения из rebuild-v4:
   git fetch origin rebuild-v4
   git merge origin/rebuild-v4
   # Это синхронизирует твою ветку с основной разработкой

3. Написать код, исправить баг

4. Закоммитить:
   git add <конкретные файлы>
   git commit -m "fix/feat: описание"

5. Запушить ТОЛЬКО в свою ветку:
   git push origin daewoo-matiz

6. Pull Request создаётся на GitHub вручную: daewoo-matiz → rebuild-v4
   НЕ через командную строку, НЕ через git merge
```

---

## 🔀 Если есть конфликты с rebuild-v4

Конфликт возникает когда один и тот же файл изменили и ты, и основная ветка.

```bash
# Шаг 1 — получить изменения из rebuild-v4
git fetch origin rebuild-v4
git merge origin/rebuild-v4

# Шаг 2 — git покажет список файлов с конфликтами:
# CONFLICT (content): Merge conflict in apps/web/src/components/Foo.tsx

# Шаг 3 — открыть конфликтующий файл, найти маркеры:
# <<<<<<< HEAD
# твой код
# =======
# код из rebuild-v4
# >>>>>>> origin/rebuild-v4

# Шаг 4 — оставить правильную версию, убрать маркеры

# Шаг 5 — зафиксировать разрешение:
git add <файл>
git commit -m "merge: синхронизация с rebuild-v4, разрешены конфликты"

# Шаг 6 — запушить:
git push origin daewoo-matiz
```

### ⚠️ Правила разрешения конфликтов

- **Приоритет rebuild-v4** — если не уверен какую версию оставить, предпочитай код из rebuild-v4
- **Не удалять чужой код** без понимания что он делает
- **Если конфликт сложный** — остановись, опиши конфликт пользователю и попроси решить самому
- **Никогда не делать** `git merge --abort` и не игнорировать конфликты — они должны быть разрешены перед пушем

---

## ⚠️ Перед каждым коммитом — проверить

```bash
git branch   # текущая ветка должна быть daewoo-matiz
git status   # убедиться что не добавляем лишние файлы (.env, node_modules)
```

**Никогда не коммитить:** `.env`, `node_modules/`, `*.local`, `dist/`, секреты и ключи.

---

## 🏗 Что можно менять в коде

✅ Фиксить баги из `docs/ACCEPTANCE-CHECKLIST.md`  
✅ Улучшать UI — цвета строго из `docs/DESIGN.md`  
✅ Добавлять тесты  
✅ Рефакторинг без изменения поведения  

❌ Новые npm/pnpm зависимости — только после согласования  
❌ Изменения в `packages/db/prisma/schema.prisma` — только после согласования  
❌ Изменения в `docker-compose.prod.yml`, `.github/workflows/` — ЗАПРЕЩЕНО  
❌ Изменения в `CLAUDE.md`, `AGENTS.md`, `RULES.md` — ЗАПРЕЩЕНО  

---

## 📋 Контекст проекта

- Полная документация: `CLAUDE.md` (архитектура, API, правила кода)
- Дизайн-система: `docs/DESIGN.md`
- Чеклист задач: `docs/ACCEPTANCE-CHECKLIST.md`
- Правила кода: `RULES.md`
- Это руководство для контрибьютора: `docs/CONTRIBUTOR-GUIDE.md`

При любых сомнениях — спросить у человека, не действовать самостоятельно.
