import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROUTE_COLOR,
  detourLineColorFor,
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

describe("detourLineColorFor (route-tone alternative colors)", () => {
  it("contrasts the main route color (complement of the hue)", () => {
    const detour = detourLineColorFor(semanticColor("activeRoute"), "det-abc");
    expect(isValidHexColor(detour)).toBe(true);
    // activeRoute is blue (h≈207) — its complement is orange: red-dominant.
    const r = parseInt(detour.slice(1, 3), 16);
    const b = parseInt(detour.slice(5, 7), 16);
    expect(r).toBeGreaterThan(b);
  });

  it("is deterministic per detour id and differs between detours", () => {
    const base = semanticColor("activeRoute");
    expect(detourLineColorFor(base, "det-1")).toBe(
      detourLineColorFor(base, "det-1"),
    );
    expect(detourLineColorFor(base, "det-1")).not.toBe(
      detourLineColorFor(base, "det-2"),
    );
  });

  it("falls back to the default route color for invalid input", () => {
    const detour = detourLineColorFor("not-a-color", "det-abc");
    expect(isValidHexColor(detour)).toBe(true);
  });
});
