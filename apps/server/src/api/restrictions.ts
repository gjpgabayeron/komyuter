import { eq } from "drizzle-orm";
import {
  createRestrictionSchema,
  updateRestrictionSchema,
} from "@komyuter/shared";
import type { AppDeps, AppInstance } from "./app";
import {
  directions as directionsTable,
  restrictions as restrictionsTable,
} from "../db/schema";
import { notFound } from "./errors";
import { uuidId } from "../domain/ids";
import {
  assertRestrictionIndexRange,
  loadRestrictionPolyline,
} from "../domain/validation";
import { loadRestrictions } from "../domain/entities";
import { actorId } from "./auth";
import {
  createAttribution,
  loadAttributionResolver,
  updateAttribution,
} from "../domain/attribution";

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export async function registerRestrictions(
  app: AppInstance,
  deps: AppDeps,
): Promise<void> {
  const { db, supabase } = deps;

  app.get("/directions/:directionId/restrictions", async (request) => {
    const { directionId } = request.params as { directionId: string };
    const [direction] = await db
      .select({ direction_id: directionsTable.direction_id })
      .from(directionsTable)
      .where(eq(directionsTable.direction_id, directionId))
      .limit(1);
    if (!direction) {
      throw notFound(`Direction ${directionId} not found`);
    }
    return {
      success: true,
      data: await loadRestrictions(
        db,
        directionId,
        await loadAttributionResolver(supabase),
      ),
    };
  });

  app.post(
    "/directions/:directionId/restrictions",
    {
      schema: { body: createRestrictionSchema },
      config: { permission: "ROUTES_EDIT" },
    },
    async (request, reply) => {
      const { directionId } = request.params as { directionId: string };
      const body = request.body;
      // The actor is the guard's Account — a client-supplied actor is not read.
      const actor = actorId(request);

      const [direction] = await db
        .select({ direction_id: directionsTable.direction_id })
        .from(directionsTable)
        .where(eq(directionsTable.direction_id, directionId))
        .limit(1);
      if (!direction) {
        throw notFound(`Direction ${directionId} not found`);
      }

      const basePolyline = await loadRestrictionPolyline(
        db,
        directionId,
        body.detour_id ?? null,
      );
      assertRestrictionIndexRange(
        body.from_coord_index,
        body.to_coord_index,
        basePolyline,
      );

      const restrictionId = uuidId("restriction");
      const [inserted] = await db
        .insert(restrictionsTable)
        .values({
          restriction_id: restrictionId,
          direction_id: directionId,
          detour_id: body.detour_id ?? null,
          from_coord_index: body.from_coord_index,
          to_coord_index: body.to_coord_index,
          kind: body.kind,
          note: body.note ?? null,
          // A create is both the first and the last write (ADR-0025 §3).
          ...createAttribution(actor),
        })
        .returning();

      const attribution = await loadAttributionResolver(supabase);

      return reply.code(201).send({
        success: true,
        data: {
          restriction_id: inserted.restriction_id,
          direction_id: inserted.direction_id,
          detour_id: inserted.detour_id,
          from_coord_index: inserted.from_coord_index,
          to_coord_index: inserted.to_coord_index,
          kind: inserted.kind,
          note: inserted.note,
          is_active: inserted.is_active,
          created_at: iso(inserted.created_at),
          updated_at: iso(inserted.updated_at),
          created_by: attribution(inserted.created_by),
          updated_by: attribution(inserted.updated_by),
        },
      });
    },
  );

  app.put(
    "/restrictions/:restrictionId",
    {
      schema: { body: updateRestrictionSchema },
      config: { permission: "ROUTES_EDIT" },
    },
    async (request) => {
      const { restrictionId } = request.params as { restrictionId: string };
      const body = request.body;
      // The actor is the guard's Account — a client-supplied actor is not read.
      const actor = actorId(request);

      const [existing] = await db
        .select()
        .from(restrictionsTable)
        .where(eq(restrictionsTable.restriction_id, restrictionId))
        .limit(1);
      if (!existing) {
        throw notFound(`Restriction ${restrictionId} not found`);
      }

      if (
        body.from_coord_index !== undefined ||
        body.to_coord_index !== undefined ||
        body.detour_id !== undefined
      ) {
        const nextDetourId =
          body.detour_id === undefined ? existing.detour_id : body.detour_id;
        const basePolyline = await loadRestrictionPolyline(
          db,
          existing.direction_id,
          nextDetourId,
        );
        assertRestrictionIndexRange(
          body.from_coord_index ?? existing.from_coord_index,
          body.to_coord_index ?? existing.to_coord_index,
          basePolyline,
        );
      }

      const patch: Record<string, unknown> = {};
      if (body.detour_id !== undefined) patch.detour_id = body.detour_id;
      if (body.from_coord_index !== undefined)
        patch.from_coord_index = body.from_coord_index;
      if (body.to_coord_index !== undefined)
        patch.to_coord_index = body.to_coord_index;
      if (body.kind !== undefined) patch.kind = body.kind;
      if (body.note !== undefined) patch.note = body.note;
      if (body.is_active !== undefined) patch.is_active = body.is_active;

      await db
        .update(restrictionsTable)
        .set({
          ...patch,
          // Only the last writer moves: the creator is written once (ADR-0025).
          ...updateAttribution(actor),
        })
        .where(eq(restrictionsTable.restriction_id, restrictionId));

      const attribution = await loadAttributionResolver(supabase);
      const [restrictions] = await Promise.all([
        loadRestrictions(db, existing.direction_id, attribution),
      ]);
      const updated = restrictions.find(
        (r) => r.restriction_id === restrictionId,
      );
      return { success: true, data: updated };
    },
  );

  app.delete(
    "/restrictions/:restrictionId",
    { config: { permission: "ROUTES_EDIT" } },
    async (request) => {
      const { restrictionId } = request.params as { restrictionId: string };
      // Deactivating a restriction is a write to the row, so it moves the last
      // writer (mirrors the stop deactivate path).
      const actor = actorId(request);

      const [existing] = await db
        .select()
        .from(restrictionsTable)
        .where(eq(restrictionsTable.restriction_id, restrictionId))
        .limit(1);
      if (!existing) {
        throw notFound(`Restriction ${restrictionId} not found`);
      }

      const [updated] = await db
        .update(restrictionsTable)
        .set({ is_active: false, ...updateAttribution(actor) })
        .where(eq(restrictionsTable.restriction_id, restrictionId))
        .returning();

      return {
        success: true,
        data: {
          restriction_id: updated.restriction_id,
          is_active: updated.is_active,
        },
      };
    },
  );
}
