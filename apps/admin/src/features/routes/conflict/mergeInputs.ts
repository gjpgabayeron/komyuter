import type { GeoLineString } from "@komyuter/shared";
import type { DraftBase } from "@/lib/draft";
import type { MergeAnchor, MergePolyline, MergeSnapshot } from "@/lib/merge";
import type { DraftStop, RouteMetaDraft } from "@/lib/plottingStore";
import type { DirectionEntity, RouteDetail, StopEntity } from "../routesApi";

/**
 * The seam between the workspace's own state and the pure merge (ticket #55).
 *
 * Three shapes meet here: a Draft's stop (`DraftStop`, coordinates as a pair),
 * a server stop (`StopEntity`, GeoJSON), and the merge's `MergeAnchor`. The
 * merge never sees any of them directly, so this module owns every conversion
 * — and it is pure, so the conversions are testable without a DOM.
 */

/** The Route fields a conflict can resolve. Names are the Draft's. */
export const META_FIELDS = [
  "name",
  "shortName",
  "color",
  "isActive",
  "fareConfigId",
] as const;

export const STOP_FIELDS = [
  "name",
  "type",
  "location",
  "is_guaranteed_service",
  "landmark_hint",
  "notes",
] as const;

function stopFields(stop: {
  name: string;
  type: string;
  location: [number, number];
  is_guaranteed_service?: boolean;
  landmark_hint?: string | null;
  notes?: string | null;
}): Record<string, unknown> {
  return {
    name: stop.name,
    type: stop.type,
    location: stop.location,
    is_guaranteed_service: stop.is_guaranteed_service ?? true,
    landmark_hint: stop.landmark_hint ?? null,
    notes: stop.notes ?? null,
  };
}

export function stopToAnchor(stop: DraftStop): MergeAnchor {
  return {
    id: stop.id,
    kind: "stop",
    fields: stopFields({ ...stop, location: stop.location }),
    updatedBy: stop.updated_by?.userId ?? null,
  };
}

export function entityToAnchor(stop: StopEntity): MergeAnchor {
  return {
    id: stop.stop_id,
    kind: "stop",
    fields: stopFields({
      name: stop.name,
      type: stop.type,
      location: stop.location.coordinates,
      is_guaranteed_service: stop.is_guaranteed_service,
      landmark_hint: stop.landmark_hint,
      notes: stop.notes,
    }),
    updatedBy: stop.updated_by?.userId ?? null,
  };
}

export function metaFields(
  meta: RouteMetaDraft | null,
): Record<string, unknown> | null {
  if (!meta) return null;
  return {
    name: meta.name,
    shortName: meta.shortName,
    color: meta.color,
    isActive: meta.isActive,
    fareConfigId: meta.fareConfigId,
  };
}

export function routeMetaFields(route: RouteDetail): Record<string, unknown> {
  return {
    name: route.name,
    shortName: route.short_name,
    color: route.color,
    isActive: route.is_active,
    fareConfigId: route.fare_config_id,
  };
}

/** A snapshot plus the polyline that belongs to it (never merged). */
export interface MergeInput {
  snapshot: MergeSnapshot;
  polyline: GeoLineString | null;
}

/** The Draft as the merge sees it. */
export function draftSnapshot(
  stops: readonly DraftStop[],
  meta: RouteMetaDraft | null,
  polyline: GeoLineString | null,
): MergeInput {
  return {
    snapshot: { anchors: stops.map(stopToAnchor), meta: metaFields(meta) },
    polyline,
  };
}

/** The server's current state as the merge sees it. */
export function serverSnapshot(
  route: RouteDetail,
  direction: DirectionEntity,
  polyline: GeoLineString | null,
): MergeInput {
  return {
    snapshot: {
      anchors: direction.stops.map(entityToAnchor),
      meta: routeMetaFields(route),
    },
    polyline,
  };
}

/** The state the Draft was loaded from, or null for a legacy Draft. */
export function baseSnapshot(base: DraftBase | null): MergeSnapshot | null {
  if (!base) return null;
  return {
    anchors: base.stops.map(stopToAnchor),
    meta: metaFields(base.routeMeta),
  };
}

export function entityToDraftStop(stop: StopEntity): DraftStop {
  return {
    id: stop.stop_id,
    name: stop.name,
    type: stop.type,
    location: stop.location.coordinates,
    is_guaranteed_service: stop.is_guaranteed_service,
    landmark_hint: stop.landmark_hint,
    notes: stop.notes,
    created_by: stop.created_by,
    updated_by: stop.updated_by,
  };
}

export function routeMetaFromRoute(route: RouteDetail): RouteMetaDraft {
  return {
    name: route.name,
    shortName: route.short_name,
    color: route.color ?? "#4A90D9",
    isActive: route.is_active,
    fareConfigId: route.fare_config_id,
  };
}

export function anchorToDraftStop(anchor: MergeAnchor): DraftStop {
  const fields = anchor.fields as {
    name?: string;
    type?: DraftStop["type"];
    location?: [number, number];
    is_guaranteed_service?: boolean;
    landmark_hint?: string | null;
    notes?: string | null;
  };
  return {
    id: anchor.id,
    name: fields.name ?? "Unnamed stop",
    type: fields.type ?? "waiting_area",
    location: fields.location ?? [0, 0],
    is_guaranteed_service: fields.is_guaranteed_service,
    landmark_hint: fields.landmark_hint ?? null,
    notes: fields.notes ?? null,
  };
}

export function anchorsToStops(anchors: MergeAnchor[]): DraftStop[] {
  return anchors.map(anchorToDraftStop);
}

export function fieldsToRouteMeta(
  fields: Record<string, unknown> | null,
  fallback: RouteMetaDraft | null,
): RouteMetaDraft | null {
  if (!fields) return fallback;
  return {
    name: String(fields.name ?? fallback?.name ?? ""),
    shortName: String(fields.shortName ?? fallback?.shortName ?? ""),
    color: String(fields.color ?? fallback?.color ?? "#4A90D9"),
    isActive: Boolean(fields.isActive ?? fallback?.isActive ?? false),
    fareConfigId:
      typeof fields.fareConfigId === "string"
        ? fields.fareConfigId
        : (fallback?.fareConfigId ?? null),
  };
}

export function polylinePair(
  mine: GeoLineString | null,
  theirs: GeoLineString | null,
): MergePolyline {
  return { mine, theirs };
}

/** A human label for a conflicting anchor, for the resolver list. */
export function anchorLabel(
  anchorId: string,
  anchors: readonly MergeAnchor[],
): string {
  if (anchorId === "__meta__") return "Route details";
  const anchor = anchors.find((candidate) => candidate.id === anchorId);
  const name = anchor?.fields.name;
  return typeof name === "string" && name.length > 0 ? name : "Stop";
}

/** A field name as the plotter reads it. */
export function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    name: "Name",
    type: "Type",
    location: "Position",
    is_guaranteed_service: "Guaranteed service",
    landmark_hint: "Landmark",
    notes: "Notes",
    shortName: "Short name",
    color: "Colour",
    isActive: "Active",
    fareConfigId: "Fare configuration",
  };
  return labels[field] ?? field;
}

/** A field value as the plotter reads it. */
export function fieldValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "location" && Array.isArray(value)) {
    const [lng, lat] = value as number[];
    return `${lng.toFixed(5)}, ${lat.toFixed(5)}`;
  }
  if (field === "isActive" || field === "is_guaranteed_service") {
    return value ? "Yes" : "No";
  }
  return String(value);
}
