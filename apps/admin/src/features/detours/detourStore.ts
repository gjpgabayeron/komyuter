import type { CoordinatePair, GeoLineString, GeoPoint } from "@komyuter/shared";
import type { StopType } from "@komyuter/shared";
import { create } from "zustand";
import type {
  DetourEntity,
  DetourStopInput,
} from "@/features/routes/routesApi";
import { snapPreview } from "@/features/routes/routesApi";
import {
  coordsDistanceMeters,
  polylineDistanceMeters,
  projectPointOnPolyline,
  replacedArcLengthMeters,
  type ProjectedPoint,
} from "@/lib/coords";
import { usePlottingStore } from "@/lib/plottingStore";
import { clearSelection } from "@/lib/selection";

/**
 * Detour (alternative route) planning state — BRANCHING-NODE model (product
 * decision): the admin drops two free-form nodes anywhere along the main
 * route (split node = where the path diverges, merge node = where it rejoins,
 * ahead of the split), then clicks to add DETOUR STOPS along the alternative
 * path between them. Each detour stop is a REAL stop with full base-stop
 * parity (name/type/guaranteed/landmark/notes), scoped to that detour only.
 * The detour's route is split → detourStops → merge.
 *
 * Coordinate order is [lng, lat] everywhere (ADR-0013). Nodes project onto
 * the base polyline so the saved detour passes the FR-023 loop gate. The
 * additional distance is the loop length minus the exact replaced base arc
 * (FR-011).
 *
 * Separated from the plotting store: detour drafts are per-direction
 * mini-drafts. A capped past/future history powers undo/redo (FR-019), and
 * serializeDraft feeds the editor's localStorage draft (US4).
 */

export interface DetourTarget {
  directionId: string;
  directionLabel: string;
  routeId: string;
  routeName: string;
  basePolyline: GeoLineString;
  existingDetourCount: number;
  /** Chain-ordered stops (server `stop_order`) — the flanking source. */
  stops: readonly {
    stop_id: string;
    name: string;
    location: CoordinatePair;
  }[];
}

/** A detour stop being authored — full base-stop parity, detour-scoped. */
export interface DetourStopDraft {
  /** Client-local id (list keys/history); a server id is assigned on save. */
  id: string;
  name: string;
  location: CoordinatePair;
  type: StopType;
  is_guaranteed_service: boolean;
  landmark_hint: string | null;
  notes: string | null;
}

/** Fully validated save payload — the exact server POST/PUT shape. */
export interface DetourSavePayload {
  label: string;
  entry: GeoPoint;
  exit: GeoPoint;
  detour_polyline: GeoLineString;
  additional_distance_meters: number;
  commuter_instruction: string;
  driver_instruction: string | null;
  detour_stops: DetourStopInput[];
}

/** Road-following engine for the loop (defaults to the Mapbox snap proxy). */
export type LoopSnapper = (
  coordinates: CoordinatePair[],
) => Promise<GeoLineString>;

const COMPOSE_OFF_ROUTE =
  "That point is too far from the route — place the split/merge node near it.";
/** Split and merge closer than this are degenerate (mirrors server). */
const NODE_TOO_CLOSE_METERS = 30;

/** "click-to-place" phase of the open detour editor (split → merge → path). */
export type DetourPlacementMode = "entry" | "exit" | "waypoint";

/** An invalid node pair the editor must refuse visibly (order/degenerate). */
export type DetourRefusal =
  | {
      kind: "order";
      entryIndex: number;
      exitIndex: number;
      /** The (refused) merge tap, held so the admin can swap with one action. */
      exitProjection: ProjectedPoint;
    }
  | { kind: "degenerate" };

/** An undo/redo step: the full editable composition at one moment. */
export interface DetourSnapshot {
  mode: DetourPlacementMode;
  entry: ProjectedPoint | null;
  exit: ProjectedPoint | null;
  detourStops: DetourStopDraft[];
  loop: GeoLineString | null;
  label: string;
  commuterInstruction: string;
  driverInstruction: string;
  additionalDistanceMeters: number | null;
}

/** What survives to localStorage for a direction's in-progress detour. */
export interface DetourDraftSnapshot extends DetourSnapshot {
  target: DetourTarget;
  /** Kept so a restored draft edits the same saved detour (not a new one). */
  editDetourId: string | null;
  baselineDetourCount: number;
}

