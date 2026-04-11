# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**TV Shifts** — full-stack web app for managing TV production team shifts, workload, and project scheduling. It syncs with Google Sheets for data import. The UI and documentation are in Russian.

## Monorepo Structure

pnpm monorepo with three packages:
- `apps/api` — Fastify backend (port 4000)
- `apps/web` — React + Vite frontend (port 5173)
- `packages/db` — Prisma schema + migrations + seed

## Commands

### Development
```bash
# Start both API and Web in parallel
pnpm dev

# Start DB only (PostgreSQL on port 5432)
docker compose up -d postgres
```

### Build
```bash
pnpm build          # Build all packages
pnpm --filter @tv-shifts/api build
pnpm --filter @tv-shifts/web build
```

### TypeScript check
```bash
# Frontend (no emit)
node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json

# API (compiles to dist/)
pnpm --filter @tv-shifts/api build
```

### Database
```bash
pnpm db:generate    # Regenerate Prisma client after schema changes
pnpm db:migrate     # Run pending migrations
pnpm db:seed        # Seed with test data
pnpm db:studio      # Open Prisma Studio GUI
```

When the API server is running it locks the Prisma client DLL — run migrations without regenerating the client:
```bash
cd packages/db && DATABASE_URL="..." npx prisma migrate dev --skip-generate
```

### Lint
```bash
pnpm --filter @tv-shifts/web lint
```

## Architecture

### Data Flow
1. React frontend fetches from Fastify API via HTTP
2. Fastify uses Prisma to query PostgreSQL
3. A `node-cron` job in the API syncs data from Google Sheets every 30 minutes (also triggerable via `POST /sync/trigger`)

### Server Startup
`apps/api/src/server.ts` waits for PostgreSQL (30 retries, 2s each) before starting. On every startup all `SyncLog` records are deleted — sync history does not persist across server restarts. API port defaults to 4000, overridable via `PORT` env var.

### Auth
JWT-based. Two httpOnly cookies: `access_token` (15 min, all paths) and `refresh_token` (7 days, scoped to `/auth/refresh`). `@fastify/jwt` on backend reads the cookie automatically. Zustand auth store on frontend (`apps/web/src/stores/auth.ts`). The axios client in `apps/web/src/lib/api.ts` auto-retries on 401 via `/auth/refresh`.

### Frontend State
- **TanStack Query** — all server state (fetching, caching, invalidation)
- **Zustand** — auth state only (`stores/auth.ts`)
- All UI uses **inline styles** (no UI component library — no shadcn/ui, no MUI)
- **FullCalendar** — used only in `CalendarPage.tsx`
- Auth-gated routing is handled in `App.tsx`: unauthenticated → `LoginPage`, authenticated → `AppShell`
- **In-app navigation** uses `useState<Page>` in `AppShell.tsx` (no React Router) — the current page is persisted to `localStorage` under key `app-page`. Some nav items are `adminOnly` and hidden from non-admin users.

### API Routes (registered at root, no `/api` prefix)
| Prefix | File |
|--------|------|
| `/auth` | `apps/api/src/routes/auth.ts` |
| `/users` | `apps/api/src/routes/users.ts` |
| `/status-rows` | `apps/api/src/routes/statusRows.ts` |
| `/shifts` | `apps/api/src/routes/shifts.ts` |
| `/tasks` | `apps/api/src/routes/tasks.ts` |
| `/notifications` | `apps/api/src/routes/notifications.ts` |
| `/sync` | `apps/api/src/routes/sync.ts` |
| `/change-logs` | `apps/api/src/routes/changeLogs.ts` |
| `/analytics` | `apps/api/src/routes/analytics.ts` |
| `/deals` | `apps/api/src/routes/deals.ts` |

Route auth guard lives in `apps/api/src/plugins/auth.ts` — call `request.jwtVerify()` inside route handlers, or use the `authenticate` / `requireRole(role)` preHandlers.

### Database Models
`User`, `StatusRow`, `ProjectDay`, `MatrixRegistry`, `ProjectAssignment`, `ShiftEntry`, `MonthlySummary`, `Task`, `TaskAssignment`, `Notification`, `ChangeLog`, `SyncLog`, `Deal`, `DealStatusRow`, `DealMatrix`

Schema: `packages/db/prisma/schema.prisma`

Key enums:
- `Role` — `employee | admin | producer`
- `StatusRowStatus` — `request | negotiation | preproduction | production | postproduction | delivered | rejected | cancelled | manual`
- `StatusRowSource` — `projects_table | manual | separator`
- `ShiftType` — `zastroyka | efir | demontazh`
- `ShiftSource` — `matrix | manual`
- `DayType` — `zastroyka | efir`
- `TaskStatus` — `open | in_progress | done`
- `NotificationType` — `no_matrix | unmatched_name | data_conflict | schedule_change`

### Prisma Client Workaround
The running API process locks the Prisma client DLL, preventing `pnpm db:generate` without stopping the server. If the generated client is outdated (e.g., missing new enum values), use raw SQL via `$queryRawUnsafe` / `$executeRawUnsafe` with explicit PostgreSQL enum casts:
```typescript
await prisma.$executeRawUnsafe(
  `UPDATE "status_rows" SET source = 'separator'::"StatusRowSource" WHERE id = $1`,
  id
)
```

### Google Sheets Integration

