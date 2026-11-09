import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import type {
  ExportDataset,
  ExportDetour,
  ExportDirection,
  ExportFareConfiguration,
  ExportRestriction,
  ExportRoute,
  GeoLineString,
  GeoPoint,
} from "@komyuter/shared";
import type { Db } from "../../src/config/db";
import {
  asLineStringFromGeoJSON,
  asPointFromGeoJSON,
} from "../../src/db/queries";
import {
  detourStops as detourStopsTable,
  detours as detoursTable,
  directions as directionsTable,
  fareConfigs as fareConfigsTable,
  restrictions as restrictionsTable,
  routes as routesTable,
  stops as stopsTable,
} from "../../src/db/schema";
import {
  DatasetImportRefusal,
  runDatasetImport,
  type DatasetImportCounts,
} from "../../src/domain/dataset-import";
import { buildExportDataset, readExportRows } from "../../src/domain/export";
import { createTestDb, createTestPool, testEnv } from "./helpers";

/**
 * The one-way import, end to end against the real stack (ticket #78).
 *
 * Isolation: the whole round-trip runs inside a transaction that is ROLLED BACK.
 * The outer transaction also clears the Working Set first, so the importer really
 * does meet an empty target — while every other suite's rows (`komyuter_test` is
 * shared and files run one at a time) come back untouched. The production entry
 * point `runDatasetImport` is called as the script calls it; its own
 * `db.transaction` becomes a SAVEPOINT inside ours, so the code path under test
 * is the shipped one, not a test-only variant.
 */

/** The drizzle handle over `komyuter_test`. */
const db = createTestDb();

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const IMPORTED_AT = new Date("2026-11-20T08:00:00.000Z");
const EXPORTED_AT = "2026-11-19T23:00:00.000Z";

const OWNER_EMAIL = testEnv().ADMIN_EMAIL;

const FARE_ID = "import-roundtrip-fare";
const MAIN_ROUTE = "import-roundtrip-route";
const EMPTY_ROUTE = "import-roundtrip-empty-route";
const BASE_DIR = "import-roundtrip-dir-base";
const RETURN_DIR = "import-roundtrip-dir-return";
const STOP_A = "import-roundtrip-stop-a";
const STOP_B = "import-roundtrip-stop-b";
const RSTOP_B = "import-roundtrip-rstop-b";
const RSTOP_A = "import-roundtrip-rstop-a";
const DETOUR = "import-roundtrip-detour";
const DETOUR_STOP = "import-roundtrip-dstop";
const RESTRICTION = "import-roundtrip-restriction";

const POLYLINE: GeoLineString = {
  type: "LineString",
  coordinates: [
    [122.5, 10.6],
    [122.51, 10.61],
    [122.52, 10.62],
  ],
};
const A: GeoPoint = { type: "Point", coordinates: [122.5, 10.6] };
const MID: GeoPoint = { type: "Point", coordinates: [122.51, 10.61] };
const B: GeoPoint = { type: "Point", coordinates: [122.52, 10.62] };

class RolledBack extends Error {
  constructor(readonly value: unknown) {
    super("rolled back");
    this.name = "RolledBack";
  }
}

/** Run `work` in a transaction and roll it back, returning what it produced. */
async function inRolledBackTransaction<T>(
  work: (tx: Tx) => Promise<T>,
): Promise<T> {
  try {
    await db.transaction(async (tx) => {
      const value = await work(tx);
      throw new RolledBack(value);
    });
  } catch (error) {
    if (error instanceof RolledBack) {
      return error.value as T;
    }
    throw error;
  }
  throw new Error("unreachable: the transaction always throws");
}

/** The importer refuses a non-empty target, so the transaction starts empty of
 *  routes; `routes` cascades to directions → stops/detours → detour stops and
 *  restrictions. */
async function clearWorkingSet(tx: Tx): Promise<void> {
  await tx.delete(routesTable);
  await tx.delete(fareConfigsTable);
}

/**
 * A hand-seeded Working Set: the source of truth the round-trip copies. Written
 * here rather than through the importer so an expectation can never be produced
 * by the code under test. Deliberately carries the state the export only gained
 * in v1.2: a deactivated Stop, `ar_marker_enabled = false`, notes, a derived
 * return pair, a deactivated Detour and a Restriction that names it.
 */
