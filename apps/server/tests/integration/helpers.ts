import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
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
