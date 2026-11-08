# ADR-0007: Admin dashboard map is Leaflet, not Mapbox GL

> ⛔ **SUPERSEDED** by [ADR-0013](./0013-admin-maplibre-mapbox.md) (2026-08-19). The admin map is now **MapLibre GL JS + Mapbox services** with `[lng, lat]` handled natively and **no conversion layer**. The Leaflet `[lat, lng]` exception and its `toGeoJSONPoint`/`fromGeoJSONPoint` converter below describe the _old_, retired design — **do not follow them**. The single dangerous pitfall this ADR warned about is eliminated by using `[lng, lat]` everywhere, so no converter module is built.

`TECHSTACK.md` specified Mapbox GL JS + `@mapbox/mapbox-gl-draw` for the admin dashboard; `SUMMARY.md` specified Leaflet + Leaflet Draw. We chose **Leaflet + Leaflet Draw** to avoid requiring a Mapbox API key in the admin app and to avoid relying on a freemium platform.

Consequences: Leaflet is the one [lat,lng] exception in the codebase. All polyline drawing happens in Leaflet's [lat,lng], converted to GeoJSON [lng,lat] exactly at the admin boundary before anything touches PostGIS/the API — never silently. This is the single most dangerous pitfall in the codebase and must stay documented (AGENTS.md) and handled at one conversion point. To enforce this, `apps/admin` gets a single tested converter module (`toGeoJSONPoint`/`fromGeoJSONPoint`) used in every save/load path, so no one hand-writes a lat/lng↔lng/lat conversion.

_See [ADR-0013](./0013-admin-maplibre-mapbox.md) for the superseding decision._
