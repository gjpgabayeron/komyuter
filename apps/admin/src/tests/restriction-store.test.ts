import { beforeEach, describe, expect, it } from "vitest";
import type { Restriction } from "@komyuter/shared";

import {
  DEFAULT_RESTRICTION_KIND,
  useRestrictionStore,
} from "@/features/restrictions/restrictionStore";

const saved: Restriction = {
  restriction_id: "r-1",
  direction_id: "d-1",
  detour_id: null,
  from_coord_index: 3,
  to_coord_index: 7,
  kind: "no_unloading",
  note: "Bridge works",
  is_active: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  created_by: null,
  updated_by: null,
};

describe("restriction editor store", () => {
  beforeEach(() => useRestrictionStore.getState().reset());

  it("starts a new restriction in pick mode with the both default", () => {
    useRestrictionStore.getState().startNew();
    const state = useRestrictionStore.getState();
    expect(state.mode).toBe("picking");
    expect(state.selectedId).toBeNull();
    expect(state.fromIndex).toBeNull();
    expect(state.toIndex).toBeNull();
    expect(state.kind).toBe(DEFAULT_RESTRICTION_KIND);
  });

  it("sets from with the first click and to with the second", () => {
    useRestrictionStore.getState().startNew();
    useRestrictionStore.getState().pick(5);
    expect(useRestrictionStore.getState().fromIndex).toBe(5);
    expect(useRestrictionStore.getState().toIndex).toBeNull();
    useRestrictionStore.getState().pick(9);
    expect(useRestrictionStore.getState().fromIndex).toBe(5);
    expect(useRestrictionStore.getState().toIndex).toBe(9);
    expect(useRestrictionStore.getState().mode).toBe("idle");
  });

  it("sorts a backwards second click", () => {
    useRestrictionStore.getState().startNew();
    useRestrictionStore.getState().pick(9);
    useRestrictionStore.getState().pick(4);
    expect(useRestrictionStore.getState().fromIndex).toBe(4);
    expect(useRestrictionStore.getState().toIndex).toBe(9);
  });

  it("ignores a third click once the range is complete", () => {
    useRestrictionStore.getState().startNew();
    useRestrictionStore.getState().pick(1);
    useRestrictionStore.getState().pick(2);
    useRestrictionStore.getState().pick(8);
    const state = useRestrictionStore.getState();
    expect(state.fromIndex).toBe(1);
    expect(state.toIndex).toBe(2);
    expect(state.mode).toBe("idle");
  });

  it("ignores picks while idle", () => {
    useRestrictionStore.getState().pick(4);
    expect(useRestrictionStore.getState().fromIndex).toBeNull();
  });

  it("loads a saved restriction into the editor", () => {
    useRestrictionStore.getState().select(saved);
    const state = useRestrictionStore.getState();
    expect(state.mode).toBe("idle");
    expect(state.selectedId).toBe("r-1");
    expect(state.fromIndex).toBe(3);
    expect(state.toIndex).toBe(7);
    expect(state.kind).toBe("no_unloading");
    expect(state.note).toBe("Bridge works");
  });

  it("keeps the selection while re-ranging and clears the old range", () => {
    useRestrictionStore.getState().select(saved);
    useRestrictionStore.getState().beginRerange();
    const state = useRestrictionStore.getState();
    expect(state.selectedId).toBe("r-1");
    expect(state.mode).toBe("picking");
    expect(state.fromIndex).toBeNull();
    expect(state.toIndex).toBeNull();
  });

  it("does not re-range without a selection", () => {
    useRestrictionStore.getState().beginRerange();
    expect(useRestrictionStore.getState().mode).toBe("idle");
  });

  it("resets to the idle defaults", () => {
    useRestrictionStore.getState().select(saved);
    useRestrictionStore.getState().setNote("changed");
    useRestrictionStore.getState().reset();
    expect(useRestrictionStore.getState()).toMatchObject({
      mode: "idle",
      selectedId: null,
      fromIndex: null,
      toIndex: null,
      kind: DEFAULT_RESTRICTION_KIND,
      note: "",
    });
  });
});
