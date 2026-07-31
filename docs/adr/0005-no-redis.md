# ADR-0005: No Redis — graph is built in-memory and rebuilt eagerly on mutation

`TECHSTACK.md` and `BACKEND.md` prescribed an Upstash Redis graph cache (serialize on build, hydrate on restart, dirty-flag invalidation). At thesis scale (10–12 routes, ~100–200 stops) a full graph rebuild takes milliseconds — cheaper than a round-trip to Redis — so we build the graph in memory on startup and rebuild eagerly on any route/stop/fare mutation. Correctness is unchanged (no stale-cache window), with fewer moving parts and no external service.

The `GET /api/graph/status` endpoint remains as the debug/demo surface. Redis references are removed from the stack docs, and `ioredis` is dropped as a dependency.

Consequently there are no `graph_nodes`/`graph_edges` database tables (`SUMMARY.md` §10 listed them). The graph is always derived from routes, stops, directions, and fare configs — persisting it would create a second source of truth that drifts out of sync. `SUMMARY.md`'s schema table is corrected accordingly.
