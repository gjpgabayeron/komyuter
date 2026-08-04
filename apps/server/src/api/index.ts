import type { AppDeps, AppInstance } from "./app";
import { registerAuth } from "./auth-login";
import { createAdminAuthGuard } from "./auth";
import { registerRoutes } from "./routes";
import { registerFareConfigs } from "./fare-configs";
import { registerDirections } from "./directions";
import { registerStops } from "./stops";
import { registerDetours } from "./detours";
import { registerRestrictions } from "./restrictions";
import { registerExport } from "./export";
import { registerStatus } from "./status";

export async function registerAdminRoutes(
  app: AppInstance,
  deps: AppDeps,
): Promise<void> {
  const authGuard = createAdminAuthGuard(deps.supabase, deps.db);

  await app.register(registerStatus, deps);
  await app.register(registerAuth, deps);

  await app.register(
    async (admin) => {
      admin.addHook("preHandler", authGuard);
      await admin.register(registerRoutes, deps);
      await admin.register(registerFareConfigs, deps);
      await admin.register(registerDirections, deps);
      await admin.register(registerStops, deps);
      await admin.register(registerDetours, deps);
      await admin.register(registerRestrictions, deps);
      await admin.register(registerExport, deps);
    },
    { prefix: "/api/admin" },
  );
}
