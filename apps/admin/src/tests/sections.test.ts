import { describe, expect, it } from "vitest";
import { getSectionByPath, sections } from "@/lib/sections";

describe("sections registry", () => {
  it("exposes the four canonical sections in order", () => {
    expect(sections.map((s) => s.id)).toEqual([
      "overview",
      "routes",
      "fares",
      "export",
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
  });

  it("resolves the routes workspace nested path", () => {
    expect(getSectionByPath("/routes/some-route")?.id).toBe("routes");
  });

  it("returns undefined for an unknown path", () => {
    expect(getSectionByPath("/unknown")).toBeUndefined();
  });
});
