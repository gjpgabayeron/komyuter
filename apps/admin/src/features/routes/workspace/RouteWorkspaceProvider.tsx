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
import {
  clearDraft,
  createDebouncedDraftWriter,
  DRAFT_SCHEMA_VERSION,
  listDrafts,
  loadDraft,
} from "@/lib/draft";
import { writesDraft } from "@/lib/capabilities";
import { useAuth } from "@/features/auth/auth";
import { useCapabilities } from "@/features/auth/useCapabilities";
import { useDetourStore } from "@/features/detours/detourStore";
import type { DraftBase, DraftPayload, DraftSummary } from "@/lib/draft";
import type { DraftStop } from "@/lib/plottingStore";
import { pathCoversStops, pathEndsOnStops } from "@/lib/coords";
import { connectionsFromStops, pathFromConnections } from "@/lib/connections";
import type {
  CreateDirectionPayload,
  DirectionEntity,
  RouteDetail,
} from "@/features/routes/routesApi";
import { getRoute, snapPreview } from "@/features/routes/routesApi";
import {
  mergeSnapshots,
  carryChoices,
  resolveMerge,
  resolveMeta,
  takePolyline,
  type MergeChoices,
  type MergeOutcome,
} from "@/lib/merge";
import {
  anchorsToStops,
  baseSnapshot,
  draftSnapshot,
  entityToDraftStop,
  fieldsToRouteMeta,
  polylinePair,
  routeMetaFromRoute,
  serverSnapshot,
} from "@/features/routes/conflict/mergeInputs";
import { ConflictResolverDialog } from "@/features/routes/conflict/ConflictResolverDialog";
import { DeletedDirectionDialog } from "@/features/routes/conflict/DeletedDirectionDialog";
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
  /** The Account's Drafts, newest first (the restore surface is a list). */
  draftOffers: DraftSummary[];
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
  restoreDraft: (entry: DraftSummary) => void;
  discardDraft: (entry: DraftSummary) => void;
  /** Which half of the save succeeded before a conflict (null when neither). */
  saveHalf: "direction" | "metadata" | null;
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
  // The Draft lifecycle is a write to the admin's unsaved work, so a read-only
  // Account neither writes it nor is offered a restore (ticket #47: an existing
  // Draft is left untouched). See `lib/capabilities`.
  const capabilities = useCapabilities();
  const canWriteDraft = writesDraft(capabilities);
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const routeId = usePlottingStore((s) => s.routeId);
  const directionId = usePlottingStore((s) => s.directionId);
  const focusedRouteId = usePlottingStore((s) => s.focusedRouteId);
  const snap = usePlottingStore((s) => s.snap);
  const draftDirty = usePlottingStore((s) => s.draftDirty);
  const routeMeta = usePlottingStore((s) => s.routeMeta);
  const saving = usePlottingStore((s) => s.saving);

  const [newRouteOpen, setNewRouteOpen] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [draftOffers, setDraftOffers] = useState<DraftSummary[]>([]);
  const [conflictSession, setConflictSession] = useState<{
    outcome: MergeOutcome;
    route: RouteDetail;
    direction: DirectionEntity;
    names: Record<string, string>;
  } | null>(null);
  const [deletedSession, setDeletedSession] = useState<{
    routeExists: boolean;
    routeName: string;
  } | null>(null);
  const [saveHalf, setSaveHalf] = useState<"direction" | "metadata" | null>(
    null,
  );
  const lastChoicesRef = useRef<MergeChoices>({});
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

  // --- FR-014 / M2c: the Account's client-local Drafts (24 h TTL) ---
  const draftWriterRef = useRef<ReturnType<
    typeof createDebouncedDraftWriter
  > | null>(null);
  // The ancestor a three-way merge needs: the last known loaded state + Version.
  const baseRef = useRef<DraftBase | null>(null);
  const baseMetaRef = useRef<DraftBase["routeMeta"]>(null);
  const pendingRestoreRef = useRef<DraftPayload | null>(null);
  const restoredRef = useRef<string | null>(null);

  const refreshDrafts = () => {
    if (!userId || !canWriteDraft) {
      setDraftOffers([]);
      return;
    }
    setDraftOffers(listDrafts(userId));
  };

  // Capture the loaded Route metadata: it is the metadata half of the base.
  useEffect(() => {
    if (!routeQuery.data) return;
    baseMetaRef.current = {
      name: routeQuery.data.name,
      shortName: routeQuery.data.short_name,
      color: routeQuery.data.color ?? ROUTE_COLORS[0],
      isActive: routeQuery.data.is_active,
      fareConfigId: routeQuery.data.fare_config_id,
    };
  }, [routeQuery.data]);

  // Persist the Draft whenever there are unsaved changes and a route is open.
  // The Draft is never sent to the server.
  useEffect(() => {
    if (!canWriteDraft || !userId) return;
    const writer = createDebouncedDraftWriter(userId);
    draftWriterRef.current = writer;

    const unsubscribe = usePlottingStore.subscribe((state, prevState) => {
      if (state.routeId === null) return;
      if (state.draftDirty) {
        const loadedBase = state.savedBaseline
          ? {
              version:
                routeQuery.data?.directions.find(
                  (d) => d.direction_id === state.directionId,
                )?.version ?? 0,
              stops: state.savedBaseline.stops,
              polyline: state.savedBaseline.polyline,
              routeMeta: baseMetaRef.current,
            }
          : null;
        if (loadedBase) baseRef.current = loadedBase;

        writer.save({
          routeId: state.routeId,
          directionId: state.directionId,
          stops: state.stops,
          polyline: state.polyline,
          connections: state.connections,
          history: state.history,
          routeMeta: state.routeMeta,
          pathStopIds: state.pathStopIds,
          schemaVersion: DRAFT_SCHEMA_VERSION,
          base: loadedBase ?? baseRef.current,
        });
        return;
      }
      // Just became clean (undo back to the baseline / save) — drop the
      // stored Draft so a stale copy is never offered again.
      if (prevState.draftDirty) {
        clearDraft(userId, state.routeId, state.directionId);
        writer.cancel();
        refreshDrafts();
      }
    });

    // Flush a pending write before the tab goes away.
    const flush = () => writer.flush();
    window.addEventListener("beforeunload", flush);
    return () => {
      unsubscribe();
      window.removeEventListener("beforeunload", flush);
      writer.flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canWriteDraft, userId, routeQuery.data]);

  // Offer this Account's Drafts once the route and capabilities are known.
  useEffect(() => {
    if (!canWriteDraft) return;
    if (routeId === null || !routeQuery.data || !userId) return;
    refreshDrafts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeQuery.data, routeId, capabilities, canWriteDraft, userId]);

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

  const applyDraft = (draft: DraftPayload) => {
    if (!userId) return;
    restoredRef.current = `${draft.routeId}/${draft.directionId}`;
    baseRef.current = draft.base;
    if (draft.base?.routeMeta) baseMetaRef.current = draft.base.routeMeta;
    usePlottingStore.getState().restoreDraft(draft);
    clearDraft(userId, draft.routeId, draft.directionId);
    refreshDrafts();
    setDraftRestored(true);
  };

  const restoreDraft = (entry: DraftSummary) => {
    if (!userId) return;
    const draft = loadDraft(userId, entry.routeId, entry.directionId);
    if (!draft) {
      refreshDrafts();
      return;
    }
    if (entry.routeId !== routeId) {
      // Another route's Draft: open that route, restore once it has loaded.
      pendingRestoreRef.current = draft;
      usePlottingStore.getState().openRoute(entry.routeId);
      return;
    }
    applyDraft(draft);
  };

  // Restore a Draft that lives on another route, after that route has loaded.
  useEffect(() => {
    const pending = pendingRestoreRef.current;
    if (!pending || !routeQuery.data) return;
    if (routeQuery.data.route_id !== pending.routeId) return;
    pendingRestoreRef.current = null;
    const t = window.setTimeout(() => applyDraft(pending), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeQuery.data]);

  const discardDraft = (entry: DraftSummary) => {
    if (!userId) return;
    clearDraft(userId, entry.routeId, entry.directionId);
    restoredRef.current = `${entry.routeId}/${entry.directionId}`;
    draftWriterRef.current?.cancel();
    refreshDrafts();
  };

  // --- Save Conflict (ADR-0020 §3-5, ticket #55) ---
  const rememberNames = (
    direction: DirectionEntity,
    mine: readonly DraftStop[],
  ): Record<string, string> => {
    const names: Record<string, string> = {};
    for (const stop of [...direction.stops, ...mine]) {
      for (const who of [stop.created_by, stop.updated_by]) {
        if (who) names[who.userId] = who.name;
      }
    }
    return names;
  };

  const applyMerged = (
    session: {
      outcome: MergeOutcome;
      route: RouteDetail;
      direction: DirectionEntity;
    },
    choices: MergeChoices,
    side: "mine" | "theirs",
  ) => {
    lastChoicesRef.current = choices;
    const store = usePlottingStore.getState();
    const stops = anchorsToStops(resolveMerge(session.outcome, choices));
    const routeMeta = fieldsToRouteMeta(
      resolveMeta(session.outcome, choices),
      store.routeMeta,
    );
    const polyline = takePolyline(session.outcome, side) ?? store.polyline;
    const base: DraftBase = {
      version: session.direction.version,
      stops: session.direction.stops.map(entityToDraftStop),
      routeMeta: routeMetaFromRoute(session.route),
      polyline: session.direction.base_polyline,
    };
    baseRef.current = base;
    baseMetaRef.current = base.routeMeta;

    // The merged result becomes the Draft — still unsaved, still undoable.
    usePlottingStore.getState().restoreDraft({
      schemaVersion: DRAFT_SCHEMA_VERSION,
      routeId: store.routeId,
      directionId: store.directionId,
      stops,
      polyline,
      connections: connectionsFromStops(stops, polyline),
      history: store.history,
      routeMeta,
      pathStopIds: side === "mine" ? store.pathStopIds : null,
      base,
    });

    setConflictSession(null);
    setConflict(false);
    refreshDrafts();
    toast.success("Merged with the latest version — review, then save.");
  };

  /**
   * A stale save: refetch the Direction, merge it with the Draft, and either
   * apply a clean merge silently or open the resolver. Returns false when the
   * Draft has no base (a pre-M2c Draft), where only the two-way choice exists.
   */
  const beginResolution = async (): Promise<boolean> => {
    if (!routeId) return false;
    const base = baseRef.current;
    if (!base) return false;

    let fresh: RouteDetail;
    try {
      fresh = await queryClient.fetchQuery({
        queryKey: routeKeys.detail(routeId),
        queryFn: () => getRoute(routeId),
        staleTime: 0,
      });
    } catch (error) {
      if (error instanceof ApiError && error.code === "NOT_FOUND") {
        // Deletion is a conflict shape, not a terminal error (ADR-0020 risk).
        const routeExists = (routesQuery.data ?? []).some(
          (candidate) => candidate.route_id === routeId,
        );
        setDeletedSession({
          routeExists,
          routeName: routeQuery.data?.name ?? routeId,
        });
        return true;
      }
      throw error;
    }
    const direction = fresh.directions[0];
    if (!direction) return false;

    const store = usePlottingStore.getState();
    const mine = draftSnapshot(store.stops, store.routeMeta, store.polyline);
    const theirs = serverSnapshot(fresh, direction, direction.base_polyline);
    const outcome = mergeSnapshots(
      baseSnapshot(base)!,
      mine.snapshot,
      theirs.snapshot,
      polylinePair(mine.polyline, theirs.polyline),
    );

    const session = {
      outcome,
      route: fresh,
      direction,
      names: rememberNames(direction, store.stops),
    };

    if (outcome.conflicts.length === 0) {
      applyMerged(session, {}, "mine");
      return true;
    }
    setConflictSession(session);
    return true;
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

    // The Direction Version this save is based on (ADR-0020). A replace without
    // it would be last-write-wins, so a missing version stops the save rather
    // than guessing.
    const currentDirection = editingId
      ? routeQuery.data?.directions.find((d) => d.direction_id === editingId)
      : undefined;
    if (editingId && !currentDirection) {
      toast.error("Reload the route before saving.");
      return false;
    }

    const payload: CreateDirectionPayload = {
      // Auto-default base label; the server derives the return label (FR-012).
      label: `To ${saveStops[saveStops.length - 1].name}`,
      base_polyline: polyline,
      stops: saveStops.map((stop) => ({
        stop_id: stop.id,
        name: stop.name,
        type: stop.type,
        location: { type: "Point", coordinates: stop.location },
      })),
    };

    try {
      const result = editingId
        ? await replaceSave.mutateAsync({
            ...payload,
            base_version: currentDirection!.version,
          })
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
          created_by: stop.created_by,
          updated_by: stop.updated_by,
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
      if (userId) clearDraft(userId, store.routeId, store.directionId);
      draftWriterRef.current?.cancel();
      refreshDrafts();
      setConflict(false);
      setSaveHalf(null);
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.code === "VERSION_CONFLICT") {
        const resolved = await beginResolution();
        if (!resolved) {
          setConflict(true);
          toast.error(
            "This route moved and your Draft has no base to merge from. Reload to see the latest.",
          );
        }
        return false;
      }
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
        created_by: stop.created_by,
        updated_by: stop.updated_by,
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

  const showSave =
    routeId !== null && canWriteDraft && (draftDirty || metaDirty);

  // --- FR-014: unsaved-changes navigation guard ---
  // Dirty state read at event time (not captured in closures).
  const dirtyRef = useRef(false);
  dirtyRef.current = showSave;

  // The detour editor holds unsaved work too (US4): its composition is
  // drafted to localStorage continuously, but the native prompt still
  // protects the tab-close path on top of the restore offer.
  const detourOpenRef = useRef(false);
  detourOpenRef.current = useDetourStore.getState().open;

  // Tab close / refresh: ask before the page unloads.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current && !detourOpenRef.current) return;
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
    // Nothing to save without the editing Permission — the affordance is not
    // mounted, and the shortcut is inactive, so this is belt and braces.
    if (!canWriteDraft) return;
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
          base_version: current.version,
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
      setSaveHalf(null);
    } catch (error) {
      // The metadata save can conflict just like the plotting save — surface
      // the same conflict notice in the status slot (never an unhandled
      // rejection that silently skips it).
      if (
        error instanceof ApiError &&
        (error.code === "CONFLICT" || error.code === "VERSION_CONFLICT")
      ) {
        // The plotting half already saved; only the metadata half was refused.
        setSaveHalf("direction");
        setConflict(true);
        toast.error(
          "Your direction was saved. The route's details changed elsewhere — your edits are still here.",
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

  // The value object is intentionally NOT memoized, unlike the AuthProvider
  // pattern (features/auth/auth.tsx, which wraps its actions in useCallback
  // and memoizes the value). Here the sole consumer is the provider's direct
  // child (RouteWorkspaceInner), which re-renders on every provider state
  // change regardless — so memoizing would buy nothing today. If a
  // memoized/deep consumer ever appears, wrap the actions in useCallback and
  // the value in useMemo as a unit.
  const value: RouteWorkspaceValue = {
    uiState,
    hasRoute,
    showSave,
    saving,
    snap,
    showSnapWarning,
    draftOffers,
    conflict,
    saveHalf,
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
      <ConflictResolverDialog
        open={conflictSession !== null}
        outcome={conflictSession?.outcome ?? null}
        routeLabel={conflictSession?.route.name ?? ""}
        initialChoices={
          conflictSession
            ? carryChoices(
                conflictSession.outcome.conflicts,
                lastChoicesRef.current,
              )
            : {}
        }
        accountName={(accountId) => {
          if (!accountId) return "Not recorded";
          if (accountId === userId) return "You";
          return conflictSession?.names[accountId] || "Another Administrator";
        }}
        onApply={(choices, side) => {
          if (conflictSession) applyMerged(conflictSession, choices, side);
        }}
        onCancel={() => setConflictSession(null)}
      />
      <DeletedDirectionDialog
        open={deletedSession !== null}
        routeExists={deletedSession?.routeExists ?? false}
        routeLabel={deletedSession?.routeName ?? ""}
        onKeepDraft={() => setDeletedSession(null)}
        onSaveAsNew={() => {
          setDeletedSession(null);
          usePlottingStore.getState().setDirectionId(null);
          toast.success(
            "Your Draft is kept — save it to create a new direction.",
          );
        }}
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
