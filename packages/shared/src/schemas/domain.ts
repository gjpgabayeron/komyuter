import { z } from "zod";
import { geoPointSchema, geoLineStringSchema } from "./geometry";

export const stopTypeSchema = z.enum([
  "terminal",
  "major_stop",
  "waiting_area",
]);

export const restrictionReasonSchema = z.enum([
  "no_stopping_zone",
  "contraflow",
  "pedestrian_hostile",
]);

export const restrictionAffectsSchema = z.enum([
  "boarding",
  "alighting",
  "both",
]);

export const notableStopSchema = z.object({
  stop_id: z.string().min(1),
  name: z.string().min(1),
  is_detour_only: z.boolean(),
});

export const routeIdSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "route_id must be a lower-case slug");

export const createRouteSchema = z.object({
  route_id: routeIdSchema.optional(),
  name: z.string().min(1),
  short_name: z.string().min(1),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
  fare_config_id: z.string().min(1).nullable().optional(),
});

export const updateRouteSchema = createRouteSchema.partial().extend({
  is_active: z.boolean().optional(),
});

export const createDirectionSchema = z.object({
  label: z.string().min(1),
  base_polyline: geoLineStringSchema,
  origin_stop_id: z.string().min(1).nullable().optional(),
  destination_stop_id: z.string().min(1).nullable().optional(),
});

export const updateDirectionSchema = createDirectionSchema.partial().extend({
  is_active: z.boolean().optional(),
});

export const createStopSchema = z.object({
  name: z.string().min(1),
  type: stopTypeSchema,
  location: geoPointSchema,
  stop_order: z.number().int().min(1).optional(),
  is_guaranteed_service: z.boolean().optional(),
  landmark_hint: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const updateStopSchema = createStopSchema.partial().extend({
  is_active: z.boolean().optional(),
});

export const createDetourSchema = z.object({
  label: z.string().min(1),
  entry: geoPointSchema,
  exit: geoPointSchema,
  detour_polyline: geoLineStringSchema,
  additional_distance_meters: z.number().int().min(0).nullable().optional(),
  commuter_instruction: z.string().min(1),
  driver_instruction: z.string().nullable().optional(),
  notable_stops: z.array(notableStopSchema).optional(),
});

export const updateDetourSchema = createDetourSchema.partial().extend({
  is_active: z.boolean().optional(),
});

export const createRestrictionSchema = z.object({
  from_coord_index: z.number().int().min(0),
  to_coord_index: z.number().int().min(0),
  reason: restrictionReasonSchema,
  affects: restrictionAffectsSchema,
  note: z.string().nullable().optional(),
});

export const updateRestrictionSchema = createRestrictionSchema
  .partial()
  .extend({
    is_active: z.boolean().optional(),
  });

export const createFareConfigSchema = z.object({
  label: z.string().min(1),
  base_fare: z.number().nonnegative(),
  base_distance_km: z.number().nonnegative(),
  rate_per_km: z.number().nonnegative(),
  student_discount_pct: z.number().min(0).max(100),
  senior_discount_pct: z.number().min(0).max(100),
  is_default: z.boolean().optional(),
});

export const updateFareConfigSchema = createFareConfigSchema.partial().extend({
  is_active: z.boolean().optional(),
});
