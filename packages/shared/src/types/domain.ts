import type { GeoPoint, GeoLineString } from "./geometry";

export const STOP_TYPE_VALUES = [
  "terminal",
  "major_stop",
  "waiting_area",
] as const;
export type StopType = (typeof STOP_TYPE_VALUES)[number];

export const RESTRICTION_REASON_VALUES = [
  "no_stopping_zone",
  "contraflow",
  "pedestrian_hostile",
] as const;
export type RestrictionReason = (typeof RESTRICTION_REASON_VALUES)[number];

export const RESTRICTION_AFFECTS_VALUES = [
  "boarding",
  "alighting",
  "both",
] as const;
export type RestrictionAffects = (typeof RESTRICTION_AFFECTS_VALUES)[number];

export interface Route {
  route_id: string;
  name: string;
  short_name: string;
  color: string | null;
  is_active: boolean;
  fare_config_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Direction {
  direction_id: string;
  route_id: string;
  label: string;
  base_polyline: GeoLineString;
  origin_stop_id: string | null;
  destination_stop_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Stop {
  stop_id: string;
  direction_id: string;
  name: string;
  stop_order: number;
  type: StopType;
  location: GeoPoint;
  is_guaranteed_service: boolean;
  ar_marker_enabled: boolean;
  landmark_hint: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Detour {
  detour_id: string;
  direction_id: string;
  label: string;
  entry: GeoPoint;
  exit: GeoPoint;
  detour_polyline: GeoLineString;
  additional_distance_meters: number | null;
  commuter_instruction: string;
  driver_instruction: string | null;
  /** Points created by the detour tool — real stops scoped to this detour
   *  only (ordered; the detour's route is entry → detour_stops → exit). */
  detour_stops: DetourStop[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** A stop owned by a detour (never part of the base chain). */
export interface DetourStop {
  detour_stop_id: string;
  detour_id: string;
  stop_order: number;
  name: string;
  location: GeoPoint;
  type: StopType;
  is_guaranteed_service: boolean;
  landmark_hint: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Restriction {
  restriction_id: string;
  direction_id: string;
  from_coord_index: number;
  to_coord_index: number;
  reason: RestrictionReason;
  affects: RestrictionAffects;
  note: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FareConfiguration {
  fare_config_id: string;
  label: string;
  base_fare: number;
  base_distance_km: number;
  rate_per_km: number;
  student_discount_pct: number;
  senior_discount_pct: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}
