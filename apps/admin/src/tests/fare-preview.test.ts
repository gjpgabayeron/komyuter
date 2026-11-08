import { describe, expect, it } from "vitest";

import { farePreviewRows } from "@/features/fares/preview";
import type { FareConfigFormValues } from "@/features/fares/validation";

const values: FareConfigFormValues = {
  label: "Jeepney",
  base_fare: "13",
  base_distance_km: "4",
  rate_per_km: "1.8",
  student_discount_pct: "20",
  senior_discount_pct: "20",
  is_active: true,
  is_default: false,
};

describe("farePreviewRows", () => {
  it("returns the three sample distances at the LTFRB defaults", () => {
    expect(farePreviewRows(values)).toEqual([
      { distanceKm: 4, regular: 13, student: 10.4, senior: 10.4 },
      { distanceKm: 10, regular: 23.8, student: 19.04, senior: 19.04 },
      { distanceKm: 20, regular: 41.8, student: 33.44, senior: 33.44 },
    ]);
  });

  it("uses the configured passenger discounts", () => {
    const rows = farePreviewRows({
      ...values,
      student_discount_pct: "0",
      senior_discount_pct: "50",
    });
    expect(rows?.[1]).toEqual({
      distanceKm: 10,
      regular: 23.8,
      student: 23.8,
      senior: 11.9,
    });
  });

  it("returns null for an invalid or mid-typing value", () => {
    expect(farePreviewRows({ ...values, rate_per_km: "1." })).not.toBeNull();
    expect(farePreviewRows({ ...values, rate_per_km: "" })).toBeNull();
    expect(farePreviewRows({ ...values, base_fare: "abc" })).toBeNull();
    expect(
      farePreviewRows({ ...values, student_discount_pct: "101" }),
    ).toBeNull();
  });
});
