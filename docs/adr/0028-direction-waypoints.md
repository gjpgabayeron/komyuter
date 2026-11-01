# ADR-0028: Direction waypoints — shaping points, snap modes and manual segments (DECIDED)

- **Status**: DECIDED — implementation not started; the schema change lands before the editor UI
- **Date**: 2026-10-30
- **Refines**: ADR-0011 (one base path, auto-derived return). **Amends**: ADR-0016 (its "no manual
  eye-trace tier" rule is narrowed, not removed). **Relates to**: ADR-0029 (the snapping engine must
  support through-points).

## Context

A Direction's geometry is produced by one operation: snap the stops, in order, to the road network.
Stops are the only anchors. That is sufficient for an ordinary corridor and insufficient everywhere
else — the road snap has no way to express "use the terminal's internal lane", "turn here, not one
street earlier", or "go around this block". Those are not exotic cases on a PUJ route; they are the
last hundred metres of almost every route.

The current workaround is to place an extra marker on the intended road and let it become a stop. It
works, which is why it was discovered, but it is a data-model leak: the fake stop enters `stop_order`,
becomes a graph node, appears in the commuter's stop list, and can receive an AR marker. A shaping
point and a boarding point are different things and must not share a row.

ADR-0016 pushes the other way: every persisted polyline must be road-snapped, with no manual tier,
because a fabricated chord can enter the authoritative graph. That rule is right about the danger and
too absolute about the remedy. Some roads a jeepney uses are absent from OSM; refusing to draw them
does not make the route correct, it makes it unplottable.

ADR-0011 adds a constraint: the return Direction is derived from the base on save. Any new anchor must
survive that derivation or the first save silently deletes it.

## Decision

1. **A Direction is an ordered list of Waypoints.** Each waypoint is either a **Stop Waypoint**, which
   references a Stop, or a **Via Point**, which carries only a coordinate and a purpose. Order is the
   direction of travel. The existing stop list is a projection of the Stop Waypoints, not a parallel
   structure.

2. **Via Points never become Stops.** They do not enter `stop_order`, the transit graph, the commuter's
   stop list, the AR marker set, or the stop-management UI. They exist to shape geometry.

3. **Snapping runs per segment, between consecutive Waypoints.** Not once for the whole chain. A segment
   is the unit of snapping, retry, caching and provenance, which also removes the significance of the
   current 25-coordinate chunk limit.

4. **Three snap modes, one rule.** Every segment is either road-verified or explicitly human-drawn:

   | Mode     | Meaning                                                                  | Graph   |
   | -------- | ------------------------------------------------------------------------ | ------- |
   | `auto`   | Snap between the two anchors.                                            | Normal  |
   | `pinned` | Snap **through** an exact coordinate (a Via Point on the intended road). | Normal  |
   | `manual` | Hand-drawn geometry, used only when the road network cannot express it.  | Flagged |

   `manual` is permitted for exactly two stated cases: terminal or depot access, and a road absent from
   the routing data. It requires a reason and an explicit acknowledgement, and its provenance is
   visible in the editor, the publish review, and the exported dataset.

5. **Nothing is silently converted.** A segment never flips from `manual` to `auto` or back without the
   plotter's action. A manual segment is never presented as road-verified, and an `auto` segment whose
   snap fails remains unsnapped and unsaveable (ADR-0029).

6. **The return Direction derives Waypoints, not just coordinates (ADR-0011).** On save, the return
   reverses the
   waypoint order, keeps Stop Waypoints as their own stop rows (as today), and carries Via Points
   across. A manual segment is mirrored only with the plotter's confirmation, because a mirrored
   hand-drawn path is a new claim about the return road, not a copy of the forward one.

7. **Restrictions reuse the same geometry language.** A Restriction is an interval of the polyline
   where boarding or alighting is not permitted; the editor that places Via Points also places and
   adjusts those intervals. No second model of "a piece of the path" is introduced.

8. **Validation is explicit and shared by save and publish.**
   - every Stop lies within a tolerance of the polyline;
   - every Stop Waypoint has a stable id;
   - the polyline stays inside the Service Area's tolerance (ADR-0026);
   - snapped length versus straight-line length is within a sanity ratio, catching a snap that takes a
     five-kilometre detour;
   - no duplicate consecutive vertices;
   - every `manual` segment has a reason and an acknowledgement.

9. **The server owns geometry; the client owns interaction.** The editor may preview and re-snap, but the
   persisted polyline is the server's answer, and the mobile app renders the final geometry without
   re-snapping anything.

10. **Stable stop ids are required before this ships (ADR-0031).** A Via Point references coordinates
    today, but Stop Waypoints reference stops; the save path regenerating stop ids on every save (the
    defect ADR-0020's context records) would break both the waypoint list and the review diff.

## Alternatives considered

- **Keep "add a fake stop" as the documented workaround.** Rejected: it corrupts four surfaces (order,
  graph, commuter list, AR) to solve one, and it makes route data depend on a UI habit nobody can
  validate.
- **Allow unrestricted freehand drawing.** Rejected: it invites plausible-but-wrong geometry, the exact
  failure ADR-0016 exists to prevent. Restricting `manual` to two named cases keeps the claim defensible.
- **Keep ADR-0016's absolute rule.** Rejected only for the two stated cases. Everything else stays
  road-verified.
- **Store the return as an independent polygon copy rather than deriving it.** Rejected: ADR-0011 already
  decided the derivation, and duplicating the corridor doubles the divergence surface.
- **Model Via Points as a separate "shaping line" entity layered over the route.** Rejected: two
  geometries that must agree is a consistency bug waiting to happen; one ordered waypoint list is the
  simpler invariant.
- **Let the mobile client re-snap for display.** Rejected: two devices would render two different roads,
  and the geometry the graph uses would stop being the geometry the commuter sees.

## Consequences

- **Positive**: the terminal lane, the missing OSM road and the wrong parallel street all become
  expressible without polluting the stop model.
- **Positive**: segment-wise snapping gives retry, provenance and caching per segment, and makes
  GPX-derived routes (M5) a natural input rather than a special case.
- **Trade-off**: the editor grows a mode (vertex), a gesture (insert waypoint), and a provenance badge.
  That is the real cost of the feature.
- **Trade-off**: existing Directions must be migrated to waypoint lists built from their current
  stop order. The migration is mechanical but must preserve stop ids and order exactly.
- **Risk**: a `manual` segment can still be wrong. The mitigation is visibility, not prevention:
  it is named, reasoned, reviewed and exported as manual.
- **Risk**: a pinned Via Point can move a snap onto a service road the graph cannot actually traverse.
  The length-ratio and graph-coverage checks catch the obvious cases; the rest is editorial judgement.
- **Risk**: return derivation now has semantics to preserve, not just geometry to reverse. It needs
  tests for via-point carry-over and for the manual-mirror confirmation.

## Non-goals (explicit)

- No arbitrary drawing mode, no freehand polygon/line tool for route geometry.
- No geometry merging between two divergent polylines (ADR-0020 still stands).
- No per-vertex collaborative editing or CRDT.
- No change to the `[lng, lat]` rule; waypoints use the same coordinate order everywhere (ADR-0013).
