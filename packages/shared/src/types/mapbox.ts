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
 * One place-search hit as the admin POI pill lists it.
 *
 * Mapbox's Search Box `suggest` answers with names and ids but no coordinates,
 * so a row carries what the dropdown needs and `id` is the handle the pill
 * resolves into a point only when the plotter picks it (issue #16 follow-up:
 * the classic geocoding endpoint had no POI coverage in Iloilo, so a mall search
 * came back as the road it stands on).
 */
export interface GeocodeSuggestion {
  id: string;
  name: string;
  description: string;
}

/**
 * A suggestion resolved into a coordinate, `[lng, lat]` like every other
 * coordinate in this codebase (ADR-0013).
 */
export interface GeocodeResult {
  location: CoordinatePair;
}

/**
 * Why a geocode call returned nothing, or `null` when the upstream answered.
 * Mirrors the directions proxy's degradation codes so the UI can say *why* it
 * has nothing: `no_token` is a configuration fact, `upstream_error` is transient.
 */
export type GeocodeWarning = "no_token" | "upstream_error" | null;
