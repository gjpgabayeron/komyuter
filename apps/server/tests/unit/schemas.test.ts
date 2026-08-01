import { describe, expect, it } from "vitest";
import {
  createDirectionSchema,
  createFareConfigSchema,
  createRestrictionSchema,
  createRouteSchema,
  createStopSchema,
  routeIdSchema,
} from "@komyuter/shared";

describe("routeIdSchema", () => {
  it("accepts lower-case slug ids", () => {
    expect(
      routeIdSchema.safeParse("calaparan-calumpang-iloilo-city").success,
    ).toBe(true);
    expect(routeIdSchema.safeParse("route-1").success).toBe(true);
  });

  it("rejects invalid slugs", () => {
    expect(routeIdSchema.safeParse("Route Name").success).toBe(false);
    expect(routeIdSchema.safeParse("UPPER").success).toBe(false);
    expect(routeIdSchema.safeParse("").success).toBe(false);
    expect(routeIdSchema.safeParse("-leading").success).toBe(false);
  });
});

describe("createRouteSchema", () => {
  it("accepts a minimal valid body", () => {
    const result = createRouteSchema.safeParse({
      name: "Calaparan to Calumpang",
      short_name: "R1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(
      createRouteSchema.safeParse({ name: "", short_name: "R1" }).success,
    ).toBe(false);
  });

  it("rejects an invalid color", () => {
    const result = createRouteSchema.safeParse({
      name: "Calaparan to Calumpang",
      short_name: "R1",
      color: "blue",
    });
    expect(result.success).toBe(false);
  });
});

describe("createDirectionSchema", () => {
  const base = {
    label: "Outbound",
    base_polyline: {
      type: "LineString",
      coordinates: [
        [121.0, 14.6],
        [121.1, 14.7],
      ],
    },
  };

  it("accepts a valid body", () => {
    expect(createDirectionSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a LineString with a single coordinate", () => {
    const result = createDirectionSchema.safeParse({
      ...base,
      base_polyline: { type: "LineString", coordinates: [[121.0, 14.6]] },
    });
    expect(result.success).toBe(false);
  });
});

describe("createStopSchema", () => {
  it("accepts a valid body", () => {
    const result = createStopSchema.safeParse({
      name: "Calumpang Terminal",
      type: "terminal",
      location: { type: "Point", coordinates: [122.6, 10.7] },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-terminal stop type", () => {
    const result = createStopSchema.safeParse({
      name: "Calumpang Terminal",
      type: "bus_stop",
      location: { type: "Point", coordinates: [122.6, 10.7] },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a negative stop_order", () => {
    const result = createStopSchema.safeParse({
      name: "Calumpang Terminal",
      type: "terminal",
      location: { type: "Point", coordinates: [122.6, 10.7] },
      stop_order: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe("createRestrictionSchema", () => {
  it("accepts a valid body", () => {
    const result = createRestrictionSchema.safeParse({
      from_coord_index: 0,
      to_coord_index: 3,
      reason: "no_stopping_zone",
      affects: "boarding",
    });
    expect(result.success).toBe(true);
  });

  it("rejects out-of-order indices at the schema level only when negative", () => {
    expect(
      createRestrictionSchema.safeParse({
        from_coord_index: -1,
        to_coord_index: 3,
        reason: "no_stopping_zone",
        affects: "boarding",
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown reason", () => {
    expect(
      createRestrictionSchema.safeParse({
        from_coord_index: 0,
        to_coord_index: 3,
        reason: "flood",
        affects: "boarding",
      }).success,
    ).toBe(false);
  });
});

describe("createFareConfigSchema", () => {
  it("accepts LTFRB default parameters", () => {
    const result = createFareConfigSchema.safeParse({
      label: "LTFRB Default Fare",
      base_fare: 13,
      base_distance_km: 4,
      rate_per_km: 1.8,
      student_discount_pct: 20,
      senior_discount_pct: 20,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a discount percentage over 100", () => {
    const result = createFareConfigSchema.safeParse({
      label: "LTFRB Default Fare",
      base_fare: 13,
      base_distance_km: 4,
      rate_per_km: 1.8,
      student_discount_pct: 150,
      senior_discount_pct: 20,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a negative base fare", () => {
    const result = createFareConfigSchema.safeParse({
      label: "LTFRB Default Fare",
      base_fare: -1,
      base_distance_km: 4,
      rate_per_km: 1.8,
      student_discount_pct: 20,
      senior_discount_pct: 20,
    });
    expect(result.success).toBe(false);
  });
});
