---
type: architecture
title: "System overview: runtime topology and component ownership"
description: One-page map of what actually runs in this repository — the React admin SPA calling a Fastify v5 admin API over the { success, data | error } envelope, backed by a local Supabase Postgres+PostGIS+Auth stack — plus the shared packages, the standalone navbench harness, and the explicit list of systems the repo does not contain yet.
tags: [architecture, runtime-topology, monorepo, fastify, react, postgres, postgis, supabase, ownership, unimplemented-scope]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-07T11:05:10.019Z
sources:
  - id: openwiki-source-164e2da859b5277df81c7d94
    resource: repo://.github/workflows/ci.yml
  - id: openwiki-source-091a6f3b768285350bd22923
    resource: repo://apps/admin/.env.example
  - id: openwiki-source-b15c8142f7dadd25fcd60a11
    resource: repo://apps/admin/package.json
  - id: openwiki-source-3c86b3fbbbffea5996432e06
    resource: repo://apps/admin/src/features/fares/FareConfigForm.tsx
  - id: openwiki-source-cf721c6faeeb7a0eceef0e92
    resource: repo://apps/admin/src/features/routes/PoiSearchBar.tsx
  - id: openwiki-source-7920407612c2a416c506c8dc
    resource: repo://apps/admin/src/lib/api.ts
  - id: openwiki-source-8b50add952443a04c669c2ef
    resource: repo://apps/admin/src/lib/tiles.ts
  - id: openwiki-source-6dcbd1591a1f53c79d94f3d7
    resource: repo://apps/admin/vite.config.ts
  - id: openwiki-source-e86fe7b76c693666bc2cb828
    resource: repo://apps/mobile/package.json
  - id: openwiki-source-f67bec33dfc9a4a4a2f32dea
    resource: repo://apps/server/.env.example
  - id: openwiki-source-8bba6a6b546ef140b455fe64
    resource: repo://apps/server/src/api/app.ts
  - id: openwiki-source-c9463cc7bf58eac46532b782
    resource: repo://apps/server/src/api/auth-login.ts
  - id: openwiki-source-722e3fa27a1122846dbdce37
    resource: repo://apps/server/src/api/auth.ts
  - id: openwiki-source-d9f4bf9275c8f54e4ee6b62e
    resource: repo://apps/server/src/api/errors.ts
  - id: openwiki-source-f87f8d109d0bae81aeb497a0
    resource: repo://apps/server/src/api/export.ts
  - id: openwiki-source-e60da57bd8148114e50bd696
    resource: repo://apps/server/src/api/index.ts
  - id: openwiki-source-7f979ab28d734db4fc7bd59e
    resource: repo://apps/server/src/api/mapbox.ts
  - id: openwiki-source-ecff15130758c07a0046ce5a
    resource: repo://apps/server/src/api/origin-guard.ts
  - id: openwiki-source-bea77e812bd9fe3dec964d8a
    resource: repo://apps/server/src/api/status.ts
  - id: openwiki-source-2014e1b3b9dc33e2d979bcd3
    resource: repo://apps/server/src/config/db.ts
  - id: openwiki-source-35eaa2d2183c9d4e7e8c630f
    resource: repo://apps/server/src/config/env.ts
  - id: openwiki-source-67e4d746916c443070c58e2d
    resource: repo://apps/server/src/config/supabase.ts
  - id: openwiki-source-3191419c76ea18831b50ac9e
    resource: repo://apps/server/src/index.ts
  - id: openwiki-source-86f2f4f2cce3e9a72e313cac
    resource: repo://apps/server/tests/integration/global-setup.ts
  - id: openwiki-source-f6cd8b97ec7bc5ee78e0c8db
    resource: repo://apps/server/vitest.config.ts
  - id: openwiki-source-9d32624d7a6b4a762af938fe
    resource: repo://docs/adr/0017-runtime-for-backend-navigation.md
  - id: openwiki-source-605402db4d6aeedf914f16c7
    resource: repo://docs/DEVIATIONS.md
  - id: openwiki-source-131c9aea2857566566f8b149
    resource: repo://navbench/README.md
  - id: openwiki-source-c83ceec2d47257f066951051
    resource: repo://packages/shared/package.json
  - id: openwiki-source-265221f77947a8a08e9a018a
    resource: repo://packages/shared/src/index.ts
  - id: openwiki-source-3d191481cfb0a03ba1b3a300
    resource: repo://packages/shared/src/types/domain.ts
  - id: openwiki-source-699ad2c631059ba958ae7dc4
    resource: repo://packages/shared/src/types/envelope.ts
  - id: openwiki-source-b60fe8070f59dc3fd9450a49
    resource: repo://packages/ui/components/index.ts
  - id: openwiki-source-f6be298724faae579bff9b20
    resource: repo://packages/ui/index.ts
  - id: openwiki-source-40275cb92c3610938f16ade3
    resource: repo://pnpm-workspace.yaml
  - id: openwiki-source-d81538d8891efe37053aeccb
    resource: repo://supabase/config.toml
  - id: openwiki-source-a908f1d81925ca6028c98ded
    resource: repo://supabase/migrations/0000_create_postgis.sql
  - id: openwiki-source-4614a1f5d04b7b7127b1eefd
    resource: repo://supabase/seed.sql
  - id: openwiki-source-440ae1e215cb02721dda855c
    resource: repo://turbo.json
