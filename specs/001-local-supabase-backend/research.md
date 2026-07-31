# Research: Admin Backend — Auth, Route CRUD, and Data Collection

Phase 0 output for `specs/001-local-supabase-backend`. Each unknown from the plan's Technical Context is resolved here as `Decision → Rationale → Alternatives`.

## R1. Node.js runtime version

- **Decision**: Node.js 22 LTS.
- **Rationale**: Fastify v5 requires Node ≥ 20; Node 22 is the current active LTS and is what the local environment should pin. The workspace pins `packageManager: pnpm@8.15.6` (no `.nvmrc`/`engines` exist).
- **Alternatives considered**: Node 20 (minimum but older LTS). Chosen 22 for the longer support window; documented in `apps/server/.env.example` and quickstart.

## R2. Local Supabase Docker stack (spec FR-013, FR-019)

- **Decision**: Use the official Supabase CLI to run the whole backend locally: `supabase init` (writes `supabase/config.toml`), `supabase start` (brings up Postgres, Auth/GoTrue, and supporting containers in Docker), `supabase status` (prints local URLs and service-role key).
- **Rationale**: This satisfies "Local Supabase Docker" exactly — Postgres + PostGIS + Auth all local, zero hosted dependency, reproducible from config committed in the repo. Migrations live under `supabase/migrations/` and are applied by `supabase start` / `supabase db reset`; `[db.seed]` in `config.toml` points at `supabase/seed.sql`, which runs after migrations on a reset.
- **Details**: PostGIS is enabled by an early migration file (`create extension if not exists postgis;`). The local Postgres is reached by the server over the connection string printed by `supabase status` (default `postgresql://postgres:postgres@127.0.0.1:54322/postgres`), which the server consumes via `DATABASE_URL`.
- **Alternatives considered**: Standalone `docker-compose` Postgres+PostGIS (rejected: would not give us local Supabase Auth, which ADR-0006 requires); hosted Supabase (rejected: spec FR-013 demands no hosted dependency).

## R3. Server-side admin token verification (spec FR-001, FR-016; ADR-0006)

- **Decision**: Verify the Bearer access token with a service-role `@supabase/supabase-js` client calling `supabase.auth.getUser(token)`; then check membership in an `admin_users` table (`user_id` PK referencing `auth.users(id)`).
- **Rationale**: ADR-0006 forbids DIY JWT. `getUser(token)` is the canonical server-validated verification (round-trips to local Auth), which is fine at this scale and avoids maintaining key material/JWKS logic in the server. The `admin_users` lookup is a simple, auditable single-admin gate and lets us seed exactly one admin (spec FR-016) without touching JWT claims.
- **Alternatives considered**: `getClaims()` local JWT verification (faster, no round-trip; rejected as premature — single admin, local network, latency is not a target); decoding the JWT ourselves with `@fastify/jwt` (rejected: DIY-adjacent, violates ADR-0006 intent); relying on a custom `app_metadata` claim alone (rejected: harder to audit/seed than a table).

## R4. Drizzle ORM + PostGIS spatial columns (BACKEND.md §11)

- **Decision**: Drizzle as the ORM with the Postgres `pg` driver. Spatial columns use Drizzle's built-in `geometry` column type (`{ type: 'point' | 'linestring', srid: 4326 }`) plus a GiST index on stop locations; PostGIS functions (`ST_GeomFromGeoJSON`, `ST_AsGeoJSON`, `ST_MakePoint`, `ST_SetSRID`) are invoked via Drizzle's `sql` template where raw SQL is needed.
- **Rationale**: Drizzle supports geometry columns natively and exposes a `sql` escape hatch for PostGIS — exactly the strategy documented in BACKEND.md §11 (type-safe CRUD + raw SQL for spatial). The schema is declared in TypeScript (Drizzle) as the migration source of truth; drizzle-kit generates SQL that is committed into `supabase/migrations/`.
- **Data flow (save)**: client sends GeoJSON (already `[lng, lat]`) → server validates order → `ST_GeomFromGeoJSON($geojson)` → stored as `geometry(Point|LineString, 4326)`. **Load**: `ST_AsGeoJSON(col)` → GeoJSON returned to the client. Both paths enforce the coordinate-order rule.
- **Alternatives considered**: Prisma (rejected: no native PostGIS — documented in BACKEND.md); pure raw SQL everywhere (rejected: loses type safety for CRUD); manual `customType` wrappers (rejected: Drizzle's built-in geometry covers point/linestring with SRID).

## R5. Test runner adoption (Constitution Engineering Workflow TODO)

- **Decision**: Adopt **Vitest** for `apps/server` (unit + integration suites) and add a `test` task for the server.
- **Rationale**: The constitution's TODO explicitly defers this decision to planning time, and Principle V requires independently testable, measurable validation. SC-001–SC-008 (100% rejection coverage, coordinate-order audit, export reference integrity) cannot be credibly claimed without automated tests. Integration tests run against the local Supabase stack.
- **Governance**: Adding a test task is prohibited by the constitution _until amended_. This plan therefore records a **PATCH amendment** to the Engineering Workflow section ("A test runner (Vitest) is permitted for workspace apps; each app that defines tests contributes a `test` task to `turbo.json`"), with rationale + migration note, committed as the first implementation task (see plan Complexity Tracking).
- **Alternatives considered**: `node:test` built-in runner (zero dependency; rejected: weaker assertions/spying ergonomics for a thesis demo suite); keeping manual verification only (rejected: cannot prove the 100%-coverage success criteria).

## R6. Export dataset file format (spec FR-009/FR-010; Q3)

- **Decision**: A single JSON document with a `schema_version`, an explicit `coordinate_order: "lng_lat"`, `exported_at` timestamp, `fare_configs[]`, and `routes[]` (each with `directions[]` containing `base_polyline`, ordered `stops[]`, `detours[]`, `restrictions[]`). Full shape defined in `contracts/export-dataset.schema.json`.
- **Rationale**: JSON is trivially parseable by a Python Collaboratory script; the explicit `coordinate_order` field makes the [lng,lat] invariant self-documenting to the external script; active/inactive routes are both included (spec US2 scenario 4). GeoJSON is embedded for all geometry so the script can reuse standard GeoJSON tooling.
- **Alternatives considered**: GeoJSON FeatureCollection of the whole dataset (rejected: loses the route→direction→stop hierarchy and fare/restriction metadata); CSV (rejected: cannot represent nested polylines/stops); SQL dump (rejected: couples the script to Postgres).

## R7. Admin seeding (spec FR-016; Q4)

- **Decision**: `supabase/seed.sql` creates the admin identity inside local Auth (`auth.users` + `auth.identities` with a password hash) and inserts the matching `admin_users` row. The password is supplied from local config/env (`ADMIN_EMAIL`, `ADMIN_PASSWORD`), not committed in plain text.
- **Rationale**: A deterministic single admin usable by the dashboard's sign-in flow, reproducible by `supabase db reset`, and consistent with ADR-0006's single-admin role.
- **Alternatives considered**: Signup-first-user-becomes-admin (rejected by Q4); invite flow (rejected by Q4); creating the user at server startup via the admin API (rejected: makes startup order-dependent and env-tricky; SQL seeding is the Supabase-documented pattern for local).
