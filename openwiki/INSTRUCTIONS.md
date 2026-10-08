# OpenWiki instructions for komyuter

User-authored brief. OpenWiki reads this file for scope and priorities and never
rewrites it — it is the single file preserved across `openwiki --init`.

## What this wiki is

The current-state reference for **how this repository works today**: structure,
data flow, invariants, failure semantics, configuration, and security
boundaries, per component.

It is not the record of *why* the system is shaped this way. That is
`docs/adr/`. See **Authority** below.

## Authority

In decreasing order of precedence:

1. `docs/adr/*.md` — the design decisions and their rationale (17 ADRs).
2. `AGENTS.md` — repo conventions, commands, and known doc/config conflicts.
3. The code and its tests.
4. This wiki.

Rules:

- **Never restate or contradict an ADR.** Where a page touches a decision an ADR
  already covers, cite it by number and move on — for example, "the LTFRB fare is
  non-additive, so ranking uses a different internal cost (ADR-0001)".
- **If the code appears to disagree with an ADR, say so explicitly on the page.**
  Never silently describe the code as though it were the intent. Deliberate
  deviations are already recorded in `docs/DEVIATIONS.md` — check it before
  reporting a discrepancy.
- Never generate a page that duplicates a document in the out-of-scope list.

## Scope — document

- `apps/server` — Fastify v5 API: the route surface, the injectable
  `buildApp({ db, supabase })` dependency seam, the `{ success, data | error }`
  envelope, zod validation, the Supabase auth guard, and the PostGIS query layer.
- `apps/admin` — React 18 + Vite admin dashboard: state stores, the route/detour
  plotting workspace, map layers, and the data-access layer.
- `apps/mobile` — the Expo commuter app: state, navigation, and services.
- `packages/shared` — shared types and `fareCalculator`.
- `packages/ui` — shared component primitives.
- `supabase/` — migrations and local stack configuration.
- Repository-level build/test/lint wiring: `turbo.json`, root scripts, CI.

## Out of scope — do not document or regenerate

Hand-authored and authoritative in their own right. Read them as evidence; never
rewrite them.

- `docs/adr/**` — decisions and rationale
- `docs/CRITIQUE.md`, `docs/DEVIATIONS.md` — thesis process records
- `docs/thesis/**` — thesis chapters
- `CONTEXT.md` — glossary
- `PRODUCT.md`, `DESIGN.md` — strategy and visual system
- `specs/**` — specification process artifacts
- `docs/BACKEND.md`, `docs/ADMIN.md` — cited as authoritative by
  `docs/DEVIATIONS.md` and ADR-0012
- Root design docs `OVERVIEW.md`, `TECHSTACK.md`, `SCHEMA.md`, `SUMMARY.md` —
  already superseded; treat as historical, not current. Do not rewrite them:
  their line numbers are cited by `docs/adr/*` and `docs/DEVIATIONS.md`.

## Invariants that are correct and must not be documented as defects

These are deliberate choices. A page presenting any of them as a bug, an
oversight, or an inconsistency is wrong.

- **Coordinate order is `[longitude, latitude]` everywhere** — GeoJSON, PostGIS
  `ST_MakePoint`, MapLibre/Mapbox GL, and the admin UI. There is no conversion
  layer, by design (ADR-0013 supersedes ADR-0007's Leaflet exception, which never
  shipped a converter). Do not propose adding one.
- **Meter-based PostGIS math must cast `::geography`.** Raw geometry returns
  degrees. Where the cast appears it is required, not stylistic.
- **Two fare notions, both correct.** The *displayed* fare is the exact per-leg
  LTFRB total: `base_fare + max(0, dist_km - base_distance_km) × rate_per_km`
  (defaults ₱13 / 4 km / ₱1.80, 20% student/senior). The Dijkstra *internal* cost
  is base-on-board plus a marginal ₱1.80/km — deliberately not per-edge LTFRB,
  because that formula is non-additive and per-edge application would
  double-count the base fare (ADR-0001). Do not report this as a mismatch.
- **No ETA anywhere.** Navigation output is distance, fare, transfer count, and
  walk distance only — no duration and no walking-time constant (ADR-0009).
- **Routes are modeled as two directions**, each with its own polyline and
  ordered stop list (`stop_{stopId}_direction_{directionId}` nodes). Never
  describe reversing one polyline for the return trip (ADR-0008).
- **Trust scoring is informational only** — never a Dijkstra weight. Trace
  validity uses a max-speed discriminator (10–45 km/h), not average speed
  (ADR-0003).
- **Normalization is per-edge-type** — separate distance / walk / fare / transfer
  pools, each clamped to [0,1], with transfer-edge distance = 0 (ADR-0002).
- **Hail-and-ride boarding at non-stop positions** uses request-time virtual nodes
  and board edges that never persist and never enter the graph cache.
- **Numeric columns are drizzle string mode** (drizzle-orm 0.36.x has no
  `mode: "number"`), converted with `Number()` at the handler layer. Not a bug.

## Notes

- The admin UI and MapLibre consume `[lng, lat]` natively. There is no
  `[lat, lng]` exception anywhere in this repository.
- Prefer Mermaid diagrams where a runtime flow or data model is clearer to see
  than to read.
