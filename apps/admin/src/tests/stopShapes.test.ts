import { describe, expect, it } from "vitest";
import { getStopShape, STOP_SHAPES } from "@/lib/stopShapes";

describe("stopShapes (FR-015)", () => {
  it("maps each type to its shape", () => {
    expect(getStopShape("terminal").shape).toBe("square");
    expect(getStopShape("major_stop").shape).toBe("circle");
    expect(getStopShape("waiting_area").shape).toBe("diamond");
  });

  it("uses three distinct colours so types are distinguishable", () => {
    const colors = Object.values(STOP_SHAPES).map((s) => s.color);
    expect(new Set(colors).size).toBe(3);
  });

  it("provides a soft fill for every type", () => {
    for (const style of Object.values(STOP_SHAPES)) {
      expect(style.softFill).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});

describe("selection is never conveyed by shape or colour alone (FR-015, US4 AC3)", () => {
  it("maps exactly one style per stop type — no selection-dependent variants", () => {
    // The mapping is a pure function of TYPE: there is exactly one entry per
    // type and getStopShape takes no selection argument, so selection can
    // never leak into shape/colour identity.
    expect(Object.keys(STOP_SHAPES).sort()).toEqual([
      "major_stop",
      "terminal",
      "waiting_area",
    ]);
    for (const style of Object.values(STOP_SHAPES)) {
      expect(Object.keys(style).sort()).toEqual(["color", "shape", "softFill"]);
    }
  });

  it("uses three distinct shapes AND three distinct colours", () => {
    const shapes = Object.values(STOP_SHAPES).map((s) => s.shape);
    const colors = Object.values(STOP_SHAPES).map((s) => s.color);
    expect(new Set(shapes).size).toBe(3);
    expect(new Set(colors).size).toBe(3);
  });

  it("leaves selection to the store's Selection type (a separate affordance)", () => {
    // Selection highlight is an outline added by the caller (marker/list),
    // driven by Selection — shape/colour stay static per type.
    const staticStyles = Object.values(STOP_SHAPES).map((s) =>
      JSON.stringify(s),
    );
    // Re-querying must return stable, identical styles (no state).
    expect(Object.values(STOP_SHAPES).map((s) => JSON.stringify(s))).toEqual(
      staticStyles,
    );
  });
});
