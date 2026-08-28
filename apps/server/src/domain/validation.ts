import { eq, or } from "drizzle-orm";
import type { GeoLineString, GeoPoint } from "@komyuter/shared";
import type { Db } from "../config/db";
import { directions, stops } from "../db/schema";
import { asGeoJSON } from "../db/queries";
import { conflict, validationError } from "../api/errors";

export const DETOUR_ON_LINE_TOLERANCE_METERS = 30;

export function assertPointOnLine(
  point: GeoPoint,
  line: GeoLineString,
  toleranceMeters = DETOUR_ON_LINE_TOLERANCE_METERS,
): void {
  const [lng, lat] = point.coordinates;
  let min = Number.POSITIVE_INFINITY;
  for (let index = 1; index < line.coordinates.length; index++) {
    const [ax, ay] = line.coordinates[index - 1];
    const [bx, by] = line.coordinates[index];
    min = Math.min(min, distanceToSegment(lng, lat, ax, ay, bx, by));
  }
  if (min > toleranceMeters) {
    throw validationError(
      `Point [${lng}, ${lat}] is not on the base polyline (${min.toFixed(1)}m away)`,
    );
  }
}

/**
 * FR-023 (SC-014): a detour loop must begin on its entry point and end on its
 * exit point (within the detour on-line tolerance), and a detour must never be
 * degenerate (entry and exit coincide). The editor always snaps loop[0] and
 * loop[last] onto entry/exit exactly, so this guard catches foreign or
 * hand-crafted payloads and any partial edit that would silently corrupt the
 * distance/fare math (the loop's replaced-arc length is derived from geometry).
 */
export function assertDetourLoopEndpoints(
  loop: GeoLineString,
  entry: GeoPoint,
  exit: GeoPoint,
  toleranceMeters = DETOUR_ON_LINE_TOLERANCE_METERS,
): void {
  const start = loop.coordinates[0];
  const end = loop.coordinates[loop.coordinates.length - 1];
  const startDistance = haversineMeters(
    start[0],
    start[1],
    entry.coordinates[0],
    entry.coordinates[1],
  );
  const endDistance = haversineMeters(
    end[0],
    end[1],
    exit.coordinates[0],
    exit.coordinates[1],
  );
  if (startDistance > toleranceMeters) {
    throw validationError(
      `Detour loop start is ${startDistance.toFixed(1)}m from entry`,
    );
  }
  if (endDistance > toleranceMeters) {
    throw validationError(
      `Detour loop end is ${endDistance.toFixed(1)}m from exit`,
    );
  }
  const entryExitDistance = haversineMeters(
    entry.coordinates[0],
    entry.coordinates[1],
    exit.coordinates[0],
    exit.coordinates[1],
  );
  if (entryExitDistance <= toleranceMeters) {
    throw validationError("Detour entry and exit coincide (degenerate loop)");
  }
}

function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  let t = 0;
  if (lengthSq > 0) {
    t = ((px - ax) * dx + (py - ay) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));
  }
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return haversineMeters(px, py, cx, cy);
}

function haversineMeters(
  lng1: number,
  lat1: number,
  lng2: number,
  lat2: number,
): number {
  const earthRadius = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(a));
}

export async function assertNotDirectionTerminal(
  db: Db,
  stopId: string,
): Promise<void> {
  const referenced = await db
    .select({ direction_id: directions.direction_id })
    .from(directions)
    .where(
      or(
        eq(directions.origin_stop_id, stopId),
        eq(directions.destination_stop_id, stopId),
      ),
    )
    .limit(1);
  if (referenced.length > 0) {
    throw conflict(
      `Stop ${stopId} is referenced as a direction terminal and cannot be deleted`,
    );
  }
}

export function assertRestrictionIndexRange(
  fromCoordIndex: number,
  toCoordIndex: number,
  line: GeoLineString,
): void {
  const maxIndex = line.coordinates.length - 1;
  if (
    fromCoordIndex < 0 ||
    toCoordIndex < 0 ||
    fromCoordIndex > maxIndex ||
    toCoordIndex > maxIndex
  ) {
    throw validationError(
      `Restriction indices [${fromCoordIndex}, ${toCoordIndex}] are out of range for a polyline with indices [0, ${maxIndex}]`,
    );
  }
  if (fromCoordIndex > toCoordIndex) {
    throw validationError(
      `from_coord_index (${fromCoordIndex}) must be <= to_coord_index (${toCoordIndex})`,
    );
  }
}

export async function loadBasePolyline(
  db: Db,
  directionId: string,
): Promise<GeoLineString> {
  const [row] = await db
    .select({
      base_polyline: asGeoJSON(directions.base_polyline),
    })
    .from(directions)
    .where(eq(directions.direction_id, directionId))
    .limit(1);
  if (!row) {
    throw validationError(`Direction ${directionId} does not exist`);
  }
  return row.base_polyline as unknown as GeoLineString;
}

export async function assertStopsNotEmpty(
  db: Db,
  directionId: string,
): Promise<void> {
  const [row] = await db
    .select({ stop_id: stops.stop_id })
    .from(stops)
    .where(eq(stops.direction_id, directionId))
    .limit(1);
  if (!row) {
    throw validationError(
      `Direction ${directionId} must have a non-empty stop list`,
    );
  }
}
