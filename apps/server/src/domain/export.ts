import type {
  ExportDataset,
  ExportDetour,
  ExportDirection,
  ExportFareConfiguration,
  ExportRestriction,
  ExportRoute,
  ExportStop,
} from "@komyuter/shared";
import {
  EXPORT_SCHEMA_VERSION,
  EXPORT_COORDINATE_ORDER,
} from "@komyuter/shared";
import type { Db } from "../config/db";
import {
  detours as detoursTable,
  directions as directionsTable,
  fareConfigs as fareConfigsTable,
  restrictions as restrictionsTable,
  routes as routesTable,
  stops as stopsTable,
} from "../db/schema";
import { asGeoJSON } from "../db/queries";

export function num(value: unknown): number {
  return Number(value);
}

export interface ExportRows {
  routeRows: Array<{
    route_id: string;
    name: string;
    short_name: string;
    color: string | null;
    is_active: boolean;
    fare_config_id: string | null;
  }>;
  fareRows: Array<{
    fare_config_id: string;
    label: string;
    base_fare: unknown;
    base_distance_km: unknown;
    rate_per_km: unknown;
    student_discount_pct: unknown;
    senior_discount_pct: unknown;
    is_default: boolean;
  }>;
  directionRows: Array<{
    direction_id: string;
    route_id: string;
    label: string;
    is_active: boolean;
    origin_stop_id: string | null;
    destination_stop_id: string | null;
    base_polyline: unknown;
  }>;
  stopRows: Array<{
    stop_id: string;
    direction_id: string;
    name: string;
    type: ExportStop["type"];
    stop_order: number;
    is_guaranteed_service: boolean;
    landmark_hint: string | null;
    location: unknown;
  }>;
  detourRows: Array<{
    detour_id: string;
    direction_id: string;
    label: string;
    entry: unknown;
    exit: unknown;
    detour_polyline: unknown;
    additional_distance_meters: number | null;
    commuter_instruction: string;
    driver_instruction: string | null;
    notable_stops: unknown;
  }>;
  restrictionRows: Array<{
    restriction_id: string;
    direction_id: string;
    from_coord_index: number;
    to_coord_index: number;
    reason: ExportRestriction["reason"];
    affects: ExportRestriction["affects"];
    note: string | null;
  }>;
}

export function buildExportDataset(
  rows: ExportRows,
  exportedAt: string,
): ExportDataset {
  const {
    routeRows,
    fareRows,
    directionRows,
    stopRows,
    detourRows,
    restrictionRows,
  } = rows;

  const fareConfigs: ExportFareConfiguration[] = fareRows.map((row) => ({
    fare_config_id: row.fare_config_id,
    label: row.label,
    base_fare: num(row.base_fare),
    base_distance_km: num(row.base_distance_km),
    rate_per_km: num(row.rate_per_km),
    student_discount_pct: num(row.student_discount_pct),
    senior_discount_pct: num(row.senior_discount_pct),
    is_default: row.is_default,
  }));

  const stopsByDirection = new Map<string, ExportStop[]>();
  for (const stop of stopRows) {
    const list = stopsByDirection.get(stop.direction_id) ?? [];
    list.push({
      stop_id: stop.stop_id,
      name: stop.name,
      type: stop.type,
      stop_order: stop.stop_order,
      is_guaranteed_service: stop.is_guaranteed_service,
      landmark_hint: stop.landmark_hint,
      location: stop.location as unknown as ExportStop["location"],
    });
    stopsByDirection.set(stop.direction_id, list);
  }
  for (const list of Array.from(stopsByDirection.values())) {
    list.sort((a, b) => a.stop_order - b.stop_order);
  }

  const detoursByDirection = new Map<string, ExportDetour[]>();
  for (const detour of detourRows) {
    const list = detoursByDirection.get(detour.direction_id) ?? [];
    list.push({
      detour_id: detour.detour_id,
      label: detour.label,
      entry: detour.entry as unknown as ExportDetour["entry"],
      exit: detour.exit as unknown as ExportDetour["exit"],
      detour_polyline:
        detour.detour_polyline as unknown as ExportDetour["detour_polyline"],
      additional_distance_meters: detour.additional_distance_meters,
      commuter_instruction: detour.commuter_instruction,
      driver_instruction: detour.driver_instruction,
      notable_stops: (detour.notable_stops ??
        []) as ExportDetour["notable_stops"],
    });
    detoursByDirection.set(detour.direction_id, list);
  }

  const restrictionsByDirection = new Map<string, ExportRestriction[]>();
  for (const restriction of restrictionRows) {
    const list = restrictionsByDirection.get(restriction.direction_id) ?? [];
    list.push({
      restriction_id: restriction.restriction_id,
      from_coord_index: restriction.from_coord_index,
      to_coord_index: restriction.to_coord_index,
      reason: restriction.reason,
      affects: restriction.affects,
      note: restriction.note,
    });
    restrictionsByDirection.set(restriction.direction_id, list);
  }

  const directionsByRoute = new Map<string, ExportDirection[]>();
  for (const direction of directionRows) {
    const list = directionsByRoute.get(direction.route_id) ?? [];
    list.push({
      direction_id: direction.direction_id,
      label: direction.label,
      is_active: direction.is_active,
      terminals: {
        origin: direction.origin_stop_id,
        destination: direction.destination_stop_id,
      },
      base_polyline:
        direction.base_polyline as unknown as ExportDirection["base_polyline"],
      stops: stopsByDirection.get(direction.direction_id) ?? [],
      detours: detoursByDirection.get(direction.direction_id) ?? [],
      restrictions: restrictionsByDirection.get(direction.direction_id) ?? [],
    });
    directionsByRoute.set(direction.route_id, list);
  }

  const routes: ExportRoute[] = routeRows.map((route) => ({
    route_id: route.route_id,
    name: route.name,
    short_name: route.short_name,
    color: route.color ?? "",
    is_active: route.is_active,
    fare_config_id: route.fare_config_id,
    directions: directionsByRoute.get(route.route_id) ?? [],
  }));

  return {
    schema_version: EXPORT_SCHEMA_VERSION,
    coordinate_order: EXPORT_COORDINATE_ORDER,
    exported_at: exportedAt,
    fare_configs: fareConfigs,
    routes,
  };
}

