import type { CoordinatePair, GeoLineString } from "./geometry";

/**
 * Domain shape of a snapped path as consumed by the admin plotting UI.
 * camelCase counterpart of the wire `MapboxDirectionsResponse`.
 */
export interface SnappedPath {
  polyline: GeoLineString;
  distanceMeters: number;
  snapped: boolean;
  warning: string | null;
}

/** Ordered coordinates to snap to the road network, in [lng, lat] order. */
export type SnapCoordinates = CoordinatePair[];
