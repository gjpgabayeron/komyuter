import { sql } from "drizzle-orm";
import {
  EXPORT_SCHEMA_VERSION,
  exportDatasetSchema,
  type ExportDataset,
} from "@komyuter/shared";
import type { Db } from "../config/db";
import {
  detourStops as detourStopsTable,
  detours as detoursTable,
  directions as directionsTable,
  fareConfigs as fareConfigsTable,
  restrictions as restrictionsTable,
  routes as routesTable,
  stops as stopsTable,
} from "../db/schema";
import { asLineStringFromGeoJSON, asPointFromGeoJSON } from "../db/queries";
import { referenceCheck } from "./export";

/**
 * One-off import of a v1.2 export into an empty target database (ROADMAP M4).
 *
 * The import is a **one-way copy of a whole Working Set**, not a sync or a merge:
 * it refuses a target that already holds routes (there is no `--force`), so a
 * second run against the same database fails instead of duplicating or
 * half-overwriting what is there. Everything an operator needs to seed an
 * environment — Routes, their Directions, Stops, Detours, Detour Stops,
 * Restrictions and the Fare Configurations they point at — travels together, in
 * ONE transaction, in foreign-key dependency order.
 *
 * Three rules this module owns:
 *
 * - **Validate the document, then the graph.** `exportDatasetSchema` proves the
 *   JSON is a v1.2 export; `referenceCheck` proves the references inside it
 *   resolve. A payload that fails either is refused before any write.
 * - **Preserve what the export encodes.** Every id, `direction_kind`, the
 *   return-Stop identity (`derived_from_stop_id`, ADR-0031 §4), `is_active`,
 *   `ar_marker_enabled`, `notes`, `is_default` and `detour_id` is written
 *   verbatim. The columns the export no longer carries (the withdrawn detour
 *   triggers, the Version stamps) take their schema defaults or the value below.
 * - **Attribute to a named Account.** The operator names one owner by email; it
 *   is resolved through `admin_users` + `auth.users` in the TARGET, and every
 *   row's `created_by` / `updated_by` is that Account, so imported data is
 *   never anonymised provenance (ADR-0025).
 */

/** The drizzle surface the import needs — a `Db` and an open transaction both
 *  satisfy it, so the writer can run inside the caller's transaction. */
export type ImportDatabase = Pick<Db, "insert" | "execute">;

export type DatasetImportRefusalReason =
  | "invalid-arguments"
  | "invalid-payload"
  | "dangling-reference"
  | "missing-owner"
  | "inactive-owner"
  | "target-not-empty";

/**
 * A refusal the operator can act on. Distinct from an unexpected failure (a
 * dropped connection, a lost constraint race): each reason names one thing to
 * change, and none of them can be overridden by a flag.
 */
export class DatasetImportRefusal extends Error {
  constructor(
    readonly reason: DatasetImportRefusalReason,
    message: string,
  ) {
    super(message);
    this.name = "DatasetImportRefusal";
  }
}

/** The Account every imported row is attributed to. */
export interface DatasetOwner {
  userId: string;
  email: string;
}

/** An `admin_users` row resolved by email, before it is judged usable. */
export interface OwnerRow {
  userId: string;
  email: string | null;
  isActive: boolean;
}

export interface DatasetImportCounts {
  fare_configs: number;
  routes: number;
  directions: number;
  stops: number;
  detours: number;
  detour_stops: number;
  restrictions: number;
}

export interface DatasetImportPlan {
  fareConfigs: Array<typeof fareConfigsTable.$inferInsert>;
  routes: Array<typeof routesTable.$inferInsert>;
  directions: Array<typeof directionsTable.$inferInsert>;
  stops: Array<typeof stopsTable.$inferInsert>;
  detours: Array<typeof detoursTable.$inferInsert>;
  detourStops: Array<typeof detourStopsTable.$inferInsert>;
  restrictions: Array<typeof restrictionsTable.$inferInsert>;
  counts: DatasetImportCounts;
}

export interface DatasetImportResult {
  owner: DatasetOwner;
  counts: DatasetImportCounts;
  /** The source document's `exported_at`, recorded with the import. */
  exportedAt: string;
  importedAt: string;
}

/**
 * Validate the payload against the live contract and its reference graph.
 *
 * Returns the parsed dataset (zod's output, so defaults and coercions are the
 * schema's, not a second interpretation here) and throws a `DatasetImportRefusal`
 * naming the first few problems otherwise.
 */
