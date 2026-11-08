# Komyuter Admin Backend (Fastify)

Fastify v5 API for the Komyuter admin dashboard. It manages the transit data
model (routes, directions, stops, detours, restrictions, fare configurations)
against the local Supabase stack (Postgres + PostGIS + Auth), and exports the
complete plotted dataset as a single JSON file for the Collaboratory
validation script.

## Prerequisites

- Node.js 22 LTS, pnpm 8.15.6, Docker (Docker Desktop running).
- Supabase CLI installed and available as `supabase` (or invoke the global
  `supabase.js` directly on Windows).

## Setup

```sh
# 1. Start the local Supabase stack (Postgres + PostGIS + Auth), applying
#    migrations in supabase/migrations/ and supabase/seed.sql on first start.
supabase start

# 2. Create your .env from the template (fills in the credentials printed by
#    `supabase status`).
cp apps/server/.env.example apps/server/.env
#    DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL, ADMIN_PASSWORD, PORT

# 3. Install workspace dependencies.
pnpm install

# 4. Run the server (starts Fastify on http://localhost:3000).
pnpm --filter server dev
```

On first start, `supabase/seed.sql` provisions the single admin account and the
default fare configuration (FR-015/FR-016). Reset to a clean state anytime:
`supabase db reset`.

## Authenticating as admin

Sign in with the seeded admin credentials (from your `.env`) to obtain an
access token:

```sh
# POST {SUPABASE_URL}/auth/v1/token?grant_type=password
#   body: { "email": "<ADMIN_EMAIL>", "password": "<ADMIN_PASSWORD>" }
# → { "access_token": "..." }
export TOKEN="..."   # send as: Authorization: Bearer $TOKEN
```

All admin routes live under `/api/admin` and require this Bearer token
(`401` if missing/invalid, `403` if the user is not an admin).

## API surface

| Method & path                                              | Purpose                                              |
| ---------------------------------------------------------- | ---------------------------------------------------- |
| `GET /api/status`                                          | Health + dataset stats (public)                      |
| `GET/POST /api/admin/routes`                               | List / create routes (soft-delete via `DELETE`)      |
| `GET/PUT/DELETE /api/admin/routes/:routeId`                | Read / update / deactivate a route                   |
| `GET/POST /api/admin/fare-configs`                         | List / create fare configurations                    |
| `GET/PUT/DELETE /api/admin/fare-configs/:fareConfigId`     | Read / update / deactivate                           |
| `GET/POST /api/admin/routes/:routeId/directions`           | List / create directions (+ inline stops)            |
| `GET/PUT/DELETE /api/admin/directions/:directionId`        | Read / update / deactivate                           |
| `GET/POST /api/admin/directions/:directionId/stops`        | List / add stops                                     |
| `PUT/DELETE /api/admin/stops/:stopId`                      | Update / deactivate a stop                           |
| `GET/POST /api/admin/directions/:directionId/detours`      | List / add detours                                   |
| `PUT/DELETE /api/admin/detours/:detourId`                  | Update / deactivate a detour                         |
| `GET/POST /api/admin/directions/:directionId/restrictions` | List / add restrictions                              |
| `PUT/DELETE /api/admin/restrictions/:restrictionId`        | Update / deactivate a restriction                    |
| `GET /api/admin/export/dataset`                            | Download the full dataset as `komyuter-dataset.json` |

Responses use the envelope `{ success, data | error }`. Error codes:
`UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409),
`VALIDATION_ERROR` (422), `INTERNAL` (500). Geometry is GeoJSON with
`[longitude, latitude]` order everywhere.

## Quality gates

```sh
pnpm --filter server typecheck   # tsc --noEmit
pnpm --filter server test        # vitest run (unit + integration)
```

The integration suite requires the local Supabase stack to be running and
`apps/server/.env` to be present (the tests build the real app against
`DATABASE_URL`/`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`).

Full validation scenarios live in `specs/001-local-supabase-backend/quickstart.md`.
