# Quickstart & Validation Guide — Admin Backend

Runnable scenarios that prove the feature works end-to-end, mapped to the success criteria in `spec.md`. This is a **validation/run guide** — implementation lives in `tasks.md` and the codebase. Contract details: `contracts/api.md`, `contracts/export-dataset.schema.json`; entities: `data-model.md`.

## Prerequisites

- Node.js 22 LTS, pnpm 8.15.6, Docker (Docker Desktop running).
- Supabase CLI installed and available as `supabase`.

## Setup

```sh
supabase start                     # local Docker stack: Postgres + PostGIS + Auth (config in supabase/)
cp apps/server/.env.example .env   # DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL, ADMIN_PASSWORD
pnpm install
pnpm --filter server dev           # starts Fastify API on http://localhost:3000
```

On first start, `supabase/seed.sql` provisions the single admin account (spec FR-016). Reset to a clean state anytime: `supabase db reset`.

Get a signed-in access token for admin calls:

```sh
# Exchange admin credentials for a Supabase access token (via local Auth), e.g.:
# POST {SUPABASE_URL}/auth/v1/token?grant_type=password  → { access_token }
export TOKEN="..."                  # used as: Authorization: Bearer $TOKEN
```

## Validation scenarios

| #   | Scenario                          | Commands / steps                                                                                                                                    | Expected outcome                                                                                                                                                                                         | Covers                    |
| --- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| 1   | Unauthenticated write rejected    | `POST /api/admin/routes` **without** a token                                                                                                        | `401`, `{ success: false, error.code: "UNAUTHORIZED" }`, no row created                                                                                                                                  | SC-001                    |
| 2   | Non-admin token rejected          | Repeat with a token for a non-admin user (if one exists)                                                                                            | `403 FORBIDDEN`, no data changed                                                                                                                                                                         | SC-001                    |
| 3   | Create route with two directions  | `POST /api/admin/routes`; then `POST .../directions` twice, each with a `base_polyline` (LineString, `[lng, lat]`) and 2–3 stops (`location` Point) | `201`; `GET /api/admin/routes/:routeId` returns both directions with ordered stops                                                                                                                       | SC-002                    |
| 4   | Edit reflects without restart     | `PUT /api/admin/stops/:stopId` with a new `location`; immediately `GET` it                                                                          | New location returned; no server restart performed                                                                                                                                                       | SC-002                    |
| 5   | Deactivate (soft delete) route    | `DELETE /api/admin/routes/:routeId`; `GET /api/admin/routes`                                                                                        | `is_active: false`, row still present; export still contains it flagged inactive                                                                                                                         | SC-002, US2-s4            |
| 6   | Referenced-stop deletion rejected | Attempt `DELETE /api/admin/stops/:stopId` on a stop still in a direction's list / terminal                                                          | `409 CONFLICT`, data unchanged                                                                                                                                                                           | SC-003                    |
| 7   | Invalid writes rejected           | Empty stop list on a direction; invalid LineString; detour `entry` off the base polyline; restriction indices out of range                          | `422 VALIDATION_ERROR` (or `409`), nothing persisted                                                                                                                                                     | SC-003                    |
| 8   | Coordinate order audit            | Write several points/lines; read every stored geometry                                                                                              | Every coordinate pair parses as `[lng, lat]` (lon in ±180, lat in ±90); automated check over the whole dataset                                                                                           | SC-004                    |
| 9   | Export completeness & integrity   | Plot ≥1 route (scenario 3); `GET /api/admin/export/dataset`                                                                                         | Single file; `routes[]` includes it; every `stop_id` belongs to an existing direction; every direction to a route; valid per `export-dataset.schema.json`; empty dataset (fresh DB) returns `routes: []` | SC-005, SC-007            |
| 10  | Script consumes file              | Save export to disk, parse with a plain JSON reader (mirrors the Collaboratory script)                                                              | Parses without backend knowledge; `coordinate_order: "lng_lat"` present; no arrival-time fields                                                                                                          | SC-005, FR-010            |
| 11  | Local reproducibility             | Clean machine: follow Setup; authenticate as the seeded admin; persist a route; stop + restart the server; `supabase stop` + `start`                | Data survives; admin logs in; `GET /api/status` reports `status: "ok"` and correct stats                                                                                                                 | SC-006, SC-008, FR-013/14 |
| 12  | Latency                           | Repeat scenario 9/status reads 20×                                                                                                                  | ≥19 of 20 under 1 s locally                                                                                                                                                                              | SC-007                    |

## Test suites

- Unit (`tests/unit`): geometry/coordinate-order validation, FR-004 validation rules, fare-default fallback, export assembly.
- Integration (`tests/integration`, against the running local stack): auth gating (SC-001), CRUD reflection (SC-002), rejection paths (SC-003), export integrity (SC-005).
- Run with Vitest; the `test` task is added once the constitution amendment permitting a test runner is committed (see `plan.md` Constitution Check).
