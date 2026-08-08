import { useEffect, useMemo, useRef, useState } from "react";
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
import { clearDraft, createDebouncedDraftWriter, loadDraft } from "@/lib/draft";
import type { DraftPayload } from "@/lib/draft";
import { DraftRestoreBanner } from "@/features/routes/DraftRestoreBanner";
import { pathCoversStops, pathEndsOnStops } from "@/lib/coords";
import type { SaveDirectionPayload } from "@/features/routes/routesApi";
import { getRoute, snapPreview } from "@/features/routes/routesApi";
import { queryClient } from "@/lib/queryClient";
import { routeKeys } from "@/lib/queryKeys";
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
  const [draftOffer, setDraftOffer] = useState<DraftPayload | null>(null);

  const routeQuery = useRouteQuery(routeId);
  const routesQuery = useRoutesQuery();

  const routes = useMemo(() => routesQuery.data ?? [], [routesQuery.data]);
  const routesLoaded = !routesQuery.isLoading && !routesQuery.isError;
  const noRoutes = routesLoaded && routes.length === 0;
  const hasRoute = routeId !== null;
  const overviewMode = !hasRoute && !noRoutes && routesLoaded;
  // URL param seeds the store; the overlay is then the source of truth.
  useEffect(() => {
    usePlottingStore.getState().openRoute(routeParam ?? null);
  }, [routeParam]);

  // Bind the snap network call once (the store owns the debounce orchestration).
  useEffect(() => {
    bindSnapFetcher((coordinates) => snapPreview(coordinates));
    return () => bindSnapFetcher(null);
  }, []);

  // --- FR-014: client-local draft (24 h TTL, debounced ~500 ms writes) ---
  const draftWriterRef = useRef(createDebouncedDraftWriter());

  // Persist the plotting draft to localStorage whenever there are unsaved
  // changes and a route is open. The draft is never sent to the server.
  useEffect(() => {
    return usePlottingStore.subscribe((state, prevState) => {
      if (state.routeId === null) return;
      if (state.draftDirty) {
        draftWriterRef.current.save({
          routeId: state.routeId,
          directionId: state.directionId,
          stops: state.stops,
          polyline: state.polyline,
          connections: state.connections,
          history: state.history,
          routeMeta: state.routeMeta,
          pathStopIds: state.pathStopIds,
        });
        return;
      }
      // Just became clean (undo back to the baseline / save) — drop the
      // stored draft so a stale copy is never offered again.
      if (prevState.draftDirty) {
        clearDraft(state.routeId, state.directionId);
        draftWriterRef.current.cancel();
      }
    });
  }, []);

  // Flush a pending draft write before the tab goes away.
  useEffect(() => {
    const writer = draftWriterRef.current;
    const flush = () => writer.flush();
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      writer.flush();
    };
  }, []);

  // Offer the stored draft when a route (re)opens and a fresh load landed.
  // The offer is made once per route/direction session (guarded by restoredRef)
  // and never after the 24 h TTL (loadDraft returns null then — FR-014).
  const restoredRef = useRef<string | null>(null);
  useEffect(() => {
    if (routeId === null || !routeQuery.data) return;
    const directionId = routeQuery.data.directions[0]?.direction_id ?? null;
    const key = `${routeId}/${directionId}`;
    if (restoredRef.current === key) return;
    if (usePlottingStore.getState().stops.length === 0) return;
    const draft = loadDraft(routeId, directionId);
    if (draft) setDraftOffer(draft);
  }, [routeQuery.data, routeId]);

  const restoreDraft = (draft: DraftPayload) => {
    restoredRef.current = `${draft.routeId}/${draft.directionId}`;
    usePlottingStore.getState().restoreDraft(draft);
    clearDraft(draft.routeId, draft.directionId);
    setDraftOffer(null);
  };

  const discardDraft = (draft: DraftPayload) => {
    restoredRef.current = `${draft.routeId}/${draft.directionId}`;
    clearDraft(draft.routeId, draft.directionId);
    draftWriterRef.current.cancel();
    setDraftOffer(null);
  };

  const createSave = useSaveDirectionMutation(routeId ?? "");
  const replaceSave = useReplaceDirectionMutation(directionId ?? "");
  const updateMeta = useUpdateRouteMutation(routeId ?? "");

  /** Persists the plotting draft (stops + path). Returns true on success. */
  const savePlot = async (): Promise<boolean> => {
    await usePlottingStore.getState().resolvePendingSnap();
    // Save exactly what the admin sees (FR-008): road-snapped responses are
    // auto-committed the moment they land, so the draft polyline already is
    // the road-following path — never straight lines (FR-009).
    const store = usePlottingStore.getState();
    const { stops, polyline, directionId: editingId } = store;

    // Single-mode plotting: the route path follows the stop list in order.
    const saveStops = stops;

    if (saveStops.length < 2) {
      toast.error("A route needs at least 2 stops (a start and an end stop).");
      return false;
    }
    if (!polyline) {
      toast.error(
        "The road-following path hasn't loaded yet — wait a moment, then save again.",
      );
      return false;
    }
    const endpoints = pathEndsOnStops(polyline, saveStops);
    if (!endpoints.ok) {
      toast.error(
        endpoints.reason === "start"
          ? "The path must start on a stop."
          : "The path must end on a stop (or return to the start stop for a loop).",
      );
      return false;
    }
    // The committed path must cover EVERY stop, not just the endpoints. A
    // partial undo (path change popped, stop edit still applied) or a snap
    // failure can leave a stale polyline — never persist mismatched data.
    if (!pathCoversStops(polyline, saveStops)) {
      toast.error(
        "The road-following path doesn't match the current stops — undo or adjust, then save again.",
      );
      return false;
    }
    // The path must also have been derived for the CURRENT stop sequence —
    // pathCoversStops alone can't see a stale excursion through a removed
    // stop (the surviving stops still lie on the old path).
    const { pathStopIds } = usePlottingStore.getState();
    if (
      pathStopIds === null ||
      pathStopIds.length !== saveStops.length ||
      !pathStopIds.every((id, i) => id === saveStops[i].id)
    ) {
      toast.error(
        "The road-following path is out of sync with the stops — undo or wait for the path to update, then save again.",
      );
      return false;
    }

    const payload: SaveDirectionPayload = {
      // Auto-default base label; the server derives the return label (FR-012).
      label: `To ${saveStops[saveStops.length - 1].name}`,
      base_polyline: polyline,
      stops: saveStops.map((stop) => ({
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
      // Passing the polyline here re-derives pathStopIds from the SERVER's
      // stop ids (new routes get fresh ids) — without it, a later name/type
      // edit would false-block save on the path↔stop equality guard.
      store.setStops(
        result.stops.map((stop) => ({
          id: stop.stop_id,
          name: stop.name,
          type: stop.type,
          location: stop.location.coordinates,
        })),
        result.base_polyline,
      );
      // The persisted state is the new baseline — the draft matches it exactly.
      store.captureSavedBaseline();
      store.setSnap({
        status: "idle",
        polyline: null,
        distanceMeters: null,
        snapped: false,
        warning: null,
      });
      store.setSelection(clearSelection);
      // A saved route is the new baseline — the undo history no longer applies.
      store.clearHistory();
      // The persisted state is the draft's content too — stop offering/keeping it.
      clearDraft(store.routeId, store.directionId);
      draftWriterRef.current.cancel();
      setDraftOffer(null);
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
  /** Load-latest recovery for a save conflict: refetch the server detail and
   *  replace the local drafting draft with it (after an explicit confirm — the
   *  admin's unsaved edits are discarded). Reuses the same seed the load
   *  effect uses, so the surface returns to a consistent, saved state. */
  const loadLatest = async () => {
    if (routeId === null) return;
    if (
      !window.confirm(
        "Discard your unsaved changes and load the latest version?",
      )
    ) {
      return;
    }
    const detail = await queryClient.fetchQuery({
      queryKey: routeKeys.detail(routeId),
      queryFn: () => getRoute(routeId as string),
    });
    const base = detail.directions[0];
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
      base.base_polyline,
    );
    store.setPolyline(base.base_polyline);
    store.captureSavedBaseline();
    store.clearHistory();
    store.setRouteMeta({
      name: detail.name,
      shortName: detail.short_name,
      color: detail.color ?? ROUTE_COLORS[0],
      isActive: detail.is_active,
      fareConfigId: detail.fare_config_id ?? null,
    });
    setConflict(false);
  };

  const showSave = routeId !== null && (draftDirty || metaDirty);

  // --- FR-014: unsaved-changes navigation guard ---
  // Dirty state read at event time (not captured in closures).
  const dirtyRef = useRef(false);
  dirtyRef.current = showSave;

  // Tab close / refresh: ask before the page unloads.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // In-app navigation (sidebar links, navigate()): BrowserRouter's history
  // calls the patched pushState/replaceState at click time, so intercepting
  // them asks before leaving. Back/forward buttons bypass this — the draft
  // keeps the work recoverable either way.
  useEffect(() => {
    const confirmLeave = () =>
      !dirtyRef.current ||
      window.confirm(
        "You have unsaved route changes. Leave anyway? Your work is kept as a draft on this device.",
      );
    const originalPush = window.history.pushState;
    const originalReplace = window.history.replaceState;
    window.history.pushState = ((
      data: unknown,
      unused: string,
      url?: string | URL | null,
    ) => {
      if (!confirmLeave()) return;
      originalPush.call(window.history, data, unused, url);
    }) as typeof window.history.pushState;
    window.history.replaceState = ((
      data: unknown,
      unused: string,
      url?: string | URL | null,
    ) => {
      if (!confirmLeave()) return;
      originalReplace.call(window.history, data, unused, url);
    }) as typeof window.history.replaceState;
    return () => {
      window.history.pushState = originalPush;
      window.history.replaceState = originalReplace;
    };
  }, []);

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

  const showSnapWarning = !snap.snapped && snap.warning !== null;

  useHotkeys("mod+s", () => void saveAll(), {
    enabled: hasRoute && !saving,
    preventDefault: true,
  });

  // Undo/redo the plotting draft (FR-013/FR-019/FR-020).
  useHotkeys("mod+z", () => usePlottingStore.getState().undo(), {
    enabled: hasRoute && !saving,
    preventDefault: true,
  });
  useHotkeys("mod+shift+z", () => usePlottingStore.getState().redo(), {
    enabled: hasRoute && !saving,
    preventDefault: true,
  });

  return (
    <div className="relative h-full w-full overflow-hidden">
      <RouteMap className="absolute inset-0">
        {overviewMode && <RouteOverviewLayer />}
      </RouteMap>

      {!noRoutes && <RouteList onCreateRoute={() => setNewRouteOpen(true)} />}
      <PropertiesPanel />
      {overviewMode && <OverviewRoutePanel />}

      {hasRoute ? (
        <>
          {draftOffer && (
            <DraftRestoreBanner
              draft={draftOffer}
              onRestore={() => restoreDraft(draftOffer)}
              onDiscard={() => discardDraft(draftOffer)}
            />
          )}
          <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2">
            <PlotActionBar
              onUndo={() => usePlottingStore.getState().undo()}
              onRedo={() => usePlottingStore.getState().redo()}
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
          <div className="bg-background/60 absolute inset-0 z-5 backdrop-blur-sm" />
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
            size="sm"
            variant="outline"
            className="h-7 shrink-0 px-2 text-xs"
            onClick={() => void loadLatest()}
          >
            Load latest
          </Button>
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
