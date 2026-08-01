import { eq, max } from "drizzle-orm";
import { createStopSchema, updateStopSchema } from "@komyuter/shared";
import type { AppDeps, AppInstance } from "./app";
import {
  directions as directionsTable,
  stops as stopsTable,
} from "../db/schema";
import { asGeoJSON, asPointFromGeoJSON } from "../db/queries";
import { notFound } from "./errors";
import { uuidId } from "../domain/ids";
import { assertNotDirectionTerminal } from "../domain/validation";
import { loadStops } from "../domain/entities";

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export async function registerStops(
  app: AppInstance,
  deps: AppDeps,
): Promise<void> {
  const { db } = deps;

  app.get("/directions/:directionId/stops", async (request) => {
    const { directionId } = request.params as { directionId: string };

    const [direction] = await db
      .select({ direction_id: directionsTable.direction_id })
      .from(directionsTable)
      .where(eq(directionsTable.direction_id, directionId))
      .limit(1);
    if (!direction) {
      throw notFound(`Direction ${directionId} not found`);
    }

    return { success: true, data: await loadStops(db, directionId) };
  });

  app.post(
    "/directions/:directionId/stops",
    { schema: { body: createStopSchema } },
    async (request, reply) => {
      const { directionId } = request.params as { directionId: string };
      const body = request.body;

      const [direction] = await db
        .select({ direction_id: directionsTable.direction_id })
        .from(directionsTable)
        .where(eq(directionsTable.direction_id, directionId))
        .limit(1);
      if (!direction) {
        throw notFound(`Direction ${directionId} not found`);
      }

      let stopOrder = body.stop_order;
      if (stopOrder === undefined) {
        const [maxRow] = await db
          .select({ value: max(stopsTable.stop_order) })
          .from(stopsTable)
          .where(eq(stopsTable.direction_id, directionId));
        stopOrder = (maxRow?.value ?? 0) + 1;
      }

      const stopId = uuidId("stop");
      const [inserted] = await db
        .insert(stopsTable)
        .values({
          stop_id: stopId,
          direction_id: directionId,
          name: body.name,
          stop_order: stopOrder,
          type: body.type,
          location: asPointFromGeoJSON(body.location) as unknown as string,
          is_guaranteed_service: body.is_guaranteed_service ?? true,
          landmark_hint: body.landmark_hint ?? null,
          notes: body.notes ?? null,
        })
        .returning();

      return reply.code(201).send({
        success: true,
        data: {
          stop_id: inserted.stop_id,
          direction_id: inserted.direction_id,
          name: inserted.name,
          stop_order: inserted.stop_order,
          type: inserted.type,
          location: body.location,
          is_guaranteed_service: inserted.is_guaranteed_service,
          ar_marker_enabled: inserted.ar_marker_enabled,
          landmark_hint: inserted.landmark_hint,
          notes: inserted.notes,
          is_active: inserted.is_active,
          created_at: iso(inserted.created_at),
          updated_at: iso(inserted.updated_at),
        },
      });
    },
  );

  app.put(
    "/stops/:stopId",
    { schema: { body: updateStopSchema } },
    async (request) => {
      const { stopId } = request.params as { stopId: string };
      const body = request.body;

      const [existing] = await db
        .select()
        .from(stopsTable)
        .where(eq(stopsTable.stop_id, stopId))
        .limit(1);
      if (!existing) {
        throw notFound(`Stop ${stopId} not found`);
      }

      const patch: Record<string, unknown> = {};
      if (body.name !== undefined) patch.name = body.name;
      if (body.stop_order !== undefined) patch.stop_order = body.stop_order;
      if (body.type !== undefined) patch.type = body.type;
      if (body.location !== undefined)
        patch.location = asPointFromGeoJSON(body.location) as unknown as string;
      if (body.is_guaranteed_service !== undefined)
        patch.is_guaranteed_service = body.is_guaranteed_service;
      if (body.landmark_hint !== undefined)
        patch.landmark_hint = body.landmark_hint;
      if (body.notes !== undefined) patch.notes = body.notes;
      if (body.is_active !== undefined) patch.is_active = body.is_active;

      const [updated] = await db
        .update(stopsTable)
        .set(patch)
        .where(eq(stopsTable.stop_id, stopId))
        .returning();

      const [readBack] = await db
        .select({ location: asGeoJSON(stopsTable.location) })
        .from(stopsTable)
        .where(eq(stopsTable.stop_id, stopId))
        .limit(1);

      return {
        success: true,
        data: {
          stop_id: updated.stop_id,
          direction_id: updated.direction_id,
          name: updated.name,
          stop_order: updated.stop_order,
          type: updated.type,
          location: readBack?.location,
          is_guaranteed_service: updated.is_guaranteed_service,
          ar_marker_enabled: updated.ar_marker_enabled,
          landmark_hint: updated.landmark_hint,
          notes: updated.notes,
          is_active: updated.is_active,
          created_at: iso(updated.created_at),
          updated_at: iso(updated.updated_at),
        },
      };
    },
  );

  app.delete("/stops/:stopId", async (request) => {
    const { stopId } = request.params as { stopId: string };

    const [existing] = await db
      .select()
      .from(stopsTable)
      .where(eq(stopsTable.stop_id, stopId))
      .limit(1);
    if (!existing) {
      throw notFound(`Stop ${stopId} not found`);
    }

    await assertNotDirectionTerminal(db, stopId);

    const [updated] = await db
      .update(stopsTable)
      .set({ is_active: false })
      .where(eq(stopsTable.stop_id, stopId))
      .returning();

    return {
      success: true,
      data: { stop_id: updated.stop_id, is_active: updated.is_active },
    };
  });
}
