import { and, eq, ne } from "drizzle-orm";
import { createDirectionSchema, updateDirectionSchema } from "@komyuter/shared";
import type { AppDeps, AppInstance } from "./app";
import {
  directions as directionsTable,
  routes as routesTable,
  stops as stopsTable,
} from "../db/schema";
import { asLineStringFromGeoJSON, asPointFromGeoJSON } from "../db/queries";
import { conflict, notFound, validationError } from "./errors";
import { uuidId } from "../domain/ids";
import type { Db } from "../config/db";
import type { DirectionEntity } from "../domain/entities";
import { loadDirectionFull, loadDirectionSummary } from "../domain/entities";
import {
  buildDerivedReturn,
  normalizeStopOrder,
  pathEndpointsOnStops,
  type PlotBaseInput,
  type PlotStopInput,
} from "../domain/derive";

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

/** The wire payload for a direction (kept flat; legacy shape). */
function toDirectionPayload(direction: DirectionEntity) {
  return {
    direction_id: direction.direction_id,
    route_id: direction.route_id,
    label: direction.label,
    base_polyline: direction.base_polyline,
    origin_stop_id: direction.origin_stop_id,
    destination_stop_id: direction.destination_stop_id,
    is_active: direction.is_active,
    created_at: direction.created_at,
    updated_at: direction.updated_at,
    stops: direction.stops,
  };
}

/**
 * Atomically persists a plotted base direction and its derived return
 * (FR-027/SC-013). In create mode the route is guarded to exactly two active
 * directions (ADR-0008). In replace mode the sibling direction is re-derived
 * from the new base so the pair always stays mutual reverses.
 */
async function persistPlottedPair(
  db: Db,
  input: {
    routeId: string;
    baseId: string | null;
    base: PlotBaseInput;
    createMode: boolean;
  },
): Promise<{ baseId: string; returnId: string }> {
  return db.transaction(async (tx) => {
    if (input.createMode) {
      const active = await tx
        .select({ direction_id: directionsTable.direction_id })
        .from(directionsTable)
        .where(
          and(
            eq(directionsTable.route_id, input.routeId),
            eq(directionsTable.is_active, true),
          ),
        );
      if (active.length >= 2) {
        throw conflict(
          `Route ${input.routeId} already has two active directions`,
        );
      }
    }

    const baseId = input.baseId ?? uuidId("dir");
    const normalized = normalizeStopOrder(input.base.stops);
    const baseGeometry = asLineStringFromGeoJSON(
      input.base.polyline,
    ) as unknown as string;

    if (input.baseId) {
      await tx
        .update(directionsTable)
        .set({
          label: input.base.label,
          base_polyline: baseGeometry,
          direction_kind: "base",
        })
        .where(eq(directionsTable.direction_id, baseId));
      await tx.delete(stopsTable).where(eq(stopsTable.direction_id, baseId));
    } else {
      await tx
        .insert(directionsTable)
        .values({
          direction_id: baseId,
          route_id: input.routeId,
          label: input.base.label,
          base_polyline: baseGeometry,
          direction_kind: "base",
        })
        .returning();
    }

    const insertedStopIds: string[] = [];
    for (let index = 0; index < normalized.length; index++) {
      const stop = normalized[index];
      const stopId = uuidId("stop");
      await tx.insert(stopsTable).values({
        stop_id: stopId,
        direction_id: baseId,
        name: stop.name,
        stop_order: index + 1,
        type: stop.type,
        location: asPointFromGeoJSON(stop.location) as unknown as string,
        is_guaranteed_service: stop.is_guaranteed_service ?? true,
        landmark_hint: stop.landmark_hint ?? null,
        notes: stop.notes ?? null,
      });
      insertedStopIds.push(stopId);
    }
    const originStopId = insertedStopIds[0];
    const destinationStopId = insertedStopIds[insertedStopIds.length - 1];
    await tx
      .update(directionsTable)
      .set({
        origin_stop_id: originStopId,
        destination_stop_id: destinationStopId,
      })
      .where(eq(directionsTable.direction_id, baseId));

    const derived = buildDerivedReturn(input.base);
    const [sibling] = await tx
      .select({ direction_id: directionsTable.direction_id })
      .from(directionsTable)
      .where(
        and(
          eq(directionsTable.route_id, input.routeId),
          eq(directionsTable.is_active, true),
          ne(directionsTable.direction_id, baseId),
        ),
      )
      .limit(1);
    const returnId = sibling?.direction_id ?? uuidId("dir");
    const returnGeometry = asLineStringFromGeoJSON(
      derived.polyline,
    ) as unknown as string;

    if (sibling) {
      await tx
        .update(directionsTable)
        .set({
          label: derived.label,
          base_polyline: returnGeometry,
          direction_kind: "return",
        })
        .where(eq(directionsTable.direction_id, returnId));
      await tx.delete(stopsTable).where(eq(stopsTable.direction_id, returnId));
    } else {
      await tx
        .insert(directionsTable)
        .values({
          direction_id: returnId,
          route_id: input.routeId,
          label: derived.label,
          base_polyline: returnGeometry,
          direction_kind: "return",
        })
        .returning();
    }

    // The return's terminals are its OWN first/last stop rows (the reversed
    // base stops), so every direction's terminals always resolve inside its
    // own ordered stop list (export reference check).
    const returnStopIds: string[] = [];
    for (let index = 0; index < derived.stops.length; index++) {
      const stop = derived.stops[index];
      const stopId = uuidId("stop");
      await tx.insert(stopsTable).values({
        stop_id: stopId,
        direction_id: returnId,
        name: stop.name,
        stop_order: index + 1,
        type: stop.type,
        location: asPointFromGeoJSON(stop.location) as unknown as string,
        is_guaranteed_service: stop.is_guaranteed_service ?? true,
        landmark_hint: stop.landmark_hint ?? null,
        notes: stop.notes ?? null,
      });
      returnStopIds.push(stopId);
    }
    await tx
      .update(directionsTable)
      .set({
        origin_stop_id: returnStopIds[0],
        destination_stop_id: returnStopIds[returnStopIds.length - 1],
      })
      .where(eq(directionsTable.direction_id, returnId));

    return { baseId, returnId };
  });
}

