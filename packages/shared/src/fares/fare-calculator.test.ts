import { describe, expect, it } from "vitest";

import {
  fareCalculator,
  type FareRule,
  type PassengerType,
} from "./fare-calculator";

const LTFRB: FareRule = {
  base_fare: 13,
  base_distance_km: 4,
  rate_per_km: 1.8,
  student_discount_pct: 20,
  senior_discount_pct: 20,
};

describe("fareCalculator", () => {
  it("charges only the base fare inside the base distance", () => {
    expect(fareCalculator(LTFRB, 4)).toEqual({
      baseFare: 13,
      distanceCharge: 0,
      subtotal: 13,
      discount: 0,
      total: 13,
    });
  });

  it("charges the base fare at distance zero", () => {
    expect(fareCalculator(LTFRB, 0).total).toBe(13);
  });

  it("charges the marginal rate beyond the base distance", () => {
    expect(fareCalculator(LTFRB, 10)).toEqual({
      baseFare: 13,
      distanceCharge: 10.8,
      subtotal: 23.8,
      discount: 0,
      total: 23.8,
    });
  });

  it("applies the student discount to the whole fare", () => {
    expect(fareCalculator(LTFRB, 10, "student")).toEqual({
      baseFare: 13,
      distanceCharge: 10.8,
      subtotal: 23.8,
      discount: 4.76,
      total: 19.04,
    });
  });

  it("applies the senior discount to the whole fare", () => {
    expect(fareCalculator(LTFRB, 4, "senior")).toEqual({
      baseFare: 13,
      distanceCharge: 0,
      subtotal: 13,
      discount: 2.6,
      total: 10.4,
    });
  });

  it("honours a zero discount", () => {
    const rule = { ...LTFRB, student_discount_pct: 0 };
    expect(fareCalculator(rule, 10, "student").total).toBe(23.8);
  });

  it("honours a 100% discount", () => {
    const rule = { ...LTFRB, senior_discount_pct: 100 };
    expect(fareCalculator(rule, 10, "senior")).toEqual({
      baseFare: 13,
      distanceCharge: 10.8,
      subtotal: 23.8,
      discount: 23.8,
      total: 0,
    });
  });

  it("rounds every money field to centavos", () => {
    const rule: FareRule = {
      base_fare: 0.005,
      base_distance_km: 0,
      rate_per_km: 0.333,
      student_discount_pct: 0,
      senior_discount_pct: 0,
    };
    const result = fareCalculator(rule, 1);
    expect(result.baseFare).toBe(0.01);
    expect(result.distanceCharge).toBe(0.33);
    expect(result.subtotal).toBe(0.34);
    expect(result.total).toBe(0.34);
    expect(Number.isInteger(result.total * 100)).toBe(true);
  });

  it("keeps total = subtotal - discount after rounding", () => {
    const rule: FareRule = {
      base_fare: 12.99,
      base_distance_km: 3.3,
      rate_per_km: 1.77,
      student_discount_pct: 17,
      senior_discount_pct: 23,
    };
    for (const distance of [0, 3.3, 7.1, 12.47]) {
      for (const passenger of [
        "regular",
        "student",
        "senior",
      ] as PassengerType[]) {
        const result = fareCalculator(rule, distance, passenger);
        expect(result.total).toBe(
          Math.round((result.subtotal - result.discount) * 100) / 100,
        );
      }
    }
  });

  it("rejects negative or non-finite distances", () => {
    expect(() => fareCalculator(LTFRB, -1)).toThrow(RangeError);
    expect(() => fareCalculator(LTFRB, Number.NaN)).toThrow(RangeError);
    expect(() => fareCalculator(LTFRB, Number.POSITIVE_INFINITY)).toThrow(
      RangeError,
    );
  });

  it("rejects a negative rule value", () => {
    expect(() => fareCalculator({ ...LTFRB, rate_per_km: -1 }, 5)).toThrow(
      RangeError,
    );
  });

  it("rejects a discount outside 0–100", () => {
    expect(() =>
      fareCalculator({ ...LTFRB, student_discount_pct: 101 }, 5, "student"),
    ).toThrow(RangeError);
  });

  it("rejects an unknown passenger type at runtime", () => {
    expect(() =>
      fareCalculator(LTFRB, 5, "pwd" as unknown as PassengerType),
    ).toThrow(RangeError);
  });
});
