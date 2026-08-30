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

/**
 * Client-side snap tolerance for detour entry/exit — mirrors the server's
 * DETOUR_ON_LINE_TOLERANCE_METERS (30 m) so a snapped point always passes the
 * FR-023 gate (SC-014).
 */
export const DEFAULT_DETOUR_SNAP_TOLERANCE_METERS = 30;

/** A point projected onto a polyline segment (FR-010/FR-018 snap result). */
export interface ProjectedPoint {
  coordinate: CoordinatePair;
  /** Leading vertex index of the segment the point landed on; for a tap that
   *  coincides with a vertex, that vertex's own index (so a replaced arc
   *  starts exactly there and never over/under-counts a segment). */
  index: number;
  /** Clamped 0..1 position along the snapped segment (t), for ordering two
   *  taps that land on the same segment. */
  fraction: number;
  distanceMeters: number;
}

/**
 * Projection of a point onto the polyline using haversine point-to-segment
 * math (mirrors the server's distanceToSegment engine). Returns the snapped
 * coordinate, the leading vertex index of the snapped segment, and the true
 * distance in meters — or null when every segment is farther than
 * `maxDistanceMeters`. This is used to snap a detour's entry/exit from a map
 * click; nearestCoordIndex is vertex-only and cannot express a point that
 * falls along a segment.
 */
export function projectPointOnPolyline(
  point: CoordinatePair,
  line: readonly CoordinatePair[],
  maxDistanceMeters = DEFAULT_DETOUR_SNAP_TOLERANCE_METERS,
): ProjectedPoint | null {
  let best: {
    coordinate: CoordinatePair;
    index: number;
    fraction: number;
    distanceMeters: number;
  } | null = null;
  for (let index = 1; index < line.length; index++) {
    const { coordinate, fraction, distanceMeters } = distanceToSegment(
      point,
      line[index - 1],
      line[index],
    );
    if (!best || distanceMeters <= best.distanceMeters) {
      best = { coordinate, index: index - 1, fraction, distanceMeters };
    }
  }
  if (!best || best.distanceMeters > maxDistanceMeters) return null;

  // A tap exactly on a vertex belongs to that vertex itself (not to the
  // segment leading into it): the replaced base arc then starts/ends exactly
  // there, and the last vertex keeps its true (len-1) index.
  for (let vertexIndex = 0; vertexIndex < line.length; vertexIndex++) {
    if (coordsDistanceMeters(point, line[vertexIndex]) < 1e-6) {
      return {
        coordinate: line[vertexIndex],
        index: vertexIndex,
        fraction: vertexIndex === line.length - 1 ? 1 : 0,
        distanceMeters: 0,
      };
    }
  }
  return best;
}

/**
 * Haversine point-to-segment projection (mirrors the server's
 * distanceToSegment engine) returning the snapped coordinate, the clamped
 * fraction t, and the true distance in meters.
 */
function distanceToSegment(
  point: CoordinatePair,
  a: CoordinatePair,
  b: CoordinatePair,
): { coordinate: CoordinatePair; fraction: number; distanceMeters: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  let t = 0;
  if (lengthSq > 0) {
    t = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));
  }
  const coordinate: CoordinatePair = [a[0] + t * dx, a[1] + t * dy];
  return {
    coordinate,
    fraction: t,
    distanceMeters: coordsDistanceMeters(point, coordinate),
  };
}

/**
 * Sum of the haversine segment lengths between `startIndex` and `endIndex`
 * of a polyline — the base-arc length a detour replaces, used to derive the
 * exact additional distance (FR-011) instead of approximating from the loop.
 */
export function polylineSegmentLength(
  line: GeoLineString,
  startIndex: number,
  endIndex: number,
): number {
  const coords = line.coordinates;
  if (
    startIndex < 0 ||
    endIndex < 0 ||
    startIndex > endIndex ||
    endIndex >= coords.length
  ) {
    throw new RangeError(
      `polylineSegmentLength slice [${startIndex}, ${endIndex}] is invalid for ${coords.length} coordinates`,
    );
  }
  let meters = 0;
  for (let index = startIndex; index < endIndex; index++) {
    meters += coordsDistanceMeters(coords[index], coords[index + 1]);
  }
  return meters;
}