export function validateImportPayload(payload: unknown): ExportDataset {
  const parsed = exportDatasetSchema.safeParse(payload);
  if (!parsed.success) {
    const issues = parsed.error.issues;
    const shown = issues
      .slice(0, 5)
      .map(
        (issue) =>
          `${issue.path.length > 0 ? issue.path.join(".") : "(root)"}: ${issue.message}`,
      )
      .join("; ");
    const rest = issues.length - Math.min(issues.length, 5);
    throw new DatasetImportRefusal(
      "invalid-payload",
      `The payload is not a v${EXPORT_SCHEMA_VERSION} dataset export: ${shown}` +
        (rest > 0 ? ` (and ${rest} more issue${rest === 1 ? "" : "s"})` : ""),
    );
  }

  // The schema proves the document's shape; it cannot prove that a terminal, a
  // detour or a stop id it names exists inside the same document.
  const problems = referenceCheck(parsed.data);
  if (problems.length > 0) {
    throw new DatasetImportRefusal(
      "dangling-reference",
      `The export's reference graph is broken: ${problems.join("; ")}`,
    );
  }

  return parsed.data;
}

/**
 * Refuse a target that already holds routes.
 *
 * Every Direction, Stop, Detour, Detour Stop and Restriction hangs off a Route,
 * so a single route row means this database already carries a Working Set. The
 * import is one-way by design (a merge would have to decide conflicts the export
 * does not record), so the answer is "refuse", never "overwrite" and never
 * `--force`.
 */
export function assertEmptyTarget(routeCount: number): void {
  if (routeCount <= 0) {
    return;
  }
  throw new DatasetImportRefusal(
    "target-not-empty",
    `The target database already holds ${routeCount} route${
      routeCount === 1 ? "" : "s"
    }. This import is one-way and refuses to overwrite an existing Working Set; ` +
      `there is no --force. Point DATABASE_URL at an empty environment and re-run.`,
  );
}

/** Judge a resolved `admin_users` row: present, and still active. */
export function assertOwnerUsable(
  row: OwnerRow | undefined,
  requestedEmail: string,
): DatasetOwner {
  if (!row) {
    throw new DatasetImportRefusal(
      "missing-owner",
      `No Account for ${requestedEmail}: the address has no auth.users identity ` +
        `with an admin_users row in this database. Create the Account first ` +
        `(pnpm --filter server bootstrap:owner), then re-run.`,
    );
  }
  if (!row.isActive) {
    throw new DatasetImportRefusal(
      "inactive-owner",
      `The Account for ${requestedEmail} is deactivated, so it cannot own the ` +
        `imported data. Reactivate it or name an active Account.`,
    );
  }
  return { userId: row.userId, email: row.email ?? requestedEmail };
}

/** `--file <path>` and `--owner-email <address>`, and nothing else. */
export function parseImportArgs(argv: string[]): {
  file: string;
  ownerEmail: string;
} {
  const accepted = new Set(["file", "owner-email"]);
  const flags = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    // `pnpm run <script> -- --file …` forwards the separator itself; it is
    // argument punctuation, not a flag.
    if (argument === "--") {
      continue;
    }
    if (!argument.startsWith("--")) {
      throw new DatasetImportRefusal(
        "invalid-arguments",
        `Unexpected argument "${argument}". Expected only --file <path> and --owner-email <address>.`,
      );
    }
    const separator = argument.indexOf("=");
    const name =
      separator === -1 ? argument.slice(2) : argument.slice(2, separator);
    if (!accepted.has(name)) {
      throw new DatasetImportRefusal(
        "invalid-arguments",
        `Unknown flag --${name}. Accepted: --file <path>, --owner-email <address>. ` +
          `There is no --force: the import refuses a non-empty target.`,
      );
    }
    const value =
      separator === -1 ? argv[(index += 1)] : argument.slice(separator + 1);
    if (!value || value.startsWith("--")) {
      throw new DatasetImportRefusal(
        "invalid-arguments",
        `--${name} needs a value.`,
      );
    }
    flags.set(name, value);
  }

  const file = flags.get("file");
  const ownerEmail = flags.get("owner-email");
  if (!file) {
    throw new DatasetImportRefusal(
      "invalid-arguments",
      "--file <path> is required: point it at the v1.2 export JSON.",
    );
  }
  if (!ownerEmail) {
    throw new DatasetImportRefusal(
      "invalid-arguments",
      "--owner-email <address> is required: it names the Account every imported row is attributed to.",
    );
  }
  return { file, ownerEmail };
}

/**
 * Where the rows went, without the credentials that got us there.
 *
 * The operator needs to be sure which database was written — a seed aimed at the
 * wrong project is the expensive mistake this script can make. A connection
 * string carries a password, so the log line keeps only host, port and database.
 */
