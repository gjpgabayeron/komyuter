import { describe, expect, it } from "vitest";
import {
  WORKSPACE_GEOMETRY,
  computeMapWidth,
  isMapGateActive,
} from "@/features/routes/workspace/geometry";

/** The fixed tokens (plan.md Geometry table / REFACTOR.md). */
describe("WORKSPACE_GEOMETRY", () => {
  it("fixes the tokens that make collisions impossible at the floor", () => {
    expect(WORKSPACE_GEOMETRY.leftCol).toBe(256);
    expect(WORKSPACE_GEOMETRY.rightCol).toBe(336);
    expect(WORKSPACE_GEOMETRY.gutter).toBe(0);
    expect(WORKSPACE_GEOMETRY.minMapWidth).toBe(400);
  });
});

describe("computeMapWidth", () => {
  it("overview: viewport − left column − one gutter", () => {
    expect(computeMapWidth(1024, 0, "overview")).toBe(752);
    expect(computeMapWidth(1440, 0, "overview")).toBe(1168);
    expect(computeMapWidth(1920, 0, "overview")).toBe(1648);
  });

  it("focus/edit: viewport − left − right − 2 gutters (reference figures)", () => {
    expect(computeMapWidth(1024, 0, "focus")).toBe(400);
    expect(computeMapWidth(1440, 0, "focus")).toBe(816);
    expect(computeMapWidth(1920, 0, "focus")).toBe(1296);
    // edit shares the right-column footprint — content swap, no resize
    expect(computeMapWidth(1440, 0, "edit")).toBe(816);
  });

  it("is invariant to how the rail is passed (post-rail viewport ≡ viewport − railW)", () => {
    expect(computeMapWidth(1072, 48, "focus")).toBe(
      computeMapWidth(1024, 0, "focus"),
    );
  });

  it("never returns a negative width", () => {
    expect(computeMapWidth(200, 300, "focus")).toBe(0);
  });

  it("documents the literal-1024-window case: 48 px rail leaves 976 px of workspace → 352 → gate fires (FR-004)", () => {
    expect(computeMapWidth(976, 0, "focus")).toBe(352);
    expect(isMapGateActive(352)).toBe(true);
  });
});

describe("isMapGateActive", () => {
  it("guards the 400 px map floor (399 / 400 / 401 boundary)", () => {
    expect(isMapGateActive(399)).toBe(true);
    expect(isMapGateActive(400)).toBe(false);
    expect(isMapGateActive(401)).toBe(false);
  });
});