/** Shared plotted-save validation: ≥2 stops and path ends on the stop pair. */
function validatePlottedPayload(
  stops: PlotStopInput[],
  polyline: PlotBaseInput["polyline"],
): void {
  if (stops.length < 2) {
    throw validationError(
      "A plotted direction needs at least 2 stops (a start and an end stop)",
    );
  }
  const endpoint = pathEndpointsOnStops(polyline, stops);
  if (!endpoint.ok) {
    throw validationError(
      `Plotted path must start and end at the first and last stops (${endpoint.reason} is ${Math.round(endpoint.distanceMeters)}m off)`,
    );
  }
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

      if (body.stops !== undefined && body.stops.length > 0) {
        validatePlottedPayload(body.stops, body.base_polyline);
        const { baseId, returnId } = await persistPlottedPair(db, {
          routeId,
          baseId: null,
          base: {
            label: body.label,
            polyline: body.base_polyline,
            stops: body.stops,
          },
          createMode: true,
        });
        const [baseFull, returnFull] = await Promise.all([
          loadDirectionFull(db, baseId),
          loadDirectionFull(db, returnId),
        ]);
        return reply.code(201).send({
          success: true,
          data: {
            ...toDirectionPayload(baseFull!),
            return_direction: toDirectionPayload(returnFull!),
          },
        });
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
        .select({
          direction_id: directionsTable.direction_id,
          route_id: directionsTable.route_id,
          label: directionsTable.label,
        })
        .from(directionsTable)
        .where(eq(directionsTable.direction_id, directionId))
        .limit(1);
      if (!existing) {
        throw notFound(`Direction ${directionId} not found`);
      }

      if (body.stops !== undefined && body.stops.length === 0) {
        throw validationError("Direction must have a non-empty stop list");
      }

      if (body.stops !== undefined && body.stops.length > 0) {
        if (body.base_polyline === undefined) {
          throw validationError(
            "Replacing a plotted direction requires base_polyline along with stops",
          );
        }
        validatePlottedPayload(body.stops, body.base_polyline);
        const { baseId, returnId } = await persistPlottedPair(db, {
          routeId: existing.route_id,
          baseId: directionId,
          base: {
            label: body.label ?? existing.label,
            polyline: body.base_polyline,
            stops: body.stops,
          },
          createMode: false,
        });
        const [baseFull, returnFull] = await Promise.all([
          loadDirectionFull(db, baseId),
          loadDirectionFull(db, returnId),
        ]);
        return {
          success: true,
          data: {
            ...toDirectionPayload(baseFull!),
            return_direction: toDirectionPayload(returnFull!),
          },
        };
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
