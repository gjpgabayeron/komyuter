# ADR-0029: Open routing and geocoding stack — remove Mapbox from the critical path (DECIDED)

- **Status**: DECIDED — implementation not started
- **Date**: 2026-10-30
- **Supersedes**: ADR-0013's services half (Mapbox Directions, Geocoding and Matching as the upstream)
  and ADR-0016's requirement for `MAPBOX_SECRET_TOKEN`. ADR-0016's no-fabricated-geometry decision is
  kept. **Relates to**: ADR-0028 (through-points and manual segments), ADR-0010 (one region).

## Context

Mapbox is not in the renderer. Tiles already come from OpenFreeMap, and the admin has never needed a
Mapbox tile token. Mapbox is exactly two server-side upstreams behind one proxy module:

- `GET /api/admin/mapbox/directions` — snap a plotted path to the road network;
- `GET /api/admin/mapbox/geocode` — Search Box `/forward`, which supplies POI names, categories,
  distance, opening hours, phone and website.

The browser never talks to Mapbox; the secret token is server-only and optional. That is the useful
fact: the proxy is already the seam, so removing the vendor is an adapter swap plus a path rename, not
a client rewrite.

Three problems make the removal worth doing now.

**The fallback fabricates geometry.** When the token is absent or the upstream fails, the proxy returns
a straight line with `snapped: false`. The admin draws it as a connecting line, but a transient 5xx can
therefore produce a chord that a plotter saves into `base_polyline` — the authoritative graph. ADR-0016
was written to end exactly this.

**Persistence is a licensing question, not just a cost question.** Snapped geometry is stored as the
route's polyline and becomes routing data. Relying on a proprietary service for a value the system
keeps forever deserves an explicit decision, especially for a thesis that will be examined.

**The workload is small.** One region, tens of routes, a handful of plotters, and a 500 ms debounce.
A city routing graph is a few hundred megabytes of memory. A hosted global router is not required to
serve it.

## Decision

1. **Provider interfaces, selected by environment.** The server gains `RoutingProvider` and
   `GeocodingProvider`. The existing Mapbox implementation becomes one provider behind the interface;
   the environment chooses the active one. No feature code names a vendor.

2. **Valhalla is the primary routing engine; OSRM is the fallback; GraphHopper is an acceptable third.**
   Valhalla earns the primary slot because `type: "through"` is exactly ADR-0028's pinned waypoint and
   `exclude_polygons` maps onto Restrictions, and because `shape_match: "map_snap"` is the M5 GPX
   import. OSRM is the minimal implementation if Valhalla's setup fights the schedule. Neither is
   required to provide traffic, ETA or turn-by-turn instructions; those are stripped or never
   requested.

3. **Place search has two acceptable providers behind one interface.** The seam is fixed; the
   implementation is not. The repository default is a **PostGIS-native place index** built from the same
   OSM extract as the routing engine. **Photon** is the turnkey alternative. **Nominatim** supplies
   selected-hit detail in either case. The trade-offs are recorded in _Place-search provider options_
   below. `GeocodeHit`'s optional fields already model absence, so a missing tag is a blank row, not a
   broken contract.

4. **The public surface is renamed, and the old one is aliased for one release.**
   `GET /api/admin/snap` and `GET /api/admin/geocode` keep the current query shape and the
   `{ success, data | error }` envelope. `/api/admin/mapbox/*` remains as a deprecated alias until the
   admin and its tests move, then is deleted with the provider.

5. **The straight-line fallback is deleted.** An unavailable upstream returns
   `{ snapped: false, polyline: null, warning: "upstream_error" }`; the admin shows the pending dashed
   line it already has. Geometry that is not road-verified — and not an explicit, reasoned `manual`
   segment under ADR-0028 — is never saveable.

6. **Duration and instructions are never surfaced.** The adapter drops `duration`, `steps` and
   `alternatives` at the boundary. ADR-0009 is unaffected by which engine answers.

7. **The adapter is the only place coordinate order may flip.** Valhalla's JSON is `lat,lon`, OSRM's URL
   is `lon,lat`, and this codebase is `[lng,lat]` everywhere (ADR-0013). The conversion lives in the
   provider and has its own test, because a swapped pair puts stops in the ocean.

8. **The routing engine runs as a private service, not a public API.** It sits beside the admin server
   on the private network, unauthenticated and unexposed; the admin proxy keeps its auth guard. The OSM
   extract is clipped to the ADR-0010 region, rebuilt on a stated cadence, and its date and hash are
   exposed by a status endpoint so a stale graph is visible.