/**
 * The exact base-arc length a detour replaces: from the ENTRY POSITION (a
 * fraction along its segment) to the EXIT POSITION. Unlike the vertex-sliced
 * polylineSegmentLength, this honours fractional projections, so entry/exit
 * snapped mid-segment never over-count the replaced arc (FR-011 exactness).
 * Callers guarantee travel order (exit after entry) beforehand; out-of-order
 * or same-position pairs return 0 defensively.
 */
export function replacedArcLengthMeters(
  line: GeoLineString,
  entry: { index: number; fraction: number },
  exit: { index: number; fraction: number },
): number {
  const coords = line.coordinates;
  // The last vertex has no outgoing segment — a point exactly there
  // contributes zero head/tail (its fractional coverage is handled by the
  // clamp below, so terminal-vertex entry/exit never index past the array).
  const segmentLength = (index: number) =>
    index + 1 < coords.length
      ? coordsDistanceMeters(coords[index], coords[index + 1])
      : 0;
  if (
    exit.index < entry.index ||
    (exit.index === entry.index && exit.fraction <= entry.fraction)
  ) {
    return 0;
  }
  if (exit.index === entry.index) {
    return (exit.fraction - entry.fraction) * segmentLength(exit.index);
  }
  let meters = 0;
  // The tail of the entry's segment, the full middle segments, and the head
  // of the exit's segment.
  meters += (1 - entry.fraction) * segmentLength(entry.index);
  meters += polylineSegmentLength(line, entry.index + 1, exit.index);
  meters += exit.fraction * segmentLength(exit.index);
  return meters;
}

/** A stop positioned along the base polyline (arc order: index → fraction). */
export interface ArcPositionedStop {
  stop_id: string;
  name: string;
  location: CoordinatePair;
  /** Vertex index the stop projects to on the base polyline. */
  index: number;
  /** Clamped 0..1 position along that segment. */
  fraction: number;
}

/**
 * Detour-focus route context (US: detour as primary path): the main route
 * polyline split at the detour's split/merge projections, plus the combined
 * "detour as primary" path (main-before + detour loop + main-after).
 *
 * - `before` / `after`: the main-route segments OUTSIDE the detour — drawn
 *   at full opacity (they are the connection into/out of the detour).
 * - `replaced`: the main-route arc BETWEEN the split and merge nodes — the
 *   original path the detour replaces, drawn dimmed so the detour reads as
 *   the visual focal point without losing the original route context.
 * - `primary`: `before` + detour loop + `after` — how the overall route
 *   would look if the detour were treated as the primary path (solid line).
 */
export interface DetourContextLines {
  before: GeoLineString;
  replaced: GeoLineString;
  after: GeoLineString;
  primary: GeoLineString;
}

/**
 * Builds the detour-focus context lines. The split/merge projections must
 * land ON the main polyline and in travel order (entry before exit); out of
 * order or unprojectable positions return `null` (callers keep the plain
 * main line then).
 */
export function buildDetourContextLines(
  mainLine: GeoLineString,
  split: ProjectedPoint,
  merge: ProjectedPoint,
  detourLoop: GeoLineString,
): DetourContextLines | null {
  const coords = mainLine.coordinates;
  if (coords.length < 2) return null;
  if (
    split.index > merge.index ||
    (split.index === merge.index && split.fraction > merge.fraction)
  ) {
    return null;
  }
  if (detourLoop.coordinates.length < 2) return null;

  const before = {
    type: "LineString" as const,
    coordinates: [
      ...coords.slice(0, split.index + 1),
      ...(coordinatesEqual(coords[split.index], split.coordinate)
        ? []
        : [split.coordinate]),
    ],
  };
  const replaced = {
    type: "LineString" as const,
    coordinates: [
      split.coordinate,
      ...coords.slice(split.index + 1, merge.index + 1),
      ...(coordinatesEqual(coords[merge.index], merge.coordinate)
        ? []
        : [merge.coordinate]),
    ],
  };
  const mergeOnVertex = coordinatesEqual(coords[merge.index], merge.coordinate);
  const after = {
    type: "LineString" as const,
    coordinates: mergeOnVertex
      ? coords.slice(merge.index)
      : [merge.coordinate, ...coords.slice(merge.index + 1)],
  };
  const primary = {
    type: "LineString" as const,
    coordinates: [
      ...before.coordinates,
      ...detourLoop.coordinates,
      ...after.coordinates,
    ],
  };

  return { before, replaced, after, primary };
}

