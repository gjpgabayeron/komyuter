import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Pool } from "pg";
import { buildApp } from "../../src/api/app";
import { createDb, type Db } from "../../src/config/db";
import { loadEnv, type Env } from "../../src/config/env";
import { createSupabaseAdmin } from "../../src/config/supabase";

if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const env = loadEnv();

export function testEnv(): Env {
  return env;
}

export function createTestDb(): Db {
  return createDb(env.DATABASE_URL);
}

/** Standalone pool for global setup/teardown (avoids the Db → pool typing gap). */
export function createTestPool(): Pool {
  return new Pool({ connectionString: env.DATABASE_URL });
}

export function createTestSupabase(): SupabaseClient {
  return createSupabaseAdmin(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

export function buildTestApp(): FastifyInstance {
  return buildApp({
    db: createTestDb(),
    supabase: createTestSupabase(),
  });
}

export async function signInAdmin(): Promise<string> {
  const supabase = createTestSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: env.ADMIN_EMAIL,
    password: env.ADMIN_PASSWORD,
  });
  if (error) {
    throw error;
  }
  if (!data.session) {
    throw new Error("No session returned for admin sign-in");
  }
  return data.session.access_token;
}

export async function createNonAdminToken(): Promise<string> {
  const supabase = createTestSupabase();
  const email = `nonadmin-${randomUUID()}@komyuter.test`;
  const password = "non-admin-test-password";
  const { error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError) {
    throw createError;
  }
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    throw error;
  }
  if (!data.session) {
    throw new Error("No session returned for non-admin sign-in");
  }
  return data.session.access_token;
}

export function uniqueRouteId(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

/** Ids present in the database before a test run — the restore baseline. */
export interface DataBaseline {
  routeIds: string[];
  fareConfigIds: string[];
  /** Auth users created for tests (email suffix `@komyuter.test`). */
  testAuthUserIds: string[];
}

const TEST_EMAIL_SUFFIX = "%@komyuter.test";

/** Snapshot of the id columns the integration suite can write to. */
export async function captureBaselineState(): Promise<DataBaseline> {
  const pool = createTestPool();
  try {
    const [routeRows, fareRows, testAuthRows] = await Promise.all([
      pool.query<{ id: string }>("select route_id as id from routes"),
      pool.query<{ id: string }>(
        "select fare_config_id as id from fare_configs",
      ),
      pool.query<{ id: string }>(
        "select id from auth.users where email like $1",
        [TEST_EMAIL_SUFFIX],
      ),
    ]);
    return {
      routeIds: routeRows.rows.map((row) => row.id),
      fareConfigIds: fareRows.rows.map((row) => row.id),
      testAuthUserIds: testAuthRows.rows.map((row) => row.id),
    };
  } finally {
    await pool.end();
  }
}

/**
 * Deletes everything the test run created, restoring the baseline captured
 * before the run. Routes cascade to their directions → stops → detours →
 * restrictions (schema FKs), so clearing routes first covers the plotted
 * graph; fare configs and test auth users are cleared explicitly.
 */
export async function restoreBaselineState(
  baseline: DataBaseline,
): Promise<void> {
  const pool = createTestPool();
  try {
    const routeIds = baseline.routeIds;
    if (routeIds.length === 0) {
      await pool.query("delete from routes");
    } else {
      await pool.query(
        `delete from routes where route_id not in (${routeIds
          .map((_, i) => `$${i + 1}`)
          .join(", ")})`,
        routeIds,
      );
    }

    const fareIds = baseline.fareConfigIds;
    if (fareIds.length === 0) {
      await pool.query("delete from fare_configs");
    } else {
      await pool.query(
        `delete from fare_configs where fare_config_id not in (${fareIds
          .map((_, i) => `$${i + 1}`)
          .join(", ")})`,
        fareIds,
      );
    }

    // Test auth users (created via supabase.auth.admin.createUser — outside
    // the app's DB transaction, so they must be removed explicitly).
    if (baseline.testAuthUserIds.length === 0) {
      await pool.query("delete from auth.users where email like $1", [
        TEST_EMAIL_SUFFIX,
      ]);
    } else {
      await pool.query(
        `delete from auth.users where email like $1 and id not in (${baseline.testAuthUserIds
          .map((_, i) => `$${i + 2}`)
          .join(", ")})`,
        [TEST_EMAIL_SUFFIX, ...baseline.testAuthUserIds],
      );
    }
  } finally {
    await pool.end();
  }
}
