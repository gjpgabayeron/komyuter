import { create } from "zustand";
import type {
  CoordinatePair,
  GeoLineString,
  SnappedPath,
  StopType,
} from "@komyuter/shared";
import type { Selection } from "./selection";
import { clearSelection } from "./selection";
import {
  connectionsFromStops,
  edgeId,
  pathFromConnections,
  setStopLink,
  type Connection,
} from "./connections";
import { polylineClosesOn } from "./coords";
import type { DraftDraft } from "./draft";
import {
  coalesceDragEntry,
  coalescePropsEntry,
  emptyHistory,
  pushHistory,
  redoChanges,
  undoChanges,
  type HistoryEntry,
  type HistoryStack,
  type StopPropsPatch,
} from "./plottingHistory";

/** Edit-mode pointer tool: Select (click/drag existing stops) or Add (click
 *  the map to insert new stops). */
export type EditTool = "select" | "add";

/** Editable route-level metadata draft (persisted via PUT /routes/:routeId). */
export interface RouteMetaDraft {
  name: string;
  shortName: string;
  color: string;
  isActive: boolean;
  fareConfigId: string | null;
}

/** An in-progress stop in the plotting draft (not yet persisted). */
export interface DraftStop {
  id: string;
  name: string;
  type: StopType;
  location: CoordinatePair;
  is_guaranteed_service?: boolean;
  landmark_hint?: string | null;
  notes?: string | null;
}

export type SnapStatus = "idle" | "pending" | "applied";

export interface SnapState {
  status: SnapStatus;
  polyline: GeoLineString | null;
  distanceMeters: number | null;
  snapped: boolean;
  warning: string | null;
}

/** Basemap style choices (Default / Minimalist / 3D). */
export type BaseMapStyle = "default" | "minimalist" | "3d";

export interface LayerVisibility {
  /** Whether the basemap is visible at all. */
  base: boolean;
  /** Which basemap style is active. */
  baseStyle: BaseMapStyle;
  /** Basemap opacity, 0 (fully transparent) to 1 (opaque). */
  baseOpacity: number;
  /** Per-stop-type marker visibility — every type is on by default and can be
   *  hidden individually (FR-016 product revision: per-type granular control,
   *  no surprise sub-filtering). */
  markers: Record<StopType, boolean>;
  /** Stop-name labels beneath markers (on by default). */
  markerLabels: boolean;
  /** Route path lines (committed draft + transient connecting line). */
  routes: boolean;
}

const DEFAULT_LAYERS: LayerVisibility = {
  base: true,
  baseStyle: "default",
  baseOpacity: 1,
  markers: {
    terminal: true,
    major_stop: true,
    waiting_area: true,
  },
  markerLabels: true,
  routes: true,
};

const EMPTY_ROUTE_META: RouteMetaDraft = {
  name: "",
  shortName: "",
  color: "#1B6DB2",
  isActive: false,
  fareConfigId: null,
};

/** Reorders a stop from one index to another, keeping every other stop in
 *  place. `to` is the target row's index (the moved stop lands at that
 *  position, pushing the rest around it). */
export function reorderStops<T>(
  stops: readonly T[],
  from: number,
  to: number,
): T[] {
  if (from === to) return [...stops];
  const next = [...stops];
  const [moved] = next.splice(from, 1);
  next.splice(to > from ? to - 1 : to, 0, moved);
  return next;
}

/**
 * True when the draft (ordered stops + committed path) is value-identical to
 * the last-saved baseline. Used to hide the Save button the moment undo/redo
 * (or any edit) brings the draft fully back to the saved state (save-visibility
 * integration with the undo/redo stack). With no baseline (`null`) the draft
 * can never be confirmed clean — the caller must keep showing Save.
 */
