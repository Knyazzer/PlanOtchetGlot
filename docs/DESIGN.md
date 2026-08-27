# DESIGN.md — Дизайн-система Nexus

> ⚠️ **Актуализация 2026-06-11 (rebuild-v4):** канон палитры и типографики — **токены Figma v2**
> (`apps/web/src/styles/kit.css` + перемап в `index.css`): light/dark наборы, шрифт **Inter**
> (+ JetBrains Mono для чисел), сайдбар-группа `--sidebar-*`, акцент индиго `#4f46e5/#6366f1`.
> Таблицы конкретных hex-значений ниже — **исторические** (Urbanist/оранжевый градиент) и
> сохранены для контекста; при расхождении прав kit.css. Раздел «Мобильная версия» — в конце файла.

Единый источник правил визуального языка. Все новые компоненты и страницы должны соответствовать этому документу.
Живой референс — `docs/ui-prototypes/tvshifts-brandbook.html`.

---

## 🎨 Семантические роли цвета (КАНОН, вариант A — утв. 2026-08-06)

> Проблема была: цвета накапливались ад-хок, не было правила «когда какой». Решение — **цвет закреплён за функцией действия**, а не за экраном. Не монохром: несколько акцентов, но у каждого одна роль. Набор взят в **одном тоне** (уровень Tailwind-500) → цвета гармонируют. Источник в коде: `--role-*` в `kit.css` + `lib/roleColors.ts` (держать в синхроне).

| Роль | Hex | Когда | Стиль |
|---|---|---|---|
| **Primary** | `#7B61FF` | главная CTA экрана (Создать/Сохранить/Подтвердить), активная вкладка (soft) | заливка |
| **Success** | `#22C55E` | добавить, начать, положительное | заливка / tonal |
| **Danger** | `#F43F5E` | **только** деструктив (удалить/уволить) | tonal (крас-tint + текст) |
| **Info** | `#0EA5E9` (текст `#38BDF8`) | события, инфо-метки, нейтральный акцент | tonal |
| **Warning** | `#F59E0B` | дедлайны, предупреждения | tonal / chip |
| **Highlight** | `#F97316` | «сейчас/сегодня», линия времени, выделение | маркер/линия |
| **Secondary** | нейтраль (`--border`/`--text-2`) | правка/отмена, вторичное | контур |
| **Ghost** | нейтраль (`--text-3`) | третичное | только текст |

**Паттерны кнопок** (`lib/roleColors.ts`): `filled(role)` — заливка+белый текст; `tonal(role)` — `role+1f` фон, `role` текст, `role+55` рамка; secondary — контур по `--border`; ghost — текст.

**Правила:** ① один Primary на экран (не плодить главные CTA); ② Danger — исключительно для необратимого; ③ Highlight (оранж) не использовать как второй primary — только «сейчас/сегодня»; ④ на экране обычно 2–3 роли одновременно + нейтраль. Внедряется постепенно (пилот — Задачи/Треки); старый оранжевый-primary/малиновый-danger заменяются по мере касания.

---

> 🗄 **НИЖЕ — ИСТОРИЧЕСКИЙ АРХИВ (rebuild-v3 и ранее).** Оранжевый градиент `#FF6B35→#E8194B`,
> шрифт **Urbanist**, конкретные hex и правила цвета/шрифта ниже **устарели** — оставлены для
> контекста и как каталог UI-паттернов. **Источник правды по цветам/шрифтам/токенам —
> `apps/web/src/styles/kit.css`** (Figma v2: Inter + JetBrains Mono для чисел, индиго
> `#4f46e5/#6366f1`, тёмная/светлая темы). НЕ копируйте отсюда значения цвета/шрифта.
> Структурные паттерны (layout, состояния, z-index, скроллбар, мобильная карта) — актуальны.
> Полное переписывание документа под kit.css — отдельная задача (см. HARDENING-EXECUTION.md).

## Темы

Приложение поддерживает **тёмную и светлую тему**. Выбор — за пользователем, сохраняется в его профиле (БД), применяется при каждом входе.

**Дефолт:** тёмная тема.

