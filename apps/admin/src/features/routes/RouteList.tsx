import { useEffect, useMemo, useState } from "react";
import { readOverviewCache } from "@/lib/overviewCache";
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
import { Switch } from "@/components/ui/switch";
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
import { pathFromConnections } from "@/lib/connections";
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
  /** Leave the editor (Back) — wired by the orchestrator so it can restore
   *  a prior focus state (edit → focus, T5) instead of always overview. */
  onCloseEdit?: () => void;
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
export function RouteList({ onCreateRoute, onCloseEdit }: RouteListProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<RouteStatusFilter>("all");
  const [deleteTarget, setDeleteTarget] = useState<RouteSummary | null>(null);

  const routesQuery = useRoutesQuery();
  const routeId = usePlottingStore((s) => s.routeId);
  const routeQuery = useRouteQuery(routeId);
  const deleteMutation = useDeleteRouteMutation();

  const stops = usePlottingStore((s) => s.stops);
  const routeMeta = usePlottingStore((s) => s.routeMeta);
  const setRouteMeta = usePlottingStore((s) => s.setRouteMeta);
  const saving = usePlottingStore((s) => s.saving);
  const connections = usePlottingStore((s) => s.connections);
  // Closed loops (FR-004): the last stop connects back to the first.
  const closedLoop =
    pathFromConnections(connections, stops).closed && stops.length >= 3;
  const selection = usePlottingStore((s) => s.selection);
  const setSelection = usePlottingStore((s) => s.setSelection);
  const reorderStop = usePlottingStore((s) => s.reorderStop);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const routes = useMemo(() => routesQuery.data ?? [], [routesQuery.data]);
  const detail = routeId !== null;

  // Load an existing plotted direction into the surface once its detail
  // arrives (FR-002), then frame the whole route. Phase 2 (smooth
  // transitions): the cached overview payload seeds the surface INSTANTLY on
  // route open — no network round-trip, so the edit view never shows a blank
  // frame — and the detail fetch then UPGRADES a pristine cache seed with the
  // full stop fields + directionId. Never stomps real edits.
  useEffect(() => {
    const store = usePlottingStore.getState();
    if (store.routeId === null || store.routeId !== routeId) return;

    // 1) Detail arrived: fill an empty draft, or upgrade a pristine cache
    //    seed (same stop ids, untouched since the seed → safe to replace with
    //    the authoritative row).
    const base = routeQuery.data?.directions[0];
    if (base && routeQuery.data?.route_id === routeId) {
      const state = usePlottingStore.getState();
      const pristineCacheSeed =
        state.seedSource === "cache" &&
        !state.draftDirty &&
        state.stops.length > 0 &&
        state.stops.length === base.stops.length &&
        state.stops.every((stop, i) => stop.id === base.stops[i]?.stop_id);
      if (state.stops.length === 0 || pristineCacheSeed) {
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
          base.base_polyline, // closes the chain when the route is a loop (FR-004)
        );
        store.setPolyline(base.base_polyline);
        // The loaded route is the saved baseline — undo back to it hides Save.
        store.captureSavedBaseline();
        store.requestFit();
        usePlottingStore.setState({ seedSource: "detail" });
      }
      return; // dirty draft — never clobber
    }

    // 2) Detail not ready yet: seed instantly from the cached overview
    //    payload so the polyline + markers paint the moment the view opens.
    if (usePlottingStore.getState().stops.length > 0) return;
    const cached = readOverviewCache();
    const row = cached?.find((r) => r.route_id === routeId);
    if (!row?.base_polyline) return;
    usePlottingStore.getState().seedFromOverview({
      polyline: row.base_polyline,
      stops: row.stops.map((stop) => ({
        id: stop.stop_id,
        name: stop.name,
        type: stop.type,
        location: stop.location.coordinates,
      })),
    });
  }, [routeId, routeQuery.data]);

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

  /** Inserts a stop right after the given stop, mid-way to its successor. */
  const insertAfter = (stopId: string) => {
    const current = usePlottingStore.getState().stops;
    const index = current.findIndex((s) => s.id === stopId);
    if (index === -1) return;
    const anchor = current[index];
    const successor = current[index + 1];
    const location = successor
      ? [
          (anchor.location[0] + successor.location[0]) / 2,
          (anchor.location[1] + successor.location[1]) / 2,
        ]
      : // No successor: drop the new stop slightly off the anchor so it is
        // visible and draggable instead of hidden underneath.
        [anchor.location[0] + 0.0005, anchor.location[1] + 0.0005];
    usePlottingStore
      .getState()
      .insertStopBetween(stopId, location as [number, number]);
  };

  const empty =
    !routesQuery.isLoading && !routesQuery.isError && routes.length === 0;

  return (
    <>
      {detail ? (
        <nav
          aria-label="Route stops"
          className="flex min-h-0 w-full flex-col overflow-hidden rounded-lg border bg-white p-2"
        >
          <div className="flex shrink-0 items-center gap-1.5 px-1 pb-1.5">
            <button
              type="button"
              aria-label="Back to routes"
              onClick={
                onCloseEdit ??
                (() => usePlottingStore.getState().openRoute(null))
              }
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
            <div className="flex shrink-0 items-center gap-1.5">
              <Switch
                checked={
                  routeMeta?.isActive ?? routeQuery.data?.is_active ?? false
                }
                onCheckedChange={(checked) =>
                  setRouteMeta({ isActive: checked })
                }
                disabled={saving}
                aria-label="Active route"
                className="scale-90"
              />
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col border-t pt-1.5">
            <div className="flex shrink-0 items-center justify-between px-1 pb-1">
              <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Stops
              </span>
              <span className="flex items-center gap-1.5">
                {closedLoop && (
                  <span
                    className="rounded-sm border border-[#1B6DB2]/40 bg-[#1B6DB2]/10 px-1.5 text-[10px] leading-4 font-medium text-[#1B6DB2]"
                    title="Last stop connects back to the first — circular route"
                  >
                    Loop
                  </span>
                )}
                <span className="text-muted-foreground text-xs tabular-nums">
                  {stops.length}
                </span>
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
                    <div className="group" key={stop.id}>
                      <button
                        type="button"
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData(
                            "text/plain",
                            String(index),
                          );
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
                        onKeyDown={(event) => {
                          if (event.key === "ArrowUp" && index > 0) {
                            event.preventDefault();
                            reorderStop(index, index - 1);
                          } else if (
                            event.key === "ArrowDown" &&
                            index < stops.length - 1
                          ) {
                            // reorderStop inserts BEFORE the target row, so a
                            // down-move needs target = index + 2.
                            event.preventDefault();
                            reorderStop(index, index + 2);
                          }
                        }}
                        aria-label={`Select ${stop.name}`}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg border px-1.5 py-1.5 text-left transition-colors",
                          selected
                            ? "border-primary/50 bg-primary/5"
                            : "hover:bg-muted border-transparent",
                          isDragging && "opacity-40",
                          isDropTarget && "border-t-primary border-t-2",
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
                          className="h-4 shrink-0 border px-1 text-[11px] font-medium"
                          style={{
                            backgroundColor: shape.color,
                            borderColor: shape.color,
                            color:
                              stop.type === "waiting_area"
                                ? "#201A10"
                                : "#ffffff",
                          }}
                        >
                          {STOP_TYPE_LABELS[stop.type]}
                        </Badge>
                      </button>
                      {/* Insert-after indicator: the wrapper collapses to zero
                          height when hidden (max-h-0 + overflow-hidden) so the
                          list stays compact. The appear is DELIBERATE: the
                          hover state carries a 400 ms transition-delay, so the
                          indicator only shows after hovering the gap briefly
                          (distinguishing intent from casual mouse movement);
                          the base state has zero delay, so it disappears
                          immediately on leave (Pasted #42/#43/#44). The icon
                          is centered via flex on a full-width button. */}
                      <div className="max-h-0 overflow-hidden transition-[max-height] delay-0 duration-150 group-hover:max-h-8 group-hover:delay-[550ms] focus-within:max-h-8">
                        <button
                          type="button"
                          aria-label={`Insert stop after ${stop.name}`}
                          onClick={() => insertAfter(stop.id)}
                          className="text-muted-foreground hover:text-primary flex w-full items-center justify-center py-0.5"
                        >
                          <Plus className="size-3" />
                        </button>
                      </div>
                    </div>
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
        </nav>
      ) : (
        <nav
          aria-label="Routes"
          className="flex min-h-0 w-full flex-col overflow-hidden rounded-lg border bg-white p-2"
        >
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
        </nav>
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
              This permanently deletes “{deleteTarget?.name}” and its plotted
              stops from the database. This action can’t be undone.
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
