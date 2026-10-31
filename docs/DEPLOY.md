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
staging data plane exists and is healthy: Supabase Cloud project `prmccdmsqtywprmfaluf` in
**`ap-southeast-1` (Singapore)**, Postgres 17.11 — the region §3.2 pins Railway to, so the service and its
database share one (ADR-0022 §6.1). An earlier project had been created in `ap-northeast-2` (Seoul) and was
replaced before any migration was applied to it, so nothing was lost and the topology now matches the
decision rather than contradicting it. The staging **service** is live as well: the Railway project
`komyuter` holds both environments, `staging` runs one service — the container built from this repository,
with the domain, variables and health check §3.2–§3.3 describe — and `production` is still empty, because it
belongs to M4. The migration chain is applied **through `0006`** on staging, and `0006` is in effect: the
publishable key that read `admin_users` and `routes` is refused (`401`) now. §1's auth policy is set for
everything the plan allows, and this branch is pushed and awaiting merge — so M1 is down to its exit
criterion.

The service boots without the owner's credentials (§3.3, ADR-0022 §9), and the boot-time provenance line
(§3.6) is implemented and live. The pre-deploy migration step is **not** in place on the platform: §3.4
records that the command this project documented cannot run there, so it is deliberately left empty for M1
and handed to M4. M1's exit criterion is **met**: a second person signed in as the owner Account and plotted
a route end to end, and the staging dataset holds the result — 1 route, 2 directions, 22 stops, none of
which this project's own checks created.

## What the image contains

| Path                    | What it is                                                               |
| ----------------------- | ------------------------------------------------------------------------ |
| `server/dist/server.js` | The API, bundled into one file so plain `node` can run it.               |
| `apps/admin/dist`       | The SPA this same process serves; `ADMIN_DIST_DIR` points at it.         |
| `server/node_modules`   | The server's **production** dependencies only (~53 MB).                  |
| `supabase` (CLI)        | v2.111.0 on `PATH` — used only by the pre-deploy step, never by serving. |
| `supabase/migrations`   | The chain that step applies; `seed.sql` is deliberately **absent**.      |

The bundle exists for two reasons, both of which make the API unrunnable as emitted by `tsc`:
`moduleResolution: Bundler` emits extensionless relative specifiers that Node's ESM resolver rejects,
and `@komyuter/shared`'s entry is raw TypeScript, which Node cannot load. Bundling resolves both —
which is what lets ADR-0018 §3's "`pnpm build`, then run `node`" hold.

