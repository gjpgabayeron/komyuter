import { eq } from "drizzle-orm";
import { createDirectionSchema, updateDirectionSchema } from "@komyuter/shared";
import type { AppDeps, AppInstance } from "./app";
import {
  directions as directionsTable,
  routes as routesTable,
  stops as stopsTable,
} from "../db/schema";
import { asLineStringFromGeoJSON, asPointFromGeoJSON } from "../db/queries";
import { notFound, validationError } from "./errors";
import { uuidId } from "../domain/ids";
import { loadDirectionFull, loadDirectionSummary } from "../domain/entities";

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export async function registerDirections(
  app: AppInstance,
  deps: AppDeps,
): Promise<void> {
  const { db } = deps;

  app.get("/routes/:routeId/directions", async (request) => {
    const { routeId } = request.params as { routeId: string };

    const [route] = await db
      .select({ route_id: routesTable.route_id })
      .from(routesTable)
      .where(eq(routesTable.route_id, routeId))
      .limit(1);
    if (!route) {
      throw notFound(`Route ${routeId} not found`);
    }

    const rows = await db
      .select({ direction_id: directionsTable.direction_id })
      .from(directionsTable)
      .where(eq(directionsTable.route_id, routeId));

    const directions = await Promise.all(
      rows.map((row) => loadDirectionSummary(db, row.direction_id)),
    );

    return { success: true, data: directions.filter((d) => d !== null) };
  });

  app.post(
    "/routes/:routeId/directions",
    { schema: { body: createDirectionSchema } },
    async (request, reply) => {
      const { routeId } = request.params as { routeId: string };
      const body = request.body;

      const [route] = await db
        .select({ route_id: routesTable.route_id })
        .from(routesTable)
        .where(eq(routesTable.route_id, routeId))
        .limit(1);
      if (!route) {
        throw notFound(`Route ${routeId} not found`);
      }

      if (body.stops !== undefined && body.stops.length === 0) {
        throw validationError("Direction must have a non-empty stop list");
      }

      const directionId = uuidId("dir");

      const [inserted] = await db
        .insert(directionsTable)
        .values({
          direction_id: directionId,
          route_id: routeId,
          label: body.label,
          base_polyline: asLineStringFromGeoJSON(
            body.base_polyline,
          ) as unknown as string,
          origin_stop_id: body.origin_stop_id ?? null,
          destination_stop_id: body.destination_stop_id ?? null,
        })
        .returning();

      if (body.stops && body.stops.length > 0) {
        await Promise.all(
          body.stops.map(async (stop, index) => {
            const stopId = uuidId("stop");
            await db.insert(stopsTable).values({
              stop_id: stopId,
              direction_id: directionId,
              name: stop.name,
              stop_order: stop.stop_order ?? index + 1,
              type: stop.type,
              location: asPointFromGeoJSON(stop.location) as unknown as string,
              is_guaranteed_service: stop.is_guaranteed_service ?? true,
              landmark_hint: stop.landmark_hint ?? null,
              notes: stop.notes ?? null,
            });
          }),
        );
        return reply.code(201).send({
          success: true,
          data: {
            direction_id: directionId,
            route_id: routeId,
            label: inserted.label,
            base_polyline: body.base_polyline,
            origin_stop_id: inserted.origin_stop_id,
            destination_stop_id: inserted.destination_stop_id,
            is_active: inserted.is_active,
            created_at: iso(inserted.created_at),
            updated_at: iso(inserted.updated_at),
            stops: (await loadDirectionFull(db, directionId))?.stops ?? [],
          },
        });
      }

      return reply.code(201).send({
        success: true,
        data: {
          direction_id: directionId,
          route_id: routeId,
          label: inserted.label,
          base_polyline: body.base_polyline,
          origin_stop_id: inserted.origin_stop_id,
          destination_stop_id: inserted.destination_stop_id,
          is_active: inserted.is_active,
          created_at: iso(inserted.created_at),
          updated_at: iso(inserted.updated_at),
          stops: [],
        },
      });
    },
  );

  app.get("/directions/:directionId", async (request) => {
    const { directionId } = request.params as { directionId: string };
    const direction = await loadDirectionFull(db, directionId);
    if (!direction) {
      throw notFound(`Direction ${directionId} not found`);
    }
    return { success: true, data: direction };
  });

  app.put(
    "/directions/:directionId",
    { schema: { body: updateDirectionSchema } },
    async (request) => {
      const { directionId } = request.params as { directionId: string };
      const body = request.body;

      const [existing] = await db
        .select({ direction_id: directionsTable.direction_id })
        .from(directionsTable)
        .where(eq(directionsTable.direction_id, directionId))
        .limit(1);
      if (!existing) {
        throw notFound(`Direction ${directionId} not found`);
      }

      if (body.stops !== undefined && body.stops.length === 0) {
        throw validationError("Direction must have a non-empty stop list");
      }

      const patch: Record<string, unknown> = {};
      if (body.label !== undefined) patch.label = body.label;
      if (body.base_polyline !== undefined)
        patch.base_polyline = asLineStringFromGeoJSON(
          body.base_polyline,
        ) as unknown as string;
      if (body.origin_stop_id !== undefined)
        patch.origin_stop_id = body.origin_stop_id;
      if (body.destination_stop_id !== undefined)
        patch.destination_stop_id = body.destination_stop_id;
      if (body.is_active !== undefined) patch.is_active = body.is_active;

      await db
        .update(directionsTable)
        .set(patch)
        .where(eq(directionsTable.direction_id, directionId));

      const updated = await loadDirectionFull(db, directionId);
      return { success: true, data: updated };
    },
  );

  app.delete("/directions/:directionId", async (request) => {
    const { directionId } = request.params as { directionId: string };

    const [existing] = await db
      .select({ direction_id: directionsTable.direction_id })
      .from(directionsTable)
      .where(eq(directionsTable.direction_id, directionId))
      .limit(1);
    if (!existing) {
      throw notFound(`Direction ${directionId} not found`);
    }

    const [updated] = await db
      .update(directionsTable)
      .set({ is_active: false })
      .where(eq(directionsTable.direction_id, directionId))
      .returning();

    return {
      success: true,
      data: {
        direction_id: updated.direction_id,
        is_active: updated.is_active,
      },
    };
  });
}
