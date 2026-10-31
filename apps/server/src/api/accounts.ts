import { asc, desc, eq } from "drizzle-orm";
import {
  assignRoleSchema,
  canAssignRole,
  canManageRole,
  inviteAccountSchema,
} from "@komyuter/shared";
import type { AppDeps, AppInstance } from "./app";
import { conflict, forbidden, internal, notFound } from "./errors";
import { adminUsers, roles } from "../db/schema";
import { adminAccountSelection } from "../db/queries";
import {
  accountSummaryOf,
  authorityOf,
  effectivePermissions,
} from "../domain/authorization";
import { identityOf, listAllIdentities } from "../domain/identity";

/**
 * Account provisioning (M2a, server only — the surfaces are M2b).
 *
 * Every route is behind `ADMIN_MANAGE`, reads included: the Account list is the
 * access model. An Account is invite-only by construction: there is no
 * self-signup, and `createUser` runs with the service-role key. The caller
 * supplies the temporary password; no email is sent.
 */
export async function registerAccounts(
  app: AppInstance,
  deps: AppDeps,
): Promise<void> {
  const { db, supabase } = deps;

  app.get("/accounts", { config: { permission: "ADMIN_MANAGE" } }, async () => {
    const rows = await db
      .select(adminAccountSelection)
      .from(adminUsers)
      .innerJoin(roles, eq(adminUsers.role_id, roles.role_id))
      .orderBy(desc(roles.position), asc(adminUsers.user_id));

    const identities = await listAllIdentities(supabase);
    return {
      success: true,
      data: rows.map((row) =>
        accountSummaryOf(
          {
            ...row,
            permissions: effectivePermissions(
              row.isSuperAdmin,
              row.rolePermissions,
            ),
          },
          identities.get(row.userId) ?? { email: "", name: "" },
        ),
      ),
    };
  });

  app.post(
    "/accounts",
    {
      schema: { body: inviteAccountSchema },
      config: { permission: "ADMIN_MANAGE" },
    },
    async (request, reply) => {
      const account = request.adminAccount;
      if (!account) {
        throw forbidden("Missing Account");
      }
      const input = request.body;

      const [role] = await db
        .select()
        .from(roles)
        .where(eq(roles.role_id, input.roleId))
        .limit(1);
      if (!role) {
        throw notFound(`Role ${input.roleId} not found`);
      }
      if (!canManageRole(authorityOf(account), role)) {
        throw forbidden(
          "You may only assign a Role below your own position and within your own Permissions",
        );
      }

      const { data, error } = await supabase.auth.admin.createUser({
        email: input.email,
        password: input.temporaryPassword,
        email_confirm: true,
      });
      if (error || !data.user) {
        if (
          error?.code === "email_exists" ||
          /already.*(registered|exists)/i.test(error?.message ?? "")
        ) {
          throw conflict("An Account with that email already exists");
        }
        throw internal(
          `Could not create the Account: ${error?.message ?? "unknown error"}`,
        );
      }

      try {
        await db.insert(adminUsers).values({
          user_id: data.user.id,
          role_id: role.role_id,
        });
      } catch (insertError) {
        // Do not leave an auth identity with no Account behind it.
        await supabase.auth.admin.deleteUser(data.user.id).catch(() => {});
        throw insertError;
      }

      return reply.code(201).send({
        success: true,
        data: accountSummaryOf(
          {
            userId: data.user.id,
            roleId: role.role_id,
            roleName: role.name,
            position: role.position,
            rolePermissions: role.permissions,
            permissions: effectivePermissions(false, role.permissions),
            isSuperAdmin: false,
          },
          identityOf(data.user),
        ),
      });
    },
  );

  app.put(
    "/accounts/:userId/role",
    {
      schema: { body: assignRoleSchema },
      config: { permission: "ADMIN_MANAGE" },
    },
    async (request) => {
      const actor = request.adminAccount;
      if (!actor) {
        throw forbidden("Missing Account");
      }
      const { userId } = request.params as { userId: string };
      const { roleId } = request.body;

      if (userId === actor.userId) {
        throw forbidden("You cannot change your own Role");
      }

      const [current] = await db
        .select(adminAccountSelection)
        .from(adminUsers)
        .innerJoin(roles, eq(adminUsers.role_id, roles.role_id))
        .where(eq(adminUsers.user_id, userId))
        .limit(1);
      if (!current) {
        throw notFound(`Account ${userId} not found`);
      }
      if (current.isSuperAdmin) {
        throw forbidden("The Super Admin Role cannot be changed");
      }

      const [target] = await db
        .select()
        .from(roles)
        .where(eq(roles.role_id, roleId))
        .limit(1);
      if (!target) {
        throw notFound(`Role ${roleId} not found`);
      }

      if (
        !canAssignRole(authorityOf(actor), target, {
          position: current.position,
          permissions: current.rolePermissions,
        })
      ) {
        throw forbidden(
          "You may only assign a Role below your own position and within your own Permissions",
        );
      }

      const [updated] = await db
        .update(adminUsers)
        .set({ role_id: target.role_id })
        .where(eq(adminUsers.user_id, userId))
        .returning({ userId: adminUsers.user_id });

      const { data } = await supabase.auth.admin.getUserById(
        updated?.userId ?? userId,
      );

      return {
        success: true,
        data: accountSummaryOf(
          {
            userId: updated?.userId ?? userId,
            roleId: target.role_id,
            roleName: target.name,
            position: target.position,
            rolePermissions: target.permissions,
            permissions: effectivePermissions(false, target.permissions),
            isSuperAdmin: false,
          },
          identityOf(data.user),
        ),
      };
    },
  );
}