9. **pgRouting is a validator, not the routing service.** `pgr_findCloseEdges` and `pgr_withPoints` live
   in the PostGIS instance the system already runs, and answer "does this polyline lie on the road
   graph?" at save and publish time. Building the primary snapping service on pgRouting would mean
   reimplementing routing, geometry aggregation and turn handling in SQL for no benefit.

10. **Mapbox is removed completely.** The token variable, the vendor-specific constants, the module name
    and the `/mapbox/*` paths all go. ADR-0016's token requirement becomes moot; its rejection of
    fabricated geometry is retained and strengthened.

11. **OSM attribution is added** to the admin footer and the mobile About surface, next to OpenFreeMap's.
    The routing data source is named wherever the map data is credited.

### Place-search provider options

The decision above fixes the interface, not the store. For this single-region thesis the default
`GeocodingProvider` is a **PostGIS-native place index** built from the same OSM extract the router uses:

- a `places` table of POIs, addresses and transport names, carrying `tsvector` for full-text search, a
  `pg_trgm` GIN index for fuzzy names, and a GiST geometry index;
- `ST_Covers(service_area, location)` as the scope filter, so the polygon (ADR-0026) is the rule rather
  than a rectangle;
- ranking from text rank, name similarity, category and distance, all inspectable in SQL;
- opening hours, phone and website read from the same OSM tags, so no second service is introduced;
- the same subset exported into the mobile dataset for offline stop and route search.

**Photon remains the turnkey alternative** behind the same interface. It provides `bbox`,
`lat`/`lon` bias, repeatable `osm_tag` filters, `lang`, `limit`, street deduplication and GeoJSON
features. Its cost is a second service built on Elasticsearch/OpenSearch with a substantial memory
floor. Choose it when ranking quality and address coverage outweigh operating another store. Do not run
both stores: two indexes drift, and only one can be authoritative.

**Nominatim is a detail lookup, never the autocomplete front door.** Self-hosted, it supplies
`extratags` for the one hit a plotter selects. Its usage policy forbids pointing public autocomplete
traffic at a shared instance, so it is self-hosted or absent.

The adapter contract is unchanged either way: both providers produce `GeocodeHit` values, the browser
still calls the same-origin proxy, and no client code knows which provider answered.

## Alternatives considered

- **Keep Mapbox Directions and only remove the mobile dependency.** Rejected: it leaves the token, the
  billing, the licensing question and the fabricated fallback in the critical path, and the mobile app
  never had Mapbox anyway.
- **Use a hosted OSM router (Stadia, OpenRouteService, Geoapify) permanently.** A legitimate stopgap and
  a good fallback behind the same adapter, but it replaces one vendor with another and weakens the
  "open stack end to end" claim. Acceptable for one release, not as the final decision.
- **Build snapping on pgRouting.** Rejected as the primary service for the reasons above; retained as
  the validator, where it is genuinely well suited.
- **Snap in the browser.** Rejected: geometry would stop being server-authoritative, two plotters could
  produce different roads from the same stops, and the graph would depend on a client version.
- **Keep the straight-line fallback as a development convenience.** Rejected: it is the exact failure
  ADR-0016 identifies, and a city extract removes the "no token, no service" condition that motivated
  it.

## Consequences

- **Positive**: no Mapbox account, token, quota or billing anywhere; the whole stack — tiles, renderer,
  router, geocoder — is open and reproducible at defense time.
- **Positive**: through-points, avoid-polygons and map matching become available, which are precisely
  the capabilities ADR-0028 and M5 need and which the previous vendor capped or charged for.
- **Positive**: latency improves (in-region container rather than a global API) and the failure mode
  becomes visible instead of silently fabricating a chord.
- **Trade-off**: one more service to operate. A city extract keeps it small, but it is still a
  deployment, a health check and a data-refresh chore.
- **Risk**: OSM coverage in Iloilo is thinner than the proprietary data, especially on minor lanes and
  terminal access roads. The mitigation is ADR-0028's pinned and manual segments, not pretending the
  data is equal.
- **Risk**: self-hosted geocoding ranks POIs worse than a commercial search product. Photon's OSM tags
  are the honest ceiling; the UI must degrade gracefully and the thesis must say so.
- **Risk**: a routing container that is down during a demo. The pending-unsnapped state keeps the admin
  usable, and the golden-route set gives a quick health check.

## Non-goals (explicit)

- No turn-by-turn navigation, traffic, or ETA; ADR-0009 still governs output.
- No public routing API and no global coverage; the engine serves one region behind the admin proxy.
- No self-hosted tile stack in this decision — OpenFreeMap remains the basemap, and a PMTiles/Protomaps
  alternative stays a separate decision (M5).
- No change to the client's coordinate rule or to the API envelope.
