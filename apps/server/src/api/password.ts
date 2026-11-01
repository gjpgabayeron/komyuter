import { eq } from "drizzle-orm";
import { changePasswordSchema } from "@komyuter/shared";
import type { AppDeps, AppInstance } from "./app";
import { forbidden, internal, validationError } from "./errors";
import { adminUsers } from "../db/schema";

/**
 * `POST /api/auth/password` — self-service password change, and the second of
 * the two routes a Forced Password Change admits (ADR-0019 §11 and §12).
 *
 * The current password is re-authenticated against Supabase before anything is
 * replaced: a bearer token proves a session, not that the caller knows the
 * credential, and this action re-credentials the Account. A wrong current
 * password is refused with the envelope's validation code — deliberately not
 * `401`, which the SPA treats as an expired session and answers by throwing the
 * token away — and nothing changes.
 *
 * Replacing the password does not merely invalidate the credential: the
 * identity provider ends every session the Account has (verified against the
 * installed stack), so the action signs the caller in again and answers with
 * that session. Without it a successful change would sign the Account out of the
 * tab it was made in, and the SPA could not resume the page it was on.
 */
export async function registerPasswordChange(
  app: AppInstance,
  deps: AppDeps,
): Promise<void> {
  const { db, supabase } = deps;

  app.post(
    "/api/auth/password",
    {
      schema: { body: changePasswordSchema },
      config: { passwordChangeAllowed: true },
    },
    async (request) => {
      const account = request.adminAccount;
      const email = request.authUser?.email;
      if (!account || !email) {
        throw forbidden("Missing Account");
      }
      const { currentPassword, newPassword } = request.body;

      // Re-authenticate the credential being replaced. `signInWithPassword` also
      // re-checks the identity provider's own state, so a banned or deleted
      // identity cannot slip through on a stale token.
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (reauthError) {
        throw validationError("The current password is incorrect");
      }

      const { error: updateError } = await supabase.auth.admin.updateUserById(
        account.userId,
        { password: newPassword },
      );
      if (updateError) {
        throw internal(`Could not change the password: ${updateError.message}`);
      }

      // Only once the credential really changed: the flag means "a Temporary
      // Password is still in place", so clearing it early would lie.
      await db
        .update(adminUsers)
        .set({ must_change_password: false })
        .where(eq(adminUsers.user_id, account.userId));

      const { data: session, error: signInError } =
        await supabase.auth.signInWithPassword({
          email,
          password: newPassword,
        });
      if (signInError || !session.session) {
        throw internal(
          `The password changed but a new session could not be issued: ${
            signInError?.message ?? "no session returned"
          }`,
        );
      }

      return {
        success: true,
        data: {
          access_token: session.session.access_token,
          mustChangePassword: false,
        },
      };
    },
  );
}
