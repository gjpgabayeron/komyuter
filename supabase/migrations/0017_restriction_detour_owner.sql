-- Migration 0017: Restrictions can belong to an alternative route.
--
-- `detour_id = NULL` is the Main route. A non-null owner points at one saved
-- Detour; its range indices then refer to that detour's `detour_polyline`
-- rather than the Direction's base polyline. Existing rows keep NULL.

ALTER TABLE "restrictions" ADD COLUMN "detour_id" text;
--> statement-breakpoint
ALTER TABLE "restrictions"
  ADD CONSTRAINT "restrictions_detour_id_fkey"
  FOREIGN KEY ("detour_id") REFERENCES "detours"("detour_id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX "restrictions_detour_id_idx" ON "restrictions" ("detour_id");
