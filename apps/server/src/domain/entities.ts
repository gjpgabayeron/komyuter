import { asc, eq } from "drizzle-orm";
import type { GeoLineString, GeoPoint } from "@komyuter/shared";
import type { Db } from "../config/db";
import {
  detours as detoursTable,
  directions as directionsTable,
  restrictions as restrictionsTable,
  stops as stopsTable,
} from "../db/schema";
import { asGeoJSON } from "../db/queries";

export interface StopEntity {
  stop_id: string;
  direction_id: string;
  name: string;
  stop_order: number;
  type: string;
  location: GeoPoint;
  is_guaranteed_service: boolean;
  ar_marker_enabled: boolean;
  landmark_hint: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DetourEntity {
  detour_id: string;
  direction_id: string;
  label: string;
  entry: GeoPoint;
  exit: GeoPoint;
  detour_polyline: GeoLineString;
  additional_distance_meters: number | null;
  commuter_instruction: string;
  driver_instruction: string | null;
  notable_stops: { stop_id: string; name: string; is_detour_only: boolean }[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RestrictionEntity {
  restriction_id: string;
  direction_id: string;
  from_coord_index: number;
  to_coord_index: number;
  reason: string;
  affects: string;
  note: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DirectionEntity {
  direction_id: string;
  route_id: string;
  label: string;
  base_polyline: GeoLineString;
  origin_stop_id: string | null;
  destination_stop_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  stops: StopEntity[];
  detours: DetourEntity[];
  restrictions: RestrictionEntity[];
}

export interface DirectionSummaryEntity {
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

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export async function loadStops(
  db: Db,
  directionId: string,
): Promise<StopEntity[]> {
  const rows = await db
    .select({
      stop_id: stopsTable.stop_id,
      direction_id: stopsTable.direction_id,
      name: stopsTable.name,
      stop_order: stopsTable.stop_order,
      type: stopsTable.type,
      location: asGeoJSON(stopsTable.location),
      is_guaranteed_service: stopsTable.is_guaranteed_service,
      ar_marker_enabled: stopsTable.ar_marker_enabled,
      landmark_hint: stopsTable.landmark_hint,
      notes: stopsTable.notes,
      is_active: stopsTable.is_active,
      created_at: stopsTable.created_at,
      updated_at: stopsTable.updated_at,
    })
    .from(stopsTable)
    .where(eq(stopsTable.direction_id, directionId))
    .orderBy(asc(stopsTable.stop_order));

  return rows.map((row) => ({
    ...row,
    location: row.location as unknown as GeoPoint,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  }));
}

export async function loadDetours(
  db: Db,
  directionId: string,
): Promise<DetourEntity[]> {
  const rows = await db
    .select({
      detour_id: detoursTable.detour_id,
      direction_id: detoursTable.direction_id,
      label: detoursTable.label,
      entry: asGeoJSON(detoursTable.entry),
      exit: asGeoJSON(detoursTable.exit),
      detour_polyline: asGeoJSON(detoursTable.detour_polyline),
      additional_distance_meters: detoursTable.additional_distance_meters,
      commuter_instruction: detoursTable.commuter_instruction,
      driver_instruction: detoursTable.driver_instruction,
      notable_stops: detoursTable.notable_stops,
      is_active: detoursTable.is_active,
      created_at: detoursTable.created_at,
      updated_at: detoursTable.updated_at,
    })
    .from(detoursTable)
    .where(eq(detoursTable.direction_id, directionId));

  return rows.map((row) => ({
    ...row,
    entry: row.entry as unknown as GeoPoint,
    exit: row.exit as unknown as GeoPoint,
    detour_polyline: row.detour_polyline as unknown as GeoLineString,
    notable_stops: row.notable_stops ?? [],
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  }));
}

export async function loadRestrictions(
  db: Db,
  directionId: string,
): Promise<RestrictionEntity[]> {
  const rows = await db
    .select({
      restriction_id: restrictionsTable.restriction_id,
      direction_id: restrictionsTable.direction_id,
      from_coord_index: restrictionsTable.from_coord_index,
      to_coord_index: restrictionsTable.to_coord_index,
      reason: restrictionsTable.reason,
      affects: restrictionsTable.affects,
      note: restrictionsTable.note,
      is_active: restrictionsTable.is_active,
      created_at: restrictionsTable.created_at,
      updated_at: restrictionsTable.updated_at,
    })
    .from(restrictionsTable)
    .where(eq(restrictionsTable.direction_id, directionId));

  return rows.map((row) => ({
    ...row,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  }));
}

export async function loadDirectionSummary(
  db: Db,
  directionId: string,
): Promise<DirectionSummaryEntity | null> {
  const [row] = await db
    .select({
      direction_id: directionsTable.direction_id,
      route_id: directionsTable.route_id,
      label: directionsTable.label,
      base_polyline: asGeoJSON(directionsTable.base_polyline),
      origin_stop_id: directionsTable.origin_stop_id,
      destination_stop_id: directionsTable.destination_stop_id,
      is_active: directionsTable.is_active,
      created_at: directionsTable.created_at,
      updated_at: directionsTable.updated_at,
    })
    .from(directionsTable)
    .where(eq(directionsTable.direction_id, directionId))
    .limit(1);

  if (!row) {
    return null;
  }
  return {
    ...row,
    base_polyline: row.base_polyline as unknown as GeoLineString,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

export async function loadDirectionFull(
  db: Db,
  directionId: string,
): Promise<DirectionEntity | null> {
  const summary = await loadDirectionSummary(db, directionId);
  if (!summary) {
    return null;
  }
  const [stops, detours, restrictions] = await Promise.all([
    loadStops(db, directionId),
    loadDetours(db, directionId),
    loadRestrictions(db, directionId),
  ]);
  return { ...summary, stops, detours, restrictions };
}
