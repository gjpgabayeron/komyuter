# ADR-0007: Admin dashboard map is Leaflet, not Mapbox GL

`TECHSTACK.md` specified Mapbox GL JS + `@mapbox/mapbox-gl-draw` for the admin dashboard; `SUMMARY.md` specified Leaflet + Leaflet Draw. We chose **Leaflet + Leaflet Draw** to avoid requiring a Mapbox API key in the admin app and to avoid relying on a freemium platform.

Consequences: Leaflet is the one [lat,lng] exception in the codebase. All polyline drawing happens in Leaflet's [lat,lng], converted to GeoJSON [lng,lat] exactly at the admin boundary before anything touches PostGIS/the API — never silently. This is the single most dangerous pitfall in the codebase and must stay documented (AGENTS.md) and handled at one conversion point. To enforce this, `apps/admin` gets a single tested converter module (`toGeoJSONPoint`/`fromGeoJSONPoint`) used in every save/load path, so no one hand-writes a lat/lng↔lng/lat conversion.
