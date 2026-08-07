import type {
  CoordinatePair,
  GeoLineString,
  GeoPoint,
  StopType,
} from "@komyuter/shared";

/** Max distance (meters) allowed between a polyline endpoint and its stop. */
export const ENDPOINT_TOLERANCE_METERS = 100;

/** Stop payload as submitted by the plotting UI (before persistence). */
export interface PlotStopInput {
  name: string;
  type: StopType;
  location: GeoPoint;
  stop_order?: number;
  is_guaranteed_service?: boolean;
  landmark_hint?: string | null;
  notes?: string | null;
}

/** Base-direction payload submitted by the plotting UI save. */
export interface PlotBaseInput {
  label: string;
  polyline: GeoLineString;
  stops: PlotStopInput[];
}

/** Return direction derived from a base direction (FR-012). */
export interface DerivedReturn {
  label: string;
  polyline: GeoLineString;
  stops: PlotStopInput[];
}

/**
 * Reverses a coordinate array as a NEW array; the input is never mutated
 * (ADR-0008: the return polyline is a separate geometry, not a view).
 */
export function reverseCoordinates(
  coordinates: readonly CoordinatePair[],
): CoordinatePair[] {
  return [...coordinates].reverse();
}

/** Haversine great-circle distance between two [lng, lat] points, in meters. */
export function coordinatesDistanceMeters(
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
 * Auto-default return label: the base direction's first stop is the return
 * direction's destination, so the label reads "To {first stop}" (FR-028).
 */
export function deriveReturnLabel(
  baseStops: readonly { name: string }[],
): string {
  return `To ${baseStops[0].name}`;
}

/**
 * Derives the return direction from a plotted base direction:
 * reversed polyline, reversed stop list (new stop objects, renumbered from 1),
 * and an auto-derived label. Never mutates the base input.
 */
export function buildDerivedReturn(base: PlotBaseInput): DerivedReturn {
  return {
    label: deriveReturnLabel(base.stops),
    polyline: {
      type: "LineString",
      coordinates: reverseCoordinates(base.polyline.coordinates),
    },
    stops: [...base.stops].reverse().map((stop, index) => ({
      ...stop,
      location: {
        type: "Point",
        coordinates: [...stop.location.coordinates] as CoordinatePair,
      },
      stop_order: index + 1,
    })),
  };
}

export type EndpointCheckResult =
  | { ok: true }
  | {
      ok: false;
      reason: "start_mismatch" | "end_mismatch";
      distanceMeters: number;
    };

/**
 * Validates that the plotted path starts and ends at the first and last stops
 * within ENDPOINT_TOLERANCE_METERS. Stops far from the path would silently
 * place boarding points in the wrong place, so the save is rejected (SC-009).
 */
export function pathEndpointsOnStops(
  polyline: GeoLineString,
  stops: readonly PlotStopInput[],
): EndpointCheckResult {
  if (stops.length < 2) {
    return {
      ok: false,
      reason: "start_mismatch",
      distanceMeters: Number.POSITIVE_INFINITY,
    };
  }
  const coordinates = polyline.coordinates;
  const startDistance = coordinatesDistanceMeters(
    coordinates[0],
    stops[0].location.coordinates,
  );
  if (startDistance > ENDPOINT_TOLERANCE_METERS) {
    return {
      ok: false,
      reason: "start_mismatch",
      distanceMeters: startDistance,
    };
  }
  const endDistance = coordinatesDistanceMeters(
    coordinates[coordinates.length - 1],
    stops[stops.length - 1].location.coordinates,
  );
  const endDistanceToStart = coordinatesDistanceMeters(
    coordinates[coordinates.length - 1],
    stops[0].location.coordinates,
  );
  if (
    endDistance > ENDPOINT_TOLERANCE_METERS &&
    endDistanceToStart > ENDPOINT_TOLERANCE_METERS
  ) {
    // A loop ends on the START stop, so the end may match either the last or
    // the first stop (FR-004).
    return {
      ok: false,
      reason: "end_mismatch",
      distanceMeters: Math.min(endDistance, endDistanceToStart),
    };
  }
  return { ok: true };
}

/**
 * Renumbers stops to 1..n in array order. Array order is the single source of
 * truth for the plotted sequence; any client-sent stop_order is normalized.
 */
export function normalizeStopOrder(
  stops: readonly PlotStopInput[],
): PlotStopInput[] {
  return stops.map((stop, index) => ({ ...stop, stop_order: index + 1 }));
}
