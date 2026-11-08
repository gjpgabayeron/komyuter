# ADR-0018: Deployment topology and production data plane (DECIDED)

- **Status**: DECIDED — the direction is agreed and recorded; implementation begins at milestone **M1**
- **Date**: 2026-10-08
- **Supersedes/refines**: refines the cross-origin assumption implicit in `specs/005-admin-appshell/` and
  `specs/009-auth-quick-wins/` (the CSP `connect-src` API origin, and the `ADMIN_ORIGINS` allow-list).
  Both survive for local development; production no longer needs either as an exception. Relates to
  ADR-0006 (Supabase Auth) and ADR-0017 (the navigation seam).

## Context

Nothing in the repository serves the admin app today, and two properties of how it is built constrain
where it can run.

**The build bakes in its environment.** `apps/admin/src/lib/api.ts:33` sets
`baseURL: import.meta.env.VITE_API_URL`, and the `cspPlugin` in `apps/admin/vite.config.ts` injects a
`<meta http-equiv="Content-Security-Policy">` into the built `index.html` — **production mode only** —
deriving `connect-src` from that same variable. So the deployed artifact knows its API origin at
compile time, not at run time.

**There are only ever two origins.** The admin SPA never talks to Supabase: authentication is
backend-proxied by design (ADR-0006), with `POST /api/auth/login` using the service-role key
server-side. The SPA's only outbound destinations are the admin API and the OpenFreeMap tile CDN.

Other relevant facts:

- `apps/server` has no `start` script and no static-file plugin; `apps/admin` has no deploy config.
- Cross-origin traffic is already anticipated and guarded: `@fastify/cors` plus an `ADMIN_ORIGINS`
  comma-separated allow-list in `apps/server/src/config/env.ts`, defaulting to `localhost:5173`.
- **The database is not independent of authentication.** `supabase/migrations/0002_admin_users_auth_fk.sql`
  declares `admin_users.user_id` as a foreign key to `auth.users.id` with `ON DELETE CASCADE`. PostGIS
  is also required.
- Migrations are SQL in `supabase/migrations/`, produced by drizzle-kit and applied through the Supabase
  CLI; `supabase/seed.sql` seeds the documented **dev** credential.
- There is no Dockerfile or compose file anywhere, and the deployment target is Railway.

## Decision

1. **One service, one origin.** A single Railway service runs the Fastify API, which also serves the
   built admin SPA from the **same origin** via `@fastify/static`, with a history fallback that rewrites
   non-`/api` paths to `index.html`. `apps/server` gains a real `start` script.
2. **Production sets no `VITE_API_URL`.** `apps/admin/.env.production` is committed with the value
   intentionally empty. Three consequences follow: `connect-src` stays `'self'` plus the tile CDN with
   no origin exception; axios resolves against the document origin; and the built artifact contains no
   hostname, so **staging and production run the identical image**.
3. **Containerised with an explicit Dockerfile**, not Railway's build auto-detection. This is a pnpm
   workspace monorepo driven by turbo — the case framework-detecting builders get wrong — and a
   multi-stage Dockerfile makes the build reproducible (`pnpm build`, then run `node` with production
   dependencies). Docker is the milestone's stated intent, recorded here so the builder choice is not
   silently delegated to the platform.
4. **The production database is the Supabase Cloud project that provides Auth.** Because of the
   `admin_users → auth.users` constraint, the application tables cannot be hosted elsewhere without
   giving up the guarantee that no Account exists without an auth identity. Railway therefore carries
   the API and the SPA it serves, not the data.
5. **Migrations are an explicit deploy step** — applied before the new container goes live — and
   **never at container boot**, so a rolling deploy cannot race a schema change. The pipeline form of
   this is M4; the manual form is M1.
6. `ADMIN_ORIGINS` stays set in production, to the service's own origin, as defence in depth rather
   than as a cross-origin necessity.

## Alternatives considered

- **Two services** — SPA on a static host, API as a container. Faster SPA iteration and independent
  caching, rejected because it reintroduces exactly the two configuration surfaces that same-origin
  removes (the `ADMIN_ORIGINS` allow-list and a build-time API origin), and because it publishes the
  API origin into the shipped HTML.
- **Railway Postgres for the application tables, Supabase Cloud for Auth only.** A cross-database
  foreign key is impossible, so the `admin_users → auth.users` constraint would have to be dropped and
  identity integrity would degrade from a database guarantee to an application convention.
- **Self-hosted Supabase on Railway.** Full control and no vendor, at the cost of operating Auth, Kong,
  PostgREST and Studio — unjustified for a solo developer on a fixed deadline.
- **Runtime configuration** (`/config.json`, or a `window.__CONFIG__` the container injects) to promote
  one artifact across environments. Rejected: a `meta`-tag CSP cannot include an origin known only at
  boot, so this requires moving the CSP to a server-set response header _and_ adding a pre-flight fetch
  before the first API call — more moving parts, plus a runtime injection point to protect, in exchange
  for a capability that same-origin already provides.
- **Build per environment** with `VITE_API_URL` injected in CI. Workable and initially simpler, but it
  makes the release artifact environment-specific, so promoting staging to production becomes a rebuild
  rather than a promotion.

## Consequences

- **Positive**: no CORS to misconfigure; `connect-src` at its strictest; no hostname and no secrets in
  the bundle (`SUPABASE_SERVICE_ROLE_KEY` and `MAPBOX_SECRET_TOKEN` stay server-runtime only); one URL
  to hand to the team; one container on the bill; and environment-agnostic artifacts, which makes M4's
  promotion story trivial.
- **Trade-off**: `@fastify/static` becomes the **first new runtime dependency** in a project whose
  specifications advertise adding none, and any SPA change rebuilds the API image. Railway's build cache
  absorbs most of the second; the first is a deliberate, recorded cost.
- **Risk**: the history fallback must exclude `/api/*`, or the SPA's `NotFound.tsx` and the API's own
  404 responses will compete for the same handler and produce misleading errors.
- **Risk**: production now depends on two vendors (Railway for compute, Supabase for data and auth). An
  outage of either is an outage of the app.

## Non-goals (explicit)

- No CD pipeline, preview environments or rollback automation here — that is milestone **M4**.
- No deployment of the native navigation service from ADR-0017; the playground work in M6 exposes
  algorithms through `apps/server` behind that contract, in-process.
- No containerisation of Supabase, and no multi-region deployment (ADR-0010).
- No change to the admin SPA's routing, data fetching or authentication flow.
