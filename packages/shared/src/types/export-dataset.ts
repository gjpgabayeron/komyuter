import type { GeoPoint, GeoLineString } from "./geometry";
import type { StopType, RestrictionReason, RestrictionAffects } from "./domain";

export const EXPORT_SCHEMA_VERSION = "1.1";
export const EXPORT_COORDINATE_ORDER = "lng_lat";

export interface ExportFareConfiguration {
  fare_config_id: string;
  label: string;
  base_fare: number;
  base_distance_km: number;
  rate_per_km: number;
  student_discount_pct: number;
  senior_discount_pct: number;
  is_default: boolean;
}

export interface ExportRestriction {
  restriction_id: string;
  from_coord_index: number;
  to_coord_index: number;
  reason: RestrictionReason;
  affects: RestrictionAffects;
  note: string | null;
}

export interface ExportStop {
  stop_id: string;
  name: string;
  type: StopType;
  stop_order: number;
  is_guaranteed_service: boolean;
  landmark_hint: string | null;
  location: GeoPoint;
}

export interface ExportDetour {
  detour_id: string;
  label: string;
  entry: GeoPoint;
  exit: GeoPoint;
  detour_polyline: GeoLineString;
  additional_distance_meters: number | null;
  commuter_instruction: string;
  driver_instruction: string | null;
  detour_stops: ExportDetourStop[];
}

/** A stop owned by a detour (never part of the base chain). */
export interface ExportDetourStop {
  detour_stop_id: string;
  stop_order: number;
  name: string;
  location: GeoPoint;
  type: StopType;
  is_guaranteed_service: boolean;
  landmark_hint: string | null;
  notes: string | null;
}

export interface ExportDirection {
  direction_id: string;
  label: string;
  is_active: boolean;
  terminals: { origin: string | null; destination: string | null };
  base_polyline: GeoLineString;
  stops: ExportStop[];
  detours: ExportDetour[];
  restrictions: ExportRestriction[];
}

export interface ExportRoute {
  route_id: string;
  name: string;
  short_name: string;
  color: string | null;
  is_active: boolean;
  fare_config_id: string | null;
  directions: ExportDirection[];
}

export interface ExportDataset {
  schema_version: typeof EXPORT_SCHEMA_VERSION;
  coordinate_order: typeof EXPORT_COORDINATE_ORDER;
  exported_at: string;
  fare_configs: ExportFareConfiguration[];
  routes: ExportRoute[];
}
