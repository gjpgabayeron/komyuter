import { describe, expect, it } from "vitest";
import { SQL } from "drizzle-orm";
import type { ExportDataset, GeoLineString, GeoPoint } from "@komyuter/shared";
import {
  DatasetImportRefusal,
  assertEmptyTarget,
  assertOwnerUsable,
  describeDatabaseTarget,
  parseImportArgs,
  planImport,
  validateImportPayload,
} from "../../src/domain/dataset-import";

/**
 * The importer's pure half: payload validation, the two refusal families the
 * caller is responsible for (owner, target), and the field-by-field mapping a
 * one-way copy depends on. Nothing here touches Postgres — the round-trip
 * against the real stack lives in `tests/integration/import-dataset.test.ts`.
 */

const IMPORTED_AT = new Date("2026-11-20T08:00:00.000Z");
const OWNER = {
  userId: "6f1a1d3e-2b4c-4d5e-8f90-0123456789ab",
  email: "owner@komyuter.ph",
};

const LINE: GeoLineString = {
  type: "LineString",
  coordinates: [
    [122.5, 10.6],
    [122.51, 10.61],
    [122.52, 10.62],
  ],
};
const POINT_A: GeoPoint = { type: "Point", coordinates: [122.5, 10.6] };
const POINT_MID: GeoPoint = { type: "Point", coordinates: [122.51, 10.61] };
const POINT_B: GeoPoint = { type: "Point", coordinates: [122.52, 10.62] };

/**
 * Hand-written, not produced by the exporter: an expected value that is derived
 * by running the code under test could not disagree with it.
 */
function fixtureDataset(): ExportDataset {
  return {
    schema_version: "1.2",
    coordinate_order: "lng_lat",
    exported_at: "2026-11-19T23:00:00.000Z",
    fare_configs: [
      {
        fare_config_id: "default",
        label: "LTFRB default",
        base_fare: 13,
        base_distance_km: 4,
        rate_per_km: 1.8,
        student_discount_pct: 20,
        senior_discount_pct: 20,
        is_default: true,
        is_active: true,
      },
    ],
    routes: [
      {
        route_id: "calaparan-calumpang",
        name: "Calaparan to Calumpang",
        short_name: "R1",
        color: "#1B7A6A",
        // A draft route: the soft-delete flag is part of the Working Set.
        is_active: false,
        fare_config_id: "default",
        directions: [
          {
            direction_id: "dir-base",
            direction_kind: "base",
            label: "Outbound",
            is_active: true,
            terminals: { origin: "stop-a", destination: "stop-b" },
            base_polyline: LINE,
            stops: [
              {
                stop_id: "stop-a",
                name: "Calaparan",
                type: "terminal",
                stop_order: 1,
                is_guaranteed_service: true,
                derived_from_stop_id: null,
                ar_marker_enabled: false,
                landmark_hint: "Beside the bakery",
                notes: "Wait under the mango tree",
                is_active: true,
                location: POINT_A,
              },
              {
                stop_id: "stop-b",
                name: "Calumpang",
                type: "major_stop",
                stop_order: 2,
                is_guaranteed_service: false,
                derived_from_stop_id: null,
                ar_marker_enabled: true,
                landmark_hint: null,
                notes: null,
                is_active: false,
                location: POINT_B,
              },
            ],
            detours: [
              {
                detour_id: "det-1",
                label: "Market diversion",
                entry: POINT_A,
                exit: POINT_B,
                detour_polyline: LINE,
                additional_distance_meters: 400,
                commuter_instruction: "Take the diversion",
                driver_instruction: "Turn right at the market",
                is_active: false,
                detour_stops: [
                  {
                    detour_stop_id: "dstop-1",
                    stop_order: 1,
                    name: "Market",
                    location: POINT_MID,
                    type: "waiting_area",
                    is_guaranteed_service: false,
                    landmark_hint: "Beside the market",
                    notes: "Detour stop note",
                  },
                ],
              },
            ],
            restrictions: [
              {
                restriction_id: "res-1",
                detour_id: "det-1",
                from_coord_index: 0,
                to_coord_index: 1,
                kind: "no_loading",
                note: "No loading during market hours",
                is_active: false,
              },
            ],
          },
          {
            direction_id: "dir-return",
            direction_kind: "return",
            label: "Inbound",
            is_active: true,
            terminals: { origin: "stop-r1", destination: "stop-r2" },
            base_polyline: {
              type: "LineString",
              coordinates: [
                [122.52, 10.62],
                [122.51, 10.61],
                [122.5, 10.6],
              ],
            },
            stops: [
              {
                stop_id: "stop-r1",
                name: "Calumpang",
                type: "major_stop",
                stop_order: 1,
                is_guaranteed_service: false,
                // The mirrored base stop, ADR-0031 §4.
                derived_from_stop_id: "stop-b",
                ar_marker_enabled: true,
                landmark_hint: null,
                notes: null,
                is_active: false,
                location: POINT_B,
              },
              {
                stop_id: "stop-r2",
                name: "Calaparan",
                type: "terminal",
                stop_order: 2,
                is_guaranteed_service: true,
                derived_from_stop_id: "stop-a",
                ar_marker_enabled: false,
                landmark_hint: "Beside the bakery",
                notes: "Wait under the mango tree",
                is_active: true,
                location: POINT_A,
              },
            ],
            detours: [],
            restrictions: [],
          },
        ],
      },
    ],
  };
}

