# ADR-0022: Railway platform utilization and deploy mechanics (DECIDED)

- **Status**: DECIDED — the platform decisions are recorded; `docs/ROADMAP.md` **M1** applies the ones
  the first deploy needs, and **M4** turns the rest into a pipeline
- **Date**: 2026-10-11
- **Supersedes/refines**: refines `docs/adr/0018-deployment-topology.md` (the topology is unchanged —
  one service, one origin, one environment-agnostic image; this fixes **which** platform primitives
  implement it) and `docs/adr/0021-branching-and-environments.md` (the branch→environment mapping is
  unchanged; this fixes the trigger and approval mechanics). Supersedes nothing.

## Context

Four facts shaped this, all checked against the platform on 2026-10-11 rather than inferred.

**The project exists and is empty.** Railway project `komyuter`
(`7fcd6734-d77e-4bb3-b0f0-4d39aef20fdc`, workspace `gjpgabayeron's Projects`) has two environments —
`staging` (`b24642cf-7abb-42b7-b11b-da6185d4e545`) and `production`
(`ce458aad-af62-450b-b2cc-fe25fcdd82b7`) — and **no services, volumes, buckets, shared variables or
staged changes in either one**. Nothing is grandfathered, so every choice below is still free.

**Config as Code is already spent.** `railway.json` and `railway.toml` are **deprecated**: a new service
cannot opt into them, and existing files stop being read on **2026-12-01**. Reaching for the familiar
file would therefore adopt a format with under two months of life. Its replacement is Infrastructure as
Code — `.railway/railway.ts` (TypeScript is GA; Python and Go are beta), driven by
`railway config init | pull | plan | apply`.

**ADR-0018 asks for three things the platform has a native primitive for.** Explicit build configuration
rather than framework auto-detection (§3); migrations applied as an explicit step _before_ the new
container goes live and **never at container boot** (§5); and one service serving API and SPA from one
origin (§1). The first is `build.builder`/`build.dockerfilePath`, the second is
`deploy.preDeployCommand`, and the third is already built.

**The image is the artifact that must be promoted, and it is environment-agnostic.** ADR-0018 §2 gives
staging and production the identical build because no hostname is baked in. Any setting recorded here
that reaches the _build_ rather than the runtime would break that property, so the decisions below are
deliberately confined to runtime configuration.

**And one thing the platform must not be handed.** `apps/server` cannot boot without `ADMIN_EMAIL` and
`ADMIN_PASSWORD` (`apps/server/src/config/env.ts`), yet nothing in the running server reads them: login
refuses a hardcoded `DEV_CREDENTIAL` (`apps/server/src/api/auth-login.ts:20-24`). Their real consumers
are `apps/server/src/scripts/bootstrap-owner.ts` and the integration harness
(`apps/server/tests/integration/helpers.ts`, `tests/integration/test-db.ts`), which sign in as — and
mirror into the test database — the admin that `supabase/seed.sql` seeds. So M1's variable list as
written would put the owner's real password on the live service for no runtime reason, and the pair is
already recorded as validated-but-unread configuration (`docs/SECURITY.md`, finding E3).

## Decision

### 1. The shape: one project, two environments, one service each

1.1 One Railway project (`komyuter`) with the two long-lived environments `staging` and `production`,
and **exactly one service per environment**. No PR preview environments (unchanged from ADR-0021 §1).

1.2 The service is a **container service built from this repository's `Dockerfile`**, with
`build.builder = DOCKERFILE`. Auto-detection is never used (ADR-0018 §3): this is a pnpm + turbo
workspace, which is the case framework-detecting builders get wrong.

1.3 Each environment's service instance tracks **its own branch** — `staging` → `dev`, `production` →
`main` (ADR-0021 §2-3). The branch is per environment, not per service.

### 2. M1 is configured by dashboard and CLI; IaC arrives at M4

2.1 M1 does **not** adopt IaC. The milestone's purpose is a thin deploy that proves hosting, database,
auth and configuration end to end, and a brand-new moving part in the config path is the opposite of
thin.

2.2 **Do not create `railway.json` or `railway.toml`**, not even as a stopgap before the 2026-12-01
cutoff. The format cannot be adopted by a new service and must not become a habit this repository
carries past its expiry.

