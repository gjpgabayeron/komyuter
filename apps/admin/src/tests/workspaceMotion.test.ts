import { describe, expect, it } from "vitest";
import {
  REVEAL_DURATION_MS,
  REVEAL_EASING_CSS,
  revealEasing,
} from "@/features/routes/workspace/motion";

describe("the context plate's reveal motion (#25)", () => {
  it("keeps one duration and one curve for the plate and the camera", () => {
    expect(REVEAL_DURATION_MS).toBe(180);
    expect(REVEAL_EASING_CSS).toBe("cubic-bezier(0, 0, 0.2, 1)");
  });

  it("starts at 0 and lands at 1", () => {
    expect(revealEasing(0)).toBe(0);
    expect(revealEasing(1)).toBe(1);
    expect(revealEasing(-0.5)).toBe(0);
    expect(revealEasing(1.5)).toBe(1);
  });

  it("is an ease-out: most of the distance is covered early", () => {
    // cubic-bezier(0, 0, 0.2, 1) reaches about 0.75 at the midpoint.
    expect(revealEasing(0.5)).toBeGreaterThan(0.6);
    expect(revealEasing(0.5)).toBeLessThan(0.9);
  });

  it("never runs backwards", () => {
    let previous = 0;
    for (let i = 1; i <= 10; i += 1) {
      const next = revealEasing(i / 10);
      expect(next).toBeGreaterThanOrEqual(previous);
      previous = next;
    }
  });
});
