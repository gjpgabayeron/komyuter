import { describe, expect, it } from "vitest";
import {
  exportDatasetSchema,
  exportDetourSchema,
  exportDirectionSchema,
  exportFareConfigurationSchema,
  exportRestrictionSchema,
  exportStopSchema,
} from "./export-dataset";
import { EXPORT_SCHEMA_VERSION } from "../types/export-dataset";

const POINT_A = { type: "Point", coordinates: [122.5, 10.6] };
const POINT_B = { type: "Point", coordinates: [122.52, 10.62] };

const LINESTRING = {
  type: "LineString",
  coordinates: [
    [122.5, 10.6],
    [122.52, 10.62],
  ],
};

/** A full v1.2 payload: every lossless field the export carries. */
function fixtureDataset() {
  return {
    schema_version: "1.2",
    coordinate_order: "lng_lat",
    exported_at: "2026-01-01T00:00:00.000Z",
    fare_configs: [
      {
        fare_config_id: "default",
        label: "Default",
        base_fare: 13,
        base_distance_km: 4,
        rate_per_km: 1.8,
        student_discount_pct: 20,
        senior_discount_pct: 20,
        is_default: true,
        is_active: false,
      },
    ],
    routes: [
      {
        route_id: "calaparan-calumpang",
        name: "Calaparan to Calumpang",
        short_name: "R1",
        color: "#1B7A6A",
        is_active: true,
        fare_config_id: "default",
        directions: [
          {
            direction_id: "dir-1",
            direction_kind: "base",
            label: "Outbound",
            is_active: true,
            terminals: { origin: "stop-1", destination: "stop-2" },
            base_polyline: LINESTRING,
            stops: [
              {
                stop_id: "stop-1",
                name: "Calaparan Terminal",
                type: "terminal",
                stop_order: 1,
                is_guaranteed_service: true,
                ar_marker_enabled: false,
                landmark_hint: "Main terminal",
                notes: null,
                derived_from_stop_id: null,
                is_active: true,
                location: POINT_A,
              },
              {
                stop_id: "stop-2",
                name: "Calumpang",
                type: "major_stop",
                stop_order: 2,
                is_guaranteed_service: true,
                ar_marker_enabled: true,
                landmark_hint: null,
                notes: "Mirrors the base stop",
                derived_from_stop_id: "stop-1",
                is_active: false,
                location: POINT_B,
              },
            ],
            detours: [
              {
                detour_id: "detour-1",
                label: "Market bypass",
                entry: POINT_A,
                exit: POINT_B,
                detour_polyline: LINESTRING,
                additional_distance_meters: 320,
                commuter_instruction: "Alight after the market",
                driver_instruction: null,
                is_active: false,
                detour_stops: [
                  {
                    detour_stop_id: "detour-stop-1",
                    stop_order: 1,
                    name: "Market corner",
                    location: POINT_A,
                    type: "waiting_area",
                    is_guaranteed_service: false,
                    landmark_hint: null,
                    notes: "Only on market days",
                  },
                ],
              },
            ],
            restrictions: [
              {
                restriction_id: "restriction-1",
                detour_id: "detour-1",
                from_coord_index: 0,
                to_coord_index: 1,
                kind: "no_loading",
                note: null,
                is_active: false,
              },
            ],
          },
        ],
      },
    ],
  };
}

/** Drop a key so a dataset can be shown to be *missing* it. */
function omit(value: object, key: string): void {
  delete (value as Record<string, unknown>)[key];
}

describe("export dataset schema v1.2", () => {
  it("advertises schema version 1.2", () => {
    expect(EXPORT_SCHEMA_VERSION).toBe("1.2");
  });

  it("accepts a v1.2 dataset carrying every lossless field", () => {
    const result = exportDatasetSchema.safeParse(fixtureDataset());
    if (!result.success) {
      throw new Error(JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.success).toBe(true);
  });

  it("round-trips the new fields instead of dropping them", () => {
    const parsed = exportDatasetSchema.parse(fixtureDataset());
    const direction = parsed.routes[0].directions[0];

    expect(direction.direction_kind).toBe("base");
    expect(parsed.fare_configs[0].is_active).toBe(false);
    expect(direction.stops[1].derived_from_stop_id).toBe("stop-1");
    expect(direction.stops[1].notes).toBe("Mirrors the base stop");
    expect(direction.stops[1].ar_marker_enabled).toBe(true);
    expect(direction.stops[1].is_active).toBe(false);
    expect(direction.detours[0].is_active).toBe(false);
    expect(direction.restrictions[0].is_active).toBe(false);
  });

  it("refuses a v1.1 payload, so an old export cannot pass as current", () => {
    const dataset = fixtureDataset();
    dataset.schema_version = "1.1";
    expect(exportDatasetSchema.safeParse(dataset).success).toBe(false);
  });

  it("requires direction_kind on every direction", () => {
    const dataset = fixtureDataset();
    omit(dataset.routes[0].directions[0], "direction_kind");
    expect(exportDatasetSchema.safeParse(dataset).success).toBe(false);
  });

  it("accepts both direction kinds", () => {
    const base = fixtureDataset().routes[0].directions[0];
    const parse = (direction_kind: string) =>
      exportDirectionSchema.safeParse({ ...base, direction_kind });

    expect(parse("base").success).toBe(true);
    expect(parse("return").success).toBe(true);
    expect(parse("sideways").success).toBe(false);
  });

  it("requires the identity, notes, AR and soft-delete fields on a stop", () => {
    for (const key of [
      "derived_from_stop_id",
      "notes",
      "ar_marker_enabled",
      "is_active",
    ]) {
      const stop = fixtureDataset().routes[0].directions[0].stops[0];
      omit(stop, key);
      expect(
        exportStopSchema.safeParse(stop).success,
        `stop without ${key} should be refused`,
      ).toBe(false);
    }
  });

  it("requires is_active on a fare configuration, a detour and a restriction", () => {
    const direction = fixtureDataset().routes[0].directions[0];

    const fare = fixtureDataset().fare_configs[0];
    omit(fare, "is_active");
    expect(exportFareConfigurationSchema.safeParse(fare).success).toBe(false);

    const detour = direction.detours[0];
    omit(detour, "is_active");
    expect(exportDetourSchema.safeParse(detour).success).toBe(false);

    const restriction = direction.restrictions[0];
    omit(restriction, "is_active");
    expect(exportRestrictionSchema.safeParse(restriction).success).toBe(false);
  });

  it("declares no withdrawn trigger field", () => {
    const withdrawn = ["active_timeframes", "condition", "notable_stops"];
    const declared = new Set([
      ...Object.keys(exportDirectionSchema.shape),
      ...Object.keys(exportStopSchema.shape),
      ...Object.keys(exportDetourSchema.shape),
      ...Object.keys(exportRestrictionSchema.shape),
      ...Object.keys(exportFareConfigurationSchema.shape),
    ]);
    for (const key of withdrawn) {
      expect(declared.has(key), `${key} must not be exported`).toBe(false);
    }
  });
});