/**
 * Quick-mode detour inference (US2 revision — one-click detour authoring):
 * given an ordered stop list (chain order, `stop_order`) and a base polyline,
 * find the two stops that flank a clicked detour point along the route:
 *
 * - Click exactly ON (within `snapToleranceMeters` of) a stop → its chain
 *   neighbours are the flanks, and the clicked stop becomes the via stop
 *   (entry = stop before it, exit = stop after it: the "insert Stop 3 between
 *   1 and 2" case).
 * - Click strictly between two stops → arc-order flanking: the last stop at
 *   or before the click is `before`, the first strictly after is `after`
 *   (entry/exit are those stops; the click is the via point).
 *
 * Returns null when no valid flanking pair exists (fewer than two stops, a
 * click before the first stop or after the last stop, or a click far from the
 * base polyline) — the caller surfaces a recovery message.
 */
export type FlankFailureReason =
  "no_stops" | "no_path" | "before_first" | "after_last";

export type FlankResult =
  | {
      ok: true;
      before: ArcPositionedStop;
      after: ArcPositionedStop;
      viaStop: {
        stop_id: string;
        name: string;
        location: CoordinatePair;
      } | null;
    }
  | { ok: false; reason: FlankFailureReason };

/** Base polyline whose first/last vertices are this close is a LOOP (Iloilo
 *  routes are loops) — flanking then wraps across the chain ends so the
 *  closing arc is a legitimate detour segment ("last stop → first stop"). */
const LOOP_CLOSURE_TOLERANCE_METERS = 150;

