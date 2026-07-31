# ADR-0001: Fare on graph edges is base-fare-on-board plus marginal, never exact-per-leg

The LTFRB fare (`base + rate×max(0, leg_km − base_km)`) is non-additive, so it cannot be a plain Dijkstra edge weight. We chose to charge a one-time base fare (₱13) on boarding into a route and marginal ₱1.80/km on route edges, and to always recompute the displayed fare exactly from each leg's true cumulative distance via `fareCalculator`.

The internal ranking cost is therefore overestimated by up to the "first 4km free" credit (₱7.20) per leg. We accepted this bounded, systematic bias to stay on plain additive Dijkstra. Rejected: exact leg-aware (label-correcting) Dijkstra, which is exact but adds substantial complexity and proof burden for a thesis; and per-edge independent fare, which double-counts the base fare per edge.

Because fare ≈ f(distance), Cheapest and Shortest rank identically on single-route journeys; they diverge only on multi-modal trade-offs. Evaluation task T3 ("switch to Cheapest → note a different route") therefore requires a deliberately chosen OD pair. An acceptance criterion for Increment 2: at least one seed-route OD pair where the Cheapest and Shortest profiles return different outputs, verified against the real graph before PSSUQ.
