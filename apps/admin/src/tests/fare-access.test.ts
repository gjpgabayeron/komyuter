import { describe, expect, it } from "vitest";
import { capabilitiesFromPermissions, fareAccess } from "@/lib/capabilities";

/**
 * The Fares surface under dashboard-wide degradation (ticket #48, ADR-0019 §9
 * M2b amendment): without `FARES_EDIT` the page keeps its table and loses every
 * mutating control — omitted, never disabled.
 *
 * The seeded sets are the ones `supabase/migrations/0007_authorization.sql`
 * writes: Administrator mask 31, Plotter mask 11 (`ROUTES_EDIT | FARES_EDIT |
 * MAPBOX_GEOSERVICES`), Viewer 0.
 */
const ADMINISTRATOR = capabilitiesFromPermissions([
  "ROUTES_EDIT",
  "FARES_EDIT",
  "EXPORT_DATASET",
  "MAPBOX_GEOSERVICES",
  "ADMIN_MANAGE",
]);
const PLOTTER = capabilitiesFromPermissions([
  "ROUTES_EDIT",
  "FARES_EDIT",
  "MAPBOX_GEOSERVICES",
]);
const VIEWER = capabilitiesFromPermissions([]);

/** Every control the page offers today, named one by one so the matrix is explicit. */
const OFFERED = {
  readOnly: false,
  showCreate: true,
  showEdit: true,
  showDeactivate: true,
  showDefaultToggle: true,
  showActionsColumn: true,
};

const ABSENT = {
  readOnly: true,
  showCreate: false,
  showEdit: false,
  showDeactivate: false,
  showDefaultToggle: false,
  showActionsColumn: false,
};

describe("fareAccess", () => {
  it("offers the seeded Administrator every fare mutation", () => {
    expect(fareAccess(ADMINISTRATOR)).toEqual(OFFERED);
  });

  it("offers the seeded Plotter the same mutations — it holds FARES_EDIT", () => {
    expect(fareAccess(PLOTTER)).toEqual(OFFERED);
  });

  it("keeps the seeded Viewer's table and drops every mutation", () => {
    expect(fareAccess(VIEWER)).toEqual(ABSENT);
  });

  it("drops every mutation for an empty set too", () => {
    expect(fareAccess(capabilitiesFromPermissions([]))).toEqual(ABSENT);
  });

  it("answers from FARES_EDIT alone, not from a count of Permissions", () => {
    const everythingButFares = capabilitiesFromPermissions([
      "ROUTES_EDIT",
      "EXPORT_DATASET",
      "MAPBOX_GEOSERVICES",
      "ADMIN_MANAGE",
    ]);
    expect(fareAccess(everythingButFares)).toEqual(ABSENT);
  });

  it("offers the mutations to an Account holding FARES_EDIT and nothing else", () => {
    expect(fareAccess(capabilitiesFromPermissions(["FARES_EDIT"]))).toEqual(
      OFFERED,
    );
  });
});