export function describeDatabaseTarget(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    const database = url.pathname.replace(/^\//, "") || "(no database)";
    return `${url.host}/${database}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

/**
 * Resolve the owner Account through the TARGET database.
 *
 * `admin_users.user_id` is a foreign key to `auth.users.id` (migration 0002), so
 * both rows describe one Account and are read together: the identity supplies
 * the email the operator names, the `admin_users` row supplies the id the
 * attribution columns reference and the lifecycle flag that decides usability.
 */
export async function resolveOwner(
  db: ImportDatabase,
  email: string,
): Promise<DatasetOwner> {
  const result = await db.execute<{
    user_id: string;
    email: string | null;
    is_active: boolean;
  }>(
    sql`select a.user_id, u.email, a.is_active
        from admin_users a
        join auth.users u on u.id = a.user_id
        where lower(u.email) = lower(${email})
        limit 1`,
  );
  const [row] = result.rows;
  return assertOwnerUsable(
    row
      ? {
          userId: row.user_id,
          email: row.email,
          isActive: row.is_active,
        }
      : undefined,
    email,
  );
}

/** Numeric columns are string mode in drizzle; the export carries numbers. */
function numeric(value: number): string {
  return String(value);
}

/**
 * Map the export onto insert payloads, in dependency order.
 *
 * Pure: no database, no clock beyond the `importedAt` it is given. Everything
 * the export encodes is copied verbatim; the two things it does NOT encode are
 * set here — `version` starts at 1 (an import is the row's first save, so no
 * client can be holding a newer stamp), and both attribution columns are the
 * owner.
 */
export function planImport(
  dataset: ExportDataset,
  owner: DatasetOwner,
  importedAt: Date,
): DatasetImportPlan {
  const stamps = { created_at: importedAt, updated_at: importedAt };
  const attribution = {
    created_by: owner.userId,
    updated_by: owner.userId,
  };

  const fareConfigs: DatasetImportPlan["fareConfigs"] =
    dataset.fare_configs.map((fare) => ({
      fare_config_id: fare.fare_config_id,
      label: fare.label,
      base_fare: numeric(fare.base_fare),
      base_distance_km: numeric(fare.base_distance_km),
      rate_per_km: numeric(fare.rate_per_km),
      student_discount_pct: numeric(fare.student_discount_pct),
      senior_discount_pct: numeric(fare.senior_discount_pct),
      is_default: fare.is_default,
      is_active: fare.is_active,
      ...stamps,
      ...attribution,
    }));

  const routes: DatasetImportPlan["routes"] = [];
  const directions: DatasetImportPlan["directions"] = [];
  const stops: DatasetImportPlan["stops"] = [];
  const detours: DatasetImportPlan["detours"] = [];
  const detourStops: DatasetImportPlan["detourStops"] = [];
  const restrictions: DatasetImportPlan["restrictions"] = [];

  for (const route of dataset.routes) {
    routes.push({
      route_id: route.route_id,
      name: route.name,
      short_name: route.short_name,
      // The exporter encodes "no colour" as an empty string; NULL is what the
      // column means by it, and re-exporting normalises back to "".
      color: route.color === "" ? null : route.color,
      is_active: route.is_active,
      fare_config_id: route.fare_config_id,
      version: 1,
      ...stamps,
      ...attribution,
    });

    for (const direction of route.directions) {
      directions.push({
        direction_id: direction.direction_id,
        route_id: route.route_id,
        label: direction.label,
        base_polyline: asLineStringFromGeoJSON(
          direction.base_polyline,
        ) as unknown as string,
        origin_stop_id: direction.terminals.origin,
        destination_stop_id: direction.terminals.destination,
        direction_kind: direction.direction_kind,
        is_active: direction.is_active,
        version: 1,
        ...stamps,
        ...attribution,
      });

      for (const stop of direction.stops) {
        stops.push({
          stop_id: stop.stop_id,
          direction_id: direction.direction_id,
          name: stop.name,
          stop_order: stop.stop_order,
          type: stop.type,
          location: asPointFromGeoJSON(stop.location) as unknown as string,
          derived_from_stop_id: stop.derived_from_stop_id,
          is_guaranteed_service: stop.is_guaranteed_service,
          ar_marker_enabled: stop.ar_marker_enabled,
          landmark_hint: stop.landmark_hint,
          notes: stop.notes,
          is_active: stop.is_active,
          ...stamps,
          ...attribution,
        });
      }

      for (const detour of direction.detours) {
        detours.push({
          detour_id: detour.detour_id,
          direction_id: direction.direction_id,
          label: detour.label,
          entry: asPointFromGeoJSON(detour.entry) as unknown as string,
          exit: asPointFromGeoJSON(detour.exit) as unknown as string,
          detour_polyline: asLineStringFromGeoJSON(
            detour.detour_polyline,
          ) as unknown as string,
          additional_distance_meters: detour.additional_distance_meters,
          commuter_instruction: detour.commuter_instruction,
          driver_instruction: detour.driver_instruction,
          is_active: detour.is_active,
          ...stamps,
          ...attribution,
        });

        for (const stop of detour.detour_stops) {
          detourStops.push({
            detour_stop_id: stop.detour_stop_id,
            detour_id: detour.detour_id,
            stop_order: stop.stop_order,
            name: stop.name,
            location: asPointFromGeoJSON(stop.location) as unknown as string,
            type: stop.type,
            is_guaranteed_service: stop.is_guaranteed_service,
            landmark_hint: stop.landmark_hint,
            notes: stop.notes,
            ...stamps,
            ...attribution,
          });
        }
      }

      for (const restriction of direction.restrictions) {
        restrictions.push({
          restriction_id: restriction.restriction_id,
          direction_id: direction.direction_id,
          detour_id: restriction.detour_id,
          from_coord_index: restriction.from_coord_index,
          to_coord_index: restriction.to_coord_index,
          kind: restriction.kind,
          note: restriction.note,
          is_active: restriction.is_active,
          ...stamps,
          ...attribution,
        });
      }
    }
  }

  return {
    fareConfigs,
    routes,
    directions,
    stops,
    detours,
    detourStops,
    restrictions,
    counts: {
      fare_configs: fareConfigs.length,
      routes: routes.length,
      directions: directions.length,
      stops: stops.length,
      detours: detours.length,
      detour_stops: detourStops.length,
      restrictions: restrictions.length,
    },
  };
}

async function countRouteRows(db: ImportDatabase): Promise<number> {
  const result = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from ${routesTable}`,
  );
  return Number(result.rows[0]?.count ?? 0);
}

