import type { CoordinatePair, GeoLineString } from "@komyuter/shared";
import type { Connection } from "./connections";
import { connectionsFromStops } from "./connections";
import type { DraftStop } from "./plottingStore";

/** Non-location stop attributes that are undoable as property edits. */
export type StopPropsPatch = Partial<
  Pick<
    DraftStop,
    "name" | "type" | "is_guaranteed_service" | "landmark_hint" | "notes"
  >
>;

/**
 * Undo/redo history for the plotting draft (FR-013).
 *
 * The store keeps `history: { past, future }`; every user edit that mutates
 * the draft pushes a HistoryEntry (see the store actions). Undo pops the last
 * entry, applies `undoChanges` to the current draft slice, and moves the entry
 * to the future stack; redo is the mirror image. A new edit after an undo
 * cuts the future branch (`pushHistory` clears it).
 *
 * Entries are intentionally limited to the four edit kinds the spec names
 * (stop_placed, stop_deleted, stop_dragged, snap_applied) — reordering and
 * linking stay outside the history model.
 *
 * The transition functions are pure so the stack is unit-testable without
 * zustand: they compute the next stops/connections/polyline slice from an
 * entry and the current slice.
 */

export type HistoryEntry =
  | {
      kind: "stop_placed";
      /** The stop as placed, and its index in the stop list at placement. */
      stop: DraftStop;
      index: number;
      /** Merged snap result (auto-commit): the committed path AFTER this edit,
       *  so one undo reverts the whole addition — stop AND path together. */
      path?: GeoLineString | null;
      /** The committed path BEFORE this edit (restored on undo). */
      previousPath?: GeoLineString | null;
      /** Stop ids the merged path was derived for (save-guard association). */
      stops?: string[];
      previousStops?: string[] | null;
    }
  | {
      kind: "stop_deleted";
      /** The removed stop, its index, and the chain edges it held. */
      stop: DraftStop;
      index: number;
      edges: Connection[];
      path?: GeoLineString | null;
      previousPath?: GeoLineString | null;
      stops?: string[];
      previousStops?: string[] | null;
    }
  | {
      kind: "stop_dragged";
      stopId: string;
      from: CoordinatePair;
      to: CoordinatePair;
      path?: GeoLineString | null;
      previousPath?: GeoLineString | null;
      stops?: string[];
      previousStops?: string[] | null;
    }
  | {
      kind: "stop_props_changed";
      stopId: string;
      /** Non-location attribute diff (name/type/notes/guaranteed/landmark). */
      before: StopPropsPatch;
      after: StopPropsPatch;
      /** Full chain before/after a connection-dropdown edit (when present). */
      connectionsBefore?: Connection[];
      connectionsAfter?: Connection[];
      path?: GeoLineString | null;
      previousPath?: GeoLineString | null;
      stops?: string[];
      previousStops?: string[] | null;
    }
  | {
      kind: "snap_applied";
      /** The committed draft polyline before this commit (null = first). */
      previous: GeoLineString | null;
      applied: GeoLineString;
      /** Ordered stop ids the snapped path was derived for. */
      stops: string[];
      /** Ordered stop ids the PREVIOUS path (`previous`) was derived for —
       *  restored on undo so the path↔stops association stays truthful
       *  (a stale path must not pass the save guard). */
      previousStops: string[] | null;
    };

export interface HistoryStack {
  past: HistoryEntry[];
  future: HistoryEntry[];
}

/** The draft pieces the undo/redo transitions operate on. */
export interface DraftSlice {
  stops: DraftStop[];
  connections: Connection[];
  polyline: GeoLineString | null;
}

export function emptyHistory(): HistoryStack {
  return { past: [], future: [] };
}

/** Records an edit: appends to the past and cuts any future branch. */
export function pushHistory(
  stack: HistoryStack,
  entry: HistoryEntry,
): HistoryStack {
  return { past: [...stack.past, entry], future: [] };
}

export function canUndo(stack: HistoryStack): boolean {
  return stack.past.length > 0;
}

export function canRedo(stack: HistoryStack): boolean {
  return stack.future.length > 0;
}

function withoutStop(stops: DraftStop[], stopId: string): DraftStop[] {
  return stops.filter((stop) => stop.id !== stopId);
}

function insertAt(
  stops: DraftStop[],
  index: number,
  stop: DraftStop,
): DraftStop[] {
  const at = Math.max(0, Math.min(index, stops.length));
  return [...stops.slice(0, at), stop, ...stops.slice(at)];
}

function relink(
  stops: DraftStop[],
  polyline: GeoLineString | null,
): Connection[] {
  // Single-mode plotting: the chain is always the consecutive stop pairs.
  return connectionsFromStops(stops, polyline);
}

/**
 * Returns the draft slice AFTER undoing the entry.
 */
