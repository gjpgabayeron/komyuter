import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { routeKeys } from "@/lib/queryKeys";
import { readOverviewCache, writeOverviewCache } from "@/lib/overviewCache";
import {
  patchRouteCreated,
  patchRouteDeleted,
  patchRouteFromSave,
  patchRouteMeta,
} from "./routeCache";
import type {
  CreateRoutePayload,
  DetourEntity,
  DirectionEntity,
  DirectionSaveResult,
  RouteDetail,
  RouteSummary,
  SaveDetourPayload,
  SaveDirectionPayload,
  StopEntity,
  UpdateDetourPayload,
} from "./routesApi";
import {
  createDetour,
  createRoute,
  deleteRoute,
  listDetours,
  listOverview,
  getDirectionStops,
  getRoute,
  listDirections,
  listRoutes,
  replaceDirection,
  saveDirection,
  deleteDetour,
  updateDetour,
  updateRoute,
} from "./routesApi";

/** Route summary list (listRoutes); refetched on window focus so remote
 *  (multi-admin) changes surface without push infrastructure. */
export function useRoutesQuery() {
  return useQuery({
    queryKey: routeKeys.all,
    queryFn: listRoutes,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
}

/** Overview geometry (all routes' polylines/stops for the overview map),
 *  warmed from the localStorage overview cache for instant reloads. */
export function useOverviewQuery() {
  const query = useQuery({
    queryKey: routeKeys.overview,
    queryFn: listOverview,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    // Warm reloads render the cached geometry IMMEDIATELY alongside the map
    // (no blank state); the refetch then replaces it and RouteOverviewLayer
    // fades the fresh data in. The function form reads localStorage only
    // while the query is actually loading.
    placeholderData: () => readOverviewCache() ?? undefined,
  });
  // Mirror fresh data back to localStorage so the NEXT reload is instant
  // too. Skipped while the placeholder is on screen (that IS the cached
  // value — writing it back would be a needless churn).
  useEffect(() => {
    if (query.data && !query.isPlaceholderData) {
      writeOverviewCache(query.data);
    }
  }, [query.data, query.isPlaceholderData]);
  return query;
}

/** Single route detail (heaviest payload — 30 s stale, 5 min cache).
 *  Disabled until routeId is set. */
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

/** A route's directions list. Disabled until routeId is set. */
export function useDirectionsQuery(routeId: string | null) {
  return useQuery<DirectionEntity[]>({
    queryKey: routeKeys.directions(routeId ?? ""),
    queryFn: () => listDirections(routeId as string),
    enabled: routeId !== null,
    gcTime: 5 * 60_000,
  });
}

/** A direction's stops list. Disabled until directionId is set. */
export function useDirectionStopsQuery(directionId: string | null) {
  return useQuery<StopEntity[]>({
    queryKey: routeKeys.directionStops(directionId ?? ""),
    queryFn: () => getDirectionStops(directionId as string),
    enabled: directionId !== null,
    gcTime: 5 * 60_000,
  });
}

/** Create a route; patches the route-list cache and toasts success. */
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

/** Delete a route; patches the route-list cache and toasts success. */
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

/** Update route metadata; patches the cache and toasts success. */
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

/** Save a new direction (stops + path) for a route; patches the cache.
 *  CONFLICT errors are surfaced as an inline banner, not a toast. */
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

/** Replace an existing direction (stops + path); patches the cache.
 *  CONFLICT errors are surfaced as an inline banner, not a toast. */
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

/** A direction's detours (alternative routes). Disabled until directionId. */
export function useDetoursQuery(directionId: string | null) {
  return useQuery<DetourEntity[]>({
    queryKey: routeKeys.detours(directionId ?? ""),
    queryFn: () => listDetours(directionId as string),
    enabled: directionId !== null,
    gcTime: 5 * 60_000,
  });
}

/** Create a detour for a direction; invalidates the detours list. */
export function useCreateDetourMutation(directionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SaveDetourPayload) =>
      createDetour(directionId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: routeKeys.detours(directionId),
      });
      toast.success("Detour saved.");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

/** Update a detour (metadata, geometry, notable stops, or activation). */
export function useUpdateDetourMutation(directionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { detourId: string; patch: UpdateDetourPayload }) =>
      updateDetour(args.detourId, args.patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: routeKeys.detours(directionId),
      });
      toast.success("Detour updated.");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

/** Permanently delete a detour (destructive); invalidates the detours list. */
export function useDeleteDetourMutation(directionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (detourId: string) => deleteDetour(detourId),
    onSuccess: (_result, detourId) => {
      void queryClient.invalidateQueries({
        queryKey: routeKeys.detours(directionId),
      });
      queryClient.removeQueries({
        queryKey: routeKeys.detour(directionId, detourId),
      });
      toast.success("Detour deleted.");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