const HISTORY_LIMIT = 50;

async function snapToLoop(
  coordinates: CoordinatePair[],
): Promise<GeoLineString> {
  return (await snapPreview(coordinates)).polyline;
}

let snapSeq = 0;

export interface DetourState {
  open: boolean;
  /** Split → merge → path: which node/path phase the next click resolves. */
  mode: DetourPlacementMode;
  /** Invalid node-pair refusal (order/degenerate), with a swap affordance. */
  refusal: DetourRefusal | null;
  /** Detours the admin has hidden on the map (sidebar eye toggle). */
  hiddenDetourIds: string[];
  target: DetourTarget | null;
  /** The last map tap's projection onto the base polyline (visible snap). */
  snap: ProjectedPoint | null;
  entry: ProjectedPoint | null;
  exit: ProjectedPoint | null;
  /** Stops created by the detour tool (ordered: entry → stops → exit). */
  detourStops: DetourStopDraft[];
  /** The detour stop selected on the map (properties panel editor). */
  selectedDetourStopId: string | null;
  /** Detour stop hovered on the map + the detour it belongs to (for
   *  map↔sidebar alignment: hover highlights the owning detour's row). */
  hoveredDetourStopId: string | null;
  hoveredDetourId: string | null;
  /** Road-followed [entry, ...detourStops, exit]; null until the first build. */
  loop: GeoLineString | null;
  /** Set when road following is unavailable — editor shows the fallback note. */
  mapboxWarning: string | null;
  /** Node-pair inference failure (off-route click). */
  composeError: string | null;
  label: string;
  commuterInstruction: string;
  driverInstruction: string;
  additionalDistanceMeters: number | null;
  /** Inline save-gate / server (SC-014) feedback, shown in the editor. */
  lastError: string | null;
  /** Set when an edit of a saved detour is in progress. */
  editDetourId: string | null;
  /** The saved detour being edited — diff baseline for patch saves. */
  editBaseline: DetourEntity | null;
  /** Detour count at open — save-time conflict guard (US4, SC-014). */
  baselineDetourCount: number;
  /** True when a persisted draft for this direction awaits a restore choice. */
  draftOffer: boolean;
  /** True once the admin has actually changed the composition (drives draft
   *  persistence — a pristine open never clobbers a leftover draft). */
  touched: boolean;
  past: DetourSnapshot[];
  future: DetourSnapshot[];
  /** Incremented whenever the map should frame the focused detour (mirrors
   *  the plotting store's `fitCounter`/`requestFit` pattern). */
  detourFitCounter: number;

  openNew: (target: DetourTarget) => void;
  openEdit: (detour: DetourEntity, target: DetourTarget) => void;
  close: () => void;
  /** Branching-node flow: split (entry) → merge (exit) → detour stops. */
  handleMapClick: (click: CoordinatePair) => void;
  /** Swaps an order-refused split/merge pair (both node locks resolve). */
  swapEntryExit: () => void;
  /** Drags the split node back onto the main route (re-projected). */
  moveEntry: (location: CoordinatePair) => void;
  /** Drags the merge node back onto the main route (re-projected). */
  moveExit: (location: CoordinatePair) => void;
  /** Toggles a saved detour's map visibility (sidebar eye, display-only). */
  toggleDetourVisibility: (detourId: string) => void;
  /** Drops a detour id from the hidden list after it is deleted (prevents a
   *  stale entry from suppressing a future detour with a fresh id). */
  clearDeletedDetourVisibility: (detourId: string) => void;
  updateDetourStop: (
    id: string,
    patch: Partial<Omit<DetourStopDraft, "id" | "location">>,
  ) => void;
  /** Moves a detour stop on the map (drag) — records history + rebuilds. */
  moveDetourStop: (id: string, location: CoordinatePair) => void;
  /** Reorders a detour stop (drag & drop / ArrowUp/Down) with the same
   *  insert-before semantics as the base `reorderStop` (FR-010). */
  reorderDetourStop: (fromIndex: number, toIndex: number) => void;
  removeDetourStop: (id: string) => void;
  selectDetourStop: (id: string | null) => void;
  /** Sets/clears the hovered detour stop + its owning detour (map hover). */
  setHoveredDetourStop: (
    stopId: string | null,
    detourId: string | null,
  ) => void;
  /** Sets/clears the hovered detour row (sidebar row hover highlight). */
  setHoveredDetourId: (detourId: string | null) => void;
  setLabel: (label: string) => void;
  /** Requests a map frame to the focused detour (same contract as the
   *  plotting store's `requestFit`). */
  requestDetourFit: () => void;
  setCommuterInstruction: (instruction: string) => void;
  setDriverInstruction: (instruction: string) => void;
  setLastError: (message: string | null) => void;
  /** Late-binds the direction's stops once the dedicated stops query lands
   *  (the editor can open before stops load; composing needs them). */
  setTargetStops: (stops: DetourTarget["stops"]) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  serializeDraft: () => DetourDraftSnapshot | null;
  restoreDraft: (draft: DetourDraftSnapshot) => void;
  markDraftHandled: () => void;
  offerDraft: () => void;
  validateSave: () =>
    { ok: true; payload: DetourSavePayload } | { ok: false; reason: string };
}