/** The payload as it arrives from disk: untyped JSON. */
function fixturePayload(): unknown {
  return JSON.parse(JSON.stringify(fixtureDataset())) as unknown;
}

describe("import dataset — payload validation", () => {
  it("accepts a schema-valid v1.2 export and its reference graph", () => {
    const dataset = validateImportPayload(fixturePayload());
    expect(dataset).toEqual(fixtureDataset());
  });

  it("refuses a payload that is not a v1.2 export", () => {
    const payload = fixturePayload() as Record<string, unknown>;
    payload.schema_version = "1.1";
    expect(() => validateImportPayload(payload)).toThrowError(
      DatasetImportRefusal,
    );
    try {
      validateImportPayload(payload);
    } catch (error) {
      const refusal = error as DatasetImportRefusal;
      expect(refusal.reason).toBe("invalid-payload");
      expect(refusal.message).toContain("schema_version");
    }
  });

  it("refuses a payload that is not JSON at all", () => {
    expect(() => validateImportPayload(undefined)).toThrowError(
      DatasetImportRefusal,
    );
    expect(() => validateImportPayload("not a dataset")).toThrowError(
      DatasetImportRefusal,
    );
  });

  it("refuses a dangling terminal even though the schema passes", () => {
    const payload = fixturePayload() as ExportDataset;
    payload.routes[0].directions[0].terminals.origin = "stop-ghost";
    try {
      validateImportPayload(payload);
      throw new Error("expected a refusal");
    } catch (error) {
      const refusal = error as DatasetImportRefusal;
      expect(refusal).toBeInstanceOf(DatasetImportRefusal);
      expect(refusal.reason).toBe("dangling-reference");
      expect(refusal.message).toContain("stop-ghost");
    }
  });

  it("refuses a detour id that collides with a direction id", () => {
    const payload = fixturePayload() as ExportDataset;
    payload.routes[0].directions[0].detours[0].detour_id = "dir-return";
    try {
      validateImportPayload(payload);
      throw new Error("expected a refusal");
    } catch (error) {
      const refusal = error as DatasetImportRefusal;
      expect(refusal.reason).toBe("dangling-reference");
      expect(refusal.message).toContain("dir-return");
    }
  });
});

describe("import dataset — refusals the caller owns", () => {
  it("refuses a target that already holds routes", () => {
    expect(() => assertEmptyTarget(3)).toThrowError(DatasetImportRefusal);
    try {
      assertEmptyTarget(1);
    } catch (error) {
      const refusal = error as DatasetImportRefusal;
      expect(refusal.reason).toBe("target-not-empty");
      // The operator must be told which target refused and why, with no
      // --force to reach for.
      expect(refusal.message).toContain("1 route");
    }
    expect(() => assertEmptyTarget(0)).not.toThrow();
  });

  it("refuses an owner that has no Account", () => {
    try {
      assertOwnerUsable(undefined, "ghost@komyuter.ph");
      throw new Error("expected a refusal");
    } catch (error) {
      const refusal = error as DatasetImportRefusal;
      expect(refusal).toBeInstanceOf(DatasetImportRefusal);
      expect(refusal.reason).toBe("missing-owner");
      expect(refusal.message).toContain("ghost@komyuter.ph");
    }
  });

  it("refuses an owner whose Account is deactivated", () => {
    try {
      assertOwnerUsable(
        { userId: OWNER.userId, email: OWNER.email, isActive: false },
        OWNER.email,
      );
      throw new Error("expected a refusal");
    } catch (error) {
      const refusal = error as DatasetImportRefusal;
      expect(refusal.reason).toBe("inactive-owner");
      expect(refusal.message).toContain(OWNER.email);
    }
  });

  it("maps an active owner row to the Account the import is attributed to", () => {
    expect(
      assertOwnerUsable(
        { userId: OWNER.userId, email: OWNER.email, isActive: true },
        OWNER.email,
      ),
    ).toEqual({ userId: OWNER.userId, email: OWNER.email });
  });
});

