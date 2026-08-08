import type { QueryClient } from "@tanstack/react-query";
import type { OverviewRouteEntity } from "@komyuter/shared";
import { routeKeys } from "@/lib/queryKeys";
import type {
  DirectionEntity,
  DirectionSaveResult,
  RouteDetail,
  RouteSummary,
} from "./routesApi";

/**
 * In-place react-query cache updates (client-cache model, perf audit round 2).
 *
 * The old flow invalidated `routeKeys.all` after EVERY mutation, which
 * refetched the route list AND every cached route detail — the redundant
 * network traffic this model eliminates. Mutations now PATCH the caches they
 * can (detail, overview, list) from the mutation response; the server remains
 * the single source of truth (its save-time 409 guards write-write conflicts).
 */

function toDirection(
  result: DirectionSaveResult | DirectionSaveResult["return_direction"],
): DirectionEntity {
  return {
    direction_id: result.direction_id,
    route_id: result.route_id,
    label: result.label,
    base_polyline: result.base_polyline,
    origin_stop_id: result.origin_stop_id,
    destination_stop_id: result.destination_stop_id,
    is_active: result.is_active,
    created_at: result.created_at,
    updated_at: result.updated_at,
    stops: result.stops,
  };
}

function leanStop(
  stop: DirectionSaveResult["stops"][number],
): OverviewRouteEntity["stops"][number] {
  return {
    stop_id: stop.stop_id,
    name: stop.name,
    type: stop.type,
    location: stop.location,
  };
}

/** After a direction save: patch the cached detail (base + derived return)
 *  and the overview entry — no refetch. */
export function patchRouteFromSave(
  queryClient: QueryClient,
  result: DirectionSaveResult,
): void {
  const routeId = result.route_id;
  queryClient.setQueryData<RouteDetail>(
    routeKeys.detail(routeId),
    (current) => {
      if (!current) return current;
      return {
        ...current,
        directions: [toDirection(result), toDirection(result.return_direction)],
      };
    },
  );
  queryClient.setQueryData<OverviewRouteEntity[]>(
    routeKeys.overview,
    (current) => {
      if (!current) return current;
      return current.map((entry) =>
        entry.route_id === routeId
          ? {
              ...entry,
              base_polyline: result.base_polyline,
              return_polyline: result.return_direction.base_polyline,
              stops: result.stops.map(leanStop),
            }
          : entry,
      );
    },
  );
}

/** After a route metadata update: patch the detail route row, the overview
 *  entry, and the list summary row — no refetch. */
export function patchRouteMeta(
  queryClient: QueryClient,
  route: RouteSummary,
): void {
  queryClient.setQueryData<RouteDetail>(
    routeKeys.detail(route.route_id),
    (current) => {
      if (!current) return current;
      return {
        ...current,
        name: route.name,
        short_name: route.short_name,
        color: route.color,
        is_active: route.is_active,
        fare_config_id: route.fare_config_id,
        updated_at: route.updated_at,
      };
    },
  );
  queryClient.setQueryData<OverviewRouteEntity[]>(
    routeKeys.overview,
    (current) => {
      if (!current) return current;
      return current.map((entry) =>
        entry.route_id === route.route_id
          ? {
              ...entry,
              name: route.name,
              color: route.color,
              is_active: route.is_active,
            }
          : entry,
      );
    },
  );
  queryClient.setQueryData<RouteSummary[]>(routeKeys.all, (current) => {
    if (!current) return current;
    return current.map((row) =>
      row.route_id === route.route_id ? route : row,
    );
  });
}

/** After a route is created: prepend the list row + append a (direction-less)
 *  overview entry — no refetch. */
export function patchRouteCreated(
  queryClient: QueryClient,
  route: RouteSummary,
): void {
  queryClient.setQueryData<RouteSummary[]>(routeKeys.all, (current) => {
    if (!current) return current;
    return [route, ...current];
  });
  queryClient.setQueryData<OverviewRouteEntity[]>(
    routeKeys.overview,
    (current) => {
      if (!current) return current;
      return [
        ...current,
        {
          route_id: route.route_id,
          name: route.name,
          color: route.color,
          is_active: route.is_active,
          base_polyline: null,
          return_polyline: null,
          stops: [],
        },
      ];
    },
  );
}

/** After a route is deleted: drop it from list + overview and evict its
 *  cached detail — the only patch that must also purge, since the record is
 *  gone server-side. */
export function patchRouteDeleted(
  queryClient: QueryClient,
  routeId: string,
): void {
  queryClient.setQueryData<RouteSummary[]>(routeKeys.all, (current) => {
    if (!current) return current;
    return current.filter((row) => row.route_id !== routeId);
  });
  queryClient.setQueryData<OverviewRouteEntity[]>(
    routeKeys.overview,
    (current) => {
      if (!current) return current;
      return current.filter((entry) => entry.route_id !== routeId);
    },
  );
  queryClient.removeQueries({ queryKey: routeKeys.detail(routeId) });
}