The CLI and the migrations directory are the only things in this image the serving process never touches.
That is a recorded cost (ADR-0022 §3.2), not an oversight, and it is the second exception to this
project's "add no runtime dependencies" line, after `@fastify/static`. It is not a small one: the CLI's
installed tree is ~209 MB, and the image measures **697 MB** against **399 MB** without it — priced
against a milestone whose whole purpose is proving a deploy works, and revisited only if image size
becomes a real constraint (ADR-0022's alternatives record the migration that would follow).

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

9. **Exercise the write path**, which checks 1–8 do not: they are all reads, and a service that can read can
   still be unable to write. Sign in as the owner, then create a route, a direction carrying a `LineString`
   polyline, and two ordered stops with `Point` geometry; read them back to confirm the geometry survived the
   PostGIS round trip; delete the **route** — a hard delete that takes its directions and stops with it —
   and confirm `/api/status` returns to its previous counts. The payload shapes are the ones
   `apps/server/tests/integration/crud.test.ts` already uses. Three things bite here: creating one direction
   also creates its auto-derived return direction (ADR-0011), and that direction carries its own stop rows,
   so the counts move by two directions and four stops; deleting a stop on its own returns **409** while it is
   a direction terminal, which is why the route goes first; and a fare config's `DELETE` is a _soft_ delete
   (`is_active = false`), so if you add one to exercise that foreign key, `stats.fare_configs` stays one
   higher for good. Run this after any migration that changes grants or RLS: it is the only check that proves
   `postgres` still reads _and writes_ its own data under `0006`'s deny-all policies.

Rehearse the migration step here too — run the command the platform will run, inside the image, against
the local stack:

```bash
docker run --rm --add-host host.docker.internal:host-gateway \
  --entrypoint supabase komyuter:local \
  db push --dry-run \
  --db-url "postgresql://postgres:postgres@host.docker.internal:54322/postgres?sslmode=disable"
```

This is what keeps a broken migration out of a pre-deploy step, where its only possible outcome is a
failed deploy. `--dry-run` is deliberate here: it proves the invocation — the CLI is on `PATH`, it finds
`/app/supabase/migrations` from the image's working directory, no `supabase/config.toml` is needed, and it
can read the target's history — without writing to the stack you develop against. Expect
`Remote database is up to date.` against a stack whose migrations are all applied;
`supabase migration list --db-url "<url>"` shows why, listing local and remote side by side.

**Do not drop `?sslmode=disable` for a local URL.** The CLI requires TLS by default and the local stack
serves plaintext, so without it this fails as
`tls error (The server does not support SSL connections)` — a rehearsal failure that looks like a broken
image rather than a URL that needs one parameter. A Supabase Cloud URL has TLS and needs no such
parameter.

## 1. Supabase Cloud project (staging)

**This first project is the staging data plane** (`docs/adr/0021-branching-and-environments.md`) — created
as `prmccdmsqtywprmfaluf` in **`ap-southeast-1` (Singapore)**, the same region §3.2 pins Railway to, so the
service and its database stay together (ADR-0022 §6.1); production gets a second project of its own at M4.
Either way the Cloud project is also the auth provider:
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

4. **Set the project's auth policy in the dashboard — `supabase/config.toml` cannot do it.** That file
   configures the _local_ stack only; none of it reaches a Cloud project, so every one of these is a
   manual step that no test will catch:

   | Setting                    | Value        | Why                                                                                                                   |
   | -------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------- |
   | Minimum password length    | 12           | Matches the floor `loadAdminCredentials` enforces for the owner Account (§3.3); the local stack's 8 is a convenience. |
   | Confirm email              | on           | `signInWithPassword` refuses an unconfirmed identity, so an unconfirmed owner cannot sign in at all.                  |
   | Allow new users to sign up | off          | No self-service signup exists: an Account exists because an admin created it (ADR-0019, invite-only).                 |
   | Leaked-password protection | **deferred** | Needs a Pro plan, which this project is not on: out of scope for M1 rather than pending. Revisit if the plan changes. |

**The dashboard is the only writer, but all four settings can still be checked from outside**, which
matters because "no test will catch them" is true of the test suite and not of the platform:

- **Email confirmation and signups** come from the public view:
  `curl -s "$SUPABASE_URL/auth/v1/settings" -H "apikey: $ANON_KEY"` returns `mailer_autoconfirm` and
  `disable_signup`.
- **Minimum password length and leaked-password protection** have to be probed behaviourally: ask GoTrue to
  create a user with a password the setting is meant to forbid, through the **admin** API
  (`POST /auth/v1/admin/users` with `email_confirm: true`) so no mail is sent. A rejection names the
  configured minimum — `Password should be at least N characters.` — and flags a breach as
  `reasons: ["pwned"]`; an accepted password means the setting is off, and the account it creates has to be
  deleted again. Prefer the admin path over `/auth/v1/signup`, which sends a confirmation email and is
  capped by the project's own email rate limit (`429 over_email_send_rate_limit`) — which is how a first
  attempt here failed.

There is no API route to **set** these: GoTrue exposes no settings endpoint on the hosted platform, and both
`GET` and `PUT` on `/auth/v1/admin/settings` return `404`. Measured on the staging project (2026-10-15):
`mailer_autoconfirm: false` (email confirmation on ✓), `disable_signup: false` (signups permitted ✗),
minimum length **6** per GoTrue's own error text ✗, and leaked-password protection **off** — a breached
13-character password was accepted ✗.

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
email) and the `admin_users` row, and is idempotent: re-running adopts the existing identity. As of
migration `0007`, that row also carries `role_id = 'administrator'` and `is_super_admin = true`: the
ownership property, not a Role (ADR-0019).

### 2.1 Promote the owner on an environment that predates M2a

Migration `0007` backfills every existing `admin_users` row to the seeded Administrator Role, but it
does not guess which Account is the owner — `admin_users` had no timestamp to order by, and an email in
SQL would be wrong for every environment but one. Mark the owner explicitly, once per environment:

```bash
# OWNER_EMAIL, plus DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
OWNER_EMAIL=owner@example.com pnpm --filter server promote:owner
```

