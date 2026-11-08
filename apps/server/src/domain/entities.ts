import { and, asc, eq, inArray } from "drizzle-orm";
import type { Attribution, GeoLineString, GeoPoint } from "@komyuter/shared";
import type { Db } from "../config/db";
import {
  detourStops as detourStopsTable,
  detours as detoursTable,
  directions as directionsTable,
  restrictions as restrictionsTable,
  stops as stopsTable,
} from "../db/schema";
import { asGeoJSON } from "../db/queries";
import type { AttributionResolver } from "./attribution";

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
  created_by: Attribution;
  updated_by: Attribution;
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
  detour_stops: DetourStopEntity[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: Attribution;
  updated_by: Attribution;
}

/** A stop owned by a detour (never part of the base chain). */
export interface DetourStopEntity {
  detour_stop_id: string;
  detour_id: string;
  stop_order: number;
  name: string;
  location: GeoPoint;
  type: string;
  is_guaranteed_service: boolean;
  landmark_hint: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: Attribution;
  updated_by: Attribution;
}

export interface RestrictionEntity {
  restriction_id: string;
  direction_id: string;
  detour_id: string | null;
  from_coord_index: number;
  to_coord_index: number;
  kind: string;
  note: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: Attribution;
  updated_by: Attribution;
}

export interface DirectionEntity {
  direction_id: string;
  route_id: string;
  label: string;
  base_polyline: GeoLineString;
  origin_stop_id: string | null;
  destination_stop_id: string | null;
  is_active: boolean;
  /** Direction Version (ADR-0020): the base a plotted save sends back. */
  version: number;
  created_at: string;
  updated_at: string;
  created_by: Attribution;
  updated_by: Attribution;
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
  version: number;
  created_at: string;
  updated_at: string;
  created_by: Attribution;
  updated_by: Attribution;
}

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export async function loadStops(
  db: Db,
  directionId: string,
  attribution: AttributionResolver,
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
      created_by: stopsTable.created_by,
      updated_by: stopsTable.updated_by,
    })
    .from(stopsTable)
    .where(eq(stopsTable.direction_id, directionId))
    .orderBy(asc(stopsTable.stop_order));

  return rows.map((row) => ({
    ...row,
    created_by: attribution(row.created_by),
    updated_by: attribution(row.updated_by),
    location: row.location as unknown as GeoPoint,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  }));
}

export async function loadDetours(
  db: Db,
  directionId: string,
  attribution: AttributionResolver,
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
      is_active: detoursTable.is_active,
      created_at: detoursTable.created_at,
      updated_at: detoursTable.updated_at,
      created_by: detoursTable.created_by,
      updated_by: detoursTable.updated_by,
    })
    .from(detoursTable)
    .where(eq(detoursTable.direction_id, directionId));

  const stopsByDetour = await loadDetourStopsByDetour(
    db,
    rows.map((row) => row.detour_id),
    attribution,
  );

  return rows.map((row) => ({
    ...row,
    created_by: attribution(row.created_by),
    updated_by: attribution(row.updated_by),
    entry: row.entry as unknown as GeoPoint,
    exit: row.exit as unknown as GeoPoint,
    detour_polyline: row.detour_polyline as unknown as GeoLineString,
    detour_stops: stopsByDetour.get(row.detour_id) ?? [],
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  }));
}

/** A Stop of the Direction by id, whether base or detour-owned. */
export async function loadDirectionStopLocation(
  db: Db,
  directionId: string,
  stopId: string,
): Promise<GeoPoint | null> {
  const [baseStop] = await db
    .select({ location: asGeoJSON(stopsTable.location) })
    .from(stopsTable)
    .where(
      and(
        eq(stopsTable.stop_id, stopId),
        eq(stopsTable.direction_id, directionId),
      ),
    )
    .limit(1);
  if (baseStop) return baseStop.location as unknown as GeoPoint;

  const [detourStop] = await db
    .select({ location: asGeoJSON(detourStopsTable.location) })
    .from(detourStopsTable)
    .innerJoin(
      detoursTable,
      eq(detourStopsTable.detour_id, detoursTable.detour_id),
    )
    .where(
      and(
        eq(detourStopsTable.detour_stop_id, stopId),
        eq(detoursTable.direction_id, directionId),
      ),
    )
    .limit(1);
  return detourStop ? (detourStop.location as unknown as GeoPoint) : null;
}