describe("import dataset — mapping", () => {
  const plan = planImport(fixtureDataset(), OWNER, IMPORTED_AT);

  it("counts every row it will write", () => {
    expect(plan.counts).toEqual({
      fare_configs: 1,
      routes: 1,
      directions: 2,
      stops: 4,
      detours: 1,
      detour_stops: 1,
      restrictions: 1,
    });
  });

  it("preserves the fare configuration and its default flag", () => {
    const [fare] = plan.fareConfigs;
    expect(fare.fare_config_id).toBe("default");
    expect(fare.label).toBe("LTFRB default");
    expect(Number(fare.base_fare)).toBe(13);
    expect(Number(fare.base_distance_km)).toBe(4);
    expect(Number(fare.rate_per_km)).toBe(1.8);
    expect(Number(fare.student_discount_pct)).toBe(20);
    expect(Number(fare.senior_discount_pct)).toBe(20);
    expect(fare.is_default).toBe(true);
    expect(fare.is_active).toBe(true);
    expect(fare).toMatchObject(attribution());
  });

  it("preserves route identity, the draft flag and the fare link", () => {
    const [route] = plan.routes;
    expect(route.route_id).toBe("calaparan-calumpang");
    expect(route.name).toBe("Calaparan to Calumpang");
    expect(route.short_name).toBe("R1");
    expect(route.color).toBe("#1B7A6A");
    expect(route.is_active).toBe(false);
    expect(route.fare_config_id).toBe("default");
    // The Route Version starts at 1: an import is the first save.
    expect(route.version).toBe(1);
    expect(route).toMatchObject(attribution());
  });

  it("preserves every Direction id, its kind and its terminals", () => {
    const byId = new Map(plan.directions.map((d) => [d.direction_id, d]));
    const base = byId.get("dir-base");
    const ret = byId.get("dir-return");
    expect(base).toBeTruthy();
    expect(ret).toBeTruthy();
    expect(base!.direction_kind).toBe("base");
    expect(ret!.direction_kind).toBe("return");
    expect(base!.route_id).toBe("calaparan-calumpang");
    expect(base!.origin_stop_id).toBe("stop-a");
    expect(base!.destination_stop_id).toBe("stop-b");
    expect(ret!.origin_stop_id).toBe("stop-r1");
    expect(ret!.destination_stop_id).toBe("stop-r2");
    expect(base!.is_active).toBe(true);
    expect(base!.version).toBe(1);
    expect(ret!.version).toBe(1);
    // Geometry is handed to the PostGIS helper as an SQL expression, never as a
    // raw string that would be stored untyped.
    expect(base!.base_polyline).toBeInstanceOf(SQL);
    expect(base).toMatchObject(attribution());
  });

  it("preserves every Stop id, its order, its identity link and its flags", () => {
    const byId = new Map(plan.stops.map((s) => [s.stop_id, s]));
    expect(Array.from(byId.keys()).sort()).toEqual([
      "stop-a",
      "stop-b",
      "stop-r1",
      "stop-r2",
    ]);

    const a = byId.get("stop-a")!;
    expect(a.direction_id).toBe("dir-base");
    expect(a.name).toBe("Calaparan");
    expect(a.type).toBe("terminal");
    expect(a.stop_order).toBe(1);
    expect(a.is_guaranteed_service).toBe(true);
    expect(a.derived_from_stop_id).toBeNull();
    expect(a.ar_marker_enabled).toBe(false);
    expect(a.landmark_hint).toBe("Beside the bakery");
    expect(a.notes).toBe("Wait under the mango tree");
    expect(a.is_active).toBe(true);
    expect(a.location).toBeInstanceOf(SQL);
    expect(a).toMatchObject(attribution());

    expect(byId.get("stop-b")!.is_active).toBe(false);

    // The return pair keeps the identity ADR-0031 §4 records, so a re-import
    // rebuilds the pairing instead of guessing it by position.
    expect(byId.get("stop-r1")!.derived_from_stop_id).toBe("stop-b");
    expect(byId.get("stop-r2")!.derived_from_stop_id).toBe("stop-a");
    expect(byId.get("stop-r1")!.direction_id).toBe("dir-return");
  });

  it("preserves the detour, its stop and the deactivated flag", () => {
    const [detour] = plan.detours;
    expect(detour.detour_id).toBe("det-1");
    expect(detour.direction_id).toBe("dir-base");
    expect(detour.label).toBe("Market diversion");
    expect(detour.additional_distance_meters).toBe(400);
    expect(detour.commuter_instruction).toBe("Take the diversion");
    expect(detour.driver_instruction).toBe("Turn right at the market");
    expect(detour.is_active).toBe(false);
    expect(detour.entry).toBeInstanceOf(SQL);
    expect(detour.exit).toBeInstanceOf(SQL);
    expect(detour.detour_polyline).toBeInstanceOf(SQL);
    expect(detour).toMatchObject(attribution());

    const [stop] = plan.detourStops;
    expect(stop.detour_stop_id).toBe("dstop-1");
    expect(stop.detour_id).toBe("det-1");
    expect(stop.stop_order).toBe(1);
    expect(stop.name).toBe("Market");
    expect(stop.type).toBe("waiting_area");
    expect(stop.is_guaranteed_service).toBe(false);
    expect(stop.landmark_hint).toBe("Beside the market");
    expect(stop.notes).toBe("Detour stop note");
    expect(stop.location).toBeInstanceOf(SQL);
    expect(stop).toMatchObject(attribution());
  });

  it("preserves the restriction and the detour it belongs to", () => {
    const [restriction] = plan.restrictions;
    expect(restriction.restriction_id).toBe("res-1");
    expect(restriction.direction_id).toBe("dir-base");
    expect(restriction.detour_id).toBe("det-1");
    expect(restriction.from_coord_index).toBe(0);
    expect(restriction.to_coord_index).toBe(1);
    expect(restriction.kind).toBe("no_loading");
    expect(restriction.note).toBe("No loading during market hours");
    expect(restriction.is_active).toBe(false);
    expect(restriction).toMatchObject(attribution());
  });

  /** Timestamps are the import time and both attribution columns are the owner. */
  function attribution() {
    return {
      created_at: IMPORTED_AT,
      updated_at: IMPORTED_AT,
      created_by: OWNER.userId,
      updated_by: OWNER.userId,
    };
  }
});

