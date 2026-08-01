import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../db/schema";

export type Db = NodePgDatabase<typeof schema>;

export function createDb(connectionString: string): Db {
  const pool = new Pool({ connectionString });
  return drizzle(pool, { schema });
}