export function draftMatchesBaseline(
  stops: readonly DraftStop[],
  polyline: GeoLineString | null,
  baseline: {
    stops: readonly DraftStop[];
    polyline: GeoLineString | null;
  } | null,
): boolean {
  if (!baseline) return false;
  if (stops.length !== baseline.stops.length) return false;
  const stopsMatch = stops.every((stop, i) => {
    const base = baseline.stops[i];
    return (
      stop.id === base.id &&
      stop.name === base.name &&
      stop.type === base.type &&
      stop.location[0] === base.location[0] &&
      stop.location[1] === base.location[1] &&
      (stop.is_guaranteed_service ?? false) ===
        (base.is_guaranteed_service ?? false) &&
      (stop.landmark_hint ?? null) === (base.landmark_hint ?? null) &&
      (stop.notes ?? null) === (base.notes ?? null)
    );
  });
  if (!stopsMatch) return false;
  const basePolyline = baseline.polyline;
  if (polyline === null || basePolyline === null) {
    return polyline === basePolyline;
  }
  if (polyline.coordinates.length !== basePolyline.coordinates.length) {
    return false;
  }
  return polyline.coordinates.every((coord, i) => {
    const base = basePolyline.coordinates[i];
    return coord[0] === base[0] && coord[1] === base[1];
  });
}

/**
 * Stops visible under the current layer configuration (FR-016): the Markers
 * group gives per-stop-type control — each type is on by default and can be
 * hidden independently, with no sub-filtering surprises.
 */
export function visibleStopsForLayers(
  stops: readonly DraftStop[],
  layers: LayerVisibility,
): DraftStop[] {
  return stops.filter((stop) => layers.markers[stop.type] !== false);
}

/** Debounce window between the last stop placement and the snap request. */
export const SNAP_DEBOUNCE_MS = 500;

export type SnapFetcher = (
  coordinates: CoordinatePair[],
) => Promise<SnappedPath>;

// Module-scope orchestration state (deliberately outside the store: timers and
// the fetcher must survive store resets and are not part of persisted state).
let snapFetcher: SnapFetcher | null = null;
let snapTimer: ReturnType<typeof setTimeout> | null = null;
let snapGeneration = 0;
/** The history entry of the most recent stop edit that triggered a snap
 *  request. When its auto-commit lands, the snapped path MERGES into this
 *  entry (undo reverts the edit AND the path in one step) instead of pushing
 *  a separate snap_applied entry. Cleared by edits that don't own a snap. */
let lastEditEntry: HistoryEntry | null = null;

/** Binds the snap network call (wired once by the plotting surface). */
export function bindSnapFetcher(fetcher: SnapFetcher | null): void {
  snapFetcher = fetcher;
}

/** Cancels a scheduled (debounced) snap request without touching state. */
export function cancelPendingSnap(): void {
  if (snapTimer) {
    clearTimeout(snapTimer);
    snapTimer = null;
  }
}

export interface PlottingState {
  /** Route being plotted (null = no route open). */
  routeId: string | null;
  /** Existing base direction being edited (null = a new direction will be POSTed). */
  directionId: string | null;
  /** Edit-mode pointer tool (Select vs Add). */
  tool: EditTool;
  /** Temporary POI search marker; cleared on any other map interaction. */
  poi: CoordinatePair | null;
  /** Route metadata draft; null until a route's detail loads. */
  routeMeta: RouteMetaDraft | null;
  /** Consecutive-pair chain between stops (drives the from/to dropdowns). */
  connections: Connection[];
  /** True when the plotting draft has unsaved changes (drives the Save button). */
  draftDirty: boolean;
  /** True while a save is in flight — interactive actions are locked. */
  saving: boolean;
  /** Route focused in overview mode (clicked on the map); null otherwise. */
  overviewRouteId: string | null;
  /** Incremented whenever the map should reframe to the whole route. */
  fitCounter: number;
  /** Ordered draft stops (placement order = stop_order). */
  stops: DraftStop[];
  /** Committed draft path (what gets saved); null until a path exists. */
  polyline: GeoLineString | null;
  snap: SnapState;
  selection: Selection;
  layers: LayerVisibility;
  /** Undo/redo stacks (FR-013) — see `lib/plottingHistory.ts`. */
  history: HistoryStack;
  /** Snapshot of the last-saved draft (stops + path). Null until a route is
   *  loaded or saved — with no baseline the draft can never be confirmed clean
   *  (the save button stays visible). */
  savedBaseline: { stops: DraftStop[]; polyline: GeoLineString | null } | null;
  /** Ordered stop ids the committed `polyline` was derived for (the snap
   *  request's waypoints). Save requires this to match the current stops —
   *  a partial undo or a stale snap can otherwise leave a path that routes
   *  through stops that no longer exist, which endpoint checks can't see. */
  pathStopIds: string[] | null;

