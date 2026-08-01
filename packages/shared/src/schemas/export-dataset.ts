import { z } from "zod";
import { geoPointSchema, geoLineStringSchema } from "./geometry";
import {
  stopTypeSchema,
  restrictionReasonSchema,
  restrictionAffectsSchema,
} from "./domain";
import {
  EXPORT_SCHEMA_VERSION,
  EXPORT_COORDINATE_ORDER,
} from "../types/export-dataset";

export const exportFareConfigurationSchema = z.object({
  fare_config_id: z.string().min(1),
  label: z.string().min(1),
  base_fare: z.number(),
  base_distance_km: z.number(),
  rate_per_km: z.number(),
  student_discount_pct: z.number(),
  senior_discount_pct: z.number(),
  is_default: z.boolean(),
});

export const exportRestrictionSchema = z.object({
  restriction_id: z.string().min(1),
  from_coord_index: z.number().int().min(0),
  to_coord_index: z.number().int().min(0),
  reason: restrictionReasonSchema,
  affects: restrictionAffectsSchema,
  note: z.string().nullable(),
});

export const exportStopSchema = z.object({
  stop_id: z.string().min(1),
  name: z.string().min(1),
  type: stopTypeSchema,
  stop_order: z.number().int().min(1),
  is_guaranteed_service: z.boolean(),
  landmark_hint: z.string().nullable(),
  location: geoPointSchema,
});

export const exportDetourSchema = z.object({
  detour_id: z.string().min(1),
  label: z.string().min(1),
  entry: geoPointSchema,
  exit: geoPointSchema,
  detour_polyline: geoLineStringSchema,
  additional_distance_meters: z.number().int().nullable(),
  commuter_instruction: z.string().min(1),
  driver_instruction: z.string().nullable(),
  notable_stops: z.array(
    z.object({
      stop_id: z.string().min(1),
      name: z.string().min(1),
      is_detour_only: z.boolean(),
    }),
  ),
});

export const exportDirectionSchema = z.object({
  direction_id: z.string().min(1),
  label: z.string().min(1),
  is_active: z.boolean(),
  terminals: z.object({
    origin: z.string().nullable(),
    destination: z.string().nullable(),
  }),
  base_polyline: geoLineStringSchema,
  stops: z.array(exportStopSchema),
  detours: z.array(exportDetourSchema),
  restrictions: z.array(exportRestrictionSchema),
});

export const exportRouteSchema = z.object({
  route_id: z.string().min(1),
  name: z.string().min(1),
  short_name: z.string().min(1),
  color: z.string().nullable(),
  is_active: z.boolean(),
  fare_config_id: z.string().nullable(),
  directions: z.array(exportDirectionSchema),
});

export const exportDatasetSchema = z.object({
  schema_version: z.literal(EXPORT_SCHEMA_VERSION),
  coordinate_order: z.literal(EXPORT_COORDINATE_ORDER),
  exported_at: z.string().datetime(),
  fare_configs: z.array(exportFareConfigurationSchema),
  routes: z.array(exportRouteSchema),
});