The script refuses to invent an Account (run `bootstrap:owner` first on a fresh environment), allows
promotion only from `false` to `true`, and reports success without changing anything on a second run.
A partial unique index makes a second owner impossible; a trigger refuses any later demotion, deletion
or Role change on the owner row. Staging needs this step once, after `0007` is applied and before Role
management is used.

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
dependency layer COPYs it — `apps/server/**`, `apps/admin/**`, `packages/shared/**`,
`packages/ui/**`, and **`supabase/migrations/**`**, which §3.4 copies into the image and the pre-deploy
step applies: a migration that lands without a rebuild would be applied by the previous image's copy of
the chain. `apps/mobile` source beyond its manifest, `navbench`, `docs` and `.impeccable` stay
out: `.dockerignore` keeps them out of the build context anyway.

### 3.2 Deploy settings

| Setting                     | Value                                | Notes                                                                    |
| --------------------------- | ------------------------------------ | ------------------------------------------------------------------------ |
| Health check                | `/api/status`                        | Exists, needs no auth, and proves the container reaches **Postgres**.    |
| Restart policy              | `ON_FAILURE`, bounded retries        | A crash loop should be reported, not restarted forever.                  |
| Replicas                    | 1                                    | The service is stateless, so this is a config change and not a code one. |
| Region                      | `asia-southeast1-eqsg3a` (Singapore) | Nearest to Iloilo City; the same region in both environments.            |
| App Sleeping (staging only) | on, where the plan offers it         | **Never in production**: M1's exit criterion is someone using the URL.   |
| Approval (production only)  | required per deployment              | ADR-0021 §3, natively. Merging to `main` builds, then waits.             |

**The service domain's target port must be the platform's `PORT`, not the image's default.** Railway
injects `PORT` (observed: 8080) and the app honours it — `envSchema` reads `process.env.PORT` — so the
container binds 8080 even though the `Dockerfile` sets `ENV PORT=3000`. A domain created with
`targetPort: 3000` routes to a port nothing is listening on. The health check is unaffected either way,
because Railway probes the port it injected; only the public URL breaks, and it breaks _after_ the deploy
has started looking healthy.

### 3.3 Variables

| Variable                    | Value                                                                          |
| --------------------------- | ------------------------------------------------------------------------------ |
| `DATABASE_URL`              | Supabase Cloud connection string (Postgres/PostGIS).                           |
| `SUPABASE_URL`              | The project URL.                                                               |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key (backend-proxied auth, ADR-0006).                             |
| `ADMIN_ORIGINS`             | The service's **own** origin — defence in depth, not a cross-origin necessity. |
| `ALLOW_DEV_CREDENTIAL`      | `false`. The documented dev credential must be refused.                        |
| `MAPBOX_SECRET_TOKEN`       | Server-side snapping/geocoding token (ADR-0016).                               |

`ADMIN_DIST_DIR` is set by the image and has no useful fallback in a runtime image, because the walk-up
that finds `apps/admin/dist` in a checkout finds no workspace there. Unset, the server still starts and
still answers `/api/*` — every page just 404s.

Two further variables are set on the service, and both are easy to mistake for noise:

- **`PORT=8080`** pins the container port so it cannot drift from the domain's target port. The image's
  `ENV PORT=3000` is only a default for plain `docker run`; Railway injects its own `PORT`, and the app
  honours it, so pinning the value keeps the container port and the domain in step deliberately rather
  than by coincidence.
- **`NODE_ENV=production`** makes the production-only HSTS gate in `securityHeaders` explicit, instead of
  depending on the image's `ENV` surviving untouched.

**`DATABASE_URL` must be one the container can actually reach, and Supabase's direct host is IPv6-only.**
For a project created now, `db.<ref>.supabase.co` resolves to an `AAAA` record and **no** `A` record:

```bash
nslookup -type=A    db.<ref>.supabase.co   # NOERROR, no address
nslookup -type=AAAA db.<ref>.supabase.co   # NOERROR, 2406:da18:…
```

The direct connection therefore works only where the container has outbound IPv6. Either enable IPv6 egress
on the service (`deploy.ipv6EgressEnabled`) or point `DATABASE_URL` at the **Session pooler**
(`aws-0-<region>.pooler.supabase.com`, port 5432, username `postgres.<ref>`), which is IPv4 and is
Supabase's documented answer for IPv4-only environments. Getting this wrong produces no readable connection
error: `/api/status` returns 500, the deploy logs show only drizzle's `Failed query: …` wrapper (the app
logs that without `error.cause`, so the errno never appears), and the service's **network-flow** logs show
no egress to port 5432 at all. That absence is also how credentials are excluded — a wrong password
completes the TCP handshake first and fails at authentication, which would leave an egress flow behind.

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