2.3 IaC is **M4 work**, gated on a spike answering one question: _can one `.railway/railway.ts` express
a per-environment `source.branch`?_ If it can, the whole environment-invariant shape moves into source
and drift becomes checkable. If it cannot, the branch assignment stays per-environment dashboard/CLI
configuration and only the environment-invariant shape (builder, dockerfilePath, watch patterns,
healthcheck, region, replica count) is managed in source. Recording the fallback here is deliberate: the
spike's answer should pick between two prepared outcomes, not reopen the decision.

2.4 Whatever IaC lands, **secrets stay in Railway variables** and imports use `preserve()`. The
authoring file records shape, never values, never Railway UUIDs and never generated service domains.

### 3. Migrations run in Railway's pre-deploy step

3.1 Migrations are applied by `deploy.preDeployCommand` running `supabase db push` against that
environment's own `DATABASE_URL`. This is the primitive ADR-0018 §5 was written to describe: it is a
distinct lifecycle phase, it is **not** container boot, and a failure fails the deployment instead of
shipping a new container against an old schema.

3.2 The runtime image therefore carries the migration tooling — the Supabase CLI pinned to a version,
plus the migrations directory. This is a **deliberate, recorded cost**: the image stops being minimal,
and the serving process never uses either. It is the second recorded exception to this project's "add no
runtime dependencies" line, after `@fastify/static` (ADR-0018).

3.3 Migrations are still written as SQL in `supabase/migrations/` and applied in order. **Never
`drizzle-kit push`** against any environment: it mutates a database directly and records no history.

3.4 `supabase/seed.sql` is never applied to a Cloud environment, and `ALLOW_DEV_CREDENTIAL=false` in
both (ADR-0021) — the documented dev credential must be refused everywhere.

### 4. Production is gated by Railway's native deployment approval

4.1 Production's service requires approval for each deployment: merging `dev` → `main` builds, then
waits in `NEEDS_APPROVAL` until a human releases it. This satisfies ADR-0021 §3 without a GitHub
Environment, without `RAILWAY_TOKEN` in CI, and with the approval recorded on the deployment itself.

4.2 Tags (`vX.Y.Z`) continue to **record** the release rather than trigger it (ADR-0021 §3).

### 5. Deployment mechanics

5.1 **Health check**: `deploy.healthcheckPath = /api/status`. That path already exists, already proves
the container reaches Postgres, and needs no authentication — which is what a platform health check
requires. Leave `deploy.healthcheckTimeout` at the platform default unless the local rehearsal shows a
cold start exceeding it; `/api/status` is not a cheap liveness probe, it is a database round trip.

5.2 **Restart policy**: `ON_FAILURE` with a bounded retry count, so a crash-looping container is
reported rather than restarted forever.

5.3 **Watch patterns** (`build.watchPatterns`) must cover exactly what the image is built from, so a
docs-only or mobile-only push does not rebuild and redeploy the API:

