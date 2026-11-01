# ADR-0026: Service area and network coverage — two boundaries, server-enforced (DECIDED)

- **Status**: DECIDED — implementation not started
- **Date**: 2026-10-30
- **Refines**: ADR-0010 (single region, no city discriminator). Relates to ADR-0027 (the boundary
  ships inside a Dataset Version) and ADR-0030 (the mobile geofence).

## Context

Nothing in the repository defines where Komyuter is supported. There is no service-area polygon, no
bounding box, no geofence — not in the schema, not in the server, not in the admin, not in the mobile
shell. The consequence is a product lie: a commuter outside the thesis region gets whatever the
algorithm returns, and "no route found" is indistinguishable from "this place is not supported yet".

Three facts make this a decision rather than a UI task.

**The region is already defined, but only in prose.** ADR-0010 fixes the scope as Iloilo City Proper
plus Oton, Pavia and Leganes, modelled as one connected transit graph with no `city` column, because
transfer edges cross municipal boundaries. The service area must agree with that decision, or routes
the thesis already assumes become unsavable.

**Support and reach are different questions.** The admin can support a municipality while no jeepney
reaches a particular barangay. Collapsing both into one polygon forces the product to say "not
supported" for places that are supported but unserved, and "no route" for places that are not supported
at all.

**A camera limit is not a rule.** MapLibre's `maxBounds` constrains panning in one client. It does not
constrain the API, a script, or a future mobile client, and it fights the plotter near the edge.

## Decision

1. **One Service Area, stored and versioned.** The supported extent is a single active polygon (a
   `MultiPolygon` in PostGIS, WGS84) covering the ADR-0010 region. It carries the same lifecycle as any
   other dataset entity: changes go through a Proposal and are published in a Dataset Version
   (ADR-0027). No `city` column and no multi-tenant machinery are added (ADR-0010 stands).

2. **Two boundaries, not one.**
   - **Service Area** — curated, authoritative, the product's "supported" claim.
   - **Network Coverage** — derived on publish from the union of published direction polylines,
     buffered by a fixed tolerance. It answers "supported, but no jeepney reaches here".

   Network Coverage is a derived report, never an editable polygon, so a data gap cannot silently
   shrink the supported claim.

3. **The server is the authority.** Three enforcement points, all returning the documented envelope
   with a new error code:
   - Stop create/update: the stop must lie inside the Service Area.
   - Direction save: every stop inside — and, once ADR-0028 lands, every Stop Waypoint — with the
     polyline within a tolerance of the boundary (edge roads run along it).
   - Navigation request (M6): origin and destination inside the Service Area. Outside is
     `OUT_OF_SERVICE_AREA`; inside the area but with no reachable route is `NO_ROUTE_IN_COVERAGE`. The
     two are different product outcomes and must not share a message.

4. **Outside the area, browsing stays open.** A commuter can pan and inspect the map; search and routing
   refuse, the boundary is drawn, and the copy says the region is not supported yet. The app is not
   gated behind a location check, and a request is never answered with a fabricated route.

5. **The boundary is rendered, not enforced, in the client.** The admin and the mobile app draw the
   polygon as a world rectangle with the Service Area as a hole, plus a boundary line. `maxBounds` may
   be used as a soft UX guard in the admin; it is never the rule.

6. **Mobile shares the polygon, and its geofence is feedback only.** The polygon travels with the
   dataset (and inside the offline bundle), carries the Dataset Version, and expires with it. A local
   check gives instant feedback; the server decision is still the one that matters.

7. **Coverage is recomputed at publish and surfaced for curation.** The publish review shows routes
   that leave the Service Area and stops near its edge, so drift is visible before a Dataset Version is
   promoted rather than discovered by a commuter.

## Alternatives considered

- **City Proper only.** Rejected: ADR-0010 deliberately includes the three neighbouring municipalities,
  and existing cross-boundary routes would become unsavable. The polygon must match what is defended.
- **Enforce with `maxBounds` only.** Rejected: it is a camera control, bypassable by any client, and it
  makes the API unguarded.
- **Derive the Service Area from route coverage.** Rejected: a missing route would shrink the supported
  claim, turning a data gap into a product decision. Coverage is derived; support is curated.
- **Hard-gate the whole app on location.** Rejected: it hides the coverage the product is asking people
  to trust, and permission denial would look like an outage.
- **A per-client polygon.** Rejected: two copies of a boundary drift silently, and the mobile one would
  be the copy nobody validates.

## Consequences

- **Positive**: "not supported yet" becomes a truthful, testable state; one polygon serves admin,
  server and mobile; boundary changes are reviewable and rollback-able like any other data change.
- **Positive**: the two-boundary model gives the PSSUQ evaluation something concrete to ask about —
  users can tell "we do not serve you" from "we could not find a way".
- **Trade-off**: the polygon needs curation and a tolerance number for edge roads, and both are
  defensible only with a stated rationale.
- **Trade-off**: two boundaries must be explained in the interface and in the thesis; one is a promise,
  the other is a report.
- **Risk**: the Service Area and the graph drift apart. Mitigated by the publish-time coverage report
  and by validating every direction against the polygon, not just stops.
- **Risk**: a legitimate route on a boundary road fails the tolerance and blocks a save. The tolerance is
  a named constant with a test, not a magic number at the call site.

## Non-goals (explicit)

- No multi-city or multi-tenant support; ADR-0010 still governs.
- No routing outside the Service Area, not even a "best effort" answer.
- No dynamic or isochrone-based service area. The boundary is curated, not computed from travel time.
- No client-side enforcement as the authority.
