import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { routeKeys } from "@/lib/queryKeys";
import {
  patchRouteCreated,
  patchRouteDeleted,
  patchRouteFromSave,
  patchRouteMeta,
} from "./routeCache";
import type {
  CreateRoutePayload,
  DirectionEntity,
  DirectionSaveResult,
  RouteDetail,
  RouteSummary,
  SaveDirectionPayload,
  StopEntity,
} from "./routesApi";
import {
  createRoute,
  deleteRoute,
  listOverview,
  getDirectionStops,
  getRoute,
  listDirections,
  listRoutes,
  replaceDirection,
  saveDirection,
  updateRoute,
} from "./routesApi";

export function useRoutesQuery() {
  return useQuery({
    queryKey: routeKeys.all,
    queryFn: listRoutes,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    // Cheap summary rows: refetch on tab focus so remote (multi-admin) route
    // changes surface without any push infrastructure (manual freshness).
    refetchOnWindowFocus: true,
  });
}

export function useOverviewQuery() {
  return useQuery({
    queryKey: routeKeys.overview,
    queryFn: listOverview,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
}

export function useRouteQuery(routeId: string | null) {
  return useQuery<RouteDetail>({
    queryKey: routeKeys.detail(routeId ?? ""),
    queryFn: () => getRoute(routeId as string),
    enabled: routeId !== null,
    // Route details are the heaviest payload — cache for 5 min so reopening a
    // route (or switching between routes) reuses the cached copy, and treat
    // them as fresh for 30 s (no refetch on every render).
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
}

export function useDirectionsQuery(routeId: string | null) {
  return useQuery<DirectionEntity[]>({
    queryKey: routeKeys.directions(routeId ?? ""),
    queryFn: () => listDirections(routeId as string),
    enabled: routeId !== null,
    gcTime: 5 * 60_000,
  });
}

export function useDirectionStopsQuery(directionId: string | null) {
  return useQuery<StopEntity[]>({
    queryKey: routeKeys.directionStops(directionId ?? ""),
    queryFn: () => getDirectionStops(directionId as string),
    enabled: directionId !== null,
    gcTime: 5 * 60_000,
  });
}

export function useCreateRouteMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateRoutePayload) => createRoute(payload),
    onSuccess: (route: RouteSummary) => {
      patchRouteCreated(queryClient, route);
      toast.success(`Route "${route.name}" created.`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useDeleteRouteMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (routeId: string) => deleteRoute(routeId),
    onSuccess: (_result, routeId) => {
      patchRouteDeleted(queryClient, routeId);
      toast.success("Route deleted.");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useUpdateRouteMutation(routeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Parameters<typeof updateRoute>[1]) =>
      updateRoute(routeId, patch),
    onSuccess: (route: RouteSummary) => {
      patchRouteMeta(queryClient, route);
      toast.success("Route updated.");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useSaveDirectionMutation(routeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SaveDirectionPayload) =>
      saveDirection(routeId, payload),
    onSuccess: (result: DirectionSaveResult) => {
      patchRouteFromSave(queryClient, result);
    },
    onError: (error: Error) => {
      // A save conflict surfaces as an inline banner, not a toast (edge case).
      if (error instanceof ApiError && error.code === "CONFLICT") return;
      toast.error(error.message);
    },
  });
}

export function useReplaceDirectionMutation(directionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SaveDirectionPayload) =>
      replaceDirection(directionId, payload),
    onSuccess: (result: DirectionSaveResult) => {
      patchRouteFromSave(queryClient, result);
    },
    onError: (error: Error) => {
      if (error instanceof ApiError && error.code === "CONFLICT") return;
      toast.error(error.message);
    },
  });
}
