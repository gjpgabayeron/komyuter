# AGENTS.md

## Repo state: what actually exists

- This repo started as the `create-turbo` "with-vite-react" starter. It now also contains the backend and shared packages:
  - `apps/web` — React 18 + Vite 5 + TS app
  - `apps/server` — Fastify v5 admin API (`@komyuter/server`), TDD'd against the local Supabase stack
  - `apps/mobile` — Expo app (from a later starter import)
  - `packages/ui` (`@repo/ui`), `packages/eslint-config` (`@repo/eslint-config`), `packages/typescript-config` (`@repo/typescript-config`), `packages/shared` (`@komyuter/shared`)
- The root `*.md` docs (`OVERVIEW.md`, `TECHSTACK.md`, `SCHEMA.md`, `SUMMARY.md`, `BACKEND.md`) are **design documents** for the target thesis system (Expo mobile app, admin dashboard, Fastify server, PostGIS, Supabase Auth). They are NOT a current file map — trust the code and `specs/001-local-supabase-backend/` for the backend. (`docs/adr/` and `CONTEXT.md` DO exist — they hold the design decisions and glossary.)
- Design decisions are recorded in `docs/adr/0001-…md` and the glossary in `CONTEXT.md`. The root design docs have been reconciled with those decisions; where a doc still disagrees, the ADR wins.
- Historically the docs contradicted each other and the config; resolved now:
  - Backend framework: **Fastify v5** (ADR-0004). `SUMMARY.md`'s Express references are superseded.
  - pnpm: docs claim 9+/10.12+; root `package.json` pins `"packageManager": "pnpm@8.15.6"`. Trust package.json.
  - `SUMMARY.md` claims Husky/commitlint/lint-staged, CI workflows, docker-compose — lint-staged/commitlint/Husky ARE configured; CI workflows and docker-compose are not.

## Commands

- `pnpm dev` / `pnpm build` — turbo pipelines across all packages (see `turbo.json`).
- `pnpm lint` — **single root ESLint 9 flat config** (`eslint.config.mjs`); runs `eslint .` repo-wide. Per-package lint scripts were removed; eslint lives only at root.
- `pnpm typecheck` — `tsc --noEmit` on `packages/ui`, `apps/admin`, `apps/mobile`, `apps/server`, and `packages/shared`. (The `apps/web` starter app was removed from the repo in commit `c9bf984`.)
- `pnpm format` — prettier `--write` on `**/*.{ts,tsx,md}`; `pnpm format:check` is the check-only variant used by CI. Config in `.prettierrc.json` (semicolons, double quotes). The five root design docs are in `.prettierignore`.
- **Tests**: `pnpm --filter server test` runs Vitest on `apps/server` (unit + integration). The integration suite requires the local Supabase stack up and `apps/server/.env` present. `turbo.json` has no `test` task — there is no repo-wide `pnpm test`.
- Hooks: `.husky/pre-commit` runs lint-staged (`eslint` + `prettier --check` on staged files, no auto-fix) and a warn-only branch-name check; `.husky/commit-msg` enforces conventional commits via commitlint (`commitlint.config.cjs`, scopes are warn-level).
- Install with pnpm (workspace deps use `workspace:*`); `.npmrc` sets `auto-install-peers = true`.

## Conventions that matter

