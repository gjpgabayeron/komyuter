import { eq } from "drizzle-orm";
import { createDetourSchema, updateDetourSchema } from "@komyuter/shared";
import type { GeoPoint, StopType } from "@komyuter/shared";
import type { AppDeps, AppInstance } from "./app";
import {
  directions as directionsTable,
  detours as detoursTable,
  detourStops as detourStopsTable,
} from "../db/schema";
import { asLineStringFromGeoJSON, asPointFromGeoJSON } from "../db/queries";
import { notFound, validationError } from "./errors";
import { uuidId } from "../domain/ids";
import {
  assertDetourLoopEndpoints,
  assertPointOnLine,
  loadBasePolyline,
} from "../domain/validation";
import { loadDetours } from "../domain/entities";

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

/** Inserts a detour's stop list (ordered by array position). */
async function insertDetourStops(
  db: AppDeps["db"],
  detourId: string,
  stops: {
    name: string;
    location: GeoPoint;
    type?: StopType;
    is_guaranteed_service?: boolean;
    landmark_hint?: string | null;
    notes?: string | null;
  }[],
): Promise<void> {
  if (stops.length === 0) return;
  await db.insert(detourStopsTable).values(
    stops.map((stop, index) => ({
      detour_stop_id: uuidId("dstp"),
      detour_id: detourId,
      stop_order: index,
      name: stop.name,
      location: asPointFromGeoJSON(stop.location) as unknown as string,
      type: stop.type ?? "waiting_area",
      is_guaranteed_service: stop.is_guaranteed_service ?? false,
      landmark_hint: stop.landmark_hint ?? null,
      notes: stop.notes ?? null,
    })),
  );
}

/** Detour labels are the rider-facing identity of an alternative route — they
 *  must be unique within the direction. The guard counts every REMAINING row;
 *  permanently deleting a detour frees its label for reuse. */
async function assertDetourLabelAvailable(
  db: AppDeps["db"],
  directionId: string,
  label: string,
  excludeDetourId?: string,
): Promise<void> {
  const rows = await db
    .select({ label: detoursTable.label, detour_id: detoursTable.detour_id })
    .from(detoursTable)
    .where(eq(detoursTable.direction_id, directionId));
  const clash = rows.find(
    (row) => row.detour_id !== excludeDetourId && row.label === label.trim(),
  );
  if (clash) {
    throw validationError(
      `A detour named "${label.trim()}" already exists for this direction`,
    );
  }
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
      assertDetourLoopEndpoints(body.detour_polyline, body.entry, body.exit);
      await assertDetourLabelAvailable(db, directionId, body.label);

      const detourId = uuidId("detour");
      const [inserted] = await db
        .insert(detoursTable)
        .values({
          detour_id: detourId,
          direction_id: directionId,
          label: body.label.trim(),
          entry: asPointFromGeoJSON(body.entry) as unknown as string,
          exit: asPointFromGeoJSON(body.exit) as unknown as string,
          detour_polyline: asLineStringFromGeoJSON(
            body.detour_polyline,
          ) as unknown as string,
          additional_distance_meters: body.additional_distance_meters ?? null,
          commuter_instruction: body.commuter_instruction,
          driver_instruction: body.driver_instruction ?? null,
        })
        .returning();

      // Detour stops (ordered): created atomically with the detour.
      if (body.detour_stops && body.detour_stops.length > 0) {
        await insertDetourStops(db, detourId, body.detour_stops);
      }

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

      if (
        body.detour_polyline !== undefined ||
        body.entry !== undefined ||
        body.exit !== undefined
      ) {
        const basePolyline = await loadBasePolyline(db, existing.direction_id);
        if (body.entry !== undefined)
          assertPointOnLine(body.entry, basePolyline);
        if (body.exit !== undefined) assertPointOnLine(body.exit, basePolyline);

        // FR-023: revalidate the loop against the CURRENT entry/exit even when
        // only one of the three geometry fields is being replaced, so a partial
        // edit can never drift the loop's endpoints off its detour (SC-014).
        const current = (await loadDetours(db, existing.direction_id)).find(
          (detour) => detour.detour_id === detourId,
        );
        if (!current) {
          throw validationError(`Detour ${detourId} not found`);
        }
        assertDetourLoopEndpoints(
          body.detour_polyline ?? current.detour_polyline,
          body.entry ?? current.entry,
          body.exit ?? current.exit,
        );
      }

      if (body.label !== undefined)
        await assertDetourLabelAvailable(
          db,
          existing.direction_id,
          body.label,
          detourId,
        );

      const patch: Record<string, unknown> = {};
      if (body.label !== undefined) patch.label = body.label.trim();
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
      if (body.is_active !== undefined) patch.is_active = body.is_active;

      // A detour_stops-only PUT (or a no-op) must not run an empty SET clause
      // (drizzle `update().set({})` is invalid SQL → 500).
      if (Object.keys(patch).length > 0) {
        await db
          .update(detoursTable)
          .set(patch)
          .where(eq(detoursTable.detour_id, detourId));
      }

      // detour_stops is a REPLACE operation: the payload carries the full
      // ordered list, so the previous rows are dropped and re-created.
      if (body.detour_stops !== undefined) {
        await db
          .delete(detourStopsTable)
          .where(eq(detourStopsTable.detour_id, detourId));
        await insertDetourStops(db, detourId, body.detour_stops);
      }

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

    // DESTRUCTIVE delete (product decision: no soft-remove tier for detours).
    // The row is removed permanently; its label becomes free for reuse and
    // the direction's detour list contracts (no archived rows anywhere).
    const [deleted] = await db
      .delete(detoursTable)
      .where(eq(detoursTable.detour_id, detourId))
      .returning();

    return {
      success: true,
      data: { detour_id: deleted.detour_id },
    };
  });
}
