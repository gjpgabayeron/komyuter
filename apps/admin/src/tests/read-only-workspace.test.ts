import { describe, expect, it } from "vitest";
import type { Permission } from "@komyuter/shared";
import type { DraftPayload } from "@/lib/draft";
import {
  capabilitiesFromPermissions,
  isReadOnlyWorkspace,
  offersDraftRestore,
  workspaceAccess,
  writesDraft,
} from "@/lib/capabilities";

/**
 * The Read-only Workspace (CONTEXT.md): what the workspace offers an Account
 * without `ROUTES_EDIT`. These are the decisions the page, the provider and
 * the map read — the genuinely visual pass is manual, but every rule that
 * decides *whether* an affordance exists is a pure function here.
 */
const EDITOR = capabilitiesFromPermissions(["ROUTES_EDIT"] as Permission[]);
const VIEWER = capabilitiesFromPermissions([] as Permission[]);
/** A Viewer that may still spend the gated Mapbox token (M2b amendment). */
const VIEWER_WITH_SEARCH = capabilitiesFromPermissions([
  "MAPBOX_GEOSERVICES",
] as Permission[]);

const DRAFT: DraftPayload = {
  savedAt: 1_700_000_000_000,
  routeId: "iloilo-city-proper",
  directionId: "direction-1",
  stops: [],
  polyline: null,
  connections: [],
  history: { past: [], future: [] },
  routeMeta: null,
  pathStopIds: null,
};

describe("isReadOnlyWorkspace", () => {
  it("is the absence of ROUTES_EDIT, not a mode", () => {
    expect(isReadOnlyWorkspace(VIEWER)).toBe(true);
    expect(isReadOnlyWorkspace(EDITOR)).toBe(false);
  });

  it("stays read-only for an Account holding every other Permission", () => {
    const noRouteEditing = capabilitiesFromPermissions([
      "FARES_EDIT",
      "EXPORT_DATASET",
      "MAPBOX_GEOSERVICES",
      "ADMIN_MANAGE",
    ]);
    expect(isReadOnlyWorkspace(noRouteEditing)).toBe(true);
  });
});

describe("workspaceAccess", () => {
  it("offers a read-only Account no mutating affordance and a status plate", () => {
    expect(workspaceAccess(VIEWER)).toEqual({
      readOnly: true,
      showPlotActionBar: false,
      showReadOnlyPlate: true,
      showSave: false,
      shortcuts: { save: false, undo: false, redo: false },
      showPlaceSearch: false,
    });
  });

  it("keeps the plotting tools for an Account that may edit", () => {
    expect(workspaceAccess(EDITOR)).toEqual({
      readOnly: false,
      showPlotActionBar: true,
      showReadOnlyPlate: false,
      showSave: true,
      shortcuts: { save: true, undo: true, redo: true },
      showPlaceSearch: false,
    });
  });

  it("keeps place search independent of editing: it needs MAPBOX_GEOSERVICES", () => {
    expect(workspaceAccess(VIEWER_WITH_SEARCH)).toEqual({
      ...workspaceAccess(VIEWER),
      showPlaceSearch: true,
    });
    expect(
      workspaceAccess(capabilitiesFromPermissions(["MAPBOX_GEOSERVICES"]))
        .readOnly,
    ).toBe(true);
  });
  it("answers from the Permission alone, not from the workspace state", () => {
    // The same Account gets the same answer whether or not a route is open:
    // the four workspace states only change what is on the map, never what
    // may be written.
    expect(workspaceAccess(VIEWER).showSave).toBe(false);
    expect(workspaceAccess(EDITOR).showSave).toBe(true);
  });
});

describe("the Draft lifecycle", () => {
  it("writes no Draft for a read-only Account", () => {
    expect(writesDraft(VIEWER)).toBe(false);
    expect(writesDraft(EDITOR)).toBe(true);
  });

  it("leaves an existing Draft untouched and offers no restore", () => {
    expect(offersDraftRestore(VIEWER, DRAFT)).toBe(false);
    expect(writesDraft(VIEWER)).toBe(false);
  });

  it("offers the Draft to an Account that may edit", () => {
    expect(offersDraftRestore(EDITOR, DRAFT)).toBe(true);
    expect(offersDraftRestore(EDITOR, null)).toBe(false);
  });
});
