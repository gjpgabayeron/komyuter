import type { SupabaseClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import type { Db } from "../config/db";
import { adminUsers } from "../db/schema";
import { forbidden, unauthorized } from "./errors";

declare module "fastify" {
  interface FastifyRequest {
    adminUserId?: string;
  }
}

export function extractBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) {
    return null;
  }
  const [scheme, token, ...rest] = header.split(" ");
  if (scheme !== "Bearer" || !token || rest.length > 0) {
    return null;
  }
  return token;
}

/**
 * The single authorization rule (FR-011 / US4): is this user present in
 * admin_users? Every admin-gated decision (auth guard, login, /me) funnels
 * through here — no duplicate inline lookups.
 */
export async function isAdminUserId(db: Db, userId: string): Promise<boolean> {
  const [admin] = await db
    .select({ user_id: adminUsers.user_id })
    .from(adminUsers)
    .where(eq(adminUsers.user_id, userId))
    .limit(1);
  return Boolean(admin);
}

export function createAdminAuthGuard(supabase: SupabaseClient, db: Db) {
  return async function adminAuthGuard(request: FastifyRequest): Promise<void> {
    const token = extractBearerToken(request);
    if (!token) {
      throw unauthorized("Missing bearer token");
    }
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      throw unauthorized("Invalid or expired token");
    }
    if (!(await isAdminUserId(db, data.user.id))) {
      throw forbidden("User is not an admin");
    }
    request.adminUserId = data.user.id;
  };
}
