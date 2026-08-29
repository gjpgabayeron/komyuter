import type { CoordinatePair } from "@komyuter/shared";
import { coordsDistanceMeters } from "./coords";

/**
 * Direction-aware overlap detection for the route overview .
 *
 * Premise: every polyline is produced by Mapbox snap-to-road, so two polylines
 * on the same road segment share the same underlying coordinates regardless of
 * travel direction. Direction is encoded in each polyline's vertex order.
 *
 * Two passes OVERLAP when vertices from each lie within
 * `OVERLAP_TOLERANCE_METERS` of each other AND their local travel directions
 * are OPPOSITE (a bidirectional road). Same-direction convoys are deliberately
 * ignored â€” they are not a directional ambiguity, and offsetting them is what
 * made the old ladder look fragmented. Self-overlap (a loop traversing the
 * same road twice in opposite directions) is detected the same way, requiring
 * the two vertices to be far apart ALONG the line so adjacent dense vertices
 * are never mistaken for a second pass.
 *
 * The lateral separation is applied in real-world METERS (not pixels) so it is
 * subtle at overview zoom and reads clearly when zoomed in: each overlapping
 * pass is shifted right of its own travel by `OVERLAP_OFFSET_METERS` (3 m â†’ 6 m
 * total separation), with a smooth 0 â†’ full â†’ 0 taper over `OVERLAP_TAPER_METERS` at each end so the
 * shifted run rejoins the unshifted line without a kink or gap.
 */

/** Max distance between two vertices for them to count as the same road point. */
export const OVERLAP_TOLERANCE_METERS = 20;
/** Lateral shift applied to each overlapping pass, right of its own travel. */
export const OVERLAP_OFFSET_METERS = 1;
/** Distance over which the shift ramps 0 â†’ full at each end of a run. */
export const OVERLAP_TAPER_METERS = 30;
/** A corridor needs at least this many matched vertices to be worth offsetting. */
const MIN_RUN_VERTICES = 2;
/** Two vertices of the SAME polyline must be at least this far apart ALONG the
 *  line (cumulative meters) to count as a second pass â€” dense snapped geometry
 *  has adjacent vertices only meters apart. */
const SELF_MIN_ALONG_METERS = 100;
/** Dot product of the two travel tangents below which they count as opposite
 *  (â‰ˆ >120Â° apart). Same direction / perpendicular junction crossings do not
 *  match. */
const OPPOSITE_DOT_THRESHOLD = -0.5;

/** A contiguous vertex range of one route's polyline that overlaps another
 *  pass in the opposite direction (indices inclusive). */
export interface OverlapRun {
  start: number;
  end: number;
}

export interface OverlapRunsByRoute {
  routeId: string;
  runs: OverlapRun[];
}

const M_PER_DEG_LAT = 111_320;

