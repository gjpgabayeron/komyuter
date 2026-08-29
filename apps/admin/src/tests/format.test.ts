import { describe, expect, it } from "vitest";
import { displayValue } from "@/features/routes/format";

/**
 * Guardrail for FR-009 (contracts/ui-patterns.md §2): an absent value reads
 * "Not set" — never a bare dash that doubles as "loading". A real 0 is a
 * value and MUST render as "0", not "Not set".
 */
describe("displayValue", () => {
  it("renders null and undefined as 'Not set'", () => {
    expect(displayValue(null)).toBe("Not set");
    expect(displayValue(undefined)).toBe("Not set");
  });

  it("renders 0 as '0' — absence is not zero (FR-009)", () => {
    expect(displayValue(0)).toBe("0");
  });

  it("passes numbers through unchanged", () => {
    expect(displayValue(3)).toBe("3");
    expect(displayValue(-12.5)).toBe("-12.5");
  });

  it("passes strings through unchanged", () => {
    expect(displayValue("hello")).toBe("hello");
    expect(displayValue("")).toBe("");
  });

  it("renders false as 'false' (a real value, not absence)", () => {
    expect(displayValue(false)).toBe("false");
  });
});
