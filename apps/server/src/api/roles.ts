import { randomUUID } from "node:crypto";
import { and, desc, eq, ne } from "drizzle-orm";
import {
  canManageRole,
  permissionMask,
  roleInputSchema,
  type RoleInput,
} from "@komyuter/shared";
import type { AppDeps, AppInstance } from "./app";
import { conflict, forbidden, notFound } from "./errors";
import { adminUsers, roles } from "../db/schema";
import { isUniqueViolation } from "../db/errors";
import { authorityOf, roleSummaryOf } from "../domain/authorization";

function maskedRoleInput(input: RoleInput): {
  name: string;
  position: number;
  permissions: bigint;
} {
  return {
    name: input.name,
    position: input.position,
    permissions: permissionMask([...new Set(input.permissions)]),
  };
}

/**
 * Role CRUD (M2a). Every route is behind `ADMIN_MANAGE`, reads included: the
 * Role list is the access model, not transit data. The grant-subset and
 * position rules are `@komyuter/shared`'s `canManageRole` — the same function
 * the admin suite tests, so the server cannot drift from the tested policy.
 */
export async function registerRoles(
  app: AppInstance,
  deps: AppDeps,
): Promise<void> {
  const { db } = deps;

  app.get("/roles", { config: { permission: "ADMIN_MANAGE" } }, async () => {
    const rows = await db.select().from(roles).orderBy(desc(roles.position));
    return {
      success: true,
      data: rows.map((row) => roleSummaryOf(row)),
    };
  });

  app.post(
    "/roles",
    {
      schema: { body: roleInputSchema },
      config: { permission: "ADMIN_MANAGE" },
    },
    async (request, reply) => {
      const account = request.adminAccount;
      if (!account) {
        throw forbidden("Missing Account");
      }
      const input = maskedRoleInput(request.body);

      if (!canManageRole(authorityOf(account), input)) {
        throw forbidden(
          "A Role must sit below your own position and within your own Permissions",
        );
      }

      const [nameClash] = await db
        .select({ role_id: roles.role_id })
        .from(roles)
        .where(eq(roles.name, input.name))
        .limit(1);
      if (nameClash) {
        throw conflict(`A Role named ${input.name} already exists`);
      }
      const [positionClash] = await db
        .select({ role_id: roles.role_id })
        .from(roles)
        .where(eq(roles.position, input.position))
        .limit(1);
      if (positionClash) {
        throw conflict(`Position ${input.position} is already taken`);
      }

      try {
        const [inserted] = await db
          .insert(roles)
          .values({
            role_id: randomUUID(),
            name: input.name,
            position: input.position,
            permissions: input.permissions,
          })
          .returning();
        return reply
          .code(201)
          .send({ success: true, data: roleSummaryOf(inserted) });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw conflict("A Role with that name or position already exists");
        }
        throw error;
      }
    },
  );

  app.put(
    "/roles/:roleId",
    {
      schema: { body: roleInputSchema },
      config: { permission: "ADMIN_MANAGE" },
    },
    async (request) => {
      const account = request.adminAccount;
      if (!account) {
        throw forbidden("Missing Account");
      }
      const { roleId } = request.params as { roleId: string };
      const input = maskedRoleInput(request.body);

      const [existing] = await db
        .select()
        .from(roles)
        .where(eq(roles.role_id, roleId))
        .limit(1);
      if (!existing) {
        throw notFound(`Role ${roleId} not found`);
      }

      // Both sides: the Role as it stands must be below the actor (so the actor
      // cannot reach up), and the result must stay below and within the actor's
      // Permission set.
      if (
        !canManageRole(authorityOf(account), existing) ||
        !canManageRole(authorityOf(account), input)
      ) {
        throw forbidden(
          "A Role must sit below your own position and within your own Permissions",
        );
      }

      const [nameClash] = await db
        .select({ role_id: roles.role_id })
        .from(roles)
        .where(and(eq(roles.name, input.name), ne(roles.role_id, roleId)))
        .limit(1);
      if (nameClash) {
        throw conflict(`A Role named ${input.name} already exists`);
      }
      const [positionClash] = await db
        .select({ role_id: roles.role_id })
        .from(roles)
        .where(
          and(eq(roles.position, input.position), ne(roles.role_id, roleId)),
        )
        .limit(1);
      if (positionClash) {
        throw conflict(`Position ${input.position} is already taken`);
      }

      try {
        const [updated] = await db
          .update(roles)
          .set({
            name: input.name,
            position: input.position,
            permissions: input.permissions,
            updated_at: new Date(),
          })
          .where(eq(roles.role_id, roleId))
          .returning();
        return {
          success: true,
          data: roleSummaryOf(updated),
        };
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw conflict("A Role with that name or position already exists");
        }
        throw error;
      }
    },
  );

  app.delete(
    "/roles/:roleId",
    { config: { permission: "ADMIN_MANAGE" } },
    async (request) => {
      const account = request.adminAccount;
      if (!account) {
        throw forbidden("Missing Account");
      }
      const { roleId } = request.params as { roleId: string };

      const [existing] = await db
        .select()
        .from(roles)
        .where(eq(roles.role_id, roleId))
        .limit(1);
      if (!existing) {
        throw notFound(`Role ${roleId} not found`);
      }
      if (!canManageRole(authorityOf(account), existing)) {
        throw forbidden(
          "A Role must sit below your own position and within your own Permissions",
        );
      }

      const holders = await db
        .select({ user_id: adminUsers.user_id })
        .from(adminUsers)
        .where(eq(adminUsers.role_id, roleId));
      if (holders.length > 0) {
        throw conflict(
          `Role ${existing.name} is held by ${holders.length} Account(s); reassign them first`,
        );
      }

      await db.delete(roles).where(eq(roles.role_id, roleId));
      return { success: true, data: { role_id: roleId } };
    },
  );
}