function metersPerDegLng(lat: number): number {
  return M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

/** Flat-earth (x = east meters, y = north meters) at the given scale. */
function toMeters(coord: CoordinatePair, perDegLng: number): [number, number] {
  return [coord[0] * perDegLng, coord[1] * M_PER_DEG_LAT];
}

/** Approximate unit travel tangent (flat meters) at vertex i of a polyline. */
function tangentAt(
  coords: readonly CoordinatePair[],
  i: number,
  perDegLng: number,
): [number, number] {
  const prev = coords[Math.max(0, i - 1)];
  const next = coords[Math.min(coords.length - 1, i + 1)];
  const a = toMeters(prev, perDegLng);
  const b = toMeters(next, perDegLng);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  return [dx / len, dy / len];
}

/**
 * Finds every corridor where two polyline passes share the same road and
 * traverse it in opposite directions. Cross-route pairs (two routes on one
 * bidirectional road) and same-route pairs (a loop doubling back on itself)
 * are both detected. Returns the matched vertex ranges grouped per route.
 */
export function findOppositeOverlapRuns(
  routes: readonly {
    routeId: string;
    coords: readonly CoordinatePair[];
  }[],
): OverlapRunsByRoute[] {
  if (routes.length === 0) return [];

  // Single flat-earth projection for the whole dataset (Iloilo-scale).
  const meanLat =
    routes
      .flatMap((route) => route.coords.map((coord) => coord[1]))
      .reduce((sum, lat) => sum + lat, 0) /
      Math.max(
        1,
        routes.reduce((n, r) => n + r.coords.length, 0),
      ) || 0;
  const perDegLng = metersPerDegLng(meanLat);

  // Cumulative along-line distance per route, for the self-overlap gate.
  const cumDist = routes.map((route) => {
    const prefix: number[] = [0];
    let total = 0;
    for (let i = 1; i < route.coords.length; i++) {
      total += coordsDistanceMeters(route.coords[i - 1], route.coords[i]);
      prefix.push(total);
    }
    return prefix;
  });

  // 1. Spatial hash over tolerance-sized cells.
  const cellMeters = OVERLAP_TOLERANCE_METERS;
  const cellKey = (x: number, y: number) =>
    `${Math.floor(x / cellMeters)}:${Math.floor(y / cellMeters)}`;
  const grid = new Map<
    string,
    { routeIdx: number; vertexIdx: number; lng: number; lat: number }[]
  >();
  routes.forEach((route, routeIdx) => {
    route.coords.forEach(([lng, lat], vertexIdx) => {
      const [x, y] = toMeters([lng, lat], perDegLng);
      const key = cellKey(x, y);
      const list = grid.get(key);
      if (list) list.push({ routeIdx, vertexIdx, lng, lat });
      else grid.set(key, [{ routeIdx, vertexIdx, lng, lat }]);
    });
  });

  // 2. Mark vertices that sit on an opposite-direction shared corridor.
  const matched = new Set<string>();
  const mark = (routeIdx: number, vertexIdx: number) =>
    matched.add(`${routeIdx}:${vertexIdx}`);

  const distMeters = (a: [number, number], b: [number, number]) =>
    Math.hypot(a[0] - b[0], a[1] - b[1]);

  for (const [key, entries] of grid) {
    const [cx, cy] = key.split(":").map(Number);
    for (const entry of entries) {
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          const others = grid.get(`${gx}:${gy}`);
          if (!others) continue;
          for (const other of others) {
            if (entry === other) continue;
            if (
              distMeters(
                toMeters([entry.lng, entry.lat], perDegLng),
                toMeters([other.lng, other.lat], perDegLng),
              ) > OVERLAP_TOLERANCE_METERS
            ) {
              continue;
            }
            // Same route: only a genuine second pass (far apart along the line).
            if (entry.routeIdx === other.routeIdx) {
              if (
                Math.abs(
                  cumDist[entry.routeIdx][entry.vertexIdx] -
                    cumDist[other.routeIdx][other.vertexIdx],
                ) < SELF_MIN_ALONG_METERS
              ) {
                continue;
              }
            }
            const t1 = tangentAt(
              routes[entry.routeIdx].coords,
              entry.vertexIdx,
              perDegLng,
            );
            const t2 = tangentAt(
              routes[other.routeIdx].coords,
              other.vertexIdx,
              perDegLng,
            );
            const dot = t1[0] * t2[0] + t1[1] * t2[1];
            if (dot >= OPPOSITE_DOT_THRESHOLD) continue;
            mark(entry.routeIdx, entry.vertexIdx);
            mark(other.routeIdx, other.vertexIdx);
          }
        }
      }
    }
  }

  // 3. Cluster each route's matched vertices into contiguous runs.
  const byRoute = new Map<string, OverlapRun[]>();
  routes.forEach((route, routeIdx) => {
    const indices = route.coords
      .map((_, vertexIdx) => vertexIdx)
      .filter((vertexIdx) => matched.has(`${routeIdx}:${vertexIdx}`))
      .sort((a, b) => a - b);
    const runs: OverlapRun[] = [];
    let start = -1;
    let prev = -2;
    for (const idx of indices) {
      if (start >= 0 && idx - prev <= 1) {
        prev = idx;
        continue;
      }
      if (start >= 0 && prev - start + 1 >= MIN_RUN_VERTICES) {
        runs.push({ start, end: prev });
      }
      start = idx;
      prev = idx;
    }
    if (start >= 0 && prev - start + 1 >= MIN_RUN_VERTICES) {
      runs.push({ start, end: prev });
    }
    if (runs.length > 0) byRoute.set(route.routeId, runs);
  });

  return [...byRoute].map(([routeId, runs]) => ({ routeId, runs }));
}

/**
 * Returns a copy of `coords` with the given runs shifted laterally, right of
 * travel, with a tapered 0 â†’ full â†’ 0 profile so shifted stretches rejoin the
 * unshifted line seamlessly. Vertices outside the runs are untouched. When a
 * vertex belongs to several runs the largest shift wins. Returns the input
 * reference unchanged when there are no runs.
 */
export function shiftOverlapRuns(
  coords: readonly CoordinatePair[],
  runs: readonly OverlapRun[],
  offsetMeters = OVERLAP_OFFSET_METERS,
  taperMeters = OVERLAP_TAPER_METERS,
): CoordinatePair[] {
  if (runs.length === 0 || coords.length === 0) {
    return coords as CoordinatePair[];
  }
  const meanLat =
    coords.reduce((sum, coord) => sum + coord[1], 0) / coords.length;
  const perDegLng = metersPerDegLng(meanLat);

  // Per-vertex shift in meters (max across runs that touch a vertex).
  const shifts = new Map<number, number>();
  for (const run of runs) {
    const { start, end } = run;
    if (end < start) continue;
    // Cumulative distance along the run drives the taper profile.
    const cumAt = new Map<number, number>();
    let cum = 0;
    cumAt.set(start, 0);
    for (let i = start + 1; i <= end; i++) {
      cum += coordsDistanceMeters(coords[i - 1], coords[i]);
      cumAt.set(i, cum);
    }
    for (let i = start; i <= end; i++) {
      const d = cumAt.get(i) ?? 0;
      const fromStart = taperMeters > 0 ? d / taperMeters : 1;
      const fromEnd = taperMeters > 0 ? (cum - d) / taperMeters : 1;
      const factor = Math.max(0, Math.min(1, fromStart, fromEnd));
      shifts.set(i, Math.max(shifts.get(i) ?? 0, offsetMeters * factor));
    }
  }

  const result = coords.map(([lng, lat]) => [lng, lat] as CoordinatePair);
  for (const [i, shift] of shifts) {
    if (shift <= 0) continue;
    const [tx, ty] = tangentAt(coords, i, perDegLng);
    // Right of travel is (ty, -tx) in flat meters; convert back to degrees.
    const dLng = (ty * shift) / perDegLng;
    const dLat = (-tx * shift) / M_PER_DEG_LAT;
    result[i] = [coords[i][0] + dLng, coords[i][1] + dLat];
  }
  return result;
}
