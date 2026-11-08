import { describe, expect, it } from "vitest";
import {
  WORKSPACE_GEOMETRY,
  computeMapWidth,
  isMapGateActive,
} from "@/features/routes/workspace/geometry";

/** The fixed tokens (specs/008 plan.md Geometry table). */
describe("WORKSPACE_GEOMETRY", () => {
  it("fixes the tokens that make collisions impossible at the floor", () => {
    expect(WORKSPACE_GEOMETRY.leftCol).toBe(280);
    expect(WORKSPACE_GEOMETRY.contextCol).toBe(280);
    expect(WORKSPACE_GEOMETRY.rightCol).toBe(280);
    // No gutter track — the 12 px `p-3` inset padding on each column cell is
    // the spacing; an extra gutter would double-space (see WorkspaceColumns).
    expect(WORKSPACE_GEOMETRY.gutter).toBe(0);
    // The same inset is the visible region's edge breathing room (#25).
    expect(WORKSPACE_GEOMETRY.columnInset).toBe(12);
    // Raised from 400 with the 280 px columns, so a 1024 window still gates.
    expect(WORKSPACE_GEOMETRY.minMapWidth).toBe(420);
  });
});

describe("computeMapWidth", () => {
  it("overview: viewport − left column (no gutter track)", () => {
    expect(computeMapWidth(1024, 0, "overview")).toBe(744);
    expect(computeMapWidth(1440, 0, "overview")).toBe(1160);
    expect(computeMapWidth(1920, 0, "overview")).toBe(1640);
  });

  it("focus/edit: viewport − left − right (no gutter tracks)", () => {
    expect(computeMapWidth(1024, 0, "focus")).toBe(464);
    expect(computeMapWidth(1440, 0, "focus")).toBe(880);
    expect(computeMapWidth(1920, 0, "focus")).toBe(1360);
    // edit shares the right-column footprint — content swap, no resize
    expect(computeMapWidth(1440, 0, "edit")).toBe(880);
  });

  it("is invariant to how the rail is passed (post-rail viewport ≡ viewport − railW)", () => {
    expect(computeMapWidth(1072, 48, "focus")).toBe(
      computeMapWidth(1024, 0, "focus"),
    );
  });

  it("never returns a negative width", () => {
    expect(computeMapWidth(200, 300, "focus")).toBe(0);
  });

  it("documents the literal-1024-window case: 48 px rail leaves 976 px of workspace → 416 → gate fires (FR-004)", () => {
    expect(computeMapWidth(976, 0, "focus")).toBe(416);
    expect(isMapGateActive(416)).toBe(true);
  });
});

describe("isMapGateActive", () => {
  it("guards the 420 px map floor (419 / 420 / 421 boundary)", () => {
    expect(isMapGateActive(419)).toBe(true);
    expect(isMapGateActive(420)).toBe(false);
    expect(isMapGateActive(421)).toBe(false);
  });
});
