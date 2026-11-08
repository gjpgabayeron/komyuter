import type { Restriction, RestrictionKind } from "@komyuter/shared";
import { create } from "zustand";

import { normalizeRange } from "./restrictionHelpers";

export const DEFAULT_RESTRICTION_KIND: RestrictionKind = "both";

export type RestrictionMode = "idle" | "picking";

export interface RestrictionEditorState {
  /** Dedicated restriction-editing mode owns both rails while true. */
  editing: boolean;
  /** True when the current editor differs from the saved restriction. */
  dirty: boolean;
  /** True while a restriction save is in flight. */
  saving: boolean;
  /** `picking` means map clicks belong to the range; `idle` means they do not. */
  mode: RestrictionMode;
  /** Null = Main route; otherwise the alternative route being edited. */
  detourId: string | null;
  /** The saved restriction being edited; null while creating. */
  selectedId: string | null;
  fromIndex: number | null;
  toIndex: number | null;
  kind: RestrictionKind;
  note: string;
  isActive: boolean;
  lastError: string | null;
  enter: (detourId?: string | null) => void;
  exit: () => void;
  startNew: () => void;
  /** Loads a saved restriction into the editor without entering pick mode. */
  select: (restriction: Restriction) => void;
  /** Clears the range but keeps the selected restriction, ready for two clicks. */
  beginRerange: () => void;
  /** A map click's vertex index. First sets `from`, second sets `to` (sorted). */
  pick: (index: number) => void;
  /** Moves one endpoint to a snapped polyline vertex (draggable markers). */
  moveEndpoint: (role: "start" | "end", index: number) => void;
  setKind: (kind: RestrictionKind) => void;
  setNote: (note: string) => void;
  setActive: (isActive: boolean) => void;
  setLastError: (message: string | null) => void;
  setSaving: (saving: boolean) => void;
  markSaved: (restriction: Restriction) => void;
  reset: () => void;
}

const IDLE = {
  mode: "idle" as const,
  detourId: null as string | null,
  selectedId: null,
  fromIndex: null,
  toIndex: null,
  kind: DEFAULT_RESTRICTION_KIND,
  note: "",
  isActive: true,
  lastError: null,
  dirty: false,
};

export const useRestrictionStore = create<RestrictionEditorState>(
  (set, get) => ({
    ...IDLE,
    editing: false,
    saving: false,

    enter: (detourId = null) =>
      set({ ...IDLE, detourId, editing: true, saving: false }),

    exit: () => set({ ...IDLE, editing: false, saving: false }),

    startNew: () =>
      set({
        ...IDLE,
        detourId: get().detourId,
        editing: true,
        mode: "picking",
        dirty: true,
      }),

    select: (restriction) =>
      set({
        ...IDLE,
        editing: true,
        detourId: restriction.detour_id,
        selectedId: restriction.restriction_id,
        fromIndex: restriction.from_coord_index,
        toIndex: restriction.to_coord_index,
        kind: restriction.kind,
        note: restriction.note ?? "",
        isActive: restriction.is_active,
      }),

    beginRerange: () => {
      if (get().selectedId === null) return;
      set({
        mode: "picking",
        fromIndex: null,
        toIndex: null,
        dirty: true,
        lastError: null,
      });
    },

    pick: (index) =>
      set((state) => {
        if (state.mode !== "picking") return state;
        if (state.fromIndex === null) {
          return { fromIndex: index, toIndex: null, dirty: true };
        }
        if (state.toIndex === null) {
          const range = normalizeRange(state.fromIndex, index);
          return {
            fromIndex: range.from,
            toIndex: range.to,
            mode: "idle",
            dirty: true,
            lastError: null,
          };
        }
        return state;
      }),

    setKind: (kind) => set({ kind, dirty: true }),
    setNote: (note) => set({ note, dirty: true }),
    setActive: (isActive) => set({ isActive, dirty: true }),

    moveEndpoint: (role, index) =>
      set((state) => {
        let from = state.fromIndex;
        let to = state.toIndex;
        if (role === "start") from = index;
        else to = index;
        if (from !== null && to !== null) {
          const range = normalizeRange(from, to);
          from = range.from;
          to = range.to;
        }
        return {
          fromIndex: from,
          toIndex: to,
          mode: "idle",
          dirty: true,
          lastError: null,
        };
      }),

    setLastError: (lastError) => set({ lastError }),
    setSaving: (saving) => set({ saving }),

    markSaved: (restriction) =>
      set({
        editing: true,
        detourId: restriction.detour_id,
        selectedId: restriction.restriction_id,
        fromIndex: restriction.from_coord_index,
        toIndex: restriction.to_coord_index,
        kind: restriction.kind,
        note: restriction.note ?? "",
        isActive: restriction.is_active,
        mode: "idle",
        dirty: false,
        lastError: null,
      }),

    reset: () => set({ ...IDLE, editing: false, saving: false }),
  }),
);
