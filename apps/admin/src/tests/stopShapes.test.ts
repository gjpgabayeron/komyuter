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
