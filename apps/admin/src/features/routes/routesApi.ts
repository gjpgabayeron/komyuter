import type {
  Attribution,
  CoordinatePair,
  GeoLineString,
  GeoPoint,
  OverviewRouteEntity,
  Restriction,
  RestrictionKind,
  SnappedPath,
  StopType,
} from "@komyuter/shared";
import { api } from "@/lib/api";

/** GET /api/admin/routes row. */
export interface RouteSummary {
  route_id: string;
  name: string;
  short_name: string;
  color: string | null;
  is_active: boolean;
  fare_config_id: string | null;
  /** Route Version (ADR-0020): the base a metadata save sends back. */
  version: number;
  created_at: string;
  updated_at: string;
  created_by: Attribution;
  updated_by: Attribution;
  direction_count: number;
}

export interface StopEntity {
  stop_id: string;
  direction_id: string;
  name: string;
  stop_order: number;
  type: StopType;
  location: GeoPoint;
  is_guaranteed_service: boolean;
  landmark_hint: string | null;
  notes: string | null;
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
  /** Present in the RouteDetail flow (detail endpoint embeds stops); NOT
   *  populated by the directions LIST endpoint (`loadDirectionSummary`), so
   *  list-driven consumers must fetch stops via the dedicated stops query. */
  stops: StopEntity[];
}

/** GET /api/admin/routes/:routeId row. */
export interface RouteDetail {
  route_id: string;
  name: string;
  short_name: string;
  color: string | null;
  is_active: boolean;
  fare_config_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  created_by: Attribution;
  updated_by: Attribution;
  directions: DirectionEntity[];
}

export interface CreateRoutePayload {
  name: string;
  short_name: string;
  color?: string | null;
  fare_config_id?: string | null;
  is_active?: boolean;
}

export interface SaveStopPayload {
  /** The id this stop already has on the server (ADR-0031). A stop the
   *  plotter just placed sends no id; the save names it. */
  stop_id?: string;
  name: string;
  type: StopType;
  location: GeoPoint;
  is_guaranteed_service?: boolean;
  landmark_hint?: string | null;
  notes?: string | null;
}

export interface CreateDirectionPayload {
  label: string;
  base_polyline: GeoLineString;
  stops: SaveStopPayload[];
}

/** A replace carries the Direction Version it was based on (ADR-0020). */
export type ReplaceDirectionPayload = CreateDirectionPayload & {
  base_version: number;
};

/** Flat base-direction payload returned by the atomic save + its derived return. */
export interface DirectionSaveResult {
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
  stops: StopEntity[];
  /** Warnings for active main-route restrictions whose positional range no
   *  longer matches the polyline this save persisted. The save succeeds; the
   *  operator can re-range them against the saved path. */
  restriction_warnings?: string[];
  return_direction: Omit<DirectionSaveResult, "return_direction">;
}

export async function listRoutes(): Promise<RouteSummary[]> {
  const { data } = await api.get<RouteSummary[]>("/api/admin/routes");
  return data;
}

/** GET /api/admin/routes/overview — every route's base/return polylines +
 *  stops in ONE request (perf audit: replaces the N+1 overview fetches). */
export async function listOverview(): Promise<OverviewRouteEntity[]> {
  const { data } = await api.get<OverviewRouteEntity[]>(
    "/api/admin/routes/overview",
  );
  return data;
}

export async function createRoute(
  payload: CreateRoutePayload,
): Promise<RouteSummary> {
  const { data } = await api.post<RouteSummary>("/api/admin/routes", payload);
  return data;
}

/** Hard-deletes a route (and its plotted directions + stops via cascade). */
export async function deleteRoute(
  routeId: string,
  baseVersion: number,
): Promise<{ route_id: string }> {
  const { data } = await api.delete<{ route_id: string }>(
    `/api/admin/routes/${routeId}?base_version=${baseVersion}`,
  );
  return data;
}

/** Updates route metadata (name, short name, colour, status, fare config). */
export async function updateRoute(
  routeId: string,
  patch: Partial<
    Pick<
      CreateRoutePayload,
      "name" | "short_name" | "color" | "fare_config_id"
    > & { is_active?: boolean }
  > & { base_version: number },
): Promise<RouteSummary> {
  const { data } = await api.put<RouteSummary>(
    `/api/admin/routes/${routeId}`,
    patch,
  );
  return data;
}

export async function getRoute(routeId: string): Promise<RouteDetail> {
  const { data } = await api.get<RouteDetail>(`/api/admin/routes/${routeId}`);
  return data;
}

export async function listDirections(
  routeId: string,
): Promise<DirectionEntity[]> {
  const { data } = await api.get<DirectionEntity[]>(
    `/api/admin/routes/${routeId}/directions`,
  );
  return data;
}

