import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Pool } from "pg";
import {
  createDevPool,
  createTestPool,
  testDatabaseUrl,
  testEnv,
} from "./helpers";

const MIGRATIONS_DIR = join(__dirname, "../../../../supabase/migrations");

/**
 * Dedicated integration-test database lifecycle (product decision):
 *
 * Every suite run starts by DROPPING and recreating `komyuter_test` (a
 * sibling of the dev database in the same local Postgres instance) and
 * replaying the project migrations onto it, and ends by dropping it again —
 * the test pool is destroyed after testing. The live dev database the admin
 * dashboard reads is never touched by CRUD tests.
 *
 * Supabase Auth exception: the auth-service schema (auth.users) lives in the
 * MAIN database. The test database gets a minimal auth stub so the
 * `admin_users.user_id → auth.users(id)` FK (migration 0002) resolves; real
 * auth users are still created/cleaned on the main database.
 */
export async function recreateTestDatabase(): Promise<void> {
  const devPool = createDevPool();
  try {
    // DROP DATABASE cannot run inside a transaction or against the target
    // DB itself, and the maintenance connection must not be the test DB.
    await devPool.query("drop database if exists komyuter_test with (force)");
    await devPool.query("create database komyuter_test");
  } finally {
    await devPool.end();
  }

  const testPool = createTestPool();
  try {
    // Auth-schema stub for the migration FK (main DB owns the real one).
    await testPool.query("create schema auth");
    await testPool.query(
      "create table auth.users (id uuid primary key, email text)",
    );

    // Replay project migrations in filename order on a clean database, so
    // the test DB's schema is always exactly the current migrations.
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith(".sql"))
      .sort();
    for (const file of files) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      await testPool.query(sql);
    }

    // Seed the test DB's admin reference for the suite's seeded-admin flows:
    // the admin's REAL auth user lives in the main database (auth service);
    // the test DB gets the stub row (FK) + the admin_users entry so the
    // /api/admin guard resolves exactly like it does in dev.
    const devPool = createDevPool();
    try {
      const { rows } = await devPool.query<{ id: string }>(
        "select id from auth.users where email = $1",
        [testEnv().ADMIN_EMAIL],
      );
      const adminId = rows[0]?.id;
      if (adminId) {
        await testPool.query(
          "insert into auth.users (id, email) values ($1, $2) on conflict do nothing",
          [adminId, testEnv().ADMIN_EMAIL],
        );
        await testPool.query(
          "insert into admin_users (user_id) values ($1) on conflict do nothing",
          [adminId],
        );
      }
    } finally {
      await devPool.end();
    }
  } finally {
    await testPool.end();
  }
}

/** Destroys the test database (vitest teardown — nothing survives a run). */
export async function destroyTestDatabase(): Promise<void> {
  const devPool = createDevPool();
  try {
    await devPool.query("drop database if exists komyuter_test with (force)");
  } finally {
    await devPool.end();
  }
}

/**
 * Self-healing sweep for the MAIN database: removes auth users left behind by
 * previously interrupted runs (their admin_users rows cascade off via the
 * FK). Runs BEFORE the baseline is captured so a fresh run never inherits
 * stale test users.
 */
export async function sweepMainDatabaseStrays(): Promise<void> {
  const devPool = createDevPool();
  try {
    await devPool.query("delete from auth.users where email like $1", [
      "%@komyuter.test",
    ]);
  } finally {
    await devPool.end();
  }
}

/** Convenience exporter for scripts that need to check the test DB exists. */
export function testDatabaseIdentifier(): string {
  return new URL(testDatabaseUrl()).pathname.slice(1);
}

export type { Pool };
