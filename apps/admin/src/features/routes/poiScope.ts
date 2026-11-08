import type { CoordinatePair, GeocodeHit } from "@komyuter/shared";
import type { MapViewport, ViewportBounds } from "@/lib/plottingStore";
import type { CameraPadding } from "@/features/routes/workspace/geometry";
import { normalisePlaceName } from "./poiConfidence";

/**
 * How much larger than the screen the search area actually is.
 *
 * Measured: Mapbox's Search Box ignores `radius` *and* `bbox` on `/forward` (a
 * 2 km box still returned a mall 5 km outside it), so scoping to the camera has
 * to happen here, on coordinates we already hold. Slack keeps a hit that is
 * just off-screen from being hidden — the plotter is usually about to pan.
 */
export const SCOPE_SLACK = 2;

/** Fraction of the visible span the camera must travel to offer a re-search. */
export const AREA_SEARCH_THRESHOLD = 0.25;

/** Grows a bounds box around its centre by `factor`. */
export function expandBounds(
  bounds: ViewportBounds,
  factor: number = SCOPE_SLACK,
): ViewportBounds {
  const centreLng = (bounds.west + bounds.east) / 2;
  const centreLat = (bounds.south + bounds.north) / 2;
  const halfLng = ((bounds.east - bounds.west) * factor) / 2;
  const halfLat = ((bounds.north - bounds.south) * factor) / 2;
  return {
    west: centreLng - halfLng,
    east: centreLng + halfLng,
    south: centreLat - halfLat,
    north: centreLat + halfLat,
  };
}

/**
 * The part of the reported viewport the plates leave uncovered.
 *
 * The map's bounds describe the whole full-bleed canvas; the visible region is
 * that box minus the pixel insets the layout reserves on each side. Pixel
 * fractions are linear in Web Mercator at a given zoom, which is all this
 * scope needs. A degenerate measurement (gutter wider than the canvas) returns
 * the full box rather than hiding every hit.
 */
export function visibleBounds(
  viewport: MapViewport,
  padding: CameraPadding,
): ViewportBounds {
  const { bounds, width, height } = viewport;
  if (!(width > 0) || !(height > 0)) return bounds;
  const lngSpan = bounds.east - bounds.west;
  const latSpan = bounds.north - bounds.south;
  const west = bounds.west + (lngSpan * padding.left) / width;
  const east = bounds.east - (lngSpan * padding.right) / width;
  const south = bounds.south + (latSpan * padding.bottom) / height;
  const north = bounds.north - (latSpan * padding.top) / height;
  if (west >= east || south >= north) return bounds;
  return { west, east, south, north };
}

/** Centre of a bounds box, as the store's coordinate form. */
export function boundsCentre(bounds: ViewportBounds): {
  longitude: number;
  latitude: number;
} {
  return {
    longitude: (bounds.west + bounds.east) / 2,
    latitude: (bounds.south + bounds.north) / 2,
  };
}

/**
 * Keeps the hits that are near what the plotter can actually see.
 *
 * `region` is the visible map region — the viewport minus the plates — not the
 * full canvas. Two rules, both deliberate:
 * - a hit whose name *is* the query always survives, so "plot a stop across
 *   town" still works while the camera is somewhere else;
 * - with no camera reported yet, nothing is hidden rather than everything.
 */
export function scopeHits(
  query: string,
  hits: GeocodeHit[],
  region: ViewportBounds | null,
): GeocodeHit[] {
  if (!region) return hits;
  const box = expandBounds(region);
  const wanted = normalisePlaceName(query);
  return hits.filter((hit) => {
    if (wanted !== "" && normalisePlaceName(hit.name) === wanted) return true;
    const [lng, lat] = hit.location;
    return (
      lng >= box.west && lng <= box.east && lat >= box.south && lat <= box.north
    );
  });
}

/** Pin pixel size for a zoom level: bigger as you zoom in, clamped both ways. */
export function pinSizeForZoom(
  zoom: number | null | undefined,
  base = 34,
  minPx = 28,
  maxPx = 52,
): number {
  if (zoom === null || zoom === undefined || !Number.isFinite(zoom))
    return base;
  return Math.round(Math.min(maxPx, Math.max(minPx, base + (zoom - 13) * 3)));
}

/** Candidate pins to draw: the picked place has its own marker, so its pin is
 *  excluded — otherwise two markers stack on one coordinate. */
export function candidatesToDraw(
  hits: GeocodeHit[],
  selectedId: string | null,
): GeocodeHit[] {
  return selectedId === null
    ? hits
    : hits.filter((hit) => hit.id !== selectedId);
}

/** Radius kept around the anchor hit on a session's first query. */
export const CLUSTER_RADIUS_METERS = 2000;

/** Rough metres between two `[lng, lat]` points — equirectangular is plenty here. */
export function distanceMeters(a: CoordinatePair, b: CoordinatePair): number {
  const meanLatRad = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const deltaLng = (b[0] - a[0]) * 111_320 * Math.cos(meanLatRad);
  const deltaLat = (b[1] - a[1]) * 110_540;
  return Math.hypot(deltaLng, deltaLat);
}

/**
 * First-query scope: the cluster of hits nearest the camera.
 *
 * The opening camera is a city view, so filtering the first answer to the
 * viewport is backwards — it hides the very place being typed. Instead the
 * answer anchors on the hit closest to the camera and keeps that neighbourhood,
 * which drops the far-away namesakes a loose query drags in without losing the
 * local ones. The anchor itself and an exact name match always survive, so a
 * deliberate "plot a stop across town" still works on the first try.
 *
 * Later queries in the same session are viewport-scoped (`scopeHits`): by then
 * the plotter has results on screen and is narrowing them.
 */
export function scopeToNearestCluster(
  query: string,
  hits: GeocodeHit[],
  centre: { longitude: number; latitude: number } | null,
  radiusMeters: number = CLUSTER_RADIUS_METERS,
): GeocodeHit[] {
  if (hits.length === 0) return [];
  if (!centre) return hits;

  const camera: CoordinatePair = [centre.longitude, centre.latitude];
  const anchor = hits.reduce((best, hit) =>
    distanceMeters(hit.location, camera) < distanceMeters(best.location, camera)
      ? hit
      : best,
  );
  const wanted = normalisePlaceName(query);
  return hits.filter(
    (hit) =>
      hit.id === anchor.id ||
      (wanted !== "" && normalisePlaceName(hit.name) === wanted) ||
      distanceMeters(hit.location, anchor.location) <= radiusMeters,
  );
}

/**
 * Should "Search this area" be offered?
 *
 * Only once the camera has moved a meaningful share of the screen since the
 * search that produced the current results — otherwise the button would be a
 * no-op most of the time it was visible.
 */
export function shouldOfferAreaSearch(
  viewport: MapViewport | null,
  lastSearchCentre: { longitude: number; latitude: number } | null,
): boolean {
  if (!viewport || !lastSearchCentre) return false;
  const spanLng = Math.abs(viewport.bounds.east - viewport.bounds.west);
  const spanLat = Math.abs(viewport.bounds.north - viewport.bounds.south);
  if (!Number.isFinite(spanLng) || !Number.isFinite(spanLat)) return false;
  const movedLng = Math.abs(viewport.longitude - lastSearchCentre.longitude);
  const movedLat = Math.abs(viewport.latitude - lastSearchCentre.latitude);
  return (
    movedLng > spanLng * AREA_SEARCH_THRESHOLD ||
    movedLat > spanLat * AREA_SEARCH_THRESHOLD
  );
}
