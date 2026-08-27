# Модуль «Заявки» — спека (MVP)

> Черновик, 2026-08-08. Личный HR-воркфлоу: заявка → согласование → статус (+ заявление docx).
> Живёт под-вкладкой «Заявки» в «Мой кабинет». Заменяет убранные из Обзора кнопки больничный/отпуск.
> Память: [[nexus-cabinet-requests-goals-decisions]].

## Решения (дефолты, можно менять)

- **Согласующий** — резолвится при создании: руководитель отдела сотрудника (`Division.head`); если он пуст или совпадает с автором → директор департамента (`Department.director`); если пусто → любой админ. `approverId` снапшотится в заявку (кто должен решить на момент подачи).
- **Баланс** отпускных дней — НЕ в MVP (добавим счётчик остатка позже).
- **Типы MVP**: `vacation` (отпуск), `sick` (больничный), `dayoff` (отгул). Каркас расширяемый — новый тип = запись в реестре типов + (опц.) свой docx-шаблон.
- **Неизменяемость** (правило экосистемы): решённые заявки не редактируются; отмена/изменение — новые записи/статусы. Снапшот ФИО/должности/периода на момент подачи.

## Модель данных (Prisma, схема `nexus`)

```prisma
model Request {
  id            String   @id @default(uuid())
  userId        String   @map("user_id")          // автор
  user          User     @relation("RequestAuthor", fields: [userId], references: [id])
  type          String                             // vacation | sick | dayoff
  status        String   @default("pending")       // pending | approved | rejected | canceled
  dateFrom      String   @map("date_from")         // YYYY-MM-DD
  dateTo        String   @map("date_to")           // YYYY-MM-DD (== dateFrom для одного дня)
  comment       String?                            // комментарий сотрудника
  approverId    String?  @map("approver_id")       // кто должен/решил согласовать (снапшот)
  approver      User?    @relation("RequestApprover", fields: [approverId], references: [id])
  decidedAt     DateTime? @map("decided_at")
  decisionNote  String?  @map("decision_note")     // резолюция согласующего
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  @@index([userId, status])
  @@index([approverId, status])
  @@map("requests")
  @@schema("nexus")
}
```

Тип заявки — строковый литерал (не enum на фронте, по правилу). Реестр типов и docx-шаблоны — на бэке (`services/requests.ts`), метаданные (label, нужен ли период, есть ли docx) отдаются фронту `GET /requests/types`.

## API `/requests` (все — `authenticate`)

| Метод | Путь | Что делает |
|---|---|---|
| GET | `/requests/types` | реестр типов заявок (label, поля, есть ли docx) |
| GET | `/requests?scope=mine` | мои заявки (по `userId`) |
| GET | `/requests?scope=inbox` | заявки на моё согласование (`approverId = me`, или все — если admin) |
| POST | `/requests` | создать (тип/период/коммент); резолв `approverId`; статус `pending` |
| PATCH | `/requests/:id/decision` | `{ decision: 'approved'\|'rejected', note? }` — только approver/admin; ставит `decidedAt` |
| PATCH | `/requests/:id/cancel` | отменить свою `pending`-заявку (автор) |
| GET | `/requests/:id/document` | docx-заявление (для `vacation`, статус `approved`) — стрим файла |

Коды: POST 201, PATCH 200, ошибки `{error}` (400/403/404). Zod `.safeParse`. Роут добавить в `server.ts` **и в `apps/web/nginx.conf`** (allow-list). Тест `requests.test.ts` (гарды scope/decision).

Эффекты одобрения:
- `vacation`/`dayoff` approved → (позже) писать дни в календарь/график как отсутствие. В MVP — только статус; отражение в «кто работает»/дне сотрудника — след. итерация (связать с `CalendarEntry` hr_* / `DayEntry`).
- Инвалидация: `['requests','mine']`, `['requests','inbox']`.

## Уведомления

- Новая заявка → у согласующего в inbox; интеграция в колокольчик (`/notifications`) — добавить источник «заявки на согласование» (derived). В MVP — badge на вкладке «Заявки» (кол-во inbox `pending`).
- Решение по заявке → автору в колокольчик (позже).

## UI

- **Под-вкладка «Заявки»** в «Мой кабинет» (левое меню, рядом Обзор/Задачи/Треки): `cabinetTab` += `requests`; persist `nexus:cabinet-tab`.
- **RequestsPage**: 
  - секция «Мои заявки» — список (тип, период, статус-чип, дата подачи, резолюция);
  - секция «На согласовании» — видна, только если есть inbox (руководитель): карточки с кнопками Одобрить/Отклонить (+ причина);
  - кнопка «Оформить заявку» → модалка: тип (чипы), период (китовый DatePicker), комментарий, «Отправить».
- Для approved `vacation` — кнопка «Скачать заявление» (docx).
- Стиль — семантические роли: success=одобрить, danger=отклонить (единственный деструктив), warning=на согласовании, info=подано. Попапы — по железному правилу (mousedown+mouseup).

## docx-заявление (отпуск)

- Библиотека `docx` (npm) на бэке; собрать документ из шаблона с подстановкой: ФИО (`user.name`), должность (`user.position`), период (`dateFrom–dateTo`), дата подачи. Отдать `Content-Disposition: attachment`.
- Шаблон — служебный текст заявления на отпуск (РФ), плейсхолдеры. Хранить генератор в `services/requestDocx.ts`.

## Этапы реализации (одна фича за раз)

1. **Модель + миграция + API** (`/requests` CRUD + decision + cancel + types) + тест. Backend.
2. **UI**: вкладка «Заявки», список мои/inbox, создание, согласование. Браузер-проверка.
3. **docx**: генерация заявления на отпуск + кнопка «Скачать».
4. **Интеграция**: колокольчик (уведомление согласующему/автору), отражение одобренного отпуска в дне/«кто работает».
5. (позже) **Баланс** отпускных дней, расширение типов (командировка/удалёнка/справки/расходы).
