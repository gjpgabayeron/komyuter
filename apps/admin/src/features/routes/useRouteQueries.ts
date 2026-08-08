import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { routeKeys } from "@/lib/queryKeys";
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
  });
}

export function useOverviewQuery() {
  return useQuery({
    queryKey: routeKeys.overview,
    queryFn: listOverview,
    staleTime: 30_000,
  });
}

export function useRouteQuery(routeId: string | null) {
  return useQuery<RouteDetail>({
    queryKey: routeKeys.detail(routeId ?? ""),
    queryFn: () => getRoute(routeId as string),
    enabled: routeId !== null,
  });
}

export function useDirectionsQuery(routeId: string | null) {
  return useQuery<DirectionEntity[]>({
    queryKey: routeKeys.directions(routeId ?? ""),
    queryFn: () => listDirections(routeId as string),
    enabled: routeId !== null,
  });
}

export function useDirectionStopsQuery(directionId: string | null) {
  return useQuery<StopEntity[]>({
    queryKey: routeKeys.directionStops(directionId ?? ""),
    queryFn: () => getDirectionStops(directionId as string),
    enabled: directionId !== null,
  });
}

export function useCreateRouteMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateRoutePayload) => createRoute(payload),
    onSuccess: (route: RouteSummary) => {
      void queryClient.invalidateQueries({ queryKey: routeKeys.all });
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
      void queryClient.invalidateQueries({ queryKey: routeKeys.all });
      void queryClient.invalidateQueries({
        queryKey: routeKeys.detail(routeId),
      });
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: routeKeys.all });
      void queryClient.invalidateQueries({
        queryKey: routeKeys.detail(routeId),
      });
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: routeKeys.all });
      void queryClient.invalidateQueries({
        queryKey: routeKeys.detail(routeId),
      });
      void queryClient.invalidateQueries({
        queryKey: routeKeys.directions(routeId),
      });
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
      void queryClient.invalidateQueries({ queryKey: routeKeys.all });
      void queryClient.invalidateQueries({
        queryKey: routeKeys.detail(result.route_id),
      });
      void queryClient.invalidateQueries({
        queryKey: routeKeys.directions(result.route_id),
      });
    },
    onError: (error: Error) => {
      if (error instanceof ApiError && error.code === "CONFLICT") return;
      toast.error(error.message);
    },
  });
}
