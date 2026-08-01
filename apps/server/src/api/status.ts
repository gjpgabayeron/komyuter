import { count, max } from "drizzle-orm";
import type { AppDeps, AppInstance } from "./app";
import {
  detours as detoursTable,
  directions as directionsTable,
  fareConfigs as fareConfigsTable,
  restrictions as restrictionsTable,
  routes as routesTable,
  stops as stopsTable,
} from "../db/schema";

export async function registerStatus(
  app: AppInstance,
  deps: AppDeps,
): Promise<void> {
  const { db } = deps;

  app.get("/api/status", async () => {
    const [
      routeCount,
      directionCount,
      stopCount,
      detourCount,
      restrictionCount,
      fareCount,
    ] = await Promise.all([
      db.select({ value: count() }).from(routesTable),
      db.select({ value: count() }).from(directionsTable),
      db.select({ value: count() }).from(stopsTable),
      db.select({ value: count() }).from(detoursTable),
      db.select({ value: count() }).from(restrictionsTable),
      db.select({ value: count() }).from(fareConfigsTable),
    ]);

    const [latest] = await db
      .select({ value: max(directionsTable.updated_at) })
      .from(directionsTable);

    return {
      success: true,
      data: {
        status: "ok",
        stats: {
          routes: Number(routeCount[0]?.value ?? 0),
          directions: Number(directionCount[0]?.value ?? 0),
          stops: Number(stopCount[0]?.value ?? 0),
          detours: Number(detourCount[0]?.value ?? 0),
          restrictions: Number(restrictionCount[0]?.value ?? 0),
          fare_configs: Number(fareCount[0]?.value ?? 0),
          dataset_updated_at: latest?.value
            ? new Date(latest.value).toISOString()
            : null,
        },
      },
    };
  });
}