/** Detour stops for a set of detours, grouped by detour_id in stop order. */
export async function loadDetourStopsByDetour(
  db: Db,
  detourIds: string[],
  attribution: AttributionResolver,
): Promise<Map<string, DetourStopEntity[]>> {
  if (detourIds.length === 0) return new Map();
  const rows = await db
    .select({
      detour_stop_id: detourStopsTable.detour_stop_id,
      detour_id: detourStopsTable.detour_id,
      stop_order: detourStopsTable.stop_order,
      name: detourStopsTable.name,
      location: asGeoJSON(detourStopsTable.location),
      type: detourStopsTable.type,
      is_guaranteed_service: detourStopsTable.is_guaranteed_service,
      landmark_hint: detourStopsTable.landmark_hint,
      notes: detourStopsTable.notes,
      created_at: detourStopsTable.created_at,
      updated_at: detourStopsTable.updated_at,
      created_by: detourStopsTable.created_by,
      updated_by: detourStopsTable.updated_by,
    })
    .from(detourStopsTable)
    .where(inArray(detourStopsTable.detour_id, detourIds))
    .orderBy(detourStopsTable.stop_order);

  const grouped = new Map<string, DetourStopEntity[]>();
  for (const row of rows) {
    const entry: DetourStopEntity = {
      detour_stop_id: row.detour_stop_id,
      detour_id: row.detour_id,
      stop_order: row.stop_order,
      name: row.name,
      location: row.location as unknown as GeoPoint,
      type: row.type,
      is_guaranteed_service: row.is_guaranteed_service,
      landmark_hint: row.landmark_hint,
      notes: row.notes,
      created_at: iso(row.created_at),
      updated_at: iso(row.updated_at),
      created_by: attribution(row.created_by),
      updated_by: attribution(row.updated_by),
    };
    const list = grouped.get(row.detour_id) ?? [];
    list.push(entry);
    grouped.set(row.detour_id, list);
  }
  return grouped;
}

export async function loadRestrictions(
  db: Db,
  directionId: string,
  attribution: AttributionResolver,
): Promise<RestrictionEntity[]> {
  const rows = await db
    .select({
      restriction_id: restrictionsTable.restriction_id,
      direction_id: restrictionsTable.direction_id,
      detour_id: restrictionsTable.detour_id,
      from_coord_index: restrictionsTable.from_coord_index,
      to_coord_index: restrictionsTable.to_coord_index,
      kind: restrictionsTable.kind,
      note: restrictionsTable.note,
      is_active: restrictionsTable.is_active,
      created_at: restrictionsTable.created_at,
      updated_at: restrictionsTable.updated_at,
      created_by: restrictionsTable.created_by,
      updated_by: restrictionsTable.updated_by,
    })
    .from(restrictionsTable)
    .where(eq(restrictionsTable.direction_id, directionId));

  return rows.map((row) => ({
    ...row,
    created_by: attribution(row.created_by),
    updated_by: attribution(row.updated_by),
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  }));
}

export async function loadDirectionSummary(
  db: Db,
  directionId: string,
  attribution: AttributionResolver,
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
      version: directionsTable.version,
      created_at: directionsTable.created_at,
      updated_at: directionsTable.updated_at,
      created_by: directionsTable.created_by,
      updated_by: directionsTable.updated_by,
    })
    .from(directionsTable)
    .where(eq(directionsTable.direction_id, directionId))
    .limit(1);

  if (!row) {
    return null;
  }
  return {
    ...row,
    created_by: attribution(row.created_by),
    updated_by: attribution(row.updated_by),
    base_polyline: row.base_polyline as unknown as GeoLineString,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

export async function loadDirectionFull(
  db: Db,
  directionId: string,
  attribution: AttributionResolver,
): Promise<DirectionEntity | null> {
  const summary = await loadDirectionSummary(db, directionId, attribution);
  if (!summary) {
    return null;
  }
  const [stops, detours, restrictions] = await Promise.all([
    loadStops(db, directionId, attribution),
    loadDetours(db, directionId, attribution),
    loadRestrictions(db, directionId, attribution),
  ]);
  return { ...summary, stops, detours, restrictions };
}
