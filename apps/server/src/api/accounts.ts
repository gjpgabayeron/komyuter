import { asc, desc, eq } from "drizzle-orm";
import {
  assignRoleSchema,
  canAssignRole,
  canManageRole,
  inviteAccountSchema,
  setAccountStatusSchema,
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
import { generateTemporaryPassword } from "../domain/temporary-password";

/**
 * Account provisioning (M2a, server only — the surfaces are M2b).
 *
 * Every route is behind `ADMIN_MANAGE`, reads included: the Account list is the
 * access model. An Account is invite-only by construction: there is no
 * self-signup, and `createUser` runs with the service-role key. The caller
 * supplies an email and a Role; the server generates the Temporary Password and
 * returns it once (ADR-0019 §10). No email is sent.
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
          identities.get(row.userId) ?? {
            email: "",
            name: "",
            lastSignInAt: null,
          },
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

      // Generated here, never accepted from the client, and returned exactly
      // once: the invite response is the only place the value ever appears.
      const temporaryPassword = generateTemporaryPassword();
      const { data, error } = await supabase.auth.admin.createUser({
        email: input.email,
        password: temporaryPassword,
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
        data: {
          account: accountSummaryOf(
            {
              userId: data.user.id,
              roleId: role.role_id,
              roleName: role.name,
              position: role.position,
              rolePermissions: role.permissions,
              permissions: effectivePermissions(false, role.permissions),
              isSuperAdmin: false,
              isActive: true,
            },
            identityOf(data.user),
          ),
          temporaryPassword,
        },
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
            isActive: current.isActive,
          },
          identityOf(data.user),
        ),
      };
    },
  );

  /**
   * Deactivate or reactivate an Account (ADR-0019 §1–2).
   *
   * Deactivation is the whole lifecycle: the identity and the Role stay, and a
   * live session stops being honoured on its next request because the guard
   * re-reads `is_active`. Two refusals are deliberate and explicit — the acting
   * Account may not deactivate itself, and no one may deactivate the Super
   * Admin — with the `protect_super_admin` trigger as the structural backstop.
   */
  app.put(
    "/accounts/:userId/status",
    {
      schema: { body: setAccountStatusSchema },
      config: { permission: "ADMIN_MANAGE" },
    },
    async (request) => {
      const actor = request.adminAccount;
      if (!actor) {
        throw forbidden("Missing Account");
      }
      const { userId } = request.params as { userId: string };
      const { isActive } = request.body;

      if (userId === actor.userId) {
        throw forbidden("You cannot change your own Account status");
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
      if (current.isSuperAdmin && !isActive) {
        throw forbidden("The Super Admin cannot be deactivated");
      }

      await db
        .update(adminUsers)
        .set({ is_active: isActive })
        .where(eq(adminUsers.user_id, userId));

      const { data } = await supabase.auth.admin.getUserById(userId);

      return {
        success: true,
        data: accountSummaryOf(
          {
            userId: current.userId,
            roleId: current.roleId,
            roleName: current.roleName,
            position: current.position,
            rolePermissions: current.rolePermissions,
            permissions: effectivePermissions(
              current.isSuperAdmin,
              current.rolePermissions,
            ),
            isSuperAdmin: current.isSuperAdmin,
            isActive,
          },
          identityOf(data.user),
        ),
      };
    },
  );
}
