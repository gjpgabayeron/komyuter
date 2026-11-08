import { z } from "zod";

export const coordinatePairSchema = z.tuple([z.number(), z.number()]);

export const geoPointSchema = z.object({
  type: z.literal("Point"),
  coordinates: coordinatePairSchema,
});

export const geoLineStringSchema = z.object({
  type: z.literal("LineString"),
  coordinates: z.array(coordinatePairSchema).min(2),
});
