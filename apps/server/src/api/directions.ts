import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { createDirectionSchema, updateDirectionSchema } from "@komyuter/shared";
import type { AppDeps, AppInstance } from "./app";
import {
  directions as directionsTable,
  routes as routesTable,
  stops as stopsTable,
} from "../db/schema";
import {
  asGeoJSON,
  asLineStringFromGeoJSON,
  asPointFromGeoJSON,
} from "../db/queries";
import { conflict, notFound, validationError } from "./errors";
import { requireBaseVersion, versionedWrite } from "./version";
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
import { actorId } from "./auth";
import {
  createAttribution,
  loadAttributionResolver,
  updateAttribution,
} from "../domain/attribution";

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

/** The transaction handle the plotted save runs on. */
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

interface ExistingStopRow {
  stop_id: string;
  name: string;
  stop_order: number;
  type: string;
  location: unknown;
  is_guaranteed_service: boolean;
  landmark_hint: string | null;
  notes: string | null;
  derived_from_stop_id: string | null;
}

function sameCoordinates(row: ExistingStopRow, stop: PlotStopInput): boolean {
  try {
    // `asGeoJSON` yields a parsed GeoJSON value in this stack; a driver that
    // returns text is accepted too.
    const raw: unknown =
      typeof row.location === "string"
        ? JSON.parse(row.location)
        : row.location;
    const parsed = raw as { coordinates?: [number, number] };
    return (
      parsed.coordinates?.[0] === stop.location.coordinates[0] &&
      parsed.coordinates?.[1] === stop.location.coordinates[1]
    );
  } catch {
    return false;
  }
}

/** A row sent back unchanged keeps its attribution — only real edits move it
 *  (ADR-0031 §5). */
function sameStop(
  row: ExistingStopRow,
  stop: PlotStopInput,
  stopOrder: number,
): boolean {
  return (
    row.name === stop.name &&
    row.stop_order === stopOrder &&
    row.type === stop.type &&
    row.is_guaranteed_service === (stop.is_guaranteed_service ?? true) &&
    row.landmark_hint === (stop.landmark_hint ?? null) &&
    row.notes === (stop.notes ?? null) &&
    sameCoordinates(row, stop)
  );
}

/**
 * Persists a Direction's stop list by upsert (ADR-0031): a stop the client
 * already has from the server keeps its id, a new one gets a server id, and
 * only rows absent from the payload are deleted.
 *
 * `match` says how an incoming stop finds its row: a base stop by its own
 * `stop_id`, a return stop by the base stop it mirrors (`derived_from_stop_id`).
 */
