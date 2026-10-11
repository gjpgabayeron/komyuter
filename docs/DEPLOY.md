# DEPLOY — putting the admin dashboard on a URL

This is the **manual** form of the deploy: milestone **M1** in `docs/ROADMAP.md`. M4 turns the same
steps into a pipeline (merge to `dev` → staging, merge to `main` → production, migration gate, rollback
runbook). The topology and its rationale are decided in `docs/adr/0018-deployment-topology.md`, the
branch, environment and Supabase-project mapping in
`docs/adr/0021-branching-and-environments.md`, and which platform primitives implement it in
`docs/adr/0022-railway-platform-utilization.md`; this file is the procedure.

The shape of the deployment is **one service on one origin**: a single image runs the Fastify API,
which also serves the built admin SPA from the same origin via `@fastify/static`. Nothing about the
SPA is configured at run time, so the same image serves staging and production.

## Environments and branches

Two long-lived environments, and promotion runs one way. The mapping and its reasoning are
`docs/adr/0021-branching-and-environments.md`; this is the operational view.

| Stage     | Ref                         | Environment                                  | Supabase project | Migrations                            |
| --------- | --------------------------- | -------------------------------------------- | ---------------- | ------------------------------------- |
| Work      | `feat/*`, `fix/*`, `docs/*` | none                                         | local stack      | `supabase db reset`                   |
| Integrate | `dev` (PR + CI required)    | —                                            | local stack      | the SQL chain is the source of truth  |
| Stage     | merge into `dev`            | Railway environment **staging**              | staging project  | `supabase db push` **before** deploy  |
| Release   | merge `dev` → `main`        | Railway environment **production**, approval | production       | same files, then deploy the container |

- Merging into `dev` deploys staging; merging into `main` deploys production. Tags (`vX.Y.Z`) **record**
  the release — they do not trigger the deploy.
- **Never `drizzle-kit push`** against any environment: it mutates a database directly and records no
  migration history, which is how the local stack's history once fell three migrations behind its schema.
- Never apply `supabase/seed.sql` to a Cloud environment, and keep `ALLOW_DEV_CREDENTIAL=false` in both.
- `ADMIN_ORIGINS` must equal the environment's own origin **before** the first sign-in: the origin guard
  refuses an un-allowlisted `Origin`, and browsers send one on same-origin POSTs.

## Status

