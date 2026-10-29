import { describe, expect, it } from "vitest";
import {
  WORKSPACE_GEOMETRY,
  computeMapWidth,
  deriveWorkspaceLayout,
  visibleMapWidth,
} from "@/features/routes/workspace/geometry";

/** A workspace-width viewport — the measured container right of the shell rail. */
const VIEWPORT = 1488;
const { leftCol, rightCol } = WORKSPACE_GEOMETRY;

/**
 * The workspace's plate configuration, as data.
 *
 * These cases pin what the grid rendered BEFORE the derivation existed, so the
 * refactor that introduced the seam is provably behaviour-neutral. Every later
 * configuration (a revealed context column, a hidden properties plate) is a new
 * case on this same function rather than a new branch in a component.
 */
describe("deriveWorkspaceLayout (the workspace's plate configuration)", () => {
  it("empty: no plates, the map has the whole workspace", () => {
    const layout = deriveWorkspaceLayout({ state: "empty", rightPlate: false });
    expect(layout.tracks.template).toBe("0px 0px minmax(0, 1fr) 0px 0px");
    expect(visibleMapWidth(layout, VIEWPORT)).toBe(VIEWPORT);
  });

  it("overview: the stops column only", () => {
    const layout = deriveWorkspaceLayout({
      state: "overview",
      rightPlate: false,
    });
    expect(layout.tracks.template).toBe(
      `${leftCol}px 0px minmax(0, 1fr) 0px 0px`,
    );
    expect(visibleMapWidth(layout, VIEWPORT)).toBe(1232);
  });

  it("focus and edit: both columns", () => {
    for (const state of ["focus", "edit"] as const) {
      const layout = deriveWorkspaceLayout({ state, rightPlate: true });
      expect(layout.tracks.template).toBe(
        `${leftCol}px 0px minmax(0, 1fr) 0px ${rightCol}px`,
      );
      expect(visibleMapWidth(layout, VIEWPORT)).toBe(896);
    }
  });

  it("focus and edit collapse the right track when there is no right plate", () => {
    // The confident-single-hit case: the plate declines, so the track must not
    // keep its width — the map gets it back.
    for (const state of ["focus", "edit"] as const) {
      const layout = deriveWorkspaceLayout({ state, rightPlate: false });
      expect(layout.tracks.template).toBe(
        `${leftCol}px 0px minmax(0, 1fr) 0px 0px`,
      );
      expect(visibleMapWidth(layout, VIEWPORT)).toBe(1232);
    }
  });

  it("names the variant it was given, so new configurations extend the same value", () => {
    expect(
      deriveWorkspaceLayout({ state: "edit", rightPlate: true }).variant,
    ).toBe("edit");
    expect(
      deriveWorkspaceLayout({ state: "empty", rightPlate: false }).variant,
    ).toBe("empty");
  });

  it("never reports a negative region on a narrow window", () => {
    const layout = deriveWorkspaceLayout({ state: "edit", rightPlate: true });
    expect(visibleMapWidth(layout, 400)).toBe(0);
  });
});

describe("computeMapWidth (gate measure) delegates to the same derivation", () => {
  it("keeps the reference figures the gate and its tests rely on", () => {
    expect(computeMapWidth(1024, 0, "overview")).toBe(768);
    expect(computeMapWidth(1024, 0, "focus")).toBe(432);
    expect(computeMapWidth(1024, 0, "edit")).toBe(432);
  });

  it("accounts for the shell rail", () => {
    // At a literal 1024px window the collapsed rail leaves a 976px workspace:
    // 976 - 256 - 336 = 384, below the 400px floor — the gate guards, as documented.
    expect(computeMapWidth(1024, 48, "edit")).toBe(384);
  });
});

describe("deriveWorkspaceLayout — the revealed context column (#24)", () => {
  it("edit + search: the context column occludes the map's left edge", () => {
    const layout = deriveWorkspaceLayout({
      state: "edit",
      rightPlate: false,
      contextPlate: true,
    });
    expect(layout.variant).toBe("edit+search");
    expect(layout.context).toEqual({
      visible: true,
      width: WORKSPACE_GEOMETRY.contextCol,
    });
    expect(layout.insets.left).toBe(
      WORKSPACE_GEOMETRY.leftCol + WORKSPACE_GEOMETRY.contextCol,
    );
    expect(visibleMapWidth(layout, VIEWPORT)).toBe(912);
  });

  it("leaves the grid template alone — the plate overlays, it adds no track", () => {
    // Why: a real track would shift the floating chrome (the search pill)
    // sideways the moment results appear. The pill must not move under the
    // caret, so the plate is anchored to the free region's left edge instead.
    const plain = deriveWorkspaceLayout({ state: "edit", rightPlate: true });
    const searching = deriveWorkspaceLayout({
      state: "edit",
      rightPlate: true,
      contextPlate: true,
    });
    expect(searching.tracks.template).toBe(plain.tracks.template);
  });

  it("only the edit state can hold a context column", () => {
    for (const state of ["empty", "overview", "focus"] as const) {
      const layout = deriveWorkspaceLayout({
        state,
        rightPlate: state === "focus",
        contextPlate: true,
      });
      expect(layout.context.visible).toBe(false);
      expect(layout.variant).toBe(state);
    }
  });

  it("the session inset is stops + context, never stops + context + properties", () => {
    const layout = deriveWorkspaceLayout({
      state: "edit",
      rightPlate: false,
      contextPlate: true,
    });
    expect(layout.insets).toEqual({
      left: WORKSPACE_GEOMETRY.leftCol + WORKSPACE_GEOMETRY.contextCol,
      right: 0,
    });
  });

  it("defaults to no context column, so existing callers are unaffected", () => {
    const layout = deriveWorkspaceLayout({ state: "edit", rightPlate: true });
    expect(layout.context).toEqual({ visible: false, width: 0 });
    expect(layout.variant).toBe("edit");
  });
});