/**
 * Write the plan inside the caller's transaction, in foreign-key order.
 *
 * The caller owns `BEGIN`/`COMMIT` because the import has to be one unit with
 * whatever else the run decides: the empty-target check is repeated here, in the
 * same transaction as the writes, so two concurrent imports cannot both see an
 * empty target and then both insert.
 */
export async function insertDataset(
  db: ImportDatabase,
  dataset: ExportDataset,
  owner: DatasetOwner,
  importedAt: Date,
): Promise<DatasetImportCounts> {
  assertEmptyTarget(await countRouteRows(db));

  const plan = planImport(dataset, owner, importedAt);

  // Dependency order: everything a row references is written before it.
  // fare configs → routes → directions → stops → detours → detour stops → restrictions.
  if (plan.fareConfigs.length > 0) {
    await db.insert(fareConfigsTable).values(plan.fareConfigs);
  }
  if (plan.routes.length > 0) {
    await db.insert(routesTable).values(plan.routes);
  }
  if (plan.directions.length > 0) {
    await db.insert(directionsTable).values(plan.directions);
  }
  if (plan.stops.length > 0) {
    await db.insert(stopsTable).values(plan.stops);
  }
  if (plan.detours.length > 0) {
    await db.insert(detoursTable).values(plan.detours);
  }
  if (plan.detourStops.length > 0) {
    await db.insert(detourStopsTable).values(plan.detourStops);
  }
  if (plan.restrictions.length > 0) {
    await db.insert(restrictionsTable).values(plan.restrictions);
  }

  return plan.counts;
}

export interface RunDatasetImportInput {
  db: Db;
  /** The parsed file contents; validated here so no caller can skip it. */
  payload: unknown;
  ownerEmail: string;
  /** The import time stamped on every row — injectable so a test can pin it. */
  now?: Date;
}

/**
 * The whole run: validate, resolve the owner, then write in ONE transaction.
 *
 * A refusal on any of the three leaves the target untouched — the transaction is
 * never opened for a payload or an owner that fails first, and the empty-target
 * check lives inside the transaction it guards.
 */
export async function runDatasetImport({
  db,
  payload,
  ownerEmail,
  now,
}: RunDatasetImportInput): Promise<DatasetImportResult> {
  const dataset = validateImportPayload(payload);
  const owner = await resolveOwner(db, ownerEmail);
  const importedAt = now ?? new Date();

  const counts = await db.transaction(async (tx) =>
    insertDataset(tx, dataset, owner, importedAt),
  );

  return {
    owner,
    counts,
    exportedAt: dataset.exported_at,
    importedAt: importedAt.toISOString(),
  };
}
