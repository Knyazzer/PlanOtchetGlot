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

### Database
```bash
pnpm db:generate    # Regenerate Prisma client after schema changes
pnpm db:migrate     # Run pending migrations
pnpm db:seed        # Seed with test data
pnpm db:studio      # Open Prisma Studio GUI
```

### Lint
```bash
pnpm --filter @tv-shifts/web lint
```

## Architecture

### Data Flow
1. React frontend fetches from Fastify API via HTTP
2. Fastify uses Prisma to query PostgreSQL
3. A `node-cron` job in the API syncs data from Google Sheets every 30 minutes (also triggerable via `POST /sync`)

### Auth
JWT-based. Two httpOnly cookies: `access_token` (15 min, all paths) and `refresh_token` (7 days, scoped to `/auth/refresh`). `@fastify/jwt` on backend reads the cookie automatically. Zustand auth store on frontend (`apps/web/src/stores/auth.ts`). The axios client in `apps/web/src/lib/api.ts` auto-retries on 401 via `/auth/refresh`.

### Frontend State
- **TanStack Query** — all server state (fetching, caching, invalidation)
- **Zustand** — auth state only (`stores/auth.ts`)
- **shadcn/ui** + **FullCalendar** — UI components
- Auth-gated routing is handled in `App.tsx`: unauthenticated → `LoginPage`, authenticated → `AppShell`

### API Routes (registered at root, no `/api` prefix)
| Prefix | File |
|--------|------|
| `/auth` | `apps/api/src/routes/auth.ts` |
| `/users` | `apps/api/src/routes/users.ts` |
| `/projects` | `apps/api/src/routes/projects.ts` |
| `/shifts` | `apps/api/src/routes/shifts.ts` |
| `/tasks` | `apps/api/src/routes/tasks.ts` |
| `/notifications` | `apps/api/src/routes/notifications.ts` |
| `/sync` | `apps/api/src/routes/sync.ts` |
| `/change-logs` | `apps/api/src/routes/changeLogs.ts` |
| `/analytics` | `apps/api/src/routes/analytics.ts` |

Route auth guard lives in `apps/api/src/plugins/auth.ts` — call `request.jwtVerify()` inside route handlers to protect them.

### Database Models (key ones)
`User`, `Project`, `ProjectDay`, `MatrixRegistry`, `ProjectAssignment`, `ShiftEntry`, `MonthlySummary`, `Task`, `TaskAssignment`, `Notification`, `ChangeLog`, `SyncLog`

Schema: `packages/db/prisma/schema.prisma`

Key enums: `Role` (employee/admin/producer), `ProjectStatus`, `ShiftType` (zastroyka/efir/demontazh), `ShiftSource` (matrix/manual), `NotificationType`, `TaskStatus`.

### Google Sheets Integration

Sync logic: `apps/api/src/services/syncService.ts`. Reads two sheets:
- **Projects sheet** (`GOOGLE_PROJECTS_SHEET_ID`) — production schedule
- **Registry sheet** (`GOOGLE_REGISTRY_SHEET_ID`) — staff matrix/assignments

Cell colors (`userEnteredFormat.backgroundColor`) and merged cells are used for status detection. Authentication uses a Google Service Account.

## Environment Setup

`.env` is loaded from the monorepo root (not from `apps/api/`). Copy `.env.example` to `.env` and fill in:
- `DATABASE_URL` — PostgreSQL connection string (default: Docker on port 5432)
- `JWT_SECRET` — random string
- `WEB_URL` — frontend origin for CORS (default `http://localhost:5173`)
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY` — for Google Sheets sync
- `GOOGLE_PROJECTS_SHEET_ID` + `GOOGLE_REGISTRY_SHEET_ID` — source spreadsheet IDs
- `VITE_API_URL` — used by Vite at build time for frontend API calls (default `http://localhost:4000`)
