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
# Start both API and Web in parallel (cross-platform)
pnpm dev

# On Windows, preferred alternative that opens separate terminal windows:
.\start.ps1

# Start DB only for local dev (PostgreSQL exposed on port 5433)
docker compose -f docker-compose.dev.yml up -d
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
pnpm --filter @tv-shifts/web exec tsc --noEmit

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
JWT-based. Two httpOnly cookies: `access_token` (15 min, all paths) and `refresh_token` (7 days, scoped to `/auth/refresh`). `@fastify/jwt` on backend reads the cookie automatically. Zustand auth store on frontend (`apps/web/src/stores/auth.ts`). The axios client in `apps/web/src/lib/api.ts` auto-retries on 401 via `/auth/refresh` (interceptor skips `/auth/*` routes to prevent loops). `POST /auth/login` has rate limiting (max 10 req/min via `@fastify/rate-limit`; plugin is `global: false` so all other routes are unlimited by default).

### Frontend State
- **TanStack Query** — all server state (fetching, caching, invalidation)
- **Zustand** — auth state only (`stores/auth.ts`). Auth helpers live in `apps/web/src/hooks/useAuth.ts`: `useAuthInit()` (fetches `/auth/me` on startup), `useCurrentUser()`, `useIsAdmin()`, `useIsProducer()`.
- All UI uses **inline styles** (no UI component library — no shadcn/ui, no MUI)
- **FullCalendar** — used only in `CalendarPage.tsx`
- Auth-gated routing is handled in `App.tsx`: unauthenticated → `LoginPage`, authenticated → `AppShell`
- **In-app navigation** uses `useState<Page>` in `AppShell.tsx` (no React Router) — the current page is persisted to `localStorage` under key `app-page`. Some nav items are `adminOnly` and hidden from non-admin users. Non-admin users also cannot navigate to protected pages by manipulating localStorage (guard enforces this).

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
| `/database` | `apps/api/src/routes/database.ts` |
| `/matrix-templates` | `apps/api/src/routes/matrixTemplates.ts` |
| `/internal-matrix` | `apps/api/src/routes/internalMatrix.ts` |
| `/project-members` | `apps/api/src/routes/projectMembers.ts` |

Route auth guard lives in `apps/api/src/plugins/auth.ts` — call `request.jwtVerify()` inside route handlers, or use the `authenticate` / `requireRole(...roles)` preHandlers. `requireRole` accepts multiple roles (e.g. `requireRole('admin', 'producer')`).

### Database Models
`User`, `StatusRow`, `ProjectDay`, `MatrixRegistry`, `ProjectAssignment`, `ShiftEntry`, `MonthlySummary`, `Task`, `TaskAssignment`, `Notification`, `UserNotificationRead`, `ChangeLog`, `SyncLog`, `Deal`, `DealStatusRow`, `DealMatrix`, `MatrixTemplate`, `ProjectMember`, `SheetConfig`

Schema: `packages/db/prisma/schema.prisma`

Key enums:
- `Role` — `employee | admin | producer`
- `StatusRowStatus` — `request | negotiation | preproduction | production | postproduction | delivered | rejected | cancelled | manual`
- `StatusRowSource` — `projects_table | manual | separator`
- `EmploymentType` — `staff | ip_7 | ip_8 | ip_10 | szt`
- `ShiftType` — `zastroyka | efir | demontazh`
- `ShiftSource` — `matrix | manual`
- `DayType` — `zastroyka | efir`
- `TaskStatus` — `open | in_progress | done`
- `NotificationType` — `no_matrix | unmatched_name | data_conflict | schedule_change`
- `DealStatus` — `preliminary | in_progress | completed`
- `SyncType` — `projects | registry | matrix` (used in `SyncLog`)
- `SyncStatus` — `running | success | error` (used in `SyncLog`)
- `ChangeSource` — `sync | manual` (used in `ChangeLog`)

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

Additional manually-configured sheets (employees buffer, freelancers, КФПД) are stored in the `sheet_configs` table and managed via `apps/api/src/services/databaseService.ts`. Their URLs and API keys are edited through `DatabasePage` in the UI (`/database` route), which calls `/database/config` and `/database/refresh/:key`.

### Google Drive Integration

`apps/api/src/services/driveService.ts` handles Drive file operations via **OAuth2** (NOT the Service Account used for Sheets). Requires separate credentials: `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN`, `GOOGLE_DRIVE_OWNER_EMAIL`.

Used by `/internal-matrix` routes to:
- Copy a template spreadsheet into a Drive folder (`copyTemplateToFolder`)
- Set up sharing permissions on the new spreadsheet (`setupMatrixPermissions`)
- Write initial project data to the `СВОД!C2:C11` sheet range (`writeSvodData`)
- Append a row to the internal registry sheet (`appendToInternalRegistry`)
- Check if a spreadsheet still exists in Drive (`checkSpreadsheetExists`)

**Internal matrices** (`source = 'internal'` in `matrix_registry`) are created manually via `POST /internal-matrix`. Their ID format is `INT-{timestamp}`. The Drive folder ID is stored in `sheet_configs` under key `drive_folder` (in the `sheet_url` column — naming convention, not a bug).

