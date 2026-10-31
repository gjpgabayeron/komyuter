import { describe, expect, it } from "vitest";
import type { Permission } from "@komyuter/shared";
import {
  canSeeSection,
  getSectionByPath,
  sections,
  visibleSections,
} from "@/lib/sections";

const ADMINISTRATOR: Permission[] = [
  "ROUTES_EDIT",
  "FARES_EDIT",
  "EXPORT_DATASET",
  "MAPBOX_GEOSERVICES",
  "ADMIN_MANAGE",
];
const PLOTTER: Permission[] = ["ROUTES_EDIT", "MAPBOX_GEOSERVICES"];
const VIEWER: Permission[] = [];

const ids = (permissions: Permission[]) =>
  visibleSections(permissions).map((section) => section.id);

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
  it("requires ADMIN_MANAGE for the Accounts entry and nothing for the rest", () => {
    const accounts = sections.find((section) => section.id === "accounts");
    expect(accounts?.permission).toBe("ADMIN_MANAGE");
    for (const section of sections) {
      if (section.id !== "accounts") {
        expect(section.permission).toBeUndefined();
      }
    }
  });

  it("hides the Accounts entry from an Account without ADMIN_MANAGE", () => {
    expect(ids(ADMINISTRATOR)).toContain("accounts");
    expect(ids(PLOTTER)).not.toContain("accounts");
    expect(ids(VIEWER)).not.toContain("accounts");
  });

  it("keeps every other entry for every seeded Role", () => {
    const others = ["overview", "routes", "fares", "export"];
    for (const permissions of [ADMINISTRATOR, PLOTTER, VIEWER]) {
      expect(ids(permissions)).toEqual(expect.arrayContaining(others));
    }
  });

  it("treats an entry with no declared Permission as visible to everyone", () => {
    expect(
      canSeeSection(
        { id: "routes", label: "Routes", path: "/routes" } as never,
        [],
      ),
    ).toBe(true);
  });
});
