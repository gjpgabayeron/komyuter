import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useHotkeys } from "react-hotkeys-hook";
import { toast } from "sonner";
import { SaveIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import {
  bindSnapFetcher,
  usePlottingStore,
  type RouteMetaDraft,
} from "@/lib/plottingStore";
import { clearSelection } from "@/lib/selection";
import { pathEndsOnStops } from "@/lib/coords";
import type { SaveDirectionPayload } from "@/features/routes/routesApi";
import { snapPreview } from "@/features/routes/routesApi";
import { RouteMap } from "@/features/routes/RouteMap";
import { RouteList } from "@/features/routes/RouteList";
import { RouteOverviewLayer } from "@/features/routes/RouteOverviewLayer";
import { OverviewRoutePanel } from "@/features/routes/OverviewRoutePanel";
import { EmptyState } from "@/features/routes/EmptyState";
import { NewRouteDialog } from "@/features/routes/NewRouteDialog";
import { PlotActionBar } from "@/features/routes/PlotActionBar";
import { PropertiesPanel } from "@/features/routes/PropertiesPanel";
import { ROUTE_COLORS } from "@/features/routes/routeColors";
import {
  useReplaceDirectionMutation,
  useRouteQuery,
  useRoutesQuery,
  useSaveDirectionMutation,
  useUpdateRouteMutation,
} from "@/features/routes/useRouteQueries";

const SNAP_WARNING_COPY: Record<string, string> = {
  no_token:
    "Road following is off — showing a straight line. Add a MAPBOX_SECRET_TOKEN to enable it.",
  upstream_error:
    "Road following is unavailable right now — showing a straight line. Place another stop to retry.",
};

function isRouteMetaDirty(
  meta: RouteMetaDraft,
  route: {
    name: string;
    short_name: string;
    color: string | null;
    is_active: boolean;
    fare_config_id: string | null;
  },
): boolean {
  return (
    meta.name !== route.name ||
    meta.shortName !== route.short_name ||
    meta.color !== (route.color ?? ROUTE_COLORS[0]) ||
    meta.isActive !== route.is_active ||
    (meta.fareConfigId ?? null) !== (route.fare_config_id ?? null)
  );
}

export default function RouteWorkspace() {
  const { routeId: routeParam } = useParams<{ routeId: string }>();
  const routeId = usePlottingStore((s) => s.routeId);
  const directionId = usePlottingStore((s) => s.directionId);
  const snap = usePlottingStore((s) => s.snap);
  const draftDirty = usePlottingStore((s) => s.draftDirty);
  const routeMeta = usePlottingStore((s) => s.routeMeta);
  const saving = usePlottingStore((s) => s.saving);

  const [newRouteOpen, setNewRouteOpen] = useState(false);
  const [conflict, setConflict] = useState(false);

  const routeQuery = useRouteQuery(routeId);
  const routesQuery = useRoutesQuery();

  const routes = useMemo(() => routesQuery.data ?? [], [routesQuery.data]);
  const routesLoaded = !routesQuery.isLoading && !routesQuery.isError;
  const noRoutes = routesLoaded && routes.length === 0;
  const hasRoute = routeId !== null;
  const overviewMode = !hasRoute && !noRoutes && routesLoaded;
  const plottedRoutes = useMemo(
    () => routes.filter((route) => route.direction_count > 0),
    [routes],
  );

  // URL param seeds the store; the overlay is then the source of truth.
  useEffect(() => {
    usePlottingStore.getState().openRoute(routeParam ?? null);
  }, [routeParam]);

  // Bind the snap network call once (the store owns the debounce orchestration).
  useEffect(() => {
    bindSnapFetcher((coordinates) => snapPreview(coordinates));
    return () => bindSnapFetcher(null);
  }, []);

  const createSave = useSaveDirectionMutation(routeId ?? "");
  const replaceSave = useReplaceDirectionMutation(directionId ?? "");
  const updateMeta = useUpdateRouteMutation(routeId ?? "");

  /** Persists the plotting draft (stops + path). Returns true on success. */
  const savePlot = async (): Promise<boolean> => {
    await usePlottingStore.getState().resolvePendingSnap();
    const {
      stops,
      polyline,
      directionId: editingId,
    } = usePlottingStore.getState();

    if (stops.length < 2) {
      toast.error("A route needs at least 2 stops (a start and an end stop).");
      return false;
    }
    if (!polyline) {
      toast.error("Apply the previewed path before saving.");
      return false;
    }
    const endpoints = pathEndsOnStops(polyline, stops);
    if (!endpoints.ok) {
      toast.error(
        endpoints.reason === "start"
          ? "The path must start on a stop."
          : "The path must end on a stop (or return to the start stop for a loop).",
      );
      return false;
    }

    const payload: SaveDirectionPayload = {
      // Auto-default base label; the server derives the return label (FR-012).
      label: `To ${stops[stops.length - 1].name}`,
      base_polyline: polyline,
      stops: stops.map((stop) => ({
        name: stop.name,
        type: stop.type,
        location: { type: "Point", coordinates: stop.location },
      })),
    };

    try {
      const result = editingId
        ? await replaceSave.mutateAsync(payload)
        : await createSave.mutateAsync(payload);
      toast.success("Route plotted and saved.");
      // Reflect the persisted state in the draft and clear any pending edits
      // (FR-027: one atomic save persisted base + stops + derived return).
      const store = usePlottingStore.getState();
      store.setDirectionId(result.direction_id);
      store.setStops(
        result.stops.map((stop) => ({
          id: stop.stop_id,
          name: stop.name,
          type: stop.type,
          location: stop.location.coordinates,
        })),
      );
      store.setPolyline(result.base_polyline);
      store.setSnap({
        status: "idle",
        polyline: null,
        distanceMeters: null,
        snapped: false,
        warning: null,
      });
      store.setSelection(clearSelection);
      setConflict(false);
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.code === "CONFLICT") {
        setConflict(true);
        toast.error(
          "Another Administrator edited this route. Your work is still here — reload to see the latest, or adjust and save again.",
        );
      } else {
        toast.error(error instanceof Error ? error.message : "Save failed.");
      }
      return false;
    }
  };

  const route = routeQuery.data;
  const metaDirty =
    route !== undefined &&
    routeMeta !== null &&
    isRouteMetaDirty(routeMeta, route);
  const showSave = routeId !== null && (draftDirty || metaDirty);

  /** Single consolidated save: plotting draft first, then route metadata. */
  const saveAll = async () => {
    usePlottingStore.getState().setSaving(true);
    try {
      if (draftDirty && !(await savePlot())) return;
      const meta = usePlottingStore.getState().routeMeta;
      const current = routeQuery.data;
      if (current && meta && isRouteMetaDirty(meta, current)) {
        const updated = await updateMeta.mutateAsync({
          name: meta.name.trim() || current.name,
          short_name: meta.shortName.trim() || current.short_name,
          color: meta.color,
          is_active: meta.isActive,
          fare_config_id: meta.fareConfigId,
        });
        usePlottingStore.getState().setRouteMeta({
          name: updated.name,
          shortName: updated.short_name,
          color: updated.color ?? ROUTE_COLORS[0],
          isActive: updated.is_active,
          fareConfigId: updated.fare_config_id ?? null,
        });
      }
      usePlottingStore.getState().setDraftDirty(false);
    } finally {
      usePlottingStore.getState().setSaving(false);
    }
  };

  const showSnapWarning =
    snap.status === "preview" && !snap.snapped && snap.warning !== null;

  useHotkeys("mod+s", () => void saveAll(), {
    enabled: hasRoute && !saving,
    preventDefault: true,
  });

  return (
    <div className="relative h-full w-full overflow-hidden">
      <RouteMap className="absolute inset-0">
        {overviewMode && <RouteOverviewLayer routes={plottedRoutes} />}
      </RouteMap>

      {!noRoutes && <RouteList onCreateRoute={() => setNewRouteOpen(true)} />}
      <PropertiesPanel />
      {overviewMode && <OverviewRoutePanel />}

      {hasRoute ? (
        <>
          <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2">
            <PlotActionBar
              onApply={() => usePlottingStore.getState().applySnapPreview()}
              onRevert={() => usePlottingStore.getState().revertSnapPreview()}
            />
            {showSave && (
              <Button
                size="icon"
                onClick={() => void saveAll()}
                disabled={saving}
                aria-label={saving ? "Saving changes" : "Save changes"}
              >
                <SaveIcon />
              </Button>
            )}
          </div>
          {showSnapWarning && snap.warning && (
            <div
              role="status"
              className="border-warning/60 bg-warning text-foreground absolute bottom-16 left-1/2 z-10 w-max max-w-sm -translate-x-1/2 rounded-lg border px-3 py-1.5 text-xs"
            >
              {SNAP_WARNING_COPY[snap.warning] ?? snap.warning}
            </div>
          )}
        </>
      ) : noRoutes ? (
        <>
          <div className="bg-background/60 absolute inset-0 z-[5] backdrop-blur-sm" />
          <EmptyState onCreateRoute={() => setNewRouteOpen(true)} />
        </>
      ) : null}

      {conflict && (
        <div
          role="alert"
          className="border-destructive/40 absolute top-3 left-1/2 z-20 flex max-w-md -translate-x-1/2 items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm"
        >
          <span className="text-destructive font-medium">Save conflict</span>
          <span className="text-muted-foreground">
            Another Administrator edited this route. Your work is still here —
            reload to see the latest, or adjust and save again.
          </span>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Dismiss conflict notice"
            onClick={() => setConflict(false)}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      )}

      <NewRouteDialog open={newRouteOpen} onOpenChange={setNewRouteOpen} />
    </div>
  );
}
