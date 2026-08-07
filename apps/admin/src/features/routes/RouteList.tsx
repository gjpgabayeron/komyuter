import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Pencil,
  Plus,
  Route as RouteIcon,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { isStopSelected, selectStop } from "@/lib/selection";
import { usePlottingStore } from "@/lib/plottingStore";
import { getStopShape, type StopShape } from "@/lib/stopShapes";
import { cn } from "@/lib/utils";
import {
  useDeleteRouteMutation,
  useRouteQuery,
  useRoutesQuery,
} from "./useRouteQueries";
import type { RouteSummary } from "./routesApi";
import { STOP_TYPE_LABELS } from "./stopLabels";

interface RouteListProps {
  onCreateRoute: () => void;
}

type RouteStatusFilter = "all" | "active" | "inactive";

const STATUS_FILTER_OPTIONS: { value: RouteStatusFilter; label: string }[] = [
  { value: "all", label: "All routes" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

/** Tiny marker-shaped chip classes per stop type, mirroring the map markers. */
const SHAPE_CHIP: Record<StopShape, string> = {
  square: "rounded-[3px]",
  circle: "rounded-full",
  diamond: "rotate-45 rounded-[2px]",
};

/**
 * Floating navigation overlay (FR-002). Two views:
 * - Route list (no route selected): searchable, filterable rows with status +
 *   actions, and an empty state guiding toward the first route.
 * - Route detail (route selected): back button, route header, and the route's
 *   ordered stop list; clicking a stop selects it (highlighted on map + in
 *   the right-side properties panel).
 */
export function RouteList({ onCreateRoute }: RouteListProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<RouteStatusFilter>("all");
  const [deleteTarget, setDeleteTarget] = useState<RouteSummary | null>(null);

  const routesQuery = useRoutesQuery();
  const routeId = usePlottingStore((s) => s.routeId);
  const routeQuery = useRouteQuery(routeId);
  const deleteMutation = useDeleteRouteMutation();

  const stops = usePlottingStore((s) => s.stops);
  const selection = usePlottingStore((s) => s.selection);
  const setSelection = usePlottingStore((s) => s.setSelection);
  const reorderStop = usePlottingStore((s) => s.reorderStop);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const routes = useMemo(() => routesQuery.data ?? [], [routesQuery.data]);
  const detail = routeId !== null;

  // Load an existing plotted direction into the surface once its detail
  // arrives (FR-002), then frame the whole route. Only fills an empty draft
  // so it never stomps edits.
  useEffect(() => {
    const base = routeQuery.data?.directions[0];
    if (
      !base ||
      routeQuery.data?.route_id !== usePlottingStore.getState().routeId
    ) {
      return;
    }
    if (usePlottingStore.getState().stops.length > 0) return;
    const store = usePlottingStore.getState();
    store.setDirectionId(base.direction_id);
    store.setStops(
      base.stops.map((stop) => ({
        id: stop.stop_id,
        name: stop.name,
        type: stop.type,
        location: stop.location.coordinates,
        is_guaranteed_service: stop.is_guaranteed_service,
        landmark_hint: stop.landmark_hint,
        notes: stop.notes,
      })),
    );
    store.setPolyline(base.base_polyline);
    store.requestFit();
  }, [routeQuery.data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = routes;
    if (statusFilter === "active")
      rows = rows.filter((route) => route.is_active);
    if (statusFilter === "inactive")
      rows = rows.filter((route) => !route.is_active);
    if (!q) return rows;
    return rows.filter(
      (route) =>
        route.name.toLowerCase().includes(q) ||
        route.short_name.toLowerCase().includes(q),
    );
  }, [query, statusFilter, routes]);

  const selectRoute = (selected: RouteSummary) => {
    if (selected.route_id === routeId) return;
    usePlottingStore.getState().openRoute(selected.route_id);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.route_id);
      if (deleteTarget.route_id === routeId) {
        usePlottingStore.getState().openRoute(null);
      }
    } catch {
      // Error toast handled by the mutation.
    } finally {
      setDeleteTarget(null);
    }
  };

  const empty =
    !routesQuery.isLoading && !routesQuery.isError && routes.length === 0;

  return (
    <>
      {detail ? (
        <aside className="absolute top-3 left-3 z-10 flex max-h-[calc(100dvh-9rem)] w-80 flex-col rounded-lg border bg-white p-2">
          <div className="flex items-center gap-1.5 px-1 pb-1.5">
            <button
              type="button"
              aria-label="Back to routes"
              onClick={() => usePlottingStore.getState().openRoute(null)}
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon-xs" }),
              )}
            >
              <ArrowLeft className="size-3.5" />
            </button>
            <div className="min-w-0 flex-1">
              <h2 className="text-foreground truncate text-sm font-semibold">
                {routeQuery.data?.name ?? "Route"}
              </h2>
              <div className="flex items-center gap-1.5">
                {routeQuery.data?.short_name && (
                  <span className="text-muted-foreground text-xs">
                    {routeQuery.data.short_name}
                  </span>
                )}
                {routeQuery.data && (
                  <Badge
                    variant={routeQuery.data.is_active ? "default" : "outline"}
                    className="h-4 px-1 text-[10px] font-medium"
                  >
                    {routeQuery.data.is_active ? "Active" : "Inactive"}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="border-t pt-1.5">
            <div className="flex items-center justify-between px-1 pb-1">
              <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Stops
              </span>
              <span className="text-muted-foreground text-xs tabular-nums">
                {stops.length}
              </span>
            </div>
            {stops.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 px-2 py-6 text-center">
                <p className="text-sm font-medium">No stops yet</p>
                <p className="text-muted-foreground max-w-52 text-xs">
                  Switch to the Add tool and click the map to place stops.
                </p>
              </div>
            ) : (
              <div className="overlay-scrollbar min-h-0 flex-1 space-y-0.5 overflow-y-auto">
                {stops.map((stop, index) => {
                  const selected = isStopSelected(selection, stop.id);
                  const shape = getStopShape(stop.type);
                  const isDragging = dragIndex === index;
                  const isDropTarget =
                    dropIndex === index && dragIndex !== null && !isDragging;
                  return (
                    <button
                      key={stop.id}
                      type="button"
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", String(index));
                        setDragIndex(index);
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        setDropIndex(index);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const from = Number(
                          event.dataTransfer.getData("text/plain"),
                        );
                        if (Number.isFinite(from)) reorderStop(from, index);
                        setDragIndex(null);
                        setDropIndex(null);
                      }}
                      onDragEnd={() => {
                        setDragIndex(null);
                        setDropIndex(null);
                      }}
                      onClick={() => setSelection(selectStop(stop.id))}
                      aria-label={`Select ${stop.name}`}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg border px-1.5 py-1.5 text-left transition-colors",
                        selected
                          ? "border-primary/50 bg-primary/5"
                          : "hover:bg-muted border-transparent",
                        isDragging && "opacity-40",
                        isDropTarget && "shadow-[inset_0_2px_0_0_#1B6DB2]",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center border-2 border-white text-[11px] font-bold tabular-nums ring-1 ring-black/10",
                          SHAPE_CHIP[shape.shape],
                          selected &&
                            "outline-foreground outline-2 outline-offset-1",
                        )}
                        style={{
                          backgroundColor: shape.color,
                          color:
                            stop.type === "waiting_area"
                              ? "#201A10"
                              : "#ffffff",
                        }}
                      >
                        {shape.shape === "diamond" ? (
                          <span className="-rotate-45">{index + 1}</span>
                        ) : (
                          index + 1
                        )}
                      </span>
                      <span className="text-foreground min-w-0 flex-1 truncate text-sm">
                        {stop.name}
                      </span>
                      <Badge
                        variant="outline"
                        className="h-4 shrink-0 px-1 text-[10px] font-medium"
                        style={{
                          borderColor: shape.color,
                          color: shape.color,
                        }}
                      >
                        {STOP_TYPE_LABELS[stop.type]}
                      </Badge>
                    </button>
                  );
                })}
                {stops.length > 0 && (
                  <div
                    className={cn(
                      "h-1 rounded",
                      dropIndex === stops.length
                        ? "bg-primary/40"
                        : "bg-transparent",
                    )}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      setDropIndex(stops.length);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const from = Number(
                        event.dataTransfer.getData("text/plain"),
                      );
                      if (Number.isFinite(from)) {
                        reorderStop(from, stops.length);
                      }
                      setDragIndex(null);
                      setDropIndex(null);
                    }}
                  />
                )}
              </div>
            )}
          </div>
        </aside>
      ) : (
        <aside className="absolute top-3 left-3 z-10 flex max-h-[calc(100dvh-9rem)] w-80 flex-col rounded-lg border bg-white p-2">
          {/* Row 1: search + filter */}
          <div className="flex items-center gap-1.5">
            <div className="relative min-w-0 flex-1">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search routes"
                aria-label="Search routes"
                className="h-8 pr-2 pl-7"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={(props) => (
                  <button
                    {...props}
                    type="button"
                    className={cn(
                      buttonVariants({ variant: "outline", size: "icon-sm" }),
                    )}
                    aria-label="Filter routes by status"
                  >
                    <SlidersHorizontal className="size-3.5" />
                  </button>
                )}
              />
              <DropdownMenuContent align="end" className="w-40 p-1">
                <DropdownMenuRadioGroup
                  value={statusFilter}
                  onValueChange={(value) =>
                    setStatusFilter(value as RouteStatusFilter)
                  }
                >
                  {STATUS_FILTER_OPTIONS.map((option) => (
                    <DropdownMenuRadioItem
                      key={option.value}
                      value={option.value}
                      className="gap-2 py-1.5 pr-8"
                    >
                      <span className="text-sm">{option.label}</span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Row 2: create */}
          <Button size="sm" className="mt-1.5 w-full" onClick={onCreateRoute}>
            <Plus className="size-3.5" />
            New Route
          </Button>

          {/* List / states */}
          <div className="overlay-scrollbar mt-1.5 min-h-0 flex-1 space-y-1 overflow-y-auto">
            {routesQuery.isLoading && (
              <>
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </>
            )}
            {routesQuery.isError && (
              <div className="space-y-1.5 px-1 py-2">
                <p className="text-muted-foreground text-xs">
                  Could not load routes.
                </p>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => void routesQuery.refetch()}
                >
                  Retry
                </Button>
              </div>
            )}
            {empty && (
              <div className="flex flex-col items-center gap-2 px-2 py-6 text-center">
                <div className="bg-muted text-foreground flex size-8 items-center justify-center rounded-lg">
                  <RouteIcon className="size-4" />
                </div>
                <p className="text-sm font-medium">No routes yet</p>
                <p className="text-muted-foreground text-xs">
                  Create your first route, then plot it stop by stop on the map.
                </p>
                <Button size="sm" className="mt-1" onClick={onCreateRoute}>
                  <Plus className="size-3.5" />
                  Create first route
                </Button>
              </div>
            )}
            {!empty &&
              !routesQuery.isLoading &&
              !routesQuery.isError &&
              filtered.map((route) => (
                <RouteRow
                  key={route.route_id}
                  route={route}
                  active={route.route_id === routeId}
                  onOpen={() => selectRoute(route)}
                  onDelete={() => setDeleteTarget(route)}
                />
              ))}
            {!empty &&
              !routesQuery.isLoading &&
              !routesQuery.isError &&
              filtered.length === 0 && (
                <p className="text-muted-foreground px-1 py-2 text-xs">
                  No routes match this search.
                </p>
              )}
          </div>
        </aside>
      )}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete route?</AlertDialogTitle>
            <AlertDialogDescription>
              This deactivates “{deleteTarget?.name}”. It will no longer be
              usable in the app. This action can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void confirmDelete()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function RouteRow({
  route,
  active,
  onOpen,
  onDelete,
}: {
  route: RouteSummary;
  active: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-lg border p-1.5 transition-colors",
        active
          ? "border-primary/50 bg-primary/5"
          : "hover:bg-muted border-transparent",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${route.name}`}
        className="min-w-0 flex-1 text-left"
      >
        <span className="text-foreground block truncate text-sm font-medium">
          {route.name}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5">
          <Badge
            variant={route.is_active ? "default" : "outline"}
            className="h-4 px-1 text-[10px] font-medium"
          >
            {route.is_active ? "Active" : "Inactive"}
          </Badge>
          <span
            className={cn(
              "text-muted-foreground text-[11px] tabular-nums",
              route.direction_count === 0 && "text-muted-foreground/70",
            )}
          >
            {route.direction_count > 0
              ? `${route.direction_count} direction${route.direction_count === 1 ? "" : "s"}`
              : "Not plotted"}
          </span>
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          className={cn(buttonVariants({ variant: "ghost", size: "icon-xs" }))}
          aria-label={`Edit ${route.name}`}
          onClick={onOpen}
        >
          <Pencil className="size-3" />
        </button>
        <button
          type="button"
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon-xs" }),
            "hover:bg-destructive/10 hover:text-destructive",
          )}
          aria-label={`Delete ${route.name}`}
          onClick={onDelete}
        >
          <Trash2 className="size-3" />
        </button>
      </div>
    </div>
  );
}
