import { create } from "zustand";
import type {
  CoordinatePair,
  GeoLineString,
  SnappedPath,
  StopType,
} from "@komyuter/shared";
import type { Selection } from "./selection";
import { clearSelection } from "./selection";

export type PlotMode = "automatic" | "manual";

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

export type SnapStatus =
  "idle" | "pending" | "preview" | "applied" | "reverted";

export interface SnapState {
  status: SnapStatus;
  polyline: GeoLineString | null;
  distanceMeters: number | null;
  snapped: boolean;
  warning: string | null;
}

export interface LayerVisibility {
  base: boolean;
  stops: boolean;
}

const DEFAULT_LAYERS: LayerVisibility = { base: true, stops: true };

const EMPTY_ROUTE_META: RouteMetaDraft = {
  name: "",
  shortName: "",
  color: "#1B6DB2",
  isActive: true,
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
  mode: PlotMode;
  /** Edit-mode pointer tool (Select vs Add). */
  tool: EditTool;
  /** Temporary POI search marker; cleared on any other map interaction. */
  poi: CoordinatePair | null;
  /** Stop-location snapshot taken when an edit cycle starts; Revert restores it. */
  previewBaseline: Record<string, CoordinatePair> | null;
  /** Route metadata draft; null until a route's detail loads. */
  routeMeta: RouteMetaDraft | null;
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
  /** Undo/redo stacks — structure reserved for US3 (fix mistakes). */
  history: { past: unknown[]; future: unknown[] };

  setRouteId: (routeId: string | null) => void;
  setDirectionId: (directionId: string | null) => void;
  setMode: (mode: PlotMode) => void;
  setTool: (tool: EditTool) => void;
  /** Places/clears the temporary POI search marker ([lng, lat]). */
  setPoi: (location: CoordinatePair | null) => void;
  /** Merges a patch into the route metadata draft. */
  setRouteMeta: (patch: Partial<RouteMetaDraft>) => void;
  /** Marks the plotting draft as having unsaved changes. */
  setDraftDirty: (dirty: boolean) => void;
  /** Locks/unlocks interactions while a save is in flight. */
  setSaving: (saving: boolean) => void;
  /** Focuses/clears a route in overview mode. */
  setOverviewRouteId: (routeId: string | null) => void;
  /** Snapshots stop locations at the start of an edit cycle (internal). */
  capturePreviewBaseline: () => void;
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
  setStops: (stops: DraftStop[]) => void;
  setPolyline: (polyline: GeoLineString | null) => void;
  setSnap: (snap: Partial<SnapState>) => void;
  setSelection: (selection: Selection) => void;
  setLayers: (layers: Partial<LayerVisibility>) => void;
  /** Debounced road-following preview request for the placed stops (FR-008). */
  requestSnapPreview: () => void;
  /** Settles a scheduled/in-flight preview before another placement or save (edge case). */
  resolvePendingSnap: () => Promise<SnapState>;
  /** Commits the preview to the draft polyline (undoable from US3). */
  applySnapPreview: () => void;
  /** Discards the preview; the draft polyline keeps its previous value. */
  revertSnapPreview: () => void;
  reset: () => void;
}

