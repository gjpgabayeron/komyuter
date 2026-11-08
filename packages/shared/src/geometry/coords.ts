import type { CoordinatePair, GeoLineString } from "../types/geometry";

/** Client-side snap tolerance for detour entry/exit — mirrors the server's
 *  DETOUR_ON_LINE_TOLERANCE_METERS (30 m). */
export const DEFAULT_DETOUR_SNAP_TOLERANCE_METERS = 30;

/** A point projected onto a polyline segment (FR-010/FR-018 snap result). */
export interface ProjectedPoint {
  coordinate: CoordinatePair;
  /** Leading vertex index of the segment the point landed on; for a tap that
   *  coincides with a vertex, that vertex's own index. */
  index: number;
  /** Clamped 0..1 position along the snapped segment (t). */
  fraction: number;
  distanceMeters: number;
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
 * Haversine point-to-segment projection returning the snapped coordinate, the
 * clamped fraction t, and the true distance in meters.
 */
export function distanceToSegment(
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
 * Projection of a point onto a polyline using haversine point-to-segment math.
 * Returns the snapped coordinate, the leading vertex index of the snapped
 * segment, and the true distance in meters — or null when every segment is
 * farther than `maxDistanceMeters`.
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
  // segment leading into it).
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
