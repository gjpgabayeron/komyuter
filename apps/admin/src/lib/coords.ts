import type { CoordinatePair, GeoLineString } from "@komyuter/shared";

/** Parses a "lng,lat" string into a coordinate pair. Throws on malformed input. */
export function parseCoordinatePair(input: string): CoordinatePair {
  const [lngRaw, latRaw] = input.split(",").map((part) => part.trim());
  const lng = Number(lngRaw);
  const lat = Number(latRaw);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    throw new Error(`Invalid coordinate pair: ${input}`);
  }
  return [lng, lat];
}

/** Loose equality of two [lng, lat] pairs within an epsilon (default ~1e-9). */
export function coordinatesEqual(
  a: CoordinatePair,
  b: CoordinatePair,
  epsilon = 1e-9,
): boolean {
  return Math.abs(a[0] - b[0]) <= epsilon && Math.abs(a[1] - b[1]) <= epsilon;
}

/**
 * Index of the polyline vertex nearest to `point` (squared-degree distance),
 * or -1 when no vertex is within `maxDistanceDeg`. Used to snap stop drags
 * and clicked points back onto the drawn path.
 */
export function nearestCoordIndex(
  point: CoordinatePair,
  line: readonly CoordinatePair[],
  maxDistanceDeg = 0.005,
): number {
  let bestIndex = -1;
  let bestDistanceSq = Number.POSITIVE_INFINITY;
  for (let i = 0; i < line.length; i++) {
    const dx = line[i][0] - point[0];
    const dy = line[i][1] - point[1];
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      bestIndex = i;
    }
  }
  return bestDistanceSq <= maxDistanceDeg * maxDistanceDeg ? bestIndex : -1;
}

/** Haversine great-circle distance between two [lng, lat] points, in meters. */
export function coordsDistanceMeters(
  a: CoordinatePair,
  b: CoordinatePair,
): number {
  const earthRadiusMeters = 6_371_000;
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(h));
}

/**
 * Client-side save pre-validation (mirrors the server's ≈100 m rule): the
 * plotted path must start and end on a stop (FR-017); a loop ending on the
 * start stop is allowed (FR-004).
 */
export function pathEndsOnStops(
  polyline: GeoLineString,
  stops: readonly { location: CoordinatePair }[],
  toleranceMeters = 100,
): { ok: true } | { ok: false; reason: "start" | "end" } {
  const coordinates = polyline.coordinates;
  if (coordinates.length === 0 || stops.length < 2) {
    return { ok: false, reason: "start" };
  }
  if (
    coordsDistanceMeters(coordinates[0], stops[0].location) > toleranceMeters
  ) {
    return { ok: false, reason: "start" };
  }
  if (
    coordsDistanceMeters(
      coordinates[coordinates.length - 1],
      stops[stops.length - 1].location,
    ) > toleranceMeters &&
    coordsDistanceMeters(
      coordinates[coordinates.length - 1],
      stops[0].location,
    ) > toleranceMeters
  ) {
    // A loop ends on the START stop, so the end may match either the last or
    // the first stop (FR-004).
    return { ok: false, reason: "end" };
  }
  return { ok: true };
}

/**
 * Straight connecting line through ordered points (FR-009 fallback): keeps a
 * visible polyline between stops whenever the road-following preview is not
 * available yet (no token, upstream error, before Apply). Returns null with
 * fewer than 2 points.
 */
export function straightLineThrough(
  points: readonly CoordinatePair[],
): GeoLineString | null {
  if (points.length < 2) return null;
  return { type: "LineString", coordinates: [...points] };
}

/** Exact length of a polyline in meters (haversine over consecutive pairs). */
export function polylineDistanceMeters(polyline: GeoLineString): number {
  let total = 0;
  for (let i = 1; i < polyline.coordinates.length; i++) {
    total += coordsDistanceMeters(
      polyline.coordinates[i - 1],
      polyline.coordinates[i],
    );
  }
  return total;
}

/** Formats meters as "1,234 m" or "1.23 km" per the chosen unit. */
export function formatDistance(meters: number, unit: "m" | "km"): string {
  if (unit === "km") {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${Math.round(meters).toLocaleString()} m`;
}
