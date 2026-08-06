import { create } from "zustand";
import type { CoordinatePair, GeoLineString, StopType } from "@komyuter/shared";
import type { Selection } from "./selection";
import { clearSelection } from "./selection";

export type PlotMode = "automatic" | "manual";

/** An in-progress stop in the plotting draft (not yet persisted). */
export interface DraftStop {
  id: string;
  name: string;
  type: StopType;
  location: CoordinatePair;
}

export type SnapStatus = "idle" | "pending" | "applied" | "reverted";

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

export interface PlottingState {
  /** Route being plotted (null = no route open). */
  routeId: string | null;
  mode: PlotMode;
  /** Ordered draft stops (placement order = stop_order). */
  stops: DraftStop[];
  /** Snapped/final path geometry; null until a path exists. */
  polyline: GeoLineString | null;
  snap: SnapState;
  selection: Selection;
  layers: LayerVisibility;
  /** Undo/redo stacks — structure reserved for US3 (fix mistakes). */
  history: { past: unknown[]; future: unknown[] };

  setRouteId: (routeId: string | null) => void;
  setMode: (mode: PlotMode) => void;
  addStop: (location: CoordinatePair, name?: string, type?: StopType) => void;
  removeStop: (stopId: string) => void;
  moveStop: (stopId: string, location: CoordinatePair) => void;
  setStops: (stops: DraftStop[]) => void;
  setPolyline: (polyline: GeoLineString | null) => void;
  setSnap: (snap: Partial<SnapState>) => void;
  setSelection: (selection: Selection) => void;
  setLayers: (layers: Partial<LayerVisibility>) => void;
  reset: () => void;
}

export const usePlottingStore = create<PlottingState>((set) => ({
  routeId: null,
  mode: "automatic",
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
  setMode: (mode) => set({ mode }),
  addStop: (location, name, type = "major_stop") =>
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
    })),
  removeStop: (stopId) =>
    set((state) => ({
      stops: state.stops.filter((stop) => stop.id !== stopId),
      selection:
        state.selection.type === "stop" && state.selection.stopId === stopId
          ? clearSelection
          : state.selection,
    })),
  moveStop: (stopId, location) =>
    set((state) => ({
      stops: state.stops.map((stop) =>
        stop.id === stopId ? { ...stop, location } : stop,
      ),
    })),
  setStops: (stops) => set({ stops }),
  setPolyline: (polyline) => set({ polyline }),
  setSnap: (snap) => set((state) => ({ snap: { ...state.snap, ...snap } })),
  setSelection: (selection) => set({ selection }),
  setLayers: (layers) =>
    set((state) => ({ layers: { ...state.layers, ...layers } })),
  reset: () =>
    set({
      routeId: null,
      mode: "automatic",
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
