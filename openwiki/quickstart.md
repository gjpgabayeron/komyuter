---
type: overview
title: "Komyuter wiki quickstart and task routing"
description: "Entry point to this wiki: the reading order, the authority ladder and the read-only documents outside wiki scope, the mandatory first read for anything routing/navigation/ETA/AR-shaped, and an intent-to-page map for the admin workspace, server API, schema, fares, snapping, tests and configuration."
tags: [quickstart, entry-point, task-routing, authority-order, evidence-boundaries, read-only-scope]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-07T11:05:10.019Z
sources:
  - id: openwiki-source-164e2da859b5277df81c7d94
    resource: repo://.github/workflows/ci.yml
  - id: openwiki-source-8037e2358a2c4f9b2c722a11
    resource: repo://AGENTS.md
  - id: openwiki-source-e86fe7b76c693666bc2cb828
    resource: repo://apps/mobile/package.json
  - id: openwiki-source-f67bec33dfc9a4a4a2f32dea
    resource: repo://apps/server/.env.example
  - id: openwiki-source-af9ed044b3462b6126b95a6e
    resource: repo://apps/server/README.md
  - id: openwiki-source-e60da57bd8148114e50bd696
    resource: repo://apps/server/src/api/index.ts
  - id: openwiki-source-e8d738d5a87bd67858eb339b
    resource: repo://docs/adr/0012-detour-conditional-triggers.md
  - id: openwiki-source-605402db4d6aeedf914f16c7
    resource: repo://docs/DEVIATIONS.md
  - id: openwiki-source-265221f77947a8a08e9a018a
    resource: repo://packages/shared/src/index.ts
  - id: openwiki-source-3d191481cfb0a03ba1b3a300
    resource: repo://packages/shared/src/types/domain.ts
generated: { by: "openwiki/0.7.1", at: "2026-10-07T11:05:10.019Z" }
---

# Komyuter wiki quickstart and task routing

This wiki is the current-state reference for **how this repository works today**: structure, data flow, invariants, failure semantics, configuration and security boundaries. It is organized by domain group — `architecture`, `concepts`, `workflows`, `integrations`, `operations`, `testing`, `apps`, `packages` — not by the source tree, so a task is routed by intent rather than by directory. It does **not** record *why* the system is shaped this way; that is `docs/adr/`.

## Reading order

