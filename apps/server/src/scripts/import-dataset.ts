import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { loadDatabaseUrl } from "../config/env";
import * as schema from "../db/schema";
import {
  DatasetImportRefusal,
  describeDatabaseTarget,
  parseImportArgs,
  runDatasetImport,
} from "../domain/dataset-import";

/**
 * One-off dataset import (ROADMAP M4): load a v1.2 export into an EMPTY target
 * database, so a new environment can be seeded without re-plotting the Working
 * Set by hand. The behaviour lives in `domain/dataset-import.ts`; this file is
 * the operator's entry point and the only place that reads a file or prints.
 *
 *   DATABASE_URL=… pnpm --filter server import:dataset \
 *     --file dataset.json --owner-email owner@komyuter.ph
 *
 * The target is `DATABASE_URL` — never the local `.env` by accident, which is
 * why only that one variable is required (`loadDatabaseUrl`). The owner is
 * resolved in that same database, so the attribution matches the environment
 * being seeded. Nothing here logs the connection string: the run reports the
 * target as host/port/database (`describeDatabaseTarget`), then the counts.
 *
 * Refusals (a payload that is not a v1.2 export, a broken reference graph, a
 * missing or deactivated owner, a target that already holds routes) exit 1 with
 * one actionable line; there is no `--force`.
 */
async function main(): Promise<void> {
  const { file, ownerEmail } = parseImportArgs(process.argv.slice(2));
  const databaseUrl = loadDatabaseUrl();
  const payload = readDatasetFile(file);

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });
  try {
    console.log(
      `Importing ${file} into ${describeDatabaseTarget(databaseUrl)} ` +
        `as ${ownerEmail}.`,
    );
    const result = await runDatasetImport({ db, payload, ownerEmail });
    console.log(
      `Owner: ${result.owner.email} (user_id ${result.owner.userId})`,
    );
    console.log(`Imported at ${result.importedAt}`);
    for (const [table, count] of Object.entries(result.counts)) {
      console.log(`  ${table}: ${count}`);
    }
    console.log("Done. The Working Set is now in the target database.");
  } finally {
    // The pool is the only handle: end it, or the process hangs after the run.
    await pool.end();
  }
}

/** The export document as JSON, with a message that names the file. */
function readDatasetFile(path: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new DatasetImportRefusal(
      "invalid-payload",
      `Could not read ${path}. Point --file at the JSON the export endpoint returned.`,
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new DatasetImportRefusal(
      "invalid-payload",
      `${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

main().catch((error: unknown) => {
  if (error instanceof DatasetImportRefusal) {
    console.error(`Import refused (${error.reason}): ${error.message}`);
  } else if (error instanceof Error) {
    // A refusal is an operator mistake; anything else is a real failure and
    // keeps its stack. Only the message and the frames are printed: a driver
    // error can carry the connection parameters, and none of them belong in an
    // operator's log.
    console.error(`Import failed: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