- `Dockerfile`, `.dockerignore`
- root manifests: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`, `turbo.json`
- **every** workspace manifest, including `apps/mobile/package.json` — the Dockerfile's dependency layer
  COPYs all five, so a change to any of them changes the installed tree
- `apps/server/**`, `apps/admin/**`, `packages/shared/**`, `packages/ui/**`
- the migrations directory, once decision 3.2 puts it in the image

`apps/mobile` source beyond its manifest, `navbench`, `docs`, `openwiki` and `.impeccable` are excluded —
`.dockerignore` keeps them out of the build context.

5.4 **Wait for CI** (`source.checkSuites`) is enabled, so a commit whose pipeline is red does not
deploy. It is recorded here explicitly that this does **not** close the CI gap: it refuses a red
pipeline, it does not make `apps/server`'s suite run, so a server-side regression still reaches staging
through a green pipeline (`docs/ROADMAP.md` M4).

### 6. Region and replicas

6.1 Both environments run in **`asia-southeast1-eqsg3a` (Singapore)** — the nearest platform region to
Iloilo City, the single region of ADR-0010. Staging and production are in the same region so that a
latency difference between them is never a variable under test.

6.2 **One replica each.** The service is stateless (bearer tokens are verified against Supabase per
request, nothing is cached in process beyond the login throttler), so raising the count is a
configuration change and not a code change — but nothing justifies paying for it yet. The login
throttler is per-process (`apps/server/src/api/login-throttle`), so a second replica would divide the
throttle's effectiveness rather than break correctness.

### 7. Observability, notification and provenance

7.1 `railway logs` (including the HTTP and network-flow views) and `railway metrics` are the triage
path. No SSH into the container is part of any procedure.

7.2 A **project webhook** on deployment failure notifies a chat channel. Webhooks are project-scoped
rather than per environment, so one covers both environments. Test the endpoint before creating it —
repeated delivery failures pause a webhook for 24 hours.

7.3 The container logs its provenance **at boot**: the Railway-provided `RAILWAY_GIT_COMMIT_SHA`,
`RAILWAY_GIT_BRANCH`, `RAILWAY_ENVIRONMENT_NAME` and `RAILWAY_DEPLOYMENT_ID`. This makes "which commit
is on staging?" answerable from the logs, which M4's rollback runbook needs, **without** publishing the
deployed revision to anonymous callers. Exposing it through the unauthenticated `GET /api/status`
instead is the alternative, and is rejected here on that disclosure ground; revisit only if the runbook
turns out to need it without a dashboard.

7.4 Railway's own tracing (OpenTelemetry, per service per environment) is **available and not adopted**.
It is the natural way to see Postgres/drizzle spans, and if M4 or the thesis needs request-level
evidence it is the first thing to enable — with SDK instrumentation rather than automatic (eBPF),
because the app owns its own span boundaries.

### 8. Cost control before the first deploy

8.1 A workspace **soft** limit (email alert) and **hard** limit (spend cap) are set before the first
deploy. Two environments plus two Supabase Cloud projects is the deliberate cost shape; the second
environment is bounded and should not be discovered on an invoice.

8.2 Staging may use App Sleeping (`deploy.sleepApplication`) to idle when unused, where the plan offers
it. **Production must not**: a sleeping service adds seconds to the first request, and M1's exit
criterion is a second person using the deployed URL.

### 9. The service carries no credentials it does not use

9.1 `ADMIN_EMAIL` and `ADMIN_PASSWORD` become **optional** in `envSchema`
(`apps/server/src/config/env.ts`), removing a boot-time requirement the server has no use for. The two
contexts that genuinely consume them — the bootstrap script and the integration harness — get a strict
counterpart, `loadAdminCredentials()`, which requires the pair and names the offending variable in its
error. That split is the load-bearing part: `envSchema` is the single reader for `src/` and `tests/`
alike, so merely making the two fields optional would have quietly handed `undefined` to the suite that
signs in as the seeded admin.

9.2 `ADMIN_EMAIL` and `ADMIN_PASSWORD` are therefore **not** Railway service variables. They belong to
the operator's shell at the moment the bootstrap script runs, which is what `docs/DEPLOY.md` §2 already
says the script is for. `docs/ROADMAP.md` M1's variable list is corrected accordingly.

9.3 They stay in `apps/server/.env.example` and in a local `.env`, where they are the documented mirror
of `supabase/seed.sql` — which is exactly what `specs/009-auth-quick-wins/research.md` R4 kept them for
when it rejected deleting them. This decision removes only the **boot** requirement, which R4 never
considered (there was no deployed service then); it does not reverse R4, and the pair is still documented
where the seed is.

## Consequences

- **Positive**: every requirement in ADR-0018 and ADR-0021 is now implemented by a named platform
  primitive instead of prose — the builder, the migration step, the health check, the branch mapping,
  the approval gate. Failure notification and a spend cap exist before there is any traffic to lose.
  The environment-agnostic image survives, because every setting above is runtime or deploy-time
  configuration and none of it reaches the build.
- **Trade-off**: the runtime image is no longer minimal. Decision 3.2 puts the Supabase CLI and the
  migrations directory into an image whose serving process uses neither.
- **Trade-off**: `preDeployCommand` makes a failed migration block the deploy, which is the intent —
  but a chain that fails halfway leaves a partially applied schema and no new container. Recovery is
  the M4 rollback runbook's job, not an automatic behaviour.
- **Risk**: the CI gap is unchanged and this ADR does not narrow it. `checkSuites` (5.4) and the
  deploy-time migration step both sit on a pipeline that never runs `apps/server`'s suite.
- **Risk**: one migration chain now has two destinations that are applied by the platform rather than
  by a person watching. A misdirected `DATABASE_URL` is a misdirected migration, and nothing in the
  container compares the chain against the environment it is about to write to.

## Alternatives considered

- **`railway.json` / `railway.toml` as the config home.** Rejected: deprecated, unadoptable by a new
  service, and unread after 2026-12-01.
- **Migrations in GitHub Actions, with CI triggering the deploy via `railway up`.** Rejected at this
  scale: it moves deploy authority out of the platform, needs `RAILWAY_TOKEN` in GitHub, and gives up
  the branch→environment mapping ADR-0021 is built on. It stays the better answer if the image's size
  becomes a real constraint, and is the migration to make if it does.
- **Migrations in CI, with `checkSuites` gating the build.** Rejected: a migration can be applied and
  the build then fail, leaving the schema ahead of an app that never shipped.
- **GitHub Environments as the production approval gate.** Rejected: approval belongs where the
  deployment is, and the platform records it on the deployment. Revisit only if approvals must be
  audited beside the merge in the repository.
- **Keeping migrations manual through M1 and deciding at M4.** Rejected: `preDeployCommand` is the
  primitive ADR-0018 §5 was written to describe, and deferring it would mean changing the image after
  the environment is already live and in use.
- **Shared variables for the environment-invariant values.** Rejected: they are environment-scoped, and
  with a single service there is no second service to share with. Revisit when a second service exists.

## Non-goals (explicit)

- **CDN caching.** One origin serves the SPA and `/api/*` (ADR-0018 §1), so edge caching of HTML or
  responses would cache API responses. Left off. If it is ever enabled, `/api/*` must be excluded
  first — this is the one platform feature that is actively unsafe in this topology.
- **Buckets and volumes.** Supabase Cloud owns the data (ADR-0018 §4) and the service is stateless;
  neither has a use here.
- **WAF Under Attack Mode.** It challenges non-browser clients and would break API callers.
- **Static outbound IP.** Only meaningful if Supabase network restrictions are enabled, which they are
  not.
- **A Railway-hosted database, Redis, or self-hosted Supabase** — decided against in ADR-0018 §4 and
  ADR-0005.
- **PR preview environments** — unchanged from ADR-0021 §1.
- **Railway cloud agents and sandboxes.** Build and deploy happen in CI and on the platform; a remote
  development VM is not part of this project.

## Verification gaps

Assertions this ADR depends on that must be confirmed against the platform before they are relied on.
None of them is a reason to revisit the decisions above; each has a prepared fallback or is a rehearsal.

1. **Does `preDeployCommand` run before or after a deployment is approved?** This decides whether an
   unapproved production deployment has already migrated. Confirm in `railway deployment list` during
   the M4 rehearsal, before the approval gate is treated as a migration gate too.
2. **Can one IaC authoring file express a per-environment `source.branch`?** Decision 2.3's M4 spike.
   The prepared fallback is stated there.
3. **What does `supabase db push` require from the workspace when run inside the runtime image?** The
   exact invocation, and whether it needs `supabase/config.toml` beside the migrations directory, must
   be rehearsed against the built image in `docs/DEPLOY.md`'s local rehearsal before the first staging
   deploy — not discovered in a pre-deploy step.
   **Answered 2026-10-14** by that rehearsal, against the built image and the local stack: with only
   `supabase/migrations` copied and the image's working directory `/app`,
   `supabase db push --db-url "<url>"` discovers the chain, reads the target's history and reports
   `Remote database is up to date.` — no `config.toml` and no `--workdir` are needed. The one parameter
   the rehearsal did surface is TLS: the CLI requires it by default while the local stack serves
   plaintext, so a local URL needs `?sslmode=disable` and a Cloud URL does not. The CLI is pinned to
   **2.111.0** in the image, so this rehearsal exercises the binary the pre-deploy step will run.
4. **Is App Sleeping offered for this project's plan?** If not, 8.2's staging saving is simply absent
   and the cost decision stands on 8.1 alone.
   **Answered 2026-10-15**: yes. `deploy.sleepApplication` was accepted on the staging service (and is
   visible as `"sleepApplication": true` in its config), so 8.2's staging saving applies as written. The
   same check confirmed the region decision — the deployment record carries
   `regions: asia-southeast1-eqsg3a`.