  setRouteId: (routeId: string | null) => void;
  setDirectionId: (directionId: string | null) => void;
  setTool: (tool: EditTool) => void;
  /** Places/clears the temporary POI search marker ([lng, lat]). */
  setPoi: (location: CoordinatePair | null) => void;
  /** Merges a patch into the route metadata draft. */
  setRouteMeta: (patch: Partial<RouteMetaDraft>) => void;
  /** Inserts a stop directly after another stop (sequence auto-reorders). */
  insertStopBetween: (
    anchorStopId: string,
    location: CoordinatePair,
    name?: string,
  ) => void;
  /** Forces the stop's chain neighbours via the property dropdowns. */
  setStopLinks: (
    stopId: string,
    patch: { from?: string | null; to?: string | null },
  ) => void;
  /** Marks the plotting draft as having unsaved changes. */
  setDraftDirty: (dirty: boolean) => void;
  /** Locks/unlocks interactions while a save is in flight. */
  setSaving: (saving: boolean) => void;
  /** Focuses/clears a route in overview mode. */
  setOverviewRouteId: (routeId: string | null) => void;
  /** Opens a route for viewing (default), clearing any draft edits. */
  openRoute: (routeId: string | null) => void;
  /** Asks the map to fit the whole route into view. */
  requestFit: () => void;
  addStop: (location: CoordinatePair, name?: string, type?: StopType) => void;
  removeStop: (stopId: string) => void;
  /** Merges a patch into a draft stop; a changed location re-requests the snap preview. */
  updateStop: (
    stopId: string,
    patch: Partial<
      Pick<
        DraftStop,
        | "name"
        | "type"
        | "location"
        | "is_guaranteed_service"
        | "landmark_hint"
        | "notes"
      >
    >,
  ) => void;
  moveStop: (stopId: string, location: CoordinatePair) => void;
  /** Reorders the stop list (drag & drop); re-requests the snap preview. */
  reorderStop: (fromIndex: number, toIndex: number) => void;
  setStops: (stops: DraftStop[], polyline?: GeoLineString | null) => void;
  setPolyline: (polyline: GeoLineString | null) => void;
  setSnap: (snap: Partial<SnapState>) => void;
  setSelection: (selection: Selection) => void;
  setLayers: (layers: Partial<LayerVisibility>) => void;
  /** Debounced road-following request for the placed stops; a road-snapped
   *  response is auto-committed to the draft (FR-008/FR-009). */
  requestSnapPreview: () => void;
  /** Settles a scheduled/in-flight snap before another placement or save (edge case). */
  resolvePendingSnap: () => Promise<SnapState>;
  /** Undo the most recent draft edit (stop placed/deleted/dragged, snap applied). */
  undo: () => void;
  /** Re-apply the most recently undone edit. */
  redo: () => void;
  /** Empties both stacks (called after a successful save). */
  clearHistory: () => void;
  /** Records the current draft as the saved baseline (after load/save). */
  captureSavedBaseline: () => void;
  /** Restores a client-side draft exactly (stops/path/chain/history). */
  restoreDraft: (payload: DraftDraft) => void;
  reset: () => void;
}

