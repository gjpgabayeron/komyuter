import { describe, expect, it } from "vitest";
import {
  capabilitiesFromPermissions,
  noCapabilities,
  type Capabilities,
} from "@/lib/capabilities";
import {
  canSeeSection,
  getSectionByPath,
  sections,
  visibleSections,
} from "@/lib/sections";

/**
 * The navigation registry, and the Permission each entry declares. The seeded
 * sets below are the wire shapes `supabase/migrations/0007_authorization.sql`
 * seeds — Administrator holds every Permission (mask 31), Plotter the plotting
 * set `ROUTES_EDIT | FARES_EDIT | MAPBOX_GEOSERVICES` (mask 11), Viewer none.
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

/** The three entries every Account may open; reads need no Permission. */
const OPEN_SECTIONS = ["overview", "routes", "fares"];

const ids = (capabilities: Capabilities) =>
  visibleSections(capabilities).map((section) => section.id);

describe("sections registry", () => {
  it("exposes the canonical sections in order", () => {
    expect(sections.map((s) => s.id)).toEqual([
      "overview",
      "routes",
      "fares",
      "export",
      "accounts",
    ]);
  });

  it("has unique ids", () => {
    const ids = sections.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("resolves exact paths", () => {
    expect(getSectionByPath("/")?.id).toBe("overview");
    expect(getSectionByPath("/routes")?.id).toBe("routes");
    expect(getSectionByPath("/fares")?.id).toBe("fares");
    expect(getSectionByPath("/export")?.id).toBe("export");
    expect(getSectionByPath("/accounts")?.id).toBe("accounts");
  });

  it("resolves the routes workspace nested path", () => {
    expect(getSectionByPath("/routes/some-route")?.id).toBe("routes");
  });

  it("returns undefined for an unknown path", () => {
    expect(getSectionByPath("/unknown")).toBeUndefined();
  });
});

describe("declared Permissions on navigation entries", () => {
  it("requires EXPORT_DATASET for Export and ADMIN_MANAGE for Accounts", () => {
    const declared = Object.fromEntries(
      sections.map((section) => [section.id, section.permission]),
    );
    expect(declared).toEqual({
      overview: undefined,
      routes: undefined,
      fares: undefined,
      export: "EXPORT_DATASET",
      accounts: "ADMIN_MANAGE",
    });
  });

  it("shows every entry to the seeded Administrator", () => {
    expect(ids(ADMINISTRATOR)).toEqual([
      "overview",
      "routes",
      "fares",
      "export",
      "accounts",
    ]);
  });

  it("hides Export and Accounts from the seeded Plotter", () => {
    expect(ids(PLOTTER)).toEqual(OPEN_SECTIONS);
  });

  it("keeps Overview, Routes and Fares for a Viewer and for an empty set", () => {
    expect(ids(VIEWER)).toEqual(OPEN_SECTIONS);
    expect(ids(noCapabilities())).toEqual(OPEN_SECTIONS);
  });

  it("keeps Fares visible without FARES_EDIT — it degrades, it does not vanish", () => {
    expect(ids(VIEWER)).toContain("fares");
    expect(ids(capabilitiesFromPermissions(["FARES_EDIT"]))).toContain("fares");
  });

  it("treats an entry with no declared Permission as visible to everyone", () => {
    expect(
      canSeeSection(
        { id: "routes", label: "Routes", path: "/routes" } as never,
        noCapabilities(),
      ),
    ).toBe(true);
  });

  it("hides an entry whose declared Permission no capability answers for", () => {
    expect(
      canSeeSection(
        {
          id: "routes",
          label: "Routes",
          path: "/routes",
          permission: "TRANSIT_WRITE",
        } as never,
        ADMINISTRATOR,
      ),
    ).toBe(false);
  });
});