async function seedWorkingSet(tx: Tx): Promise<void> {
  await tx.insert(fareConfigsTable).values({
    fare_config_id: FARE_ID,
    label: "Seeded default",
    base_fare: "13.00",
    base_distance_km: "4.00",
    rate_per_km: "1.80",
    student_discount_pct: "20",
    senior_discount_pct: "20",
    is_default: true,
    is_active: true,
  });

  await tx.insert(routesTable).values([
    {
      route_id: MAIN_ROUTE,
      name: "Calaparan to Calumpang",
      short_name: "R1",
      color: "#1B7A6A",
      is_active: false,
      fare_config_id: FARE_ID,
    },
    // A route with no Directions and no colour: the export encodes the missing
    // colour as an empty string, and an import has to survive the empty graph.
    {
      route_id: EMPTY_ROUTE,
      name: "Draft only",
      short_name: "R9",
      color: null,
      is_active: true,
      fare_config_id: null,
    },
  ]);

  await tx.insert(directionsTable).values([
    {
      direction_id: BASE_DIR,
      route_id: MAIN_ROUTE,
      label: "Outbound",
      base_polyline: asLineStringFromGeoJSON(POLYLINE) as unknown as string,
      origin_stop_id: STOP_A,
      destination_stop_id: STOP_B,
      direction_kind: "base",
      is_active: true,
    },
    {
      direction_id: RETURN_DIR,
      route_id: MAIN_ROUTE,
      label: "Inbound",
      base_polyline: asLineStringFromGeoJSON({
        type: "LineString",
        coordinates: [
          [122.52, 10.62],
          [122.51, 10.61],
          [122.5, 10.6],
        ],
      }) as unknown as string,
      origin_stop_id: RSTOP_B,
      destination_stop_id: RSTOP_A,
      direction_kind: "return",
      is_active: true,
    },
  ]);

  await tx.insert(stopsTable).values([
    {
      stop_id: STOP_A,
      direction_id: BASE_DIR,
      name: "Calaparan",
      stop_order: 1,
      type: "terminal",
      location: asPointFromGeoJSON(A) as unknown as string,
      derived_from_stop_id: null,
      is_guaranteed_service: true,
      ar_marker_enabled: false,
      landmark_hint: "Beside the bakery",
      notes: "Wait under the mango tree",
      is_active: true,
    },
    {
      stop_id: STOP_B,
      direction_id: BASE_DIR,
      name: "Calumpang",
      stop_order: 2,
      type: "major_stop",
      location: asPointFromGeoJSON(B) as unknown as string,
      derived_from_stop_id: null,
      is_guaranteed_service: false,
      ar_marker_enabled: true,
      landmark_hint: null,
      notes: null,
      is_active: false,
    },
    {
      stop_id: RSTOP_B,
      direction_id: RETURN_DIR,
      name: "Calumpang",
      stop_order: 1,
      type: "major_stop",
      location: asPointFromGeoJSON(B) as unknown as string,
      derived_from_stop_id: STOP_B,
      is_guaranteed_service: false,
      ar_marker_enabled: true,
      landmark_hint: null,
      notes: null,
      is_active: false,
    },
    {
      stop_id: RSTOP_A,
      direction_id: RETURN_DIR,
      name: "Calaparan",
      stop_order: 2,
      type: "terminal",
      location: asPointFromGeoJSON(A) as unknown as string,
      derived_from_stop_id: STOP_A,
      is_guaranteed_service: true,
      ar_marker_enabled: false,
      landmark_hint: "Beside the bakery",
      notes: "Wait under the mango tree",
      is_active: true,
    },
  ]);

  await tx.insert(detoursTable).values({
    detour_id: DETOUR,
    direction_id: BASE_DIR,
    label: "Market diversion",
    entry: asPointFromGeoJSON(A) as unknown as string,
    exit: asPointFromGeoJSON(B) as unknown as string,
    detour_polyline: asLineStringFromGeoJSON(POLYLINE) as unknown as string,
    additional_distance_meters: 400,
    commuter_instruction: "Take the diversion",
    driver_instruction: "Turn right at the market",
    is_active: false,
  });

  await tx.insert(detourStopsTable).values({
    detour_stop_id: DETOUR_STOP,
    detour_id: DETOUR,
    stop_order: 1,
    name: "Market",
    location: asPointFromGeoJSON(MID) as unknown as string,
    type: "waiting_area",
    is_guaranteed_service: false,
    landmark_hint: "Beside the market",
    notes: "Detour stop note",
  });

  await tx.insert(restrictionsTable).values({
    restriction_id: RESTRICTION,
    direction_id: BASE_DIR,
    detour_id: DETOUR,
    from_coord_index: 0,
    to_coord_index: 1,
    kind: "no_loading",
    note: "No loading during market hours",
    is_active: false,
  });
}

