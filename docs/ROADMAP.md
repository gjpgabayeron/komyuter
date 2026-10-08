# ROADMAP — Komyuter admin dashboard milestones

This file is the **milestone authority** for the admin dashboard: the order of work, what each
milestone delivers, and the condition that closes it.

`docs/ADMIN.md` §6 keeps the admin-surface roadmap items (`R1`–`R8`) with the FR/SC references that
nothing else duplicates. This file groups those items into milestones and owns the **sequence and the
exit criteria**. Where the two disagree about _order_, this file wins; where they disagree about _what
an item means_, `ADMIN.md` wins.

## How to read this

A milestone is **not** closed because its code merged. It is closed when its exit criterion is
demonstrably true, and each milestone is given exactly one criterion that can be observed by someone
other than the author. Where a milestone delivers a decision, the decision is recorded in `docs/adr/`
before its code; ADRs are referenced from the milestone that implements them.

Milestone ids (`M1`, `M2a`, …) are stable — reference them in commit messages and specs rather than
restating the milestone name.

## Milestone overview

| ID       | Milestone                          | Delivers                                                                | Depends on |
| -------- | ---------------------------------- | ----------------------------------------------------------------------- | ---------- |
| **M1**   | Staging environment (thin deploy)  | One Railway service live on Supabase Cloud, owner Account bootstrapped  | —          |
| **M2a**  | Authorization core                 | Roles, Permissions, Super Admin, grant-subset guard                     | M1         |
| **M2b**  | User-management surfaces           | Account lifecycle, attribution, session revocation, read-only workspace | M2a        |
| **M2c**  | Collaboration safety               | Version stamp, per-user drafts, three-way merge with a resolver         | M1         |
| **M3**   | v1 — complete route modeling       | `R2` triggers, `R3` no-stop segments, `R5` shared fare rule             | M2a        |
| **M4**   | Reliable CI and CD                 | Merge → staging, tag → production, migration gate, rollback runbook     | M3         |
| **M5**   | v1.1 — plotting power and polish   | `R4`, `R6`, `R7`, `R8`, `FR-004`, power-editor features                 | M4         |
| **M6**   | Sandbox playground                 | Algorithms in `@komyuter/shared` behind a real navigation endpoint      | M5         |
| _mobile_ | Commuter app (outside this record) | —                                                                       | M6         |

## Dependencies

The sequence is not a preference — four edges are hard, and the rest are tracking order.

- **Everything depends on M1.** There is no environment to plot into and no Account to plot as until the
  app is reachable. This is why the deploy is deliberately thin and deliberately first.
- **M2a is what unblocks groupmate plotting.** Distinct Directions do not collide, so once Roles and
  Accounts exist, several people can plot different routes at the same time. M2a — not M2b, not M2c —
  is the milestone that turns "the dataset can grow" from an intention into a fact.
- **M2c must land before several plotters share one Direction.** Until there is a version stamp, the
  save path is a blind overwrite whose copy claims a concurrency check the server does not perform, so
  shared-direction plotting before M2c is silent data loss. It does **not** block distinct-route
  plotting.
- **M2b depends on M2a** and hardens what M2a exposes: attribution and read-only degradation are
  honesty and accountability, not dataset growth. They gate neither M3 nor the plotters.
- **M3 depends on M2a** for Accounts only; the route-modeling work itself is independent of M2b and
  M2c.
- **M4 depends on M3** because the migration gate needs a schema change to gate, and `R2` is the first
  one to arrive after M1.
- **M5 and M6 depend on M4** in that their releases are expected to travel the pipeline rather than be
  deployed by hand.
- **The mobile app depends on M6** for its algorithm contract: the navigation endpoint built there is
  the one the commuter app will call.

M2a, M2b and M2c are **tracking splits, not gates**. If working in a different order turns out to be
easier — for example landing the version stamp before the Account lifecycle — that is allowed, provided
the M2c-before-shared-direction-plotters edge above still holds.

