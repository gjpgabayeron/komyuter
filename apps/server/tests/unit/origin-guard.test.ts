import { describe, expect, it } from "vitest";
import { parseOrigins } from "../../src/api/origin-guard";

describe("parseOrigins", () => {
  it("splits on commas and trims each entry", () => {
    expect(
      parseOrigins("http://localhost:5173,https://admin.komyuter.ph"),
    ).toEqual(["http://localhost:5173", "https://admin.komyuter.ph"]);
    expect(parseOrigins("  http://a.example ,  http://b.example  ")).toEqual([
      "http://a.example",
      "http://b.example",
    ]);
  });

  // A blank entry must never survive as an empty string: `Origin: ` would then
  // match it, and the guard would allow a request it was meant to refuse.
  it("drops empty and whitespace-only entries", () => {
    expect(parseOrigins("")).toEqual([]);
    expect(parseOrigins("   ")).toEqual([]);
    expect(parseOrigins("http://a.example,,   ,http://b.example")).toEqual([
      "http://a.example",
      "http://b.example",
    ]);
    expect(parseOrigins(",,")).toEqual([]);
  });

  it("keeps a single-origin allowlist intact (the production shape)", () => {
    expect(parseOrigins("https://admin.komyuter.ph")).toEqual([
      "https://admin.komyuter.ph",
    ]);
  });

  it("does not treat a blank-only entry as a wildcard", () => {
    expect(parseOrigins(" ")).not.toContain("*");
    expect(parseOrigins("*")).toEqual(["*"]);
  });
});