const IDLE_STATE = {
  open: false,
  target: null,
  snap: null,
  entry: null,
  exit: null,
  mode: "entry" as const,
  refusal: null,
  hiddenDetourIds: [],
  detourStops: [],
  selectedDetourStopId: null,
  hoveredDetourStopId: null,
  hoveredDetourId: null,
  loop: null,
  mapboxWarning: null,
  composeError: null,
  label: "",
  commuterInstruction: "",
  driverInstruction: "",
  additionalDistanceMeters: null,
  lastError: null,
  editDetourId: null,
  editBaseline: null,
  baselineDetourCount: 0,
  draftOffer: false,
  touched: false,
  past: [],
  future: [],
  detourFitCounter: 0,
};

/**
 * Road-follows [entry, ...detourStops, exit]. Latest-wins: a stale resolution
 * never overwrites a newer composition.
 */
async function rebuildLoop(
  set: (partial: Partial<DetourState>) => void,
  get: () => DetourState,
  snapFn: LoopSnapper,
): Promise<void> {
  const { entry, exit, detourStops, target } = get();
  if (!entry || !exit || !target) return;
  const seq = ++snapSeq;
  const coordinates = [
    entry.coordinate,
    ...detourStops.map((stop) => stop.location),
    exit.coordinate,
  ];
  const baseLength = replacedArcLengthMeters(target.basePolyline, entry, exit);
  const setFrom = (loop: GeoLineString, warning: string | null) => {
    if (seq !== snapSeq) return;
    const loopLength = polylineDistanceMeters(loop);
    set({
      loop,
      mapboxWarning: warning,
      additionalDistanceMeters: Math.round(
        Math.max(0, loopLength - baseLength),
      ),
    });
  };
  try {
    const polyline = await snapFn(coordinates);
    setFrom(polyline, null);
  } catch {
    const fallback: GeoLineString = { type: "LineString", coordinates };
    setFrom(fallback, "upstream_error");
  }
}

function toSnapshot(state: DetourState): DetourSnapshot {
  return {
    mode: state.mode,
    entry: state.entry,
    exit: state.exit,
    detourStops: state.detourStops.map((stop) => ({ ...stop })),
    loop: state.loop,
    label: state.label,
    commuterInstruction: state.commuterInstruction,
    driverInstruction: state.driverInstruction,
    additionalDistanceMeters: state.additionalDistanceMeters,
  };
}

