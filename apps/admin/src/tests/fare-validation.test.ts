import { describe, expect, it } from "vitest";

import {
  validateFareConfigForm,
  type FareConfigFormValues,
} from "@/features/fares/validation";

const validValues: FareConfigFormValues = {
  label: "Jeepney",
  base_fare: "13",
  base_distance_km: "4",
  rate_per_km: "1.8",
  student_discount_pct: "20",
  senior_discount_pct: "20",
  is_active: true,
  is_default: false,
};

describe("validateFareConfigForm", () => {
  it("accepts a minimal valid config", () => {
    expect(validateFareConfigForm(validValues, [])).toEqual({});
  });

  it("accepts a decimal rate with a trailing dot state", () => {
    // "1.80" typed one keystroke at a time passes through "1." — the raw
    // string must survive validation so the final value is 1.8, not 18.
    expect(
      validateFareConfigForm({ ...validValues, rate_per_km: "1." }, [])
        .rate_per_km,
    ).toBeUndefined();
    expect(
      validateFareConfigForm({ ...validValues, rate_per_km: "1.8" }, [])
        .rate_per_km,
    ).toBeUndefined();
  });

  it("rejects an empty label", () => {
    const errors = validateFareConfigForm({ ...validValues, label: "" }, []);
    expect(errors.label).toBeDefined();
  });

  it("rejects a whitespace-only label", () => {
    const errors = validateFareConfigForm({ ...validValues, label: "   " }, []);
    expect(errors.label).toBeDefined();
  });

  it("accepts a label with surrounding whitespace (trimmed)", () => {
    const errors = validateFareConfigForm(
      { ...validValues, label: "  Jeepney  " },
      [],
    );
    expect(errors.label).toBeUndefined();
  });

  it("rejects negative fare, distance, and rate", () => {
    expect(
      validateFareConfigForm({ ...validValues, base_fare: "-1" }, []).base_fare,
    ).toBeDefined();
    expect(
      validateFareConfigForm({ ...validValues, base_distance_km: "-0.01" }, [])
        .base_distance_km,
    ).toBeDefined();
    expect(
      validateFareConfigForm({ ...validValues, rate_per_km: "-5" }, [])
        .rate_per_km,
    ).toBeDefined();
  });

  it("accepts discount bounds 0 and 100", () => {
    const errors = validateFareConfigForm(
      {
        ...validValues,
        student_discount_pct: "0",
        senior_discount_pct: "100",
      },
      [],
    );
    expect(errors.student_discount_pct).toBeUndefined();
    expect(errors.senior_discount_pct).toBeUndefined();
  });

  it("rejects out-of-range discounts (-1 and 101)", () => {
    expect(
      validateFareConfigForm({ ...validValues, student_discount_pct: "-1" }, [])
        .student_discount_pct,
    ).toBeDefined();
    expect(
      validateFareConfigForm({ ...validValues, senior_discount_pct: "101" }, [])
        .senior_discount_pct,
    ).toBeDefined();
  });

  it("rejects non-numeric and blank numeric fields", () => {
    expect(
      validateFareConfigForm({ ...validValues, base_fare: "abc" }, [])
        .base_fare,
    ).toBeDefined();
    expect(
      validateFareConfigForm({ ...validValues, base_distance_km: "" }, [])
        .base_distance_km,
    ).toBeDefined();
  });

  it("rejects a duplicate label case-insensitively", () => {
    const errors = validateFareConfigForm(
      { ...validValues, label: "jeepney" },
      [{ label: "JEEPNEY", fare_config_id: "fc-1" }],
    );
    expect(errors.label).toBeDefined();
  });

  it("excludes self from the duplicate check on edit", () => {
    const errors = validateFareConfigForm(
      { ...validValues, label: "jeepney" },
      [{ label: "Jeepney", fare_config_id: "fc-1" }],
      "fc-1",
    );
    expect(errors.label).toBeUndefined();
  });

  it("rejects is_default when the config is inactive", () => {
    const errors = validateFareConfigForm(
      { ...validValues, is_default: true, is_active: false },
      [],
    );
    expect(errors.form).toBeDefined();
  });

  it("allows is_default when the config is active", () => {
    const errors = validateFareConfigForm(
      { ...validValues, is_default: true, is_active: true },
      [],
    );
    expect(errors.form).toBeUndefined();
  });
});