**Deferred to M4, with the mechanism now characterised.** The image side is in place: the runtime carries
the Supabase CLI (`supabase` on `PATH`, pinned by `ARG SUPABASE_CLI_VERSION`) and the chain at
`/app/supabase/migrations`, which is where the CLI looks by default from the image's working directory, so
no `--workdir` is needed (ADR-0022 verification gap 3, answered).

What does **not** work is the command this section previously documented. Each row below was measured
against the platform rather than assumed:

| Attempt                                           | Result                                                                                                                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `… --db-url "$DATABASE_URL"` as one array element | **Fails.** The array is word-split into argv with **no shell**, so the CLI receives the literal `$DATABASE_URL`: `failed to parse connection string: $DATABASE_URL` |
| `["sh", "-c", "…"]`                               | **Rejected** by the platform: `Invalid preDeployCommand`                                                                                                            |
| `… --db-url ${{DATABASE_URL}}`                    | Accepted by validation; substitution unconfirmed                                                                                                                    |
| `SUPABASE_DB_URL` instead of `--db-url`           | **Dead end** — the CLI ignores it (`Cannot find project ref. Have you run supabase link?`)                                                                          |

So `deploy.preDeployCommand` is left **empty** for M1 and the chain is applied by hand, which is what §1
already does. M4 owns this step in any case, and it should choose between confirming that
`${{DATABASE_URL}}` is substituted by making one deployment and wrapping the command in a script shipped
in the image (`sh /app/deploy/pre-deploy.sh`), whose shell semantics do not depend on platform
interpolation. Leaving the step empty keeps the service deployable rather than failing every deployment at
a step that cannot yet work.

Two properties of the eventual step are settled, and are worth carrying forward:

- **It needs no `supabase/config.toml`.** With only the migrations directory copied, `db push` finds the
  chain and compares it against the target's history.
- **The connection should not be the transaction pooler.** This step holds an advisory lock and runs
  multi-statement DDL, neither of which survives transaction-mode pooling.

A failed pre-deploy does not take the site down — the previous healthy deployment keeps serving — which is
why four failed deployments during this provisioning left the URL answering throughout.

Applying the chain by hand is therefore the M1 procedure, and the documents say so rather than implying
the platform does it:

```bash
supabase db push --db-url "<this environment's DATABASE_URL>"
```