Sync logic: `apps/api/src/services/syncService.ts`. Reads two sheets:
- **Projects sheet** (`GOOGLE_PROJECTS_SHEET_ID`) — production schedule → syncs into `StatusRow`
- **Registry sheet** (`GOOGLE_REGISTRY_SHEET_ID`) — staff matrix/assignments → syncs into `MatrixRegistry` + `ProjectAssignment` + `ShiftEntry`

Cell colors (`userEnteredFormat.backgroundColor`) and merged cells are used for status detection. Authentication uses a Google Service Account (or `GOOGLE_API_KEY` for public sheets).

**Matrix sync flow**: for each `MatrixRegistry` entry, `fetchMatrixShifts` parses the "₽ СМЕНЫ" (or "₽ СПЕЦИАЛИСТЫ") sheet. A row is kept only if at least one of columns C, G, I, or J–P contains data (only `"1"` counts in J–P; totals rows like "Итог:" are skipped). The parsed result is saved immediately to `shifts_cache` (Json) and `has_shifts_data` (Boolean) on `MatrixRegistry` before employee matching begins — so row highlighting in the UI appears during sync without waiting for the full process. Rate-limit errors (429/503) are retried up to 3 times with 3s/6s delays. There is a 1500ms delay between matrices.

**Sync abort**: `requestSyncAbort()` exported from `syncService.ts` sets `_abortRequested = true`. The matrix loop checks this flag before processing each matrix. `POST /sync/stop` calls it. After abort, `totalMatrices` must be cleared in the frontend to reset `isRunning` state.

### Separator Rows
`StatusRow` records with `source = 'separator'` are month dividers injected by sync. They have no real project data. Frontend must filter them out except in `SyncDataPage` (use `?withSeparators=true` query param). Always exclude them in API list endpoints: `NOT: { source: 'separator' as any }`.

### SyncDataPage Filter Architecture
`apps/web/src/pages/SyncDataPage.tsx` has a three-level filter system:
1. **Primary filters** — global settings popup (⚙ button), persisted to localStorage
2. **Column filters** — per-column multiselect dropdowns in table headers, also persisted to localStorage
3. **Column visibility** — toggles in the settings popup, persisted to localStorage

Column dropdowns (`ColDropdown`) render **inside `<th>` via `position: absolute; top: 100%`** (not as floating overlays) to scroll with page content. A `position: fixed; inset: 0` backdrop handles click-outside closing. Dropdowns auto-close on table/window scroll via `useEffect`.

`FilterGroup` component is defined at **module level** (not inside other components) to prevent React from recreating it on each render, which would cause scroll-position resets.

**Sticky table headers**: `thBase` uses `position: sticky; top: 0`. Do not override `position` on individual `<th>` — `sticky` also acts as positioning context for absolutely-positioned dropdown children. The outer panel wrapper uses `overflow: clip` (not `overflow: hidden`) — `hidden` creates a scroll container that breaks sticky.

### AppShell Sync Window
`SyncButton` in `apps/web/src/components/AppShell.tsx` polls `/sync/logs` and shows sync progress.

- `totalMatrices` is returned by `POST /sync/trigger` and stored in `sessionStorage` (key `sync-total-matrices`) so it survives page refresh. Cleared on sync completion or abort.
- `isRunning = logsRunning || matricesStillExpected` — stays `true` even during the 1.5s gaps between matrices by checking `totalMatrices > 0 && matrixDone < totalMatrices`.
- `refetchInterval` reads sessionStorage directly (not React state) to stay at 2s during matrix gaps without stale closure issues.
- "Остановить" button appears when `isRunning` and all `projects`/`registry` logs have finished (only matrices remain). On success it clears `totalMatrices` from state and sessionStorage, which collapses `isRunning`.

### Deal Entity
`Deal` groups `StatusRow` records with `MatrixRegistry` entries. Relations via join tables `DealStatusRow` and `DealMatrix`. Status: `preliminary | in_progress | completed`. The `/deals/potential` endpoint returns unlinked `StatusRow` records that have a matching `sheetMatrixId` in `MatrixRegistry`.

## Environment Setup

`.env` is loaded from the monorepo root (not from `apps/api/`). Copy `.env.example` to `.env` and fill in:
- `DATABASE_URL` — PostgreSQL connection string (default: Docker on port 5432)
- `JWT_SECRET` — random string
- `WEB_URL` — frontend origin for CORS (default `http://localhost:5173`)
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY` — for Google Sheets sync
- `GOOGLE_PROJECTS_SHEET_ID` + `GOOGLE_REGISTRY_SHEET_ID` — source spreadsheet IDs
- `VITE_API_URL` — used by Vite at build time for frontend API calls (default `http://localhost:4000`)
- `PORT` — API server port (default `4000`)

## Page Implementation Status

| Page | File | Status |
|------|------|--------|
| Login | `LoginPage.tsx` | Done |
| Calendar | `CalendarPage.tsx` | Done |
| Sync Data | `SyncDataPage.tsx` | Done |
| Users | `UsersPage.tsx` | Done |
| Deals | `DealsPage.tsx` | Done |
| Tasks | `TasksPage.tsx` | Stub (🚧) |
| Analytics | `AnalyticsPage.tsx` | Stub (🚧) |
| Profile | `ProfilePage.tsx` | Stub (🚧) |
