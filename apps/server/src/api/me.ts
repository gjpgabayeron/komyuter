import type { AppInstance } from "./app";
import { unauthorized } from "./errors";
import { meResponseOf } from "../domain/authorization";
import { identityOf } from "../domain/identity";

/**
 * `GET /api/admin/me` — the effective Permission set the SPA consumes to hide
 * and disable controls (ADR-0019 §7). It sits behind the admin guard, so every
 * field is already resolved; no route recomputes authorization in the client.
 *
 * It is one of the two routes a Forced Password Change admits, because the SPA
 * needs `mustChangePassword` to know where to send the Account at all; hence
 * the explicit `passwordChangeAllowed` declaration rather than a URL rule.
 */
export async function registerMe(app: AppInstance): Promise<void> {
  app.get(
    "/me",
    { config: { passwordChangeAllowed: true } },
    async (request) => {
      const account = request.adminAccount;
      if (!account) {
        throw unauthorized("Missing bearer token");
      }
      return {
        success: true,
        data: meResponseOf(account, identityOf(request.authUser)),
      };
    },
  );
}
