# Komyuter

Route planning and navigation for Philippine public utility vehicles (PUJs): an Expo
commuter app, an admin dashboard for plotting routes and stops, and a Fastify + PostGIS
backend. Built as a thesis system, scoped to one region — Iloilo City Proper plus Oton,
Pavia and Leganes.

## Layout

| Path                         | What it is                                                            |
| ---------------------------- | --------------------------------------------------------------------- |
| `apps/admin`                 | React 18 + Vite 5 admin dashboard (MapLibre GL, zustand, React Query) |
| `apps/mobile`                | Expo commuter app                                                     |
| `apps/server`                | Fastify v5 admin API (`@komyuter/server`) against Supabase/PostGIS    |
| `packages/shared`            | `@komyuter/shared` — shared types, zod schemas, `fareCalculator`      |
| `packages/ui`                | `@repo/ui` — shared component primitives                              |
| `packages/typescript-config` | `@repo/typescript-config` — shared strict tsconfigs                   |
| `supabase/`                  | Local Supabase stack config and migrations                            |
| `navbench/`                  | Standalone routing benchmark harness (`rust/`, `go/`, `node/`)        |

## Commands

Install with pnpm; workspace deps use `workspace:*`.

```sh
pnpm dev           # turbo dev across all packages
pnpm build         # turbo build
pnpm lint          # eslint . — one root flat config
pnpm typecheck
pnpm test          # turbo run test
pnpm format        # prettier --write
pnpm format:check  # the check-only variant CI runs
```

CI (`.github/workflows/ci.yml`) runs `format:check`, `lint`, `typecheck`, the
`apps/admin` test suite, then `build`. `apps/server`'s integration tests drop and
recreate a test database and need the local Supabase stack, so they stay a local
pre-merge obligation rather than a CI step.

## Where the documentation lives

Start with **`AGENTS.md`** — repo conventions, commands, and the known doc/config
conflicts. Then:

- **`docs/adr/`** — the design decisions and their rationale. **Authoritative**: where
  any other document disagrees, the ADR wins.
- **`openwiki/`** — a generated wiki describing how the system works _today_. Entry point
  is `openwiki/quickstart.md`; refresh it with `openwiki --update`.
- **`docs/`** — `CONTEXT.md` (glossary), `SECURITY.md`, `CRITIQUE.md` and `DEVIATIONS.md`
  (thesis process records), and `thesis/` (chapters and references).
- **`PRODUCT.md`**, **`DESIGN.md`** (repo root) — the product's strategic and visual
  systems. Load both before UI work.
- **`specs/`** — per-feature specifications, plans and contracts.

> **Superseded:** the design docs `OVERVIEW.md`, `TECHSTACK.md`, `SCHEMA.md` and `SUMMARY.md`
> describe a _target_ system, not the current one, and now live in `docs/archive/` for
> provenance. `docs/BACKEND.md` stays where it is — it is the conceptual reference for the
> routing, AR and trust layers still to be built, and `docs/DEVIATIONS.md` cites it by line
> number. Trust the code, the ADRs and the wiki over any of them.
