import type { GeocodeHit } from "@komyuter/shared";

/** "640 m" / "1.7 km" — the distance Mapbox measured from the search centre. */
export function formatDistance(
  meters: number | null | undefined,
): string | null {
  if (meters === null || meters === undefined || !Number.isFinite(meters)) {
    return null;
  }
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * The one-line meta summary under a result row, e.g. `"park · 1.0 km"`.
 *
 * Both parts are optional in the wire data — Mapbox omits `poi_category` for
 * some places and `distance` when it has no origin to measure from — so the
 * line degrades to whatever is known, and to an empty string when nothing is.
 */
export function poiMetaLine(
  hit: Pick<GeocodeHit, "category" | "distanceMeters">,
): string {
  return [hit.category ?? null, formatDistance(hit.distanceMeters)]
    .filter((part): part is string => typeof part === "string" && part !== "")
    .join(" · ");
}
