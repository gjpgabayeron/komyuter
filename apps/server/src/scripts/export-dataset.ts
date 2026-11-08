import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { loadDatabaseUrl } from "../config/env";
import * as schema from "../db/schema";
import { assembleExportDataset } from "../domain/export";

/**
 * Dataset export (ROADMAP M4 / #80): write the Working Set as the v1.2 export
 * document, so an environment can be seeded from another without re-plotting.
 * The import side is `import:dataset`; the contract is the same export the
 * endpoint serves.
 *
 *   DATABASE_URL=… pnpm --filter server export:dataset --out staging.json
 *
 * The target is `DATABASE_URL` — only that variable is required (`loadDatabaseUrl`),
 * so a machine-local `.env` cannot silently choose the database. Nothing here
 * logs the connection string.
 */
export function parseExportArgs(argv: string[]): { out: string } {
  // pnpm forwards a literal `--` separator; the import tool already ignores it
  // and the two operator commands should accept the same invocation shape.
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  let out: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--out") {
      out = args[index + 1];
      index += 1;
    } else if (argument.startsWith("--out=")) {
      out = argument.slice("--out=".length);
    } else {
      throw new Error(
        `Unknown argument: ${argument}. Usage: export:dataset --out <file>`,
      );
    }
  }

  if (!out || out.trim() === "") {
    throw new Error("Missing --out <file>. Usage: export:dataset --out <file>");
  }

  return { out };
}

async function main(): Promise<void> {
  const { out } = parseExportArgs(process.argv.slice(2));
  const databaseUrl = loadDatabaseUrl();
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });

  try {
    const dataset = await assembleExportDataset(db);
    writeFileSync(out, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
    const directions = dataset.routes.reduce(
      (total, route) => total + route.directions.length,
      0,
    );
    const stops = dataset.routes.reduce(
      (total, route) =>
        total +
        route.directions.reduce(
          (count, direction) => count + direction.stops.length,
          0,
        ),
      0,
    );
    console.log(
      `Exported ${dataset.routes.length} route(s), ${directions} direction(s) ` +
        `and ${stops} stop(s) to ${out} (schema ${dataset.schema_version}).`,
    );
  } finally {
    await pool.end();
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error: unknown) => {
    if (error instanceof Error) {
      console.error(`Export failed: ${error.message}`);
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  });
}
