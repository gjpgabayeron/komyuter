import { asc, count, desc, eq } from "drizzle-orm";
import { createRouteSchema, updateRouteSchema } from "@komyuter/shared";
import type { AppDeps, AppInstance } from "./app";
import {
  routes as routesTable,
  directions as directionsTable,
} from "../db/schema";
import { conflict, notFound } from "./errors";
import { uniqueSlug } from "../domain/ids";
import { loadDirectionFull } from "../domain/entities";

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export async function registerRoutes(
  app: AppInstance,
  deps: AppDeps,
): Promise<void> {
  const { db } = deps;

  app.get("/routes", async () => {
    const rows = await db
      .select({
        route_id: routesTable.route_id,
        name: routesTable.name,
        short_name: routesTable.short_name,
        color: routesTable.color,
        is_active: routesTable.is_active,
        fare_config_id: routesTable.fare_config_id,
        created_at: routesTable.created_at,
        updated_at: routesTable.updated_at,
      })
      .from(routesTable)
      .orderBy(desc(routesTable.updated_at));

    const counts = await db
      .select({
        route_id: directionsTable.route_id,
        direction_count: count(directionsTable.direction_id),
      })
      .from(directionsTable)
      .groupBy(directionsTable.route_id);

    const countByRoute = new Map(
      counts.map((c) => [c.route_id, Number(c.direction_count)]),
    );

    return {
      success: true,
      data: rows.map((row) => ({
        ...row,
        direction_count: countByRoute.get(row.route_id) ?? 0,
        created_at: iso(row.created_at),
        updated_at: iso(row.updated_at),
      })),
    };
  });

  app.post(
    "/routes",
    { schema: { body: createRouteSchema } },
    async (request, reply) => {
      const body = request.body;

      const existingIds = await db
        .select({ route_id: routesTable.route_id })
        .from(routesTable);
      // "overview" is a reserved static route segment (GET /routes/overview) —
      // an explicit route_id must not shadow it either (perf audit endpoint).
      const taken = new Set([
        ...existingIds.map((r) => r.route_id),
        "overview",
      ]);

      const routeId = body.route_id ?? uniqueSlug(body.name, taken);
      if (taken.has(routeId)) {
        throw conflict(`Route ${routeId} already exists`);
      }

      const [inserted] = await db
        .insert(routesTable)
        .values({
          route_id: routeId,
          name: body.name,
          short_name: body.short_name,
          color: body.color ?? null,
          fare_config_id: body.fare_config_id ?? null,
          // Draft-first workflow: new routes start INACTIVE so they can be
          // reviewed before going live (Pasted #42).
          is_active: body.is_active ?? false,
        })
        .returning();

      return reply.code(201).send({
        success: true,
        data: {
          route_id: inserted.route_id,
          name: inserted.name,
          short_name: inserted.short_name,
          color: inserted.color,
          is_active: inserted.is_active,
          fare_config_id: inserted.fare_config_id,
          created_at: iso(inserted.created_at),
          updated_at: iso(inserted.updated_at),
          direction_count: 0,
        },
      });
    },
  );

  // Overview payload: ALL routes' base/return polylines + stops in ONE request
  // (perf audit — replaces the N+1 detail fetches the overview used to make).
  // Registered before /routes/:routeId; Fastify gives the static segment
  // precedence, so "overview" is never treated as a route id.
  app.get("/routes/overview", async () => {
    const rows = await db
      .select({
        route_id: routesTable.route_id,
        name: routesTable.name,
        color: routesTable.color,
        is_active: routesTable.is_active,
      })
      .from(routesTable)
      // Keep the previous overview z-order (most recently updated first).
      .orderBy(desc(routesTable.updated_at));

    const data = await Promise.all(
      rows.map(async (route) => {
        const directionIds = await db
          .select({ direction_id: directionsTable.direction_id })
          .from(directionsTable)
          .where(eq(directionsTable.route_id, route.route_id))
          .orderBy(
            asc(directionsTable.direction_kind),
            asc(directionsTable.created_at),
            asc(directionsTable.direction_id),
          );
        const [base, ret] = await Promise.all(
          directionIds
            .slice(0, 2)
            .map((d) => loadDirectionFull(db, d.direction_id)),
        );
        return {
          route_id: route.route_id,
          name: route.name,
          color: route.color,
          is_active: route.is_active,
          base_polyline: base?.base_polyline ?? null,
          return_polyline: ret?.base_polyline ?? null,
          stops: base?.stops ?? [],
        };
      }),
    );

    return { success: true, data };
  });

  app.get("/routes/:routeId", async (request) => {
    const { routeId } = request.params as { routeId: string };

    const [row] = await db
      .select({
        route_id: routesTable.route_id,
        name: routesTable.name,
        short_name: routesTable.short_name,
        color: routesTable.color,
        is_active: routesTable.is_active,
        fare_config_id: routesTable.fare_config_id,
        created_at: routesTable.created_at,
        updated_at: routesTable.updated_at,
      })
      .from(routesTable)
      .where(eq(routesTable.route_id, routeId))
      .limit(1);

    if (!row) {
      throw notFound(`Route ${routeId} not found`);
    }

    const directionRows = await db
      .select({ direction_id: directionsTable.direction_id })
      .from(directionsTable)
      .where(eq(directionsTable.route_id, routeId))
      // The admin-plotted BASE direction always comes first: the derived
      // return shares the pair's created_at (same atomic transaction), so the
      // kind marker — not row order — decides. Legacy rows default to 'base'.
      .orderBy(
        asc(directionsTable.direction_kind),
        asc(directionsTable.created_at),
        asc(directionsTable.direction_id),
      );

    const directions = await Promise.all(
      directionRows.map((d) => loadDirectionFull(db, d.direction_id)),
    );

    return {
      success: true,
      data: {
        route_id: row.route_id,
        name: row.name,
        short_name: row.short_name,
        color: row.color,
        is_active: row.is_active,
        fare_config_id: row.fare_config_id,
        created_at: iso(row.created_at),
        updated_at: iso(row.updated_at),
        directions: directions.filter((d) => d !== null),
      },
    };
  });

  app.put(
    "/routes/:routeId",
    { schema: { body: updateRouteSchema } },
    async (request) => {
      const { routeId } = request.params as { routeId: string };
      const body = request.body;

      const [existing] = await db
        .select({ route_id: routesTable.route_id })
        .from(routesTable)
        .where(eq(routesTable.route_id, routeId))
        .limit(1);
      if (!existing) {
        throw notFound(`Route ${routeId} not found`);
      }

      const patch: Record<string, unknown> = {};
      if (body.name !== undefined) patch.name = body.name;
      if (body.short_name !== undefined) patch.short_name = body.short_name;
      if (body.color !== undefined) patch.color = body.color;
      if (body.fare_config_id !== undefined)
        patch.fare_config_id = body.fare_config_id;
      if (body.is_active !== undefined) patch.is_active = body.is_active;

      const [updated] = await db
        .update(routesTable)
        .set(patch)
        .where(eq(routesTable.route_id, routeId))
        .returning();

      return {
        success: true,
        data: {
          route_id: updated.route_id,
          name: updated.name,
          short_name: updated.short_name,
          color: updated.color,
          is_active: updated.is_active,
          fare_config_id: updated.fare_config_id,
          created_at: iso(updated.created_at),
          updated_at: iso(updated.updated_at),
        },
      };
    },
  );

  app.delete("/routes/:routeId", async (request) => {
    const { routeId } = request.params as { routeId: string };

    // Hard delete: the directions → routes and stops → directions foreign keys
    // cascade (schema.ts), so one row removal clears the route's plotted
    // directions and stops from the database.
    const [deleted] = await db
      .delete(routesTable)
      .where(eq(routesTable.route_id, routeId))
      .returning({ route_id: routesTable.route_id });
    if (!deleted) {
      throw notFound(`Route ${routeId} not found`);
    }

    return {
      success: true,
      data: { route_id: deleted.route_id },
    };
  });
}
