import { describe, expect, it } from "vitest";
import { formatKm, formatPct, formatPeso } from "@/features/fares/format";

describe("formatPeso", () => {
  it("formats whole pesos without decimals", () => {
    expect(formatPeso(13)).toBe("₱13");
    expect(formatPeso(0)).toBe("₱0");
  });

  it("formats fractional pesos with exactly two decimals", () => {
    expect(formatPeso(13.5)).toBe("₱13.50");
    expect(formatPeso(13.25)).toBe("₱13.25");
  });

  it("never fabricates a whole number from a fraction", () => {
    expect(formatPeso(13.01)).toBe("₱13.01");
  });
});

describe("formatKm", () => {
  it("strips decimals from whole kilometres", () => {
    expect(formatKm(4)).toBe("4");
  });

  it("keeps up to two decimals, trailing zeros stripped", () => {
    expect(formatKm(4.5)).toBe("4.5");
    expect(formatKm(4.25)).toBe("4.25");
  });

  it("rounds to at most two decimals", () => {
    expect(formatKm(4.256)).toBe("4.26");
  });
});

describe("formatPct", () => {
  it("formats whole-number percentages", () => {
    expect(formatPct(0)).toBe("0%");
    expect(formatPct(20)).toBe("20%");
    expect(formatPct(100)).toBe("100%");
  });
});
