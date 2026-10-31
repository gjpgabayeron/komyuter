import type { AppInstance } from "./app";
import { unauthorized } from "./errors";
import { meResponseOf } from "../domain/authorization";
import { identityOf } from "../domain/identity";

/**
 * `GET /api/admin/me` — the effective Permission set the SPA consumes to hide
 * and disable controls (ADR-0019 §7). It sits behind the admin guard, so every
 * field is already resolved; no route recomputes authorization in the client.
 */
export async function registerMe(app: AppInstance): Promise<void> {
  app.get("/me", async (request) => {
    const account = request.adminAccount;
    if (!account) {
      throw unauthorized("Missing bearer token");
    }
    return {
      success: true,
      data: meResponseOf(account, identityOf(request.authUser)),
    };
  });
}
