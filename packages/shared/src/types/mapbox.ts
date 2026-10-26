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
 * One place-search hit: the dropdown row and the map point in one object.
 *
 * Search Box `forward` answers with names *and* geometry, so a hit carries both
 * what the pill lists and what the map draws. That is what lets every candidate
 * appear on the map and one of them preview on hover without a second request
 * per row (issue #16 follow-up: the classic geocoding endpoint had no POI
 * coverage in Iloilo, so a mall search came back as the road it stands on).
 */
export interface GeocodeHit {
  id: string;
  name: string;
  description: string;
  /** `[lng, lat]`, like every other coordinate in this codebase (ADR-0013). */
  location: CoordinatePair;
}

/**
 * Why a geocode call returned nothing, or `null` when the upstream answered.
 * Mirrors the directions proxy's degradation codes so the UI can say *why* it
 * has nothing: `no_token` is a configuration fact, `upstream_error` is transient.
 */
export type GeocodeWarning = "no_token" | "upstream_error" | null;