The application side is in place and verified locally (see [Local rehearsal](#local-rehearsal)). The
Railway project `komyuter` exists with both environments — `staging` and `production` — and **nothing in
either one yet**: no service, volume, bucket, shared variable or staged change. What remains is
provisioning: a Supabase Cloud project, a Railway service, and the first Account.

The service can now boot without the owner's credentials (§3.3, ADR-0022 §9). Two items in §3 are still
**not implemented yet** and are marked as such there: the pre-deploy migration step (§3.4) and the
boot-time provenance line (§3.6). M1 owns both. M1's exit criterion is only met once a **second person**
opens the deployed URL and plots a route end to end.

## What the image contains

| Path                    | What it is                                                       |
| ----------------------- | ---------------------------------------------------------------- |
| `server/dist/server.js` | The API, bundled into one file so plain `node` can run it.       |
| `apps/admin/dist`       | The SPA this same process serves; `ADMIN_DIST_DIR` points at it. |
| `server/node_modules`   | The server's **production** dependencies only (~53 MB).          |

The bundle exists for two reasons, both of which make the API unrunnable as emitted by `tsc`:
`moduleResolution: Bundler` emits extensionless relative specifiers that Node's ESM resolver rejects,
and `@komyuter/shared`'s entry is raw TypeScript, which Node cannot load. Bundling resolves both —
which is what lets ADR-0018 §3's "`pnpm build`, then run `node`" hold.

Once §3.4 lands, the runtime image also carries the Supabase CLI and the migrations directory, neither of
which the serving process uses. That is a recorded cost (ADR-0022 §3.2), not an oversight — and it is the
second exception to this project's "add no runtime dependencies" line, after `@fastify/static`.

## Local rehearsal

Do this before touching either cloud service; it needs only Docker.

```bash
docker build -t komyuter:local .
docker run --rm -p 3000:3000 --env-file apps/server/.env komyuter:local
```

Against the local Supabase stack the container needs to reach the host, so override the two URLs.
**The stack must be running** (`supabase start`) — without it every Supabase-touching call, login
included, takes the unified-denial path and looks like a credential bug. Note `ALLOW_DEV_CREDENTIAL=true`
here: locally the admin password _is_ the documented dev credential, so the production setting would
refuse your own sign-in. Seeing that refusal is itself a check — see step 8.

```bash
docker run --rm -p 3131:3000 --add-host host.docker.internal:host-gateway \
  --env-file apps/server/.env \
  -e DATABASE_URL="postgresql://postgres:postgres@host.docker.internal:54322/postgres" \
  -e SUPABASE_URL="http://host.docker.internal:54321" \
  -e ADMIN_ORIGINS="http://localhost:3131" \
  -e ALLOW_DEV_CREDENTIAL=true \
  komyuter:local
```

Then check, in order:

1. `GET /` serves the SPA, and its CSP reads `connect-src 'self' https://tiles.openfreemap.org;` with
   **no** API origin.
2. A deep client route (`/routes/<id>`) returns 200 rather than 404.
3. `GET /api/status` returns the dataset counts — this proves the container reaches **Postgres**.
4. `POST /api/auth/login` with the owner credentials returns 200 and an `access_token`, and that token is
   then accepted by `GET /api/auth/me`, `GET /api/admin/routes` and `GET /api/admin/export/dataset` —
   this proves the container reaches **Supabase Auth** (a different path from step 3: `/api/status` never
   touches it, so a broken auth route can otherwise hide behind a healthy status check).
5. `GET /api/admin/routes` with no token returns 401.
6. An unknown `/api/*` path returns the 404 envelope rather than HTML.
7. A foreign `Origin` is refused with 403.
8. With `ALLOW_DEV_CREDENTIAL=false`, `POST /api/auth/login` using the documented dev credential is
   refused with 401.

Once §3.4 lands, rehearse **it** here too — run the migration command the platform will run, inside the
image, against the local stack:

```bash
docker run --rm --add-host host.docker.internal:host-gateway \
  --entrypoint supabase komyuter:local \
  db push --db-url "postgresql://postgres:postgres@host.docker.internal:54322/postgres"
```

This is what keeps a broken migration out of a pre-deploy step, where its only possible outcome is a
failed deploy. Whether `supabase db push` also wants `supabase/config.toml` beside the migrations
directory is the question this rehearsal answers (ADR-0022, verification gap 3).

## 1. Supabase Cloud project (staging)

**This first project is the staging data plane** (`docs/adr/0021-branching-and-environments.md`);
production gets a second project of its own at M4. Either way the Cloud project is also the auth provider:
because `admin_users.user_id` is a foreign key to `auth.users.id` (ADR-0018 §4), the application tables
cannot live anywhere else without giving up the guarantee that no Account exists without an auth
identity.

1. Create the project, then apply the migrations from a linked CLI:

   ```bash
   supabase link --project-ref <project-ref>
   supabase db push          # applies supabase/migrations/*.sql in order
   ```

2. **Do not apply `supabase/seed.sql`.** It seeds the documented **dev** credential, which no Cloud
   environment may contain — `ALLOW_DEV_CREDENTIAL=false` is the second line of defence, not the first.

3. Migrations are an **explicit step, applied before the new container goes live** — never at container
   boot, so a rolling deploy cannot race a schema change (ADR-0018 §5). M4 encodes this as a pipeline
   gate; manually, it means "push migrations, then deploy". In §3.4 it becomes the platform's
   pre-deploy step.

## 2. Bootstrap the owner Account

No dashboard surface can create the first Account: every admin route is behind the auth guard, which
checks membership of `admin_users`, and login refuses any identity not already in that table. So the
first Account is created out of band, holding the service-role key:

```bash
# From a checkout, with production values exported:
#   DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL, ADMIN_PASSWORD
pnpm --filter server bootstrap:owner
```

It creates the auth identity (with `email_confirm: true` — `signInWithPassword` refuses an unconfirmed
email) and the `admin_users` row, and is idempotent: re-running adopts the existing identity.

> **The owner password must not be the documented dev credential.** The local `apps/server/.env`
> `ADMIN_PASSWORD` is exactly `komyuter-admin-dev`, and `POST /api/auth/login` refuses that
> email/password pair whenever `ALLOW_DEV_CREDENTIAL=false` — regardless of whether the identity is a
> real Account. So seeding production with the dev credential _and_ setting `ALLOW_DEV_CREDENTIAL=false`
> (which step 3 requires) yields an owner who cannot sign in at all, which would break M1's exit
> criterion rather than satisfy it. Choose a different password when bootstrapping the Cloud project.

Run this from a machine that has the repository, **not** inside the service: the script needs `tsx`,
which is a devDependency and deliberately absent from the runtime image, and the service-role key
should not be baked into the image either.

## 3. Railway service

The service is the container this repository builds. Which platform primitive implements each setting,
and why, is `docs/adr/0022-railway-platform-utilization.md`; this is the checklist. Apply it **per
environment** — `staging` and `production` each hold their own service instance, their own variables and
their own branch.

### 3.1 Source and build

| Setting         | Value                                 | Notes                                                             |
| --------------- | ------------------------------------- | ----------------------------------------------------------------- |
| Builder         | `Dockerfile` (`build.builder`)        | Never auto-detection (ADR-0018 §3).                               |
| Dockerfile path | `Dockerfile` (`build.dockerfilePath`) | Repository root.                                                  |
| Branch          | `dev` (staging), `main` (production)  | Per environment, not per service (ADR-0021 §2-3).                 |
| Watch patterns  | see below                             | Without them, every push rebuilds the API.                        |
| Wait for CI     | on (`source.checkSuites`)             | Refuses a **red** pipeline. It does **not** run the server suite. |

`build.watchPatterns` must cover everything the image is built from: `Dockerfile`, `.dockerignore`, the
root manifests (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`, `turbo.json`),
**all five** workspace manifests — `apps/mobile/package.json` included, because the Dockerfile's
dependency layer COPYs it — `apps/server/**`, `apps/admin/**`, `packages/shared/**` and
`packages/ui/**`, plus the migrations directory once §3.4 lands. `apps/mobile` source beyond its
manifest, `navbench`, `docs`, `openwiki` and `.impeccable` stay out: `.dockerignore` keeps them out of
the build context anyway.

### 3.2 Deploy settings

| Setting                     | Value                                | Notes                                                                    |
| --------------------------- | ------------------------------------ | ------------------------------------------------------------------------ |
| Health check                | `/api/status`                        | Exists, needs no auth, and proves the container reaches **Postgres**.    |
| Restart policy              | `ON_FAILURE`, bounded retries        | A crash loop should be reported, not restarted forever.                  |
| Replicas                    | 1                                    | The service is stateless, so this is a config change and not a code one. |
| Region                      | `asia-southeast1-eqsg3a` (Singapore) | Nearest to Iloilo City; the same region in both environments.            |
| App Sleeping (staging only) | on, where the plan offers it         | **Never in production**: M1's exit criterion is someone using the URL.   |
| Approval (production only)  | required per deployment              | ADR-0021 §3, natively. Merging to `main` builds, then waits.             |

### 3.3 Variables

| Variable                    | Value                                                                          |
| --------------------------- | ------------------------------------------------------------------------------ |
| `DATABASE_URL`              | Supabase Cloud connection string (Postgres/PostGIS).                           |
| `SUPABASE_URL`              | The project URL.                                                               |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key (backend-proxied auth, ADR-0006).                             |
| `ADMIN_ORIGINS`             | The service's **own** origin — defence in depth, not a cross-origin necessity. |
| `ALLOW_DEV_CREDENTIAL`      | `false`. The documented dev credential must be refused.                        |
| `MAPBOX_SECRET_TOKEN`       | Server-side snapping/geocoding token (ADR-0016).                               |

`PORT` and `ADMIN_DIST_DIR` are set by the image; `ADMIN_DIST_DIR` in particular has no useful fallback
in a runtime image, because the walk-up that finds `apps/admin/dist` in a checkout finds no workspace
there. Unset, the server still starts and still answers `/api/*` — every page just 404s.

**`ADMIN_EMAIL` and `ADMIN_PASSWORD` are deliberately absent** (ADR-0022 §9, implemented). Nothing in the
running server reads them: login refuses a hardcoded dev credential, and the script in §2 reads the
owner's through `loadAdminCredentials()`, which requires them of _its_ caller. Setting them on the
service would put the owner's real password into the serving container for no runtime reason, so they
stay in the operator's shell at the moment §2 runs. The pair remains in `apps/server/.env.example` as the
documented local mirror of `supabase/seed.sql`.

### 3.4 Migrations before the live container

ADR-0018 §5 wants migrations applied as an explicit step **before** the new container goes live and never
at container boot. Railway's `deploy.preDeployCommand` is that step: it runs in a distinct lifecycle
phase, it is not boot, and a failure fails the deployment instead of shipping a new container against an
old schema (ADR-0022 §3).

**Not implemented yet.** It needs the runtime image to carry the Supabase CLI and the migrations
directory (ADR-0022 §3.2), which M1 owns. Until then, and for every deploy until then, push migrations by
hand **before** triggering the deploy:

```bash
supabase db push --db-url "<this environment's DATABASE_URL>"
```

Rehearse the eventual in-image invocation first — see [Local rehearsal](#local-rehearsal). Discovering
what `supabase db push` needs from a failed pre-deploy step is the expensive way to find out.

### 3.5 Cost and notification

- Set a workspace **soft** limit (email alert) and **hard** limit (spend cap) before the first deploy.
  Two environments and two Supabase Cloud projects is the intended cost shape, and it should not be
  discovered on an invoice (ADR-0022 §8.1).
- Add a **project webhook** on deployment failure. Webhooks are project-scoped, so one covers both
  environments; test the endpoint before creating it, because repeated failures pause a webhook for 24
  hours (ADR-0022 §7.2).

### 3.6 Provenance

The container already receives `RAILWAY_GIT_COMMIT_SHA`, `RAILWAY_GIT_BRANCH`,
`RAILWAY_ENVIRONMENT_NAME` and `RAILWAY_DEPLOYMENT_ID` at runtime. Log them **once at boot** (ADR-0022
§7.3) so "which commit is on staging?" is answerable from `railway logs`. **Not implemented yet** — M1
owns it.

Do not expose the same values through `GET /api/status`: it is unauthenticated, and publishing the
deployed revision to anonymous callers buys convenience the logs already provide.

### 3.7 The same settings from the CLI

Nothing is provisioned yet, so this is the shape rather than a transcript — resolve the real service ID
per environment first (`railway service list --json`), then apply with explicit IDs rather than relying
on a linked directory.

```bash
railway link --project komyuter

railway environment edit --project <project-id> --environment staging --service-config <service> \
  build.builder DOCKERFILE
railway environment edit --project <project-id> --environment staging --service-config <service> \
  source.branch dev
railway environment edit --project <project-id> --environment staging --service-config <service> \
  build.watchPatterns '["apps/server/**","apps/admin/**","packages/**","package.json","pnpm-lock.yaml","turbo.json","Dockerfile",".dockerignore"]'
railway environment edit --project <project-id> --environment staging --service-config <service> \
  deploy.healthcheckPath /api/status
railway environment edit --project <project-id> --environment staging --service-config <service> \
  deploy.multiRegionConfig '{"asia-southeast1-eqsg3a":{"numReplicas":1}}'
```

Repeat with `--environment production` and `source.branch main`, plus the approval requirement and the
`deploy.preDeployCommand` from §3.4 once it exists. Railway's daemon scripts are ordinary
`pnpm --filter` scripts, so a normal `RAILWAY_TOKEN` can run this from CI later.

## 4. Exit criterion (M1 is closed by this, not by the merge)

A second person opens the deployed URL, signs in as the owner Account, and plots a route end to end; the
shipped CSP contains no API origin; a foreign `Origin` is refused; and the documented dev credential is
refused.

## Deliberately not here

- **Rollback** and **IaC adoption** are M4's, along with the pipeline form of merge→staging.
  `docs/adr/0022-railway-platform-utilization.md` §2 decides _when_ configuration moves into source, and
  refuses `railway.json`/`railway.toml` outright — the format cannot be adopted by a new service and
  stops being read on 2026-12-01.
- **CDN caching.** One origin serves the SPA and `/api/*`, so edge caching would cache API responses.
  This is the one platform feature that is actively unsafe in this topology (ADR-0022, non-goals).
- **Buckets, volumes, WAF Under Attack Mode, static outbound IP and shared variables** are each refused,
  with reasons, in ADR-0022's non-goals.
- **PR preview environments** are out of scope: an ephemeral environment per pull request needs a
  per-PR database, which is not justified at this scale.
- **Server tests in CI.** CI runs format, lint, typecheck, the admin suite and build — the server's
  integration suite stays a local pre-merge obligation, so a server-side regression can still merge
  green. `docs/ROADMAP.md` records this as a known risk rather than a covered one. The platform's "wait
  for CI" setting (§3.1) refuses a red pipeline but does not change this.