export function inferDetourFlanks(
  basePolyline: GeoLineString,
  orderedStops: readonly {
    stop_id: string;
    name: string;
    location: CoordinatePair;
  }[],
  click: CoordinatePair,
  snapToleranceMeters = 30,
): FlankResult {
  if (orderedStops.length < 2) return { ok: false, reason: "no_stops" };
  const coords = basePolyline.coordinates;
  if (coords.length < 2) return { ok: false, reason: "no_path" };

  const isLoop =
    coords.length >= 3 &&
    coordsDistanceMeters(coords[0], coords[coords.length - 1]) <
      LOOP_CLOSURE_TOLERANCE_METERS;

  const positioned = orderedStops.map((stop) => ({
    stop,
    proj: projectPointOnPolyline(
      stop.location,
      basePolyline.coordinates,
      Infinity,
    ),
  }));

  const flanksFrom = (
    before: (typeof positioned)[number],
    after: (typeof positioned)[number],
    viaStop: { stop_id: string; name: string; location: CoordinatePair } | null,
  ): FlankResult => ({
    ok: true,
    before: {
      stop_id: before.stop.stop_id,
      name: before.stop.name,
      location: before.stop.location,
      index: before.proj!.index,
      fraction: before.proj!.fraction,
    },
    after: {
      stop_id: after.stop.stop_id,
      name: after.stop.name,
      location: after.stop.location,
      index: after.proj!.index,
      fraction: after.proj!.fraction,
    },
    viaStop,
  });

  // Click on/near an existing stop → that stop is the via stop; its chain
  // neighbours are the flanks (chain order). On loops the chain wraps; on
  // non-loops a terminal via stop has no flank on the missing side.
  for (let index = 0; index < positioned.length; index += 1) {
    const { stop, proj } = positioned[index];
    if (!proj) continue;
    if (coordsDistanceMeters(click, stop.location) <= snapToleranceMeters) {
      const n = positioned.length;
      const before = isLoop
        ? positioned[(index - 1 + n) % n]
        : positioned[index - 1];
      const after = isLoop
        ? positioned[(index + 1) % n]
        : positioned[index + 1];
      if (!before?.proj || !after?.proj) {
        return {
          ok: false,
          reason: index === 0 ? "before_first" : "after_last",
        };
      }
      const arcOrdered =
        before.proj.index < after.proj.index ||
        (before.proj.index === after.proj.index &&
          before.proj.fraction < after.proj.fraction);
      // On a loop every distinct stop pair is reachable forward across the
      // seam (chain-next after the last stop wraps to the first, whose arc
      // position is < the last's) — the raw-index gate misjudges the seam.
      if (!arcOrdered && !isLoop) break; // desynced chain → arc-order flanking
      return flanksFrom(before, after, {
        stop_id: stop.stop_id,
        name: stop.name,
        location: stop.location,
      });
    }
  }

  // Boundary check (non-loops only): a click laterally before the route's
  // start or past its end cannot be between two stops. Loops have no true
  // start/end — the wrap below covers the closing arc instead.
  if (!isLoop) {
    const startSeg = [coords[1][0] - coords[0][0], coords[1][1] - coords[0][1]];
    const beforeStart =
      (click[0] - coords[0][0]) * startSeg[0] +
        (click[1] - coords[0][1]) * startSeg[1] <
      0;
    const endSeg = [
      coords[coords.length - 1][0] - coords[coords.length - 2][0],
      coords[coords.length - 1][1] - coords[coords.length - 2][1],
    ];
    const endSq = endSeg[0] * endSeg[0] + endSeg[1] * endSeg[1];
    const pastEnd =
      (click[0] - coords[coords.length - 2][0]) * endSeg[0] +
        (click[1] - coords[coords.length - 2][1]) * endSeg[1] >
      endSq;
    if (beforeStart) return { ok: false, reason: "before_first" };
    if (pastEnd) return { ok: false, reason: "after_last" };
  }

  // Arc-order flanking for a click strictly between two stops. The click may
  // sit OFF the base line (a detour point DEFINES the diversion) — the store
  // gates the corridor (MAX_DETOUR_VIA_DISTANCE_METERS); here only the arc
  // POSITION of the click matters, so project without a distance cap.
  const clickProj = projectPointOnPolyline(
    click,
    basePolyline.coordinates,
    Infinity,
  );
  if (!clickProj) return { ok: false, reason: "no_path" };
  const atOrBefore = (a: NonNullable<(typeof positioned)[0]["proj"]>) =>
    a.index < clickProj.index ||
    (a.index === clickProj.index && a.fraction <= clickProj.fraction);
  const furtherAlong = (
    a: NonNullable<(typeof positioned)[0]["proj"]>,
    b: NonNullable<(typeof positioned)[0]["proj"]>,
  ) => a.index > b.index || (a.index === b.index && a.fraction > b.fraction);
  let before: (typeof positioned)[number] | null = null;
  let after: (typeof positioned)[number] | null = null;
  for (const entry of positioned) {
    const proj = entry.proj;
    if (!proj) continue;
    if (atOrBefore(proj)) {
      if (!before?.proj || furtherAlong(proj, before.proj)) before = entry;
    } else if (!after) {
      // The FIRST strictly-after stop along the arc is the exit flank.
      after = entry;
    }
  }
  // Loop wrap: the closing arc flanks last-stop → first-stop.
  if (isLoop) {
    if (!before && positioned.length > 0) {
      before = positioned[positioned.length - 1];
    }
    if (!after && positioned.length > 0) {
      after = positioned[0];
    }
  }
  if (!before?.proj || !after?.proj) {
    return {
      ok: false,
      reason: before ? "after_last" : "before_first",
    };
  }
  if (before.stop.stop_id === after.stop.stop_id) {
    return { ok: false, reason: "after_last" };
  }
  return flanksFrom(before, after, null);
}
