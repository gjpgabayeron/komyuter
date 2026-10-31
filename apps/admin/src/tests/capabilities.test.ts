import { describe, expect, it } from "vitest";
import type { Permission } from "@komyuter/shared";
import { CAPABILITIES, capabilitiesFromPermissions } from "@/lib/capabilities";

/**
 * The one capability module (ADR-0019 §9 M2b amendment): the server resolves
 * the Effective Permission Set, and these are the only questions the dashboard
 * asks of it. The seeded sets below are the wire shapes the server actually
 * sends — `redesign/seed.sql` for the Administrator, and the two Roles M2b's
 * exit criterion names.
 */
const ADMINISTRATOR: Permission[] = [
  "ROUTES_EDIT",
  "FARES_EDIT",
  "EXPORT_DATASET",
  "MAPBOX_GEOSERVICES",
  "ADMIN_MANAGE",
];

const PLOTTER: Permission[] = ["ROUTES_EDIT", "MAPBOX_GEOSERVICES"];

/** A Viewer holds no Permission at all: transit reads are open to every Account. */
const VIEWER: Permission[] = [];

describe("capabilitiesFromPermissions", () => {
  it("answers every question true for the seeded Administrator", () => {
    expect(capabilitiesFromPermissions(ADMINISTRATOR)).toEqual({
      editRoutes: true,
      editFares: true,
      exportDataset: true,
      searchPlaces: true,
      manageAccounts: true,
    });
  });

  it("answers every question false for an empty set", () => {
    expect(capabilitiesFromPermissions([])).toEqual({
      editRoutes: false,
      editFares: false,
      exportDataset: false,
      searchPlaces: false,
      manageAccounts: false,
    });
  });

  it("gives a Plotter route editing and place search, nothing else", () => {
    expect(capabilitiesFromPermissions(PLOTTER)).toEqual({
      editRoutes: true,
      editFares: false,
      exportDataset: false,
      searchPlaces: true,
      manageAccounts: false,
    });
  });

  it("gives a Viewer no capability at all — reads need no Permission", () => {
    expect(capabilitiesFromPermissions(VIEWER)).toEqual(
      capabilitiesFromPermissions([]),
    );
  });

  it("is a set query, not a count: one Permission answers one question", () => {
    expect(capabilitiesFromPermissions(["ADMIN_MANAGE"])).toEqual({
      editRoutes: false,
      editFares: false,
      exportDataset: false,
      searchPlaces: false,
      manageAccounts: true,
    });
  });

  it("ignores an unknown name on the wire rather than answering true", () => {
    const wire = ["ROUTES_EDIT", "ROUTES_DELETE"] as unknown as Permission[];
    expect(capabilitiesFromPermissions(wire).editRoutes).toBe(true);
    expect(capabilitiesFromPermissions(wire).editFares).toBe(false);
  });
});

describe("CAPABILITIES", () => {
  it("lists exactly the five questions, in one place", () => {
    expect(CAPABILITIES).toEqual([
      "editRoutes",
      "editFares",
      "exportDataset",
      "searchPlaces",
      "manageAccounts",
    ]);
  });
});