describe("import dataset — CLI surface", () => {
  it("reads the file and the owner email from the flags", () => {
    expect(
      parseImportArgs([
        "--file",
        "dataset.json",
        "--owner-email",
        "owner@komyuter.ph",
      ]),
    ).toEqual({ file: "dataset.json", ownerEmail: "owner@komyuter.ph" });
    // `pnpm --filter server import:dataset -- --file …` passes the bare `--`
    // separator through to the script; it is noise, not an argument.
    expect(
      parseImportArgs([
        "--",
        "--file",
        "dataset.json",
        "--owner-email",
        "owner@komyuter.ph",
      ]),
    ).toEqual({ file: "dataset.json", ownerEmail: "owner@komyuter.ph" });
    // `--flag=value` is the form an operator's shell history is most likely to
    // produce when it is not passing the value separately.
    expect(
      parseImportArgs([
        "--file=dataset.json",
        "--owner-email=owner@komyuter.ph",
      ]),
    ).toEqual({ file: "dataset.json", ownerEmail: "owner@komyuter.ph" });
  });

  it("refuses to run without both inputs", () => {
    expect(() => parseImportArgs(["--file", "dataset.json"])).toThrowError(
      DatasetImportRefusal,
    );
    expect(() =>
      parseImportArgs(["--owner-email", "owner@komyuter.ph"]),
    ).toThrowError(DatasetImportRefusal);
    expect(() => parseImportArgs([])).toThrowError(DatasetImportRefusal);
    expect(() =>
      parseImportArgs([
        "--file",
        "dataset.json",
        "--owner-email",
        "owner@komyuter.ph",
        "--force",
      ]),
    ).toThrowError(DatasetImportRefusal);
  });

  it("names the target by host and database only", () => {
    // What the log line may say: where the rows went. What it may never say:
    // the credentials the connection string carries.
    const described = describeDatabaseTarget(
      "postgresql://postgres.abcdefghijkl:s3cret-value@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres",
    );
    expect(described).toBe(
      "aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres",
    );
    expect(described).not.toContain("s3cret-value");
    expect(described).not.toContain("abcdefghijkl");
  });
});
