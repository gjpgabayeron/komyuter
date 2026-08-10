# ADR-0013: Admin map is MapLibre GL + Mapbox services (ACCEPTED)

`TECHSTACK.md`/`SUMMARY.md` disagreed on Mapbox GL JS vs Leaflet for the admin dashboard; ADR-0007 chose Leaflet to avoid a Mapbox API key. The product meanwhile standardized on Mapbox elsewhere (mobile uses `@rnmapbox/maps`), and PostGIS/GeoJSON use `[lng, lat]` natively. We chose a **split renderer/services architecture**:

- **Renderer**: **MapLibre GL JS** (open-source, BSD-3) via `react-map-gl` (maplibre entry), in dev and prod.
- **Tiles**: Mapbox **vector tiles** when `MAPBOX_PUBLIC_TOKEN` is set; otherwise OSM **raster** fallback (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`) with a dev-mode indicator, so `pnpm dev` works with no Mapbox account.
- **Road snapping**: Mapbox **Directions API** (`driving`, `geometries=geojson&overview=full`), proxied server-side.
- **Geocoding**: Mapbox **Geocoding API**, proxied server-side.
- **Future map-matching**: Mapbox **Matching API**, server-side only; does not affect the renderer choice.

**Key constraints**:

- All Mapbox calls MUST go through the Fastify backend (`/api/admin/mapbox/*`) with a **server-side secret token**; the browser token (tiles) is restrictively scoped to the admin domain. The proxy enforces the admin auth guard + `{ success, data | error }` envelope.
- `duration` from Directions is **stripped at the proxy** — never surfaced (ADR-0009).
- `[lng, lat]` is the **sole** coordinate format in the admin UI — no conversion layer. This **supersedes ADR-0007's Leaflet exception** (MapLibre consumes `[lng, lat]` natively); the coordinate rule itself is retained and strengthened. The single most dangerous pitfall is unchanged: a swapped pair puts stops in the ocean.
- Directions waypoint limit 25 (`optimize=false`); longer routes chunk the preview request; snap-preview calls are debounced 500 ms; Map Matching capped at 50/day/admin (soft).
- Dev fallback: missing tokens → mock straight-line snapping + empty geocoding + logged warning.

Rationale: keeping the renderer open-source (BSD-3) while aligning the admin's _services_ with the vendor the rest of the product already uses; `[lng, lat]` everywhere means no converter layer to get wrong. Requires doc reconciliation in `AGENTS.md`, `CONTEXT.md`, `ADMIN.md`, and the constitution's spatial-constraints section (ADR-0007's Leaflet text is stale).