**Механика:**
- Тема хранится в профиле пользователя (`users.theme: 'dark' | 'light'`)
- При загрузке приложения — читается из профиля и применяется через `data-theme` на `<html>` (`document.documentElement`)
- Переключатель доступен из любой страницы (хедер или профиль)
- Все компоненты используют CSS-переменные — смена темы меняет переменные, стили компонентов не дублируются

**CSS-переменные по темам:**

| Переменная | Тёмная | Светлая |
|------------|--------|---------|
| `--bg` | `#0A0A0C` | `#F4F4F8` |
| `--surface-1` | `#131318` | `#FFFFFF` |
| `--surface-2` | `#1C1C24` | `#F0F0F5` |
| `--surface-3` | `#242430` | `#E4E4EC` |
| `--border` | `rgba(255,255,255,0.07)` | `rgba(0,0,0,0.08)` |
| `--text-1` | `#FFFFFF` | `#0A0A0C` |
| `--text-2` | `#C0C0CC` | `#3A3A4A` |
| `--text-3` | `#8A8A9A` | `#6A6A7A` |
| `--text-muted` | `#464658` | `#9A9AAA` |

Акцентный градиент, `--success`, `--danger`, `--warning` — одинаковы в обеих темах.

```css
/* Применение в коде — на <html> (document.documentElement) */
:root, [data-theme="dark"]  { --bg: #0A0A0C; --surface-1: #131318; /* ... */ }
[data-theme="light"]        { --bg: #F4F4F8; --surface-1: #FFFFFF;  /* ... */ }
```

---

## Палитра

| Переменная | Значение | Использование |
|------------|----------|---------------|
| `--bg` | `#0A0A0C` | Фон страницы |
| `--surface-1` | `#131318` | Фон панелей, хедер, сайдбар |
| `--surface-2` | `#1C1C24` | Фон карточек, инпутов |
| `--surface-3` | `#242430` | Hover-состояние карточек |
| `--border` | `rgba(255,255,255,0.07)` | Разделители, рамки |
| `--text-1` | `#FFFFFF` | Основной текст |
| `--text-2` | `#C0C0CC` | Второстепенный текст |
| `--text-3` | `#8A8A9A` | Подписи, плейсхолдеры |
| `--text-muted` | `#464658` | Лейблы секций, disabled |
| `--accent-s` | `#FF6B35` | Начало акцентного градиента |
| `--accent-e` | `#E8194B` | Конец акцентного градиента |
| `--success` | `#29BF12` | Успех, активный статус |
| `--danger` | `#E8194B` | Ошибка, удаление (без градиента) |
| `--warning` | `#F59E0B` | Предупреждение, средний приоритет |

**Акцентный градиент:**
```css
background: linear-gradient(135deg, #FF6B35, #E8194B);
```

---

## Типографика

**Шрифт:** Urbanist (Google Fonts)
```html
<link href="https://fonts.googleapis.com/css2?family=Urbanist:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
```

| Использование | font-size | font-weight |
|---------------|-----------|-------------|
| Заголовок страницы | 20–24px | 700–800 |
| Заголовок секции | 16px | 700 |
| Лейбл секции (caps) | 10px | 700, letter-spacing: 1px, uppercase |
| Основной текст | 13–14px | 500 |
| Подпись / мета | 11–12px | 400–500 |
| Кнопка | 13px | 600–700 |

---

## Layout страницы

Все страницы используют одну и ту же базовую структуру:

```css
/* body / корневой контейнер */
display: flex; flex-direction: column; height: 100vh; overflow: hidden;
background: var(--bg); font-family: Urbanist, sans-serif; color: var(--text-1);

/* хедер */
height: 64px; flex-shrink: 0;
background: var(--surface-1); border-bottom: 1px solid var(--border);
padding: 0 24px; display: flex; align-items: center; justify-content: space-between;
position: relative; z-index: 10;

/* область контента (под хедером) */
display: flex; flex: 1; overflow: hidden;

/* левый сайдбар (если есть) */
width: 200px; flex-shrink: 0;
background: var(--surface-1); border-right: 1px solid var(--border);
overflow-y: auto; padding: 18px 14px;

/* main */
flex: 1; overflow-y: auto; padding: 24px; background: var(--bg);
```

