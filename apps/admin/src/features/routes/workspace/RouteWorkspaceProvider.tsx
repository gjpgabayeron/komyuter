import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import {
  bindSnapFetcher,
  cancelPendingSnap,
  deriveUiState,
  usePlottingStore,
  type RouteMetaDraft,
  type SnapState,
  type WorkspaceUiState,
} from "@/lib/plottingStore";
import { clearSelection } from "@/lib/selection";
import { clearDraft, createDebouncedDraftWriter, loadDraft } from "@/lib/draft";
import type { DraftPayload } from "@/lib/draft";
import { pathCoversStops, pathEndsOnStops } from "@/lib/coords";
import { pathFromConnections } from "@/lib/connections";
import type { SaveDirectionPayload } from "@/features/routes/routesApi";
import { getRoute, snapPreview } from "@/features/routes/routesApi";
import { queryClient } from "@/lib/queryClient";
import { routeKeys } from "@/lib/queryKeys";
import { ROUTE_COLORS } from "@/features/routes/routeColors";
import {
  useReplaceDirectionMutation,
  useRouteQuery,
  useRoutesQuery,
  useSaveDirectionMutation,
  useUpdateRouteMutation,
} from "@/features/routes/useRouteQueries";
import { LeaveConfirmDialog } from "@/features/routes/dialogs/LeaveConfirmDialog";
import { LoadLatestDialog } from "@/features/routes/dialogs/LoadLatestDialog";
import { NavConfirmDialog } from "@/features/routes/dialogs/NavConfirmDialog";
import { NewRouteDialog } from "@/features/routes/NewRouteDialog";

/** How long the transient status notices stay visible before auto-dismissing
 *  (the "Saved just now" lifecycle plate and the "Draft restored"
 *  confirmation). 4 s matches the sonner toast default. */
const STATUS_NOTICE_MS = 4_000;

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

interface RouteWorkspaceValue {
  /** The derived four-state machine (empty / overview / focus / edit). */
  uiState: WorkspaceUiState;
  hasRoute: boolean;
  showSave: boolean;
  saving: boolean;
  snap: SnapState;
  showSnapWarning: boolean;
  /** Pending draft-restore offer (null when none). */
  draftOffer: DraftPayload | null;
  /** A save conflict is active. */
  conflict: boolean;
  /** A save just completed — transient "Saved just now" notice. */
  justSaved: boolean;
  /** A draft was just restored — transient confirmation. */
  draftRestored: boolean;
  /** Open the "create route" dialog (left-column / empty-state CTA). */
  openNewRoute: () => void;
  /** True while a workspace-owned dialog is open (Esc defers to it). */
  anyDialogOpen: boolean;
  /** Esc / Back — leave the editor (styled confirm when dirty). */
  requestCloseEdit: () => void;
  /** Single consolidated save: plotting draft then route metadata. */
  saveAll: () => Promise<void>;
  restoreDraft: (draft: DraftPayload) => void;
  discardDraft: (draft: DraftPayload) => void;
  onLoadLatest: () => void;
  onDismissConflict: () => void;
}

const RouteWorkspaceContext = createContext<RouteWorkspaceValue | null>(null);

/**
 * Owns the RouteWorkspace orchestration — route queries, the four-state
 * derivation, draft persistence (FR-014), the save/draft/conflict lifecycle,
 * the unsaved-changes navigation guards, and the styled dialogs (FR-007).
 * The page consumes a stable `useRouteWorkspace()` API instead of hosting
 * this logic inline, so the page stays a thin assembly and the behavior is
 * testable in isolation.
 */
