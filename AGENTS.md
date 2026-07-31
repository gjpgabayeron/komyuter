# AGENTS.md

## Repo state: what actually exists

- This repo is the stock `create-turbo` "with-vite-react" starter (single commit). Only these exist:
  - `apps/web` — React 18 + Vite 5 + TS app
  - `packages/ui` (`@repo/ui`), `packages/eslint-config` (`@repo/eslint-config`), `packages/typescript-config` (`@repo/typescript-config`)
- The root `*.md` docs (`OVERVIEW.md`, `TECHSTACK.md`, `SCHEMA.md`, `SUMMARY.md`, `BACKEND.md`) are **design documents** for the target thesis system (Expo mobile app, admin dashboard, Fastify server, PostGIS, Supabase Auth). Those apps/packages, plus `supabase/`, `.github/`, `.env.example` do **not exist yet**. Do not treat the docs' repo-structure sections as current reality. (`docs/adr/` and `CONTEXT.md` DO exist — they hold the design decisions and glossary.)
- Design decisions are recorded in `docs/adr/0001-…md` and the glossary in `CONTEXT.md`. The root design docs have been reconciled with those decisions; where a doc still disagrees, the ADR wins.
- Historically the docs contradicted each other and the config; resolved now:
  - Backend framework: **Fastify v5** (ADR-0004). `SUMMARY.md`'s Express references are superseded.
  - pnpm: docs claim 9+/10.12+; root `package.json` pins `"packageManager": "pnpm@8.15.6"`. Trust package.json.
  - `SUMMARY.md` claims Husky/commitlint/lint-staged, Vitest tests, CI workflows, docker-compose — none are configured.

## Commands

- `pnpm dev` / `pnpm build` — turbo pipelines across all packages (see `turbo.json`).
- `pnpm lint` — **single root ESLint 9 flat config** (`eslint.config.mjs`); runs `eslint .` repo-wide. Per-package lint scripts were removed; eslint lives only at root.
- `pnpm typecheck` — `tsc --noEmit` on both `packages/ui` and `apps/web` (UI has no build script, so this is its only type gate).
- `pnpm format` — prettier `--write` on `**/*.{ts,tsx,md}`; `pnpm format:check` is the check-only variant used by CI. Config in `.prettierrc.json` (semicolons, double quotes). The five root design docs are in `.prettierignore`.
- **There is no test task.** No test runner installed; `turbo.json` defines no `test`. Do not invent a `pnpm test`.
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

## Design Context

- **PRODUCT.md** (repo root) and **DESIGN.md** (repo root) hold the product's strategic and visual systems. Load both before any UI work; DESIGN.md wins on visual decisions, PRODUCT.md wins on strategic/voice decisions.
- Register: **product**. Commuter app + admin dashboard share one world: **The Route Sign** (flat enamel sign-plate grammar, pure white ground, signboard green-blue + signal amber, ≤4px corners, no shadows).
- Surface briefs live in `.impeccable/surfaces/` per app; the first surface (commuter app) brief is at `apps/mobile/.impeccable/surfaces/apps-mobile.md`.