export const usePlottingStore = create<PlottingState>((set, get) => ({
  routeId: null,
  directionId: null,
  mode: "automatic",
  tool: "select",
  poi: null,
  previewBaseline: null,
  routeMeta: null,
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
  history: { past: [], future: [] },

  setRouteId: (routeId) => set({ routeId }),
  setDirectionId: (directionId) => set({ directionId }),
  setMode: (mode) => set({ mode }),
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
      previewBaseline: null,
      routeMeta: null,
      draftDirty: false,
      saving: false,
      overviewRouteId: null,
      history: { past: [], future: [] },
    });
    if (routeId !== null) {
      get().requestFit();
    }
  },

  requestFit: () => set((state) => ({ fitCounter: state.fitCounter + 1 })),

  // Snapshot stop locations at the start of an edit cycle so Revert can fully
  // restore the previous positions (drag/coordinate edits).
  capturePreviewBaseline: () => {
    if (get().previewBaseline !== null) return;
    const baseline: Record<string, CoordinatePair> = {};
    for (const stop of get().stops) {
      baseline[stop.id] = stop.location;
    }
    set({ previewBaseline: baseline });
  },

  addStop: (location, name, type = "major_stop") => {
    set((state) => ({
      stops: [
        ...state.stops,
        {
          id: crypto.randomUUID(),
          // Auto-default name "Stop N" in placement order (FR-028), editable later.
          name:
            name && name.trim().length > 0
              ? name.trim()
              : `Stop ${state.stops.length + 1}`,
          type,
          location,
        },
      ],
      poi: null, // placing a route point dismisses the temporary POI marker
      draftDirty: true,
    }));
    if (get().mode === "automatic") {
      get().requestSnapPreview();
    }
  },
  removeStop: (stopId) => {
    set((state) => ({
      stops: state.stops.filter((stop) => stop.id !== stopId),
      selection:
        state.selection.type === "stop" && state.selection.stopId === stopId
          ? clearSelection
          : state.selection,
      draftDirty: true,
    }));
    // Recalculate the connecting line for the new stop sequence.
    if (get().mode === "automatic") {
      get().requestSnapPreview();
    }
  },
  updateStop: (stopId, patch) => {
    get().capturePreviewBaseline();
    set((state) => ({
      stops: state.stops.map((stop) =>
        stop.id === stopId ? { ...stop, ...patch } : stop,
      ),
      draftDirty: true,
    }));
    if (patch.location && get().mode === "automatic") {
      get().requestSnapPreview();
    }
  },
  moveStop: (stopId, location) => get().updateStop(stopId, { location }),
  reorderStop: (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    set({
      stops: reorderStops(get().stops, fromIndex, toIndex),
      draftDirty: true,
    });
    if (get().mode === "automatic") {
      get().requestSnapPreview();
    }
  },
  setStops: (stops) => set({ stops }),
  setPolyline: (polyline) => set({ polyline }),
  setSnap: (snap) => set((state) => ({ snap: { ...state.snap, ...snap } })),
  setSelection: (selection) => set({ selection, poi: null }), // selecting a stop dismisses the POI marker
  setLayers: (layers) =>
    set((state) => ({ layers: { ...state.layers, ...layers } })),

  requestSnapPreview: () => {
    const { stops, mode } = get();
    if (mode !== "automatic" || stops.length < 2 || !snapFetcher) return;
    if (snapTimer) {
      clearTimeout(snapTimer);
      snapTimer = null;
    }
    snapGeneration += 1;
    const generation = snapGeneration;
    snapTimer = setTimeout(() => {
      snapTimer = null;
      set({
        snap: {
          status: "pending",
          polyline: null,
          distanceMeters: null,
          snapped: false,
          warning: null,
        },
      });
      const coordinates = get().stops.map((stop) => stop.location);
      void snapFetcher!(coordinates)
        .then((result) => {
          if (generation !== snapGeneration) return; // superseded by a newer request
          set({
            snap: {
              status: "preview",
              polyline: result.polyline,
              distanceMeters: result.distanceMeters,
              snapped: result.snapped,
              warning: result.warning,
            },
          });
        })
        .catch(() => {
          if (generation !== snapGeneration) return;
          set({
            snap: {
              status: "preview",
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
    // is settled by the generation guard and can only land as a preview — it
    // never mutates the draft polyline (only Apply does).
    cancelPendingSnap();
    return get().snap;
  },

  applySnapPreview: () => {
    const { snap } = get();
    if (snap.status !== "preview" || !snap.polyline) return;
    set({
      polyline: snap.polyline,
      snap: { ...snap, status: "applied" },
      draftDirty: true,
      previewBaseline: null, // the change is committed — the baseline is stale
    });
  },

  revertSnapPreview: () => {
    const { snap, previewBaseline } = get();
    if (snap.status !== "preview") return;
    set((state) => ({
      // Restore dragged/edited stops to their pre-edit positions so canceling
      // fully restores the previous state.
      stops: previewBaseline
        ? state.stops.map((stop) =>
            previewBaseline[stop.id]
              ? { ...stop, location: previewBaseline[stop.id] }
              : stop,
          )
        : state.stops,
      snap: {
        ...snap,
        status: "reverted",
        polyline: null,
        distanceMeters: null,
        snapped: false,
        warning: null,
      },
      previewBaseline: null,
    }));
  },

  reset: () =>
    set({
      routeId: null,
      directionId: null,
      mode: "automatic",
      tool: "select",
      poi: null,
      previewBaseline: null,
      routeMeta: null,
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
      history: { past: [], future: [] },
    }),
}));
