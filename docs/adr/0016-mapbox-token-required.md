# ADR-0016: Mapbox tokens required; remove mock/OSM fallbacks (PROPOSED)

- **Status**: PROPOSED — the direction is agreed and recorded, but **not yet implemented**
- **Date**: 2026-08-19
- **Supersedes/refines**: ADR-0013 (the dev-fallback lines) and the straight-line fallback behavior described in `specs/007-route-plotting-page/` (FR-009, assumptions, edge cases).

## Implementation status: planned / not yet implemented

The `specs/007` feature is already shipped, and its code still reflects the **old** behavior that this ADR proposes to remove:

- `apps/server/src/config/env.ts` — `MAPBOX_SECRET_TOKEN` is **optional** (`z.string().optional()`), documented "Absent → straight-line fallback".
- `apps/server/src/api/mapbox.ts` — a real `straightLineFallback()` exists and is returned on both the no-token path (`warning: "no_token"`) and the upstream-error path (`warning: "upstream_error"`), with `snapped: false` and `distance_meters: 0`.

So the straight-line mock still exists in the code today; the proposal below is the target to implement later. This gap is logged in `docs/DEVIATIONS.md` (Appendix A). If a tokenless thesis demo is desired, the fallback may also be deliberately retained — see `docs/DEVIATIONS.md` before treating the removal as mandatory.

## Context

ADR-0013 let the admin dashboard run without a Mapbox account: missing tokens caused the road-snapping proxy to fall back to a **mock straight-line** result and the renderer to fall back to **OSM raster** tiles, with a warning.

Grilling the Route Plotting Page (`specs/007`) under the constitution principle **Precision Is Trust** surfaced a problem with that fallback. A straight-line "snap" is a chord across blocks — a path that does not exist on the road network and in places cannot be driven at all. If that fabricated geometry can reach a saved `Direction.base_polyline`, it pollutes the authoritative graph the commuter side routes on, and the only fix is an error-prone re-save. The same principle also forbids silently rounding or fabricating any distance (ADR-0009).

Separately, the mobile app already requires a Mapbox account (`@rnmapbox/maps` embeds a public token in the bundle). A thesis server/desktop demo therefore sits on a Mapbox token that must be configured regardless; a "dev mode that runs without one" has no users and only adds a second, riskier code path.

## Decision

Obtain aligned with ADR-0013's existing split-renderer/services model, but **remove the fallbacks and make both tokens required**:

- **`MAPBOX_PUBLIC_TOKEN`** — required. Held by the **admin browser** for Mapbox vector tiles via MapLibre GL JS, scoped to the admin domain (Mapbox URL allowlist). The **OSM raster fallback is removed**; there is no tile path without this token.
- **`MAPBOX_SECRET_TOKEN`** — **required at server startup** (fail-fast in `apps/server/src/config/env.ts`, same discipline as other required vars). Server-only: never shipped to the browser. Used by the `/api/admin/mapbox/*` proxy (Directions, Geocoding, Matching), behind the admin auth guard and the `{ success, data | error }` envelope.
- **The mock straight-line snapping fallback is deleted entirely.** No straight-line geometry is produced, previewed, or persisted, in any mode.
- **No `manual` eye-trace tier.** All saved polyline geometry is road-snapped by construction, because real snapping is always available.
- **Persisted geometry carries a `snapped: true` marker**, set by the proxy and re-checked server-side at save. It is the server's cheap independent assertion that the geometry it persists is road-verified rather than merely geometrically plausible.
- **Snap failure behavior**: on a transient failure (network drop, service timeout, upstream error), the unsnapped bridge between two stops renders as a **pending / unpinned** state (dashed, amber), is **never saveable**, and resolves only when a road snap succeeds or the admin repositions the stop. Placing further stops is **never blocked** (best-effort continuity).

### Non-goals (explicit)

- The server secret token is **never** exposed to the browser. The browser holds only the scoped public token (which is safe in a browser by design).
- No offline / no-token mode. The project does not run without Mapbox tokens configured in the environment.

## Consequences

- **Positive**: no fabricated geometry can ever enter the graph — the strongest possible alignment with _Precision Is Trust_; one snapping path instead of two; simpler server surface (no mock branch in the proxy, no OSM tile fallback).
- **Positive**: developer setup is simpler to reason about (tokens required, same in dev and prod) and consistent with the mobile app's already-required token.
- **Trade-off**: the admin dashboard cannot be developed or demoed without Mapbox tokens; a single-account free Mapbox token satisfies the thesis scale (single region, ~10–40 stops per direction).
- **Documentation**: supersedes the dev-fallback text in ADR-0013 and the straight-line fallback in `specs/007` (FR-009, edge cases, assumptions). Requires reconciling `specs/007/plan.md` and `spec.md` to match.
