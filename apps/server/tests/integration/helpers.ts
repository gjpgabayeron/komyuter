import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Pool } from "pg";
import { buildApp } from "../../src/api/app";
import { createDb, type Db } from "../../src/config/db";
import {
  loadAdminCredentials,
  loadEnv,
  type AdminCredentials,
  type Env,
} from "../../src/config/env";
import { createSupabaseAdmin } from "../../src/config/supabase";
import { assertLocalDatabaseUrl } from "../helpers/local-db-guard";

if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const env = loadEnv();

// The suite signs in as the admin `supabase/seed.sql` seeds and mirrors that
// identity into the test database, so IT needs the credential pair even though the
// server does not (ADR-0022 §9). Required once, here: the call sites that expect
// `testEnv().ADMIN_EMAIL` to be a string keep their type, and a missing value fails
// loudly instead of surfacing as an unexplained wrong-password denial.
const adminCredentials = loadAdminCredentials();

const testEnvValue: Env & AdminCredentials = { ...env, ...adminCredentials };

export function testEnv(): Env & AdminCredentials {
  return testEnvValue;
}

/**
 * The dedicated integration-test database — a sibling of the dev database in
 * the same local Postgres instance (`.../postgres` → `.../komyuter_test`).
 * Recreated + migrated at global setup and dropped at teardown, so the CRUD
 * suites never write to (or read from) the live dev database.
 */
export function testDatabaseUrl(envValue: Env = env): string {
  // Everything that drops, creates or migrates the test database derives its
  // URL here, so the loopback guard belongs at this single point.
  assertLocalDatabaseUrl(envValue.DATABASE_URL, "testDatabaseUrl");
  const url = new URL(envValue.DATABASE_URL);
  url.pathname = "/komyuter_test";
  return url.toString();
}

export function createTestDb(): Db {
  return createDb(testDatabaseUrl());
}

/** Standalone pool for global setup/teardown (avoids the Db → pool typing gap). */
export function createTestPool(): Pool {
  return new Pool({ connectionString: testDatabaseUrl() });
}

/** The dev database's pool — only for entities the auth service owns (its
 *  users live in the MAIN database even though the CRUD data does not). */
export function createDevPool(): Pool {
  // sweepMainDatabaseStrays/restoreBaselineState DELETE rows (auth users) on
  // this host, so it carries the same guard as the test database.
  assertLocalDatabaseUrl(env.DATABASE_URL, "createDevPool");
  return new Pool({ connectionString: env.DATABASE_URL });
}

export function createTestSupabase(): SupabaseClient {
  return createSupabaseAdmin(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

export function buildTestApp(envOverride?: Env): FastifyInstance {
  return buildApp({
    db: createTestDb(),
    supabase: createTestSupabase(),
    env: envOverride ?? env,
  });
}

/** An Env identical to the test env except for the given overrides. */
export function envWith(overrides: Record<string, string>): Env {
  return loadEnv({ ...process.env, ...overrides });
}

/**
 * Creates a dedicated admin user (confirmed, present in admin_users) that the
 * login tests can thrash without touching the seeded admin account. The Role
 * defaults to Administrator; pass a lower Role id to exercise a write-less or
 * grant-subset path.
 */
export async function createTestAdmin(
  prefix = "admin",
  roleId = "administrator",
): Promise<{ email: string; password: string; userId: string }> {
  const supabase = createTestSupabase();
  const email = `${prefix}-${randomUUID()}@komyuter.test`;
  const password = "test-admin-password-1";
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Test Admin" },
  });
  if (error || !data.user) {
    throw error ?? new Error("createUser returned no user");
  }
  const pool = createTestPool();
  try {
    // The test DB needs the stub auth.users row for the FK before the
    // admin_users insert (the REAL auth user lives in the main database).
    await pool.query(
      "insert into auth.users (id, email) values ($1, $2) on conflict do nothing",
      [data.user.id, email],
    );
    await pool.query(
      "insert into admin_users (user_id, role_id) values ($1, $2)",
      [data.user.id, roleId],
    );
  } finally {
    await pool.end();
  }
  return { email, password, userId: data.user.id };
}

/** Signs in an arbitrary Account created by `createTestAdmin`. */
export async function signInAs(
  email: string,
  password: string,
): Promise<string> {
  const supabase = createTestSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) {
    throw error ?? new Error("signInWithPassword returned no session");
  }
  return data.session.access_token;
}

export async function signInAdmin(): Promise<string> {
  const supabase = createTestSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: testEnv().ADMIN_EMAIL,
    password: testEnv().ADMIN_PASSWORD,
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

/** Snapshot of the id columns the integration suite can write to. CRUD data
 *  lives in the dedicated test database; the auth-service users live in the
 *  main database (Supabase Auth owns it). */
export async function captureBaselineState(): Promise<DataBaseline> {
  const pool = createTestPool();
  const devPool = createDevPool();
  try {
    const [routeRows, fareRows, testAuthRows] = await Promise.all([
      pool.query<{ id: string }>("select route_id as id from routes"),
      pool.query<{ id: string }>(
        "select fare_config_id as id from fare_configs",
      ),
      devPool.query<{ id: string }>(
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
    await devPool.end();
  }
}

/**
 * Deletes everything the test run created, restoring the baseline captured
 * before the run. Routes cascade to their directions → stops → detours →
 * restrictions (schema FKs), so clearing routes first covers the plotted
 * graph; fare configs are cleared from the test database; test auth users
 * are cleared from the MAIN database (where Supabase Auth stores them).
 */
export async function restoreBaselineState(
  baseline: DataBaseline,
): Promise<void> {
  const pool = createTestPool();
  const devPool = createDevPool();
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
    // the app's DB transaction, in the MAIN database — removed explicitly;
    // admin_users rows cascade off via the FK).
    if (baseline.testAuthUserIds.length === 0) {
      await devPool.query("delete from auth.users where email like $1", [
        TEST_EMAIL_SUFFIX,
      ]);
    } else {
      await devPool.query(
        `delete from auth.users where email like $1 and id not in (${baseline.testAuthUserIds
          .map((_, i) => `$${i + 2}`)
          .join(", ")})`,
        [TEST_EMAIL_SUFFIX, ...baseline.testAuthUserIds],
      );
    }
  } finally {
    await pool.end();
    await devPool.end();
  }
}