async function persistStops(
  tx: Tx,
  directionId: string,
  stops: readonly PlotStopInput[],
  actorId: string,
  match: "own-id" | "derived",
): Promise<string[]> {
  const existing = await tx
    .select({
      stop_id: stopsTable.stop_id,
      name: stopsTable.name,
      stop_order: stopsTable.stop_order,
      type: stopsTable.type,
      location: asGeoJSON(stopsTable.location),
      is_guaranteed_service: stopsTable.is_guaranteed_service,
      landmark_hint: stopsTable.landmark_hint,
      notes: stopsTable.notes,
      derived_from_stop_id: stopsTable.derived_from_stop_id,
    })
    .from(stopsTable)
    .where(eq(stopsTable.direction_id, directionId));

  if (match === "own-id") {
    const wanted = stops
      .map((stop) => stop.stop_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    if (wanted.length > 0) {
      const owned = await tx
        .select({
          stop_id: stopsTable.stop_id,
          direction_id: stopsTable.direction_id,
        })
        .from(stopsTable)
        .where(inArray(stopsTable.stop_id, wanted));
      const foreign = owned.find((row) => row.direction_id !== directionId);
      if (foreign) {
        throw conflict(`Stop ${foreign.stop_id} belongs to another direction`);
      }
    }
  }

  const byKey = new Map<string, ExistingStopRow>();
  for (const row of existing) {
    const key = match === "derived" ? row.derived_from_stop_id : row.stop_id;
    if (key) byKey.set(key, row);
  }

  const kept = new Set<string>();
  const ids: string[] = [];

  for (let index = 0; index < stops.length; index++) {
    const stop = stops[index];
    const stopOrder = index + 1;
    const key = stop.stop_id ?? null;
    const row = key ? byKey.get(key) : undefined;
    const derivedFrom = match === "derived" ? key : null;

    if (row) {
      if (!sameStop(row, stop, stopOrder)) {
        await tx
          .update(stopsTable)
          .set({
            name: stop.name,
            stop_order: stopOrder,
            type: stop.type,
            location: asPointFromGeoJSON(stop.location) as unknown as string,
            is_guaranteed_service: stop.is_guaranteed_service ?? true,
            landmark_hint: stop.landmark_hint ?? null,
            notes: stop.notes ?? null,
            ...updateAttribution(actorId),
          })
          .where(eq(stopsTable.stop_id, row.stop_id));
      }
      kept.add(row.stop_id);
      ids.push(row.stop_id);
      continue;
    }

    const stopId = uuidId("stop");
    await tx.insert(stopsTable).values({
      stop_id: stopId,
      direction_id: directionId,
      name: stop.name,
      stop_order: stopOrder,
      type: stop.type,
      location: asPointFromGeoJSON(stop.location) as unknown as string,
      is_guaranteed_service: stop.is_guaranteed_service ?? true,
      landmark_hint: stop.landmark_hint ?? null,
      notes: stop.notes ?? null,
      derived_from_stop_id: derivedFrom,
      ...createAttribution(actorId),
    });
    ids.push(stopId);
  }

  const removed = existing
    .filter((row) => !kept.has(row.stop_id))
    .map((row) => row.stop_id);
  if (removed.length > 0) {
    await tx.delete(stopsTable).where(inArray(stopsTable.stop_id, removed));
  }

  return ids;
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
    version: direction.version,
    created_at: direction.created_at,
    updated_at: direction.updated_at,
    created_by: direction.created_by,
    updated_by: direction.updated_by,
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
    /** The Direction Version the save is based on (ADR-0020). Required when
     *  `baseId` is set: a replace with no base would be last-write-wins. */
    baseVersion?: number;
    base: PlotBaseInput;
    createMode: boolean;
    /** The guard's Account id — stamped onto the direction and every stop it
     *  writes, in this same transaction (ADR-0025 §4). The parent Route is not
     *  touched: editing a direction is not an edit of the Route entity. */
    actorId: string;
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
      if (input.baseVersion === undefined) {
        throw new Error(
          "persistPlottedPair: baseVersion is required when baseId is set",
        );
      }
      // The compare-and-swap is the FIRST write of the transaction, so a stale
      // save aborts before any stop is deleted or the sibling is re-derived.
      await versionedWrite(
        await tx
          .update(directionsTable)
          .set({
            label: input.base.label,
            base_polyline: baseGeometry,
            direction_kind: "base",
            version: sql`${directionsTable.version} + 1`,
            ...updateAttribution(input.actorId),
          })
          .where(
            and(
              eq(directionsTable.direction_id, baseId),
              eq(directionsTable.version, input.baseVersion),
            ),
          )
          .returning({ version: directionsTable.version }),
        async () => {
          const [current] = await tx
            .select({ version: directionsTable.version })
            .from(directionsTable)
            .where(eq(directionsTable.direction_id, baseId))
            .limit(1);
          return current?.version ?? null;
        },
        `Direction ${baseId} not found`,
      );
    } else {
      await tx
        .insert(directionsTable)
        .values({
          direction_id: baseId,
          route_id: input.routeId,
          label: input.base.label,
          base_polyline: baseGeometry,
          direction_kind: "base",
          ...createAttribution(input.actorId),
        })
        .returning();
    }

    const baseStopIds = await persistStops(
      tx,
      baseId,
      normalized,
      input.actorId,
      "own-id",
    );
    const originStopId = baseStopIds[0];
    const destinationStopId = baseStopIds[baseStopIds.length - 1];
    await tx
      .update(directionsTable)
      .set({
        origin_stop_id: originStopId,
        destination_stop_id: destinationStopId,
      })
      .where(eq(directionsTable.direction_id, baseId));

    // Carry the persisted base ids into the derivation, so every derived stop
    // knows which base stop it mirrors (ADR-0031 §4).
    const derived = buildDerivedReturn({
      ...input.base,
      stops: normalized.map((stop, index) => ({
        ...stop,
        stop_id: baseStopIds[index],
      })),
    });
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
          // The return is rewritten by this save, so its stamp moves too. It is
          // never a client-held base — the workspace edits the base direction.
          version: sql`${directionsTable.version} + 1`,
          ...updateAttribution(input.actorId),
        })
        .where(eq(directionsTable.direction_id, returnId));
    } else {
      await tx
        .insert(directionsTable)
        .values({
          direction_id: returnId,
          route_id: input.routeId,
          label: derived.label,
          base_polyline: returnGeometry,
          direction_kind: "return",
          ...createAttribution(input.actorId),
        })
        .returning();
    }

    // The return's terminals are its OWN first/last stop rows (the reversed
    // base stops), so every direction's terminals always resolve inside its
    // own ordered stop list (export reference check). The rows are matched by
    // `derived_from_stop_id`, never by position (ADR-0031 §4).
    const returnStopIds = await persistStops(
      tx,
      returnId,
      derived.stops,
      input.actorId,
      "derived",
    );
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
  const { db, supabase } = deps;

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

    const attribution = await loadAttributionResolver(supabase);
    const directions = await Promise.all(
      rows.map((row) =>
        loadDirectionSummary(db, row.direction_id, attribution),
      ),
    );

    return { success: true, data: directions.filter((d) => d !== null) };
  });

  app.post(
    "/routes/:routeId/directions",
    {
      schema: { body: createDirectionSchema },
      config: { permission: "ROUTES_EDIT" },
    },
    async (request, reply) => {
      const { routeId } = request.params as { routeId: string };
      const body = request.body;
      const actor = actorId(request);

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
          actorId: actor,
        });
        const attribution = await loadAttributionResolver(supabase);
        const [baseFull, returnFull] = await Promise.all([
          loadDirectionFull(db, baseId, attribution),
          loadDirectionFull(db, returnId, attribution),
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
          ...createAttribution(actor),
        })
        .returning();

      const attribution = await loadAttributionResolver(supabase);

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
          created_by: attribution(inserted.created_by),
          updated_by: attribution(inserted.updated_by),
          stops: [],
        },
      });
    },
  );

  app.get("/directions/:directionId", async (request) => {
    const { directionId } = request.params as { directionId: string };
    const direction = await loadDirectionFull(
      db,
      directionId,
      await loadAttributionResolver(supabase),
    );
    if (!direction) {
      throw notFound(`Direction ${directionId} not found`);
    }
    return { success: true, data: direction };
  });

  app.put(
    "/directions/:directionId",
    {
      schema: { body: updateDirectionSchema },
      config: { permission: "ROUTES_EDIT" },
    },
    async (request) => {
      const { directionId } = request.params as { directionId: string };
      const body = request.body;
      const actor = actorId(request);

      if (body.base_version === undefined) {
        throw validationError("base_version is required");
      }

      const [existing] = await db
        .select({
          direction_id: directionsTable.direction_id,
          route_id: directionsTable.route_id,
          label: directionsTable.label,
          direction_kind: directionsTable.direction_kind,
        })
        .from(directionsTable)
        .where(eq(directionsTable.direction_id, directionId))
        .limit(1);
      if (!existing) {
        throw notFound(`Direction ${directionId} not found`);
      }

      // The return is derived from the base on every save (ADR-0011); saving
      // it as a base would swap both kinds and re-derive the pair from the
      // wrong side. The workspace never does this — the API must refuse it.
      if (existing.direction_kind === "return") {
        throw conflict(
          `Direction ${directionId} is the derived return; plot the base direction instead`,
        );
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
          baseVersion: body.base_version,
          base: {
            label: body.label ?? existing.label,
            polyline: body.base_polyline,
            stops: body.stops,
          },
          createMode: false,
          actorId: actor,
        });
        const attribution = await loadAttributionResolver(supabase);
        const [baseFull, returnFull] = await Promise.all([
          loadDirectionFull(db, baseId, attribution),
          loadDirectionFull(db, returnId, attribution),
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

      await versionedWrite(
        await db
          .update(directionsTable)
          .set({
            ...patch,
            version: sql`${directionsTable.version} + 1`,
            // Only the last writer moves: the creator is written once (ADR-0025).
            ...updateAttribution(actor),
          })
          .where(
            and(
              eq(directionsTable.direction_id, directionId),
              eq(directionsTable.version, body.base_version),
            ),
          )
          .returning({ version: directionsTable.version }),
        async () => {
          const [current] = await db
            .select({ version: directionsTable.version })
            .from(directionsTable)
            .where(eq(directionsTable.direction_id, directionId))
            .limit(1);
          return current?.version ?? null;
        },
        `Direction ${directionId} not found`,
      );

      const updated = await loadDirectionFull(
        db,
        directionId,
        await loadAttributionResolver(supabase),
      );
      return { success: true, data: updated };
    },
  );

  app.delete(
    "/directions/:directionId",
    { config: { permission: "ROUTES_EDIT" } },
    async (request) => {
      const { directionId } = request.params as { directionId: string };
      const baseVersion = requireBaseVersion(request.query);

      const updated = await versionedWrite(
        await db
          .update(directionsTable)
          .set({
            is_active: false,
            version: sql`${directionsTable.version} + 1`,
            ...updateAttribution(actorId(request)),
          })
          .where(
            and(
              eq(directionsTable.direction_id, directionId),
              eq(directionsTable.version, baseVersion),
            ),
          )
          .returning(),
        async () => {
          const [current] = await db
            .select({ version: directionsTable.version })
            .from(directionsTable)
            .where(eq(directionsTable.direction_id, directionId))
            .limit(1);
          return current?.version ?? null;
        },
        `Direction ${directionId} not found`,
      );

      return {
        success: true,
        data: {
          direction_id: updated.direction_id,
          is_active: updated.is_active,
        },
      };
    },
  );
}