## M1 — Staging environment (thin deploy)

**Goal.** Get the admin dashboard onto a real URL before any feature work, to prove hosting, database,
auth and configuration end to end — and to unblock everything after it.

**Deliverables.**

- ADR-0018 implemented: a single Railway service running the Fastify API, which also serves the built
  admin SPA from the same origin via `@fastify/static`.
- `apps/server`: a real `start` script, and an SPA history fallback that **excludes `/api/*`** so
  `NotFound.tsx` and the API's own 404s do not compete for the same handler.
- `apps/admin/.env.production` committed with an intentionally empty `VITE_API_URL` — production is
  same-origin, and this stops a machine-local `apps/admin/.env` from baking `localhost:3000` into a
  release build.
- A Supabase Cloud project as the production data plane: `supabase/migrations/*.sql` applied to it.
  `supabase/seed.sql` is **not** applied — the documented dev credential must not exist in production.
- A one-off owner-bootstrap script (service-role key) that creates the first **Account** and its auth
  identity, since no dashboard surface can exist before the first Account.
- Railway service variables: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_ORIGINS`, `ALLOW_DEV_CREDENTIAL=false`,
  `MAPBOX_SECRET_TOKEN`.

**Exit criterion.** A second person opens the deployed URL, signs in as the owner Account, and plots a
route end to end; the shipped CSP contains no API origin; a foreign `Origin` is refused, and the
documented dev credential is refused.

## M2a — Authorization core

**Goal.** Replace the binary "is this user present in `admin_users`?" rule with Roles and Permissions,
without changing what any current Account is able to do.

**Deliverables.**

- ADR-0019 implemented: permission constants declared once in `@komyuter/shared` (explicit `1 << n`,
  never positional) plus the capability module derived from them.
- A `roles` table (name, position, permission set) and `admin_users.role_id`.
- **Super Admin** as an immutable ownership property — the single owner Account.
- The existing single authorization seam (`isAdminUserId` in `apps/server/src/api/auth.ts`) extended to
  check capabilities server-side; `GET /api/admin/me` returns the effective set.
- The **grant-subset** guard: you may not create or edit a Role carrying a Permission you do not hold,
  and you may not modify or assign a Role at or above your position.
- Invite-only provisioning.

**Exit criterion.** An Account whose Role lacks a capability is refused (403) by the corresponding
endpoint and served (200) by one it holds; creating a Role with a subset of the creator's Permissions
succeeds while granting a Permission the creator lacks is rejected; the Super Admin cannot be demoted,
deactivated or deleted by any caller, including itself.

## M2b — User-management surfaces

**Goal.** Make the access model usable and honest: the surfaces that manage Accounts, and a UI that
never offers an action the Account cannot perform.

**Deliverables.**

- Create an Account (email plus temporary password) with a Role; change a Role; deactivate and
  reactivate; force a password reset.
- Session revocation on deactivation and on Role change.
- The last-owner lockout guard.
- `created_by` / `updated_by` attribution on every entity.
- Full read-only workspace degradation: map, selection and pan keep working, while add stop, snap,
  rewire, detour and restriction editing, delete and save are **absent**, and the action bar reduces to
  read-only status.

**Exit criterion.** A write-less Account can open the workspace and every mutating affordance is absent
rather than merely failing; deactivating an Account revokes its live session on the next request; a Role
change takes effect without a new sign-in; every route, direction, stop, detour and restriction records
who created and last updated it.

## M2c — Collaboration safety

**Goal.** Let more than one person plot the same dataset without silently destroying each other's work.

**Deliverables.**

- ADR-0020 implemented: a version stamp on the route and direction save path, and a 409 when the base
  is stale — making the existing conflict copy true rather than aspirational.
- Per-user draft slots, replacing the single-slot `localStorage` draft.
- A client-side three-way merge (base = the draft's loaded snapshot, mine = the draft, theirs = the
  server's current state) with a resolver UI.
- The stop list and metadata merged semantically (union; order conflicts resolved by the plotter).
- The polyline **never merged** — take one side, then re-snap.

**Exit criterion.** Two sessions based on the same version converge through the resolver with no stop,
name or instruction lost, and the resulting geometry is one of the two snapped polylines; two plotters
on different routes keep their own drafts across a reload.

## M3 — v1: complete route modeling

**Goal.** Finish the route model so the dataset can be plotted completely, then cut the first release.

**Deliverables.**

- `R2` — detour conditional triggers: `active_timeframes` and `condition` in the shared types and
  schemas, in `api/detours.ts`, plus request-time active-detour resolution (ADR-0012).
- `R3` — no-stop loading and unloading segments over `R1`'s editor: a polyline index range marked
  `Restriction.affects = both` with `reason = no_stopping_zone`.
- `R5` — extract the LTFRB fare rule into `@komyuter/shared` as `fareCalculator`, and rewire the admin
  fare validators and the mobile app onto it.
- The `v1.0.0` release itself.

**Exit criterion.** Every entity in the domain model — routes, directions, stops, detours, detour stops,
restrictions, fare configs — can be created, edited and removed from the admin UI; `R2`'s schema change
is applied to production through the M1 migration path; tag `v1.0.0` exists and is deployed.

## M4 — Reliable CI and CD

**Goal.** Make deploying routine rather than manual, with schema changes gated.

**Deliverables.**

- Merge to `main` deploys staging.
- A version tag deploys production behind a manual approval gate.
- Supabase migrations applied as an **explicit deploy step** before the new container goes live, never
  at container boot.
- A written rollback runbook, exercised at least once.

**Exit criterion.** A version tag produces a production deploy through the pipeline with no manual shell
work, including the migration step; a deliberately broken migration is rolled back using the runbook.

## M5 — v1.1: plotting power and polish

**Goal.** Close the documented planned items and add the editor power that makes bulk plotting fast for
several people.

**Deliverables.**

- `R4` — Mapbox geocoding proxy replacing client-side Nominatim.
- `R6` — overview / network page: a read-only map of all routes plus stats.
- `R7` — export UI wired to `GET /api/admin/export/dataset`.
- `FR-004` — fare type on route rows.
- `R8` — dataset import replacing the disabled placeholder; this is also the seed-data import path.
- Power-editor features: bulk import from GPX or JSON, vertex-level polyline editing, direction
  duplication with offset geometry, and batch stop operations.

**Exit criterion.** A second person exports a dataset from staging, imports it into a fresh environment,
and gets the same routes; a direction can be plotted from a GPX trace without hand-placing every stop;
the release reaches production through the M4 pipeline.

## M6 — Sandbox playground

**Goal.** Test the main algorithms from the admin UI before mobile development commits to them.

**Deliverables.**

- The canonical algorithms (routing, fare, detour) implemented in `@komyuter/shared` and exposed
  through a real navigation endpoint in `apps/server` — the ADR-0017 seam, so the contract tested here
  is the one the mobile app will call.
- A playground surface in the admin app that runs a chosen route or origin–destination pair through the
  algorithms and shows the result.
- A checked-in golden set of hand-verified route plans, beside `navbench/fixtures/`
  (`navbench/fixtures/oracle/` is generated), as the regression baseline.

**Exit criterion.** A plotted route can be run through routing, fare and detour computation from the
admin UI and the result shown with its distance, fare and transfer count; results are compared against
the checked-in golden set, and a divergence fails visibly.

## Deferred and out of scope

These items are deliberately **not** in any milestone. Two of them carry a risk worth stating plainly
rather than leaving to be discovered.

### Traces and trust-score calibration — mobile-gated

There is no `traces` table, no traces API and no shared trace types, and `specs/001` records the
clarification that trace ingestion and trust scoring were deferred. A **Trace** is produced by the
commuter app, which sits after M6. So no amount of admin work produces calibration data: the MHD trust
score (ADR-0003) is implemented but stays **uncalibrated**, and calibration is nobody's deliverable.

Risk: calibration data accumulates in real time, so it cannot be back-filled at the end. If the thesis
needs a calibrated trust score, the only levers are starting the mobile app earlier or adding an
interim ingestion path (for example accepting uploaded GPX rides) — the second was considered and
rejected here in favour of keeping the admin scope closed.

### Fare and distance ground truth — offline by choice

Per-leg fare and distance ground truth is field-survey data, not plotting output. It lives outside the
repo (a spreadsheet or thesis appendix) and is reconciled against the LTFRB rule by hand. No admin
surface, table or endpoint is added for it. `R5` is where it could later become real assertions: once
`fareCalculator` lives in `@komyuter/shared`, surveyed fares are test fixtures rather than a dataset.

### PR preview environments — not in M4

An ephemeral deploy per pull request needs a per-PR database and environment. That cost is not
justified at this scale, so M4 ships two long-lived environments (staging and production) and nothing
else.

### The CI gap — "reliable CI" is only partly satisfied

M4 does **not** close the server testing gap. `apps/server`'s integration suite keeps its status as a
local pre-merge obligation, and CI continues to run format, lint, typecheck, the admin suite and build
only — so a server-side regression can merge green. The local obligation in `AGENTS.md` is what stands
in its place.

Risk: this is the one place where the milestone name overpromises. Closing it means booting the local
Supabase stack in the job (Docker on the runner, several minutes slower); it was considered and
declined. State this honestly in the thesis rather than claiming CI covers both halves.

### Out of scope by existing decision

- ETA anywhere in navigation output (ADR-0009).
- Vehicle-specific restricted zones and multi-vehicle routing (ADR-0012).
- Any full rewrite of the Node CRUD server, and pgRouting (ADR-0017).
- Multi-region datasets — one region, Iloilo City (ADR-0010).
- The commuter mobile app itself; it consumes M6's contract but is not part of this record.

## Sequencing rationale

The order follows from six statements about the project, in its own terms.

1. **M1 before everything.** Admin Web App v1 is deployed first, to test the project's stability and its
   capacity for rapid development. The deploy is thin because the value is in the environment existing
   — hosting, database, auth and configuration proven end to end — not in what it contains.
2. **M2 before M3.** Plotting routes is how the dataset grows, and the plotters are other people, so
   growing the dataset requires Accounts before it requires more route-modeling features. M2a is the
   specific unlock.
3. **M3 is v1.** v1 is defined as the app plus the complete route model, so v1 is released at the end of
   M3 rather than at the end of all plotting work. Splitting at this point keeps the release-critical
   path clear of the least-defined work — the power-editor features sit in M5.
4. **M4 before M5**, so that v1.1 is the release which proves the pipeline rather than the release which
   waits for it.
5. **M6 after M5.** Once all advanced admin features are implemented, the next step is a sandbox
   playground to test the main algorithms before mobile development begins.
6. **Mobile last**, consuming the navigation contract M6 establishes.

## Open question — the M4 / M5 order

This was flagged during planning and resolved one way so the record could be written; it is the single
place where two stated intentions disagreed.

- The milestone list puts CD **after** the advanced plotting work: deploy → access control → advanced
  plotting → **then** CD.
- The release plan says **"CD is proven by v1.1"** — but v1.1 is itself part of the advanced plotting
  work, so it cannot both follow CD and be the thing that proves it.

This record resolves it as **M4 (CD) → M5 (v1.1 proves it)**, because that reading satisfies the more
specific statement and leaves the pipeline with a real release to be proven by.

**To flip the order:** move the `M4` row below `M5` in the overview table; set M5's _Depends on_ to `M3`
and M4's to `M5`; and restate M4's exit criterion as "the first version tag published after CD lands
deploys through the pipeline". Nothing else in this document depends on which way it goes.
