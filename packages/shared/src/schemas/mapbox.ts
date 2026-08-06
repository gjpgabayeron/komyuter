import { z } from "zod";
import { geoLineStringSchema } from "./geometry";

/**
 * Wire shape of the admin Mapbox Directions proxy response
 * (GET /api/admin/mapbox/directions). Field names mirror Mapbox's
 * snake_case JSON so the response can be passed through as-is.
 */
export const mapboxDirectionsResponseSchema = z.object({
  polyline: geoLineStringSchema,
  distance_meters: z.number().nonnegative(),
  snapped: z.boolean(),
  warning: z.string().nullable(),
});

export type MapboxDirectionsResponse = z.infer<
  typeof mapboxDirectionsResponseSchema
>;