export async function assembleExportDataset(db: Db): Promise<ExportDataset> {
  const rows = await readExportRows(db);
  return buildExportDataset(rows, new Date().toISOString());
}

export async function readExportRows(db: Db): Promise<ExportRows> {
  const [
    routeRows,
    fareRows,
    directionRows,
    stopRows,
    detourRows,
    restrictionRows,
  ] = await Promise.all([
    db
      .select({
        route_id: routesTable.route_id,
        name: routesTable.name,
        short_name: routesTable.short_name,
        color: routesTable.color,
        is_active: routesTable.is_active,
        fare_config_id: routesTable.fare_config_id,
      })
      .from(routesTable),
    db
      .select({
        fare_config_id: fareConfigsTable.fare_config_id,
        label: fareConfigsTable.label,
        base_fare: fareConfigsTable.base_fare,
        base_distance_km: fareConfigsTable.base_distance_km,
        rate_per_km: fareConfigsTable.rate_per_km,
        student_discount_pct: fareConfigsTable.student_discount_pct,
        senior_discount_pct: fareConfigsTable.senior_discount_pct,
        is_default: fareConfigsTable.is_default,
      })
      .from(fareConfigsTable),
    db
      .select({
        direction_id: directionsTable.direction_id,
        route_id: directionsTable.route_id,
        label: directionsTable.label,
        is_active: directionsTable.is_active,
        origin_stop_id: directionsTable.origin_stop_id,
        destination_stop_id: directionsTable.destination_stop_id,
        base_polyline: asGeoJSON(directionsTable.base_polyline),
      })
      .from(directionsTable),
    db
      .select({
        stop_id: stopsTable.stop_id,
        direction_id: stopsTable.direction_id,
        name: stopsTable.name,
        type: stopsTable.type,
        stop_order: stopsTable.stop_order,
        is_guaranteed_service: stopsTable.is_guaranteed_service,
        landmark_hint: stopsTable.landmark_hint,
        location: asGeoJSON(stopsTable.location),
      })
      .from(stopsTable),
    db
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
      })
      .from(detoursTable),
    db
      .select({
        restriction_id: restrictionsTable.restriction_id,
        direction_id: restrictionsTable.direction_id,
        from_coord_index: restrictionsTable.from_coord_index,
        to_coord_index: restrictionsTable.to_coord_index,
        reason: restrictionsTable.reason,
        affects: restrictionsTable.affects,
        note: restrictionsTable.note,
      })
      .from(restrictionsTable),
  ]);

  return {
    routeRows,
    fareRows,
    directionRows,
    stopRows,
    detourRows,
    restrictionRows,
  };
}

export function referenceCheck(dataset: ExportDataset): string[] {
  const problems: string[] = [];
  const directionIds = new Set(
    dataset.routes.flatMap((route) =>
      route.directions.map((d) => d.direction_id),
    ),
  );
  const stopIds = new Set(
    dataset.routes.flatMap((route) =>
      route.directions.flatMap((d) => d.stops.map((s) => s.stop_id)),
    ),
  );

  for (const route of dataset.routes) {
    for (const direction of route.directions) {
      if (
        direction.terminals.origin &&
        !stopIds.has(direction.terminals.origin)
      ) {
        problems.push(
          `Direction ${direction.direction_id} origin terminal ${direction.terminals.origin} is not a known stop`,
        );
      }
      if (
        direction.terminals.destination &&
        !stopIds.has(direction.terminals.destination)
      ) {
        problems.push(
          `Direction ${direction.direction_id} destination terminal ${direction.terminals.destination} is not a known stop`,
        );
      }
      for (const detour of direction.detours) {
        if (directionIds.has(detour.detour_id)) {
          problems.push(
            `Detour id ${detour.detour_id} collides with a direction id`,
          );
        }
      }
      for (const stop of direction.stops) {
        if (directionIds.has(stop.stop_id)) {
          problems.push(`Stop id ${stop.stop_id} collides with a direction id`);
        }
      }
    }
  }
  return problems;
}