A _local_ URL needs `?sslmode=disable` while a Cloud URL needs TLS; see
[Local rehearsal](#local-rehearsal).

### 3.5 Cost and notification

- Set a workspace **soft** limit (email alert) and **hard** limit (spend cap) before the first deploy.
  Two environments and two Supabase Cloud projects is the intended cost shape, and it should not be
  discovered on an invoice (ADR-0022 §8.1).
- Add a **project webhook** on deployment failure. Webhooks are project-scoped, so one covers both
  environments; test the endpoint before creating it, because repeated failures pause a webhook for 24
  hours (ADR-0022 §7.2).

### 3.6 Provenance

The container already receives `RAILWAY_GIT_COMMIT_SHA`, `RAILWAY_GIT_BRANCH`,
`RAILWAY_ENVIRONMENT_NAME` and `RAILWAY_DEPLOYMENT_ID` at runtime. **Implemented**: `deploymentProvenance`
(`apps/server/src/config/provenance.ts`) reads them, and `src/index.ts` logs them **once at boot, before
`listen`**, so "which commit is on staging?" is answerable from `railway logs`:

```text
{"level":30,"time":1791991087656,"pid":1,"hostname":"5e347303a065","commitSha":"7739640…","branch":"dev","environment":"staging","deploymentId":"…","msg":"deployment provenance"}
```

Before `listen` is the load-bearing part: the deploy whose revision matters most is the one that never
becomes healthy, so the line has to precede the failure rather than follow it. Off the platform — local
dev, tests, CI — none of the four variables is set and nothing is logged, so a local start does not carry
an empty record.

Do not expose the same values through `GET /api/status`: it is unauthenticated, and publishing the
deployed revision to anonymous callers buys convenience the logs already provide.

### 3.7 The same settings from the CLI

Staging was provisioned through the dashboard and the platform API, so this is the shape for the next
environment — or for reproducing staging — rather than a transcript of what was run. Resolve the real
service ID per environment first (`railway service list --json`), then apply with explicit IDs rather than
relying on a linked directory.

**Two cautions, both measured, and neither is hypothetical.** This CLI's `railway environment edit` accepted
the flags below and changed nothing in this project — a control case on a field that certainly exists behaved
identically, with and without `railway link` — so go through the dashboard for anything the API tools do not
expose and verify each field afterwards with `describe-service`. And `source.checkSuites` ("Wait for CI") is
not among the flags below because nothing reachable here can set it: neither MCP tool exposes it, and the
CLI's edit is a no-op, so §3.1's requirement is a dashboard setting. `deploy.preDeployCommand` is likewise
absent, deliberately — §3.4 records why it stays empty.

```bash
railway link --project komyuter

railway environment edit --project <project-id> --environment staging --service-config <service> \
  build.builder DOCKERFILE
railway environment edit --project <project-id> --environment staging --service-config <service> \
  source.branch dev
railway environment edit --project <project-id> --environment staging --service-config <service> \
  build.dockerfilePath Dockerfile
railway environment edit --project <project-id> --environment staging --service-config <service> \
  build.watchPatterns '["Dockerfile",".dockerignore","package.json","pnpm-lock.yaml","pnpm-workspace.yaml",".npmrc","turbo.json","apps/mobile/package.json","apps/server/**","apps/admin/**","packages/shared/**","packages/ui/**","supabase/migrations/**"]'
railway environment edit --project <project-id> --environment staging --service-config <service> \
  deploy.healthcheckPath /api/status
railway environment edit --project <project-id> --environment staging --service-config <service> \
  deploy.multiRegionConfig '{"asia-southeast1-eqsg3a":{"numReplicas":1}}'
railway environment edit --project <project-id> --environment staging --service-config <service> \
  deploy.sleepApplication true
```

Repeat with `--environment production` and `source.branch main`, plus the approval requirement. Railway's
daemon scripts are ordinary `pnpm --filter` scripts, so a normal `RAILWAY_TOKEN` can run this from CI later.

### 3.8 Confirm the login throttle sees real clients

The login throttle keys on `request.ip` (`apps/server/src/api/throttle.ts`), and that value is only the
real client because the app is built with a `trustProxy` that trusts the socket peer — a function, not
the hop count `1` (`apps/server/src/api/app.ts`), because fastify 5.12 fails closed on a numeric hop
count — which assumes exactly **one** proxy hop in front of the container. Confirm it once per
environment. It is silent when wrong, and the symptom is worse than the bug: a shared source key means
five failed sign-ins from anyone lock out sign-in for everyone for the full 15-minute block.

From one network, burn the per-source limit with a nonexistent account:

```bash
for i in 1 2 3 4 5; do
  curl -s -o /dev/null -w '%{http_code}\n' -X POST "https://<origin>/api/auth/login" \
    -H 'Content-Type: application/json' -H "Origin: https://<origin>" \
    -d '{"email":"nobody@example.com","password":"wrong"}'
done
```

Then, from a **different** network, sign in with the real owner credentials. It must return `200`. A
`401` means both clients shared one source key — the throttle is still keyed on the proxy — so fix the
hop count before the URL is handed to anyone.

Status codes cannot distinguish the two denial reasons by design (every denial is the same 401 body), so
this check deliberately uses a **successful** sign-in as its signal rather than the shape of a failure.

**Run against staging on 2026-10-16, which found two gaps in the check above.** What it confirmed: the
throttle does see real clients — a client-forged `X-Forwarded-For` was ignored (`source` in the deploy logs
stayed the caller's real address) — and it is not the shared-key global lockout this section warns about: one
account's five failures were denied as `security.sign_in_throttled` while a different account on the same
address got an ordinary failure.

- **A `200` on its own proves nothing.** It is also what you see when the per-source limit never engaged. The
  disambiguating artefact is the event name, which appears only in the deploy logs: confirm
  `railway logs -d --lines 500 | grep security` shows `security.sign_in_throttled` for the burned account
  before reading a `200` as isolation.
- **A client's address is not necessarily a stable identity.** One client here presented six addresses in a
  single session (an ISP rotating within `152.233.15.0/24` and `152.233.68.0/24`), so five failures spread
  across keys and the per-source limit never fired; the per-account key is what held. Mobile, CGNAT and
  rotating-address clients therefore escape the per-source dimension largely intact, while a targeted account
  is still limited to five attempts per window. Whether to key on a prefix, lengthen the window, or move the
  state to a shared store is ADR-0005's decision, not this document's.

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