export async function getDirectionStops(
  directionId: string,
): Promise<StopEntity[]> {
  const { data } = await api.get<StopEntity[]>(
    `/api/admin/directions/${directionId}/stops`,
  );
  return data;
}

/** Atomic create: base direction + stops + derived return in one transaction. */
export async function saveDirection(
  routeId: string,
  payload: CreateDirectionPayload,
): Promise<DirectionSaveResult> {
  const { data } = await api.post<DirectionSaveResult>(
    `/api/admin/routes/${routeId}/directions`,
    payload,
  );
  return data;
}

/** Atomic replace: replaces the direction + re-derives its return. */
export async function replaceDirection(
  directionId: string,
  payload: ReplaceDirectionPayload,
): Promise<DirectionSaveResult> {
  const { data } = await api.put<DirectionSaveResult>(
    `/api/admin/directions/${directionId}`,
    payload,
  );
  return data;
}

/** Road-following preview via the admin Mapbox proxy ([lng,lat] order). */
export async function snapPreview(
  coordinates: CoordinatePair[],
): Promise<SnappedPath> {
  const query = coordinates.map(([lng, lat]) => `${lng},${lat}`).join(";");
  const { data } = await api.get<SnappedPath>(
    `/api/admin/mapbox/directions?coordinates=${encodeURIComponent(query)}`,
  );
  return data;
}

/** A stop owned by a detour (never part of the base chain). */
export interface DetourStopEntity {
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
  created_by: Attribution;
  updated_by: Attribution;
}

/** A detour-stop authoring input (order comes from the array position). */
export interface DetourStopInput {
  name: string;
  location: GeoPoint;
  type?: StopType;
  is_guaranteed_service?: boolean;
  landmark_hint?: string | null;
  notes?: string | null;
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

export interface SaveDetourPayload {
  label: string;
  entry: GeoPoint;
  exit: GeoPoint;
  detour_polyline: GeoLineString;
  additional_distance_meters?: number | null;
  commuter_instruction: string;
  driver_instruction?: string | null;
  detour_stops?: DetourStopInput[] | null;
}

export type UpdateDetourPayload = Partial<SaveDetourPayload> & {
  is_active?: boolean;
};

export async function listDetours(
  directionId: string,
): Promise<DetourEntity[]> {
  const { data } = await api.get<DetourEntity[]>(
    `/api/admin/directions/${directionId}/detours`,
  );
  return data;
}

export async function createDetour(
  directionId: string,
  payload: SaveDetourPayload,
): Promise<DetourEntity> {
  const { data } = await api.post<DetourEntity>(
    `/api/admin/directions/${directionId}/detours`,
    payload,
  );
  return data;
}

export async function updateDetour(
  detourId: string,
  patch: UpdateDetourPayload,
): Promise<DetourEntity> {
  const { data } = await api.put<DetourEntity>(
    `/api/admin/detours/${detourId}`,
    patch,
  );
  return data;
}

export async function deleteDetour(
  detourId: string,
): Promise<{ detour_id: string }> {
  const { data } = await api.delete<{ detour_id: string }>(
    `/api/admin/detours/${detourId}`,
  );
  return data;
}

/** A restriction's writable fields. `from`/`to` are base-polyline indices. */
export interface SaveRestrictionPayload {
  from_coord_index: number;
  to_coord_index: number;
  kind: RestrictionKind;
  note?: string | null;
}

export type UpdateRestrictionPayload = Partial<SaveRestrictionPayload> & {
  is_active?: boolean;
};

export async function listRestrictions(
  directionId: string,
): Promise<Restriction[]> {
  const { data } = await api.get<Restriction[]>(
    `/api/admin/directions/${directionId}/restrictions`,
  );
  return data;
}

export async function createRestriction(
  directionId: string,
  payload: SaveRestrictionPayload,
): Promise<Restriction> {
  const { data } = await api.post<Restriction>(
    `/api/admin/directions/${directionId}/restrictions`,
    payload,
  );
  return data;
}

export async function updateRestriction(
  restrictionId: string,
  patch: UpdateRestrictionPayload,
): Promise<Restriction> {
  const { data } = await api.put<Restriction>(
    `/api/admin/restrictions/${restrictionId}`,
    patch,
  );
  return data;
}

export async function deactivateRestriction(
  restrictionId: string,
): Promise<{ restriction_id: string; is_active: boolean }> {
  const { data } = await api.delete<{
    restriction_id: string;
    is_active: boolean;
  }>(`/api/admin/restrictions/${restrictionId}`);
  return data;
}