export function createDetourStore(snapFn: LoopSnapper = snapToLoop) {
  return create<DetourState>()((set, get) => {
    /** Records the current composition onto the undo stack (before a change). */
    const recordHistory = () => {
      const state = get();
      if (!state.open) return;
      set({
        past: [...state.past, toSnapshot(state)].slice(-HISTORY_LIMIT),
        future: [],
        touched: true,
      });
    };

    /** Detour focus takes over the workspace: a base-route stop outline must
     *  not linger while the admin is editing/selecting a detour or a detour
     *  stop (outline is per-store — without this, the two outlines would
     *  stack visually and confuse which context is focused). Also clears the
     *  base hover: keyboard-tabbing from a base stop to a detour stop would
     *  otherwise leave the hover outline (the in-map focus path bypasses the
     *  blur guard). */
    const clearBaseRouteFocus = () => {
      if (usePlottingStore.getState().selection.type !== "none") {
        usePlottingStore.getState().setSelection(clearSelection);
      }
      if (usePlottingStore.getState().hoveredStopId !== null) {
        usePlottingStore.getState().setHoveredStop(null);
      }
    };

    return {
      ...IDLE_STATE,

      openNew: (target) => {
        snapSeq += 1;
        clearBaseRouteFocus();
        set({
          ...IDLE_STATE,
          open: true,
          target,
          baselineDetourCount: target.existingDetourCount,
          label: `Detour ${target.existingDetourCount + 1}`,
        });
      },

      openEdit: (detour, target) => {
        snapSeq += 1;
        clearBaseRouteFocus();
        const entry = projectPointOnPolyline(
          detour.entry.coordinates,
          target.basePolyline.coordinates,
        );
        const exit = projectPointOnPolyline(
          detour.exit.coordinates,
          target.basePolyline.coordinates,
        );
        set({
          ...IDLE_STATE,
          open: true,
          mode: "waypoint",
          target,
          editDetourId: detour.detour_id,
          editBaseline: detour,
          baselineDetourCount: target.existingDetourCount,
          entry,
          exit,
          detourStops: detour.detour_stops.map((stop) => ({
            id: stop.detour_stop_id,
            name: stop.name,
            location: stop.location.coordinates,
            type: stop.type,
            is_guaranteed_service: stop.is_guaranteed_service,
            landmark_hint: stop.landmark_hint,
            notes: stop.notes,
          })),
          loop: detour.detour_polyline,
          label: detour.label,
          commuterInstruction: detour.commuter_instruction,
          driverInstruction: detour.driver_instruction ?? "",
          additionalDistanceMeters: detour.additional_distance_meters,
          detourFitCounter: get().detourFitCounter + 1,
        });
      },

      close: () => {
        snapSeq += 1;
        set({ ...IDLE_STATE });
      },

      handleMapClick: (click) => {
        const { target, open, mode, entry } = get();
        if (!open || !target) return;

        // Node clicks sit on/near the main route (±5 km corridor); detour
        // stops between them may be anywhere (the diversion). The click is
        // projected purely to measure its position along the route.
        const snap = projectPointOnPolyline(
          click,
          target.basePolyline.coordinates,
          5000,
        );
        if (mode !== "waypoint" && !snap) {
          set({ snap: null, composeError: COMPOSE_OFF_ROUTE });
          return;
        }
        set({ snap: snap ?? null });

        if (mode === "entry") {
          // SPLIT NODE: where the alternative path diverges from the main.
          recordHistory();
          set({
            entry: snap,
            snap,
            refusal: null,
            composeError: null,
            mode: "exit",
          });
          return;
        }

        if (mode === "exit") {
          if (!entry || !snap) return;
          // MERGE NODE must rejoin AHEAD of the split along the main route.
          const behind =
            snap.index < entry.index ||
            (snap.index === entry.index && snap.fraction <= entry.fraction);
          if (behind) {
            set({
              snap,
              refusal: {
                kind: "order",
                entryIndex: entry.index,
                exitIndex: snap.index,
                exitProjection: snap,
              },
              composeError: null,
            });
            return;
          }
          if (
            coordsDistanceMeters(entry.coordinate, snap.coordinate) <
            NODE_TOO_CLOSE_METERS
          ) {
            set({ snap, refusal: { kind: "degenerate" }, composeError: null });
            return;
          }
          recordHistory();
          set({
            exit: snap,
            snap,
            refusal: null,
            composeError: null,
            mode: "waypoint",
          });
          void rebuildLoop(set, get, snapFn);
          return;
        }

        // waypoint mode: each click adds a DETOUR STOP along the alternative
        // path between split and merge (full base-stop parity, detour-scoped).
        recordHistory();
        const previous = get();
        const stop: DetourStopDraft = {
          id: crypto.randomUUID(),
          name: `Stop ${previous.detourStops.length + 1}`,
          location: click,
          type: "waiting_area",
          is_guaranteed_service: false,
          landmark_hint: null,
          notes: null,
        };
        set({
          detourStops: [...previous.detourStops, stop],
          selectedDetourStopId: null,
          composeError: null,
          refusal: null,
          // First waypoint auto-fills the rider instruction if still empty
          // (never in edit mode — saved text is sacred).
          ...(previous.editDetourId === null &&
          previous.commuterInstruction === ""
            ? { commuterInstruction: "Take the detour" }
            : {}),
        });
        void rebuildLoop(set, get, snapFn);
      },

      swapEntryExit: () => {
        const { refusal, entry } = get();
        if (refusal?.kind !== "order") return;
        const refusedExit = refusal.exitProjection;
        recordHistory();
        set({
          entry: refusedExit,
          exit: entry,
          snap: null,
          refusal: null,
          mode: "waypoint",
        });
        void rebuildLoop(set, get, snapFn);
      },

      // Dragging the nodes re-anchors them onto the main route (the FR-023
      // gate requires entry/exit ON the base polyline).
      moveEntry: (location) => {
        const { target, entry } = get();
        if (!target || !entry) return;
        const projected = projectPointOnPolyline(
          location,
          target.basePolyline.coordinates,
          5000,
        );
        if (!projected) return;
        recordHistory();
        set({ entry: projected, snap: projected });
        void rebuildLoop(set, get, snapFn);
      },

      moveExit: (location) => {
        const { target, exit } = get();
        if (!target || !exit) return;
        const projected = projectPointOnPolyline(
          location,
          target.basePolyline.coordinates,
          5000,
        );
        if (!projected) return;
        recordHistory();
        set({ exit: projected, snap: projected });
        void rebuildLoop(set, get, snapFn);
      },

      toggleDetourVisibility: (detourId) => {
        const { hiddenDetourIds } = get();
        set({
          hiddenDetourIds: hiddenDetourIds.includes(detourId)
            ? hiddenDetourIds.filter((id) => id !== detourId)
            : [...hiddenDetourIds, detourId],
        });
      },
      clearDeletedDetourVisibility: (detourId) =>
        set((state) => ({
          hiddenDetourIds: state.hiddenDetourIds.filter(
            (id) => id !== detourId,
          ),
        })),

      updateDetourStop: (id, patch) => {
        const { detourStops } = get();
        if (!detourStops.some((stop) => stop.id === id)) return;
        recordHistory();
        set({
          detourStops: detourStops.map((stop) =>
            stop.id === id ? { ...stop, ...patch } : stop,
          ),
        });
      },

      moveDetourStop: (id, location) => {
        const { detourStops } = get();
        if (!detourStops.some((stop) => stop.id === id)) return;
        recordHistory();
        set({
          detourStops: detourStops.map((stop) =>
            stop.id === id ? { ...stop, location } : stop,
          ),
        });
        void rebuildLoop(set, get, snapFn);
      },

      reorderDetourStop: (fromIndex, toIndex) => {
        if (fromIndex === toIndex) return;
        const { detourStops, open } = get();
        if (!open || fromIndex < 0 || fromIndex >= detourStops.length) return;
        if (toIndex < 0 || toIndex > detourStops.length) return;
        recordHistory();
        const next = [...detourStops];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex > fromIndex ? toIndex - 1 : toIndex, 0, moved);
        set({ detourStops: next });
        void rebuildLoop(set, get, snapFn);
      },

      removeDetourStop: (id) => {
        const { detourStops } = get();
        if (!detourStops.some((stop) => stop.id === id)) return;
        recordHistory();
        set({
          detourStops: detourStops.filter((stop) => stop.id !== id),
          selectedDetourStopId:
            get().selectedDetourStopId === id
              ? null
              : get().selectedDetourStopId,
        });
        void rebuildLoop(set, get, snapFn);
      },

      selectDetourStop: (id) => {
        clearBaseRouteFocus();
        set({ selectedDetourStopId: id });
      },
      setHoveredDetourStop: (hoveredDetourStopId, hoveredDetourId) =>
        set({ hoveredDetourStopId, hoveredDetourId }),
      setHoveredDetourId: (hoveredDetourId) => set({ hoveredDetourId }),

      setLabel: (label) => {
        if (label === get().label) return;
        recordHistory();
        set({ label });
      },
      setCommuterInstruction: (commuterInstruction) => {
        if (commuterInstruction === get().commuterInstruction) return;
        recordHistory();
        set({ commuterInstruction });
      },
      setDriverInstruction: (driverInstruction) => {
        if (driverInstruction === get().driverInstruction) return;
        recordHistory();
        set({ driverInstruction });
      },
      setLastError: (lastError) => set({ lastError }),

      setTargetStops: (stops) => {
        const { target } = get();
        if (!target || target.stops.length > 0) return;
        set({ target: { ...target, stops } });
      },

      undo: () => {
        const { past, future } = get();
        if (past.length === 0) return;
        const previous = past[past.length - 1];
        if (!previous) return;
        snapSeq += 1;
        set({
          past: past.slice(0, -1),
          future: [...future, toSnapshot(get())],
          ...previous,
        });
      },

      redo: () => {
        const { past, future } = get();
        if (future.length === 0) return;
        const next = future[future.length - 1];
        if (!next) return;
        snapSeq += 1;
        set({
          past: [...past, toSnapshot(get())],
          future: future.slice(0, -1),
          ...next,
        });
      },

      canUndo: () => get().past.length > 0,
      canRedo: () => get().future.length > 0,

      requestDetourFit: () =>
        set((state) => ({ detourFitCounter: state.detourFitCounter + 1 })),

      serializeDraft: () => {
        const { target, open, editDetourId, baselineDetourCount } = get();
        if (!target || !open) return null;
        return {
          target,
          editDetourId,
          baselineDetourCount,
          ...toSnapshot(get()),
        };
      },

      restoreDraft: (draft) => {
        snapSeq += 1;
        set({
          ...IDLE_STATE,
          open: true,
          mode: draft.mode,
          target: draft.target,
          entry: draft.entry,
          exit: draft.exit,
          detourStops: draft.detourStops.map((stop) => ({ ...stop })),
          loop: draft.loop,
          label: draft.label,
          commuterInstruction: draft.commuterInstruction,
          driverInstruction: draft.driverInstruction,
          additionalDistanceMeters: draft.additionalDistanceMeters,
          editDetourId: draft.editDetourId,
          baselineDetourCount: draft.baselineDetourCount,
          draftOffer: false,
          touched: true,
        });
      },

      markDraftHandled: () => set({ draftOffer: false }),
      offerDraft: () => set({ draftOffer: true }),

      validateSave: () => {
        const {
          open,
          entry,
          exit,
          detourStops,
          loop,
          label,
          commuterInstruction,
          driverInstruction,
        } = get();
        if (!open || !get().target)
          return { ok: false, reason: "The detour editor is not open." };
        if (!entry)
          return {
            ok: false,
            reason:
              "Place the SPLIT node — click the main route where the alternative path diverges.",
          };
        if (!exit)
          return {
            ok: false,
            reason:
              "Place the MERGE node — click the main route ahead of the split where the path rejoins.",
          };
        if (detourStops.length === 0)
          return {
            ok: false,
            reason:
              "Add detour stops — click along the alternative path between the split and merge nodes.",
          };
        if (!loop || loop.coordinates.length < 2)
          return {
            ok: false,
            reason:
              "The detour path is still building — place the detour stop or wait a moment.",
          };
        if (!label.trim())
          return { ok: false, reason: "Give the detour a label." };
        if (!commuterInstruction.trim())
          return {
            ok: false,
            reason: "Write the passenger-facing instruction.",
          };

        const coordinateToPoint = (p: ProjectedPoint): GeoPoint => ({
          type: "Point",
          coordinates: p.coordinate,
        });
        return {
          ok: true,
          payload: {
            label: label.trim(),
            entry: coordinateToPoint(entry),
            exit: coordinateToPoint(exit),
            detour_polyline: loop,
            additional_distance_meters: get().additionalDistanceMeters ?? 0,
            commuter_instruction: commuterInstruction.trim(),
            driver_instruction: driverInstruction.trim() || null,
            detour_stops: detourStops.map((stop) => ({
              name: stop.name,
              location: {
                type: "Point" as const,
                coordinates: stop.location,
              },
              type: stop.type,
              is_guaranteed_service: stop.is_guaranteed_service,
              landmark_hint: stop.landmark_hint,
              notes: stop.notes,
            })),
          },
        };
      },
    };
  });
}

/** The app-wide singleton — feature components read this instance. */
export const useDetourStore = createDetourStore();