generated: { by: "openwiki/0.7.1", at: "2026-10-07T11:05:10.019Z" }
---

# System overview: runtime topology and component ownership

This repository is a pnpm/Turborepo monorepo whose shipping runtime is one browser app talking to one Node process talking to one local database. There is exactly one client of the API (the admin dashboard), one server-side entrypoint, and one persistence/identity stack (the Supabase CLI's local containers). Everything else in the tree is either shared code, evidence tooling, or scope that has not been built.

Design decisions are not restated here — `docs/adr/*.md` is authoritative and this page cites ADRs by number. Root design docs (`OVERVIEW.md`, `TECHSTACK.md`, `SCHEMA.md`, `SUMMARY.md`, `BACKEND.md`) are historical: they describe the target thesis system, not this file map, and their line numbers are cited by the ADRs. Where the code disagrees with a doc, this page says so outright.

## What runs

```mermaid
flowchart LR
  subgraph browser["Browser"]
    admin["apps/admin SPA Vite dev server port 5173"]
  end

  subgraph noderuntime["Node.js"]
    server["apps/server Fastify v5 port 3000"]
  end

  subgraph localstack["Supabase CLI local stack"]
    authgw["Auth gateway port 54321"]
    pg["Postgres 17 plus PostGIS port 54322"]
    studio["Studio port 54323"]
  end

  mapbox["Mapbox Directions API"]
  tilecdn["OpenFreeMap vector styles"]
  nominatim["OSM Nominatim geocoder"]
  harness["navbench harness Node Rust Go outside the workspace"]
  mobileapp["apps/mobile Expo starter"]

  admin -->|"JSON over HTTP with Bearer token"| server
  server -->|"service-role client sign-in and token verification"| authgw
  server -->|"Drizzle over pg Pool using DATABASE_URL"| pg
  server -->|"proxied Directions request with secret token"| mapbox
  admin -->|"basemap styles and tiles fetched directly"| tilecdn
  admin -->|"POI search fetched directly from the browser"| nominatim
  authgw --- pg
  studio -.->|"local inspection only"| pg
  harness -.->|"offline evidence for ADR-0017 not wired in"| server
  mobileapp -.->|"planned no integration exists"| server
```

The runtime topology: one browser client, one API process, one local Supabase stack, and the three outbound HTTP dependencies.

- **Admin SPA** — `apps/admin` (`admin`) is a React 18 + Vite 5 SPA. `vite` serves it on its default port 5173 during development; the built output is a static `dist/` bundle that nothing in this repo serves. Its environment contract is a single `VITE_API_URL` pointing at the Fastify server, so the browser calls the API cross-origin and every call is subject to the server's CORS and origin-allowlist configuration.
- **Fastify server** — `apps/server` (`server`) is the only long-lived backend process. `tsx watch src/index.ts` in development, `tsc` to `dist/` for a build; it binds `0.0.0.0` on `env.PORT` (default 3000). It speaks to Postgres directly with `pg` + Drizzle and to Supabase Auth with the service-role key.
- **Local Supabase stack** — `supabase/config.toml` declares the project id `komyuter` and the ports above (API 54321, database 54322, Studio 54323; PostgreSQL major version 17). This is the only database and identity provider: migrations and seed data live in `supabase/`, and `docs/DEVIATIONS.md` has no alternate or remote deployment story behind it.
- **Outbound HTTP** — the server makes exactly one kind of third-party call, the Mapbox Directions proxy; the browser fetches basemap styles straight from OpenFreeMap and POI search results straight from OSM Nominatim. Those three are the whole egress surface, and only the server-side one is proxied and keyed.
- **Not running** — `navbench/` is offline evidence tooling, `apps/mobile` is an Expo starter with no client of the API, and no orchestration file (`Dockerfile`, `docker-compose*.yml`, `vercel.json`, …) exists anywhere in the repo.

## Component ownership

| Path                         | Package                   | Owns                                                                                                                                                       | Entrypoint                                            |
| ---------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `apps/admin`                 | `admin`                   | The whole operator surface: login, overview, route/detour plotting workspace, fares, export. Owns client state (zustand) and the query cache (React Query). | `src/main.tsx` → `src/App.tsx` → `src/app/router.tsx`  |
| `apps/server`                | `server`                  | The admin CRUD API, the auth boundary, the PostGIS read/write layer, the export assembler, and the Mapbox proxy.                                            | `src/index.ts` → `buildApp()` in `src/api/app.ts`      |
| `apps/mobile`                | `mobile`                  | Nothing product-shaped yet — an untouched Expo starter. See [Mobile commuter app](../apps/mobile-commuter-app.md).                                          | `expo-router/entry` → `app/_layout.tsx`                |
| `packages/shared`            | `@komyuter/shared`        | The cross-app contract: TypeScript types plus the Zod schemas for geometry, domain entities, the response envelope, the export dataset and Mapbox payloads. | `src/index.ts` (barrel of `types/*` and `schemas/*`)   |
| `packages/ui`                | `@repo/ui`                | Two stub components and a barrel export. Nothing consumes it: it is not a dependency of any app.                                                            | `index.ts`                                             |
| `packages/typescript-config` | `@repo/typescript-config` | The shared `tsconfig` bases (`base.json`, `vite.json`, `react-library.json`) that the admin, server and package configs extend; `apps/mobile` keeps Expo's own base.                       | `tsconfig` files                                       |
| `supabase/`                  | —                         | Migrations `0000`–`0005`, `seed.sql`, and the local stack configuration. The schema source of truth is `apps/server/src/db/schema.ts`.                      | `supabase start` / `supabase db reset`                |
| `navbench/`                  | —                         | The Node/Rust/Go navigation-runtime feasibility harness. Not a workspace member and not part of the shipped app (ADR-0017 cites its results).               | `navbench/node`, `navbench/rust`, `navbench/go`, `navbench/poc` |

The workspace is declared as exactly two globs — `apps/*` and `packages/*` — with Turbo running `build` / `lint` / `test` / `dev` across them. `navbench/` sits deliberately outside those globs so its Rust and Go toolchains never enter `pnpm install` or a Turbo graph. Build/CI details belong to [Workspace, build and CI](./workspace-build-and-ci.md).

## The browser–server boundary

Every operation the operator performs crosses this boundary; nothing bypasses it.

- **One transport client.** `apps/admin/src/lib/api.ts` creates a single axios instance with `baseURL: import.meta.env.VITE_API_URL` and a request interceptor that attaches `Authorization: Bearer <token>` from `localStorage`. The admin package has no Supabase client dependency and no database driver, so the browser cannot reach Postgres or the Auth service directly; tokens are minted server-side.
- **The envelope.** `@komyuter/shared` defines `Envelope<T>` as `{ success: true; data: T } | { success: false; error: { code, message } }` with a closed `ERROR_CODES` set (`UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `CONFLICT`, `INTERNAL`). The server applies it centrally in `buildApp`'s error handler — `ApiError` maps to its own status code, Zod validation failures become `422 VALIDATION_ERROR`, everything else becomes `500 INTERNAL` with a generic message and a `app.log.error` line. The SPA mirrors this in a response interceptor: a successful envelope is unwrapped to `data`, a failure envelope is rejected as an `ApiError` carrying `code`/`message`/`status`, and a 401 outside the login call clears the stored token and emits the session-expired signal that drives the auth redirect.
- **Two deliberate exceptions to the envelope.** `GET /api/admin/export/dataset` returns the assembled dataset as a raw JSON attachment with `Content-Disposition: attachment; filename="komyuter-dataset.json"` (no `success`/`data` wrapper), and `POST /api/auth/logout` answers a bare `204`. Clients must not assume the envelope on those two paths.
- **Cross-origin policy.** The browser and the API are different origins in development (5173 vs 3000) with no Vite proxy, so `@fastify/cors` is registered with `origin: true` and an `onRequest` origin guard runs immediately after it: a request that carries an `Origin` header not present in `ADMIN_ORIGINS` is rejected with `FORBIDDEN` ("Origin not allowed"), while requests without an `Origin` (curl, native clients, tests) and `OPTIONS` preflights pass. `ADMIN_ORIGINS` defaults to `http://localhost:5173,http://127.0.0.1:5173`.
- **Production build hardening.** The Vite config injects a `<meta http-equiv="Content-Security-Policy">` into the built `index.html` only in production mode (dev keeps no CSP for HMR): `default-src 'self'`, `connect-src 'self' https://tiles.openfreemap.org` plus the origin of `VITE_API_URL`, `object-src 'none'`, `base-uri 'self'`. Anything the built SPA talks to must be on that list — which today it is not for the POI-search call (see [Where code and documentation disagree](#where-code-and-documentation-disagree)).

## The guarded request path

```mermaid
sequenceDiagram
  participant SPA as Admin SPA
  participant API as Fastify server
  participant Auth as Supabase Auth
  participant PG as Postgres and PostGIS

  SPA->>API: POST /api/auth/login with email and password
  API->>Auth: signInWithPassword
  Auth-->>API: session or error
  API->>PG: select admin_users where user_id equals caller id
  API-->>SPA: success true data access_token and user
  SPA->>API: admin request with Bearer token
  API->>API: origin guard then admin auth guard
  API->>Auth: getUser token
  API->>PG: admin_users membership check
  API->>PG: Drizzle CRUD or PostGIS geometry read
  API-->>SPA: success true data or success false error
```

Sign-in and one guarded admin request, including the two hook stages that every admin call passes.

The route surface is small and its split is the security model:

- **Public** — `GET /api/status` (row counts per table plus the latest `directions.updated_at`), `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`. The login route is also where throttling and the dev-credential gate live: denials are deliberately indistinguishable (`"Invalid email or password"` after a minimum delay), and the documented development credential is refused unless `ALLOW_DEV_CREDENTIAL=true`.
- **Admin-only** — everything else is registered inside one plugin mounted at `/api/admin` with a `preHandler` auth guard: routes/overview, directions, stops, detours, restrictions, fare configs, export, and the Mapbox proxy. The full endpoint table lives on [Server API surface](../operations/server-api-surface.md).
- **One authorization rule.** `createAdminAuthGuard` extracts a strict `Bearer` token, asks Supabase Auth to verify it, and then requires a matching `admin_users` row — the same `isAdminUserId` lookup that login and `/api/auth/me` use, so membership can never be decided two different ways. Failures are `401 UNAUTHORIZED` (missing/invalid token) or `403 FORBIDDEN` (valid user, not an admin). The guard records `request.adminUserId`, which the `onResponse` hook emits as a structured "admin request completed" log line with method, URL, status and outcome.

Authentication is Supabase Auth, not a hand-rolled JWT (ADR-0006); CRUD is Fastify v5 (ADR-0004). The server holds the service-role key, which is why no auth logic can be moved into the browser without changing that boundary.

## Configuration and operations

Configuration is all environment variables, validated once at startup:

- `apps/server/src/config/env.ts` loads `.env` when `DATABASE_URL` is not already set, then parses `process.env` with a Zod schema and throws `Invalid environment: <field>: <message>` on any problem — the process never starts half-configured. `src/index.ts` calls `loadEnv()` at module scope, before `main()`.
- Required: `DATABASE_URL` (the local Postgres, `postgresql://postgres:postgres@127.0.0.1:54322/postgres`), `SUPABASE_URL` (`http://127.0.0.1:54321`), `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`. Defaulted: `PORT` (3000), `ADMIN_ORIGINS`. Optional: `MAPBOX_SECRET_TOKEN`, and the boolean `ALLOW_DEV_CREDENTIAL` (default `false`).
- `apps/admin/.env.example` documents exactly one variable, `VITE_API_URL`, and states that `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are not used because auth is backend-proxied.
- The seeded admin (`supabase/seed.sql`) is a fixed UUID in `auth.users` + `auth.identities`, gated into the dashboard by the matching `admin_users` row, with a committed dev-only password; the CLI cannot interpolate env vars into seed files, so `ADMIN_EMAIL`/`ADMIN_PASSWORD` in `apps/server/.env` must match it. `supabase/config.toml` disables public signup and anonymous sign-ins, and sets `site_url` to `http://127.0.0.1:3000`.
- **Runtime re-validation.** `loadEnv` also runs inside the Mapbox proxy handler to read `MAPBOX_SECRET_TOKEN` on demand rather than caching it in `AppDeps`, so that request path re-parses the environment and fails fast if it has become invalid.

Local bring-up is therefore: `supabase start` (or `supabase db reset` to re-apply migrations and seed), copy both `.env.example` files to `.env`, then `pnpm dev`. `pnpm test` / `pnpm lint` / `pnpm typecheck` / `pnpm build` are the root gates.

Test ownership differs by app and matters when judging a green pipeline:

- `apps/admin` has the hermetic suite — node-environment helpers (plotting and detour stores, coordinate math, draft/TTL, geometry), no database, and it is what CI runs.
- `apps/server` has unit plus integration tests. The integration half needs the local Supabase stack and a `.env`; `tests/integration/global-setup.ts` recreates a dedicated `komyuter_test` database, snapshots/restores the live database, and drops it afterwards, and `vitest.config.ts` sets `fileParallelism: false` because the suites share one real database. It is a local pre-merge obligation, not a CI step.
- `navbench` parity tests and benchmarks run through their own Node/Rust/Go toolchains; no Turbo task or workflow invokes them.

## Systems the repo does not contain

This list is the fastest way to avoid inventing architecture. Each item is tracked, not overlooked:

- **No routing engine.** `apps/server` is an admin CRUD API: no transit graph builder, no Dijkstra, no navigation endpoint, no request-time virtual nodes. The server has no `graph` module and exposes no `/api/graph/status`, even though ADR-0005 and `docs/DEVIATIONS.md` D2 name that route as the retained debug surface — that route was never rehomed into this CRUD-only server. ADR-0017 keeps the future navigation service as a documented seam and does not ship it.
- **No caching or job infrastructure.** No Redis, no `ioredis` dependency, no worker threads, no BullMQ, no stale-while-revalidate cache (ADR-0005). In the current code there is also nothing to cache: nothing is computed from the graph.
- **No commuter-facing endpoints or trust layer.** Nothing ingests GPS traces or scores trust (ADR-0003 describes the intended discriminator only), and there is no public route/stop/navigate API for a commuter client to call. That absent surface is why the mobile app has nothing to integrate with — see [Routing, navigation and trust are not implemented](../concepts/routing-and-navigation-scope.md).
- **No mobile product.** `apps/mobile` is still the React Native Reusables "Minimal (Uniwind)" starter: no map, no AR, no sensors, no offline store, `react-native-reanimated` present but unused (`docs/DEVIATIONS.md` D10). See [Mobile commuter app](../apps/mobile-commuter-app.md).
- **No shared business logic.** `@komyuter/shared` exports types and Zod schemas only. `AGENTS.md` and `openwiki/INSTRUCTIONS.md` describe a shared `fareCalculator`; no such export, file or identifier exists in the package today. Fare arithmetic exists nowhere in the code either: fare configs are created, validated, and exported as parameters (`base_fare`, `base_distance_km`, `rate_per_km`, discount percentages), and the LTFRB formula itself appears only as UI copy and in the design docs.
- **No shared UI consumption.** `packages/ui` is exported but imported by no app; the admin builds its own components.
- **No deployment artifacts.** No container definitions, no compose file, no platform manifest, no reverse proxy; the server does not serve the admin's static build, and there is no migrated/remote database configuration beyond the local Supabase stack.

## Where code and documentation disagree

Recorded here so the disagreement is never silently resolved in prose:

- **Basemap tiles.** ADR-0013's tiles clause describes Mapbox vector tiles (used when `MAPBOX_PUBLIC_TOKEN` is set) with an OSM-raster fallback. The code fetches keyless OpenFreeMap vector styles (`bright` / `positron` / `liberty`) from `https://tiles.openfreemap.org` in `apps/admin/src/lib/tiles.ts`, and `MAPBOX_PUBLIC_TOKEN` appears nowhere in `apps/`. ADR-0016 already records that the admin basemap involves no Mapbox tile token; the ADR-0013 tiles text is the stale part. The renderer choice (MapLibre GL via `react-map-gl`) and the Mapbox-services-behind-the-proxy rule both match the ADR.
- **Geocoding is client-side, not proxied.** ADR-0013 places geocoding behind the server-side Mapbox proxy under `/api/admin/mapbox/*`. The shipped admin instead does POI search with a direct browser `fetch` to `https://nominatim.openstreetmap.org/search` from `apps/admin/src/features/routes/PoiSearchBar.tsx` (keyless, CORS-enabled, deliberately service-agnostic and biased to Iloilo). Production CSP is the consequence: `connect-src` lists `'self'`, OpenFreeMap and the `VITE_API_URL` origin but not `nominatim.openstreetmap.org`, so a production build blocks its own POI search. Nothing in `docs/DEVIATIONS.md` records this.
- **Mapbox token requirement.** ADR-0016 proposes making `MAPBOX_SECRET_TOKEN` required and deleting the straight-line fallback, but it is still PROPOSED: `env.ts` keeps the token optional and `registerMapbox` returns straight-line geometry with `snapped: false` and a `warning` of `no_token` or `upstream_error` on both failure paths (`docs/DEVIATIONS.md` A3).
- **Server scope.** `docs/DEVIATIONS.md` §0 states the verified position: `apps/server` is an admin CRUD API only, `apps/mobile` is an untouched Expo template, and `packages/shared` is types plus schemas. The code matches that section.
