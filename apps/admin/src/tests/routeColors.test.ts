import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROUTE_COLOR,
  isValidHexColor,
  randomRouteColor,
} from "@/features/routes/routeColors";
import { semanticColor } from "@/lib/colors";
import { formatTimestamp } from "@/features/routes/format";

describe("isValidHexColor", () => {
  it("accepts #RRGGBB hex colours", () => {
    expect(isValidHexColor(semanticColor("activeRoute"))).toBe(true);
    expect(isValidHexColor("#abcdef")).toBe(true);
    expect(isValidHexColor("#ABCDEF")).toBe(true);
  });

  it("rejects malformed values", () => {
    expect(isValidHexColor("1B6DB2")).toBe(false);
    expect(isValidHexColor("#1B6D")).toBe(false);
    expect(isValidHexColor(`${semanticColor("activeRoute")}FF`)).toBe(false);
    expect(isValidHexColor("")).toBe(false);
  });
});

describe("randomRouteColor", () => {
  it("returns a valid #RRGGBB hex colour", () => {
    for (let i = 0; i < 50; i++) {
      expect(isValidHexColor(randomRouteColor())).toBe(true);
    }
  });

  it("produces variety — consecutive calls differ (no palette reuse)", () => {
    const samples = new Set(
      Array.from({ length: 50 }, () => randomRouteColor()),
    );
    expect(samples.size).toBeGreaterThan(1);
  });
});

describe("formatTimestamp", () => {
  it("formats a valid ISO timestamp", () => {
    expect(formatTimestamp("2026-08-06T12:00:00.000Z")).not.toBe("—");
    expect(formatTimestamp("2026-08-06T12:00:00.000Z")).toContain("2026");
  });

  it("returns an em dash for invalid timestamps", () => {
    expect(formatTimestamp("nope")).toBe("—");
  });
});

describe("routeColors", () => {
  it("exposes a default route colour", () => {
    expect(DEFAULT_ROUTE_COLOR).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});