/** The export as it is read from `tx` — the same assembler the endpoint uses. */
async function exportFrom(tx: Tx): Promise<ExportDataset> {
  // `readExportRows` reads only; the transaction exposes the same query surface.
  return buildExportDataset(
    await readExportRows(tx as unknown as Db),
    EXPORTED_AT,
  );
}

function byKey<T>(key: keyof T & string) {
  return (a: T, b: T): number => (String(a[key]) < String(b[key]) ? -1 : 1);
}

const byOrder = (a: { stop_order: number }, b: { stop_order: number }) =>
  a.stop_order - b.stop_order;

/**
 * Both exports are ordered by nothing in particular (`readExportRows` has no
 * ORDER BY), so the round-trip compares the data, sorted by id/order, not the
 * row order Postgres happened to return.
 */
function normalize(dataset: ExportDataset): ExportDataset {
  return {
    ...dataset,
    fare_configs: [...dataset.fare_configs].sort(
      byKey<ExportFareConfiguration>("fare_config_id"),
    ),
    routes: [...dataset.routes]
      .sort(byKey<ExportRoute>("route_id"))
      .map((route) => ({
        ...route,
        directions: [...route.directions]
          .sort(byKey<ExportDirection>("direction_id"))
          .map((direction) => ({
            ...direction,
            stops: [...direction.stops].sort(byOrder),
            detours: [...direction.detours]
              .sort(byKey<ExportDetour>("detour_id"))
              .map((detour) => ({
                ...detour,
                detour_stops: [...detour.detour_stops].sort(byOrder),
              })),
            restrictions: [...direction.restrictions].sort(
              byKey<ExportRestriction>("restriction_id"),
            ),
          })),
      })),
  };
}

async function refusalFrom(
  run: Promise<unknown>,
): Promise<DatasetImportRefusal> {
  try {
    await run;
  } catch (error) {
    if (error instanceof DatasetImportRefusal) {
      return error;
    }
    throw error;
  }
  throw new Error("expected the import to be refused, but it succeeded");
}

/** Every imported row is attributed to the owner and stamped with the import time. */
function expectStamped(
  rows: Array<{
    created_by: string | null;
    updated_by: string | null;
    created_at: Date;
    updated_at: Date;
  }>,
  ownerId: string,
  table: string,
): void {
  expect(rows.length, `${table} has imported rows`).toBeGreaterThan(0);
  for (const row of rows) {
    expect(row.created_by, `${table}.created_by`).toBe(ownerId);
    expect(row.updated_by, `${table}.updated_by`).toBe(ownerId);
    expect(row.created_at, `${table}.created_at`).toEqual(IMPORTED_AT);
    expect(row.updated_at, `${table}.updated_at`).toEqual(IMPORTED_AT);
  }
}