1. **This page** — authority, boundaries and the intent table.
2. [System overview: runtime topology and component ownership](architecture/system-overview.md) — the one page that says what actually runs and who owns what.
3. **The domain pages for your task**, from [Route by task intent](#route-by-task-intent).
4. [Workspace, build pipeline, lint and CI wiring](architecture/workspace-build-and-ci.md), [Admin tests](testing/admin-tests.md) and [Server tests](testing/server-tests.md) when you need to run or verify something.

## Authority and evidence boundaries

In decreasing order of precedence: **`docs/adr/*.md` → `AGENTS.md` → the code and its tests → this wiki.**

- **Never restate or contradict an ADR.** Where a page touches a decision an ADR already covers, it cites the ADR by number and moves on. Deeper rationale always lives in `docs/adr/`.
- **If the code appears to disagree with an ADR, say so on the page** rather than silently describing the code as the intent. Deliberate deviations are recorded in `docs/DEVIATIONS.md` — check it before reporting a discrepancy.
- **This wiki has no authority over the designs it points at.** Where a subject has an authoritative hand-authored source, read that source; do not treat any wiki page as a specification.

### Read-only, out of wiki scope

These are hand-authored and authoritative in their own right. Read them as **evidence only**; never rewrite them, and never expect a wiki page to duplicate them:

- `docs/adr/**` — the decisions and their rationale.
- `docs/CRITIQUE.md`, `docs/DEVIATIONS.md` — thesis process records, including the tracked unbuilt-feature list.
- `docs/thesis/**` — thesis chapters.
- `docs/CONTEXT.md` — the glossary.
- `PRODUCT.md`, `DESIGN.md` — strategy/voice and the visual system (`DESIGN.md` wins on visual decisions).
- `specs/**` — specification process artifacts (plans, tasks, contracts).
- `docs/BACKEND.md`, `docs/ADMIN.md` — cited as authoritative by `docs/DEVIATIONS.md` and ADR-0012.
- `docs/OVERVIEW.md`, `docs/TECHSTACK.md`, `docs/SCHEMA.md`, `docs/SUMMARY.md` — historical design docs for the target system, not a file map; the ADRs and `docs/DEVIATIONS.md` cite their line numbers, so do not edit them.

## Routing, navigation, ETA or AR? Read the negative-space page first

**If you are asked to build or change routing, navigation, ETA, trust scoring, GPS-trace validation or AR, read [Routing, navigation and trust are not implemented: the negative space](concepts/routing-and-navigation-scope.md) first.** None of it exists in this repository: there is no graph builder, no Dijkstra, no navigation endpoint, no ETA, no trace pipeline, no trust scoring, no map or AR in the mobile app. That page records each absence with its evidence and names the authoritative design source for it — an ADR, a `docs/BACKEND.md` section, `specs/011-backend-language-migration/contracts/navigation-api.md`, or the standalone `navbench/` harness — so that you neither invent behaviour nor implement from a wiki page.

The same rule applies more generally: when a change touches a response shape, a shared schema, a fare or distance calculation, or anything graph-shaped, read the ADR named for that decision *before* editing.

## Route by task intent

| If the task is… | Read, in order |
| --- | --- |
| Understand what runs, or who owns a component | [System overview](architecture/system-overview.md) → [Workspace, build and CI](architecture/workspace-build-and-ci.md) |
| Change the admin plotting workspace (map, layers, stops, selection, focus) | [Admin route workspace UI](apps/admin-route-workspace-ui.md) → [Workflow: plotting a route and saving the direction pair](workflows/admin-route-plotting-save.md) → [Admin data access and client state](apps/admin-data-layer-and-client-state.md) |
| Change the admin shell (providers, routes, auth guard, rail/sidebar, window gate) | [Admin SPA shell](apps/admin-shell-and-routing.md) → [Admin data access and client state](apps/admin-data-layer-and-client-state.md) |
| Change how a direction pair is saved, or the gates a save must pass | [Workflow: plotting and saving](workflows/admin-route-plotting-save.md) → [Two directions per route](concepts/directions-and-derived-return.md) → [Server API surface](operations/server-api-surface.md) |
| Author, edit or debug a detour (alternative route) | [Workflow: detour authoring and persistence](workflows/detour-authoring-persistence.md) → [Two directions per route](concepts/directions-and-derived-return.md) |
| Add or change a server endpoint, error code, guard or delete semantic | [Server API surface](operations/server-api-surface.md) → [Shared contracts](packages/shared-contracts.md) → [Server tests](testing/server-tests.md) |
| Touch the schema, a migration, a constraint or an index | [Persistent data model and migrations](architecture/data-model.md) → [Local Supabase stack](integrations/supabase-local-stack.md) |
<!-- openwiki: broken internal link [concepts/fares-and-fare-configurations.md] file "concepts/fares-and-fare-configurations.md" does not exist. Fix the href or restore the target, then delete this comment. -->
| Change fare configuration (fields, validation, defaults, route references) | [Fares and fare configurations](concepts/fares-and-fare-configurations.md) → [Persistent data model and migrations](architecture/data-model.md) |
| Adjust road snapping, the Mapbox proxy contract or its fallback | [Mapbox Directions proxy](integrations/mapbox-directions-proxy.md) → [Coordinates and spatial math](concepts/coordinates-and-spatial-math.md) → [Workflow: plotting and saving](workflows/admin-route-plotting-save.md) |
| Touch coordinate order, distance math or a meter tolerance | [Coordinates and spatial math](concepts/coordinates-and-spatial-math.md) **first** → the page for the feature |
| Work on login, the admin gate, throttling or session expiry | [Workflow: admin login, authorization gate and session expiry](workflows/admin-authentication-and-session.md) |
| Change the dataset export | [Workflow: dataset export and its reference invariants](workflows/dataset-export-pipeline.md) |
| Run tests, or work out what a quality gate actually covers | [Admin tests](testing/admin-tests.md) → [Server tests](testing/server-tests.md) → [Workspace, build and CI](architecture/workspace-build-and-ci.md) |
| Change environment variables, ports, secrets or the built-app CSP | [Configuration, environment variables and secrets](operations/configuration-and-secrets.md) |
| Work on the commuter app | [Mobile commuter app](apps/mobile-commuter-app.md) → [Routing and navigation scope](concepts/routing-and-navigation-scope.md) |
| Build anything routing/navigation/ETA/trust/AR-shaped | [Routing and navigation scope](concepts/routing-and-navigation-scope.md) first, then the authoritative source it names |
| Work on `navbench/` or the backend-navigation runtime question | [navbench parity harness](integrations/navbench-parity-harness.md) → ADR-0017 |
| Change shared types/schemas, the TS presets or ESLint ownership | [Shared contracts](packages/shared-contracts.md) → [Shared UI primitives and the TypeScript config presets](packages/ui-and-typescript-config.md) |

## Running and verifying locally

The local stack is required for anything beyond the hermetic admin suite; see [Configuration, environment variables and secrets](operations/configuration-and-secrets.md) and [Local Supabase stack](integrations/supabase-local-stack.md).

```sh
supabase start                 # Postgres + PostGIS + Auth; applies migrations and seed.sql
cp apps/server/.env.example apps/server/.env
pnpm install
pnpm --filter server dev       # Fastify on http://localhost:3000
pnpm --filter admin dev        # Vite SPA on http://localhost:5173

pnpm --filter admin test       # hermetic, no database — this is what CI runs
pnpm --filter server test      # needs the local stack up plus apps/server/.env
```

Full gate semantics — what each CI step covers and, importantly, what it does not — are on [Workspace, build and CI](architecture/workspace-build-and-ci.md).