- TS is strict via shared `@repo/typescript-config` (`strict: true`). Extend it; don't redefine tsconfigs from scratch.
- ESLint is a **single root flat config** (`eslint.config.mjs`): `@eslint/js` + `typescript-eslint` (non-type-aware), react-hooks/react-refresh rules, browser globals for `apps/web` + `packages/ui`, node globals for config files. `@repo/eslint-config` and all `.eslintrc.*` files were removed — do not recreate them.
- **Spatial data — coordinate order `[longitude, latitude]` everywhere** (GeoJSON, PostGIS `ST_MakePoint`, Mapbox GL). Leaflet is the only `[lat, lng]` exception; convert at the admin boundary via the single tested converter module in `apps/admin` (ADR-0007). Docs call this the single most dangerous pitfall — a swapped pair puts stops in the ocean.
- For meter-based PostGIS math, always cast `::geography`; raw geometry returns degrees.
- Fare is the LTFRB formula (`base_fare + max(0, dist_km - base_dist_km) × rate_per_km`; defaults ₱13 / 4km / ₱1.80, 20% student/senior). Planned shared package `@komyuter/shared` owns `fareCalculator` + shared types — reuse, never reimplement. The **displayed** fare is always the exact per-leg total; the Dijkstra **internal** cost is base-on-board + marginal ₱1.80/km (ADR-0001). Don't "fix" the internal cost into per-edge LTFRB — it's deliberate.
- Routes are modeled as two **directions**, each with its own polyline and ordered stop list (`stop_{stopId}_direction_{directionId}` nodes). Never reverse one polyline for the return trip (ADR-0008).
- Hail-and-ride boarding at non-stop positions uses request-time **virtual nodes + board edges**; they never persist and never enter the graph cache.
- Normalization is per-edge-type (distance/walk/fare/transfer pools), clamped to [0,1]; transfer-edge distance = 0 (ADR-0002).
- Trust scoring (MHD) is **informational only** — never a Dijkstra weight (panel constraint). Trace validity uses a max-speed discriminator (10–45 km/h), not average speed (ADR-0003).
- **No ETA anywhere** — navigation output is distances, fare, transfers, walk distance only (ADR-0009).
- AR is location-based Geo-AR (expo-camera + expo-sensors), only during walking/transfer segments — never during rides, never ARCore/ARKit.
- Authentication is Supabase Auth: admin-gated CRUD, commuter app anonymous with optional sign-in (ADR-0006). No DIY JWT.
- Documented API envelope: `{ success, data | error }`. Commit messages: `type(scope): description` (enforced by commitlint).
- **Server (`apps/server`) quality gates**: `pnpm --filter server typecheck` and `pnpm --filter server test` must pass before commit. Tests are written FIRST per `specs/001-local-supabase-backend/tasks.md` (TDD: red before implementation).
- **Server conventions**: Fastify v5 with `@fastify/type-provider-zod` (zod schemas from `@komyuter/shared`); drizzle-orm against Postgres/PostGIS; a single injectable `buildApp({ db, supabase })` with `AppDeps`/`AppInstance` types in `apps/server/src/api/app.ts`; admin routes registered under `/api/admin` with the Supabase auth guard; responses always use the `{ success, data | error }` envelope (error codes in `src/api/errors.ts`, handled centrally in `app.ts`). Geometry write/read goes through `src/db/queries.ts` (`ST_GeomFromGeoJSON` / `ST_AsGeoJSON`); entity validation lives in `src/domain/validation.ts`; the export assembler is `src/domain/export.ts`. `.env` is gitignored and auto-loaded by `src/config/env.ts` (guard is idempotent when tests pre-load it).
- Numeric columns in drizzle are string mode (no `mode: "number"` option in drizzle-orm 0.36.x) — convert with `Number()` at the handler layer.

## Design Context

- **PRODUCT.md** (repo root) and **DESIGN.md** (repo root) hold the product's strategic and visual systems. Load both before any UI work; DESIGN.md wins on visual decisions, PRODUCT.md wins on strategic/voice decisions.
- Register: **product**. Commuter app + admin dashboard share one world: **The Route Sign** (flat enamel sign-plate grammar, pure white ground, signboard green-blue + signal amber, ≤4px corners, no shadows).
- Surface briefs live in `.impeccable/surfaces/` per app; the first surface (commuter app) brief is at `apps/mobile/.impeccable/surfaces/apps-mobile.md`.

<!-- SPECKIT START -->

For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at specs/005-admin-appshell/plan.md
<!-- SPECKIT END -->
