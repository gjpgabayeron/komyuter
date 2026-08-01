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
  loadBasePolyline,
} from "../domain/validation";
import { loadRestrictions } from "../domain/entities";

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export async function registerRestrictions(
  app: AppInstance,
  deps: AppDeps,
): Promise<void> {
  const { db } = deps;

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
    return { success: true, data: await loadRestrictions(db, directionId) };
  });

  app.post(
    "/directions/:directionId/restrictions",
    { schema: { body: createRestrictionSchema } },
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
          from_coord_index: body.from_coord_index,
          to_coord_index: body.to_coord_index,
          reason: body.reason,
          affects: body.affects,
          note: body.note ?? null,
        })
        .returning();

      return reply.code(201).send({
        success: true,
        data: {
          restriction_id: inserted.restriction_id,
          direction_id: inserted.direction_id,
          from_coord_index: inserted.from_coord_index,
          to_coord_index: inserted.to_coord_index,
          reason: inserted.reason,
          affects: inserted.affects,
          note: inserted.note,
          is_active: inserted.is_active,
          created_at: iso(inserted.created_at),
          updated_at: iso(inserted.updated_at),
        },
      });
    },
  );

  app.put(
    "/restrictions/:restrictionId",
    { schema: { body: updateRestrictionSchema } },
    async (request) => {
      const { restrictionId } = request.params as { restrictionId: string };
      const body = request.body;

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
        body.to_coord_index !== undefined
      ) {
        const basePolyline = await loadBasePolyline(db, existing.direction_id);
        assertRestrictionIndexRange(
          body.from_coord_index ?? existing.from_coord_index,
          body.to_coord_index ?? existing.to_coord_index,
          basePolyline,
        );
      }

      const patch: Record<string, unknown> = {};
      if (body.from_coord_index !== undefined)
        patch.from_coord_index = body.from_coord_index;
      if (body.to_coord_index !== undefined)
        patch.to_coord_index = body.to_coord_index;
      if (body.reason !== undefined) patch.reason = body.reason;
      if (body.affects !== undefined) patch.affects = body.affects;
      if (body.note !== undefined) patch.note = body.note;
      if (body.is_active !== undefined) patch.is_active = body.is_active;

      await db
        .update(restrictionsTable)
        .set(patch)
        .where(eq(restrictionsTable.restriction_id, restrictionId));

      const [restrictions] = await Promise.all([
        loadRestrictions(db, existing.direction_id),
      ]);
      const updated = restrictions.find(
        (r) => r.restriction_id === restrictionId,
      );
      return { success: true, data: updated };
    },
  );

  app.delete("/restrictions/:restrictionId", async (request) => {
    const { restrictionId } = request.params as { restrictionId: string };

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
      .set({ is_active: false })
      .where(eq(restrictionsTable.restriction_id, restrictionId))
      .returning();

    return {
      success: true,
      data: {
        restriction_id: updated.restriction_id,
        is_active: updated.is_active,
      },
    };
  });
}
