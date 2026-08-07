import type {
  CoordinatePair,
  GeoLineString,
  GeoPoint,
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

export async function createRoute(
  payload: CreateRoutePayload,
): Promise<RouteSummary> {
  const { data } = await api.post<RouteSummary>("/api/admin/routes", payload);
  return data;
}

/** Soft-deletes (deactivates) a route. */
export async function deleteRoute(
  routeId: string,
): Promise<{ route_id: string; is_active: boolean }> {
  const { data } = await api.delete<{ route_id: string; is_active: boolean }>(
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