---

## Хедер

```
Высота: 64px
Фон: var(--surface-1), border-bottom: 1px solid var(--border)
z-index: 10

Левая часть:
  Логотип «Nexus» — font-size:16px, font-weight:800, color:var(--text-1)

Правая часть (gap: 16px):
  Имя пользователя — font-size:13px, color:var(--text-3)
  Переключатель темы — иконка ☀ (light) / 🌙 (dark), кнопка secondary
  Кнопка «Выйти» — кнопка secondary
```

---

## Компоненты

Все компоненты используют CSS-переменные — это обязательно для корректной работы светлой темы.

### Кнопка primary
```css
background: linear-gradient(135deg, #FF6B35, #E8194B);
border: none;
border-radius: 8px;
color: #FFFFFF;
font-family: Urbanist, sans-serif;
font-size: 13px;
font-weight: 700;
padding: 10px 20px;
cursor: pointer;
```
*(акцентный градиент одинаков в обеих темах)*

### Кнопка secondary
```css
background: rgba(128,128,128,0.08);
border: 1px solid var(--border);
border-radius: 8px;
color: var(--text-3);
font-family: Urbanist, sans-serif;
font-size: 13px;
font-weight: 600;
padding: 10px 20px;
cursor: pointer;
```

### Кнопка danger
```css
background: rgba(232,25,75,0.12);
border: 1px solid rgba(232,25,75,0.3);
border-radius: 8px;
color: #E8194B;
font-family: Urbanist, sans-serif;
font-size: 13px;
font-weight: 600;
padding: 10px 20px;
cursor: pointer;
```

### Инпут / текстовое поле
```css
background: var(--surface-2);
border: 1px solid var(--border);
border-radius: 8px;
color: var(--text-1);
font-family: Urbanist, sans-serif;
font-size: 13px;
padding: 10px 12px;
outline: none;
/* focus: */
border-color: rgba(255,107,53,0.5);
```

### Карточка
```css
background: var(--surface-2);
border: 1px solid var(--border);
border-radius: 10px;
padding: 14px 16px;
/* hover: */
background: var(--surface-3);
transition: background 0.12s;
```

### Модал
```css
/* Backdrop */
position: fixed; inset: 0;
background: rgba(0,0,0,0.6);
backdrop-filter: blur(4px);
display: flex; align-items: center; justify-content: center;
z-index: 100;

/* Окно */
background: var(--surface-1);
border: 1px solid var(--border);
border-radius: 16px;
padding: 28px;
width: 400px;
max-width: 90vw;
box-shadow: 0 24px 64px rgba(0,0,0,0.4);
```

### Боковая панель
```css
width: 280px; /* или 200px для узкого сайдбара */
background: var(--surface-1);
border-left: 1px solid var(--border); /* или border-right */
transition: width 0.25s ease; /* если сворачивается */
```

### Бейдж / тег
```css
padding: 2px 8px;
border-radius: 4px;
font-size: 11px;
font-weight: 600;
/* цвет фона = color + '28' (10% прозрачность) */
/* цвет текста = color */
```

---

## Шкала времени (Calendar week/day)

- **1px = 1 минута** — строгое соответствие, не менять
- Рабочие часы 10:00–18:30:
  ```css
  background: rgba(255,255,255,0.025); /* полоса */
  border-top: 1px solid rgba(255,255,255,0.09); /* линии часов внутри */
  ```
- Нерабочие часы: `border-top: 1px solid rgba(255,255,255,0.04)`
- Полчаса: `border-top: 1px dashed rgba(255,255,255,0.03)`
- Текущее время: красная линия `#E8194B` + круглая точка слева

---

## Цвета событий / приоритетов

Цвет события задаётся в данных (`evt.color`). Фон блока = `color + '22'` (8% прозрачность), рамка = `3px solid color`.

Приоритеты задач:
```js
high:   '#E8194B'
medium: '#F59E0B'
low:    '#464658'
```

---

## Состояния

Каждый список или контейнер данных обязан показывать одно из трёх состояний:

