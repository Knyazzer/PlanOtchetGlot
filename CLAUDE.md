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

# Or use the PowerShell launcher (opens separate windows)
.\start.ps1

# Start DB only (PostgreSQL on port 5433)
docker compose -f docker-compose.dev.yml up -d
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
3. A `node-cron` job in the API syncs data from Google Sheets every 30 minutes (also triggerable via `POST /api/sync`)

### Auth
JWT-based. Tokens stored in httpOnly cookies (`access_token`). `@fastify/jwt` on backend; Zustand auth store on frontend (`apps/web/src/stores/auth.ts`). The axios client in `apps/web/src/lib/api.ts` auto-retries on 401 via `/auth/refresh`.

### Frontend State
- **TanStack Query** — all server state (fetching, caching, invalidation)
- **TanStack Router** — file-based routing under `apps/web/src/pages/`
- **Zustand** — auth state only
- **shadcn/ui** + **FullCalendar** — UI components

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

### Database Models (key ones)
`User`, `Project`, `MatrixRegistry`, `ProjectAssignment`, `ShiftEntry`, `MonthlySummary`, `Task`, `TaskAssignment`, `Notification`, `ChangeLog`, `SyncLog`

Schema: `packages/db/prisma/schema.prisma`

## Environment Setup

Copy `.env.example` to `.env` and fill in:
- `DATABASE_URL` — PostgreSQL connection string (default points to Docker on port 5433)
- `JWT_SECRET` — random string
- `WEB_URL` — frontend origin for CORS (default `http://localhost:5173`)
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY` — for Google Sheets sync
- `GOOGLE_PROJECTS_SHEET_ID` + `GOOGLE_REGISTRY_SHEET_ID` — source spreadsheet IDs
- `VITE_API_URL` — used by Vite at build time for frontend API calls (default `http://localhost:4000`)

## Google Sheets Integration

The sync logic lives in `apps/api/src/services/syncService.ts` (or similar). It reads two Google Sheets:
- **Projects sheet** (`GOOGLE_PROJECTS_SHEET_ID`) — production schedule
- **Registry sheet** (`GOOGLE_REGISTRY_SHEET_ID`) — staff matrix/assignments

Authentication uses a Google Service Account (JSON key injected via env vars).
