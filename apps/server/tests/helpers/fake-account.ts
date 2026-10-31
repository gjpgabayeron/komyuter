import type { FastifyInstance } from "fastify";
import { ALL_PERMISSIONS_MASK } from "@komyuter/shared";

/**
 * Stands in for the admin guard in unit tests that exercise a route rather than
 * authorization: an Account holding every Permission.
 */
export function installAllPermissionsAccount(app: FastifyInstance): void {
  app.addHook("preHandler", async (request) => {
    request.adminAccount = {
      userId: "test-account",
      roleId: "administrator",
      roleName: "Administrator",
      position: 100,
      rolePermissions: ALL_PERMISSIONS_MASK,
      permissions: ALL_PERMISSIONS_MASK,
      isSuperAdmin: true,
    };
  });
}
