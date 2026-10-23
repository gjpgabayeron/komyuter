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

/**
 * One place-search hit, as the admin POI pill consumes it.
 *
 * `location` is `[lng, lat]` like every other coordinate in this codebase
 * (ADR-0013). The shape is deliberately provider-agnostic: the browser never
 * talks to a geocoder directly — `GET /api/admin/mapbox/geocode` maps Mapbox's
 * feature collection onto this type, and the pill renders it (issue #16).
 */
export interface GeocodeResult {
  id: string;
  name: string;
  description: string;
  location: CoordinatePair;
}

/**
 * Why a geocode call returned no results, or `null` when the upstream answered.
 * Mirrors the directions proxy's degradation codes so the UI can say *why* it
 * has nothing: `no_token` is a configuration fact, `upstream_error` is transient.
 */
export type GeocodeWarning = "no_token" | "upstream_error" | null;
