# Модель дня: разделение «место» и «статус» (спека)

> Черновик, 2026-08-08. Решение Влада: разделить где работает (место) и что за день (статус).
> Основа консистентности «одна сущность — один источник» ([[nexus-single-source-consistency-audit]]).
> Память: [[nexus-cabinet-requests-goals-decisions]].

## Проблема

Сейчас `DayEntry.dayFormat` смешивает ДВА понятия:
- **место работы** (office/remote/project/trip) и
- **статус дня** (weekend/vacation/sick/dayoff).

Из-за этого нельзя «работать во время отпуска» (место затирает статус), и статус/место рассинхронизированы между экранами.

## Целевая модель

Две независимые оси у **факта дня** (`DayEntry`):

- **`status`** — что за день: `working` | `weekend` | `vacation` | `sick` | `dayoff`.
  - `working` — сотрудник работает (обычный/переопределённый рабочий день).
  - `weekend` — календарный выходной (сб/вс); работать МОЖНО (тогда добавляется place + время → фактически working-в-выходной, но статус остаётся weekend для «он вышел в выходной»).
  - `vacation` / `sick` — отсутствие (из одобренной Заявки); работать можно (факт время+место), статус НЕ теряется.
  - `dayoff` — личный отгул (из Заявки); железобетон не работает.
- **`place`** — где работает (когда есть работа): `office` | `remote` | `project` | `trip`. `null` если не работал.
- **`startTime` / `endTime` / `breakMin`** — факт времени (как есть).

**План (WorkSchedule)** — базовый выбор по дням недели: значение = место (`office`/`remote`) ИЛИ `weekend` (сб/вс). Из плана выводится статус: место → working, `weekend` → weekend. План не меняем структурно (значение = place-or-weekend).

**Факт vs план:** нет `DayEntry` → показывается план. Есть — факт (override). «↺ По расписанию» удаляет override.

## Схема (миграция)

```prisma
model DayEntry {
  // ...существующее...
  dayFormat  String   // РЕПОКУПАЕТСЯ как STATUS: working|weekend|vacation|sick|dayoff
  place      String?  @map("place")   // office|remote|project|trip (null — не работал)
  // startTime/endTime/breakMin — без изменений
}
```

**Data-миграция существующих строк:**
- `dayFormat IN (office,remote,project,trip)` → `place = dayFormat`, `dayFormat = 'working'`.
- `dayFormat IN (weekend,vacation,sick,dayoff)` → `place = NULL`, `dayFormat` без изменений.

**Форматы (DayFormatVersion) → статусы** (isWork/score по статусу):
- `working` (isWork true, score 0), `weekend` (false, null), `vacation` (false, 0.55), `sick` (false, 0.55), `dayoff` (false, null).
- Места (office/remote/project/trip) — НЕ форматы БД, а справочник в коде (label + опц. score-надбавка, напр. trip=командировка ×1.5 — вынести отдельно, чтобы не потерять). Škала score по месту — уточнить (сейчас trip 1.5).

## Слои для правки (по порядку)

1. **Schema + миграция** (add `place`; data-migrate dayFormat→status/place; форматы→статусы).
2. **`day-entries`**: контракт PUT/GET (place отдельно); `workMinutes` не трогаем (время). `dayFormatsAt`/score — по статусу; надбавка места (trip) — отдельно.
3. **`svod` / `analytics`**: isWork/score считать по статусу + место-надбавка; вывод места где нужно.
4. **presence** (`/work-schedule/presence`): «кто работает» по статусу (working/weekend+время) + место в детали.
5. **DayFillCard**: статус (working/weekend/absence) + место-чипы (place) независимо; «Начать» требует place; отпуск/больничный — статус + опц. лог работы (место+время) без потери статуса.
6. **Заявки → отражение** (Этап 4): одобрено vacation/sick/dayoff → `DayEntry.status` на дни диапазона (place=null); виден в кабинете/календаре/presence/счётчиках. **Отзыв** одобренной → откат статуса к расписанию.
7. **Календарь**: отсутствия (vacation/sick/dayoff) → CalendarEntry hr_* или чтение из DayEntry.status — выбрать единый источник (не дублировать).
8. **Тесты**: workMinutes (есть), новые — status/place маппинг, presence, reflection.

## Консистентность (обязательно)

Один источник статуса дня (DayEntry.status) → все представления (кабинет/календарь/presence/счётчики) читают его; любая мутация инвалидирует все ключи в обе стороны. Отсутствие (отпуск) существует в ОДНОМ месте (заявка→DayEntry.status), остальные — производные.
