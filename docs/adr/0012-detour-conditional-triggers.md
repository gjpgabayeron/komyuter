# ADR-0012: Detour conditional triggers (ACCEPTED — implementation planned R2)

- **Status**: ACCEPTED (decision) · **Implementation**: planned / not yet implemented (roadmap R2)
- **Date**: decision recorded in `docs/ADMIN.md` (roadmap R2); this ADR file written 2026-08-19
- **Related**: ADR-0008 (triggered detour replaces the base segment)

## Context

Detours are demand-triggered loops that depart from and return to a route's base polyline (ADR-0008), serving stops not reachable on the base path. Today the `Detour` model (`createDetourSchema` in `@komyuter/shared`) captures `entry`/`exit` points, `detour_polyline`, `additional_distance_meters`, `commuter_instruction`/`driver_instruction`, and `notable_stops` — but has **no notion of when a detour is active**. Without a trigger condition, a detour cannot be applied selectively per request, so the model is incomplete for real demand-triggered operation.

## Decision

Add **conditional triggers** to the `Detour` model so activation is data-driven and server-side:

- **`active_timeframes`** — recurring time windows (days/times) during which the detour applies.
- **`condition`** — a declarative trigger condition, with landmark selection as the primary trigger and destination-proximity as the secondary validator, per ADR-0008's trigger mechanism.
- **Server-side active-detour resolution at request time** — the server decides which detours are active for a given request and applies them; triggers are resolved in the backend (`api/detours.ts` + shared types/schemas), not in the client.

**Triggers affect the path only** (FR-027/FR-029): when a detour activates, the base-polyline segment between its `entry` and `exit` is **replaced** by the detour loop (ADR-0008) for that request. Fare and distance are computed over the cumulative detour path. Triggers do not alter stop/fare registry descriptions or the graph cache shape.

**Out of scope** (per this ADR and ADR-0009): vehicle-specific restricted zones, multi-vehicle routing, and ETA anywhere.

## Implementation status

**Planned / not yet implemented (roadmap R2).** `active_timeframes` and `condition` are **not** present in `packages/shared` (`createDetourSchema`/`updateDetourSchema`) or `apps/server` today. Admin server CRUD and the current `Detour` fields (ADR-0008) are complete; conditional triggers remain to be added. `docs/ADMIN.md` cites this ADR as the authoritative R2 scope.

## Consequences

- **Positive**: data-driven activation lets a single detour service different request contexts without code changes; keeps the "trigger affects the path only" rule consistent with ADR-0008.
- **Trade-off**: server-side per-request resolution adds a lookup at request time; deferred (R2) so the current static detour model stays shippable.
- **Documentation**: resolves the dangling "ADR-0012" citations in `docs/ADMIN.md` (FR/SC tables, roadmap R2, out-of-scope list) that previously pointed to a non-existent ADR file.
