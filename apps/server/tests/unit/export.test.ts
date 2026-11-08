import { describe, expect, it } from "vitest";
import {
  buildExportDataset,
  referenceCheck,
  type ExportRows,
} from "../../src/domain/export";

const POLYLINE = {
  type: "LineString",
  coordinates: [
    [122.5, 10.6],
    [122.51, 10.61],
    [122.52, 10.62],
  ],
};

const POINT_A = { type: "Point", coordinates: [122.5, 10.6] };
const POINT_B = { type: "Point", coordinates: [122.52, 10.62] };

function fixtureRows(): ExportRows {
  return {
    routeRows: [
      {
        route_id: "calaparan-calumpang",
        name: "Calaparan to Calumpang",
        short_name: "R1",
        color: "#1B7A6A",
        is_active: true,
        fare_config_id: "default",
      },
    ],
    fareRows: [
      {
        fare_config_id: "default",
        label: "Default",
        base_fare: "13.00",
        base_distance_km: "4.00",
        rate_per_km: "1.80",
        student_discount_pct: "20",
        senior_discount_pct: "20",
        is_default: true,
      },
    ],
    directionRows: [
      {
        direction_id: "dir-1",
        route_id: "calaparan-calumpang",
        label: "Outbound",
        is_active: true,
        origin_stop_id: "stop-1",
        destination_stop_id: "stop-2",
        base_polyline: POLYLINE,
      },
    ],
    stopRows: [
      {
        stop_id: "stop-1",
        direction_id: "dir-1",
        name: "Calaparan Terminal",
        type: "terminal",
        stop_order: 1,
        is_guaranteed_service: true,
        landmark_hint: "Main terminal",
        location: POINT_A,
      },
      {
        stop_id: "stop-2",
        direction_id: "dir-1",
        name: "Calumpang",
        type: "major_stop",
        stop_order: 2,
        is_guaranteed_service: true,
        landmark_hint: null,
        location: POINT_B,
      },
    ],
    detourRows: [],
    detourStopRows: [],
    restrictionRows: [],
  };
}

describe("buildExportDataset", () => {
  it("builds the correct dataset shape from fixture rows", () => {
    const dataset = buildExportDataset(
      fixtureRows(),
      "2026-01-01T00:00:00.000Z",
    );

    expect(dataset.schema_version).toBe("1.1");
    expect(dataset.coordinate_order).toBe("lng_lat");
    expect(dataset.exported_at).toBe("2026-01-01T00:00:00.000Z");

    expect(dataset.fare_configs).toHaveLength(1);
    expect(dataset.fare_configs[0].base_fare).toBe(13);
    expect(dataset.fare_configs[0].rate_per_km).toBe(1.8);

    expect(dataset.routes).toHaveLength(1);
    const route = dataset.routes[0];
    expect(route.route_id).toBe("calaparan-calumpang");
    expect(route.fare_config_id).toBe("default");

    const direction = route.directions[0];
    expect(direction.label).toBe("Outbound");
    expect(direction.terminals.origin).toBe("stop-1");
    expect(direction.terminals.destination).toBe("stop-2");
    expect(direction.base_polyline.type).toBe("LineString");
    expect(direction.stops).toHaveLength(2);
    expect(direction.stops.map((s) => s.stop_id)).toEqual(["stop-1", "stop-2"]);
    expect(direction.detours).toEqual([]);
    expect(direction.restrictions).toEqual([]);
  });

  it("sorts stops by stop_order regardless of input order", () => {
    const rows = fixtureRows();
    rows.stopRows = [
      { ...rows.stopRows[1], stop_order: 2 },
      { ...rows.stopRows[0], stop_order: 1 },
    ];
    const dataset = buildExportDataset(rows, "2026-01-01T00:00:00.000Z");
    expect(
      dataset.routes[0].directions[0].stops.map((s) => s.stop_order),
    ).toEqual([1, 2]);
  });

  it("returns an empty routes array for an empty database", () => {
    const rows: ExportRows = {
      routeRows: [],
      fareRows: [],
      directionRows: [],
      stopRows: [],
      detourRows: [],
      detourStopRows: [],
      restrictionRows: [],
    };
    const dataset = buildExportDataset(rows, "2026-01-01T00:00:00.000Z");
    expect(dataset.routes).toEqual([]);
    expect(dataset.fare_configs).toEqual([]);
  });

  it("emits no arrival-time or ETA fields anywhere in the dataset", () => {
    const dataset = buildExportDataset(
      fixtureRows(),
      "2026-01-01T00:00:00.000Z",
    );
    const json = JSON.stringify(dataset);
    expect(json).not.toMatch(/"eta"/i);
    expect(json).not.toMatch(/"arrival"/i);
    expect(json).not.toMatch(/"departure"/i);
  });
});

describe("referenceCheck", () => {
  it("reports no problems for a well-formed dataset", () => {
    const dataset = buildExportDataset(
      fixtureRows(),
      "2026-01-01T00:00:00.000Z",
    );
    expect(referenceCheck(dataset)).toEqual([]);
  });

  it("reports a terminal that references an unknown stop", () => {
    const dataset = buildExportDataset(
      fixtureRows(),
      "2026-01-01T00:00:00.000Z",
    );
    dataset.routes[0].directions[0].terminals.origin = "missing-stop";
    const problems = referenceCheck(dataset);
    expect(problems.some((p) => p.includes("missing-stop"))).toBe(true);
  });
});
