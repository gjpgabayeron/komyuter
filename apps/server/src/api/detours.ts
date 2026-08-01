import { eq } from "drizzle-orm";
import { createDetourSchema, updateDetourSchema } from "@komyuter/shared";
import type { AppDeps, AppInstance } from "./app";
import {
  directions as directionsTable,
  detours as detoursTable,
} from "../db/schema";
import { asLineStringFromGeoJSON, asPointFromGeoJSON } from "../db/queries";
import { notFound } from "./errors";
import { uuidId } from "../domain/ids";
import { assertPointOnLine, loadBasePolyline } from "../domain/validation";
import { loadDetours } from "../domain/entities";

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export async function registerDetours(
  app: AppInstance,
  deps: AppDeps,
): Promise<void> {
  const { db } = deps;

  app.get("/directions/:directionId/detours", async (request) => {
    const { directionId } = request.params as { directionId: string };
    const [direction] = await db
      .select({ direction_id: directionsTable.direction_id })
      .from(directionsTable)
      .where(eq(directionsTable.direction_id, directionId))
      .limit(1);
    if (!direction) {
      throw notFound(`Direction ${directionId} not found`);
    }
    return { success: true, data: await loadDetours(db, directionId) };
  });

  app.post(
    "/directions/:directionId/detours",
    { schema: { body: createDetourSchema } },
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

      const basePolyline = await loadBasePolyline(db, directionId);
      assertPointOnLine(body.entry, basePolyline);
      assertPointOnLine(body.exit, basePolyline);

      const detourId = uuidId("detour");
      const [inserted] = await db
        .insert(detoursTable)
        .values({
          detour_id: detourId,
          direction_id: directionId,
          label: body.label,
          entry: asPointFromGeoJSON(body.entry) as unknown as string,
          exit: asPointFromGeoJSON(body.exit) as unknown as string,
          detour_polyline: asLineStringFromGeoJSON(
            body.detour_polyline,
          ) as unknown as string,
          additional_distance_meters: body.additional_distance_meters ?? null,
          commuter_instruction: body.commuter_instruction,
          driver_instruction: body.driver_instruction ?? null,
          notable_stops: body.notable_stops ?? [],
        })
        .returning();

      return reply.code(201).send({
        success: true,
        data: {
          detour_id: inserted.detour_id,
          direction_id: inserted.direction_id,
          label: inserted.label,
          entry: body.entry,
          exit: body.exit,
          detour_polyline: body.detour_polyline,
          additional_distance_meters: inserted.additional_distance_meters,
          commuter_instruction: inserted.commuter_instruction,
          driver_instruction: inserted.driver_instruction,
          notable_stops: inserted.notable_stops ?? [],
          is_active: inserted.is_active,
          created_at: iso(inserted.created_at),
          updated_at: iso(inserted.updated_at),
        },
      });
    },
  );

  app.put(
    "/detours/:detourId",
    { schema: { body: updateDetourSchema } },
    async (request) => {
      const { detourId } = request.params as { detourId: string };
      const body = request.body;

      const [existing] = await db
        .select()
        .from(detoursTable)
        .where(eq(detoursTable.detour_id, detourId))
        .limit(1);
      if (!existing) {
        throw notFound(`Detour ${detourId} not found`);
      }

      if (body.entry !== undefined || body.exit !== undefined) {
        const basePolyline = await loadBasePolyline(db, existing.direction_id);
        if (body.entry !== undefined)
          assertPointOnLine(body.entry, basePolyline);
        if (body.exit !== undefined) assertPointOnLine(body.exit, basePolyline);
      }

      const patch: Record<string, unknown> = {};
      if (body.label !== undefined) patch.label = body.label;
      if (body.entry !== undefined)
        patch.entry = asPointFromGeoJSON(body.entry) as unknown as string;
      if (body.exit !== undefined)
        patch.exit = asPointFromGeoJSON(body.exit) as unknown as string;
      if (body.detour_polyline !== undefined)
        patch.detour_polyline = asLineStringFromGeoJSON(
          body.detour_polyline,
        ) as unknown as string;
      if (body.additional_distance_meters !== undefined)
        patch.additional_distance_meters = body.additional_distance_meters;
      if (body.commuter_instruction !== undefined)
        patch.commuter_instruction = body.commuter_instruction;
      if (body.driver_instruction !== undefined)
        patch.driver_instruction = body.driver_instruction;
      if (body.notable_stops !== undefined)
        patch.notable_stops = body.notable_stops;
      if (body.is_active !== undefined) patch.is_active = body.is_active;

      await db
        .update(detoursTable)
        .set(patch)
        .where(eq(detoursTable.detour_id, detourId));

      const [detours] = await Promise.all([
        loadDetours(db, existing.direction_id),
      ]);
      const updated = detours.find((d) => d.detour_id === detourId);
      return { success: true, data: updated };
    },
  );

  app.delete("/detours/:detourId", async (request) => {
    const { detourId } = request.params as { detourId: string };

    const [existing] = await db
      .select()
      .from(detoursTable)
      .where(eq(detoursTable.detour_id, detourId))
      .limit(1);
    if (!existing) {
      throw notFound(`Detour ${detourId} not found`);
    }

    const [updated] = await db
      .update(detoursTable)
      .set({ is_active: false })
      .where(eq(detoursTable.detour_id, detourId))
      .returning();

    return {
      success: true,
      data: { detour_id: updated.detour_id, is_active: updated.is_active },
    };
  });
}