### Empty state
```css
text-align: center;
padding: 48px 0;
color: var(--text-muted);
font-size: 14px;
font-weight: 500;
```
Текст: «Нет данных», «Ничего не найдено» и т.п. — конкретный, не «undefined».

### Loading state
```css
/* Вариант 1 — затухание контейнера */
opacity: 0.5;
pointer-events: none;

/* Вариант 2 — skeleton-полосы */
background: var(--surface-3);
border-radius: 4px;
height: 16px; /* или 40px для строки */
```

### Error state
```css
color: var(--danger);
font-size: 13px;
font-weight: 500;
```
Всегда показывать текст ошибки — не молчать, не показывать пустой экран.

---

## Иконки

**Решение: lucide-react — основной набор иконок.** Unicode-символы и SVG inline допустимы для простых случаев. *(Прежний запрет icon-библиотек снят 2026-06-09.)*

| Действие | Символ |
|----------|--------|
| Закрыть | `✕` |
| Навигация назад/вперёд | `‹` `›` |
| Добавить | `+` |
| Светлая тема | `☀` |
| Тёмная тема | `🌙` |
| Удалить | `✕` или `🗑` |
| Чекбокс отмечен | `✓` |

Для сложных иконок — SVG inline с `fill: currentColor`, без внешних файлов.

---

## Z-index

| Уровень | Значение | Кто |
|---------|----------|-----|
| Хедер | `10` | `position: sticky` хедер страницы |
| Дропдауны | `20` | date picker popup, select dropdown, tooltip |
| Боковые панели | `30` | side panel (calendar, node canvas) |
| Minimap | `50` | node canvas minimap |
| Модалы | `100` | backdrop + окно модала |

---

## Правила

1. **UI-кит: Tailwind + shadcn/ui (Radix) + recharts + lucide** — *прежнее «только inline styles, без UI-библиотек» отменено 2026-06-09 (рудимент)*
2. **Компоненты — через CSS-переменные** (`var(--surface-2)`, `var(--border)` и т.д.) — не хардкодить цвета
3. **Цвета — только из палитры этого документа** — никаких новых значений без согласования
4. **Шрифт — Urbanist основной**, `system-ui` / `sans-serif` — только как fallback (`font-family: 'Urbanist', system-ui, sans-serif`)
5. **border-radius** — карточки `10px`, кнопки/инпуты `8px`, пилюли `4–6px`, модал `16px`
6. **Переходы** — только `transition: background 0.12s` и `transition: opacity 0.12s` — без сложных анимаций
7. **Скроллбар:**
   ```css
   ::-webkit-scrollbar { width: 6px; height: 6px; }
   ::-webkit-scrollbar-track { background: transparent; }
   ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
   ::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
   ```


---

## Мобильная версия (≤768px) — карта поверхностей

Принцип: телефон — для **ввода и контроля**, не для администрирования.
Хук: `useIsMobile` (`hooks/useIsMobile.ts`); реализация в `AppShell.tsx`.

**Каркас:** сайдбар скрыт → нижняя навигация (56px): **Главная · Задачи · Свод · Чаты · Ещё**.
«Ещё» — шит с: Календарь, Аналитика, Проекты, Команда, Настройки (+Персонал/База — admin), Уведомления, Тема, Выход.
Чаты на мобиле — полноэкранный оверлей; панель уведомлений — во всю ширину.

| Экран | На мобиле | Скрыто/заменено |
|---|---|---|
| Главная | карточка дня (главный ввод!), триаж задач/дедлайнов/событий — колонки в стопку | — |
| Задачи | Доска (X-скролл) и Календарь | Таблица и Гант непригодны — не убраны, но вторичны |
| Свод | **персональная лента «мои дни»** (день·формат·часы·задачи, клик → карточка дня) | полная сетка день×сотрудник — только десктоп |
| Аналитика | KPI-стопка + таблицы с X-скроллом | — |
| Чаты | полноэкранно из нижней навигации | правый док |
| Проекты/Команда/Настройки | вертикальные стопки как есть | — |
| Персонал/База данных | доступ через «Ещё» (admin) | админ-работа — ориентир на десктоп |
