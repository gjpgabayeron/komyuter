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
          // The generated password is a handover, not a credential: the Account
          // is held on the change screen until it replaces it (ADR-0019 §4).
          must_change_password: true,
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
              mustChangePassword: true,
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
            mustChangePassword: current.mustChangePassword,
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
   * re-reads `is_active`. The refusals are the same reach the Role surfaces and
   * the force reset enforce, never a second rule: the acting Account may not
   * deactivate itself, no one may deactivate the Super Admin, and the target's
   * **current** Role must be strictly below the actor's position and within its
   * Permission set (`canManageRole`) — with the `protect_super_admin` trigger as
   * the structural backstop.
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
      if (
        !canManageRole(authorityOf(actor), {
          position: current.position,
          permissions: current.rolePermissions,
        })
      ) {
        throw forbidden(
          "You may only change the status of an Account below your own position and within your own Permissions",
        );
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
            mustChangePassword: current.mustChangePassword,
          },
          identityOf(data.user),
        ),
      };
    },
  );

  /**
   * Force a password reset on another Account within reach (ADR-0019 §5, §13–14).
   *
   * The reach is the same `canManageRole` the Role surfaces already enforce,
   * applied to the target's **current** Role — strictly below the actor's Role
   * Position and within its Permission set — never a second rule. Two rows are
   * always refused: the acting Account (the self-service change is its only path,
   * §12) and the Super Admin (unreachable by anyone, including itself).
   *
   * The replacement is a server-generated Temporary Password, returned here and
   * nowhere else. Setting `must_change_password` — and, because a Supabase
   * password update ends every existing session on this stack, replacing the
   * credential — revokes the target's live session at its next request and holds
   * it on the change screen until it picks its own password.
   */
  app.post(
    "/accounts/:userId/password-reset",
    { config: { permission: "ADMIN_MANAGE" } },
    async (request) => {
      const actor = request.adminAccount;
      if (!actor) {
        throw forbidden("Missing Account");
      }
      const { userId } = request.params as { userId: string };

      if (userId === actor.userId) {
        throw forbidden(
          "You cannot reset your own password; change it from the account menu instead",
        );
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
        throw forbidden("The Super Admin's password cannot be reset");
      }
      if (
        !canManageRole(authorityOf(actor), {
          position: current.position,
          permissions: current.rolePermissions,
        })
      ) {
        throw forbidden(
          "You may only reset the password of an Account below your own position and within your own Permissions",
        );
      }

      // Generated here, never accepted from the client, and returned exactly
      // once: this response is the only place the value ever appears.
      const temporaryPassword = generateTemporaryPassword();
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        userId,
        {
          password: temporaryPassword,
        },
      );
      if (updateError) {
        throw internal(`Could not reset the password: ${updateError.message}`);
      }

      // The Temporary Password is a handover: the Account is held on the change
      // screen until it replaces it (ADR-0019 §4, §14).
      await db
        .update(adminUsers)
        .set({ must_change_password: true })
        .where(eq(adminUsers.user_id, userId));

      const { data } = await supabase.auth.admin.getUserById(userId);

      return {
        success: true,
        data: {
          account: accountSummaryOf(
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
              isActive: current.isActive,
              mustChangePassword: true,
            },
            identityOf(data.user),
          ),
          temporaryPassword,
        },
      };
    },
  );
}
