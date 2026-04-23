# Задачи tab — design spec
Date: 2026-04-23

## Summary

Replace the "Задачи" tab in `RegistryDetailModal` (global project card) with a two-column split layout. Remove the now-redundant "Отделы" tab — its content moves inside each task.

## Changes

### 1. Remove "Отделы" tab
- Remove `{ key: 'shifts', label: 'Отделы' }` from the `TABS` array in `RegistryDetailModal`
- Remove `'shifts'` from the tab state union type
- Change default initial tab: `initialProjectId ? 'tasks' : 'info'` (was `'shifts'`)
- Remove the two `{tab === 'shifts' && ...}` render blocks

### 2. Rewrite `RegistryTasksTab`

Two-column layout (`display: flex`, `overflow: hidden`, `flex: 1`):

**Left column** — 290px wide, white background, `overflow: hidden`:
- Header: "ЗАДАЧИ" label + "+ Добавить" button (dashed border, disabled for now)
- Scrollable list of tasks (same `GET /status-rows?matrixRegistryId=...` query as before)
- Each task item: accordion with smooth `grid-template-rows: 0fr → 1fr` animation
  - Header row: chevron ▶ / ▼ + format name (bold, truncated) + status badge
  - Active item header: blue background (`#eff6ff`), blue text, blue chevron
  - Expanded body: клиент, исп. продюсер, дата (hide field if value is null/empty)
- Clicking a task: sets `selectedTaskId` state, collapses other open items

**Right column** — `flex: 1`, `overflow: hidden`:
- Renders `<InternalShiftsPanel matrixRegistryId={matrixRegistryId} initialProjectId={selectedTaskId} />`
- On first render (no task selected): `initialProjectId={null}` → InternalShiftsPanel shows "Свод отделов"
- When a task is selected: `initialProjectId={selectedTaskId}` → InternalShiftsPanel jumps to that task's tab

### 3. Accordion animation technique
```css
.task-detail { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .25s ease; }
.task-detail-inner { overflow: hidden; padding: 0 14px; transition: padding .25s ease; }
/* when open: */
.task-detail { grid-template-rows: 1fr; }
.task-detail-inner { padding: 8px 14px 12px; }
```
Implemented via inline style objects + `useState<string | null>(openTaskId)`.

## Data flow

```
RegistryTasksTab
  ├── useQuery(['registry-tasks', matrixRegistryId])  → GET /status-rows?matrixRegistryId=...
  ├── useState(selectedTaskId)
  ├── LEFT: accordion list of tasks (uses query data)
  └── RIGHT: <InternalShiftsPanel matrixRegistryId={...} initialProjectId={selectedTaskId} />
              └── loads same data internally (its own ['micro-projects', matrixRegistryId] query)
```

Note: Both the left list and InternalShiftsPanel query the same endpoint. TanStack Query deduplicates this — only one network request fires.

## Out of scope

- Adding/creating tasks from this tab (still done in Workflow)
- Changing the InternalShiftsPanel internals in any way
- Modifying any other tab (Инфо, Ганта, Заметки, Документы, Изменения, Свод матрица)