export function undoChanges(
  entry: HistoryEntry,
  current: DraftSlice,
): DraftSlice {
  switch (entry.kind) {
    case "stop_placed": {
      const stops = withoutStop(current.stops, entry.stop.id);
      return {
        ...current,
        stops,
        connections: relink(stops, current.polyline),
        // A merged entry reverts the polyline too — the exact previous state.
        polyline:
          entry.previousPath !== undefined
            ? entry.previousPath
            : current.polyline,
      };
    }
    case "stop_deleted": {
      const stops = insertAt(current.stops, entry.index, entry.stop);
      return {
        ...current,
        stops,
        connections: relink(stops, current.polyline),
        polyline:
          entry.previousPath !== undefined
            ? entry.previousPath
            : current.polyline,
      };
    }
    case "stop_dragged":
      return {
        ...current,
        stops: current.stops.map((stop) =>
          stop.id === entry.stopId ? { ...stop, location: entry.from } : stop,
        ),
        polyline:
          entry.previousPath !== undefined
            ? entry.previousPath
            : current.polyline,
      };
    case "stop_props_changed":
      return {
        ...current,
        stops: current.stops.map((stop) =>
          stop.id === entry.stopId ? { ...stop, ...entry.before } : stop,
        ),
        connections: entry.connectionsBefore ?? current.connections,
        polyline:
          entry.previousPath !== undefined
            ? entry.previousPath
            : current.polyline,
      };
    case "snap_applied":
      return { ...current, polyline: entry.previous };
  }
}

/**
 * Returns the draft slice AFTER redoing the entry (mirror of undoChanges).
 */
export function redoChanges(
  entry: HistoryEntry,
  current: DraftSlice,
): DraftSlice {
  switch (entry.kind) {
    case "stop_placed": {
      const stops = insertAt(current.stops, entry.index, entry.stop);
      return {
        ...current,
        stops,
        connections: relink(stops, current.polyline),
        polyline: entry.path !== undefined ? entry.path : current.polyline,
      };
    }
    case "stop_deleted": {
      const stops = withoutStop(current.stops, entry.stop.id);
      return {
        ...current,
        stops,
        connections: relink(stops, current.polyline),
        polyline: entry.path !== undefined ? entry.path : current.polyline,
      };
    }
    case "stop_dragged":
      return {
        ...current,
        stops: current.stops.map((stop) =>
          stop.id === entry.stopId ? { ...stop, location: entry.to } : stop,
        ),
        polyline: entry.path !== undefined ? entry.path : current.polyline,
      };
    case "stop_props_changed":
      return {
        ...current,
        stops: current.stops.map((stop) =>
          stop.id === entry.stopId ? { ...stop, ...entry.after } : stop,
        ),
        connections: entry.connectionsAfter ?? current.connections,
        polyline: entry.path !== undefined ? entry.path : current.polyline,
      };
    case "snap_applied":
      return { ...current, polyline: entry.applied };
  }
}

/**
 * Coalesces consecutive property edits to the SAME stop into one undo step.
 * The panel edits stop fields on every keystroke — without this, typing a
 * name would push one history entry per character. The first edit keeps the
 * original `before`; later edits extend `after`, so a single undo reverts the
 * whole typing session and redo re-applies the final value. Connection edits
 * (which carry `connectionsBefore`) and already-merged entries are left alone.
 */
export function coalescePropsEntry(
  stack: HistoryStack,
  entry: Extract<HistoryEntry, { kind: "stop_props_changed" }>,
): HistoryStack {
  const last = stack.past[stack.past.length - 1];
  if (
    last !== undefined &&
    last.kind === "stop_props_changed" &&
    last.stopId === entry.stopId &&
    last.path === undefined &&
    last.connectionsBefore === undefined &&
    entry.connectionsBefore === undefined
  ) {
    // Merge both patches: `before` keeps the ORIGINAL values (the first
    // edit's — later edits would overwrite them with intermediates), `after`
    // takes the FINAL values. Edits to DIFFERENT fields (name then type) in
    // one session still undo/redo as a single coherent step without losing
    // any field.
    return {
      past: [
        ...stack.past.slice(0, -1),
        {
          ...last,
          before: { ...entry.before, ...last.before },
          after: { ...last.after, ...entry.after },
        },
      ],
      future: [],
    };
  }
  return pushHistory(stack, entry);
}

/**
 * Coalesces consecutive drags of the SAME stop into one undo step (the
 * coordinate text inputs also edit per keystroke). The first drag keeps the
 * original `from`; later drags extend `to`, so one undo restores the original
 * position. Merged (already-committed) entries are left alone.
 */
export function coalesceDragEntry(
  stack: HistoryStack,
  entry: Extract<HistoryEntry, { kind: "stop_dragged" }>,
): HistoryStack {
  const last = stack.past[stack.past.length - 1];
  if (
    last !== undefined &&
    last.kind === "stop_dragged" &&
    last.stopId === entry.stopId &&
    last.path === undefined
  ) {
    return {
      past: [...stack.past.slice(0, -1), { ...last, to: entry.to }],
      future: [],
    };
  }
  return pushHistory(stack, entry);
}
