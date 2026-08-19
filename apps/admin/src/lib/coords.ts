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

/** The distance (meters) within which two stops count as "closing" a route
 *  loop (FR-004) — shared by the snap waypoint closure, the chain closure,
 *  and the transient stub logic so the three never disagree. */
export const LOOP_CLOSE_TOLERANCE_METERS = 150;

/** True when the polyline's last coordinate lies within `LOOP_CLOSE_TOLERANCE_METERS`
 *  of `point` (FR-004 closed-loop detection; mirrors the server's endpoint rule). */
export function polylineClosesOn(
  polyline: GeoLineString | null | undefined,
  point: CoordinatePair,
  toleranceMeters = LOOP_CLOSE_TOLERANCE_METERS,
): boolean {
  if (!polyline || polyline.coordinates.length < 3) return false;
  return (
    coordsDistanceMeters(
      polyline.coordinates[polyline.coordinates.length - 1],
      point,
    ) <= toleranceMeters
  );
}

/**
 * Splits a polyline into the contiguous runs that genuinely DIVERGE from
 * another polyline (every vertex further than `thresholdMeters` from the
 * other line). The overview uses this to render the derived return direction
 * ONLY where it leaves the base corridor — on shared stretches the return is
 * an exact reverse (redundant), so drawing it there would split the route
 * into two parallel lines. Runs shorter than two vertices are dropped.
 * Returns [] when nothing diverges (fully coincident pair).
 */
export function divergingSegments(
  coordinates: readonly CoordinatePair[],
  overlapWith: readonly CoordinatePair[],
  thresholdMeters = 20,
): CoordinatePair[][] {
  const runs: CoordinatePair[][] = [];
  let current: CoordinatePair[] = [];
  const flush = () => {
    if (current.length >= 2) runs.push(current);
    current = [];
  };
  for (const point of coordinates) {
    const coincides = overlapWith.some(
      (other) => coordsDistanceMeters(point, other) <= thresholdMeters,
    );
    if (coincides) {
      flush();
    } else {
      current.push([...point] as CoordinatePair);
    }
  }
  flush();
  return runs;
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
 * visible polyline between stops whenever the road-following path is not
 * available yet (no token, upstream error, snap still in flight). Returns null
 * with fewer than 2 points.
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

/**
 * Resolves which connecting line to draw between stops (FR-006): before a
 * committed path exists, a straight client-side fallback keeps the map from
 * looking blank (FR-009 — never persisted); once the committed road-snapped
 * draft exists it is drawn separately by the caller, so nothing connects.
 */
export function resolveConnectingLine(
  polyline: GeoLineString | null,
  stopLocations: readonly CoordinatePair[],
  forceChainLine = false,
): GeoLineString | null {
  // The chain no longer matches the committed road path (a connection rewire
  // whose re-snap hasn't landed — or failed): when every chain stop is still
  // covered by the old path no corrective stub would ever draw, so draw the
  // chain's straight line immediately. The auto-committed snap replaces it.
  const newest = stopLocations[stopLocations.length - 1];
  // Whether the newest stop sits within the loop-close tolerance of ANY path
  // vertex — the single coverage judgment shared by every branch below.
  const covered =
    newest !== undefined &&
    polyline !== null &&
    polyline.coordinates.some(
      (vertex) =>
        coordsDistanceMeters(vertex, newest) <= LOOP_CLOSE_TOLERANCE_METERS,
    );
  if (forceChainLine && covered) {
    return straightLineThrough(stopLocations);
  }
  // Before any path exists (first placements / snap still in flight), a
  // transient straight line keeps the map from looking blank — never saved.
  if (!polyline) return straightLineThrough(stopLocations);
  // A committed path exists but the newest stop is not yet covered by it
  // (just placed / dragged beyond the path): extend a short transient stub
  // from the path end to that stop so placements connect visually IMMEDIATELY
  // — the auto-committed snap replaces the stub when it lands (perf/UX audit:
  // no more "stop appears, line lags"). The stub is display-only, never
  // persisted. Coverage is judged against the NEAREST path vertex, not the
  // path end, so a closed loop never draws a stub: its final stop sits
  // mid-loop, far from the loop's end vertex (== its start), but is covered.
  if (!newest) return null;
  if (covered) return null;
  const last = polyline.coordinates[polyline.coordinates.length - 1];
  if (!last) return null;
  return { type: "LineString", coordinates: [last, newest] };
}

/** Formats meters as "1,234 m" or "1.23 km" per the chosen unit. */
export function formatDistance(meters: number, unit: "m" | "km"): string {
  if (unit === "km") {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${Math.round(meters).toLocaleString()} m`;
}

/**
 * True when EVERY stop lies within `toleranceMeters` of the polyline.
 *
 * Auto-commit keeps the committed path in lockstep with the stops, so this
 * only fails on genuinely inconsistent drafts — a partial undo that popped the
 * path change but not the stop edit, or a snap failure that left a stale path.
 * Save blocks on it rather than persist mismatched route data (the server only
 * checks endpoints).
 */
export function pathCoversStops(
  polyline: GeoLineString,
  stops: readonly { location: CoordinatePair }[],
  toleranceMeters = 150,
): boolean {
  return stops.every((stop) => {
    const index = nearestCoordIndex(stop.location, polyline.coordinates);
    if (index < 0) return false;
    return (
      coordsDistanceMeters(polyline.coordinates[index], stop.location) <=
      toleranceMeters
    );
  });
}