export function RouteWorkspaceProvider({ children }: { children: ReactNode }) {
  const { routeId: routeParam } = useParams<{ routeId: string }>();
  const routeId = usePlottingStore((s) => s.routeId);
  const directionId = usePlottingStore((s) => s.directionId);
  const focusedRouteId = usePlottingStore((s) => s.focusedRouteId);
  const snap = usePlottingStore((s) => s.snap);
  const draftDirty = usePlottingStore((s) => s.draftDirty);
  const routeMeta = usePlottingStore((s) => s.routeMeta);
  const saving = usePlottingStore((s) => s.saving);

  const [newRouteOpen, setNewRouteOpen] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [draftOffer, setDraftOffer] = useState<DraftPayload | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [loadLatestOpen, setLoadLatestOpen] = useState(false);
  const [navConfirmOpen, setNavConfirmOpen] = useState(false);

  const routeQuery = useRouteQuery(routeId);
  const routesQuery = useRoutesQuery();

  const routes = useMemo(() => routesQuery.data ?? [], [routesQuery.data]);
  const routesLoaded = !routesQuery.isLoading && !routesQuery.isError;

  // --- The four-state machine (pure selector; contract §2) ---
  const uiState = deriveUiState({
    loaded: routesLoaded,
    routeCount: routes.length,
    routeId,
    focusedRouteId,
  });

  // URL param seeds the store; the store is then the source of truth.
  useEffect(() => {
    usePlottingStore.getState().openRoute(routeParam ?? null);
  }, [routeParam]);

  /** T5/T6/T7 — leave the editor (Esc / Back). Dirty edits ask first (styled
   *  confirm, FR-007 — never window.confirm); clean edits snap back to a
   *  clean overview (openRoute(null) clears focus, selection, and tool — the
   *  idle slate; the draft safety net is untouched). */
  const closeEdit = () => {
    usePlottingStore.getState().openRoute(null);
  };
  const requestCloseEdit = () => {
    if (showSave) {
      setLeaveConfirmOpen(true);
      return;
    }
    closeEdit();
  };
  const confirmLeaveEdit = () => {
    setLeaveConfirmOpen(false);
    closeEdit();
  };

  // Bind the snap network call once (the store owns the debounce orchestration).
  useEffect(() => {
    bindSnapFetcher((coordinates) => snapPreview(coordinates));
    return () => {
      bindSnapFetcher(null);
      // Never let a debounced snap timer fire after unmount (snapFetcher is
      // null by then) — a stray fetch would reject unhandled.
      cancelPendingSnap();
    };
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

  // Auto-dismiss the transient status notices ("Saved just now" after a save,
  // "Draft restored" after a restore) — no manual dismissal (US4 refinement).
  useEffect(() => {
    if (!justSaved && !draftRestored) return;
    const t = window.setTimeout(() => {
      setJustSaved(false);
      setDraftRestored(false);
    }, STATUS_NOTICE_MS);
    return () => window.clearTimeout(t);
  }, [justSaved, draftRestored]);

  const restoreDraft = (draft: DraftPayload) => {
    restoredRef.current = `${draft.routeId}/${draft.directionId}`;
    usePlottingStore.getState().restoreDraft(draft);
    clearDraft(draft.routeId, draft.directionId);
    setDraftOffer(null);
    setDraftRestored(true);
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
    const { stops, connections, polyline, directionId: editingId } = store;

    // The route path follows the CHAIN order (which for the default
    // consecutive chain equals placement order). Stops disconnected via the
    // connected-from/to dropdowns (None) are excluded from the save — they
    // are no longer part of the route path.
    const chain = pathFromConnections(connections, stops);
    const saveStops =
      chain.stopIds.length >= 2
        ? chain.stopIds
            .map((id) => stops.find((s) => s.id === id))
            .filter((s): s is (typeof stops)[number] => s !== undefined)
        : stops;

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
        "The path hasn't caught up with your latest stop order yet — wait a moment, then save again.",
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
    setLoadLatestOpen(false);
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
  // them asks before leaving — via the styled dialog (FR-007), never the
  // browser's default confirm. Back/forward buttons bypass this — the draft
  // keeps the work recoverable either way. Tab close still uses the native
  // beforeunload prompt (it cannot be styled).
  const originalNavRef = useRef<{
    push: typeof window.history.pushState;
    replace: typeof window.history.replaceState;
  } | null>(null);
  const pendingNavRef = useRef<{
    push: boolean;
    data: unknown;
    url?: string | URL | null;
  } | null>(null);
  const confirmLeaveNav = () => {
    setNavConfirmOpen(false);
    const pending = pendingNavRef.current;
    pendingNavRef.current = null;
    const original = originalNavRef.current;
    if (!pending || !original) return;
    (pending.push ? original.push : original.replace).call(
      window.history,
      pending.data,
      "",
      pending.url,
    );
  };
  const cancelLeaveNav = () => {
    pendingNavRef.current = null;
    setNavConfirmOpen(false);
  };
  useEffect(() => {
    const originalPush = window.history.pushState;
    const originalReplace = window.history.replaceState;
    originalNavRef.current = { push: originalPush, replace: originalReplace };
    window.history.pushState = ((
      data: unknown,
      unused: string,
      url?: string | URL | null,
    ) => {
      if (dirtyRef.current) {
        pendingNavRef.current = { push: true, data, url };
        setNavConfirmOpen(true);
        return;
      }
      originalPush.call(window.history, data, unused, url);
    }) as typeof window.history.pushState;
    window.history.replaceState = ((
      data: unknown,
      unused: string,
      url?: string | URL | null,
    ) => {
      if (dirtyRef.current) {
        pendingNavRef.current = { push: false, data, url };
        setNavConfirmOpen(true);
        return;
      }
      originalReplace.call(window.history, data, unused, url);
    }) as typeof window.history.replaceState;
    return () => {
      window.history.pushState = originalPush;
      window.history.replaceState = originalReplace;
      originalNavRef.current = null;
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
      // US4 scenario 2: a completed save frames the route on the map (the
      // left column already shows the open route as the active one) and shows
      // a transient "Saved just now" confirmation (auto-dismisses).
      usePlottingStore.getState().requestFit();
      setJustSaved(true);
    } catch (error) {
      // The metadata save can conflict just like the plotting save — surface
      // the same conflict notice in the status slot (never an unhandled
      // rejection that silently skips it).
      if (error instanceof ApiError && error.code === "CONFLICT") {
        setConflict(true);
        toast.error(
          "Another Administrator edited this route. Your work is still here — reload to see the latest, or adjust and save again.",
        );
      } else {
        toast.error(error instanceof Error ? error.message : "Save failed.");
      }
    } finally {
      usePlottingStore.getState().setSaving(false);
    }
  };

  const showSnapWarning = !snap.snapped && snap.warning !== null;
  const hasRoute = routeId !== null;

  // While any workspace-owned dialog is open, Esc belongs to the dialog
  // (it closes itself); the workspace's Esc steps back only when nothing
  // else claims it. Child dialogs (route delete, stop delete) are detected
  // via the DOM — any open role=dialog/alertdialog owns Esc.
  const anyDialogOpen =
    leaveConfirmOpen || loadLatestOpen || navConfirmOpen || newRouteOpen;

  const value: RouteWorkspaceValue = {
    uiState,
    hasRoute,
    showSave,
    saving,
    snap,
    showSnapWarning,
    draftOffer,
    conflict,
    justSaved,
    draftRestored,
    openNewRoute: () => setNewRouteOpen(true),
    anyDialogOpen,
    requestCloseEdit,
    saveAll,
    restoreDraft,
    discardDraft,
    onLoadLatest: () => setLoadLatestOpen(true),
    onDismissConflict: () => setConflict(false),
  };

  return (
    <RouteWorkspaceContext.Provider value={value}>
      {children}

      {/* Styled dialogs (FR-007 — never window.confirm). */}
      <LeaveConfirmDialog
        open={leaveConfirmOpen}
        onOpenChange={setLeaveConfirmOpen}
        onLeave={confirmLeaveEdit}
      />
      <LoadLatestDialog
        open={loadLatestOpen}
        onOpenChange={setLoadLatestOpen}
        onLoadLatest={() => void loadLatest()}
      />
      <NavConfirmDialog
        open={navConfirmOpen}
        onOpenChange={setNavConfirmOpen}
        onStay={cancelLeaveNav}
        onLeaveAnyway={confirmLeaveNav}
      />
      <NewRouteDialog open={newRouteOpen} onOpenChange={setNewRouteOpen} />
    </RouteWorkspaceContext.Provider>
  );
}

/** Reads the RouteWorkspace orchestration (state + actions). Must be used
 *  inside a `<RouteWorkspaceProvider>`. */
export function useRouteWorkspace(): RouteWorkspaceValue {
  const ctx = useContext(RouteWorkspaceContext);
  if (!ctx) {
    throw new Error(
      "useRouteWorkspace must be used within RouteWorkspaceProvider",
    );
  }
  return ctx;
}
