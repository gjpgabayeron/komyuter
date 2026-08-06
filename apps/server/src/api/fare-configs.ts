import { and, eq, sql } from "drizzle-orm";
import {
  createFareConfigSchema,
  updateFareConfigSchema,
} from "@komyuter/shared";
import type { AppDeps, AppInstance } from "./app";
import {
  fareConfigs as fareConfigsTable,
  routes as routesTable,
} from "../db/schema";
import { conflict, notFound } from "./errors";
import { uniqueSlug, uuidId } from "../domain/ids";

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function num(value: unknown): number {
  return Number(value);
}

function serialize(row: {
  fare_config_id: string;
  label: string;
  base_fare: unknown;
  base_distance_km: unknown;
  rate_per_km: unknown;
  student_discount_pct: unknown;
  senior_discount_pct: unknown;
  is_default: boolean;
  is_active: boolean;
  created_at: unknown;
  updated_at: unknown;
}) {
  return {
    fare_config_id: row.fare_config_id,
    label: row.label,
    base_fare: num(row.base_fare),
    base_distance_km: num(row.base_distance_km),
    rate_per_km: num(row.rate_per_km),
    student_discount_pct: num(row.student_discount_pct),
    senior_discount_pct: num(row.senior_discount_pct),
    is_default: row.is_default,
    is_active: row.is_active,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

export async function registerFareConfigs(
  app: AppInstance,
  deps: AppDeps,
): Promise<void> {
  const { db } = deps;

  app.get("/fare-configs", async () => {
    const rows = await db
      .select({
        config: fareConfigsTable,
        active_route_count: sql<number>`count(${routesTable.fare_config_id})::int`,
      })
      .from(fareConfigsTable)
      .leftJoin(
        routesTable,
        and(
          eq(routesTable.fare_config_id, fareConfigsTable.fare_config_id),
          eq(routesTable.is_active, true),
        ),
      )
      .groupBy(fareConfigsTable.fare_config_id);

    return {
      success: true,
      data: rows.map((row) => ({
        ...serialize(row.config),
        active_route_count: num(row.active_route_count),
      })),
    };
  });

  app.get("/fare-configs/:fareConfigId", async (request) => {
    const { fareConfigId } = request.params as { fareConfigId: string };
    const [row] = await db
      .select()
      .from(fareConfigsTable)
      .where(eq(fareConfigsTable.fare_config_id, fareConfigId))
      .limit(1);
    if (!row) {
      throw notFound(`Fare config ${fareConfigId} not found`);
    }
    return { success: true, data: serialize(row) };
  });

  app.post(
    "/fare-configs",
    { schema: { body: createFareConfigSchema } },
    async (request, reply) => {
      const body = request.body;

      if (body.is_default) {
        await db
          .update(fareConfigsTable)
          .set({ is_default: false })
          .where(eq(fareConfigsTable.is_default, true));
      }

      const existingIds = await db
        .select({ fare_config_id: fareConfigsTable.fare_config_id })
        .from(fareConfigsTable);
      const taken = new Set(existingIds.map((r) => r.fare_config_id));

      const fareConfigId = body.label
        ? uniqueSlug(`fare-${body.label}`, taken)
        : uuidId("fare");
      const [inserted] = await db
        .insert(fareConfigsTable)
        .values({
          fare_config_id: fareConfigId,
          label: body.label,
          base_fare: String(body.base_fare),
          base_distance_km: String(body.base_distance_km),
          rate_per_km: String(body.rate_per_km),
          student_discount_pct: String(body.student_discount_pct),
          senior_discount_pct: String(body.senior_discount_pct),
          is_default: body.is_default ?? false,
        })
        .returning();

      return reply.code(201).send({ success: true, data: serialize(inserted) });
    },
  );

  app.put(
    "/fare-configs/:fareConfigId",
    { schema: { body: updateFareConfigSchema } },
    async (request) => {
      const { fareConfigId } = request.params as { fareConfigId: string };
      const body = request.body;

      const [existing] = await db
        .select()
        .from(fareConfigsTable)
        .where(eq(fareConfigsTable.fare_config_id, fareConfigId))
        .limit(1);
      if (!existing) {
        throw notFound(`Fare config ${fareConfigId} not found`);
      }

      const resultIsActive =
        body.is_active !== undefined ? body.is_active : existing.is_active;
      const resultIsDefault =
        body.is_default !== undefined ? body.is_default : existing.is_default;

      // FR-015: an inactive configuration must never be default.
      if (resultIsDefault && !resultIsActive) {
        throw conflict(
          "Cannot set the default fare configuration inactive; reactivate it or assign another default first.",
        );
      }
      // FR-005: exactly one default must remain; deactivating the sole default
      // while explicitly un-marking it would leave zero defaults.
      if (
        existing.is_default &&
        body.is_active === false &&
        body.is_default === false
      ) {
        throw conflict(
          "Cannot remove the default fare configuration without assigning a replacement default.",
        );
      }

      const patch: Record<string, unknown> = {};
      if (body.label !== undefined) patch.label = body.label;
      if (body.base_fare !== undefined)
        patch.base_fare = String(body.base_fare);
      if (body.base_distance_km !== undefined)
        patch.base_distance_km = String(body.base_distance_km);
      if (body.rate_per_km !== undefined)
        patch.rate_per_km = String(body.rate_per_km);
      if (body.student_discount_pct !== undefined)
        patch.student_discount_pct = String(body.student_discount_pct);
      if (body.senior_discount_pct !== undefined)
        patch.senior_discount_pct = String(body.senior_discount_pct);
      if (body.is_active !== undefined) patch.is_active = body.is_active;

      if (body.is_default === true && !existing.is_default) {
        // NOTE: un-mark + mark is not transactional (two statements). With a
        // single admin writer the window is acceptable; a unique partial index
        // on is_default would close it, but migrations are out of scope (see
        // data-model.md). The FR-015 guard above runs first, so this can never
        // hand default to an inactive config.
        await db
          .update(fareConfigsTable)
          .set({ is_default: false })
          .where(eq(fareConfigsTable.is_default, true));
        patch.is_default = true;
      }

      const [updated] = await db
        .update(fareConfigsTable)
        .set(patch)
        .where(eq(fareConfigsTable.fare_config_id, fareConfigId))
        .returning();

      return { success: true, data: serialize(updated) };
    },
  );

  app.delete("/fare-configs/:fareConfigId", async (request) => {
    const { fareConfigId } = request.params as { fareConfigId: string };

    const [existing] = await db
      .select()
      .from(fareConfigsTable)
      .where(eq(fareConfigsTable.fare_config_id, fareConfigId))
      .limit(1);
    if (!existing) {
      throw notFound(`Fare config ${fareConfigId} not found`);
    }

    const [activeReference] = await db
      .select({ route_id: routesTable.route_id })
      .from(routesTable)
      .where(
        and(
          eq(routesTable.fare_config_id, fareConfigId),
          eq(routesTable.is_active, true),
        ),
      )
      .limit(1);
    if (activeReference) {
      throw conflict(
        "Cannot deactivate fare configuration referenced by active Routes",
      );
    }

    if (existing.is_default) {
      throw conflict("Cannot deactivate the last default fare configuration");
    }

    const [updated] = await db
      .update(fareConfigsTable)
      .set({ is_active: false })
      .where(eq(fareConfigsTable.fare_config_id, fareConfigId))
      .returning();

    return {
      success: true,
      data: {
        fare_config_id: updated.fare_config_id,
        is_active: updated.is_active,
      },
    };
  });
}