export const usePlottingStore = create<PlottingState>((set, get) => ({
  routeId: null,
  directionId: null,
  tool: "select",
  poi: null,
  routeMeta: null,
  connections: [],
  draftDirty: false,
  saving: false,
  overviewRouteId: null,
  fitCounter: 0,
  stops: [],
  polyline: null,
  snap: {
    status: "idle",
    polyline: null,
    distanceMeters: null,
    snapped: false,
    warning: null,
  },
  selection: clearSelection,
  layers: DEFAULT_LAYERS,
  history: emptyHistory(),
  savedBaseline: null,
  pathStopIds: null,

  setRouteId: (routeId) => set({ routeId }),
  setDirectionId: (directionId) => set({ directionId }),
  setTool: (tool) => set({ tool }),
  setPoi: (poi) => set({ poi }),
  setRouteMeta: (patch) =>
    // Initialize-or-merge: the first patch after opening a route creates the
    // draft from the loaded route; later patches update it in place.
    set((state) => ({
      routeMeta: { ...(state.routeMeta ?? EMPTY_ROUTE_META), ...patch },
    })),
  setDraftDirty: (draftDirty) => set({ draftDirty }),
  setSaving: (saving) => set({ saving }),
  setOverviewRouteId: (overviewRouteId) => set({ overviewRouteId }),

  openRoute: (routeId) => {
    // No request from the previous route may land on this one.
    cancelPendingSnap();
    snapGeneration += 1;
    lastEditEntry = null;
    set({
      routeId,
      directionId: null,
      stops: [],
      polyline: null,
      snap: {
        status: "idle",
        polyline: null,
        distanceMeters: null,
        snapped: false,
        warning: null,
      },
      selection: clearSelection,
      tool: "select",
      poi: null,
      routeMeta: null,
      connections: [],
      draftDirty: false,
      saving: false,
      overviewRouteId: null,
      history: emptyHistory(),
      savedBaseline: null,
    });
    if (routeId !== null) {
      get().requestFit();
    }
  },

  // Stop property dropdowns: force the predecessor ('connected from') and/or
  // successor ('connected to') via the chain-aware setStopLink — edges are
  // replaced, never toggled, and the draft polyline re-derives immediately.
  setStopLinks: (stopId, patch) => {
    const { connections, stops, polyline, pathStopIds } = get();
    // Capture the pre-edit chain and path/association — the undo entry
    // restores them exactly (including a truthful pathStopIds so a restored
    // road path never false-blocks the save guard).
    const connectionsBefore = connections.map((c) => ({ ...c }));
    const previousPath = polyline;
    const previousStops = pathStopIds;
    let next = connections;
    const applySide = (side: "from" | "to", otherId: string | null) => {
      const path = pathFromConnections(next, stops);
      const index = path.stopIds.indexOf(stopId);
      const last = path.stopIds.length - 1;
      // Closed loops (FR-004) wrap around: the first stop's predecessor is the
      // last stop and vice versa, so the dropdowns stay in sync with the loop.
      const closed = path.closed && path.stopIds.length >= 3;
      const currentFrom =
        closed && index === 0
          ? path.stopIds[last]
          : index > 0
            ? path.stopIds[index - 1]
            : null;
      const currentTo =
        closed && index === last
          ? path.stopIds[0]
          : index >= 0 && index < last
            ? path.stopIds[index + 1]
            : null;
      next = setStopLink(next, stopId, side, otherId, currentFrom, currentTo);
    };
    if (patch.from !== undefined) applySide("from", patch.from);
    if (patch.to !== undefined) applySide("to", patch.to);
    // A re-selection of the current value is a no-op — skip the history entry,
    // the association nulling, and the re-snap.
    const changed =
      next.length !== connections.length ||
      next.some((edge, i) => edge.id !== connections[i]?.id);
    if (!changed) return;
    const derived = pathFromConnections(next, stops);
    const removed = next.length < connections.length;
    const connectionsAfter = next.map((c) => ({ ...c }));
    // The dropdown is a deliberate structural edit — redraw the polyline
    // immediately so the map reflects the new stop linkage in real time.
    // The derived straight line is NOT a snapped path: null the association
    // so Save blocks until the snap re-derives a truthful pathStopIds.
    set((state) => ({
      connections: next,
      polyline: derived.polyline,
      pathStopIds: null,
      draftDirty: true,
      // Undoable edit: the connection change is a stop_props_changed entry
      // (connection variant) carrying the chain before/after and the pre-edit
      // path + association, so the snap result merges into it and ONE undo
      // restores the previous connection relationship AND its road path.
      history: pushHistory(state.history, {
        kind: "stop_props_changed",
        stopId,
        before: {},
        after: {},
        connectionsBefore,
        connectionsAfter,
        previousPath,
        previousStops,
      }),
    }));
    // This edit owns the next snap result (merges into this entry).
    lastEditEntry = get().history.past[get().history.past.length - 1] ?? null;
    if (removed) {
      cancelPendingSnap();
      snapGeneration += 1; // invalidate any in-flight fetch too
      set({
        snap: {
          status: "idle",
          polyline: null,
          distanceMeters: null,
          snapped: false,
          warning: null,
        },
      });
    } else {
      get().requestSnapPreview();
    }
  },

  // Insert a stop directly after an existing one (e.g. between two stops of
  // the route). The stop sequence auto-reorders, the chain is re-linked, and
  // the new stop becomes the selection so it can be dragged into place.
  insertStopBetween: (anchorStopId, location, name) => {
    const { stops } = get();
    const index = stops.findIndex((s) => s.id === anchorStopId);
    if (index === -1) return;
    const stopId = crypto.randomUUID();
    const stop: DraftStop = {
      id: stopId,
      name:
        (name?.trim() || `Stop ${stops.length + 1}`) ??
        `Stop ${stops.length + 1}`,
      type: "waiting_area",
      location,
    };
    const nextStops = [
      ...stops.slice(0, index + 1),
      stop,
      ...stops.slice(index + 1),
    ];
    // Single-mode plotting: the chain is always the consecutive stop pairs.
    const nextConnections = connectionsFromStops(nextStops, get().polyline);
    const derived = pathFromConnections(nextConnections, nextStops);
    set((state) => ({
      stops: nextStops,
      connections: nextConnections,
      polyline: get().polyline ?? derived.polyline,
      selection: { type: "stop", stopId },
      poi: null,
      draftDirty: true,
      // An inserted stop is a placement — undoable (FR-013).
      history: pushHistory(state.history, {
        kind: "stop_placed",
        stop,
        index: index + 1,
      }),
    }));
    cancelPendingSnap();
    // This edit owns the next snap result (merges into its entry).
    lastEditEntry = get().history.past[get().history.past.length - 1] ?? null;
    get().requestSnapPreview();
  },

  requestFit: () => set((state) => ({ fitCounter: state.fitCounter + 1 })),

  addStop: (location, name, type = "waiting_area") => {
    set((state) => {
      const stop: DraftStop = {
        id: crypto.randomUUID(),
        // Auto-default name "Stop N" in placement order (FR-028), editable later.
        name:
          name && name.trim().length > 0
            ? name.trim()
            : `Stop ${state.stops.length + 1}`,
        type,
        location,
      };
      const nextStops = [...state.stops, stop];
      return {
        stops: nextStops,
        // The chain stays in sync with placement order so the "connected
        // from/to" properties stay live.
        connections:
          state.stops.length === 0
            ? state.connections
            : [
                ...state.connections,
                {
                  id: edgeId(state.stops[state.stops.length - 1].id, stop.id),
                  from: state.stops[state.stops.length - 1].id,
                  to: stop.id,
                },
              ],
        poi: null, // placing a route point dismisses the temporary POI marker
        draftDirty: true,
        // Undoable edit (FR-013): stop_placed.
        history: pushHistory(state.history, {
          kind: "stop_placed",
          stop,
          index: state.stops.length,
        }),
      };
    });
    // This edit owns the next snap result — it merges into this entry.
    lastEditEntry = get().history.past[get().history.past.length - 1] ?? null;
    if (get().stops.length >= 2) {
      get().requestSnapPreview();
    }
  },
  removeStop: (stopId) => {
    const removedStop = get().stops.find((stop) => stop.id === stopId);
    set((state) => {
      const nextStops = state.stops.filter((stop) => stop.id !== stopId);
      const removed = state.stops.find((stop) => stop.id === stopId);
      return {
        stops: nextStops,
        // The chain stays consecutive after the removal.
        connections: connectionsFromStops(nextStops, state.polyline),
        selection:
          state.selection.type === "stop" && state.selection.stopId === stopId
            ? clearSelection
            : state.selection,
        draftDirty: true,
        // Undoable edit (FR-013): stop_deleted (undo reconnects + restores).
        history: removed
          ? pushHistory(state.history, {
              kind: "stop_deleted",
              stop: removed,
              index: state.stops.indexOf(removed),
              edges: state.connections.filter(
                (c) => c.from === stopId || c.to === stopId,
              ),
            })
          : state.history,
      };
    });
    // A stale preview no longer matches the new stop sequence.
    cancelPendingSnap();
    set({
      snap: {
        status: "idle",
        polyline: null,
        distanceMeters: null,
        snapped: false,
        warning: null,
      },
    });
    // This edit owns the next snap result (merges into its entry).
    lastEditEntry = removedStop
      ? (get().history.past[get().history.past.length - 1] ?? null)
      : null;
    // The re-established road path follows the new stop sequence.
    get().requestSnapPreview();
  },
  updateStop: (stopId, patch) => {
    const previous = get().stops.find((stop) => stop.id === stopId);
    const { location, ...props } = patch;
    // Capture the OLD values of the changed non-location attributes so the
    // undo entry can restore them exactly.
    const propsBefore = {} as StopPropsPatch;
    for (const key of Object.keys(props) as (keyof StopPropsPatch)[]) {
      (propsBefore as Record<string, unknown>)[key] = previous?.[key];
    }
    const hasProps = Object.keys(propsBefore).length > 0;
    const dragged = Boolean(
      location &&
      previous &&
      (previous.location[0] !== location[0] ||
        previous.location[1] !== location[1]),
    );
    set((state) => {
      let history = state.history;
      // Property edits are coalesced per stop (per-keystroke inputs must not
      // flood the stack); location edits coalesce too (coordinate inputs).
      if (hasProps) {
        history = coalescePropsEntry(history, {
          kind: "stop_props_changed",
          stopId,
          before: propsBefore,
          after: props as StopPropsPatch,
        });
      }
      if (dragged) {
        history = coalesceDragEntry(history, {
          kind: "stop_dragged",
          stopId,
          from: previous!.location,
          to: location!,
        });
      }
      return {
        stops: state.stops.map((stop) =>
          stop.id === stopId ? { ...stop, ...patch } : stop,
        ),
        draftDirty: true,
        history,
      };
    });
    // This edit owns the next snap result (merges into its entry). A
    // name/type/notes-only edit leaves any pending merge target alone — it
    // neither pushes history nor triggers a snap.
    if (dragged) {
      lastEditEntry = get().history.past[get().history.past.length - 1] ?? null;
    }
    if (patch.location) {
      get().requestSnapPreview();
    }
  },
  moveStop: (stopId, location) => get().updateStop(stopId, { location }),
  reorderStop: (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    const nextStops = reorderStops(get().stops, fromIndex, toIndex);
    set({
      stops: nextStops,
      // The chain stays in sync with the new placement order.
      connections: connectionsFromStops(nextStops, get().polyline),
      draftDirty: true,
    });
    // Reorder has no history entry — its snap result stays a plain
    // snap_applied entry, never merged.
    lastEditEntry = null;
    get().requestSnapPreview();
  },
  setStops: (stops, polyline?: GeoLineString | null) =>
    set((state) => ({
      stops,
      // The provided path IS the draft: when a caller loads a saved route
      // with its polyline, the committed line must render immediately —
      // never wait for a separate setPolyline call (which is how an edit
      // view could show no line until a preview re-triggers a draw).
      polyline: polyline === undefined ? state.polyline : polyline,
      // Seed the chain from the loaded path (consecutive pairs); a loop route
      // (FR-004) closes the chain when its polyline ends on the first stop.
      connections: connectionsFromStops(stops, polyline),
      // A loaded path was derived for these stops.
      pathStopIds:
        polyline === undefined ? state.pathStopIds : stops.map((s) => s.id),
    })),
  setPolyline: (polyline) => set({ polyline }),
  setSnap: (snap) => set((state) => ({ snap: { ...state.snap, ...snap } })),
  setSelection: (selection) => set({ selection, poi: null }), // selecting a stop dismisses the POI marker
  setLayers: (layers) =>
    set((state) => ({ layers: { ...state.layers, ...layers } })),

  requestSnapPreview: () => {
    const { stops } = get();
    // Bump BEFORE the early returns: any edit that calls this invalidates an
    // in-flight fetch, even when no new request can fire (e.g. removing the
    // second-to-last stop) — a stale response must never auto-commit.
    snapGeneration += 1;
    if (stops.length < 2 || !snapFetcher) return;
    if (snapTimer) {
      clearTimeout(snapTimer);
      snapTimer = null;
    }
    const generation = snapGeneration;
    snapTimer = setTimeout(() => {
      snapTimer = null;
      const current = get();
      set({
        snap: {
          status: "pending",
          polyline: null,
          distanceMeters: null,
          snapped: false,
          warning: null,
        },
      });
      // The road path follows the placed stops in order. A closed draft
      // (e.g. a loaded loop route) re-appends the start stop so the snap
      // keeps the loop closed.
      const coordinates = current.stops.map((stop) => stop.location);
      if (
        coordinates.length >= 3 &&
        polylineClosesOn(current.polyline, coordinates[0])
      ) {
        coordinates.push(coordinates[0]);
      }
      void snapFetcher!(coordinates)
        .then((result) => {
          if (generation !== snapGeneration) return; // superseded by a newer request
          if (result.snapped && result.polyline) {
            // Auto-commit: a road-snapped path becomes the draft immediately
            // (no Apply step). It MERGES into the history entry of the stop
            // edit that triggered the request, so ONE undo reverts the whole
            // edit (stop AND path) to the exact previous state. A commit that
            // matches the current path is a no-op (no entry, no re-set).
            const { polyline, history, pathStopIds } = get();
            const snapStopIds = current.stops.map((stop) => stop.id);
            const samePath =
              polyline !== null &&
              pathStopIds !== null &&
              pathStopIds.length === snapStopIds.length &&
              pathStopIds.every((id, i) => id === snapStopIds[i]) &&
              polyline.coordinates.length ===
                result.polyline.coordinates.length &&
              polyline.coordinates.every((coord, i) => {
                const base = result.polyline!.coordinates[i];
                return coord[0] === base[0] && coord[1] === base[1];
              });
            const lastEntry = history.past[history.past.length - 1];
            const mergeable =
              !samePath &&
              lastEditEntry !== null &&
              lastEntry === lastEditEntry &&
              (lastEntry.kind === "stop_placed" ||
                lastEntry.kind === "stop_deleted" ||
                lastEntry.kind === "stop_dragged" ||
                lastEntry.kind === "stop_props_changed") &&
              lastEntry.path === undefined;
            set({
              polyline: samePath ? polyline : result.polyline,
              pathStopIds: snapStopIds,
              draftDirty: true,
              history: samePath
                ? history
                : mergeable
                  ? {
                      past: [
                        ...history.past.slice(0, -1),
                        {
                          ...lastEntry,
                          path: result.polyline,
                          // Edits that already capture their pre-edit path or
                          // association (connection dropdowns) keep them;
                          // others take the commit-time values (which equal
                          // the pre-edit ones for stop edits). `undefined`
                          // falls back; an explicit `null` is preserved.
                          previousPath:
                            lastEntry.previousPath !== undefined
                              ? lastEntry.previousPath
                              : polyline,
                          stops: snapStopIds,
                          previousStops: lastEntry.previousStops ?? pathStopIds,
                        },
                      ],
                      future: [],
                    }
                  : pushHistory(history, {
                      kind: "snap_applied",
                      previous: polyline,
                      applied: result.polyline,
                      stops: snapStopIds,
                      previousStops: pathStopIds,
                    }),
              snap: {
                status: "applied",
                polyline: result.polyline,
                distanceMeters: result.distanceMeters,
                snapped: true,
                warning: null,
              },
            });
            if (mergeable) lastEditEntry = null; // the entry consumed the merge
            return;
          }
          // Straight-line fallback (no token / upstream error): warn but
          // NEVER commit it as route data (FR-009).
          set({
            snap: {
              status: "idle",
              polyline: null,
              distanceMeters: null,
              snapped: false,
              warning: result.warning,
            },
          });
        })
        .catch(() => {
          if (generation !== snapGeneration) return;
          set({
            snap: {
              status: "idle",
              polyline: null,
              distanceMeters: null,
              snapped: false,
              warning: "upstream_error",
            },
          });
        });
    }, SNAP_DEBOUNCE_MS);
  },

  resolvePendingSnap: async () => {
    // A scheduled (debounced) request is cancelled outright; an in-flight one
    // is settled by the generation guard — and, being road-snapped, already
    // auto-committed. Nothing more to do before saving.
    cancelPendingSnap();
    return get().snap;
  },

  undo: () => {
    const state = get();
    const entry = state.history.past[state.history.past.length - 1];
    if (!entry) return;
    lastEditEntry = null; // undoing orphans any pending merge target
    const selection = state.selection;
    const next = undoChanges(entry, {
      stops: state.stops,
      connections: state.connections,
      polyline: state.polyline,
    });
    // A pending snap refers to the pre-undo stop set — invalidate it (bump
    // the generation so an in-flight fetch can't auto-commit a stale path).
    // The restored entries carry the exact path, so no re-request is needed
    // (re-requesting would auto-commit and re-feed the history stack).
    cancelPendingSnap();
    snapGeneration += 1;
    set({
      ...next,
      // Undo that lands exactly on the saved baseline clears the unsaved
      // state (save button hides); otherwise the draft stays dirty.
      draftDirty: !draftMatchesBaseline(
        next.stops,
        next.polyline,
        get().savedBaseline,
      ),
      selection:
        selection.type === "stop" &&
        !next.stops.some((s) => s.id === selection.stopId)
          ? clearSelection
          : selection,
      history: {
        past: state.history.past.slice(0, -1),
        future: [...state.history.future, entry],
      },
      // A snap (or merged edit) undo restores the path AND the stop set it
      // was derived for (its predecessor's association), so a stale path
      // can't pass the save guard; other entries leave the association alone.
      // `undefined` (old-format entries) falls back to the current value;
      // an explicit `null` (first commit, no prior path) stays truthful.
      pathStopIds:
        entry.kind === "snap_applied" || entry.previousStops !== undefined
          ? entry.previousStops === undefined
            ? state.pathStopIds
            : entry.previousStops
          : state.pathStopIds,
      snap: {
        status: "idle",
        polyline: null,
        distanceMeters: null,
        snapped: false,
        warning: null,
      },
    });
  },
  redo: () => {
    const state = get();
    const entry = state.history.future[state.history.future.length - 1];
    if (!entry) return;
    lastEditEntry = null;
    const selection = state.selection;
    const next = redoChanges(entry, {
      stops: state.stops,
      connections: state.connections,
      polyline: state.polyline,
    });
    cancelPendingSnap();
    snapGeneration += 1;
    set({
      ...next,
      draftDirty: !draftMatchesBaseline(
        next.stops,
        next.polyline,
        get().savedBaseline,
      ),
      selection:
        selection.type === "stop" &&
        !next.stops.some((s) => s.id === selection.stopId)
          ? clearSelection
          : selection,
      history: {
        past: [...state.history.past, entry],
        future: state.history.future.slice(0, -1),
      },
      pathStopIds:
        entry.kind === "snap_applied" || entry.stops !== undefined
          ? (entry.stops ?? state.pathStopIds)
          : state.pathStopIds,
      snap: {
        status: "idle",
        polyline: null,
        distanceMeters: null,
        snapped: false,
        warning: null,
      },
    });
  },
  clearHistory: () => set({ history: emptyHistory() }),

  captureSavedBaseline: () => {
    const { stops, polyline } = get();
    set({
      savedBaseline: {
        stops: stops.map((stop) => ({
          ...stop,
          location: [stop.location[0], stop.location[1]] as [number, number],
        })),
        polyline: polyline
          ? {
              type: "LineString",
              coordinates: polyline.coordinates.map((c) => [c[0], c[1]]) as [
                number,
                number,
              ][],
            }
          : null,
      },
      draftDirty: false,
    });
  },

  restoreDraft: (payload) => {
    cancelPendingSnap();
    snapGeneration += 1;
    lastEditEntry = null;
    set({
      stops: payload.stops,
      polyline: payload.polyline,
      connections: payload.connections,
      history: payload.history ?? emptyHistory(),
      routeMeta: payload.routeMeta ?? null,
      directionId: payload.directionId,
      draftDirty: true,
      // The path↔stop association must be truthful: a legacy draft without
      // pathStopIds is NOT trusted (it could be a stale path persisted
      // mid-partial-undo) — leave it null so the save guard blocks, then
      // re-derive it via the snap below.
      pathStopIds: payload.pathStopIds ?? null,
      // A restored draft has no known saved baseline — it is all unsaved work.
      savedBaseline: null,
      selection: clearSelection,
      poi: null,
      snap: {
        status: "idle",
        polyline: null,
        distanceMeters: null,
        snapped: false,
        warning: null,
      },
    });
    // Legacy drafts: re-snap so the auto-commit re-derives a truthful
    // pathStopIds (and unblocks Save) — a no-op once a path exists.
    if (get().polyline !== null && get().pathStopIds === null) {
      get().requestSnapPreview();
    }
  },

  reset: () => {
    cancelPendingSnap();
    snapGeneration += 1;
    lastEditEntry = null;
    set({
      routeId: null,
      directionId: null,
      tool: "select",
      poi: null,
      routeMeta: null,
      connections: [],
      draftDirty: false,
      saving: false,
      overviewRouteId: null,
      fitCounter: 0,
      stops: [],
      polyline: null,
      snap: {
        status: "idle",
        polyline: null,
        distanceMeters: null,
        snapped: false,
        warning: null,
      },
      selection: clearSelection,
      layers: DEFAULT_LAYERS,
      history: emptyHistory(),
      savedBaseline: null,
      pathStopIds: null,
    });
  },
}));