describe("dataset import round-trip (ticket #78)", () => {
  it("copies a whole Working Set into an empty target and re-exports it unchanged", async () => {
    const outcome = await inRolledBackTransaction(async (tx) => {
      await clearWorkingSet(tx);
      await seedWorkingSet(tx);
      const exported = await exportFrom(tx);

      // The export really carries the state the copy has to preserve.
      const exportedStops = exported.routes
        .find((route) => route.route_id === MAIN_ROUTE)!
        .directions.flatMap((direction) => direction.stops);
      expect(exportedStops.map((stop) => stop.ar_marker_enabled)).toContain(
        false,
      );
      expect(exportedStops.map((stop) => stop.notes)).toContain(
        "Wait under the mango tree",
      );
      expect(exportedStops.map((stop) => stop.derived_from_stop_id)).toContain(
        STOP_B,
      );

      // Now the target is empty, exactly as an unseeded environment is.
      await clearWorkingSet(tx);

      const result = await runDatasetImport({
        db: tx as unknown as Db,
        payload: exported,
        ownerEmail: OWNER_EMAIL,
        now: IMPORTED_AT,
      });
      const reexported = await exportFrom(tx);

      // A second run is a no-op failure: no --force, no duplicate rows.
      const rerun = await refusalFrom(
        runDatasetImport({
          db: tx as unknown as Db,
          payload: exported,
          ownerEmail: OWNER_EMAIL,
          now: IMPORTED_AT,
        }),
      );

      const routeRows = await tx.select().from(routesTable);
      const directionRows = await tx.select().from(directionsTable);
      const stopRows = await tx.select().from(stopsTable);
      const detourRows = await tx.select().from(detoursTable);
      const detourStopRows = await tx.select().from(detourStopsTable);
      const restrictionRows = await tx.select().from(restrictionsTable);
      const fareRows = await tx.select().from(fareConfigsTable);

      return {
        exported,
        reexported,
        result,
        rerun,
        rows: {
          routeRows,
          directionRows,
          stopRows,
          detourRows,
          detourStopRows,
          restrictionRows,
          fareRows,
        },
      };
    });

    const { exported, reexported, result, rerun, rows } = outcome;

    // --- counts -------------------------------------------------------------
    const expectedCounts: DatasetImportCounts = {
      fare_configs: 1,
      routes: 2,
      directions: 2,
      stops: 4,
      detours: 1,
      detour_stops: 1,
      restrictions: 1,
    };
    expect(result.counts).toEqual(expectedCounts);
    expect(rows.fareRows).toHaveLength(expectedCounts.fare_configs);
    expect(rows.routeRows).toHaveLength(expectedCounts.routes);
    expect(rows.directionRows).toHaveLength(expectedCounts.directions);
    expect(rows.stopRows).toHaveLength(expectedCounts.stops);
    expect(rows.detourRows).toHaveLength(expectedCounts.detours);
    expect(rows.detourStopRows).toHaveLength(expectedCounts.detour_stops);
    expect(rows.restrictionRows).toHaveLength(expectedCounts.restrictions);

    // --- the domain data survives the round-trip, field for field -------------
    // Ids, direction_kind, derived_from_stop_id, is_active, notes, AR flags,
    // is_default, detour_id, terminals, geometry and coordinates order.
    expect(normalize(reexported)).toEqual(normalize(exported));

    // --- the owner mapping --------------------------------------------------
    expect(result.owner.email).toBe(OWNER_EMAIL);
    expect(result.exportedAt).toBe(EXPORTED_AT);
    expect(result.importedAt).toBe(IMPORTED_AT.toISOString());
    expectStamped(rows.fareRows, result.owner.userId, "fare_configs");
    expectStamped(rows.routeRows, result.owner.userId, "routes");
    expectStamped(rows.directionRows, result.owner.userId, "directions");
    expectStamped(rows.stopRows, result.owner.userId, "stops");
    expectStamped(rows.detourRows, result.owner.userId, "detours");
    expectStamped(rows.detourStopRows, result.owner.userId, "detour_stops");
    expectStamped(rows.restrictionRows, result.owner.userId, "restrictions");

    // The Version stamps start at 1: an import is the first save of each row.
    for (const row of [...rows.routeRows, ...rows.directionRows]) {
      expect(row.version).toBe(1);
    }

    // The withdrawn trigger columns are not smuggled in from anywhere.
    expect(rows.fareRows[0].is_default).toBe(true);
    expect(
      rows.routeRows.find((row) => row.route_id === EMPTY_ROUTE)?.color,
    ).toBeNull();

    // --- the re-run refusal ------------------------------------------------
    expect(rerun.reason).toBe("target-not-empty");
    expect(rerun.message).toContain("2 routes");
    // Nothing was duplicated by the refused run.
    expect(rows.routeRows).toHaveLength(expectedCounts.routes);
    expect(rows.stopRows).toHaveLength(expectedCounts.stops);
  });

  it("refuses an owner the target database does not have", async () => {
    const refusal = await inRolledBackTransaction(async (tx) => {
      await clearWorkingSet(tx);
      await seedWorkingSet(tx);
      const exported = await exportFrom(tx);
      await clearWorkingSet(tx);
      return refusalFrom(
        runDatasetImport({
          db: tx as unknown as Db,
          payload: exported,
          ownerEmail: "nobody@komyuter.test",
        }),
      );
    });

    expect(refusal.reason).toBe("missing-owner");
    expect(refusal.message).toContain("nobody@komyuter.test");
  });

  it("refuses a deactivated owner and writes nothing", async () => {
    const outcome = await inRolledBackTransaction(async (tx) => {
      await clearWorkingSet(tx);
      await seedWorkingSet(tx);
      const exported = await exportFrom(tx);
      await clearWorkingSet(tx);

      // The owner Account exists but its access has been revoked.
      await tx.execute(
        sql`update admin_users a set is_active = false
            from auth.users u
            where u.id = a.user_id and lower(u.email) = lower(${OWNER_EMAIL})`,
      );
      const refusal = await refusalFrom(
        runDatasetImport({
          db: tx as unknown as Db,
          payload: exported,
          ownerEmail: OWNER_EMAIL,
        }),
      );
      const routeCount = await tx.select().from(routesTable);
      return { refusal, routeCount };
    });

    expect(outcome.refusal.reason).toBe("inactive-owner");
    expect(outcome.refusal.message).toContain(OWNER_EMAIL);
    // Refused before the transaction opened: the target is still empty.
    expect(outcome.routeCount).toHaveLength(0);
  });

  it("refuses a payload that is not a v1.2 export of a resolvable graph", async () => {
    const outcome = await inRolledBackTransaction(async (tx) => {
      await clearWorkingSet(tx);
      const good = {
        schema_version: "1.2",
        coordinate_order: "lng_lat",
        exported_at: EXPORTED_AT,
        fare_configs: [],
        routes: [],
      };
      const staleVersion = { ...good, schema_version: "1.1" };
      const dangling: unknown = {
        ...good,
        routes: [
          {
            route_id: "broken-route",
            name: "Broken",
            short_name: "BR",
            color: null,
            is_active: true,
            fare_config_id: null,
            directions: [
              {
                direction_id: "broken-dir",
                direction_kind: "base",
                label: "Only",
                is_active: true,
                terminals: { origin: "no-such-stop", destination: null },
                base_polyline: POLYLINE,
                stops: [],
                detours: [],
                restrictions: [],
              },
            ],
          },
        ],
      };
      return {
        stale: await refusalFrom(
          runDatasetImport({
            db: tx as unknown as Db,
            payload: staleVersion,
            ownerEmail: OWNER_EMAIL,
          }),
        ),
        dangling: await refusalFrom(
          runDatasetImport({
            db: tx as unknown as Db,
            payload: dangling,
            ownerEmail: OWNER_EMAIL,
          }),
        ),
      };
    });

    expect(outcome.stale.reason).toBe("invalid-payload");
    expect(outcome.stale.message).toContain("schema_version");
    expect(outcome.dangling.reason).toBe("dangling-reference");
    expect(outcome.dangling.message).toContain("no-such-stop");
  });

  it("leaves nothing behind for the other suites", async () => {
    // Read on a separate connection: whatever the round-trip wrote has to have
    // been rolled back, or the shared test database would carry imported rows
    // into every later file.
    const pool = createTestPool();
    try {
      const { rows: routes } = await pool.query<{ count: number }>(
        "select count(*)::int as count from routes where route_id like $1",
        ["import-roundtrip%"],
      );
      const { rows: fares } = await pool.query<{ count: number }>(
        "select count(*)::int as count from fare_configs where fare_config_id like $1",
        ["import-roundtrip%"],
      );
      expect(routes[0].count).toBe(0);
      expect(fares[0].count).toBe(0);
    } finally {
      await pool.end();
    }
  });
});
