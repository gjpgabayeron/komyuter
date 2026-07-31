# ADR-0002: Min-max normalization uses per-edge-type pools, clamped to [0,1]

We normalize each weight (distance, fare, walk, transfer) against its own min/max over the static graph only, and clamp every normalized value to [0,1]. Transfer-edge `distance` is set to 0 to avoid double-counting walk distance.

Rationale: graph-wide min/max lets a single outlier edge squash all other values toward 0, collapsing profile distinctions; per-request min/max would make "Cheapest" drift between requests; virtual edges exceeding static max would break the [0,1] invariant that Dijkstra optimality relies on. Per-pool pools keep walk and transfer penalties at full scale and keep normalization deterministic across requests.