**Matrix sync flow**: for each `MatrixRegistry` entry, `fetchMatrixShifts` parses the "₽ СМЕНЫ" (or "₽ СПЕЦИАЛИСТЫ") sheet. A row is kept only if at least one of columns C, G, I, or J–P contains data (only `"1"` counts in J–P; totals rows like "Итог:" are skipped). The parsed result is saved immediately to `shifts_cache` (Json) and `has_shifts_data` (Boolean) on `MatrixRegistry` before employee matching begins — so row highlighting in the UI appears during sync without waiting for the full process. Rate-limit errors (429/503) are retried up to 3 times with 3s/6s delays. There is a 1500ms delay between matrices.

**Sync abort**: `requestSyncAbort()` exported from `syncService.ts` sets `_abortRequested = true`. The matrix loop checks this flag before processing each matrix. `POST /sync/stop` calls it. `_abortRequested` resets to `false` at the start of each new `runFullSync()` call. After abort, `totalMatrices` must be cleared in the frontend to reset `isRunning` state.

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

### SyncDataPage Extended Functionality

In addition to the three-level filter system for the production schedule table, `SyncDataPage.tsx` also contains the full UI for:
- **Internal matrix management** — create, edit, link to projects, check existence in Drive (`/internal-matrix/*`)
- **Project members** — manual team members per project with JSONB shift schedules (`/project-members/*`)
- **Matrix linking** — associating `MatrixRegistry` entries to `StatusRow` records via `blockSlot` and `matrixRegistryId`

### AppShell Sync Window
`SyncButton` in `apps/web/src/components/AppShell.tsx` polls `/sync/logs` and shows sync progress.

- `totalMatrices` is returned by `POST /sync/trigger` and stored in `sessionStorage` (key `sync-total-matrices`) so it survives page refresh. Cleared on sync completion or abort.
- `isRunning = logsRunning || matricesStillExpected` — stays `true` even during the 1.5s gaps between matrices by checking `totalMatrices > 0 && matrixDone < totalMatrices`.
- `refetchInterval` reads sessionStorage directly (not React state) to stay at 2s during matrix gaps without stale closure issues.
- "Остановить" button appears when `isRunning` and all `projects`/`registry` logs have finished (only matrices remain). On success it clears `totalMatrices` from state and sessionStorage, which collapses `isRunning`.

### Deal Entity
`Deal` groups `StatusRow` records with `MatrixRegistry` entries. Relations via join tables `DealStatusRow` and `DealMatrix`. Status: `preliminary | in_progress | completed`. The `/deals/potential` endpoint returns unlinked `StatusRow` records that have a matching `sheetMatrixId` in `MatrixRegistry`.

## Test Accounts (after seeding)

| Email | Password | Role |
|-------|----------|------|
| admin@tvshifts.ru | admin123 | admin |
| producer@tvshifts.ru | user123 | producer |
| ivanov@tvshifts.ru | user123 | employee |

## Environment Setup

`.env` is loaded from the monorepo root (not from `apps/api/`). Copy `.env.example` to `.env` and fill in:
- `DATABASE_URL` — PostgreSQL connection string (default: Docker on port 5432)
- `JWT_SECRET` — random string
- `WEB_URL` — frontend origin for CORS (default `http://localhost:5173`)
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY` — for Google Sheets sync (Service Account)
- `GOOGLE_PROJECTS_SHEET_ID` + `GOOGLE_REGISTRY_SHEET_ID` — source spreadsheet IDs
- `GOOGLE_DRIVE_CLIENT_ID` + `GOOGLE_DRIVE_CLIENT_SECRET` + `GOOGLE_DRIVE_REFRESH_TOKEN` + `GOOGLE_DRIVE_OWNER_EMAIL` — for Google Drive file operations (OAuth2, separate from Sheets auth)
- `VITE_API_URL` — used by Vite at build time for frontend API calls (default `http://localhost:4000`)
- `VITE_GOOGLE_PROJECTS_SHEET_ID` + `VITE_GOOGLE_REGISTRY_SHEET_ID` — frontend-side copies of sheet IDs (for direct Sheets access from browser, if needed)
- `GOOGLE_API_KEY` — alternative to Service Account for public Google Sheets (no auth required)
- `PORT` — API server port (default `4000`)

## Page Implementation Status

| Page | File | Status |
|------|------|--------|
| Login | `LoginPage.tsx` | Done |
| Calendar | `CalendarPage.tsx` | Done |
| Sync Data | `SyncDataPage.tsx` | Done |
| Users | `UsersPage.tsx` | Done |
| Deals | `DealsPage.tsx` | Done |
| Database | `DatabasePage.tsx` | Done (admin-only, nav label "БД") |
| Tasks | `TasksPage.tsx` | Stub (🚧) |
| Analytics | `AnalyticsPage.tsx` | Stub (🚧) |
| Profile | `ProfilePage.tsx` | Stub (🚧) |
| Notifications | `NotificationBell` in `AppShell.tsx` | Done (polls `/notifications/count` every 30s, mark-read/all-read) |
