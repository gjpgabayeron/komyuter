import type { SupabaseClient, User } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { hasPermission, type Permission } from "@komyuter/shared";
import type { Db } from "../config/db";
import { adminUsers, roles } from "../db/schema";
import { adminAccountSelection } from "../db/queries";
import {
  effectivePermissions,
  type AdminAccount,
} from "../domain/authorization";
import { forbidden, unauthorized } from "./errors";

declare module "fastify" {
  interface FastifyContextConfig {
    /**
     * The Permission a route requires. Declared on the route and enforced once,
     * by `enforceRoutePermission`, rather than repeated in each handler.
     */
    permission?: Permission;
  }

  interface FastifyRequest {
    /** The Account id, once the guard has resolved it. */
    adminUserId?: string;
    /** The resolved Account, Role and effective Permission set. */
    adminAccount?: AdminAccount;
    /** The validated Supabase identity — used by GET /api/admin/me. */
    authUser?: User;
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
 * Resolves the Account's Role and effective Permission set in one query. This is
 * the single authorization read (ADR-0019 §7): every admin-gated decision — the
 * guard, login, /me — funnels through here, so revocation is immediate and no
 * route recomputes its own answer.
 *
 * The owner's effective set is every declared Permission, independent of its
 * Role. That is what makes "cannot be demoted" structural: editing the seeded
 * Administrator Role, or adding a Permission without updating it, cannot
 * weaken the owner.
 */
export async function loadAdminAccount(
  db: Db,
  userId: string,
): Promise<AdminAccount | null> {
  const [row] = await db
    .select(adminAccountSelection)
    .from(adminUsers)
    .innerJoin(roles, eq(adminUsers.role_id, roles.role_id))
    .where(eq(adminUsers.user_id, userId))
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    ...row,
    permissions: effectivePermissions(row.isSuperAdmin, row.rolePermissions),
  };
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
    const account = await loadAdminAccount(db, data.user.id);
    if (!account) {
      throw forbidden("User is not an admin");
    }
    request.adminUserId = account.userId;
    request.adminAccount = account;
    request.authUser = data.user;
  };
}

/**
 * The one Permission check. Routes declare `config.permission`; the route-level
 * hook in `enforceRoutePermission` calls this. Reads stay open to every Account
 * (a Viewer must be able to open the workspace); mutations, export and the
 * Mapbox proxy are gated.
 */
export function requirePermission(permission: Permission) {
  return async function checkPermission(
    request: FastifyRequest,
  ): Promise<void> {
    const account = request.adminAccount;
    if (!account) {
      throw unauthorized("Missing bearer token");
    }
    if (!hasPermission(account.permissions, permission)) {
      throw forbidden(`Missing permission: ${permission}`);
    }
  };
}

/** Reads the route's declared Permission, if any, and enforces it. */
export async function enforceRoutePermission(
  request: FastifyRequest,
): Promise<void> {
  const permission = request.routeOptions.config?.permission;
  if (permission) {
    await requirePermission(permission)(request);
  }
}
