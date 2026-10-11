# ADR-0021: Branching, environments, and one Supabase project per environment (DECIDED)

- **Status**: DECIDED — this ADR **supersedes the branch→environment triggers recorded in
  `docs/ROADMAP.md` M4**. The protection it specifies is applied (2026-10-11); the pipeline that consumes
  the triggers is M4's work.
- **Date**: 2026-10-11
- **Supersedes/refines**: supersedes ROADMAP M4's "Merge to `main` deploys staging" and "A version tag
  deploys production behind a manual approval gate"; refines ROADMAP M1's "Supabase Cloud project as the
  production data plane". Leaves ADR-0018's topology intact — one service, one origin, one
  environment-agnostic image.

## Context

Three facts made M4's mapping unworkable as written.

**The repo already flows through `dev`.** Every feature PR since #1 merged into `dev`, and when this
decision was taken `main` was **76 commits behind** it (still at `chore: mobile init`). M4 as written made
`main` simultaneously the branch that churns constantly and the branch production is cut from.

**The default branch is `main`, and stays `main`.** GitHub proposes the default branch as the base of
every new pull request and shows it on the repository page and in a fresh clone, so with `main` as the
production branch a new pull request proposes production as its base and has to be re-pointed at `dev`.
That is an accepted cost of keeping production as the headline branch — see decision 4.

**One Supabase project cannot serve both environments.** ADR-0018 §4 requires the application tables to
live in Supabase Cloud, because `admin_users.user_id` is a foreign key to `auth.users.id`. Sharing one
project therefore means staging deploys apply migrations to production data, and staging activity writes
real rows into the dataset under test.

## Decision

1. **Two long-lived environments** — staging and production. No PR preview environments (unchanged from
   M4, where the per-PR database cost was considered and declined).
2. **`dev` → staging.** Merging into `dev` past CI moves staging.
3. **`main` → production.** Merging `dev` → `main` deploys production behind a manual approval step. Tags
   (`vX.Y.Z`) **record** the release rather than triggering it.
4. **`main` stays the repository default branch** — it is both the headline branch and the production
   branch. New pull requests therefore propose `main` as their base and must be re-pointed at `dev`. What
   actually prevents an accidental production merge is decision 6's protection (pull request required,
   `check` required, administrators included), not the default branch: protection is per-branch, and the
   default branch has no effect on which branch deploys.
5. **One Supabase Cloud project per environment.** The M1 project is the **staging** data plane;
   production gets its own project, holding the real dataset, at M4. Migrations are applied to each
   project as an explicit step _before_ that environment's container goes live, never at boot
   (ADR-0018 §5).
6. **Both deploy triggers are protected.** `dev` and `main` require a pull request, require the `check`
   status with branches up to date, include administrators, and forbid force-push and deletion. `v*` tags
   may only be created, moved or deleted by an admin (ruleset `release tags`).

Promotion is therefore one-way: `feat/*` → `dev` → `main`, with staging validated between the last two.

## Consequences

- **The CI gap now sits on the deploy path.** Staging deploys are gated on CI, and CI does not run
  `apps/server`'s suite (`docs/ROADMAP.md` records it as a local pre-merge obligation), so a server-side
  regression can reach staging on a green pipeline. This ADR makes that a property of the pipeline rather
  than a footnote about it.
- **`ADMIN_ORIGINS` must name each environment's own origin before that environment is usable.** The
  origin guard refuses any request carrying an un-allowlisted `Origin`, and browsers send `Origin` on
  same-origin POSTs — so `POST /api/auth/login` returns 403 until the value matches. Generate the Railway
  domain _before_ the first deploy, or expect a second pass.
- **Both environments keep `ALLOW_DEV_CREDENTIAL=false`, and the owner's `ADMIN_PASSWORD` must not be the
  documented dev credential.** Login refuses that pair regardless of which Account owns it, so seeding it
  would produce an owner who cannot sign in at all.
- **One migration chain, two destinations.** `supabase migration list` must be run per project, and a
  pipeline should target a project by `--db-url`/`--project-ref` rather than trusting a machine-local
  `supabase link` — nothing is linked today.
- **Recovery.** Protection includes administrators, so a red CI run on `dev` blocks merges until it is
  fixed or protection is lifted for the moment:
  `gh api -X DELETE repos/<owner>/<repo>/branches/dev/protection`.

## Alternatives considered

- **Keep M4 as written (`main` → staging, tag → production).** Rejected: it inverts the direction work
  actually flows and leaves `dev` — where every feature already lands — with no environment at all.
- **`main` → a pre-production environment, tag → production (three environments).** Rejected: M4
  deliberately reduced the environment count on cost grounds, and a third long-lived environment buys
  little while the dataset is still being plotted.
- **A single Supabase project for both environments.** Rejected: it makes staging destructive, which
  defeats the purpose of having it.
- **Protect only `main`.** Rejected: `dev` is a deploy trigger now, so it needs the same gate — otherwise
  a direct push to `dev` reaches staging with no CI run and no reviewable diff.
- **Rely on convention until M4 builds the pipeline.** Rejected: the triggers go live the moment anything
  watches the branch, and protection is cheapest to add before that exists rather than after.
