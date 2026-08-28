import type {
  CoordinatePair,
  GeoLineString,
  GeoPoint,
  OverviewRouteEntity,
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
  created_at: string;
  updated_at: string;
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
  created_at: string;
  updated_at: string;
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
  name: string;
  type: StopType;
  location: GeoPoint;
  is_guaranteed_service?: boolean;
  landmark_hint?: string | null;
  notes?: string | null;
}

export interface SaveDirectionPayload {
  label: string;
  base_polyline: GeoLineString;
  stops: SaveStopPayload[];
}

/** Flat base-direction payload returned by the atomic save + its derived return. */
export interface DirectionSaveResult {
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
): Promise<{ route_id: string }> {
  const { data } = await api.delete<{ route_id: string }>(
    `/api/admin/routes/${routeId}`,
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
  >,
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
  payload: SaveDirectionPayload,
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
  payload: SaveDirectionPayload,
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
